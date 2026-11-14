import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { hashPassword } from '../src/auth/passwords';

import { instant, isoDay, mondayOf, validWeeks } from '../src/common/zone';
import { buildDashboard, upcomingPlans } from '../src/dashboard/dashboard';
import type { Db } from '../src/db/db';
import { DEMO_PASSWORD, seedDemoData } from '../src/db/demo-data';
import { groupsRepository } from '../src/groups/groups.repository';
import { proposalsRepository } from '../src/proposals/proposals.repository';
import { makeTestApp, makeTestDb, NOW } from './helpers';

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
  it('las cuentas de la semilla nacen verificadas y entran con su contraseña sin pedir código', async () => {
    const db = await makeTestDb();
    await seedDemoData(db, await hashPassword(DEMO_PASSWORD), NOW);
    expect(await column(db, 'SELECT DISTINCT email_verified::text AS v FROM users')).toEqual(['true']);
    const { app, emails } = await makeTestApp({ db });
    for (const email of ['test@test.com', 'admin@test.com']) {
      const res = await request(app).post('/api/auth/login').send({ email, password: DEMO_PASSWORD });
      expect(res.status, email).toBe(200);
      expect(typeof res.body.token, email).toBe('string');
      expect(res.body.user, email).toMatchObject({ email, emailVerified: true, hasPassword: true });
    }
    expect(emails.sent).toEqual([]);
  });

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

  it('no deja avisos pendientes: ni los suyos ni los de las propuestas de ejemplo de una siembra anterior', async () => {
    const db = await makeTestDb();
    const pending = async () => (await db.one<{ n: number }>('SELECT COUNT(*) AS n FROM notifications WHERE sent_at IS NULL'))!.n;
    await seedDemoData(db, HASH, NOW);
    expect(await pending()).toBe(0);
    // Un aviso pendiente de una propuesta de ejemplo (p. ej. de una semilla anterior, o de alguien que la usó desde la
    // app): al volver a sembrar, la propuesta se borra y su aviso también.
    const [demoId] = await column(db, "SELECT id AS v FROM proposals WHERE title = 'Reunión de avance del proyecto'");
    await db.query(
      `INSERT INTO notifications (id, user_id, kind, title, body, data, created_at)
       VALUES ('viejo', $1, 'PLAN_CONFIRMED', 'Proyecto Integrador', 'x', $2, $3)`,
      [await userId(db, 'ana@test.com'), JSON.stringify({ kind: 'PLAN_CONFIRMED', proposalId: demoId, groupId: 'g', screen: 'PLAN' }), NOW.toISOString()],
    );
    await seedDemoData(db, HASH, new Date(NOW.getTime() + DAY));
    expect(await pending()).toBe(0);
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
      windows: [{ date: '2026-09-29', startTime: '16:00', endTime: '18:00', availabilityPercentage: 100 }],
      multipleVotes: true,
      createdAt: NOW.toISOString(),
    });
    await groupsRepository(db).leave(groupId, anaId);
    // Su aviso NEW_PROPOSAL (a test@test.com) tampoco se toca.
    const notices = async () =>
      (await db.many<{ kind: string }>("SELECT kind FROM notifications WHERE data::json->>'proposalId' = $1", [mine])).map((r) => r.kind);
    expect(await notices()).toEqual(['NEW_PROPOSAL']);

    await seedDemoData(db, HASH, NOW);
    expect(await notices()).toEqual(['NEW_PROPOSAL']);
    // Sigue existiendo con el mismo id (findById lo encuentra por él).
    expect((await proposalsRepository(db).findById(mine, anaId))?.id).toBe(mine);
    expect((await proposalsRepository(db).findById(mine, anaId))?.title).toBe('Plan propio');
    expect(await count(db, 'proposals')).toBe(3);
    // Vuelve con su rol de la semilla (un grupo puede tener varios organizadores).
    expect((await groupsRepository(db).findById(groupId))!.members.map((m) => [m.name, m.role])).toEqual([
      ['Usuario de Prueba', 'ORGANIZER'],
      ['Ana', 'ORGANIZER'],
    ]);
  });

  it('«Proyecto Integrador» tiene dos organizadores (test y ana) y «Amigos de la Uni» uno (carlos)', async () => {
    const db = await makeTestDb();
    await seedDemoData(db, HASH, NOW);
    const organizers = (code: string) =>
      column(
        db,
        `SELECT u.email AS v FROM group_members m JOIN users u ON u.id = m.user_id JOIN groups g ON g.id = m.group_id
         WHERE g.invite_code = '${code}' AND m.role = 'ORGANIZER' ORDER BY m.joined_at, m.seq`,
      );
    expect(await organizers('PROY2026')).toEqual(['test@test.com', 'ana@test.com']);
    expect(await organizers('HUECKO123')).toEqual(['carlos@test.com']);
  });

  it('sembrar otra vez sobre una base donde Ana es MEMBER la deja ORGANIZER, sin degradar a nadie', async () => {
    const db = await makeTestDb();
    await seedDemoData(db, HASH, NOW);
    const groupId = (await db.one<{ id: string }>('SELECT id FROM groups WHERE invite_code = $1', ['PROY2026']))!.id;
    const anaId = await userId(db, 'ana@test.com');
    await db.query("UPDATE group_members SET role = 'MEMBER' WHERE group_id = $1 AND user_id = $2", [groupId, anaId]);
    // Carlos entra a mano como MEMBER: la semilla no le toca el rol.
    const carlosId = await userId(db, 'carlos@test.com');
    await groupsRepository(db).addMember(groupId, carlosId);

    await seedDemoData(db, HASH, NOW);
    await seedDemoData(db, HASH, NOW);
    expect((await groupsRepository(db).findById(groupId))!.members.map((m) => [m.name, m.role])).toEqual([
      ['Usuario de Prueba', 'ORGANIZER'],
      ['Ana', 'ORGANIZER'],
      ['Carlos', 'MEMBER'],
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
    // Franjas con fecha: la elegida es la fecha del plan; las de la votación empiezan después del plazo y caen en las
    // semanas válidas.
    expect(chosen.date).toBe(confirmed.scheduledDate);
    const weeks = validWeeks(now);
    for (const w of open.windows) {
      expect(isoDay(w.date)).toBe(w.dayOfWeek);
      expect(weeks).toContain(mondayOf(w.date));
      expect(instant(w.date, w.startTime).getTime()).toBeGreaterThan(new Date(open.votingDeadline).getTime());
    }
  });
});
