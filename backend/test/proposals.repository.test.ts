import { describe, expect, it } from 'vitest';

import { groupsRepository } from '../src/groups/groups.repository';
import { type NewWindow, proposalsRepository } from '../src/proposals/proposals.repository';
import { usersRepository } from '../src/users/users.repository';
import { DEADLINE, makeTestDb, NOW, recordQueries } from './helpers';

const createdAt = NOW.toISOString();
const win = (date: string, startTime: string, endTime: string, availabilityPercentage = 100): NewWindow => ({
  date, startTime, endTime, availabilityPercentage,
});

// Ana (organizadora) y Beto en un grupo, y un repositorio para crear propuestas directamente.
const setup = async () => {
  const db = await makeTestDb();
  const users = usersRepository(db);
  const ana = await users.create({ name: 'Ana', email: 'ana@correo.com', passwordHash: 'x', createdAt });
  const beto = await users.create({ name: 'Beto', email: 'beto@correo.com', passwordHash: 'x', createdAt });
  const groups = groupsRepository(db);
  const group = await groups.create(ana.id, { name: 'Grupo', description: '', availabilityThreshold: 80, createdAt });
  await groups.addMember(group.id, beto.id);
  const repo = proposalsRepository(db);
  const create = (windows: NewWindow[]) =>
    repo.create({ groupId: group.id, createdBy: ana.id, title: 'Plan', location: null, votingDeadline: DEADLINE, windows, multipleVotes: false, createdAt });
  return { db, repo, create, ana, beto };
};

describe('proposalsRepository: franjas con fecha', () => {
  it('insert guarda day_of_week derivado de date', async () => {
    const { db, repo, create, ana } = await setup();
    const id = await create([win('2026-10-01', '10:00', '12:00'), win('2026-10-04', '16:00', '18:00')]);
    expect(await db.many('SELECT date, day_of_week FROM proposal_windows ORDER BY date')).toEqual([
      { date: '2026-10-01', day_of_week: 4 },
      { date: '2026-10-04', day_of_week: 7 },
    ]);
    await repo.addWindow(id, win('2026-10-05', '09:00', '10:00'));
    const windows = (await repo.findById(id, ana.id))!.windows;
    expect(windows.map((w) => [w.date, w.dayOfWeek])).toEqual([
      ['2026-10-01', 4],
      ['2026-10-04', 7],
      ['2026-10-05', 1],
    ]);
  });

  it('findById ordena por fecha y hora', async () => {
    const { repo, create, ana } = await setup();
    // Por día de la semana, el martes 6/10 iría antes que el miércoles 30/9: se ordena por fecha.
    const id = await create([
      win('2026-10-06', '10:00', '12:00'),
      win('2026-09-30', '16:00', '18:00'),
      win('2026-10-01', '08:00', '09:00'),
      win('2026-09-30', '09:00', '11:00'),
    ]);
    const windows = (await repo.findById(id, ana.id))!.windows;
    expect(windows.map((w) => `${w.date} ${w.startTime}`)).toEqual(['2026-09-30 09:00', '2026-09-30 16:00', '2026-10-01 08:00', '2026-10-06 10:00']);
  });

  it('replaceWindows borra votos y franjas viejas y limpia la confirmación', async () => {
    const { db, repo, create, ana, beto } = await setup();
    const id = await create([win('2026-09-30', '16:00', '18:00'), win('2026-10-01', '10:00', '12:00')]);
    const [first, second] = (await repo.findById(id, ana.id))!.windows;
    await repo.voteIfOpen(id, ana.id, first.id, NOW);
    await repo.voteIfOpen(id, beto.id, second.id, NOW);
    expect(await repo.confirm(id, first.id, '2026-09-30T21:00:00.000Z', '2026-09-30', NOW)).toBe(true);

    const deadline = '2026-10-07T01:00:00.000Z';
    const calls = recordQueries(db);
    await repo.replaceWindows(id, [win('2026-10-08', '18:00', '20:00', 50), win('2026-10-07', '10:00', '12:00', 100)], deadline);
    expect(calls.length).toBeGreaterThan(0);
    expect(calls.some((c) => !c.inTransaction)).toBe(false);

    const after = (await repo.findById(id, ana.id))!;
    expect(after.windows.map((w) => [w.date, w.dayOfWeek, w.startTime, w.endTime, w.availabilityPercentage, w.voteCount])).toEqual([
      ['2026-10-07', 3, '10:00', '12:00', 100, 0],
      ['2026-10-08', 4, '18:00', '20:00', 50, 0],
    ]);
    expect(after.windows.some((w) => w.id === first.id || w.id === second.id)).toBe(false);
    expect(after).toMatchObject({ chosenWindowId: null, scheduledAt: null, scheduledDate: null, votingDeadline: deadline, myVoteWindowIds: [] });
    expect(await db.one('SELECT COUNT(*) AS n FROM votes WHERE proposal_id = $1', [id])).toEqual({ n: 0 });
  });

  it('replaceWindows es todo o nada: si una franja nueva falla, quedan las viejas con sus votos', async () => {
    const { repo, create, ana } = await setup();
    const id = await create([win('2026-09-30', '16:00', '18:00'), win('2026-10-01', '10:00', '12:00')]);
    const before = (await repo.findById(id, ana.id))!;
    await repo.voteIfOpen(id, ana.id, before.windows[0].id, NOW);
    // Dos franjas iguales chocan con el UNIQUE.
    await expect(repo.replaceWindows(id, [win('2026-10-07', '10:00', '12:00'), win('2026-10-07', '10:00', '12:00')], DEADLINE)).rejects.toMatchObject({
      code: '23505',
    });
    const after = (await repo.findById(id, ana.id))!;
    expect(after.windows.map((w) => w.id)).toEqual(before.windows.map((w) => w.id));
    expect(after.myVoteWindowIds).toEqual([before.windows[0].id]);
  });
});

describe('proposalsRepository: voteIfOpen y unvoteIfOpen (comprobación con la propuesta bloqueada)', () => {
  const votesOf = async (db: Awaited<ReturnType<typeof setup>>['db'], id: string) =>
    (await db.many<{ user_id: string; window_id: string }>('SELECT user_id, window_id FROM votes WHERE proposal_id = $1 ORDER BY window_id', [id])).length;

  it.each([
    ['ahora justo en el plazo', 'PROPUESTO', new Date(DEADLINE)],
    ['ahora pasado el plazo', 'PROPUESTO', new Date(new Date(DEADLINE).getTime() + 60_000)],
    ['propuesta CONFIRMADO', 'CONFIRMADO', NOW],
    ['propuesta CANCELADO', 'CANCELADO', NOW],
  ] as const)('%s: CLOSED y no escribe ni borra votos', async (_, state, now) => {
    const { db, repo, create, ana, beto } = await setup();
    const id = await create([win('2026-09-30', '16:00', '18:00'), win('2026-10-01', '10:00', '12:00')]);
    const [first, second] = (await repo.findById(id, ana.id))!.windows;
    expect(await repo.voteIfOpen(id, ana.id, first.id, NOW)).toBe('OK');
    await db.query('UPDATE proposals SET state = $1 WHERE id = $2', [state, id]);

    expect(await repo.voteIfOpen(id, beto.id, second.id, now)).toBe('CLOSED');
    expect(await repo.voteIfOpen(id, ana.id, second.id, now)).toBe('CLOSED');
    expect(await repo.unvoteIfOpen(id, ana.id, first.id, now)).toBe('CLOSED');
    expect(await repo.unvoteIfOpen(id, ana.id, null, now)).toBe('CLOSED');
    // Solo queda el voto de Ana a la primera franja, intacto.
    expect(await db.many('SELECT user_id, window_id FROM votes WHERE proposal_id = $1', [id])).toEqual([{ user_id: ana.id, window_id: first.id }]);
  });

  it('una propuesta que no existe devuelve CLOSED y no escribe nada', async () => {
    const { db, repo, ana } = await setup();
    expect(await repo.voteIfOpen('no-existe', ana.id, 'w', NOW)).toBe('CLOSED');
    expect(await repo.unvoteIfOpen('no-existe', ana.id, null, NOW)).toBe('CLOSED');
    expect(await votesOf(db, 'no-existe')).toBe(0);
    expect(await db.one('SELECT COUNT(*) AS n FROM votes')).toEqual({ n: 0 });
  });
});

describe('proposalsRepository: confirm (comprobación con la propuesta bloqueada)', () => {
  it('en el plazo o después → false y no cambia nada (la votación se cierra sola)', async () => {
    const { db, repo, create, ana } = await setup();
    const id = await create([win('2026-10-05', '16:00', '18:00'), win('2026-10-06', '10:00', '12:00')]);
    const [first] = (await repo.findById(id, ana.id))!.windows;
    const stored = () => db.one('SELECT state, chosen_window_id, scheduled_at FROM proposals WHERE id = $1', [id]);
    expect(await repo.confirm(id, first.id, '2026-10-05T21:00:00.000Z', '2026-10-05', new Date(DEADLINE))).toBe(false);
    expect(await repo.confirm(id, first.id, '2026-10-05T21:00:00.000Z', '2026-10-05', new Date(new Date(DEADLINE).getTime() + 60_000))).toBe(false);
    expect(await stored()).toEqual({ state: 'PROPUESTO', chosen_window_id: null, scheduled_at: null });
    // Control positivo: un milisegundo antes del plazo sí confirma.
    expect(await repo.confirm(id, first.id, '2026-10-05T21:00:00.000Z', '2026-10-05', new Date(new Date(DEADLINE).getTime() - 1))).toBe(true);
    expect(await stored()).toMatchObject({ state: 'CONFIRMADO', chosen_window_id: first.id });
  });
});
