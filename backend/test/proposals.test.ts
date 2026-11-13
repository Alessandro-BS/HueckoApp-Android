import type { Group, Proposal, User } from '@hueckoapp/shared';
import type { Express } from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';

import type { Db } from '../src/db/db';
import {
  addWeeklyBlock,
  AFTER_DEADLINE,
  bearer,
  createProposal,
  DEADLINE,
  interleave,
  makeClock,
  makeTestApp,
  NEXT_WEEK,
  NOW,
  registerUser,
  setupSeedGroup,
  unvoteFor,
  voteFor,
  win,
  windowOf,
} from './helpers';

let app: Express;
let db: Db;
let clock: ReturnType<typeof makeClock>;
let yo: { token: string; user: User };
let ana: { token: string; user: User };
let group: Group;

beforeEach(async () => {
  clock = makeClock(NOW);
  ({ app, db } = await makeTestApp({ now: clock.now }));
  ({ yo, ana, group } = await setupSeedGroup(app));
});

const post = (body: object, token = yo.token, groupId = group.id) =>
  request(app).post(`/api/groups/${groupId}/proposals`).set(bearer(token)).send({ title: 'Repaso', votingDeadline: DEADLINE, ...body });

// Propuesta de la semilla prop_2, en la semana siguiente: martes 16–18, jueves 10–12 y viernes 16–18.
const prop2 = () =>
  createProposal(app, ana.token, group.id, {
    title: 'Repaso antes de la entrega',
    votingDeadline: DEADLINE,
    windows: [win(2, '16:00', '18:00'), win(4, '10:00', '12:00'), win(5, '16:00', '18:00')],
  });
const counts = (p: Proposal) => p.windows.map((w) => w.voteCount);
// Plazo anterior al jueves 1/10 08:00, la primera de las 3 mejores de esta semana.
const WEDNESDAY_DEADLINE = '2026-09-30T20:00:00.000Z';
const summary = (p: Proposal) => p.windows.map((w) => [w.date, w.dayOfWeek, w.startTime, w.endTime, w.availabilityPercentage]);

describe('POST /api/groups/:id/proposals', () => {
  it('con franjas: 201, PROPUESTO, % calculado por el servidor y franjas por fecha y hora', async () => {
    const res = await post({
      title: '  Repaso antes de la entrega ',
      location: { name: '  Google Meet ' },
      windows: [win(5, '16:00', '18:00'), win(2, '16:00', '18:00'), win(1, '10:00', '12:00')],
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
        { id: expect.any(String), date: '2026-10-05', dayOfWeek: 1, startTime: '10:00', endTime: '12:00', availabilityPercentage: 50, voteCount: 0 },
        { id: expect.any(String), date: '2026-10-06', dayOfWeek: 2, startTime: '16:00', endTime: '18:00', availabilityPercentage: 100, voteCount: 0 },
        { id: expect.any(String), date: '2026-10-09', dayOfWeek: 5, startTime: '16:00', endTime: '18:00', availabilityPercentage: 100, voteCount: 0 },
      ],
      myVoteWindowId: null,
      canManage: true,
      chosenWindowId: null,
      scheduledAt: null,
      scheduledDate: null,
      incidences: [],
      createdAt: NOW.toISOString(),
    });
  });

  it('con 2 franjas válidas: 201 y cada franja trae su date y el dayOfWeek de esa fecha', async () => {
    const res = await post({ windows: [win(3, '18:00', '19:00'), { date: '2026-10-14', startTime: '09:00', endTime: '10:00' }] });
    expect(res.status).toBe(201);
    expect(res.body.windows.map((w: Proposal['windows'][number]) => [w.date, w.dayOfWeek])).toEqual([
      ['2026-10-07', 3],
      ['2026-10-14', 3],
    ]);
  });

  it('el % de una franja cuenta los puntuales de su fecha', async () => {
    await request(app)
      .post('/api/me/time-blocks')
      .set(bearer(ana.token))
      .send({ label: 'Cita', type: 'PUNTUAL', startTime: '16:00', endTime: '18:00', isRecurring: false, dayOfWeek: null, date: '2026-10-06' });
    const res = await post({ windows: [win(2, '16:00', '18:00'), { date: '2026-10-13', startTime: '16:00', endTime: '18:00' }] });
    expect(summary(res.body).map((w) => w[4])).toEqual([50, 100]);
  });

  it('una franja de hoy a las 22:00 se acepta (21:30 UTC = 16:30 en Lima)', async () => {
    clock.set(new Date('2026-09-29T21:30:00Z'));
    const res = await post({
      votingDeadline: '2026-09-29T21:00:00-05:00',
      windows: [{ date: '2026-09-29', startTime: '22:00', endTime: '23:00' }, win(1, '10:00', '11:00')],
    });
    expect(res.status).toBe(201);
    expect(res.body.windows[0]).toMatchObject({ date: '2026-09-29', dayOfWeek: 2, startTime: '22:00' });
  });

  it('a las 20:30 de Lima (ya es el día siguiente en UTC) «hoy» sigue siendo el martes', async () => {
    clock.set(new Date('2026-09-30T01:30:00Z'));
    const res = await post({
      votingDeadline: '2026-09-29T21:00:00-05:00',
      windows: [{ date: '2026-09-29', startTime: '22:00', endTime: '23:00' }, { date: '2026-09-30', startTime: '10:00', endTime: '11:00' }],
    });
    expect(res.status).toBe(201);
    expect(summary(res.body).map((w) => w[0])).toEqual(['2026-09-29', '2026-09-30']);
  });

  it('una franja del lunes estando a jueves: 400 «La franja ya empezó»', async () => {
    clock.set(new Date(2026, 9, 1, 10, 0)); // jueves 1/10, 10:00
    const res = await post({ windows: [{ date: '2026-09-28', startTime: '16:00', endTime: '18:00' }, win(2, '16:00', '18:00')] });
    expect(res.status).toBe(400);
    expect(res.body.error.details).toContainEqual(expect.objectContaining({ path: ['windows', 0, 'startTime'], message: 'La franja ya empezó' }));
  });

  it('sin franjas ni week: las 3 mejores de esta semana, sin las que ya empezaron (C5)', async () => {
    // NOW = martes 10:00: la franja del martes 08:00–20:00 ya empezó y se descarta entera.
    const res = await post({ votingDeadline: WEDNESDAY_DEADLINE });
    expect(res.status).toBe(201);
    expect(summary(res.body)).toEqual([
      ['2026-10-01', 4, '08:00', '20:00', 100],
      ['2026-10-03', 6, '08:00', '20:00', 100],
      ['2026-10-04', 7, '08:00', '20:00', 100],
    ]);
  });

  it('sin franjas con week: elige hasta 3 de esa semana', async () => {
    const res = await post({ week: '2026-10-08' }); // cualquier día: se normaliza a su lunes (5/10)
    expect(res.status).toBe(201);
    expect(summary(res.body)).toEqual([
      ['2026-10-06', 2, '08:00', '20:00', 100],
      ['2026-10-08', 4, '08:00', '20:00', 100],
      ['2026-10-10', 6, '08:00', '20:00', 100],
    ]);
  });

  it('sin franjas, el plazo también tiene que cerrar antes de la primera elegida', async () => {
    const res = await post({}); // DEADLINE (sábado 3/10) es posterior al jueves 1/10 08:00
    expect(res.status).toBe(400);
    expect(res.body.error).toMatchObject({ code: 'VALIDATION_ERROR', message: 'La votación debe cerrar antes de la primera franja' });
  });

  it('sin franjas y con un solo hueco en común en la semana: 409 NO_COMMON_WINDOWS', async () => {
    for (let day = 1; day <= 6; day++) await addWeeklyBlock(app, yo.token, day, '08:00', '20:00');
    const res = await post({ week: NEXT_WEEK });
    expect([res.status, res.body.error.code]).toEqual([409, 'NO_COMMON_WINDOWS']);
  });

  it('sin franjas y sin ningún hueco en común: 409 NO_COMMON_WINDOWS y no crea el plan', async () => {
    for (let day = 1; day <= 7; day++) await addWeeklyBlock(app, yo.token, day, '08:00', '20:00');
    const res = await post({ week: NEXT_WEEK });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatchObject({
      code: 'NO_COMMON_WINDOWS',
      message: 'El grupo no tiene huecos en común esta semana: elige las franjas a mano.',
    });
    const list = await request(app).get(`/api/groups/${group.id}/proposals`).set(bearer(yo.token));
    expect(list.body.map((p: Proposal) => p.title)).not.toContain('Repaso');
    // Con franjas elegidas a mano sí se puede crear.
    const manual = await post({ windows: [win(1, '20:00', '22:00'), win(2, '20:00', '22:00')] });
    expect(manual.status).toBe(201);
  });

  it('guarda el lugar con coordenadas y normaliza el plazo a UTC', async () => {
    const res = await post({
      location: { name: 'Biblioteca', latitude: -12.07, longitude: -77.08 },
      votingDeadline: '2026-10-03T20:00:00-05:00',
      week: NEXT_WEEK,
    });
    expect(res.status).toBe(201);
    expect(res.body.location).toEqual({ name: 'Biblioteca', latitude: -12.07, longitude: -77.08 });
    expect(res.body.votingDeadline).toBe('2026-10-04T01:00:00.000Z');
  });

  const two = [win(1, '10:00', '11:00'), win(2, '10:00', '11:00')];
  const six = [1, 2, 3, 4, 5, 6].map((d) => win(d, '10:00', '11:00'));
  it.each([
    [{ title: '   ' }, ['title'], 'El título no puede estar vacío.'],
    [{ votingDeadline: 'mañana' }, ['votingDeadline'], 'Fecha límite inválida (ISO 8601)'],
    [{ votingDeadline: new Date(2026, 8, 29, 9, 0).toISOString() }, ['votingDeadline'], 'La fecha límite debe ser futura'],
    [{ windows: [win(2, '18:00', '16:00'), two[0]] }, ['windows', 0, 'endTime'], 'La hora de fin debe ser posterior a la de inicio'],
    [{ windows: [win(2, '9:00', '11:00'), two[0]] }, ['windows', 0, 'startTime'], 'Formato HH:mm'],
    [{ windows: [{ date: '2026-02-30', startTime: '09:00', endTime: '11:00' }, two[0]] }, ['windows', 0, 'date'], 'Elige una fecha entre esta semana y las próximas 3'],
    [{ windows: [{ date: '6/10/2026', startTime: '09:00', endTime: '11:00' }, two[0]] }, ['windows', 0, 'date'], 'Elige una fecha entre esta semana y las próximas 3'],
    // Las 4 semanas válidas van del lunes 28/09 al domingo 25/10.
    [{ windows: [{ date: '2026-10-26', startTime: '09:00', endTime: '11:00' }, two[0]] }, ['windows', 0, 'date'], 'Elige una fecha entre esta semana y las próximas 3'],
    [{ windows: [{ date: '2026-09-27', startTime: '09:00', endTime: '11:00' }, two[0]] }, ['windows', 0, 'date'], 'Elige una fecha entre esta semana y las próximas 3'],
    [{ windows: [{ dayOfWeek: 2, startTime: '09:00', endTime: '11:00' }, two[0]] }, ['windows', 0, 'date'], 'Elige una fecha entre esta semana y las próximas 3'],
    [{ windows: [two[0]] }, ['windows'], 'Elige entre 2 y 5 franjas'],
    [{ windows: six }, ['windows'], 'Elige entre 2 y 5 franjas'],
    [{ windows: [two[0], two[0]] }, ['windows'], 'Hay franjas repetidas'],
    [{ windows: [win(2, '09:00', '11:00'), win(2, '10:00', '12:00')] }, ['windows'], 'Hay franjas que se solapan el mismo día'],
    [{ windows: [{ date: '2026-09-29', startTime: '16:00', endTime: '18:00' }, two[0]] }, ['votingDeadline'], 'La votación debe cerrar antes de la primera franja'],
    [{ windows: two, votingDeadline: '2026-10-05T10:00:00-05:00' }, ['votingDeadline'], 'La votación debe cerrar antes de la primera franja'],
    [{ week: '2026-10-26' }, ['week'], 'Elige una semana entre esta y las próximas 3'],
    [{ location: { name: 'Biblioteca', latitude: 10 } }, ['location', 'latitude'], 'Envía latitud y longitud juntas'],
    [{ location: { name: '  ' } }, ['location', 'name'], 'El lugar necesita un nombre'],
  ])('valida %j → 400 en %j', async (body, path, message) => {
    const res = await post(body);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details).toContainEqual(expect.objectContaining({ path, message }));
  });

  it('franjas que solo se tocan (una acaba cuando empieza la otra) no se solapan', async () => {
    const res = await post({ windows: [win(2, '09:00', '11:00'), win(2, '11:00', '12:00')] });
    expect(res.status).toBe(201);
  });

  it('403 si no soy miembro; 404 si el grupo no existe', async () => {
    const otra = await registerUser(app);
    expect((await post({ week: NEXT_WEEK }, otra.token)).body.error.code).toBe('NOT_A_MEMBER');
    expect((await post({ week: NEXT_WEEK }, yo.token, 'no-existe')).status).toBe(404);
  });

  it('el grupo desaparece mientras se crea (su último miembro se fue): 404 GROUP_NOT_FOUND, no un 500, y nada a medias', async () => {
    interleave(db, /^INSERT INTO proposals/, 'DELETE FROM groups WHERE id = $1', [group.id]);
    const res = await post({ windows: [win(2, '16:00', '18:00'), win(3, '16:00', '18:00')] });
    expect(res.status).toBe(404);
    expect(res.body.error).toMatchObject({ code: 'GROUP_NOT_FOUND', message: 'Grupo no encontrado.' });
    expect(await db.one('SELECT COUNT(*) AS n FROM proposal_windows')).toEqual({ n: 0 });
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
    expect((await request(app).get(`/api/proposals/${p.id}`).set(bearer(yo.token))).body).toEqual({ ...p, canManage: false });
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

  it('201 con el % del servidor, ordenada por fecha y hora', async () => {
    const p = await prop2();
    const res = await addWindow(p.id, win(3, '14:30', '15:30'));
    expect(res.status).toBe(201);
    expect(res.body.windows.map((w: Proposal['windows'][number]) => [w.date, w.startTime, w.availabilityPercentage])).toEqual([
      ['2026-10-06', '16:00', 100],
      ['2026-10-07', '14:30', 0],
      ['2026-10-08', '10:00', 100],
      ['2026-10-09', '16:00', 100],
    ]);
  });

  it('409 WINDOW_EXISTS si ya está (misma fecha y horas); la misma hora otro día sí vale', async () => {
    const p = await prop2();
    const repetida = await addWindow(p.id, win(2, '16:00', '18:00'));
    expect([repetida.status, repetida.body.error.code, repetida.body.error.message]).toEqual([409, 'WINDOW_EXISTS', 'Esa franja ya está propuesta.']);
    expect((await addWindow(p.id, { date: '2026-10-13', startTime: '16:00', endTime: '18:00' })).status).toBe(201);
  });

  it.each([
    [win(2, '18:00', '17:00'), ['endTime'], 'La hora de fin debe ser posterior a la de inicio'],
    [{ date: '2026-10-26', startTime: '10:00', endTime: '11:00' }, ['date'], 'Elige una fecha entre esta semana y las próximas 3'],
    [{ date: '2026-09-29', startTime: '09:00', endTime: '11:00' }, ['startTime'], 'La franja ya empezó'],
    [win(2, '17:00', '19:00'), ['startTime'], 'Hay franjas que se solapan el mismo día'],
    // DEADLINE = sábado 3/10 20:00: una franja del viernes 2/10 empieza antes de que cierre la votación.
    [{ date: '2026-10-02', startTime: '10:00', endTime: '11:00' }, ['startTime'], 'La franja debe empezar después del cierre de la votación'],
    [{ date: '2026-10-03', startTime: '20:00', endTime: '21:00' }, ['startTime'], 'La franja debe empezar después del cierre de la votación'],
  ])('400 con %j', async (body, path, message) => {
    const p = await prop2();
    const res = await addWindow(p.id, body);
    expect([res.status, res.body.error.code]).toEqual([400, 'VALIDATION_ERROR']);
    expect(res.body.error.details).toContainEqual(expect.objectContaining({ path, message }));
  });

  it('una franja que empieza justo después del plazo sí vale', async () => {
    const p = await prop2();
    expect((await addWindow(p.id, { date: '2026-10-03', startTime: '21:00', endTime: '22:00' })).status).toBe(201);
  });

  it('añadir la sexta: 400 «Máximo 5 franjas»', async () => {
    const p = await prop2();
    expect((await addWindow(p.id, win(6, '10:00', '11:00'))).status).toBe(201);
    expect((await addWindow(p.id, win(7, '10:00', '11:00'))).status).toBe(201);
    const sexta = await addWindow(p.id, win(1, '10:00', '11:00'));
    expect([sexta.status, sexta.body.error.code, sexta.body.error.message]).toEqual([400, 'VALIDATION_ERROR', 'Máximo 5 franjas']);
  });

  it('409 VOTING_CLOSED si la votación cerró', async () => {
    const p = await prop2();
    clock.set(AFTER_DEADLINE);
    expect((await addWindow(p.id, win(6, '10:00', '11:00'))).body.error.code).toBe('VOTING_CLOSED');
  });

  it('403 a quien no es miembro; 404 PROPOSAL_NOT_FOUND si la propuesta no existe', async () => {
    const p = await prop2();
    const otra = await registerUser(app);
    const ajena = await addWindow(p.id, win(6, '10:00', '11:00'), otra.token);
    expect([ajena.status, ajena.body.error.code]).toEqual([403, 'NOT_A_MEMBER']);
    const nada = await addWindow('no-existe', win(6, '10:00', '11:00'));
    expect([nada.status, nada.body.error.code]).toEqual([404, 'PROPOSAL_NOT_FOUND']);
  });
});
