import type { TimeBlock, TimeBlockInput } from '@hueckoapp/shared';

import { isoDay } from '../common/zone';

type Slot = Pick<TimeBlockInput, 'startTime' | 'endTime' | 'isRecurring' | 'dayOfWeek' | 'date'>;

const DAY_NAMES = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];

/** Las horas se cruzan de forma estricta: 08–10 y 10–12 no se solapan. */
export const timesCross = (a: Slot, b: Slot): boolean => a.startTime < b.endTime && b.startTime < a.endTime;

// Día de la semana (1–7) en que cae el bloque, si es recurrente o puntual con fecha.
const weekday = (slot: Slot): number | null => (slot.isRecurring ? slot.dayOfWeek : slot.date ? isoDay(slot.date) : null);

/** Mismo rato: recurrentes del mismo día; puntuales de la misma fecha; puntual cuya fecha (isoDay) es el día del recurrente. */
export function blocksOverlap(a: Slot, b: Slot): boolean {
  if (!timesCross(a, b)) return false;
  if (!a.isRecurring && !b.isRecurring) return a.date === b.date;
  const dayA = weekday(a);
  return dayA != null && dayA === weekday(b);
}

/** El primer bloque de `existing` que choca con `candidate`, sin contar el que tiene `ignoreId`. */
export function firstOverlap(candidate: Slot, existing: readonly TimeBlock[], ignoreId?: string): TimeBlock | undefined {
  return existing.find((block) => block.id !== ignoreId && blocksOverlap(candidate, block));
}

const formatDate = (date: string) => `${date.slice(8, 10)}/${date.slice(5, 7)}/${date.slice(0, 4)}`;

/** «Se solapa con «Cálculo II» (lunes 08:00–11:00).» / «… (16/11/2026 09:00–10:00).» */
export function overlapMessage(block: Pick<TimeBlock, 'label'> & Slot): string {
  const when = block.isRecurring ? DAY_NAMES[(block.dayOfWeek ?? 1) - 1] : formatDate(block.date ?? '');
  return `Se solapa con «${block.label}» (${when} ${block.startTime}–${block.endTime}).`;
}
