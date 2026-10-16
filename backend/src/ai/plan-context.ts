import type { Group, MatchWindow } from '@hueckoapp/shared';

import { groupWindows } from '../availability/group-availability';
import type { timeBlocksRepository } from '../schedule/time-blocks.repository';
import { TIME_REGEX } from '../schedule/time-blocks.schemas';

type TimeBlocksRepository = ReturnType<typeof timeBlocksRepository>;

const DAY_NAMES = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'] as const;
const MONTH_NAMES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
] as const;
const pad = (n: number) => String(n).padStart(2, '0');

export const MAX_AI_WINDOWS = 30;

/** Huecos en común reales del grupo (los mismos que GET /groups/:id/availability), limitados para el prompt. */
export async function commonWindows(group: Group, blocks: TimeBlocksRepository): Promise<MatchWindow[]> {
  return (await groupWindows(group, blocks)).slice(0, MAX_AI_WINDOWS);
}

/** Lista numerada desde 1 para el prompt: la IA responde con el número (windowIndex), nunca con horas (D5). */
export function numberedWindows(windows: readonly MatchWindow[]): string {
  if (windows.length === 0) return '(el grupo no tiene huecos en común esta semana)';
  return windows
    .map(
      (w, i) =>
        `${i + 1}. ${DAY_NAMES[w.dayOfWeek - 1]} ${w.startTime}-${w.endTime} · ${w.availabilityPercentage} % del grupo libre ` +
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

/** «martes 29 de septiembre de 2026, 10:00» en la hora del servidor (sin Intl: igual en cualquier sistema). */
export const todayLabel = (now: Date) =>
  `${DAY_NAMES[(now.getDay() + 6) % 7]} ${now.getDate()} de ${MONTH_NAMES[now.getMonth()]} de ${now.getFullYear()}, ` +
  `${pad(now.getHours())}:${pad(now.getMinutes())}`;
