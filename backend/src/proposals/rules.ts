import type { Criticality, IncidenceType, MatchWindow, Proposal, TimeWindow } from '@hueckoapp/shared';

// Reglas puras de las propuestas (domain spec §5). Sin base de datos: se prueban aparte.

/** Día ISO (1 = lunes … 7 = domingo) de una fecha en hora local. */
const isoDayOf = (date: Date) => ((date.getDay() + 6) % 7) + 1;

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * C11: la próxima vez (estrictamente posterior a `from`) que ocurre `dayOfWeek` a las `startTime`, en hora local
 * del servidor. Si hoy es ese día y la hora aún no llegó, es hoy; si ya pasó, la semana siguiente.
 */
export function nextOccurrence(dayOfWeek: number, startTime: string, from: Date): Date {
  const [hours, minutes] = startTime.split(':').map(Number);
  for (let offset = 0; offset <= 7; offset++) {
    const candidate = new Date(from.getFullYear(), from.getMonth(), from.getDate() + offset, hours, minutes);
    if (isoDayOf(candidate) === dayOfWeek && candidate.getTime() > from.getTime()) return candidate;
  }
  throw new Error(`Día de la semana inválido: ${dayOfWeek}`);
}

/**
 * C11: lo que se guarda al confirmar. `scheduledAt` es el instante (ISO, UTC) y `scheduledDate` la fecha
 * «YYYY-MM-DD» en la zona horaria del servidor, para que la app la muestre sin depender de la del teléfono.
 */
export function scheduleFor(dayOfWeek: number, startTime: string, from: Date): { scheduledAt: string; scheduledDate: string } {
  const next = nextOccurrence(dayOfWeek, startTime, from);
  return {
    scheduledAt: next.toISOString(),
    scheduledDate: `${next.getFullYear()}-${pad(next.getMonth() + 1)}-${pad(next.getDate())}`,
  };
}

/**
 * C2: «gana la más votada». Empates: mayor % de disponibilidad, después el día y la hora más tempranos.
 * null si nadie votó.
 */
export function pickWinner(windows: readonly TimeWindow[]): TimeWindow | null {
  const voted = windows.filter((w) => w.voteCount > 0);
  if (voted.length === 0) return null;
  return [...voted].sort(
    (a, b) =>
      b.voteCount - a.voteCount ||
      b.availabilityPercentage - a.availabilityPercentage ||
      a.dayOfWeek - b.dayOfWeek ||
      a.startTime.localeCompare(b.startTime),
  )[0];
}

const wholeHours = (w: MatchWindow) => Number(w.endTime.slice(0, 2)) - Number(w.startTime.slice(0, 2));

/** C5: «las 3 mejores franjas» = mayor %, después mayor duración, después día y hora más tempranos. */
export function bestWindows(windows: readonly MatchWindow[], count = 3): MatchWindow[] {
  return [...windows]
    .sort(
      (a, b) =>
        b.availabilityPercentage - a.availabilityPercentage ||
        wholeHours(b) - wholeHours(a) ||
        a.dayOfWeek - b.dayOfWeek ||
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
