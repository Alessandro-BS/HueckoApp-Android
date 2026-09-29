import type { Group, Proposal, User } from '@hueckoapp/shared';
import type { Express } from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';

import { AFTER_DEADLINE, bearer, createProposal, DEADLINE, makeClock, makeTestApp, NOW, registerUser, setupSeedGroup, voteFor, windowOf } from './helpers';

const NEW_DEADLINE = new Date(2026, 9, 10, 20, 0).toISOString();

let app: Express;
let clock: ReturnType<typeof makeClock>;
let yo: { token: string; user: User };
let ana: { token: string; user: User };
let group: Group;

beforeEach(async () => {
  clock = makeClock(NOW);
  ({ app } = makeTestApp({ now: clock.now }));
  ({ yo, ana, group } = await setupSeedGroup(app));
});

const postTo = (path: string, token: string, body: object = {}) =>
  request(app).post(`/api/proposals/${path}`).set(bearer(token)).send(body);
const vote = (p: Proposal, dayOfWeek: number, token: string) => voteFor(app, p.id, windowOf(p, dayOfWeek).id, token);
// Ana pasa a ser imprescindible: su FALTA lleva el plan a EN_RECOORDINACION.
const makeEssential = () =>
  request(app).patch(`/api/groups/${group.id}/members/${ana.user.id}`).set(bearer(yo.token)).send({ isEssential: true });

// Martes 16–18, jueves 10–12 y viernes 16–18, creada por yo para poder confirmarla.
const threeWindows = () =>
  createProposal(app, yo.token, group.id, {
    title: 'Repaso antes de la entrega',
    votingDeadline: DEADLINE,
    windows: [
      { dayOfWeek: 2, startTime: '16:00', endTime: '18:00' },
      { dayOfWeek: 4, startTime: '10:00', endTime: '12:00' },
      { dayOfWeek: 5, startTime: '16:00', endTime: '18:00' },
    ],
  });

// Miércoles 11–13, votada por los dos y confirmada por yo.
async function confirmedPlan(): Promise<Proposal> {
  const p = await createProposal(app, yo.token, group.id, {
    title: 'Reunión de avance del proyecto',
    votingDeadline: DEADLINE,
    windows: [{ dayOfWeek: 3, startTime: '11:00', endTime: '13:00' }],
  });
  await vote(p, 3, yo.token);
  await vote(p, 3, ana.token);
  const res = await postTo(`${p.id}/confirm`, yo.token);
  if (res.status !== 200) throw new Error(`confirmar falló: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body;
}

// Plan confirmado en el que falta Ana (imprescindible): queda EN_RECOORDINACION.
async function recoordinatingPlan(): Promise<Proposal> {
  const p = await confirmedPlan();
  await makeEssential();
  const res = await postTo(`${p.id}/incidences`, ana.token, { type: 'FALTA', reason: 'Enferma' });
  if (res.body.state !== 'EN_RECOORDINACION') throw new Error(`reportar falló: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body;
}

// Plan confirmado y después cancelado por quien lo creó.
async function cancelledPlan(): Promise<Proposal> {
  const p = await confirmedPlan();
  const res = await postTo(`${p.id}/cancel`, yo.token);
  if (res.body.state !== 'CANCELADO') throw new Error(`cancelar falló: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body;
}

describe('POST /api/proposals/:id/confirm (C2, C11)', () => {
  it('sin windowId gana la más votada y scheduledAt/scheduledDate son su próxima ocurrencia', async () => {
    const p = await threeWindows();
    await vote(p, 4, yo.token);
    await vote(p, 4, ana.token);
    const res = await postTo(`${p.id}/confirm`, yo.token);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      state: 'CONFIRMADO',
      chosenWindowId: windowOf(p, 4).id,
      scheduledAt: new Date(2026, 9, 1, 10, 0).toISOString(),
      scheduledDate: '2026-10-01',
    });
  });

  it('empate de votos: gana la de mayor disponibilidad', async () => {
    const p = await createProposal(app, yo.token, group.id, {
      votingDeadline: DEADLINE,
      windows: [
        { dayOfWeek: 1, startTime: '10:00', endTime: '12:00' }, // 50 %
        { dayOfWeek: 5, startTime: '16:00', endTime: '18:00' }, // 100 %
      ],
    });
    await vote(p, 1, ana.token);
    await vote(p, 5, yo.token);
    const res = await postTo(`${p.id}/confirm`, yo.token);
    expect(res.body.chosenWindowId).toBe(windowOf(p, 5).id);
    expect(res.body.scheduledAt).toBe(new Date(2026, 9, 2, 16, 0).toISOString());
    expect(res.body.scheduledDate).toBe('2026-10-02');
  });

  it('con windowId confirma esa franja aunque no tenga votos (hoy mismo si aún no llegó la hora)', async () => {
    const p = await threeWindows();
    const res = await postTo(`${p.id}/confirm`, yo.token, { windowId: windowOf(p, 2).id });
    expect(res.body).toMatchObject({
      state: 'CONFIRMADO',
      chosenWindowId: windowOf(p, 2).id,
      scheduledAt: new Date(2026, 8, 29, 16, 0).toISOString(),
      scheduledDate: '2026-09-29',
    });
  });

  it('409 NO_VOTES sin votos ni windowId; 404 WINDOW_NOT_FOUND con una franja ajena', async () => {
    const p = await threeWindows();
    const sinVotos = await postTo(`${p.id}/confirm`, yo.token);
    expect([sinVotos.status, sinVotos.body.error.code]).toEqual([409, 'NO_VOTES']);
    const ajena = await postTo(`${p.id}/confirm`, yo.token, { windowId: 'no-existe' });
    expect([ajena.status, ajena.body.error.code]).toEqual([404, 'WINDOW_NOT_FOUND']);
  });

  it('solo quien la creó: 403 NOT_CREATOR', async () => {
    const p = await threeWindows();
    await vote(p, 2, ana.token);
    const res = await postTo(`${p.id}/confirm`, ana.token);
    expect([res.status, res.body.error.code, res.body.error.message]).toEqual([
      403, 'NOT_CREATOR', 'Solo quien propuso el plan puede hacer esto.',
    ]);
  });

  it('confirmada ya no admite votos (C1) ni otra confirmación', async () => {
    const p = await confirmedPlan();
    expect((await vote(p, 3, ana.token)).body.error.code).toBe('VOTING_CLOSED');
    expect((await postTo(`${p.id}/confirm`, yo.token)).body.error.code).toBe('INVALID_STATE');
  });

  it('409 INVALID_STATE al confirmar un plan CANCELADO o EN_RECOORDINACION', async () => {
    const cancelado = await cancelledPlan();
    const res = await postTo(`${cancelado.id}/confirm`, yo.token);
    expect([res.status, res.body.error.code]).toEqual([409, 'INVALID_STATE']);
    const enRecoordinacion = await recoordinatingPlan();
    const res2 = await postTo(`${enRecoordinacion.id}/confirm`, yo.token);
    expect([res2.status, res2.body.error.code]).toEqual([409, 'INVALID_STATE']);
  });

  it('se puede confirmar después del plazo', async () => {
    const p = await threeWindows();
    await vote(p, 4, ana.token);
    clock.set(AFTER_DEADLINE);
    const res = await postTo(`${p.id}/confirm`, yo.token);
    expect(res.status).toBe(200);
    expect(res.body.scheduledAt).toBe(new Date(2026, 9, 8, 10, 0).toISOString());
    expect(res.body.scheduledDate).toBe('2026-10-08');
  });
});

describe('POST /api/proposals/:id/cancel (C3)', () => {
  it('quien la creó la cancela desde cualquier estado salvo CANCELADO', async () => {
    const p = await confirmedPlan();
    const res = await postTo(`${p.id}/cancel`, yo.token);
    expect([res.status, res.body.state]).toEqual([200, 'CANCELADO']);
    expect((await postTo(`${p.id}/cancel`, yo.token)).body.error.code).toBe('INVALID_STATE');
  });

  it('403 NOT_CREATOR si no la creé', async () => {
    const p = await threeWindows();
    expect((await postTo(`${p.id}/cancel`, ana.token)).body.error.code).toBe('NOT_CREATOR');
  });
});

describe('POST /api/proposals/:id/incidences (C4, G6)', () => {
  const report = (p: Proposal, token: string, body: object) => postTo(`${p.id}/incidences`, token, body);

  it('solo en planes confirmados: 409 INVALID_STATE en PROPUESTO', async () => {
    const p = await threeWindows();
    const res = await report(p, ana.token, { type: 'FALTA', reason: 'Enferma' });
    expect([res.status, res.body.error.code, res.body.error.message]).toEqual([
      409, 'INVALID_STATE', 'Solo se pueden reportar imprevistos de un plan confirmado.',
    ]);
  });

  it('IMPREVISTO de Ana: MEDIA, sin resolver, con la hora del reloj, y el plan sigue CONFIRMADO', async () => {
    const p = await confirmedPlan();
    const res = await report(p, ana.token, { type: 'IMPREVISTO', reason: '  Cruce con un examen de laboratorio a última hora. ' });
    expect(res.status).toBe(201);
    expect(res.body.state).toBe('CONFIRMADO');
    expect(res.body.incidences).toEqual([
      {
        id: expect.any(String),
        user: ana.user,
        type: 'IMPREVISTO',
        reason: 'Cruce con un examen de laboratorio a última hora.',
        delayMinutes: null,
        criticality: 'MEDIA',
        resolved: false,
        createdAt: NOW.toISOString(),
      },
    ]);
  });

  it.each([
    [20, 'BAJA'],
    [45, 'MEDIA'],
  ])('TARDANZA de %i min → %s', async (delayMinutes, criticality) => {
    const p = await confirmedPlan();
    const res = await report(p, ana.token, { type: 'TARDANZA', reason: 'Tráfico', delayMinutes });
    expect(res.body.incidences[0]).toMatchObject({ delayMinutes, criticality });
    expect(res.body.state).toBe('CONFIRMADO');
  });

  it('FALTA de un imprescindible → ALTA y el plan pasa a EN_RECOORDINACION', async () => {
    const p = await confirmedPlan();
    await makeEssential();
    const res = await report(p, ana.token, { type: 'FALTA', reason: 'Estoy enferma' });
    expect(res.body.state).toBe('EN_RECOORDINACION');
    expect(res.body.incidences[0].criticality).toBe('ALTA');
    // En EN_RECOORDINACION se siguen aceptando reportes.
    expect((await report(p, yo.token, { type: 'TARDANZA', reason: 'Tráfico', delayMinutes: 10 })).status).toBe(201);
  });

  it('FALTA de alguien no imprescindible → MEDIA y sigue CONFIRMADO', async () => {
    const p = await confirmedPlan();
    const res = await report(p, ana.token, { type: 'FALTA', reason: 'Viaje' });
    expect(res.body.state).toBe('CONFIRMADO');
    expect(res.body.incidences[0].criticality).toBe('MEDIA');
  });

  it.each([
    [{ type: 'TARDANZA', reason: 'Tráfico' }, 'delayMinutes', 'Indica cuántos minutos llegarás tarde'],
    [{ type: 'FALTA', reason: 'Enfermo', delayMinutes: 10 }, 'delayMinutes', 'Solo una tardanza lleva minutos de retraso'],
    [{ type: 'TARDANZA', reason: 'Tráfico', delayMinutes: 0 }, 'delayMinutes', 'Los minutos deben ser mayores que 0'],
    [{ type: 'FALTA', reason: '   ' }, 'reason', 'Cuéntale al grupo qué pasó'],
    [{ type: 'OTRO', reason: 'x' }, 'type', 'Tipo de imprevisto inválido'],
  ])('valida %j → 400 en %s', async (body, field, message) => {
    const p = await confirmedPlan();
    const res = await report(p, ana.token, body);
    expect(res.status).toBe(400);
    expect(res.body.error.details).toContainEqual(expect.objectContaining({ path: [field], message }));
  });

  it('409 INVALID_STATE en un plan CANCELADO', async () => {
    const p = await cancelledPlan();
    const res = await report(p, ana.token, { type: 'FALTA', reason: 'Enferma' });
    expect([res.status, res.body.error.code]).toEqual([409, 'INVALID_STATE']);
  });

  it('403 a quien no es miembro', async () => {
    const p = await confirmedPlan();
    const otra = await registerUser(app);
    expect((await report(p, otra.token, { type: 'FALTA', reason: 'x' })).status).toBe(403);
  });
});

describe('POST /api/proposals/:id/incidences/resolve (G4)', () => {
  const resolve = (p: Proposal, token: string, body: object) => postTo(`${p.id}/incidences/resolve`, token, body);
  const withIncidence = async () => {
    const p = await confirmedPlan();
    await postTo(`${p.id}/incidences`, ana.token, { type: 'IMPREVISTO', reason: 'Examen' });
    return p;
  };

  it('Mantener: incidencias resueltas; sigue CONFIRMADO con su franja y su fecha', async () => {
    const p = await withIncidence();
    const res = await resolve(p, yo.token, { newState: 'CONFIRMADO' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      state: 'CONFIRMADO', chosenWindowId: p.chosenWindowId, scheduledAt: p.scheduledAt, scheduledDate: p.scheduledDate,
    });
    expect(res.body.incidences.map((i: { resolved: boolean }) => i.resolved)).toEqual([true]);
  });

  it('Cancelar: CANCELADO', async () => {
    const p = await withIncidence();
    expect((await resolve(p, yo.token, { newState: 'CANCELADO' })).body.state).toBe('CANCELADO');
  });

  it('Reprogramar: PROPUESTO sin votos ni franja elegida, con plazo nuevo, y se vuelve a votar', async () => {
    const p = await withIncidence();
    const res = await resolve(p, yo.token, { newState: 'PROPUESTO', votingDeadline: NEW_DEADLINE });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      state: 'PROPUESTO', chosenWindowId: null, scheduledAt: null, scheduledDate: null, votingDeadline: NEW_DEADLINE, myVoteWindowId: null,
    });
    expect(res.body.windows.map((w: { voteCount: number }) => w.voteCount)).toEqual([0]);
    expect(res.body.incidences.every((i: { resolved: boolean }) => i.resolved)).toBe(true);
    expect((await vote(res.body, 3, ana.token)).status).toBe(200);
  });

  it('Reprogramar exige un plazo nuevo y futuro', async () => {
    const p = await withIncidence();
    const sinPlazo = await resolve(p, yo.token, { newState: 'PROPUESTO' });
    expect(sinPlazo.body.error.details).toContainEqual(
      expect.objectContaining({ path: ['votingDeadline'], message: 'Para reprogramar indica una nueva fecha límite' }),
    );
    const pasado = await resolve(p, yo.token, { newState: 'PROPUESTO', votingDeadline: new Date(2026, 8, 28).toISOString() });
    expect(pasado.body.error.details).toContainEqual(
      expect.objectContaining({ path: ['votingDeadline'], message: 'La fecha límite debe ser futura' }),
    );
  });

  it('el plazo solo se valida al reprogramar: con CONFIRMADO o CANCELADO se ignora', async () => {
    const p = await withIncidence();
    const res = await resolve(p, yo.token, { newState: 'CONFIRMADO', votingDeadline: new Date(2026, 8, 28).toISOString() });
    expect([res.status, res.body.state]).toEqual([200, 'CONFIRMADO']);
    const cancelado = await resolve(p, yo.token, { newState: 'CANCELADO', votingDeadline: 'no-es-una-fecha' });
    expect([cancelado.status, cancelado.body.state]).toEqual([200, 'CANCELADO']);
  });

  it('de EN_RECOORDINACION a CONFIRMADO', async () => {
    const p = await recoordinatingPlan();
    const res = await resolve(p, yo.token, { newState: 'CONFIRMADO' });
    expect(res.body.state).toBe('CONFIRMADO');
  });

  it('de EN_RECOORDINACION a PROPUESTO: sin votos ni franja elegida, con el plazo nuevo e incidencias resueltas', async () => {
    const p = await recoordinatingPlan();
    const res = await resolve(p, yo.token, { newState: 'PROPUESTO', votingDeadline: NEW_DEADLINE });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      state: 'PROPUESTO', chosenWindowId: null, scheduledAt: null, scheduledDate: null, votingDeadline: NEW_DEADLINE, myVoteWindowId: null,
    });
    expect(res.body.windows.map((w: { voteCount: number }) => w.voteCount)).toEqual([0]);
    expect(res.body.incidences.map((i: { resolved: boolean }) => i.resolved)).toEqual([true]);
  });

  it('de EN_RECOORDINACION a CANCELADO: incidencias resueltas', async () => {
    const p = await recoordinatingPlan();
    const res = await resolve(p, yo.token, { newState: 'CANCELADO' });
    expect([res.status, res.body.state]).toEqual([200, 'CANCELADO']);
    expect(res.body.incidences.map((i: { resolved: boolean }) => i.resolved)).toEqual([true]);
  });

  it('409 INVALID_STATE al resolver un plan CANCELADO', async () => {
    const p = await cancelledPlan();
    const res = await resolve(p, yo.token, { newState: 'CONFIRMADO' });
    expect([res.status, res.body.error.code]).toEqual([409, 'INVALID_STATE']);
  });

  it('403 si no la creé; 400 con un estado inválido; 409 si no está confirmada', async () => {
    const p = await withIncidence();
    expect((await resolve(p, ana.token, { newState: 'CANCELADO' })).body.error.code).toBe('NOT_CREATOR');
    const invalido = await resolve(p, yo.token, { newState: 'EN_RECOORDINACION' });
    expect(invalido.body.error.details).toContainEqual(
      expect.objectContaining({ path: ['newState'], message: 'Estado inválido: CONFIRMADO, CANCELADO o PROPUESTO' }),
    );
    const enVotacion = await threeWindows();
    expect((await resolve(enVotacion, yo.token, { newState: 'CANCELADO' })).body.error.code).toBe('INVALID_STATE');
  });
});
