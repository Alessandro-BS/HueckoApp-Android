import type { Group, Proposal, User } from '@hueckoapp/shared';
import type { Express } from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Db, SqlParam } from '../src/db/db';
import { closeDueProposals, closeProposalIfDue } from '../src/proposals/voting-close';
import { registerAdmin } from './admin-fixtures';
import {
  AFTER_DEADLINE,
  bearer,
  createProposal,
  DEADLINE,
  interleave,
  joinGroup,
  makeClock,
  makeTestApp,
  NOW,
  registerUser,
  setupSeedGroup,
  voteFor,
  win,
  windowOf,
} from './helpers';

// Cierre automático de la votación de franjas (fase 4, regla 1): al vencer el plazo, la propuesta PROPUESTO se confirma
// con la más votada (votos → % → más temprana) o se cancela si nadie (de los que siguen en el grupo) votó.

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

// Con los horarios de la semilla: lunes 10–12 → 50 % (Ana tiene clase), martes 16–18 y jueves 10–12 → 100 %.
const plan = (windows = [win(2, '16:00', '18:00'), win(4, '10:00', '12:00')]): Promise<Proposal> =>
  createProposal(app, yo.token, group.id, { votingDeadline: DEADLINE, windows });
const vote = (p: Proposal, dayOfWeek: number, token: string) => voteFor(app, p.id, windowOf(p, dayOfWeek).id, token);
const get = (p: Proposal, token = yo.token) => request(app).get(`/api/proposals/${p.id}`).set(bearer(token));
const postTo = (p: Proposal, action: string, token = yo.token, body: object = {}) =>
  request(app).post(`/api/proposals/${p.id}/${action}`).set(bearer(token)).send(body);
const stored = (p: Proposal) =>
  db.one('SELECT state, chosen_window_id, scheduled_at, scheduled_date, auto_closed FROM proposals WHERE id = $1', [p.id]);

describe('cierre automático al vencer el plazo', () => {
  it('gana la más votada: CONFIRMADO, autoClosed y la fecha de esa franja', async () => {
    const p = await plan();
    await vote(p, 4, yo.token);
    await vote(p, 4, ana.token);
    await vote(p, 2, ana.token);
    clock.set(AFTER_DEADLINE);
    const res = await get(p);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      state: 'CONFIRMADO',
      chosenWindowId: windowOf(p, 4).id,
      autoClosed: true,
      scheduledAt: new Date(2026, 9, 8, 10, 0).toISOString(),
      scheduledDate: '2026-10-08',
    });
  });

  it('empate en votos: gana la de mayor % de disponibilidad aunque sea más tarde', async () => {
    const p = await plan([win(1, '10:00', '12:00'), win(2, '16:00', '18:00')]);
    expect(p.windows.map((w) => w.availabilityPercentage)).toEqual([50, 100]);
    await vote(p, 1, yo.token);
    await vote(p, 2, ana.token);
    clock.set(AFTER_DEADLINE);
    expect((await get(p)).body).toMatchObject({ state: 'CONFIRMADO', chosenWindowId: windowOf(p, 2).id, autoClosed: true });
  });

  it('empate total (votos y %): gana la más temprana', async () => {
    const p = await plan([win(4, '10:00', '12:00'), win(2, '16:00', '18:00')]);
    expect(p.windows.map((w) => w.availabilityPercentage)).toEqual([100, 100]);
    await vote(p, 4, yo.token);
    await vote(p, 2, ana.token);
    clock.set(AFTER_DEADLINE);
    expect((await get(p)).body).toMatchObject({ state: 'CONFIRMADO', chosenWindowId: windowOf(p, 2).id, scheduledDate: '2026-10-06' });
  });

  it('sin votos: CANCELADO con autoClosed', async () => {
    const p = await plan();
    clock.set(AFTER_DEADLINE);
    expect((await get(p)).body).toMatchObject({ state: 'CANCELADO', autoClosed: true, chosenWindowId: null, scheduledAt: null });
  });

  it('solo votó alguien que ya salió del grupo: CANCELADO', async () => {
    const p = await plan();
    const luis = await registerUser(app, { name: 'Luis' });
    await joinGroup(app, luis.token, group.inviteCode);
    expect((await vote(p, 2, luis.token)).status).toBe(200);
    await request(app).delete(`/api/groups/${group.id}/members/me`).set(bearer(luis.token)).expect(204);
    clock.set(AFTER_DEADLINE);
    expect((await get(p)).body).toMatchObject({ state: 'CANCELADO', autoClosed: true });
  });

  it('antes del plazo no cambia nada', async () => {
    const p = await plan();
    await vote(p, 2, ana.token);
    clock.set(new Date(new Date(DEADLINE).getTime() - 60_000));
    expect((await get(p)).body).toMatchObject({ state: 'PROPUESTO', autoClosed: false, chosenWindowId: null });
  });

  it('justo en el plazo ya cierra', async () => {
    const p = await plan();
    await vote(p, 2, ana.token);
    clock.set(new Date(DEADLINE));
    expect((await get(p)).body).toMatchObject({ state: 'CONFIRMADO', autoClosed: true });
  });

  it('la franja ganadora ya empezó cuando alguien mira (días después): igual CONFIRMADO', async () => {
    const p = await plan();
    await vote(p, 2, ana.token);
    clock.set(new Date(2026, 9, 20, 9, 0)); // 20/10: la franja del martes 6/10 pasó hace dos semanas
    expect((await get(p)).body).toMatchObject({ state: 'CONFIRMADO', chosenWindowId: windowOf(p, 2).id, scheduledDate: '2026-10-06', autoClosed: true });
  });

  it('se aplica una sola vez: una segunda lectura no cambia nada', async () => {
    const p = await plan();
    await vote(p, 2, ana.token);
    clock.set(AFTER_DEADLINE);
    const first = (await get(p)).body;
    expect(await closeProposalIfDue(db, p.id, AFTER_DEADLINE)).toBe(false);
    expect((await get(p, ana.token)).body).toMatchObject({ state: first.state, chosenWindowId: first.chosenWindowId, autoClosed: true });
  });
});

describe('el cierre llega por cada lectura', () => {
  let p: Proposal;
  beforeEach(async () => {
    p = await plan();
    await vote(p, 2, ana.token);
    clock.set(AFTER_DEADLINE);
  });
  const expectClosed = async () =>
    expect(await stored(p)).toMatchObject({ state: 'CONFIRMADO', chosen_window_id: windowOf(p, 2).id, auto_closed: true });

  it('GET /groups/:id/proposals', async () => {
    const res = await request(app).get(`/api/groups/${group.id}/proposals`).set(bearer(ana.token));
    expect(res.body[0]).toMatchObject({ id: p.id, state: 'CONFIRMADO', autoClosed: true });
  });

  it('GET /me/dashboard', async () => {
    expect((await request(app).get('/api/me/dashboard').set(bearer(ana.token))).status).toBe(200);
    await expectClosed();
  });

  it('GET /me/upcoming-plans', async () => {
    const res = await request(app).get('/api/me/upcoming-plans').set(bearer(ana.token));
    expect(res.body.map((x: Proposal) => [x.id, x.state])).toEqual([[p.id, 'CONFIRMADO']]);
  });

  it('GET /admin/groups/:id', async () => {
    const admin = await registerAdmin(app, db);
    const res = await request(app).get(`/api/admin/groups/${group.id}`).set(bearer(admin.token));
    expect(res.body.proposals[0]).toMatchObject({ id: p.id, state: 'CONFIRMADO' });
  });

  it('GET /admin/stats', async () => {
    const admin = await registerAdmin(app, db);
    const res = await request(app).get('/api/admin/stats').set(bearer(admin.token));
    expect(res.body.proposals).toMatchObject({ PROPUESTO: 0, CONFIRMADO: 1 });
  });

  it('GET /admin/reports (proposalsByState)', async () => {
    const admin = await registerAdmin(app, db);
    const res = await request(app).get('/api/admin/reports').query({ from: '2026-09-28', to: '2026-10-04' }).set(bearer(admin.token));
    expect(res.body.proposalsByState).toMatchObject({ PROPUESTO: 0, CONFIRMADO: 1 });
  });

  it('GET /admin/stats/timeseries', async () => {
    const admin = await registerAdmin(app, db);
    await request(app).get('/api/admin/stats/timeseries').query({ from: '2026-09-28', to: '2026-10-04' }).set(bearer(admin.token)).expect(200);
    await expectClosed();
  });
});

describe('popular-hours cierra antes de calcular', () => {
  it('cuenta la hora del plan que se acaba de confirmar solo', async () => {
    const p = await plan();
    await vote(p, 4, ana.token);
    clock.set(AFTER_DEADLINE);
    const admin = await registerAdmin(app, db);
    const res = await request(app).get('/api/admin/stats/popular-hours').set(bearer(admin.token));
    expect(res.body.hours.filter((h: { count: number }) => h.count > 0)).toEqual([{ hour: 10, count: 1 }]);
    expect(await stored(p)).toMatchObject({ state: 'CONFIRMADO', auto_closed: true });
  });
});

describe('cancelar desde la administración tras el plazo (sin que nadie la haya consultado antes)', () => {
  const adminCancel = (p: Proposal, token: string) =>
    request(app).post(`/api/admin/proposals/${p.id}/cancel`).set(bearer(token)).send({ reason: 'Spam' });

  it('con votos: primero se confirma sola y después se cancela; CANCELADO con autoClosed false y anotado desde CONFIRMADO', async () => {
    const p = await plan();
    await vote(p, 2, ana.token);
    clock.set(AFTER_DEADLINE);
    const admin = await registerAdmin(app, db);
    const res = await adminCancel(p, admin.token);
    expect([res.status, res.body.state]).toEqual([200, 'CANCELADO']);
    expect(await stored(p)).toMatchObject({ state: 'CANCELADO', chosen_window_id: windowOf(p, 2).id, auto_closed: false });
    const audit = await request(app).get('/api/admin/audit').set(bearer(admin.token));
    expect(audit.body.items[0]).toMatchObject({
      action: 'PROPOSAL_CANCELLED',
      targetId: p.id,
      details: { title: 'Plan', groupId: group.id, from: 'CONFIRMADO', reason: 'Spam' },
    });
  });

  it('sin votos: ya se canceló sola al cerrarse → 409 «ya está cancelada», sigue con autoClosed y no se anota', async () => {
    const p = await plan();
    clock.set(AFTER_DEADLINE);
    const admin = await registerAdmin(app, db);
    const res = await adminCancel(p, admin.token);
    expect([res.status, res.body.error?.code]).toEqual([409, 'INVALID_STATE']);
    expect(await stored(p)).toMatchObject({ state: 'CANCELADO', auto_closed: true });
    expect((await request(app).get('/api/admin/audit').set(bearer(admin.token))).body.items).toEqual([]);
  });
});

describe('acciones tras el plazo', () => {
  it('votar → 409 VOTING_CLOSED; confirmar → 409 INVALID_STATE (ya se cerró sola)', async () => {
    const p = await plan();
    await vote(p, 2, ana.token);
    clock.set(AFTER_DEADLINE);
    const votar = await vote(p, 4, yo.token);
    expect([votar.status, votar.body.error.code]).toEqual([409, 'VOTING_CLOSED']);
    const confirmar = await postTo(p, 'confirm', yo.token, { windowId: windowOf(p, 4).id });
    expect([confirmar.status, confirmar.body.error.code]).toEqual([409, 'INVALID_STATE']);
    expect(await stored(p)).toMatchObject({ state: 'CONFIRMADO', chosen_window_id: windowOf(p, 2).id, auto_closed: true });
  });

  it('si el cierre falla, la petición sigue: GET responde PROPUESTO, y votar o confirmar tras el plazo igual → 409', async () => {
    const p = await plan();
    await vote(p, 2, ana.token);
    clock.set(AFTER_DEADLINE);
    const original = db.query.bind(db);
    vi.spyOn(db, 'query').mockImplementation((async (sql: string, params?: readonly SqlParam[]) => {
      if (/^SELECT state, voting_deadline, group_id FROM proposals/.test(sql)) throw new Error('fallo simulado');
      return original(sql, params);
    }) as Db['query']);
    expect((await get(p)).body).toMatchObject({ state: 'PROPUESTO', autoClosed: false });
    expect((await vote(p, 4, yo.token)).body.error.code).toBe('VOTING_CLOSED');
    const confirmar = await postTo(p, 'confirm', yo.token, { windowId: windowOf(p, 4).id });
    expect([confirmar.status, confirmar.body.error?.code]).toEqual([409, 'INVALID_STATE']);
    expect(await stored(p)).toMatchObject({ state: 'PROPUESTO', auto_closed: false });
  });

  it('quitar el voto y añadir franja → 409 VOTING_CLOSED', async () => {
    const p = await plan();
    await vote(p, 2, ana.token);
    clock.set(AFTER_DEADLINE);
    const quitar = await request(app).delete(`/api/proposals/${p.id}/vote`).set(bearer(ana.token));
    expect([quitar.status, quitar.body.error.code]).toEqual([409, 'VOTING_CLOSED']);
    const franja = await postTo(p, 'windows', yo.token, { date: '2026-10-09', startTime: '16:00', endTime: '18:00' });
    expect([franja.status, franja.body.error.code]).toEqual([409, 'VOTING_CLOSED']);
    expect(await db.one('SELECT COUNT(*) AS n FROM votes WHERE proposal_id = $1', [p.id])).toEqual({ n: 1 });
  });

  it('confirmar a mano antes del plazo: CONFIRMADO con autoClosed false, y el cierre ya no lo toca', async () => {
    const p = await plan();
    await vote(p, 2, ana.token);
    const res = await postTo(p, 'confirm', yo.token, { windowId: windowOf(p, 4).id });
    expect(res.body).toMatchObject({ state: 'CONFIRMADO', chosenWindowId: windowOf(p, 4).id, autoClosed: false });
    clock.set(AFTER_DEADLINE);
    expect((await get(p)).body).toMatchObject({ state: 'CONFIRMADO', chosenWindowId: windowOf(p, 4).id, autoClosed: false });
  });

  it('una votación exprés que cancela un plan que se confirmó solo lo deja con autoClosed false', async () => {
    const p = await plan();
    await vote(p, 2, ana.token);
    clock.set(AFTER_DEADLINE);
    await request(app).patch(`/api/groups/${group.id}/members/${ana.user.id}`).set(bearer(yo.token)).send({ isEssential: true }).expect(200);
    const falta = await postTo(p, 'incidences', ana.token, { type: 'FALTA', reason: 'Viaje familiar' });
    expect([falta.status, falta.body.state, falta.body.expressVote?.status]).toEqual([201, 'CONFIRMADO', 'ABIERTA']);
    const res = await request(app).put(`/api/proposals/${p.id}/express-vote`).set(bearer(yo.token)).send({ option: 'CANCELAR' });
    expect([res.status, res.body.state, res.body.autoClosed]).toEqual([200, 'CANCELADO', false]);
  });

  it('una votación exprés que reagenda un plan que se confirmó solo: EN_RECOORDINACION con autoClosed false', async () => {
    const p = await plan();
    await vote(p, 2, ana.token);
    clock.set(AFTER_DEADLINE);
    await request(app).patch(`/api/groups/${group.id}/members/${ana.user.id}`).set(bearer(yo.token)).send({ isEssential: true }).expect(200);
    expect((await postTo(p, 'incidences', ana.token, { type: 'FALTA', reason: 'Viaje familiar' })).body.autoClosed).toBe(true);
    const res = await request(app).put(`/api/proposals/${p.id}/express-vote`).set(bearer(yo.token)).send({ option: 'REAGENDAR' });
    expect([res.status, res.body.state, res.body.autoClosed]).toEqual([200, 'EN_RECOORDINACION', false]);
    expect(await stored(p)).toMatchObject({ state: 'EN_RECOORDINACION', auto_closed: false });
  });

  it('cancelar a mano un plan que se confirmó solo: CANCELADO con autoClosed false (no se puede replantear)', async () => {
    const p = await plan();
    await vote(p, 2, ana.token);
    clock.set(AFTER_DEADLINE);
    const res = await postTo(p, 'cancel');
    expect([res.status, res.body.state, res.body.autoClosed]).toEqual([200, 'CANCELADO', false]);
    const replan = await postTo(p, 'replan', yo.token, {
      votingDeadline: new Date(2026, 9, 10, 20, 0).toISOString(),
      windows: [{ date: '2026-10-12', startTime: '10:00', endTime: '12:00' }, { date: '2026-10-13', startTime: '16:00', endTime: '18:00' }],
    });
    expect([replan.status, replan.body.error?.code]).toEqual([409, 'INVALID_STATE']);
  });
});

describe('closeProposalIfDue y closeDueProposals', () => {
  it('Review Focus 2: si otro cierre acaba de terminar, el UPDATE afecta 0 filas → false y queda como lo dejó el otro', async () => {
    const p = await plan();
    await vote(p, 2, ana.token);
    interleave(db, /^UPDATE proposals SET state = 'CONFIRMADO'/, "UPDATE proposals SET state = 'CANCELADO', auto_closed = TRUE WHERE id = $1", [p.id]);
    expect(await closeProposalIfDue(db, p.id, AFTER_DEADLINE)).toBe(false);
    expect(await stored(p)).toEqual({ state: 'CANCELADO', chosen_window_id: null, scheduled_at: null, scheduled_date: null, auto_closed: true });
  });

  it('false si no venció, si no está PROPUESTO o si no existe', async () => {
    const p = await plan();
    expect(await closeProposalIfDue(db, p.id, NOW)).toBe(false);
    await postTo(p, 'cancel');
    expect(await closeProposalIfDue(db, p.id, AFTER_DEADLINE)).toBe(false);
    expect(await stored(p)).toMatchObject({ state: 'CANCELADO', auto_closed: false });
    expect(await closeProposalIfDue(db, 'no-existe', AFTER_DEADLINE)).toBe(false);
  });

  it('closeDueProposals cierra las vencidas del alcance y no las de otros grupos', async () => {
    const p = await plan();
    const otro = await registerUser(app);
    const otroGrupo = (await request(app).post('/api/groups').set(bearer(otro.token)).send({ name: 'Otro' })).body as Group;
    const ajena = await createProposal(app, otro.token, otroGrupo.id, { votingDeadline: DEADLINE, windows: [win(2, '16:00', '18:00'), win(4, '10:00', '12:00')] });
    await closeDueProposals(db, { groupId: group.id }, AFTER_DEADLINE);
    expect(await stored(p)).toMatchObject({ state: 'CANCELADO', auto_closed: true });
    expect(await stored(ajena)).toMatchObject({ state: 'PROPUESTO', auto_closed: false });
    await closeDueProposals(db, { userId: otro.user.id }, AFTER_DEADLINE);
    expect(await stored(ajena)).toMatchObject({ state: 'CANCELADO', auto_closed: true });
  });

  it('closeDueProposals con { all: true } cierra todas; nunca lanza aunque una falle', async () => {
    const p1 = await plan();
    const p2 = await plan();
    await vote(p2, 4, ana.token);
    // La primera que intenta cerrar falla (su UPDATE lanza); la otra se cierra igual.
    let failed = false;
    const original = db.query.bind(db);
    const spy = vi.spyOn(db, 'query').mockImplementation((async (sql: string, params?: readonly SqlParam[]) => {
      if (!failed && /^UPDATE proposals SET state = 'CANCELADO', auto_closed = TRUE/.test(sql)) {
        failed = true;
        throw new Error('fallo simulado');
      }
      return original(sql, params);
    }) as Db['query']);
    await expect(closeDueProposals(db, { all: true }, AFTER_DEADLINE)).resolves.toBeUndefined();
    spy.mockRestore();
    expect(await stored(p1)).toMatchObject({ state: 'PROPUESTO', auto_closed: false });
    expect(await stored(p2)).toMatchObject({ state: 'CONFIRMADO', chosen_window_id: windowOf(p2, 4).id, auto_closed: true });
  });

  it('Review Focus 1: el cierre se cuela justo antes del bloqueo de voteIfOpen → 409 VOTING_CLOSED y el voto no se guarda', async () => {
    const p = await plan();
    await vote(p, 2, ana.token);
    const scheduled = new Date(2026, 9, 6, 16, 0).toISOString();
    interleave(
      db,
      /^SELECT state, voting_deadline, multiple_votes FROM proposals WHERE id = \$1 FOR UPDATE/,
      `UPDATE proposals SET state = 'CONFIRMADO', chosen_window_id = $2, scheduled_at = $3, scheduled_date = $4, auto_closed = TRUE
       WHERE id = $1 AND state = 'PROPUESTO'`,
      [p.id, windowOf(p, 2).id, scheduled, '2026-10-06'],
    );
    const res = await vote(p, 4, yo.token);
    expect([res.status, res.body.error?.code]).toEqual([409, 'VOTING_CLOSED']);
    expect(await db.many('SELECT user_id FROM votes WHERE proposal_id = $1', [p.id])).toEqual([{ user_id: ana.user.id }]);
  });
});

describe('replantear una propuesta cerrada sola', () => {
  const NEW_DEADLINE = new Date(2026, 9, 10, 20, 0).toISOString();
  const NEW_WINDOWS = [
    { date: '2026-10-12', startTime: '10:00', endTime: '12:00' },
    { date: '2026-10-13', startTime: '16:00', endTime: '18:00' },
  ];
  const replan = (p: Proposal) => postTo(p, 'replan', yo.token, { votingDeadline: NEW_DEADLINE, windows: NEW_WINDOWS });

  it('CANCELADO con autoClosed → 200, PROPUESTO con autoClosed false', async () => {
    const p = await plan();
    clock.set(AFTER_DEADLINE);
    expect((await get(p)).body).toMatchObject({ state: 'CANCELADO', autoClosed: true });
    const res = await replan(p);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ state: 'PROPUESTO', autoClosed: false, votingDeadline: NEW_DEADLINE, chosenWindowId: null });
    expect(res.body.windows.map((w: { date: string }) => w.date)).toEqual(['2026-10-12', '2026-10-13']);
  });

  it('cancelada a mano → 409 INVALID_STATE', async () => {
    const p = await plan();
    await postTo(p, 'cancel');
    clock.set(AFTER_DEADLINE);
    const res = await replan(p);
    expect([res.status, res.body.error.code]).toEqual([409, 'INVALID_STATE']);
  });

  it('CONFIRMADO con autoClosed → 409 INVALID_STATE', async () => {
    const p = await plan();
    await vote(p, 2, ana.token);
    clock.set(AFTER_DEADLINE);
    const res = await replan(p);
    expect([res.status, res.body.error.code]).toEqual([409, 'INVALID_STATE']);
  });
});

describe('los cambios de miembros cierran antes las votaciones vencidas del grupo', () => {
  const leave = (token: string) => request(app).delete(`/api/groups/${group.id}/members/me`).set(bearer(token)).expect(204);
  const later = (ms: number) => new Date(AFTER_DEADLINE.getTime() + ms);

  it('la única votante sale tras el plazo sin que nadie lo haya consultado: igual CONFIRMADO con su voto', async () => {
    const p = await plan();
    await vote(p, 2, ana.token);
    clock.set(AFTER_DEADLINE);
    await leave(ana.token);
    expect((await get(p, yo.token)).body).toMatchObject({ state: 'CONFIRMADO', chosenWindowId: windowOf(p, 2).id, autoClosed: true });
  });

  it('quien votó y salió antes del plazo vuelve con el código después: el resultado no cambia (CANCELADO)', async () => {
    const p = await plan();
    const luis = await registerUser(app, { name: 'Luis' });
    await joinGroup(app, luis.token, group.inviteCode);
    await vote(p, 2, luis.token);
    await leave(luis.token);
    clock.set(AFTER_DEADLINE);
    await joinGroup(app, luis.token, group.inviteCode);
    expect((await get(p, yo.token)).body).toMatchObject({ state: 'CANCELADO', autoClosed: true });
  });

  it('quien votó y salió antes del plazo vuelve por proximidad después: el resultado no cambia (CANCELADO)', async () => {
    const p = await plan();
    const luis = await registerUser(app, { name: 'Luis' });
    await joinGroup(app, luis.token, group.inviteCode);
    await vote(p, 2, luis.token);
    await leave(luis.token);
    clock.set(AFTER_DEADLINE);
    const invite = await request(app).post('/api/proximity/invite').set(bearer(yo.token)).send({ groupId: group.id }).expect(201);
    clock.set(later(1000));
    await request(app).post('/api/proximity/join').set(bearer(luis.token)).send({}).expect(201);
    clock.set(later(5000));
    expect((await request(app).post(`/api/proximity/${invite.body.id}/accept`).set(bearer(yo.token))).body.status).toBe('ACCEPTED');
    expect((await get(p, yo.token)).body).toMatchObject({ state: 'CANCELADO', autoClosed: true });
  });
});
