import type { Group, MatchWindow } from '@hueckoapp/shared';

import { groupWeekWindows, parseWeek } from '../availability/group-availability';
import { addDays, APP_TIME_ZONE, instant, isoDay, today } from '../common/zone';
import { bestWindows } from '../proposals/rules';
import type { timeBlocksRepository } from '../schedule/time-blocks.repository';
import { TIME_REGEX } from '../schedule/time-blocks.schemas';

type TimeBlocksRepository = ReturnType<typeof timeBlocksRepository>;

const DAY_NAMES = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'] as const;
const MONTH_NAMES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
] as const;

export const MAX_AI_WINDOWS = 30;
/** Opciones que elige la IA para un borrador: la principal y hasta 2 alternativas. */
export const MAX_DRAFT_WINDOWS = 3;
/** Mínimo de franjas de una propuesta: si la IA da menos, el servidor completa. */
export const MIN_DRAFT_WINDOWS = 2;
/**
 * Margen mínimo entre ahora y el inicio de una opción del borrador: al menos 1 h de votación y el cierre 1 h antes
 * de que empiece (draftDeadline). Con menos, la votación cerraría después del inicio.
 */
export const MIN_DRAFT_LEAD_MS = 2 * 60 * 60 * 1000;

const DAY_SHORT = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'] as const;
const MONTH_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'] as const;

/** «Jue 20 nov» de una fecha «YYYY-MM-DD»: el día de la semana sale de la fecha, no de la zona del servidor. */
export const dateLabel = (date: string) => `${DAY_SHORT[isoDay(date) - 1]} ${Number(date.slice(8, 10))} ${MONTH_SHORT[Number(date.slice(5, 7)) - 1]}`;

/** «Jue 20 nov 16:00–18:00»: cómo ve la IA una franja con fecha. */
export const windowLabel = (w: { date: string; startTime: string; endTime: string }) => `${dateLabel(w.date)} ${w.startTime}–${w.endTime}`;

/**
 * Los huecos que se le pasan a la IA: los de la semana pedida o, sin `week`, los de esta semana y la siguiente.
 * groupWeekWindows ya descarta los que empezaron; el resultado se limita a MAX_AI_WINDOWS para el prompt.
 */
export async function candidateWindows(group: Group, blocks: TimeBlocksRepository, week: string | undefined, now: Date): Promise<MatchWindow[]> {
  const current = parseWeek(undefined, now);
  const weeks = week ? [parseWeek(week, now)] : [current, addDays(current, 7)];
  const windows: MatchWindow[] = [];
  for (const w of weeks) windows.push(...(await groupWeekWindows(group, blocks, w, now)));
  return windows.slice(0, MAX_AI_WINDOWS);
}

/**
 * Lista numerada desde 1 para el prompt: la IA responde con el número (windowIndex), nunca con horas (D5).
 * Cada franja lleva su fecha («Jue 20 nov 16:00–18:00»).
 */
export function numberedWindows(windows: readonly MatchWindow[]): string {
  if (windows.length === 0) return '(el grupo no tiene huecos en común en estas fechas)';
  return windows
    .map(
      (w, i) =>
        `${i + 1}. ${windowLabel(w)} · ${w.availabilityPercentage} % del grupo libre ` +
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

// Una propuesta no admite franjas que se solapan el mismo día (las repetidas también lo hacen).
const overlaps = (a: MatchWindow, b: MatchWindow) => a.date === b.date && a.startTime < b.endTime && b.startTime < a.endTime;

/**
 * Las opciones de franja de un borrador (de 2 a 5): las que eligió la IA, cada una validada y recortada, sin repetidas
 * ni solapadas (como máximo MAX_DRAFT_WINDOWS). Las que empiezan en menos de 2 h se descartan: la votación no podría cerrar antes
 * de su inicio. Si quedan menos de 2, se completa con las mejores franjas (bestWindows) de los candidatos que no se solapen
 * con las elegidas. Con menos de 2 en total devuelve las que haya: la ruta responde 409 NO_COMMON_WINDOWS.
 */
export function draftWindows(windows: readonly MatchWindow[], choices: readonly WindowChoice[], now: Date): MatchWindow[] {
  const result: MatchWindow[] = [];
  const minStart = now.getTime() + MIN_DRAFT_LEAD_MS;
  const startsInTime = (w: MatchWindow) => instant(w.date, w.startTime).getTime() >= minStart;
  for (const choice of choices) {
    const w = narrowWindow(pickWindow(windows, choice.windowIndex), choice.startTime, choice.endTime);
    if (!w || !startsInTime(w) || result.some((r) => overlaps(r, w))) continue;
    result.push(w);
    if (result.length === MAX_DRAFT_WINDOWS) break;
  }
  if (result.length < MIN_DRAFT_WINDOWS) {
    const rest = windows.filter((w) => startsInTime(w) && !result.some((r) => overlaps(r, w)));
    result.push(...bestWindows(rest, MIN_DRAFT_WINDOWS - result.length));
  }
  return result;
}

/** La opción que empieza antes (la votación debe cerrar antes de ella); null sin opciones. */
export function earliestWindow(windows: readonly MatchWindow[]): MatchWindow | null {
  let best: MatchWindow | null = null;
  let bestAt = Infinity;
  for (const w of windows) {
    const at = instant(w.date, w.startTime).getTime();
    if (at < bestAt) [best, bestAt] = [w, at];
  }
  return best;
}

/** «martes 29 de septiembre de 2026, 10:00» en la hora de Lima, sea cual sea la zona o el idioma del servidor. */
export function todayLabel(now: Date): string {
  const date = today(now);
  const time = new Intl.DateTimeFormat('en-GB', { timeZone: APP_TIME_ZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(now);
  return `${DAY_NAMES[isoDay(date) - 1]} ${Number(date.slice(8, 10))} de ${MONTH_NAMES[Number(date.slice(5, 7)) - 1]} de ${date.slice(0, 4)}, ${time}`;
}
