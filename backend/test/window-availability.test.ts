import type { TimeBlock } from '@hueckoapp/shared';
import { describe, expect, it } from 'vitest';

import { windowAvailability } from '../src/availability/group-availability';

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

describe('windowAvailability (G2)', () => {
  it.each([
    [{ dayOfWeek: 3, startTime: '11:00', endTime: '13:00' }, 100],
    [{ dayOfWeek: 1, startTime: '10:00', endTime: '12:00' }, 50],
    [{ dayOfWeek: 3, startTime: '14:30', endTime: '15:30' }, 0], // toca la hora 14 (50 %) y la 15 (0 %): el peor
    [{ dayOfWeek: 5, startTime: '16:00', endTime: '18:00' }, 100],
    [{ dayOfWeek: 1, startTime: '07:00', endTime: '09:00' }, 0], // fuera de 08–20 también se calcula
    [{ dayOfWeek: 2, startTime: '21:00', endTime: '22:30' }, 100],
  ])('%j → %i %', (window, expected) => {
    expect(windowAvailability(group, SEED, window)).toBe(expected);
  });

  it('ignora bloques LIBRE, puntuales y de quien no es miembro', () => {
    const blocks = [
      block('yo', 2, '10:00', '12:00', { type: 'LIBRE' }),
      block('ana', 2, '10:00', '12:00', { isRecurring: false, dayOfWeek: null, date: '2026-09-29' }),
      block('otro', 2, '10:00', '12:00'),
    ];
    expect(windowAvailability(group, blocks, { dayOfWeek: 2, startTime: '10:00', endTime: '12:00' })).toBe(100);
  });

  it('grupo sin miembros → 0', () => {
    expect(windowAvailability({ memberIds: [], availabilityThreshold: 80 }, SEED, { dayOfWeek: 2, startTime: '10:00', endTime: '11:00' })).toBe(0);
  });
});
