import { describe, expect, it } from 'vitest';

import { addDays, instant, isoDay, isRealDate, mondayOf, today, validWeeks } from '../src/common/zone';

describe('zona fija de Lima', () => {
  it('today usa Lima, no UTC', () => {
    // 2026-11-16 04:30 UTC = domingo 2026-11-15 23:30 en Lima (UTC-5)
    expect(today(new Date('2026-11-16T04:30:00Z'))).toBe('2026-11-15');
  });

  it('mondayOf devuelve el lunes de la semana', () => {
    expect(mondayOf('2026-11-15')).toBe('2026-11-09');
    expect(mondayOf('2026-11-16')).toBe('2026-11-16');
  });

  it('isoDay: 1 = lunes … 7 = domingo', () => {
    expect(isoDay('2026-11-15')).toBe(7);
  });

  it('addDays cruza de mes', () => {
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01');
  });

  it('instant convierte la hora de Lima a UTC', () => {
    expect(instant('2026-11-20', '16:00').toISOString()).toBe('2026-11-20T21:00:00.000Z');
  });

  it('validWeeks son los 4 lunes desde el de hoy', () => {
    expect(validWeeks(new Date('2026-11-16T04:30:00Z'))).toEqual([
      '2026-11-09', '2026-11-16', '2026-11-23', '2026-11-30',
    ]);
  });

  it('isRealDate rechaza fechas que no existen', () => {
    expect(isRealDate('2026-02-30')).toBe(false);
    expect(isRealDate('2026-11-15')).toBe(true);
  });
});
