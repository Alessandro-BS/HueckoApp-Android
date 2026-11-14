import type { Group, Proposal, User } from '@hueckoapp/shared';
import type { Express } from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';

import type { Db } from '../src/db/db';
import { AFTER_DEADLINE, bearer, createProposal, DEADLINE, makeClock, makeTestApp, NOW, setupSeedGroup, unvoteFor, voteFor, win, windowOf } from './helpers';

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

const plan = (extra: Record<string, unknown> = {}): Promise<Proposal> =>
  createProposal(app, yo.token, group.id, { votingDeadline: DEADLINE, windows: [win(2, '16:00', '18:00'), win(4, '10:00', '12:00')], ...extra });
const unvoteWindow = (id: string, windowId: string, token: string) =>
  request(app).delete(`/api/proposals/${id}/vote`).query({ windowId }).set(bearer(token));
const counts = (p: Proposal) => p.windows.map((w) => w.voteCount);

describe('crear con multipleVotes', () => {
  it('por defecto es true; con false es false; un valor que no es booleano → 400', async () => {
    expect((await plan()).multipleVotes).toBe(true);
    expect((await plan({ multipleVotes: false })).multipleVotes).toBe(false);
    const res = await request(app)
      .post(`/api/groups/${group.id}/proposals`)
      .set(bearer(yo.token))
      .send({ title: 'Plan', votingDeadline: DEADLINE, windows: [win(2, '16:00', '18:00'), win(4, '10:00', '12:00')], multipleVotes: 'sí' });
    expect(res.status).toBe(400);
  });

  it('autoClosed empieza en false', async () => {
    expect((await plan()).autoClosed).toBe(false);
  });
});

describe('voto múltiple', () => {
  it('votar A y B conserva ambos; repetir no cambia; quitar una o todas', async () => {
    const p = await plan();
    const [a, b] = [windowOf(p, 2).id, windowOf(p, 4).id];
    await voteFor(app, p.id, a, yo.token);
    const both = await voteFor(app, p.id, b, yo.token);
    expect(both.body.myVoteWindowIds).toEqual([a, b]);
    expect(counts(both.body)).toEqual([1, 1]);
    expect(counts((await voteFor(app, p.id, a, yo.token)).body)).toEqual([1, 1]);

    const onlyB = await unvoteWindow(p.id, a, yo.token);
    expect(onlyB.body.myVoteWindowIds).toEqual([b]);
    const same = await unvoteWindow(p.id, a, yo.token);
    expect([same.status, same.body.myVoteWindowIds]).toEqual([200, [b]]);
    const none = await unvoteFor(app, p.id, yo.token);
    expect(none.body.myVoteWindowIds).toEqual([]);
    expect(counts(none.body)).toEqual([0, 0]);
  });

  it('repetir el voto no cambia created_at', async () => {
    const p = await plan();
    await voteFor(app, p.id, windowOf(p, 2).id, yo.token);
    await db.query("UPDATE votes SET created_at = '2026-01-01T00:00:00.000Z'");
    await voteFor(app, p.id, windowOf(p, 2).id, yo.token);
    expect(await db.one('SELECT created_at FROM votes')).toEqual({ created_at: '2026-01-01T00:00:00.000Z' });
  });

  it('confirmar sin windowId: gana la franja con más votos', async () => {
    const p = await plan();
    await voteFor(app, p.id, windowOf(p, 2).id, yo.token);
    await voteFor(app, p.id, windowOf(p, 4).id, yo.token);
    await voteFor(app, p.id, windowOf(p, 4).id, ana.token);
    const res = await request(app).post(`/api/proposals/${p.id}/confirm`).set(bearer(yo.token)).send({});
    expect([res.status, res.body.chosenWindowId]).toEqual([200, windowOf(p, 4).id]);
  });
});

describe('voto único (multipleVotes: false)', () => {
  it('votar A y luego B mueve el voto; DELETE lo quita', async () => {
    const p = await plan({ multipleVotes: false });
    await voteFor(app, p.id, windowOf(p, 2).id, yo.token);
    const moved = await voteFor(app, p.id, windowOf(p, 4).id, yo.token);
    expect(moved.body.myVoteWindowIds).toEqual([windowOf(p, 4).id]);
    expect(counts(moved.body)).toEqual([0, 1]);
    expect((await unvoteFor(app, p.id, yo.token)).body.myVoteWindowIds).toEqual([]);
  });
});

describe('plazo y replanteo', () => {
  it('votar o quitar tras el plazo → 409 VOTING_CLOSED', async () => {
    const p = await plan();
    clock.set(AFTER_DEADLINE);
    const res = await voteFor(app, p.id, windowOf(p, 2).id, yo.token);
    expect([res.status, res.body.error.code]).toEqual([409, 'VOTING_CLOSED']);
    expect((await unvoteWindow(p.id, windowOf(p, 2).id, yo.token)).body.error.code).toBe('VOTING_CLOSED');
  });

  it('replantear conserva multipleVotes', async () => {
    const p = await plan({ multipleVotes: false });
    const res = await request(app)
      .post(`/api/proposals/${p.id}/replan`)
      .set(bearer(yo.token))
      .send({ votingDeadline: new Date(2026, 9, 4, 20, 0).toISOString(), windows: [win(3, '11:00', '13:00'), win(4, '16:00', '18:00')] });
    expect([res.status, res.body.multipleVotes]).toEqual([200, false]);
  });
});
