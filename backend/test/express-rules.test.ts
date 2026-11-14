import { describe, expect, it } from 'vitest';

import { criticalReasonFor, expiresAtFor, quorumFor, tally } from '../src/proposals/express-rules';

const base = { type: 'FALTA', reporterId: 'u1', createdById: 'u2', isEssential: false, role: 'MEMBER' } as const;

describe('reglas de la votación exprés', () => {
  describe('criticalReasonFor', () => {
    it('el creador gana aunque también sea imprescindible y ORGANIZER', () => {
      expect(criticalReasonFor({ ...base, createdById: 'u1', isEssential: true, role: 'ORGANIZER' })).toBe('propuso este plan');
    });
    it('imprescindible', () => {
      expect(criticalReasonFor({ ...base, isEssential: true, role: 'ORGANIZER' })).toBe('el grupo lo marcó como imprescindible');
    });
    it('organizador', () => {
      expect(criticalReasonFor({ ...base, role: 'ORGANIZER' })).toBe('es organizador del grupo');
    });
    it('ninguno', () => {
      expect(criticalReasonFor(base)).toBeNull();
    });
    it('tardanza del creador no es crítica', () => {
      expect(criticalReasonFor({ ...base, type: 'TARDANZA', createdById: 'u1' })).toBeNull();
    });
  });

  describe('expiresAtFor', () => {
    const open = new Date('2026-11-13T10:00:00Z');
    it('una hora después si la cita es lejana', () => {
      expect(expiresAtFor(open, '2026-11-13T15:00:00Z', 60)).toBe('2026-11-13T11:00:00.000Z');
    });
    it('no pasa del inicio de la cita', () => {
      expect(expiresAtFor(open, '2026-11-13T10:30:00Z', 60)).toBe('2026-11-13T10:30:00.000Z');
    });
    it('mínimo 5 minutos', () => {
      expect(expiresAtFor(open, '2026-11-13T10:02:00Z', 60)).toBe('2026-11-13T10:05:00.000Z');
    });
    it('cita ya pasada: 5 minutos', () => {
      expect(expiresAtFor(open, '2026-11-13T09:00:00Z', 60)).toBe('2026-11-13T10:05:00.000Z');
    });
    it('sin cita', () => {
      expect(expiresAtFor(open, null, 60)).toBe('2026-11-13T11:00:00.000Z');
    });
  });

  it('quorumFor', () => {
    expect([0, 1, 2, 6].map(quorumFor)).toEqual([0, 1, 2, 2]);
  });

  describe('tally', () => {
    it('sin votos: MANTENER por defecto', () => {
      expect(tally([], 6)).toEqual({ result: 'MANTENER', byDefault: true });
    });
    it('sin quórum: MANTENER por defecto', () => {
      expect(tally(['CANCELAR'], 6)).toEqual({ result: 'MANTENER', byDefault: true });
    });
    it('quórum de 1', () => {
      expect(tally(['CANCELAR'], 1)).toEqual({ result: 'CANCELAR', byDefault: false });
    });
    it('mayoría', () => {
      expect(tally(['CANCELAR', 'CANCELAR', 'REAGENDAR'], 3).result).toBe('CANCELAR');
    });
    it('empate: REAGENDAR sobre CANCELAR', () => {
      expect(tally(['CANCELAR', 'REAGENDAR'], 2).result).toBe('REAGENDAR');
    });
    it('empate: MANTENER sobre CANCELAR', () => {
      expect(tally(['CANCELAR', 'MANTENER'], 2).result).toBe('MANTENER');
    });
  });
});
