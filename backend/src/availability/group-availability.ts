import type { Group, MatchWindow, TimeBlock, TimeWindowInput } from '@hueckoapp/shared';

import type { timeBlocksRepository } from '../schedule/time-blocks.repository';
import { endHour, startHour, weeklyWindows, type MatcherGroup } from './matcher';

// Reglas añadidas sobre el matcher de Kotlin (domain spec G13 y B14), documentadas en docs/api.md:
// - solo cuentan los bloques recurrentes: la vista es semanal y un puntual tiene fecha, no día fijo;
// - un bloque LIBRE no ocupa: marca tiempo libre.
const busyBlocks = (blocks: readonly TimeBlock[]) => blocks.filter((b) => b.isRecurring && b.type !== 'LIBRE');

export function groupAvailability(group: MatcherGroup, blocks: readonly TimeBlock[]): MatchWindow[] {
  return weeklyWindows(group, busyBlocks(blocks));
}

/**
 * G2: % de disponibilidad de una franja cualquiera (p. ej. añadida a mano a una propuesta).
 * Recorre cada hora que toca la franja con el mismo redondeo que el matcher (inicio truncado, fin hacia arriba)
 * y devuelve el PEOR %. No aplica el umbral del grupo ni el rango 08–20.
 */
export function windowAvailability(group: MatcherGroup, blocks: readonly TimeBlock[], window: TimeWindowInput): number {
  const size = group.memberIds.length;
  if (size === 0) return 0;
  const members = new Set(group.memberIds);
  const relevant = busyBlocks(blocks).filter((b) => members.has(b.userId) && b.dayOfWeek === window.dayOfWeek);
  let worst = 100;
  for (let hour = startHour(window.startTime); hour < endHour(window.endTime); hour++) {
    const busy = new Set(relevant.filter((b) => hour >= startHour(b.startTime) && hour < endHour(b.endTime)).map((b) => b.userId));
    worst = Math.min(worst, Math.round(((size - busy.size) * 100) / size));
  }
  return worst;
}

/** Huecos en común de un grupo (lo que devuelve GET /groups/:id/availability), leyendo los bloques de sus miembros. */
export function groupWindows(group: Group, blocks: ReturnType<typeof timeBlocksRepository>): MatchWindow[] {
  const memberIds = group.members.map((m) => m.id);
  return groupAvailability({ memberIds, availabilityThreshold: group.availabilityThreshold }, blocks.listRecurringByUsers(memberIds));
}
