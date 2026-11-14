import { describe, expect, it } from 'vitest';

import {
  expressOpenedMessage,
  expressResultMessage,
  newProposalMessage,
  planCancelledMessage,
  planConfirmedMessage,
  type PlanInfo,
  reminderMessage,
  whenText,
} from '../src/notifications/messages';

const plan: PlanInfo = {
  proposalId: 'p1',
  groupId: 'g1',
  groupName: 'Proyecto Integrador',
  title: 'Reunión de avance',
  // Viernes 16 de octubre de 2026, 16:00 en Lima (UTC−5).
  scheduledAt: '2026-10-16T21:00:00.000Z',
  locationName: 'Biblioteca central',
};
const planData = { kind: expect.any(String), proposalId: 'p1', groupId: 'g1', screen: 'PLAN' };

describe('{cuándo} en America/Lima', () => {
  it('«<día> <n> de <mes>, HH:mm», en minúsculas, sin coma tras el día y en 24 h', () => {
    expect(whenText('2026-10-16T21:00:00.000Z')).toBe('viernes 16 de octubre, 16:00');
    expect(whenText('2026-10-15T21:00:00.000Z')).toBe('jueves 15 de octubre, 16:00');
    // Medianoche pasada en Lima (05:05 UTC): 00:05, no 24:05 ni 12:05 a. m.
    expect(whenText('2026-10-16T05:05:00.000Z')).toBe('viernes 16 de octubre, 00:05');
    // Un día de una cifra no lleva cero.
    expect(whenText('2026-11-02T14:30:00.000Z')).toBe('lunes 2 de noviembre, 09:30');
  });
});

describe('textos de los avisos (título = nombre del grupo)', () => {
  it('NEW_PROPOSAL abre la votación', () => {
    expect(newProposalMessage(plan, 'Ana')).toEqual({
      title: 'Proyecto Integrador',
      body: 'Ana propuso «Reunión de avance». Vota tus franjas.',
      data: { kind: 'NEW_PROPOSAL', proposalId: 'p1', groupId: 'g1', screen: 'VOTING' },
    });
  });

  it('PLAN_CONFIRMED con la fecha en Lima', () => {
    expect(planConfirmedMessage(plan)).toEqual({
      title: 'Proyecto Integrador',
      body: '«Reunión de avance» se confirmó para el viernes 16 de octubre, 16:00.',
      data: { ...planData, kind: 'PLAN_CONFIRMED' },
    });
  });

  it('PLAN_CANCELLED a mano y sin votos', () => {
    expect(planCancelledMessage(plan, { noVotes: false })).toEqual({
      title: 'Proyecto Integrador',
      body: '«Reunión de avance» se canceló.',
      data: { ...planData, kind: 'PLAN_CANCELLED' },
    });
    expect(planCancelledMessage(plan, { noVotes: true }).body).toBe('«Reunión de avance» se canceló: nadie votó antes del plazo.');
  });

  it('EXPRESS_OPENED con la razón crítica', () => {
    expect(expressOpenedMessage(plan, 'Ana', 'es organizador del grupo')).toEqual({
      title: 'Proyecto Integrador',
      body: 'Ana no podrá ir a «Reunión de avance» (es organizador del grupo). Vota qué hacer.',
      data: { ...planData, kind: 'EXPRESS_OPENED' },
    });
  });

  it('EXPRESS_RESULT: cada decisión y sin quórum', () => {
    expect(expressResultMessage(plan, 'MANTENER', false)).toEqual({
      title: 'Proyecto Integrador',
      body: 'El grupo decidió mantener «Reunión de avance».',
      data: { ...planData, kind: 'EXPRESS_RESULT' },
    });
    expect(expressResultMessage(plan, 'REAGENDAR', false).body).toBe('El grupo decidió reagendar «Reunión de avance».');
    expect(expressResultMessage(plan, 'CANCELAR', false).body).toBe('El grupo decidió cancelar «Reunión de avance».');
    expect(expressResultMessage(plan, 'MANTENER', true).body).toBe('Sin quórum: «Reunión de avance» se mantiene.');
  });

  it('REMINDER con y sin lugar, con la hora de Lima', () => {
    expect(reminderMessage(plan)).toEqual({
      title: 'Proyecto Integrador',
      body: '«Reunión de avance» empieza a las 16:00 en Biblioteca central.',
      data: { ...planData, kind: 'REMINDER' },
    });
    expect(reminderMessage({ ...plan, locationName: null, scheduledAt: '2026-10-16T14:05:00.000Z' }).body).toBe(
      '«Reunión de avance» empieza a las 09:05.',
    );
  });
});
