import type { TimeBlock, TimeBlockInput } from '@hueckoapp/shared';
import { describe, expect, it } from 'vitest';

import { blocksOverlap, firstOverlap, overlapMessage } from '../src/schedule/block-overlap';

const rec = (dayOfWeek: number, startTime: string, endTime: string, type: TimeBlockInput['type'] = 'CLASE'): TimeBlockInput => ({
  label: 'Cálculo II', type, startTime, endTime, isRecurring: true, dayOfWeek, date: null,
});
const one = (date: string, startTime: string, endTime: string): TimeBlockInput => ({
  label: 'Dentista', type: 'PUNTUAL', startTime, endTime, isRecurring: false, dayOfWeek: null, date,
});
const saved = (id: string, input: TimeBlockInput): TimeBlock => ({ id, userId: 'u', ...input });

describe('blocksOverlap', () => {
  it('recurrentes del mismo día que se cruzan', () => expect(blocksOverlap(rec(1, '08:00', '10:00'), rec(1, '09:00', '11:00'))).toBe(true));
  it('recurrentes de distinto día', () => expect(blocksOverlap(rec(1, '08:00', '10:00'), rec(2, '08:00', '10:00'))).toBe(false));
  it('el borde no cuenta', () => expect(blocksOverlap(rec(1, '08:00', '10:00'), rec(1, '10:00', '12:00'))).toBe(false));
  it('puntuales de la misma fecha', () => expect(blocksOverlap(one('2026-11-16', '09:00', '10:00'), one('2026-11-16', '09:30', '11:00'))).toBe(true));
  it('puntuales de distinta fecha', () => expect(blocksOverlap(one('2026-11-16', '09:00', '10:00'), one('2026-11-17', '09:00', '10:00'))).toBe(false));
  it('puntual del lunes contra recurrente del lunes', () => {
    expect(blocksOverlap(one('2026-11-16', '09:00', '10:00'), rec(1, '08:00', '11:00'))).toBe(true);
    expect(blocksOverlap(rec(1, '08:00', '11:00'), one('2026-11-16', '09:00', '10:00'))).toBe(true);
  });
  it('puntual del lunes contra recurrente del martes', () => expect(blocksOverlap(one('2026-11-16', '09:00', '10:00'), rec(2, '08:00', '11:00'))).toBe(false));
  it('LIBRE cuenta', () => expect(blocksOverlap(rec(1, '08:00', '10:00', 'LIBRE'), rec(1, '09:00', '10:00'))).toBe(true));
});

describe('firstOverlap', () => {
  const existing = [saved('a', rec(1, '08:00', '10:00')), saved('b', rec(1, '09:00', '12:00'))];
  it('devuelve el primero que choca', () => expect(firstOverlap(rec(1, '09:00', '10:00'), existing)?.id).toBe('a'));
  it('ignora ignoreId', () => expect(firstOverlap(rec(1, '09:00', '10:00'), existing, 'a')?.id).toBe('b'));
  it('undefined si no choca', () => expect(firstOverlap(rec(2, '09:00', '10:00'), existing)).toBeUndefined());
});

describe('overlapMessage', () => {
  it('recurrente', () => expect(overlapMessage(rec(1, '08:00', '11:00'))).toBe('Se solapa con «Cálculo II» (lunes 08:00–11:00).'));
  it('puntual', () => expect(overlapMessage(one('2026-11-16', '09:00', '10:00'))).toBe('Se solapa con «Dentista» (16/11/2026 09:00–10:00).'));
});
