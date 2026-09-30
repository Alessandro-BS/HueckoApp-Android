import type { Proposal } from '@hueckoapp/shared';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

import type { BridgeDb } from '../src/db/sqlite-bridge';
import { proposalsRepository } from '../src/proposals/proposals.repository';
import { bearer, DEADLINE, makeTestApp, NOW, setupSeedGroup } from './helpers';

const MINUTE = 60_000;

// Grupo de la semilla con `count` propuestas creadas directamente en el repositorio (rápido): cada una con 2 franjas
// (martes y jueves), el voto de los dos miembros y, una de cada tres, confirmada con una tardanza de Ana.
async function groupWithProposals(count: number) {
  const { app, db } = await makeTestApp({ now: () => NOW });
  const seed = await setupSeedGroup(app);
  const repo = proposalsRepository(db);
  const yoId = seed.yo.user.id;
  const anaId = seed.ana.user.id;
  for (let i = 0; i < count; i++) {
    const id = await repo.create({
      groupId: seed.group.id,
      createdBy: i % 2 === 0 ? yoId : anaId,
      title: `Plan ${i}`,
      location: i % 2 === 0 ? { name: `Lugar ${i}`, latitude: -12.07, longitude: -77.08 } : null,
      votingDeadline: DEADLINE,
      windows: [
        { dayOfWeek: 4, startTime: '10:00', endTime: '12:00', availabilityPercentage: 50 },
        { dayOfWeek: 2, startTime: '16:00', endTime: '18:00', availabilityPercentage: 100 },
      ],
      createdAt: new Date(NOW.getTime() - (count - i) * MINUTE).toISOString(),
    });
    const [martes, jueves] = (await repo.findById(id, yoId))!.windows;
    await repo.vote(id, yoId, martes.id, NOW.toISOString());
    await repo.vote(id, anaId, (i % 2 === 0 ? martes : jueves).id, NOW.toISOString());
    if (i % 3 === 0) {
      await repo.confirm(id, martes.id, NOW.toISOString(), '2026-09-29');
      await repo.reportIncidence(
        id,
        { userId: anaId, type: 'TARDANZA', reason: `Tráfico ${i}`, delayMinutes: 10, criticality: 'BAJA', createdAt: NOW.toISOString() },
        false,
      );
    }
  }
  return { app, db, repo, ...seed };
}

// Cuántas sentencias SQL ejecuta `fn`. TEMPORAL: el repositorio aún usa db.prepare; en el Task 4 pasa a contar db.query.
async function countQueries(db: BridgeDb, fn: () => unknown): Promise<number> {
  const spy = vi.spyOn(db, 'prepare');
  try {
    await fn();
    return spy.mock.calls.length;
  } finally {
    spy.mockRestore();
  }
}

describe('carga en lote de propuestas (sin N+1)', () => {
  it('listByGroup y listForUser usan las mismas consultas con 1 que con 25 propuestas', async () => {
    const one = await groupWithProposals(1);
    const many = await groupWithProposals(25);
    const listOne = await countQueries(one.db, () => one.repo.listByGroup(one.group.id, one.yo.user.id));
    const listMany = await countQueries(many.db, () => many.repo.listByGroup(many.group.id, many.yo.user.id));
    expect(listMany).toBe(listOne);
    expect(listMany).toBeLessThanOrEqual(6);
    const mineOne = await countQueries(one.db, () => one.repo.listForUser(one.yo.user.id));
    const mineMany = await countQueries(many.db, () => many.repo.listForUser(many.yo.user.id));
    expect(mineMany).toBe(mineOne);
    expect(mineMany).toBeLessThanOrEqual(6);
  });

  it('sin propuestas hace una sola consulta', async () => {
    const empty = await groupWithProposals(0);
    let result: Proposal[] = [];
    expect(await countQueries(empty.db, async () => (result = await empty.repo.listByGroup(empty.group.id, empty.yo.user.id)))).toBe(1);
    expect(result).toEqual([]);
  });

  it('con 25 propuestas cada una trae sus franjas, votos, incidencias y el voto de quien pregunta', async () => {
    const { app, yo, ana, group } = await groupWithProposals(25);
    const res = await request(app).get(`/api/groups/${group.id}/proposals`).set(bearer(yo.token));
    expect(res.status).toBe(200);
    const list: Proposal[] = res.body;
    expect(list.map((p) => p.title)).toEqual(Array.from({ length: 25 }, (_, k) => `Plan ${24 - k}`));
    for (const p of list) {
      const i = Number(p.title.slice(5));
      const [martes, jueves] = p.windows;
      expect([martes.dayOfWeek, jueves.dayOfWeek]).toEqual([2, 4]);
      expect([martes.voteCount, jueves.voteCount]).toEqual(i % 2 === 0 ? [2, 0] : [1, 1]);
      expect(p.myVoteWindowId).toBe(martes.id);
      expect(p.createdBy.id).toBe(i % 2 === 0 ? yo.user.id : ana.user.id);
      expect(p.location).toEqual(i % 2 === 0 ? { name: `Lugar ${i}`, latitude: -12.07, longitude: -77.08 } : null);
      expect(p.state).toBe(i % 3 === 0 ? 'CONFIRMADO' : 'PROPUESTO');
      expect(p.incidences.map((x) => x.reason)).toEqual(i % 3 === 0 ? [`Tráfico ${i}`] : []);
      // El detalle de cada una es el mismo objeto que en la lista.
      expect((await request(app).get(`/api/proposals/${p.id}`).set(bearer(yo.token))).body).toEqual(p);
    }
    // Cada persona ve su propio voto.
    const deAna: Proposal[] = (await request(app).get(`/api/groups/${group.id}/proposals`).set(bearer(ana.token))).body;
    for (const p of deAna) {
      expect(p.myVoteWindowId).toBe(p.windows[Number(p.title.slice(5)) % 2 === 0 ? 0 : 1].id);
    }
  });
});
