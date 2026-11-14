import type { Criticality, IncidenceType, MatchWindow, Proposal, ProposalState, TimeWindow } from '@hueckoapp/shared';

import { instant } from '../common/zone';

// Reglas puras de las propuestas (domain spec §5). Sin base de datos: se prueban aparte.

/**
 * Lo que se guarda al confirmar la franja `date` a las `startTime`: `scheduledAt` es su instante (ISO, UTC) en
 * America/Lima y `scheduledDate` la misma fecha «YYYY-MM-DD», para que la app la muestre sin depender del teléfono.
 */
export function scheduleFor(date: string, startTime: string): { scheduledAt: string; scheduledDate: string } {
  return { scheduledAt: instant(date, startTime).toISOString(), scheduledDate: date };
}

/**
 * C2: «gana la más votada». Empates: mayor % de disponibilidad, después la fecha y la hora más tempranas.
 * null si nadie votó.
 */
export function pickWinner(windows: readonly TimeWindow[]): TimeWindow | null {
  const voted = windows.filter((w) => w.voteCount > 0);
  if (voted.length === 0) return null;
  return [...voted].sort(
    (a, b) =>
      b.voteCount - a.voteCount ||
      b.availabilityPercentage - a.availabilityPercentage ||
      a.date.localeCompare(b.date) ||
      a.startTime.localeCompare(b.startTime),
  )[0];
}

const wholeHours = (w: MatchWindow) => Number(w.endTime.slice(0, 2)) - Number(w.startTime.slice(0, 2));

/** C5: «las 3 mejores franjas» = mayor %, después mayor duración, después fecha y hora más tempranas. */
export function bestWindows<T extends MatchWindow>(windows: readonly T[], count = 3): T[] {
  return [...windows]
    .sort(
      (a, b) =>
        b.availabilityPercentage - a.availabilityPercentage ||
        wholeHours(b) - wholeHours(a) ||
        a.date.localeCompare(b.date) ||
        a.startTime.localeCompare(b.startTime),
    )
    .slice(0, count);
}

/** G6: la criticidad la decide el servidor. */
export function criticalityFor(type: IncidenceType, isEssential: boolean, delayMinutes: number | null): Criticality {
  if (type === 'FALTA') return isEssential ? 'ALTA' : 'MEDIA';
  if (type === 'IMPREVISTO') return 'MEDIA';
  return (delayMinutes ?? 0) >= 30 ? 'MEDIA' : 'BAJA';
}

/** C1: se vota solo con la propuesta en PROPUESTO y antes de su plazo. */
export const isVotingOpen = (p: Pick<Proposal, 'state' | 'votingDeadline'>, now: Date) =>
  p.state === 'PROPUESTO' && new Date(p.votingDeadline).getTime() > now.getTime();

// Cancelar vale desde cualquier estado salvo CANCELADO. La usan quien gestiona el plan y la moderación (D7).
export const canCancel = (state: ProposalState) => state !== 'CANCELADO';
