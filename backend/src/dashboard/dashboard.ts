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
 * `proposals` llega de listForUser, de la más antigua a la más reciente (created_at, rowid): basta buscar desde el final.
 */
export function groupSummaries(groups: readonly GroupSummary[], proposals: readonly ProposalWithGroup[]): DashboardGroup[] {
  return groups.map((g) => {
    const p = proposals.findLast((x) => x.groupId === g.id && x.state !== 'CANCELADO' && x.windows.length > 0);
    const w = p ? (p.windows.find((x) => x.id === p.chosenWindowId) ?? p.windows[0]) : undefined;
    return {
      id: g.id,
      name: g.name,
      memberCount: g.memberCount,
      nextWindow: w ? { dayOfWeek: w.dayOfWeek, startTime: w.startTime, endTime: w.endTime, availabilityPercentage: w.availabilityPercentage } : null,
    };
  });
}

/**
 * G5: de los planes que aún no ocurrieron, el primero EN_RECOORDINACION («Votación exprés») o, si no hay,
 * el primero CONFIRMADO con incidencias sin resolver (aviso). Se muestra su incidencia ALTA o, si no, la más antigua.
 */
export function expressAlertFor(proposals: readonly ProposalWithGroup[], now: Date): ExpressAlert | null {
  const candidates = proposals.filter(
    (p) =>
      (p.state === 'EN_RECOORDINACION' || p.state === 'CONFIRMADO') &&
      (p.scheduledAt === null || isFuture(p.scheduledAt, now)) &&
      p.incidences.some((i) => !i.resolved),
  );
  const p = candidates.find((x) => x.state === 'EN_RECOORDINACION') ?? candidates[0];
  if (!p) return null;
  const pending = p.incidences.filter((i) => !i.resolved);
  const shown = pending.find((i) => i.criticality === 'ALTA') ?? pending[0];
  return {
    proposalId: p.id,
    planTitle: p.title,
    groupName: p.groupName,
    who: shown.user.name,
    reason: shown.reason,
    kind: p.state === 'EN_RECOORDINACION' ? 'RECOORDINACION' : 'AVISO',
    canResolve: p.canManage,
    createdBy: p.createdBy,
  };
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
