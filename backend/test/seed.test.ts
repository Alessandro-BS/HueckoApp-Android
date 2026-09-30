import { describe, expect, it } from 'vitest';

import { buildDashboard, upcomingPlans } from '../src/dashboard/dashboard';
import { seedDemoData } from '../src/db/demo-data';
import { groupsRepository } from '../src/groups/groups.repository';
import { proposalsRepository } from '../src/proposals/proposals.repository';
import type { BridgeDb as Db } from '../src/db/sqlite-bridge'; // TEMPORAL: `import type { Db } from '../src/db/db'` en el Task 6
import { makeTestDb, NOW } from './helpers';

const DAY = 86_400_000;
// La semilla solo guarda el hash: los tests no necesitan bcrypt.
const HASH = 'hash-de-prueba';
const TABLES = ['users', 'groups', 'group_members', 'time_blocks', 'proposals', 'proposal_windows', 'votes', 'incidences'];

const count = async (db: Db, table: string) => (await db.one<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table}`))!.n;
const snapshot = async (db: Db) => {
  const counts: Record<string, number> = {};
  for (const table of TABLES) counts[table] = await count(db, table);
  return counts;
};
const userId = async (db: Db, email: string) => (await db.one<{ id: string }>('SELECT id FROM users WHERE email = $1', [email]))!.id;
const column = async (db: Db, sql: string) => (await db.many<{ v: string }>(sql)).map((r) => r.v);

// Lo que ve test@test.com en Inicio con la base sembrada (como GET /me/dashboard: los miembros del próximo plan se leen antes).
async function dashboardOf(db: Db, now: Date) {
  const id = await userId(db, 'test@test.com');
  const groups = groupsRepository(db);
  const proposals = await proposalsRepository(db).listForUser(id);
  const next = upcomingPlans(proposals, now)[0];
  const nextMembers = next ? ((await groups.findById(next.groupId))?.members ?? []) : [];
  return buildDashboard({
    now,
    groups: await groups.listForUser(id),
    proposals,
    totalBlocks: 2,
    membersOf: (groupId) => (groupId === next?.groupId ? nextMembers : []),
  });
}

describe('semilla de datos de ejemplo (D8)', () => {
  it('crea las cuentas, los códigos y las dos propuestas con fechas relativas a hoy', async () => {
    const db = await makeTestDb();
    expect(await seedDemoData(db, HASH, NOW)).toEqual({ users: 4, groups: 2, blocks: 5, proposals: 2, adminReset: false });
    expect(await column(db, 'SELECT email AS v FROM users ORDER BY email')).toEqual(['admin@test.com', 'ana@test.com', 'carlos@test.com', 'test@test.com']);
    expect(await column(db, 'SELECT invite_code AS v FROM groups ORDER BY invite_code')).toEqual(['HUECKO123', 'PROY2026']);

    const d = await dashboardOf(db, NOW);
    // NOW = martes 29/09 10:00 → el plan confirmado es dentro de 2 días, el jueves 1/10 a las 11:00.
    expect(d.nextPlan).toMatchObject({
      title: 'Reunión de avance del proyecto',
      scheduledAt: new Date(2026, 9, 1, 11, 0).toISOString(),
      scheduledDate: '2026-10-01',
    });
    expect(d.nextPlan?.attendees.map((a) => a.user.name)).toEqual(['Usuario de Prueba', 'Ana']);
    expect(d.expressAlert).toMatchObject({ kind: 'AVISO', who: 'Ana', canResolve: true });
    // La votación abierta cierra mañana a las 20:00.
    expect(d.pendingVotes.map((p) => [p.title, p.votingDeadline])).toEqual([
      ['Repaso antes de la entrega', new Date(2026, 8, 30, 20, 0).toISOString()],
    ]);
  });

  it('admin@test.com es ADMIN sin grupos, y la semilla lo deja ADMIN y ACTIVE aunque lo hayan cambiado', async () => {
    const db = await makeTestDb();
    await seedDemoData(db, HASH, NOW);
    const admin = () => db.one("SELECT role, status FROM users WHERE email = 'admin@test.com'");
    expect(await admin()).toEqual({ role: 'ADMIN', status: 'ACTIVE' });
    expect(await column(db, "SELECT u.email AS v FROM users u JOIN group_members m ON m.user_id = u.id WHERE u.email = 'admin@test.com'")).toEqual([]);
    expect(await column(db, "SELECT email AS v FROM users WHERE role = 'ADMIN'")).toEqual(['admin@test.com']);
    await db.query("UPDATE users SET role = 'USER', status = 'SUSPENDED' WHERE email = 'admin@test.com'");
    expect((await seedDemoData(db, HASH, NOW)).adminReset).toBe(true); // la semilla lo avisa por consola
    expect(await admin()).toEqual({ role: 'ADMIN', status: 'ACTIVE' });
    expect((await seedDemoData(db, HASH, NOW)).adminReset).toBe(false); // ya estaba bien: nada que avisar
  });

  it('users.created_at y groups.created_at salen del reloj inyectado, en ISO (las estadísticas comparan rangos ISO)', async () => {
    const db = await makeTestDb();
    await seedDemoData(db, HASH, NOW);
    expect(await column(db, 'SELECT DISTINCT created_at AS v FROM users')).toEqual([NOW.toISOString()]);
    expect(await column(db, 'SELECT DISTINCT created_at AS v FROM groups')).toEqual([NOW.toISOString()]);
  });

  it('repetirla días después no duplica nada y renueva las fechas', async () => {
    const db = await makeTestDb();
    await seedDemoData(db, HASH, NOW);
    const before = await snapshot(db);
    const demoIds = () => column(db, "SELECT id AS v FROM proposals WHERE title IN ('Reunión de avance del proyecto', 'Repaso antes de la entrega') ORDER BY title");
    const idsBefore = await demoIds();
    const later = new Date(NOW.getTime() + 10 * DAY); // viernes 9/10 10:00
    expect(await seedDemoData(db, HASH, later)).toEqual({ users: 0, groups: 0, blocks: 0, proposals: 2, adminReset: false });
    expect(await snapshot(db)).toEqual(before);
    // Las dos propuestas de ejemplo se recrean con ids nuevos.
    const idsAfter = await demoIds();
    expect(idsAfter).toHaveLength(2);
    expect(idsAfter.filter((id) => idsBefore.includes(id))).toEqual([]);
    const d = await dashboardOf(db, later);
    expect(d.nextPlan?.scheduledAt).toBe(new Date(2026, 9, 11, 11, 0).toISOString());
    expect(d.pendingVotes.map((p) => p.votingDeadline)).toEqual([new Date(2026, 9, 10, 20, 0).toISOString()]);
  });

  it('no toca las propuestas creadas desde la app y devuelve al grupo a quien se había ido', async () => {
    const db = await makeTestDb();
    await seedDemoData(db, HASH, NOW);
    const groupId = (await db.one<{ id: string }>("SELECT id FROM groups WHERE invite_code = 'PROY2026'"))!.id;
    const anaId = await userId(db, 'ana@test.com');
    const mine = await proposalsRepository(db).create({
      groupId,
      createdBy: anaId,
      title: 'Plan propio',
      location: null,
      votingDeadline: new Date(NOW.getTime() + DAY).toISOString(),
      windows: [{ dayOfWeek: 2, startTime: '16:00', endTime: '18:00', availabilityPercentage: 100 }],
      createdAt: NOW.toISOString(),
    });
    await groupsRepository(db).leave(groupId, anaId);

    await seedDemoData(db, HASH, NOW);
    // Sigue existiendo con el mismo id (findById lo encuentra por él).
    expect((await proposalsRepository(db).findById(mine, anaId))?.id).toBe(mine);
    expect((await proposalsRepository(db).findById(mine, anaId))?.title).toBe('Plan propio');
    expect(await count(db, 'proposals')).toBe(3);
    expect((await groupsRepository(db).findById(groupId))!.members.map((m) => [m.name, m.role])).toEqual([
      ['Usuario de Prueba', 'OWNER'],
      ['Ana', 'MEMBER'],
    ]);
  });

  it.each([
    ['sábado 23:30', new Date(2026, 9, 3, 23, 30), new Date(2026, 9, 5, 11, 0), new Date(2026, 9, 4, 20, 0)],
    ['miércoles 20:30, ya pasadas las 20:00', new Date(2026, 8, 30, 20, 30), new Date(2026, 9, 2, 11, 0), new Date(2026, 9, 1, 20, 0)],
  ])('con el reloj en %s: plan confirmado en 2 días a las 11:00 y plazo de votación futuro', async (_label, now, scheduled, deadline) => {
    const db = await makeTestDb();
    await seedDemoData(db, HASH, now);
    const id = await userId(db, 'test@test.com');
    const all = await proposalsRepository(db).listForUser(id);
    const confirmed = all.find((p) => p.state === 'CONFIRMADO')!;
    expect(confirmed.scheduledAt).toBe(scheduled.toISOString());
    // La franja elegida cae en el mismo día de la semana que la fecha del plan.
    const chosen = confirmed.windows.find((w) => w.id === confirmed.chosenWindowId)!;
    expect(chosen.dayOfWeek).toBe(((scheduled.getDay() + 6) % 7) + 1);
    expect(chosen.startTime).toBe('11:00');
    const open = all.find((p) => p.state === 'PROPUESTO')!;
    expect(open.votingDeadline).toBe(deadline.toISOString());
    expect(new Date(open.votingDeadline).getTime()).toBeGreaterThan(now.getTime());
  });
});
