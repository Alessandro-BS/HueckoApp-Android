import type { Group, MatchWindow, TimeBlock } from '@hueckoapp/shared';
import { z } from 'zod';

import { addDays, instant, isoDay, isRealDate, mondayOf, today, validWeeks } from '../common/zone';
import type { timeBlocksRepository } from '../schedule/time-blocks.repository';
import { endHour, startHour, weeklyWindows, windowsFor, type DayWindow, type MatcherGroup } from './matcher';

// Reglas añadidas sobre el matcher de Kotlin (domain spec G13 y B14), documentadas en docs/api.md:
// - un bloque LIBRE no ocupa: marca tiempo libre;
// - un puntual solo ocupa su fecha (weekAvailability / windowAvailability); groupAvailability, sin fecha, solo ve recurrentes.
const busyBlocks = (blocks: readonly TimeBlock[]) => blocks.filter((b) => b.isRecurring && b.type !== 'LIBRE');

// Bloques que ocupan una fecha concreta: los recurrentes de su día de la semana y los puntuales de esa fecha.
const busyOn = (blocks: readonly TimeBlock[], date: string): TimeBlock[] =>
  blocks.filter((b) => b.type !== 'LIBRE' && (b.isRecurring ? b.dayOfWeek === isoDay(date) : b.date === date));

export function groupAvailability(group: MatcherGroup, blocks: readonly TimeBlock[]): DayWindow[] {
  return weeklyWindows(group, busyBlocks(blocks));
}

/**
 * G2: % de disponibilidad de una franja cualquiera (p. ej. añadida a mano a una propuesta), en una fecha concreta.
 * Recorre cada hora que toca la franja con el mismo redondeo que el matcher (inicio truncado, fin hacia arriba)
 * y devuelve el PEOR %. No aplica el umbral del grupo ni el rango 08–20.
 */
export function windowAvailability(
  group: MatcherGroup,
  blocks: readonly TimeBlock[],
  window: { date: string; startTime: string; endTime: string },
): number {
  const size = group.memberIds.length;
  if (size === 0) return 0;
  const members = new Set(group.memberIds);
  const relevant = busyOn(blocks, window.date).filter((b) => members.has(b.userId));
  let worst = 100;
  for (let hour = startHour(window.startTime); hour < endHour(window.endTime); hour++) {
    const busy = new Set(relevant.filter((b) => hour >= startHour(b.startTime) && hour < endHour(b.endTime)).map((b) => b.userId));
    worst = Math.min(worst, Math.round(((size - busy.size) * 100) / size));
  }
  return worst;
}

/**
 * Huecos en común de la semana que empieza el lunes `week`, día a día: recurrentes de ese día + puntuales de esa fecha.
 * Cada hueco lleva su `date`; se descartan enteros los que ya empezaron (sin recortar).
 */
export function weekAvailability(group: MatcherGroup, blocks: readonly TimeBlock[], week: string, now: Date): MatchWindow[] {
  return Array.from({ length: 7 }, (_, index) => addDays(week, index)).flatMap((date) => {
    const day = isoDay(date);
    const dayBlocks = busyOn(blocks, date).map((b) => ({ ...b, dayOfWeek: day }));
    return windowsFor(group, dayBlocks, day)
      .map((w) => ({ ...w, date }))
      .filter((w) => instant(date, w.startTime).getTime() > now.getTime());
  });
}

const WEEK_MESSAGE = 'Elige una semana entre esta y las próximas 3';

/** `?week=YYYY-MM-DD`: por defecto la semana actual; cualquier día se normaliza a su lunes; solo las 4 semanas válidas. */
export function parseWeek(value: unknown, now: Date): string {
  const schema = z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, WEEK_MESSAGE)
    .refine(isRealDate, WEEK_MESSAGE)
    .transform(mondayOf)
    .refine((monday) => validWeeks(now).includes(monday), WEEK_MESSAGE)
    .optional()
    .default(() => mondayOf(today(now)));
  return schema.parse(value);
}

/** Huecos en común de un grupo en la semana `week` (lo que devuelve GET /groups/:id/availability), con los horarios de sus miembros. */
export async function groupWeekWindows(
  group: Group,
  blocks: ReturnType<typeof timeBlocksRepository>,
  week: string,
  now: Date,
): Promise<MatchWindow[]> {
  const memberIds = group.members.map((m) => m.id);
  const list = await blocks.listForUsersInRange(memberIds, week, addDays(week, 6));
  return weekAvailability({ memberIds, availabilityThreshold: group.availabilityThreshold }, list, week, now);
}
