import type { Group, Proposal, User } from '@hueckoapp/shared';
import type { Express } from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  addWeeklyBlock,
  AFTER_DEADLINE,
  bearer,
  createProposal,
  DEADLINE,
  makeClock,
  makeTestApp,
  NOW,
  registerUser,
  setupSeedGroup,
  unvoteFor,
  voteFor,
  windowOf,
} from './helpers';

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

const post = (body: object, token = yo.token, groupId = group.id) =>
  request(app).post(`/api/groups/${groupId}/proposals`).set(bearer(token)).send({ title: 'Repaso', votingDeadline: DEADLINE, ...body });

// Propuesta de la semilla prop_2: martes 16–18, jueves 10–12 y viernes 16–18.
const prop2 = () =>
  createProposal(app, ana.token, group.id, {
    title: 'Repaso antes de la entrega',
    votingDeadline: DEADLINE,
    windows: [
      { dayOfWeek: 2, startTime: '16:00', endTime: '18:00' },
      { dayOfWeek: 4, startTime: '10:00', endTime: '12:00' },
      { dayOfWeek: 5, startTime: '16:00', endTime: '18:00' },
    ],
  });
const counts = (p: Proposal) => p.windows.map((w) => w.voteCount);

describe('POST /api/groups/:id/proposals', () => {
  it('con franjas: 201, PROPUESTO, % calculado por el servidor y franjas por día y hora', async () => {
    const res = await post({
      title: '  Repaso antes de la entrega ',
      location: { name: '  Google Meet ' },
      windows: [
        { dayOfWeek: 5, startTime: '16:00', endTime: '18:00' },
        { dayOfWeek: 2, startTime: '16:00', endTime: '18:00' },
        { dayOfWeek: 1, startTime: '10:00', endTime: '12:00' },
      ],
    });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      id: expect.any(String),
      groupId: group.id,
      title: 'Repaso antes de la entrega',
      location: { name: 'Google Meet', latitude: null, longitude: null },
      createdBy: yo.user,
      votingDeadline: DEADLINE,
      state: 'PROPUESTO',
      windows: [
        { id: expect.any(String), dayOfWeek: 1, startTime: '10:00', endTime: '12:00', availabilityPercentage: 50, voteCount: 0 },
        { id: expect.any(String), dayOfWeek: 2, startTime: '16:00', endTime: '18:00', availabilityPercentage: 100, voteCount: 0 },
        { id: expect.any(String), dayOfWeek: 5, startTime: '16:00', endTime: '18:00', availabilityPercentage: 100, voteCount: 0 },
      ],
      myVoteWindowId: null,
      chosenWindowId: null,
      scheduledAt: null,
      scheduledDate: null,
      incidences: [],
      createdAt: NOW.toISOString(),
    });
  });

  it('sin franjas: propone las 3 mejores del cruce del grupo (C5)', async () => {
    const res = await post({});
    expect(res.status).toBe(201);
    expect(res.body.windows.map((w: Proposal['windows'][number]) => [w.dayOfWeek, w.startTime, w.endTime, w.availabilityPercentage])).toEqual([
      [2, '08:00', '20:00', 100],
      [4, '08:00', '20:00', 100],
      [6, '08:00', '20:00', 100],
    ]);
  });

  it('sin franjas y sin ningún hueco en común: 409 NO_COMMON_WINDOWS y no crea el plan', async () => {
    for (let day = 1; day <= 7; day++) await addWeeklyBlock(app, yo.token, day, '08:00', '20:00');
    const res = await post({});
    expect(res.status).toBe(409);
    expect(res.body.error).toMatchObject({
      code: 'NO_COMMON_WINDOWS',
      message: 'El grupo no tiene huecos en común esta semana: elige las franjas a mano.',
    });
    const list = await request(app).get(`/api/groups/${group.id}/proposals`).set(bearer(yo.token));
    expect(list.body.map((p: Proposal) => p.title)).not.toContain('Repaso');
    // Con franjas elegidas a mano sí se puede crear.
    const manual = await post({ windows: [{ dayOfWeek: 1, startTime: '20:00', endTime: '22:00' }] });
    expect(manual.status).toBe(201);
  });

  it('guarda el lugar con coordenadas y normaliza el plazo a UTC', async () => {
    const res = await post({
      location: { name: 'Biblioteca', latitude: -12.07, longitude: -77.08 },
      votingDeadline: '2026-10-03T20:00:00-05:00',
    });
    expect(res.status).toBe(201);
    expect(res.body.location).toEqual({ name: 'Biblioteca', latitude: -12.07, longitude: -77.08 });
    expect(res.body.votingDeadline).toBe('2026-10-04T01:00:00.000Z');
  });

  it.each([
    [{ title: '   ' }, ['title'], 'El título no puede estar vacío.'],
    [{ votingDeadline: 'mañana' }, ['votingDeadline'], 'Fecha límite inválida (ISO 8601)'],
    [{ votingDeadline: new Date(2026, 8, 29, 9, 0).toISOString() }, ['votingDeadline'], 'La fecha límite debe ser futura'],
    [{ windows: [{ dayOfWeek: 2, startTime: '18:00', endTime: '16:00' }] }, ['windows', 0, 'endTime'], 'La hora de fin debe ser posterior a la de inicio'],
    [{ windows: [{ dayOfWeek: 2, startTime: '9:00', endTime: '11:00' }] }, ['windows', 0, 'startTime'], 'Formato HH:mm'],
    [{ windows: [{ dayOfWeek: 8, startTime: '09:00', endTime: '11:00' }] }, ['windows', 0, 'dayOfWeek'], 'Día inválido'],
    [
      { windows: [{ dayOfWeek: 2, startTime: '09:00', endTime: '11:00' }, { dayOfWeek: 2, startTime: '09:00', endTime: '11:00' }] },
      ['windows'],
      'Hay franjas repetidas',
    ],
    [{ location: { name: 'Biblioteca', latitude: 10 } }, ['location', 'latitude'], 'Envía latitud y longitud juntas'],
    [{ location: { name: '  ' } }, ['location', 'name'], 'El lugar necesita un nombre'],
  ])('valida %j → 400 en %j', async (body, path, message) => {
    const res = await post(body);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details).toContainEqual(expect.objectContaining({ path, message }));
  });

  it('403 si no soy miembro; 404 si el grupo no existe', async () => {
    const otra = await registerUser(app);
    expect((await post({}, otra.token)).body.error.code).toBe('NOT_A_MEMBER');
    expect((await post({}, yo.token, 'no-existe')).status).toBe(404);
  });
});

describe('GET /api/groups/:id/proposals', () => {
  it('las más recientes primero (C10)', async () => {
    const primera = await createProposal(app, yo.token, group.id, { title: 'Primera', votingDeadline: DEADLINE });
    clock.set(new Date(2026, 8, 29, 10, 5));
    const segunda = await createProposal(app, ana.token, group.id, { title: 'Segunda', votingDeadline: DEADLINE });
    const res = await request(app).get(`/api/groups/${group.id}/proposals`).set(bearer(yo.token));
    expect(res.status).toBe(200);
    expect(res.body.map((p: Proposal) => p.id)).toEqual([segunda.id, primera.id]);
  });

  it('a igual createdAt, la última creada va primero', async () => {
    const a = await createProposal(app, yo.token, group.id, { title: 'A', votingDeadline: DEADLINE });
    const b = await createProposal(app, yo.token, group.id, { title: 'B', votingDeadline: DEADLINE });
    const res = await request(app).get(`/api/groups/${group.id}/proposals`).set(bearer(yo.token));
    expect(res.body.map((p: Proposal) => p.id)).toEqual([b.id, a.id]);
  });

  it('403 a quien no es miembro', async () => {
    const otra = await registerUser(app);
    expect((await request(app).get(`/api/groups/${group.id}/proposals`).set(bearer(otra.token))).status).toBe(403);
  });
});

describe('GET /api/proposals/:id', () => {
  it('200 a un miembro, 403 a quien no lo es, 404 si no existe', async () => {
    const p = await prop2();
    expect((await request(app).get(`/api/proposals/${p.id}`).set(bearer(yo.token))).body).toEqual(p);
    const otra = await registerUser(app);
    const ajena = await request(app).get(`/api/proposals/${p.id}`).set(bearer(otra.token));
    expect([ajena.status, ajena.body.error.code]).toEqual([403, 'NOT_A_MEMBER']);
    const nada = await request(app).get('/api/proposals/no-existe').set(bearer(yo.token));
    expect([nada.status, nada.body.error.code]).toEqual([404, 'PROPOSAL_NOT_FOUND']);
  });
});

describe('PUT/DELETE /api/proposals/:id/vote', () => {
  it('votar, mover el voto y repetir la misma franja sin cambios (G1)', async () => {
    const p = await prop2();
    const martes = windowOf(p, 2).id;
    const jueves = windowOf(p, 4).id;

    const deAna = await voteFor(app, p.id, martes, ana.token);
    expect(deAna.status).toBe(200);
    expect(deAna.body.myVoteWindowId).toBe(martes);
    expect(counts(deAna.body)).toEqual([1, 0, 0]);

    await voteFor(app, p.id, jueves, yo.token);
    const movido = await voteFor(app, p.id, martes, yo.token);
    expect(movido.body.myVoteWindowId).toBe(martes);
    expect(counts(movido.body)).toEqual([2, 0, 0]);

    const repetido = await voteFor(app, p.id, martes, yo.token);
    expect(repetido.status).toBe(200);
    expect(counts(repetido.body)).toEqual([2, 0, 0]);
  });

  it('DELETE retira mi voto y no falla si no había', async () => {
    const p = await prop2();
    await voteFor(app, p.id, windowOf(p, 2).id, yo.token);
    const res = await unvoteFor(app, p.id, yo.token);
    expect(res.status).toBe(200);
    expect(res.body.myVoteWindowId).toBeNull();
    expect(counts(res.body)).toEqual([0, 0, 0]);
    expect((await unvoteFor(app, p.id, yo.token)).status).toBe(200);
  });

  it('409 VOTING_CLOSED al pasar el plazo (C1), también para retirar', async () => {
    const p = await prop2();
    await voteFor(app, p.id, windowOf(p, 2).id, yo.token);
    clock.set(AFTER_DEADLINE);
    const res = await voteFor(app, p.id, windowOf(p, 4).id, yo.token);
    expect([res.status, res.body.error.code, res.body.error.message]).toEqual([409, 'VOTING_CLOSED', 'La votación ya cerró.']);
    expect((await unvoteFor(app, p.id, yo.token)).body.error.code).toBe('VOTING_CLOSED');
  });

  it('justo en el plazo la votación ya está cerrada: 409 VOTING_CLOSED', async () => {
    const p = await prop2();
    clock.set(new Date(DEADLINE));
    const res = await voteFor(app, p.id, windowOf(p, 2).id, yo.token);
    expect([res.status, res.body.error.code]).toEqual([409, 'VOTING_CLOSED']);
  });

  it('404 WINDOW_NOT_FOUND con una franja de otra propuesta; 400 sin windowId', async () => {
    const p = await prop2();
    const otra = await createProposal(app, yo.token, group.id, { votingDeadline: DEADLINE });
    const res = await voteFor(app, p.id, otra.windows[0].id, yo.token);
    expect([res.status, res.body.error.code]).toEqual([404, 'WINDOW_NOT_FOUND']);
    const sinId = await request(app).put(`/api/proposals/${p.id}/vote`).set(bearer(yo.token)).send({});
    expect(sinId.status).toBe(400);
  });

  it('403 a quien no es miembro', async () => {
    const p = await prop2();
    const otra = await registerUser(app);
    expect((await voteFor(app, p.id, windowOf(p, 2).id, otra.token)).status).toBe(403);
    expect((await unvoteFor(app, p.id, otra.token)).status).toBe(403);
  });
});

describe('POST /api/proposals/:id/windows (G2)', () => {
  const addWindow = (id: string, body: object, token = ana.token) =>
    request(app).post(`/api/proposals/${id}/windows`).set(bearer(token)).send(body);

  it('201 con el % del servidor, ordenada por día y hora', async () => {
    const p = await prop2();
    const res = await addWindow(p.id, { dayOfWeek: 3, startTime: '14:30', endTime: '15:30' });
    expect(res.status).toBe(201);
    expect(res.body.windows.map((w: Proposal['windows'][number]) => [w.dayOfWeek, w.startTime, w.availabilityPercentage])).toEqual([
      [2, '16:00', 100],
      [3, '14:30', 0],
      [4, '10:00', 100],
      [5, '16:00', 100],
    ]);
  });

  it('409 WINDOW_EXISTS si ya está; 400 si el fin no es posterior; 409 si la votación cerró', async () => {
    const p = await prop2();
    const repetida = await addWindow(p.id, { dayOfWeek: 2, startTime: '16:00', endTime: '18:00' });
    expect([repetida.status, repetida.body.error.code, repetida.body.error.message]).toEqual([409, 'WINDOW_EXISTS', 'Esa franja ya está propuesta.']);
    const alReves = await addWindow(p.id, { dayOfWeek: 2, startTime: '18:00', endTime: '17:00' });
    expect(alReves.body.error.details).toContainEqual(expect.objectContaining({ path: ['endTime'] }));
    clock.set(AFTER_DEADLINE);
    expect((await addWindow(p.id, { dayOfWeek: 6, startTime: '10:00', endTime: '11:00' })).body.error.code).toBe('VOTING_CLOSED');
  });

  it('403 a quien no es miembro; 404 PROPOSAL_NOT_FOUND si la propuesta no existe', async () => {
    const p = await prop2();
    const otra = await registerUser(app);
    const ajena = await addWindow(p.id, { dayOfWeek: 6, startTime: '10:00', endTime: '11:00' }, otra.token);
    expect([ajena.status, ajena.body.error.code]).toEqual([403, 'NOT_A_MEMBER']);
    const nada = await addWindow('no-existe', { dayOfWeek: 6, startTime: '10:00', endTime: '11:00' });
    expect([nada.status, nada.body.error.code]).toEqual([404, 'PROPOSAL_NOT_FOUND']);
  });
});
