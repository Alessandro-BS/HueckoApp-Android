import type { Group, Proposal, User } from '@hueckoapp/shared';
import type { Express } from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';

import type { Db } from '../src/db/db';
import { bearer, createProposal, interleave, dateOf, DEADLINE, makeClock, makeTestApp, NOW, setupSeedGroup, voteFor, win } from './helpers';

const NEW_DEADLINE = new Date(2026, 9, 4, 20, 0).toISOString();
const NEW_WINDOWS = [win(3, '11:00', '13:00'), win(4, '16:00', '18:00')];

let app: Express;
let db: Db;
let yo: { token: string; user: User };
let ana: { token: string; user: User };
let group: Group;
let p: Proposal;

beforeEach(async () => {
  ({ app, db } = await makeTestApp({ now: makeClock(NOW).now }));
  ({ yo, ana, group } = await setupSeedGroup(app));
  p = await createProposal(app, yo.token, group.id, {
    title: 'Repaso',
    votingDeadline: DEADLINE,
    windows: [win(2, '16:00', '18:00'), win(5, '16:00', '18:00')],
  });
});

const replan = (token: string, body: object = { votingDeadline: NEW_DEADLINE, windows: NEW_WINDOWS }, id = p.id) =>
  request(app).post(`/api/proposals/${id}/replan`).set(bearer(token)).send(body);

describe('POST /api/proposals/:id/replan', () => {
  it('reemplaza las franjas y el plazo, y borra los votos', async () => {
    await voteFor(app, p.id, p.windows[0].id, ana.token);
    const res = await replan(yo.token);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ state: 'PROPUESTO', votingDeadline: NEW_DEADLINE });
    expect(res.body.windows.map((w: { date: string; startTime: string }) => [w.date, w.startTime])).toEqual([
      [dateOf(3), '11:00'],
      [dateOf(4), '16:00'],
    ]);
    expect(res.body.windows.every((w: { voteCount: number }) => w.voteCount === 0)).toBe(true);
    expect(await db.one('SELECT COUNT(*) AS n FROM votes WHERE proposal_id = $1', [p.id])).toEqual({ n: 0 });
  });

  it('una propuesta migrada con todas las franjas pasadas se puede replantear', async () => {
    await db.query("UPDATE proposal_windows SET date = $2 WHERE id = $1", [p.windows[0].id, '2026-01-05']);
    await db.query("UPDATE proposal_windows SET date = $2 WHERE id = $1", [p.windows[1].id, '2026-01-06']);
    await db.query("UPDATE proposals SET voting_deadline = '2026-01-03T00:00:00.000Z' WHERE id = $1", [p.id]);
    const res = await replan(yo.token);
    expect([res.status, res.body.state]).toEqual([200, 'PROPUESTO']);
    expect(res.body.windows.map((w: { date: string }) => w.date)).toEqual([dateOf(3), dateOf(4)]);
  });

  it('409 INVALID_STATE si la propuesta no está en votación', async () => {
    await voteFor(app, p.id, p.windows[0].id, yo.token);
    await request(app).post(`/api/proposals/${p.id}/confirm`).set(bearer(yo.token)).send({});
    const res = await replan(yo.token);
    expect([res.status, res.body.error.code]).toEqual([409, 'INVALID_STATE']);
  });

  it('403 NOT_MANAGER si no la gestiono', async () => {
    const res = await replan(ana.token);
    expect([res.status, res.body.error.code]).toEqual([403, 'NOT_MANAGER']);
  });

  it('400 si el plazo es posterior al inicio de la primera franja', async () => {
    const res = await replan(yo.token, { votingDeadline: new Date(2026, 9, 9).toISOString(), windows: NEW_WINDOWS });
    expect(res.status).toBe(400);
    expect(res.body.error.details).toContainEqual(expect.objectContaining({ path: ['votingDeadline'] }));
  });

  it('400 con menos de 2 franjas o sin plazo', async () => {
    expect((await replan(yo.token, { votingDeadline: NEW_DEADLINE, windows: [NEW_WINDOWS[0]] })).status).toBe(400);
    expect((await replan(yo.token, { windows: NEW_WINDOWS })).status).toBe(400);
  });

  it('409 INVALID_STATE si la propuesta está CANCELADA', async () => {
    await request(app).post(`/api/proposals/${p.id}/cancel`).set(bearer(yo.token)).send({});
    const res = await replan(yo.token);
    expect([res.status, res.body.error.code]).toEqual([409, 'INVALID_STATE']);
  });

  // Otra petición cancela justo entre la comprobación de la ruta y la escritura: 409 y no se toca nada.
  it('replantear una propuesta que otra petición acaba de cancelar: 409, sigue CANCELADA con sus franjas y votos', async () => {
    await voteFor(app, p.id, p.windows[0].id, ana.token);
    interleave(db, /^UPDATE proposals SET voting_deadline/, "UPDATE proposals SET state = 'CANCELADO' WHERE id = $1", [p.id]);
    const res = await replan(yo.token);
    expect([res.status, res.body.error?.code]).toEqual([409, 'INVALID_STATE']);
    expect(await db.one('SELECT state FROM proposals WHERE id = $1', [p.id])).toEqual({ state: 'CANCELADO' });
    expect(await db.one('SELECT COUNT(*) AS n FROM proposal_windows WHERE proposal_id = $1', [p.id])).toEqual({ n: 2 });
    expect(await db.one('SELECT COUNT(*) AS n FROM votes WHERE proposal_id = $1', [p.id])).toEqual({ n: 1 });
  });
});
