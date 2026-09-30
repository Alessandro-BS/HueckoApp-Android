import { describe, expect, it } from 'vitest';

import { buildDashboard } from '../src/dashboard/dashboard';
import { openDatabase, type Db } from '../src/db/database';
import { seedDemoData } from '../src/db/demo-data';
import { groupsRepository } from '../src/groups/groups.repository';
import { proposalsRepository } from '../src/proposals/proposals.repository';
import { NOW } from './helpers';

const DAY = 86_400_000;
// La semilla solo guarda el hash: los tests no necesitan bcrypt.
const HASH = 'hash-de-prueba';
const TABLES = ['users', 'groups', 'group_members', 'time_blocks', 'proposals', 'proposal_windows', 'votes', 'incidences'];

const count = (db: Db, table: string) => (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;
const snapshot = (db: Db) => Object.fromEntries(TABLES.map((t) => [t, count(db, t)]));
const userId = (db: Db, email: string) => (db.prepare('SELECT id FROM users WHERE email = ?').get(email) as { id: string }).id;
const column = (db: Db, sql: string) => (db.prepare(sql).all() as { v: string }[]).map((r) => r.v);

// Lo que ve test@test.com en Inicio con la base sembrada.
function dashboardOf(db: Db, now: Date) {
  const id = userId(db, 'test@test.com');
  const groups = groupsRepository(db);
  return buildDashboard({
    now,
    groups: groups.listForUser(id),
    proposals: proposalsRepository(db).listForUser(id),
    totalBlocks: 2,
    membersOf: (groupId) => groups.findById(groupId)?.members ?? [],
  });
}

describe('semilla de datos de ejemplo (D8)', () => {
  it('crea las cuentas, los códigos y las dos propuestas con fechas relativas a hoy', () => {
    const db = openDatabase(':memory:');
    expect(seedDemoData(db, HASH, NOW)).toEqual({ users: 3, groups: 2, blocks: 5, proposals: 2 });
    expect(column(db, 'SELECT email AS v FROM users ORDER BY email')).toEqual(['ana@test.com', 'carlos@test.com', 'test@test.com']);
    expect(column(db, 'SELECT invite_code AS v FROM groups ORDER BY invite_code')).toEqual(['HUECKO123', 'PROY2026']);

    const d = dashboardOf(db, NOW);
    // NOW = martes 29/09 10:00 → el plan confirmado es dentro de 2 días, el jueves 1/10 a las 11:00.
    expect(d.nextPlan).toMatchObject({
      title: 'Reunión de avance del proyecto',
      scheduledAt: new Date(2026, 9, 1, 11, 0).toISOString(),
      scheduledDate: '2026-10-01',
    });
    expect(d.expressAlert).toMatchObject({ kind: 'AVISO', who: 'Ana', canResolve: true });
    // La votación abierta cierra mañana a las 20:00.
    expect(d.pendingVotes.map((p) => [p.title, p.votingDeadline])).toEqual([
      ['Repaso antes de la entrega', new Date(2026, 8, 30, 20, 0).toISOString()],
    ]);
  });

  it('repetirla días después no duplica nada y renueva las fechas', () => {
    const db = openDatabase(':memory:');
    seedDemoData(db, HASH, NOW);
    const before = snapshot(db);
    const demoIds = () => column(db, "SELECT id AS v FROM proposals WHERE title IN ('Reunión de avance del proyecto', 'Repaso antes de la entrega') ORDER BY title");
    const idsBefore = demoIds();
    const later = new Date(NOW.getTime() + 10 * DAY); // viernes 9/10 10:00
    expect(seedDemoData(db, HASH, later)).toEqual({ users: 0, groups: 0, blocks: 0, proposals: 2 });
    expect(snapshot(db)).toEqual(before);
    // Las dos propuestas de ejemplo se recrean con ids nuevos.
    const idsAfter = demoIds();
    expect(idsAfter).toHaveLength(2);
    expect(idsAfter.filter((id) => idsBefore.includes(id))).toEqual([]);
    const d = dashboardOf(db, later);
    expect(d.nextPlan?.scheduledAt).toBe(new Date(2026, 9, 11, 11, 0).toISOString());
    expect(d.pendingVotes.map((p) => p.votingDeadline)).toEqual([new Date(2026, 9, 10, 20, 0).toISOString()]);
  });

  it('no toca las propuestas creadas desde la app y devuelve al grupo a quien se había ido', () => {
    const db = openDatabase(':memory:');
    seedDemoData(db, HASH, NOW);
    const groupId = (db.prepare("SELECT id FROM groups WHERE invite_code = 'PROY2026'").get() as { id: string }).id;
    const anaId = userId(db, 'ana@test.com');
    const mine = proposalsRepository(db).create({
      groupId,
      createdBy: anaId,
      title: 'Plan propio',
      location: null,
      votingDeadline: new Date(NOW.getTime() + DAY).toISOString(),
      windows: [{ dayOfWeek: 2, startTime: '16:00', endTime: '18:00', availabilityPercentage: 100 }],
      createdAt: NOW.toISOString(),
    });
    groupsRepository(db).leave(groupId, anaId);

    seedDemoData(db, HASH, NOW);
    // Sigue existiendo con el mismo id (findById lo encuentra por él).
    expect(proposalsRepository(db).findById(mine, anaId)?.id).toBe(mine);
    expect(proposalsRepository(db).findById(mine, anaId)?.title).toBe('Plan propio');
    expect(count(db, 'proposals')).toBe(3);
    expect(groupsRepository(db).findById(groupId)!.members.map((m) => [m.name, m.role])).toEqual([
      ['Usuario de Prueba', 'OWNER'],
      ['Ana', 'MEMBER'],
    ]);
  });

  it.each([
    ['sábado 23:30', new Date(2026, 9, 3, 23, 30), new Date(2026, 9, 5, 11, 0), new Date(2026, 9, 4, 20, 0)],
    ['miércoles 20:30, ya pasadas las 20:00', new Date(2026, 8, 30, 20, 30), new Date(2026, 9, 2, 11, 0), new Date(2026, 9, 1, 20, 0)],
  ])('con el reloj en %s: plan confirmado en 2 días a las 11:00 y plazo de votación futuro', (_label, now, scheduled, deadline) => {
    const db = openDatabase(':memory:');
    seedDemoData(db, HASH, now);
    const id = userId(db, 'test@test.com');
    const all = proposalsRepository(db).listForUser(id);
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
