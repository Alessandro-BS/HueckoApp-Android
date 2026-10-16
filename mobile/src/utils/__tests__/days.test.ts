import type { TimeBlock } from '@hueckoapp/shared';

import {
  blocksForDay,
  dayShort,
  formatDateLabel,
  formatDateTime,
  isoDayOf,
  laterPunctualBlocks,
  toDateKey,
  weekDates,
} from '../days';

const TUESDAY = new Date(2026, 8, 29, 10, 0); // martes 29 de septiembre de 2026

const b = (over: Partial<TimeBlock>): TimeBlock => ({
  id: 'x', userId: 'u', label: 'x', type: 'CLASE', startTime: '08:00', endTime: '09:00',
  isRecurring: true, dayOfWeek: 1, date: null, ...over,
});

describe('fechas de la semana', () => {
  it('isoDayOf: lunes = 1 … domingo = 7', () => {
    expect(isoDayOf(new Date(2026, 8, 28))).toBe(1);
    expect(isoDayOf(TUESDAY)).toBe(2);
    expect(isoDayOf(new Date(2026, 9, 4))).toBe(7);
  });

  it('toDateKey usa la fecha local', () => {
    expect(toDateKey(new Date(2026, 0, 5, 23, 30))).toBe('2026-01-05');
  });

  it('weekDates: de lunes a domingo, también cruzando de año', () => {
    const week = ['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04'];
    expect(weekDates(TUESDAY)).toEqual(week);
    expect(weekDates(new Date(2026, 9, 4))).toEqual(week);
    expect(weekDates(new Date(2026, 11, 31))).toEqual([
      '2026-12-28', '2026-12-29', '2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02', '2027-01-03',
    ]);
  });

  it('formatDateLabel y dayShort', () => {
    expect(formatDateLabel('2026-10-02')).toBe('Vie 2 oct');
    expect(dayShort(3)).toBe('Mié');
  });
});

describe('blocksForDay', () => {
  it('junta los recurrentes del día y los puntuales de esta semana, ordenados por hora', () => {
    const blocks = [
      b({ id: 'r10', dayOfWeek: 1, startTime: '10:00' }),
      b({ id: 'r08', dayOfWeek: 1, startTime: '08:00' }),
      b({ id: 'p09', isRecurring: false, type: 'PUNTUAL', dayOfWeek: null, date: '2026-09-28', startTime: '09:00' }),
      b({ id: 'pOtraSemana', isRecurring: false, type: 'PUNTUAL', dayOfWeek: null, date: '2026-10-05', startTime: '07:00' }),
      b({ id: 'rMartes', dayOfWeek: 2 }),
    ];
    expect(blocksForDay(blocks, 1, TUESDAY).map((x) => x.id)).toEqual(['r08', 'p09', 'r10']);
  });
});

describe('laterPunctualBlocks', () => {
  it('solo puntuales posteriores al domingo de esta semana, por fecha y luego por hora', () => {
    const p = (id: string, date: string, startTime = '08:00') =>
      b({ id, isRecurring: false, type: 'PUNTUAL', dayOfWeek: null, date, startTime });
    const blocks = [
      p('tarde', '2026-10-12', '15:00'),
      p('domingo', '2026-10-04'),
      p('temprano', '2026-10-12', '09:00'),
      p('lunes', '2026-10-05'),
      p('pasado', '2026-09-20'),
      b({ id: 'recurrente' }),
    ];
    expect(laterPunctualBlocks(blocks, TUESDAY).map((x) => x.id)).toEqual(['lunes', 'temprano', 'tarde']);
  });
});

it('formatDateTime: «Vie 2 oct, 20:05» en hora local', () => {
  expect(formatDateTime(new Date(2026, 9, 2, 20, 5))).toBe('Vie 2 oct, 20:05');
});
