import type { TimeBlock } from '@hueckoapp/shared';

export const DAY_SHORT = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'] as const;
export const DAY_LONG = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'] as const;
const MONTH_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'] as const;
export const WEEK_DAYS = [1, 2, 3, 4, 5, 6, 7] as const;

export const dayShort = (iso: number) => DAY_SHORT[iso - 1];
export const dayLong = (iso: number) => DAY_LONG[iso - 1];

/** Día ISO de una fecha local: 1 = lunes … 7 = domingo (getDay() da 0 = domingo). */
export const isoDayOf = (date: Date) => ((date.getDay() + 6) % 7) + 1;

const pad2 = (n: number) => String(n).padStart(2, '0');

/** "YYYY-MM-DD" en hora local (no UTC: a las 23:00 en Lima sigue siendo hoy). */
export const toDateKey = (date: Date) => `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;

/** Medianoche local de "YYYY-MM-DD". */
export const parseDateKey = (key: string) => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
};

const addDays = (date: Date, days: number) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);

/** Las 7 fechas (lunes a domingo) de la semana que contiene `today`. */
export const weekDates = (today: Date) => WEEK_DAYS.map((iso) => toDateKey(addDays(today, iso - isoDayOf(today))));

/** `count` fechas seguidas empezando hoy (para elegir el día de un bloque puntual). */
export const upcomingDates = (today: Date, count: number) =>
  Array.from({ length: count }, (_, i) => toDateKey(addDays(today, i)));

/** "Vie 2 oct" */
export const formatDateLabel = (key: string) => {
  const date = parseDateKey(key);
  return `${dayShort(isoDayOf(date))} ${date.getDate()} ${MONTH_SHORT[date.getMonth()]}`;
};

/** "Lun 12/10" (día/mes) */
export const formatShortDate = (key: string) => {
  const date = parseDateKey(key);
  return `${dayShort(isoDayOf(date))} ${date.getDate()}/${pad2(date.getMonth() + 1)}`;
};

const byStartTime = (a: TimeBlock, b: TimeBlock) => (a.startTime < b.startTime ? -1 : a.startTime > b.startTime ? 1 : 0);

/**
 * Bloques del día `iso` en la semana actual: los recurrentes de ese día y los puntuales cuya
 * fecha cae en ese día de esta semana (arregla UI spec §6 quirk 10). Ordenados por hora.
 */
export function blocksForDay(blocks: readonly TimeBlock[], iso: number, today: Date): TimeBlock[] {
  const date = weekDates(today)[iso - 1];
  return blocks.filter((b) => (b.isRecurring ? b.dayOfWeek === iso : b.date === date)).sort(byStartTime);
}

/** Puntuales con fecha posterior al domingo de esta semana (no caben en el selector de días), por fecha y hora. */
export function laterPunctualBlocks(blocks: readonly TimeBlock[], today: Date): TimeBlock[] {
  const sunday = weekDates(today)[6];
  return blocks
    .filter((b) => !b.isRecurring && b.date !== null && b.date > sunday)
    .sort((a, b) => (a.date! < b.date! ? -1 : a.date! > b.date! ? 1 : byStartTime(a, b)));
}

/** «Vie 2 oct, 20:00» en hora local (plazos de votación). */
export const formatDateTime = (date: Date) =>
  `${formatDateLabel(toDateKey(date))}, ${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
