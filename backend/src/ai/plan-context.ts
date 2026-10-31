import type { Group, MatchWindow } from '@hueckoapp/shared';

import { groupWindows } from '../availability/group-availability';
import type { timeBlocksRepository } from '../schedule/time-blocks.repository';
import { nextOccurrence } from '../proposals/rules';
import { TIME_REGEX } from '../schedule/time-blocks.schemas';

type TimeBlocksRepository = ReturnType<typeof timeBlocksRepository>;

const DAY_NAMES = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'] as const;
const MONTH_NAMES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
] as const;
const pad = (n: number) => String(n).padStart(2, '0');

export const MAX_AI_WINDOWS = 30;
/** Opciones de franja de un borrador: la principal y hasta 2 alternativas. */
export const MAX_DRAFT_WINDOWS = 3;
/**
 * Margen mínimo entre ahora y el inicio de una opción del borrador: al menos 1 h de votación y el cierre 1 h antes
 * de que empiece (draftDeadline). Con menos, la votación cerraría después del inicio.
 */
export const MIN_DRAFT_LEAD_MS = 2 * 60 * 60 * 1000;

/** Día ISO (1 = lunes … 7 = domingo) de una fecha en hora local. */
const isoDayOf = (date: Date) => ((date.getDay() + 6) % 7) + 1;
const hhmm = (hours: number, minutes = 0) => `${pad(hours)}:${pad(minutes)}`;

/** Huecos en común reales del grupo (los mismos que GET /groups/:id/availability), limitados para el prompt. */
export async function commonWindows(group: Group, blocks: TimeBlocksRepository): Promise<MatchWindow[]> {
  return (await groupWindows(group, blocks)).slice(0, MAX_AI_WINDOWS);
}

/**
 * Los huecos tal como los ve el borrador. Las franjas son de una semana tipo y se agendan en su próxima ocurrencia
 * (nextOccurrence), así que el hueco de hoy se parte en dos:
 * - lo que aún sirve hoy: desde ahora + 2 h, redondeado a la hora en punto (da tiempo a votar y cerrar antes);
 * - lo que empieza antes de la hora actual: ya pasó hoy, así que es el mismo día de la semana que viene (va al final).
 * Lo que queda entre las dos no se ofrece: hoy no da tiempo a votarlo y no hay forma de agendarlo la semana que viene.
 */
export function draftCandidates(windows: readonly MatchWindow[], now: Date): MatchWindow[] {
  const today = isoDayOf(now);
  const earliest = new Date(now.getTime() + MIN_DRAFT_LEAD_MS);
  const roundUp = earliest.getMinutes() + earliest.getSeconds() + earliest.getMilliseconds() > 0 ? 1 : 0;
  const earliestHour = earliest.getHours() + roundUp;
  // Si ahora + 2 h ya es otro día, hoy no queda nada.
  const todayFrom = isoDayOf(earliest) === today && earliestHour < 24 ? hhmm(earliestHour) : null;
  const passedUntil = hhmm(now.getHours());

  const thisWeek: MatchWindow[] = [];
  const nextWeek: MatchWindow[] = [];
  for (const w of windows) {
    if (w.dayOfWeek !== today) {
      thisWeek.push(w);
      continue;
    }
    // «HH:mm» con ceros a la izquierda: comparar el texto es comparar la hora.
    if (todayFrom && w.endTime > todayFrom) thisWeek.push({ ...w, startTime: w.startTime > todayFrom ? w.startTime : todayFrom });
    if (w.startTime < passedUntil) nextWeek.push({ ...w, endTime: w.endTime < passedUntil ? w.endTime : passedUntil });
  }
  return [...thisWeek, ...nextWeek];
}

/**
 * Lista numerada desde 1 para el prompt: la IA responde con el número (windowIndex), nunca con horas (D5).
 * Con `now`, los huecos del día de hoy dicen si son de hoy o de la próxima semana (ver draftCandidates).
 */
export function numberedWindows(windows: readonly MatchWindow[], now?: Date): string {
  if (windows.length === 0) return '(el grupo no tiene huecos en común esta semana)';
  const nowTime = now ? hhmm(now.getHours(), now.getMinutes()) : null;
  const when = (w: MatchWindow) => {
    if (!now || !nowTime || w.dayOfWeek !== isoDayOf(now)) return '';
    return w.startTime > nowTime ? ' (hoy)' : ' (la próxima semana)';
  };
  return windows
    .map(
      (w, i) =>
        `${i + 1}. ${DAY_NAMES[w.dayOfWeek - 1]}${when(w)} ${w.startTime}-${w.endTime} · ${w.availabilityPercentage} % del grupo libre ` +
        `(${w.freeMembers} ${w.freeMembers === 1 ? 'persona' : 'personas'})`,
    )
    .join('\n');
}

/** La franja elegida por la IA solo vale si su número está en la lista; si no, ninguna. */
export function pickWindow(windows: readonly MatchWindow[], index: number | null): MatchWindow | null {
  if (index === null || !Number.isInteger(index) || index < 1 || index > windows.length) return null;
  return windows[index - 1];
}

/**
 * Recorta la franja elegida a las horas que propone la IA (p. ej. «2 horas el viernes en la tarde» → 16:00-18:00).
 * Solo si son HH:mm, el fin va después del inicio y las dos caen dentro de la franja: así el recorte nunca incluye
 * una hora en la que alguien está ocupado. Si no, la franja completa. Conserva el % y las personas libres de la franja
 * (el peor caso de todo el tramo: dentro del recorte nunca hay menos gente libre).
 */
export function narrowWindow(window: MatchWindow | null, startTime: string | null, endTime: string | null): MatchWindow | null {
  if (!window || !startTime || !endTime || !TIME_REGEX.test(startTime) || !TIME_REGEX.test(endTime)) return window;
  // «HH:mm» con ceros a la izquierda: comparar el texto es comparar la hora.
  if (startTime >= endTime || startTime < window.startTime || endTime > window.endTime) return window;
  return { ...window, startTime, endTime };
}

type WindowChoice = { windowIndex: number | null; startTime: string | null; endTime: string | null };

/**
 * Las opciones de franja de un borrador: cada una validada y recortada, sin repetidas, como máximo 3. Las que empiezan
 * en menos de 2 h se descartan: la votación no podría cerrar antes de su inicio.
 */
export function draftWindows(windows: readonly MatchWindow[], choices: readonly WindowChoice[], now: Date): MatchWindow[] {
  const result: MatchWindow[] = [];
  const minStart = now.getTime() + MIN_DRAFT_LEAD_MS;
  for (const choice of choices) {
    const w = narrowWindow(pickWindow(windows, choice.windowIndex), choice.startTime, choice.endTime);
    if (!w || nextOccurrence(w.dayOfWeek, w.startTime, now).getTime() < minStart) continue;
    if (result.some((r) => r.dayOfWeek === w.dayOfWeek && r.startTime === w.startTime && r.endTime === w.endTime)) continue;
    result.push(w);
    if (result.length === MAX_DRAFT_WINDOWS) break;
  }
  return result;
}

/** La opción cuyo próximo inicio llega antes (la votación debe cerrar antes de ella); null sin opciones. */
export function earliestWindow(windows: readonly MatchWindow[], now: Date): MatchWindow | null {
  let best: MatchWindow | null = null;
  let bestAt = Infinity;
  for (const w of windows) {
    const at = nextOccurrence(w.dayOfWeek, w.startTime, now).getTime();
    if (at < bestAt) [best, bestAt] = [w, at];
  }
  return best;
}

/** «martes 29 de septiembre de 2026, 10:00» en la hora del servidor (sin Intl: igual en cualquier sistema). */
export const todayLabel = (now: Date) =>
  `${DAY_NAMES[(now.getDay() + 6) % 7]} ${now.getDate()} de ${MONTH_NAMES[now.getMonth()]} de ${now.getFullYear()}, ` +
  `${pad(now.getHours())}:${pad(now.getMinutes())}`;
