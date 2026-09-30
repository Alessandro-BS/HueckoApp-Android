import type { Dashboard, Group, Proposal, User } from '@hueckoapp/shared';
import type { Express } from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';

import { summaryData } from '../src/ai/voting-summary';
import type { Db } from '../src/db/database';
import { bearer, createProposal, DEADLINE, joinGroup, makeTestApp, NOW, registerUser, setupSeedGroup, voteFor, windowOf } from './helpers';

let app: Express;
let db: Db;
let yo: { token: string; user: User };
let ana: { token: string; user: User };
let carlos: { token: string; user: User };
let group: Group;

beforeEach(async () => {
  ({ app, db } = makeTestApp({ now: () => NOW }));
  ({ yo, ana, group } = await setupSeedGroup(app));
  carlos = await registerUser(app, { name: 'Carlos' });
  await joinGroup(app, carlos.token, group.inviteCode);
});

const leave = async (token: string) =>
  expect((await request(app).delete(`/api/groups/${group.id}/members/me`).set(bearer(token))).status).toBe(204);
const getProposal = async (id: string, token = yo.token): Promise<Proposal> =>
  (await request(app).get(`/api/proposals/${id}`).set(bearer(token))).body;
const votesInDb = (proposalId: string) =>
  (db.prepare('SELECT COUNT(*) AS n FROM votes WHERE proposal_id = ?').get(proposalId) as { n: number }).n;

// Martes 16–18 y jueves 10–12: yo vota el martes; Ana y Carlos, el jueves.
async function votedPlan() {
  const p = await createProposal(app, yo.token, group.id, {
    votingDeadline: DEADLINE,
    windows: [
      { dayOfWeek: 2, startTime: '16:00', endTime: '18:00' },
      { dayOfWeek: 4, startTime: '10:00', endTime: '12:00' },
    ],
  });
  await voteFor(app, p.id, windowOf(p, 2).id, yo.token);
  await voteFor(app, p.id, windowOf(p, 4).id, ana.token);
  await voteFor(app, p.id, windowOf(p, 4).id, carlos.token);
  return p;
}

describe('votos de quien sale del grupo (D5)', () => {
  it('dejan de contar pero no se borran, y vuelven a contar si la persona vuelve', async () => {
    const p = await votedPlan();
    expect((await getProposal(p.id)).windows.map((w) => w.voteCount)).toEqual([1, 2]);
    await leave(carlos.token);
    expect((await getProposal(p.id)).windows.map((w) => w.voteCount)).toEqual([1, 1]);
    expect(votesInDb(p.id)).toBe(3);
    await joinGroup(app, carlos.token, group.inviteCode);
    const back = await getProposal(p.id, carlos.token);
    expect(back.windows.map((w) => w.voteCount)).toEqual([1, 2]);
    expect(back.myVoteWindowId).toBe(windowOf(p, 4).id);
  });

  it('«la más votada» al confirmar solo cuenta a los miembros actuales', async () => {
    const p = await votedPlan();
    await leave(ana.token);
    await leave(carlos.token);
    const res = await request(app).post(`/api/proposals/${p.id}/confirm`).set(bearer(yo.token)).send({});
    expect(res.status).toBe(200);
    expect(res.body.chosenWindowId).toBe(windowOf(p, 2).id);
  });

  it('si solo votó alguien que se fue, confirmar sin franja → 409 NO_VOTES', async () => {
    const p = await createProposal(app, yo.token, group.id, { votingDeadline: DEADLINE, windows: [{ dayOfWeek: 2, startTime: '16:00', endTime: '18:00' }] });
    await voteFor(app, p.id, windowOf(p, 2).id, carlos.token);
    await leave(carlos.token);
    const res = await request(app).post(`/api/proposals/${p.id}/confirm`).set(bearer(yo.token)).send({});
    expect([res.status, res.body.error.code]).toEqual([409, 'NO_VOTES']);
  });

  it('Inicio y los datos del resumen con IA tampoco los cuentan', async () => {
    const p = await votedPlan();
    await leave(carlos.token);
    const d: Dashboard = (await request(app).get('/api/me/dashboard').set(bearer(yo.token))).body;
    expect(d.pendingVotes.find((x) => x.id === p.id)!.windows.map((w) => w.voteCount)).toEqual([1, 1]);
    const current: Group = (await request(app).get(`/api/groups/${group.id}`).set(bearer(yo.token))).body;
    const data = summaryData(await getProposal(p.id), current, NOW);
    expect([data.integrantes, data.votosEmitidos, data.franjas.map((f) => f.votos)]).toEqual([2, 2, [1, 1]]);
  });
});
