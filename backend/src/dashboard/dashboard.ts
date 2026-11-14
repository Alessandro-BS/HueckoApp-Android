import type {
  Attendee,
  AttendeeStatus,
  Dashboard,
  DashboardGroup,
  ExpressAlert,
  GroupMember,
  GroupSummary,
  Incidence,
  IncidenceType,
  Proposal,
  ProposalWithGroup,
} from '@hueckoapp/shared';

// Fórmulas de DashboardViewModel.kt (domain spec §2.2), calculadas en el servidor (G7). Funciones puras.

/** «Horas coincidentes» usa este umbral fijo (HIGH_MATCH_THRESHOLD en Kotlin), no el del grupo. */
export const HIGH_MATCH_THRESHOLD = 80;

const wholeHour = (time: string) => Number(time.slice(0, 2));

/**
 * Σ de horas enteras (se truncan los minutos) de las franjas con ≥ 80 % de las propuestas no canceladas, sin deduplicar.
 * Desvío deliberado de Kotlin (que contaba también las canceladas): un plan cancelado ya no ofrece horas.
 */
export function matchingHours(proposals: readonly Proposal[]): number {
  return proposals
    .filter((p) => p.state !== 'CANCELADO')
    .flatMap((p) => p.windows)
    .filter((w) => w.availabilityPercentage >= HIGH_MATCH_THRESHOLD)
    .reduce((sum, w) => sum + Math.max(0, wholeHour(w.endTime) - wholeHour(w.startTime)), 0);
}

const STATUS_BY_TYPE: Record<IncidenceType, AttendeeStatus> = { TARDANZA: 'RETRASADO', FALTA: 'NO_ASISTE', IMPREVISTO: 'NO_ASISTE' };

/** Un asistente por miembro; su estado sale de su primera incidencia sin resolver. */
export function attendeesOf(members: readonly GroupMember[], incidences: readonly Incidence[]): Attendee[] {
  return members.map((m) => {
    const open = incidences.find((i) => !i.resolved && i.user.id === m.id);
    return {
      user: { id: m.id, name: m.name, email: m.email },
      isEssential: m.isEssential,
      status: open ? STATUS_BY_TYPE[open.type] : 'PUNTUAL',
      delayMinutes: open?.delayMinutes ?? null,
    };
  });
}

const isFuture = (iso: string, now: Date) => new Date(iso).getTime() > now.getTime();

/** C11: planes confirmados cuyo scheduledAt aún no llegó, del más próximo al más lejano. */
export function upcomingPlans<P extends Proposal>(proposals: readonly P[], now: Date): P[] {
  return proposals
    .filter((p) => p.state === 'CONFIRMADO' && p.scheduledAt !== null && isFuture(p.scheduledAt, now))
    .sort((a, b) => a.scheduledAt!.localeCompare(b.scheduledAt!));
}

/**
 * Resumen por grupo (D6): la franja elegida (o la primera) de su propuesta MÁS RECIENTE que no esté cancelada y tenga
 * franjas. «Más reciente» = mayor createdAt y, a igual createdAt, la insertada después: el orden de GET /groups/:id/proposals.
 * `proposals` llega de listForUser, de la más antigua a la más reciente (created_at, seq): basta buscar desde el final.
 */
export function groupSummaries(groups: readonly GroupSummary[], proposals: readonly ProposalWithGroup[]): DashboardGroup[] {
  return groups.map((g) => {
    const p = proposals.findLast((x) => x.groupId === g.id && x.state !== 'CANCELADO' && x.windows.length > 0);
    const w = p ? (p.windows.find((x) => x.id === p.chosenWindowId) ?? p.windows[0]) : undefined;
    return {
      id: g.id,
      name: g.name,
      memberCount: g.memberCount,
      nextWindow: w ? { date: w.date, dayOfWeek: w.dayOfWeek, startTime: w.startTime, endTime: w.endTime, availabilityPercentage: w.availabilityPercentage } : null,
    };
  });
}

/**
 * G5: por prioridad: el primer plan que aún no ocurrió con votación exprés ABIERTA (`VOTACION`, con el motivo de quien
 * reportó y cuándo vence), si no el primero EN_RECOORDINACION (`RECOORDINACION`: tras una votación que reagendó el plan
 * sus incidencias ya están resueltas, así que quién y por qué salen de la votación), si no el primero que aún no ocurrió
 * CONFIRMADO con incidencias sin resolver (`AVISO`). Sin votación se muestra la incidencia ALTA sin resolver o, si no,
 * la más antigua. EN_RECOORDINACION siempre está vigente aunque su fecha vieja ya pasara (la regla anterior la
 * conservaba): hasta que quien gestiona lo replantee, el plan sigue atascado y hay que avisarlo.
 */
export function expressAlertFor(proposals: readonly ProposalWithGroup[], now: Date): ExpressAlert | null {
  const upcoming = proposals.filter((p) => p.scheduledAt === null || isFuture(p.scheduledAt, now));
  const pendingOf = (p: ProposalWithGroup) => p.incidences.filter((i) => !i.resolved);
  const shownIncidence = (p: ProposalWithGroup) => {
    const pending = pendingOf(p);
    return pending.find((i) => i.criticality === 'ALTA') ?? pending[0];
  };
  // canVote solo en VOTACION (el de la votación abierta para quien pregunta): la app ofrece «Votar» o «Ver votación».
  const alert = (p: ProposalWithGroup, kind: ExpressAlert['kind'], who: string, reason: string, expiresAt: string | null): ExpressAlert => ({
    proposalId: p.id, planTitle: p.title, groupName: p.groupName, who, reason, kind, canResolve: p.canManage,
    canVote: kind === 'VOTACION' && p.expressVote?.canVote === true, createdBy: p.createdBy, expiresAt,
  });

  const voting = upcoming.find((p) => p.state === 'CONFIRMADO' && p.expressVote?.status === 'ABIERTA');
  if (voting?.expressVote) {
    const v = voting.expressVote;
    return alert(voting, 'VOTACION', v.reportedBy.name, v.reason, v.expiresAt);
  }

  for (const p of proposals.filter((x) => x.state === 'EN_RECOORDINACION')) {
    const shown = shownIncidence(p);
    if (p.expressVote) return alert(p, 'RECOORDINACION', p.expressVote.reportedBy.name, p.expressVote.reason, null);
    if (shown) return alert(p, 'RECOORDINACION', shown.user.name, shown.reason, null);
  }

  const warned = upcoming.find((p) => p.state === 'CONFIRMADO' && pendingOf(p).length > 0);
  const shown = warned && shownIncidence(warned);
  return warned && shown ? alert(warned, 'AVISO', shown.user.name, shown.reason, null) : null;
}

export function buildDashboard(input: {
  now: Date;
  groups: GroupSummary[];
  proposals: ProposalWithGroup[];
  totalBlocks: number;
  membersOf: (groupId: string) => GroupMember[];
}): Dashboard {
  const { now, groups, proposals } = input;
  const open = proposals.filter((p) => p.state === 'PROPUESTO');
  const next = upcomingPlans(proposals, now)[0];
  return {
    metrics: { activeGroups: groups.length, openVotes: open.length, matchingHours: matchingHours(proposals), totalBlocks: input.totalBlocks },
    nextPlan: next ? { ...next, attendees: attendeesOf(input.membersOf(next.groupId), next.incidences) } : null,
    groups: groupSummaries(groups, proposals),
    pendingVotes: [...open].sort((a, b) => a.votingDeadline.localeCompare(b.votingDeadline)),
    expressAlert: expressAlertFor(proposals, now),
  };
}
