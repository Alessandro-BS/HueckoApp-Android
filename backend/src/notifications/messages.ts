import type { ExpressOption, NotificationData, NotificationKind } from '@hueckoapp/shared';

// Título, cuerpo y `data` de cada aviso (docs/api.md, «Notificaciones»). Funciones puras: quien encola lee el plan
// (audience.planInfo) y decide los destinatarios. El título es siempre el nombre del grupo.

/** Lo que los textos necesitan del plan, leído junto con su grupo. */
export type PlanInfo = {
  proposalId: string;
  groupId: string;
  groupName: string;
  title: string;
  scheduledAt: string | null;
  locationName: string | null;
};

export type NotificationMessage = { title: string; body: string; data: NotificationData };

// Fechas y horas en la zona del grupo (Lima), sin depender de la TZ del servidor.
const LIMA = 'America/Lima';
const whenFormat = new Intl.DateTimeFormat('es-PE', {
  timeZone: LIMA,
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});
const timeFormat = new Intl.DateTimeFormat('es-PE', { timeZone: LIMA, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

type Parts = Partial<Record<Intl.DateTimeFormatPartTypes, string>>;
const partsOf = (format: Intl.DateTimeFormat, iso: string): Parts =>
  Object.fromEntries(format.formatToParts(new Date(iso)).map((p) => [p.type, p.value]));

/** {cuándo}: «jueves 15 de octubre, 16:00». Se arma por partes: Intl pone una coma tras el día de la semana. */
export function whenText(iso: string): string {
  const p = partsOf(whenFormat, iso);
  return `${p.weekday!.toLocaleLowerCase('es')} ${p.day} de ${p.month!.toLocaleLowerCase('es')}, ${p.hour}:${p.minute}`;
}

/** {HH:mm} en Lima. */
export function timeText(iso: string): string {
  const p = partsOf(timeFormat, iso);
  return `${p.hour}:${p.minute}`;
}

function message(plan: PlanInfo, kind: NotificationKind, body: string): NotificationMessage {
  return {
    title: plan.groupName,
    body,
    data: { kind, proposalId: plan.proposalId, groupId: plan.groupId, screen: kind === 'NEW_PROPOSAL' ? 'VOTING' : 'PLAN' },
  };
}

// Un plan CONFIRMADO siempre tiene scheduled_at: sin él, el aviso no tendría sentido.
function scheduledAtOf(plan: PlanInfo): string {
  if (plan.scheduledAt === null) throw new Error(`El plan ${plan.proposalId} no tiene fecha para el aviso.`);
  return plan.scheduledAt;
}

export const newProposalMessage = (plan: PlanInfo, creatorName: string) =>
  message(plan, 'NEW_PROPOSAL', `${creatorName} propuso «${plan.title}». Vota tus franjas.`);

export const planConfirmedMessage = (plan: PlanInfo) =>
  message(plan, 'PLAN_CONFIRMED', `«${plan.title}» se confirmó para el ${whenText(scheduledAtOf(plan))}.`);

export const planCancelledMessage = (plan: PlanInfo, { noVotes }: { noVotes: boolean }) =>
  message(plan, 'PLAN_CANCELLED', noVotes ? `«${plan.title}» se canceló: nadie votó antes del plazo.` : `«${plan.title}» se canceló.`);

export const expressOpenedMessage = (plan: PlanInfo, reporterName: string, criticalReason: string) =>
  message(plan, 'EXPRESS_OPENED', `${reporterName} no podrá ir a «${plan.title}» (${criticalReason}). Vota qué hacer.`);

const DECIDED: Record<ExpressOption, string> = { MANTENER: 'mantener', REAGENDAR: 'reagendar', CANCELAR: 'cancelar' };

export const expressResultMessage = (plan: PlanInfo, result: ExpressOption, byDefault: boolean) =>
  message(
    plan,
    'EXPRESS_RESULT',
    byDefault ? `Sin quórum: «${plan.title}» se mantiene.` : `El grupo decidió ${DECIDED[result]} «${plan.title}».`,
  );

export const reminderMessage = (plan: PlanInfo) => {
  const at = timeText(scheduledAtOf(plan));
  return message(
    plan,
    'REMINDER',
    plan.locationName ? `«${plan.title}» empieza a las ${at} en ${plan.locationName}.` : `«${plan.title}» empieza a las ${at}.`,
  );
};
