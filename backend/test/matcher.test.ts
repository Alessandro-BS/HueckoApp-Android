import type { MatchWindow, TimeBlock } from '@hueckoapp/shared';
import { describe, expect, it } from 'vitest';

import { groupAvailability } from '../src/availability/group-availability';
import { endHour, startHour, weeklyWindows, windowsFor, type MatcherBlock } from '../src/availability/matcher';

const b = (userId: string, dayOfWeek: number | null, startTime: string, endTime: string): MatcherBlock => ({
  userId, dayOfWeek, startTime, endTime,
});
const hh = (h: number) => `${String(h).padStart(2, '0')}:00`;
const w = (dayOfWeek: number, start: number, end: number, availabilityPercentage: number, freeMembers: number): MatchWindow => ({
  dayOfWeek, startTime: hh(start), endTime: hh(end), availabilityPercentage, freeMembers,
});

// Semilla g1: bloques propios (reasignados a mock_123) + ocupación de Ana (user_2).
const seedGroup = { memberIds: ['mock_123', 'user_2'], availabilityThreshold: 80 };
const seedBlocks = [
  b('mock_123', 1, '08:00', '10:00'),
  b('mock_123', 3, '14:00', '16:00'),
  b('user_2', 1, '08:00', '12:00'),
  b('user_2', 3, '15:00', '19:00'),
  b('user_2', 5, '09:00', '11:00'),
];
const ABC = { memberIds: ['A', 'B', 'C'] };
const ABCDE = { memberIds: ['A', 'B', 'C', 'D', 'E'], availabilityThreshold: 80 };

describe('startHour / endHour (TimeBlock.kt)', () => {
  it('el inicio trunca los minutos y el fin redondea hacia arriba', () => {
    expect(startHour('10:30')).toBe(10);
    expect(endHour('10:30')).toBe(11);
    expect(endHour('11:00')).toBe(11);
  });

  it('las partes no numéricas valen 0', () => {
    expect(startHour('ab:cd')).toBe(0);
    expect(endHour('ab:cd')).toBe(0);
    expect(endHour('10:xx')).toBe(10);
  });
});

describe('windowsFor — ejemplos de la spec', () => {
  it('E1: semilla g1, lunes → 12:00–20:00', () => {
    expect(windowsFor(seedGroup, seedBlocks, 1)).toEqual([w(1, 12, 20, 100, 2)]);
  });

  it('E2: semilla g1, miércoles → 08–14 y 19–20', () => {
    expect(windowsFor(seedGroup, seedBlocks, 3)).toEqual([w(3, 8, 14, 100, 2), w(3, 19, 20, 100, 2)]);
  });

  it('E3: semilla g1, semana completa (9 ventanas en orden de día y hora)', () => {
    expect(weeklyWindows(seedGroup, seedBlocks)).toEqual([
      w(1, 12, 20, 100, 2),
      w(2, 8, 20, 100, 2),
      w(3, 8, 14, 100, 2),
      w(3, 19, 20, 100, 2),
      w(4, 8, 20, 100, 2),
      w(5, 8, 9, 100, 2),
      w(5, 11, 20, 100, 2),
      w(6, 8, 20, 100, 2),
      w(7, 8, 20, 100, 2),
    ]);
  });

  it('E4: al fusionar se queda con el peor % y el menor nº de libres', () => {
    const blocks = [b('A', 1, '09:00', '10:00'), b('B', 1, '11:30', '12:00')];
    expect(windowsFor({ ...ABC, availabilityThreshold: 60 }, blocks, 1)).toEqual([w(1, 8, 20, 67, 2)]);
  });

  it('E5: el umbral corta; minutos sueltos ocupan la hora; puntuales, no miembros y otros días se ignoran', () => {
    const blocks = [
      b('A', 2, '10:00', '10:30'),
      b('B', 2, '13:30', '14:00'),
      b('B', null, '08:00', '20:00'),
      b('Z', 2, '08:00', '20:00'),
      b('C', 3, '08:00', '20:00'),
    ];
    expect(windowsFor({ ...ABC, availabilityThreshold: 80 }, blocks, 2)).toEqual([
      w(2, 8, 10, 100, 3),
      w(2, 11, 13, 100, 3),
      w(2, 14, 20, 100, 3),
    ]);
  });
});

describe('windowsFor — casos límite (E6)', () => {
  it('a) grupo vacío → []', () => {
    expect(windowsFor({ memberIds: [], availabilityThreshold: 0 }, [b('A', 1, '08:00', '20:00')], 1)).toEqual([]);
  });

  it('b) umbral inclusivo y bloque recortado al rango 08–20', () => {
    expect(windowsFor(ABCDE, [b('A', 4, '07:00', '21:00')], 4)).toEqual([w(4, 8, 20, 80, 4)]);
  });

  it('c) una hora por debajo del umbral parte la ventana', () => {
    const blocks = [b('A', 4, '07:00', '21:00'), b('B', 4, '12:00', '13:00')];
    expect(windowsFor(ABCDE, blocks, 4)).toEqual([w(4, 8, 12, 80, 4), w(4, 13, 20, 80, 4)]);
  });

  it('d) umbral 0 con todos ocupados → una ventana al 0 %', () => {
    const blocks = [b('A', 5, '08:00', '20:00'), b('B', 5, '08:00', '20:00')];
    expect(windowsFor({ memberIds: ['A', 'B'], availabilityThreshold: 0 }, blocks, 5)).toEqual([w(5, 8, 20, 0, 0)]);
  });

  it('e) umbral 101 → siempre []', () => {
    expect(windowsFor({ ...seedGroup, availabilityThreshold: 101 }, [], 2)).toEqual([]);
  });

  it('f) fin anterior al inicio → el bloque no ocupa nada', () => {
    const group = { memberIds: ['A', 'B'], availabilityThreshold: 80 };
    expect(windowsFor(group, [b('A', 1, '18:00', '08:00')], 1)).toEqual([w(1, 8, 20, 100, 2)]);
  });

  it('g) dos bloques solapados de la misma persona cuentan una vez por hora', () => {
    const group = { memberIds: ['A', 'B'], availabilityThreshold: 50 };
    const blocks = [b('A', 1, '08:00', '10:00'), b('A', 1, '09:00', '11:00')];
    expect(windowsFor(group, blocks, 1)).toEqual([w(1, 8, 20, 50, 1)]);
  });

  it('redondeo Math.round de Java: 1/8 = 12,5 → 13', () => {
    const ids = ['m1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7', 'm8'];
    const blocks = ids.slice(1).map((id) => b(id, 1, '08:00', '20:00'));
    expect(windowsFor({ memberIds: ids, availabilityThreshold: 13 }, blocks, 1)).toEqual([w(1, 8, 20, 13, 1)]);
    expect(windowsFor({ memberIds: ids, availabilityThreshold: 14 }, blocks, 1)).toEqual([]);
  });

  it('el matcher portado cuenta LIBRE como ocupado (por eso groupAvailability lo filtra antes)', () => {
    const libre: TimeBlock = {
      id: 'x', userId: 'A', label: 'Libre', type: 'LIBRE', startTime: '08:00', endTime: '20:00',
      isRecurring: true, dayOfWeek: 1, date: null,
    };
    expect(windowsFor({ memberIds: ['A', 'B'], availabilityThreshold: 80 }, [libre], 1)).toEqual([]);
  });
});

describe('groupAvailability — reglas nuevas (G13/B14)', () => {
  const tb = (over: Partial<TimeBlock>): TimeBlock => ({
    id: 'x', userId: 'A', label: 'x', type: 'CLASE', startTime: '08:00', endTime: '20:00',
    isRecurring: true, dayOfWeek: 1, date: null, ...over,
  });

  it('ignora bloques LIBRE y puntuales; cruza el resto', () => {
    const blocks = [
      tb({ userId: 'A', type: 'LIBRE', dayOfWeek: 1 }),
      tb({ userId: 'A', type: 'PUNTUAL', isRecurring: false, dayOfWeek: null, date: '2026-09-28' }),
      tb({ userId: 'B', type: 'TRABAJO', dayOfWeek: 2 }),
    ];
    expect(groupAvailability({ memberIds: ['A', 'B'], availabilityThreshold: 80 }, blocks)).toEqual([
      w(1, 8, 20, 100, 2),
      w(3, 8, 20, 100, 2),
      w(4, 8, 20, 100, 2),
      w(5, 8, 20, 100, 2),
      w(6, 8, 20, 100, 2),
      w(7, 8, 20, 100, 2),
    ]);
  });
});
