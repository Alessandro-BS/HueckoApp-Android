import type { MatchWindow, TimeWindow } from '@hueckoapp/shared';
import { describe, expect, it } from 'vitest';

import { bestWindows, criticalityFor, isVotingOpen, nextOccurrence, pickWinner, scheduleFor } from '../src/proposals/rules';
import { NOW } from './helpers';

describe('nextOccurrence (C11)', () => {
  it.each([
    [3, '11:00', new Date(2026, 8, 30, 11, 0)], // miércoles: mañana
    [2, '16:00', new Date(2026, 8, 29, 16, 0)], // hoy, más tarde
    [2, '09:00', new Date(2026, 9, 6, 9, 0)], // hoy ya pasó: el martes que viene
    [2, '10:00', new Date(2026, 9, 6, 10, 0)], // justo ahora no cuenta como futuro
    [1, '08:30', new Date(2026, 9, 5, 8, 30)],
    [7, '20:00', new Date(2026, 9, 4, 20, 0)],
  ])('día %i a las %s → %s', (day, time, expected) => {
    expect(nextOccurrence(day, time, NOW)).toEqual(expected);
  });
});

describe('scheduleFor (C11)', () => {
  it('devuelve el instante ISO y la fecha local YYYY-MM-DD de la próxima ocurrencia', () => {
    expect(scheduleFor(3, '11:00', NOW)).toEqual({
      scheduledAt: new Date(2026, 8, 30, 11, 0).toISOString(),
      scheduledDate: '2026-09-30',
    });
    expect(scheduleFor(2, '09:00', NOW).scheduledDate).toBe('2026-10-06');
  });
});

const w = (id: string, over: Partial<TimeWindow> = {}): TimeWindow => ({
  id, dayOfWeek: 1, startTime: '10:00', endTime: '12:00', availabilityPercentage: 100, voteCount: 0, ...over,
});

describe('pickWinner (C2)', () => {
  it('gana la más votada', () => {
    expect(pickWinner([w('a', { voteCount: 1 }), w('b', { voteCount: 3, dayOfWeek: 5 })])?.id).toBe('b');
  });

  it('empate de votos: gana la de mayor disponibilidad', () => {
    expect(
      pickWinner([w('a', { voteCount: 2, availabilityPercentage: 67 }), w('b', { voteCount: 2, dayOfWeek: 6 })])?.id,
    ).toBe('b');
  });

  it('empate total: el día y la hora más tempranos', () => {
    const windows = [
      w('a', { voteCount: 1, dayOfWeek: 4 }),
      w('b', { voteCount: 1, dayOfWeek: 2, startTime: '16:00', endTime: '18:00' }),
      w('c', { voteCount: 1, dayOfWeek: 2, startTime: '09:00', endTime: '11:00' }),
    ];
    expect(pickWinner(windows)?.id).toBe('c');
  });

  it('sin votos → null', () => {
    expect(pickWinner([w('a'), w('b')])).toBeNull();
    expect(pickWinner([])).toBeNull();
  });
});

const mw = (dayOfWeek: number, startTime: string, endTime: string, availabilityPercentage = 100): MatchWindow => ({
  dayOfWeek, startTime, endTime, availabilityPercentage, freeMembers: 2,
});

// Semana completa del ejemplo E3 (domain spec §1.2).
const E3 = [
  mw(1, '12:00', '20:00'), mw(2, '08:00', '20:00'), mw(3, '08:00', '14:00'), mw(3, '19:00', '20:00'),
  mw(4, '08:00', '20:00'), mw(5, '08:00', '09:00'), mw(5, '11:00', '20:00'), mw(6, '08:00', '20:00'), mw(7, '08:00', '20:00'),
];

describe('bestWindows (C5)', () => {
  it('E3: las tres franjas de 12 h más tempranas (martes, jueves y sábado)', () => {
    expect(bestWindows(E3)).toEqual([mw(2, '08:00', '20:00'), mw(4, '08:00', '20:00'), mw(6, '08:00', '20:00')]);
  });

  it('el porcentaje manda sobre la duración', () => {
    expect(bestWindows([mw(1, '08:00', '20:00', 80), mw(2, '10:00', '11:00', 100)], 1)).toEqual([mw(2, '10:00', '11:00', 100)]);
  });

  it('con menos de 3 devuelve todas y no cambia la lista recibida', () => {
    // Desordenada a propósito: al ordenar, la del viernes (9 h) pasa delante de la del lunes (8 h).
    const input = [mw(1, '12:00', '20:00'), mw(5, '11:00', '20:00')];
    expect(bestWindows(input)).toEqual([mw(5, '11:00', '20:00'), mw(1, '12:00', '20:00')]);
    expect(input).toEqual([mw(1, '12:00', '20:00'), mw(5, '11:00', '20:00')]);
  });
});

describe('criticalityFor (G6)', () => {
  it.each([
    ['FALTA', true, null, 'ALTA'],
    ['FALTA', false, null, 'MEDIA'],
    ['IMPREVISTO', true, null, 'MEDIA'],
    ['IMPREVISTO', false, null, 'MEDIA'],
    ['TARDANZA', false, 10, 'BAJA'],
    ['TARDANZA', true, 29, 'BAJA'],
    ['TARDANZA', false, 30, 'MEDIA'],
  ] as const)('%s, imprescindible=%s, %s min → %s', (type, essential, delay, expected) => {
    expect(criticalityFor(type, essential, delay)).toBe(expected);
  });
});

describe('isVotingOpen (C1)', () => {
  const deadline = new Date(2026, 8, 29, 20, 0).toISOString();
  it('abierta si está PROPUESTO y el plazo no pasó', () => {
    expect(isVotingOpen({ state: 'PROPUESTO', votingDeadline: deadline }, NOW)).toBe(true);
  });
  it('cerrada al llegar el plazo o si no está PROPUESTO', () => {
    expect(isVotingOpen({ state: 'PROPUESTO', votingDeadline: deadline }, new Date(2026, 8, 29, 20, 0))).toBe(false);
    expect(isVotingOpen({ state: 'CONFIRMADO', votingDeadline: deadline }, NOW)).toBe(false);
  });
});
