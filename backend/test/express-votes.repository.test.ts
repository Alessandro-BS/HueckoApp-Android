import { describe, expect, it } from 'vitest';

import { groupsRepository } from '../src/groups/groups.repository';
import { expressVotesRepository } from '../src/proposals/express-votes.repository';
import { proposalsRepository } from '../src/proposals/proposals.repository';
import { usersRepository } from '../src/users/users.repository';
import { DEADLINE, makeTestDb, NOW } from './helpers';

const createdAt = NOW.toISOString();
const OPENED = '2026-10-01T10:00:00.000Z';
const EXPIRES = '2026-10-01T11:00:00.000Z';

// Ana (organizadora), Beto y Carla en un grupo, con un plan; Ana reporta y votan Beto y Carla.
const setup = async () => {
  const db = await makeTestDb();
  const users = usersRepository(db);
  const [ana, beto, carla] = [
    await users.create({ name: 'Ana', email: 'ana@correo.com', passwordHash: 'x', createdAt }),
    await users.create({ name: 'Beto', email: 'beto@correo.com', passwordHash: 'x', createdAt }),
    await users.create({ name: 'Carla', email: 'carla@correo.com', passwordHash: 'x', createdAt }),
  ];
  const groups = groupsRepository(db);
  const group = await groups.create(ana.id, { name: 'Grupo', description: '', availabilityThreshold: 80, createdAt });
  await groups.addMember(group.id, beto.id);
  await groups.addMember(group.id, carla.id);
  const proposalId = await proposalsRepository(db).create({
    groupId: group.id, createdBy: ana.id, title: 'Plan', location: null, votingDeadline: DEADLINE,
    windows: [{ date: '2026-10-05', startTime: '10:00', endTime: '12:00', availabilityPercentage: 100 }], multipleVotes: false, createdAt,
  });
  const repo = expressVotesRepository(db);
  const open = (voterIds = [beto.id, carla.id]) =>
    repo.open({ proposalId, reporterId: ana.id, reason: 'Estoy enfermo', criticalReason: 'propuso este plan', voterIds, openedAt: OPENED, expiresAt: EXPIRES });
  return { db, repo, open, groups, group, proposalId, ana, beto, carla };
};

describe('expressVotesRepository', () => {
  it('open crea la votación con sus votantes; un segundo open del mismo plan da null', async () => {
    const { db, open, proposalId, repo } = await setup();
    const id = await open();
    expect(id).toEqual(expect.any(String));
    expect(await db.one('SELECT COUNT(*) AS n FROM express_vote_voters WHERE vote_id = $1', [id])).toEqual({ n: 2 });
    expect(await repo.findOpen(proposalId)).toEqual({ id, expiresAt: EXPIRES });
    expect(await open()).toBeNull();
    expect(await db.one('SELECT COUNT(*) AS n FROM express_votes')).toEqual({ n: 1 });
  });

  it('castVote registra y cambia el voto', async () => {
    const { repo, open, proposalId, beto } = await setup();
    const id = (await open())!;
    await repo.castVote(id, beto.id, 'CANCELAR', OPENED);
    expect((await repo.latestFor([proposalId], beto.id)).get(proposalId)).toMatchObject({ myVote: 'CANCELAR', counts: { CANCELAR: 1, REAGENDAR: 0, MANTENER: 0 } });
    await repo.castVote(id, beto.id, 'MANTENER', OPENED);
    expect((await repo.latestFor([proposalId], beto.id)).get(proposalId)).toMatchObject({ myVote: 'MANTENER', counts: { CANCELAR: 0, REAGENDAR: 0, MANTENER: 1 } });
  });

  it('latestFor da counts, myVote, canVote, eligibleVoters y quorum', async () => {
    const { repo, open, proposalId, ana, beto, carla } = await setup();
    const id = (await open())!;
    await repo.castVote(id, carla.id, 'REAGENDAR', OPENED);
    const asBeto = (await repo.latestFor([proposalId], beto.id)).get(proposalId)!;
    expect(asBeto).toMatchObject({
      id, status: 'ABIERTA', reportedBy: { id: ana.id, name: 'Ana' }, reason: 'Estoy enfermo', criticalReason: 'propuso este plan',
      openedAt: OPENED, expiresAt: EXPIRES, closedAt: null, counts: { CANCELAR: 0, REAGENDAR: 1, MANTENER: 0 },
      myVote: null, canVote: true, eligibleVoters: 2, quorum: 2, result: null, resultByDefault: null, recommendation: null,
    });
    expect((await repo.latestFor([proposalId], carla.id)).get(proposalId)).toMatchObject({ myVote: 'REAGENDAR', canVote: true });
    // Quien avisó no es votante.
    expect((await repo.latestFor([proposalId], ana.id)).get(proposalId)).toMatchObject({ myVote: null, canVote: false });
  });

  it('un votante que salió del grupo no cuenta en counts, eligibleVoters ni quorum, y no puede votar', async () => {
    const { repo, open, group, proposalId, beto, carla, db } = await setup();
    const id = (await open())!;
    await repo.castVote(id, beto.id, 'CANCELAR', OPENED);
    await repo.castVote(id, carla.id, 'MANTENER', OPENED);
    await db.query('DELETE FROM group_members WHERE group_id = $1 AND user_id = $2', [group.id, beto.id]);
    const asCarla = (await repo.latestFor([proposalId], carla.id)).get(proposalId)!;
    expect(asCarla).toMatchObject({ counts: { CANCELAR: 0, REAGENDAR: 0, MANTENER: 1 }, eligibleVoters: 1, quorum: 1, canVote: true });
    expect((await repo.latestFor([proposalId], beto.id)).get(proposalId)).toMatchObject({ myVote: null, canVote: false });
  });

  it('latestFor devuelve la más reciente por plan y un mapa vacío sin votaciones', async () => {
    const { repo, open, proposalId, beto, db } = await setup();
    expect((await repo.latestFor([proposalId], beto.id)).size).toBe(0);
    expect((await repo.latestFor([], beto.id)).size).toBe(0);
    const first = (await open())!;
    await db.query("UPDATE express_votes SET status = 'CERRADA', closed_at = $2, result = 'MANTENER', result_by_default = TRUE WHERE id = $1", [first, EXPIRES]);
    const second = (await open())!;
    const latest = (await repo.latestFor([proposalId], beto.id)).get(proposalId)!;
    expect(latest.id).toBe(second);
  });

  it('saveRecommendation guarda en ABIERTA y devuelve false en CERRADA', async () => {
    const { repo, open, proposalId, beto, db } = await setup();
    const id = (await open())!;
    expect(await repo.saveRecommendation(id, 'REAGENDAR', 'Mejor otro día')).toBe(true);
    expect((await repo.latestFor([proposalId], beto.id)).get(proposalId)!.recommendation).toEqual({ option: 'REAGENDAR', reason: 'Mejor otro día' });
    await db.query("UPDATE express_votes SET status = 'CERRADA' WHERE id = $1", [id]);
    expect(await repo.saveRecommendation(id, 'CANCELAR', 'Tarde')).toBe(false);
  });

  it('deleteClosedFor borra las cerradas y deja la abierta', async () => {
    const { repo, open, proposalId, db } = await setup();
    const first = (await open())!;
    await db.query("UPDATE express_votes SET status = 'CERRADA' WHERE id = $1", [first]);
    const second = (await open())!;
    await repo.deleteClosedFor(proposalId);
    expect(await db.many('SELECT id FROM express_votes')).toEqual([{ id: second }]);
    expect(await db.one('SELECT COUNT(*) AS n FROM express_vote_voters WHERE vote_id = $1', [first])).toEqual({ n: 0 });
  });
});
