import type { TimeBlock } from '@hueckoapp/shared';
import { describe, expect, it } from 'vitest';

import { weekAvailability, windowAvailability } from '../src/availability/group-availability';

const block = (userId: string, dayOfWeek: number, startTime: string, endTime: string, over: Partial<TimeBlock> = {}): TimeBlock => ({
  id: `${userId}-${dayOfWeek}-${startTime}`, userId, label: 'Bloque', type: 'CLASE', startTime, endTime,
  isRecurring: true, dayOfWeek, date: null, ...over,
});

// Grupo de la semilla: yo y Ana, con los bloques de domain spec §3.1.
const group = { memberIds: ['yo', 'ana'], availabilityThreshold: 80 };
const SEED = [
  block('yo', 1, '08:00', '10:00'), block('yo', 3, '14:00', '16:00'),
  block('ana', 1, '08:00', '12:00'), block('ana', 3, '15:00', '19:00'), block('ana', 5, '09:00', '11:00'),
];

// Semana del lunes 16 de noviembre de 2026 (miércoles 18, viernes 20…); el jueves es el 19.
const MON = '2026-11-16';
const WED = '2026-11-18';
const THU = '2026-11-19';
const FRI = '2026-11-20';
const SAT = '2026-11-21';
const TUE = '2026-11-17';

describe('windowAvailability (G2)', () => {
  it.each([
    [{ date: WED, startTime: '11:00', endTime: '13:00' }, 100],
    [{ date: MON, startTime: '10:00', endTime: '12:00' }, 50],
    [{ date: WED, startTime: '14:30', endTime: '15:30' }, 0], // toca la hora 14 (50 %) y la 15 (0 %): el peor
    [{ date: FRI, startTime: '16:00', endTime: '18:00' }, 100],
    [{ date: MON, startTime: '07:00', endTime: '09:00' }, 0], // fuera de 08–20 también se calcula
    [{ date: TUE, startTime: '21:00', endTime: '22:30' }, 100],
  ])('%j → %i %', (window, expected) => {
    expect(windowAvailability(group, SEED, window)).toBe(expected);
  });

  it('ignora bloques LIBRE, puntuales de otra fecha y de quien no es miembro', () => {
    const blocks = [
      block('yo', 2, '10:00', '12:00', { type: 'LIBRE' }),
      block('ana', 2, '10:00', '12:00', { isRecurring: false, dayOfWeek: null, date: '2026-09-29' }),
      block('otro', 2, '10:00', '12:00'),
    ];
    expect(windowAvailability(group, blocks, { date: TUE, startTime: '10:00', endTime: '12:00' })).toBe(100);
  });

  it('windowAvailability de una fecha suma recurrentes de su día y puntuales de esa fecha', () => {
    const blocks = [
      block('yo', 2, '10:00', '12:00'),
      block('ana', 2, '11:00', '13:00', { isRecurring: false, dayOfWeek: null, date: TUE, type: 'PUNTUAL' }),
    ];
    expect(windowAvailability(group, blocks, { date: TUE, startTime: '10:00', endTime: '11:00' })).toBe(50);
    expect(windowAvailability(group, blocks, { date: TUE, startTime: '11:00', endTime: '12:00' })).toBe(0);
    // El martes siguiente el puntual ya no está: solo queda el recurrente de yo.
    expect(windowAvailability(group, blocks, { date: '2026-11-24', startTime: '11:00', endTime: '12:00' })).toBe(50);
  });

  it('grupo sin miembros → 0', () => {
    expect(windowAvailability({ memberIds: [], availabilityThreshold: 80 }, SEED, { date: TUE, startTime: '10:00', endTime: '11:00' })).toBe(0);
  });
});

describe('weekAvailability', () => {
  const half = { memberIds: ['yo', 'ana'], availabilityThreshold: 50 };
  const longAgo = new Date('2026-11-01T12:00:00Z');
  const puntual = (userId: string, date: string, over: Partial<TimeBlock> = {}) =>
    block(userId, 0, '08:00', '20:00', { isRecurring: false, dayOfWeek: null, date, type: 'PUNTUAL', ...over });
  const thursday = (week: string, blocks: TimeBlock[], now = longAgo) =>
    weekAvailability(half, blocks, week, now).filter((w) => w.dayOfWeek === 4);
  const FULL = { dayOfWeek: 4, startTime: '08:00', endTime: '20:00', availabilityPercentage: 100, freeMembers: 2 };

  it('un puntual del jueves 19 ocupa solo esa fecha (semana del 16; las del 9 y del 23 no)', () => {
    const blocks = [puntual('ana', THU)];
    expect(thursday('2026-11-16', blocks)).toEqual([{ ...FULL, date: THU, availabilityPercentage: 50, freeMembers: 1 }]);
    expect(thursday('2026-11-09', blocks)).toEqual([{ ...FULL, date: '2026-11-12' }]);
    expect(thursday('2026-11-23', blocks)).toEqual([{ ...FULL, date: '2026-11-26' }]);
  });

  it('un puntual LIBRE no ocupa', () => {
    expect(thursday('2026-11-16', [puntual('ana', THU, { type: 'LIBRE' })])).toEqual([{ ...FULL, date: THU }]);
  });

  it('cada franja lleva la fecha de su día y los recurrentes se repiten cada semana', () => {
    const windows = weekAvailability(half, [block('yo', 1, '08:00', '20:00')], '2026-11-16', longAgo);
    expect(windows.map((w) => [w.date, w.dayOfWeek, w.availabilityPercentage])).toEqual([
      [MON, 1, 50], [TUE, 2, 100], [WED, 3, 100], [THU, 4, 100], [FRI, 5, 100], [SAT, 6, 100], ['2026-11-22', 7, 100],
    ]);
  });

  it('en la semana actual no se ofrecen franjas que ya empezaron', () => {
    // Jueves 19 a las 15:30 en Lima (20:30 UTC): nada de lunes a miércoles, ni lo que empieza antes de las 15:30.
    const now = new Date('2026-11-19T15:30:00-05:00');
    const windows = weekAvailability(group, [block('yo', 4, '08:00', '16:00'), block('yo', 4, '18:00', '19:00')], '2026-11-16', now);
    expect(windows.filter((w) => w.date < THU)).toEqual([]);
    // Jueves: quedan 16:00–18:00 y 19:00–20:00; la mañana (ocupada) ya no existe y nada se recorta.
    expect(windows.filter((w) => w.date === THU).map((w) => [w.startTime, w.endTime])).toEqual([['16:00', '18:00'], ['19:00', '20:00']]);
    expect(windows.filter((w) => w.date > THU)).toHaveLength(3);
    // Una franja que empezó a las 15:00 se descarta entera aunque siga en curso.
    const started = weekAvailability(group, [block('yo', 4, '08:00', '15:00')], '2026-11-16', now);
    expect(started.filter((w) => w.date === THU)).toEqual([]);
  });
});
