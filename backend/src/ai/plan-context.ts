import type { Group, MatchWindow } from '@hueckoapp/shared';

import { groupWindows } from '../availability/group-availability';
import type { timeBlocksRepository } from '../schedule/time-blocks.repository';

type TimeBlocksRepository = ReturnType<typeof timeBlocksRepository>;

const DAY_NAMES = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'] as const;
const MONTH_NAMES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
] as const;
const pad = (n: number) => String(n).padStart(2, '0');

export const MAX_AI_WINDOWS = 30;

/** Huecos en común reales del grupo (los mismos que GET /groups/:id/availability), limitados para el prompt. */
export function commonWindows(group: Group, blocks: TimeBlocksRepository): MatchWindow[] {
  return groupWindows(group, blocks).slice(0, MAX_AI_WINDOWS);
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

/** «martes 29 de septiembre de 2026, 10:00» en la hora del servidor (sin Intl: igual en cualquier sistema). */
export const todayLabel = (now: Date) =>
  `${DAY_NAMES[(now.getDay() + 6) % 7]} ${now.getDate()} de ${MONTH_NAMES[now.getMonth()]} de ${now.getFullYear()}, ` +
  `${pad(now.getHours())}:${pad(now.getMinutes())}`;
