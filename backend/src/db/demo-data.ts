// Datos de ejemplo (domain spec §3.2): usuarios, grupos, bloques y dos propuestas con fechas RELATIVAS a `now`,
// para que la demo siempre tenga un plan confirmado en los próximos días y una votación abierta (D8).
// Idempotente: repetirlo no duplica nada y renueva las dos propuestas de ejemplo. No lee el entorno (lo prueban los tests).
import { randomUUID } from 'node:crypto';

import type { BlockType } from '@hueckoapp/shared';

import { proposalsRepository } from '../proposals/proposals.repository';
import { criticalityFor, scheduleFor } from '../proposals/rules';
import type { Db } from './database';
import { withTransaction } from './transaction';

export const DEMO_PASSWORD = 'password123';
export const DEMO_PROPOSAL_TITLES = ['Reunión de avance del proyecto', 'Repaso antes de la entrega'] as const;

// adminReset: admin@test.com había dejado de ser ADMIN activo y la semilla lo restableció (seed.ts lo avisa).
export type SeedCounts = { users: number; groups: number; blocks: number; proposals: number; adminReset: boolean };

export const DEMO_ADMIN_EMAIL = 'admin@test.com';

const USERS = [
  { key: 'test', name: 'Usuario de Prueba', email: 'test@test.com', role: 'USER' },
  { key: 'ana', name: 'Ana', email: 'ana@test.com', role: 'USER' },
  { key: 'carlos', name: 'Carlos', email: 'carlos@test.com', role: 'USER' },
  // Administración de la app (D3): no pertenece a ningún grupo.
  { key: 'admin', name: 'Administración HueckoApp', email: DEMO_ADMIN_EMAIL, role: 'ADMIN' },
] as const;
type UserKey = (typeof USERS)[number]['key'];

const GROUPS: { name: string; inviteCode: string; members: { user: UserKey; role: 'OWNER' | 'MEMBER' }[] }[] = [
  {
    name: 'Proyecto Integrador',
    inviteCode: 'PROY2026',
    members: [{ user: 'test', role: 'OWNER' }, { user: 'ana', role: 'MEMBER' }],
  },
  // Solo Carlos: así test@test.com puede probar «Unirme» con HUECKO123 (y una segunda vez da 409).
  { name: 'Amigos de la Uni', inviteCode: 'HUECKO123', members: [{ user: 'carlos', role: 'OWNER' }] },
];

const BLOCKS: { user: UserKey; label: string; type: BlockType; dayOfWeek: number; startTime: string; endTime: string }[] = [
  { user: 'test', label: 'Clase de Android', type: 'CLASE', dayOfWeek: 1, startTime: '08:00', endTime: '10:00' },
  { user: 'test', label: 'Trabajo Part-time', type: 'CLASE', dayOfWeek: 3, startTime: '14:00', endTime: '16:00' },
  { user: 'ana', label: 'Clase de Redes', type: 'CLASE', dayOfWeek: 1, startTime: '08:00', endTime: '12:00' },
  { user: 'ana', label: 'Turno de tarde', type: 'CLASE', dayOfWeek: 3, startTime: '15:00', endTime: '19:00' },
  { user: 'ana', label: 'Laboratorio', type: 'CLASE', dayOfWeek: 5, startTime: '09:00', endTime: '11:00' },
];

const HOUR = 3_600_000;

/** Día ISO (1 = lunes … 7 = domingo) de una fecha en hora local. */
const isoDayOf = (date: Date) => ((date.getDay() + 6) % 7) + 1;

// Los porcentajes son los fijos de la semilla Kotlin (el viernes figura con 50 % aunque el cruce dé 100 %, B15).
function seedProposals(db: Db, ids: Record<UserKey, string>, now: Date): number {
  const { id: groupId } = db.prepare("SELECT id FROM groups WHERE invite_code = 'PROY2026'").get() as { id: string };
  const proposals = proposalsRepository(db);
  const ago = (hours: number) => new Date(now.getTime() - hours * HOUR).toISOString();
  const [meetingTitle, reviewTitle] = DEMO_PROPOSAL_TITLES;

  // Se renuevan en cada ejecución: se borran las de la semilla anterior (sus franjas, votos e incidencias caen por
  // ON DELETE CASCADE) y se crean otra vez con fechas de hoy. Las propuestas creadas desde la app no se tocan.
  const remove = db.prepare('DELETE FROM proposals WHERE group_id = ? AND title = ? AND created_by = ?');
  remove.run(groupId, meetingTitle, ids.test);
  remove.run(groupId, reviewTitle, ids.ana);

  // «Reunión de avance del proyecto»: confirmada para dentro de 2 días a las 11:00, votada por los dos y con el
  // imprevisto de Ana sin resolver (aviso en Inicio).
  const inTwoDays = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 2);
  const meetingId = proposals.create({
    groupId,
    createdBy: ids.test,
    title: meetingTitle,
    location: { name: 'Biblioteca central', latitude: null, longitude: null },
    votingDeadline: ago(24),
    windows: [{ dayOfWeek: isoDayOf(inTwoDays), startTime: '11:00', endTime: '13:00', availabilityPercentage: 100 }],
    createdAt: ago(48),
  });
  const [meetingWindow] = proposals.findById(meetingId, ids.test)!.windows;
  proposals.vote(meetingId, ids.test, meetingWindow.id, ago(30));
  proposals.vote(meetingId, ids.ana, meetingWindow.id, ago(30));
  const { scheduledAt, scheduledDate } = scheduleFor(meetingWindow.dayOfWeek, meetingWindow.startTime, now);
  proposals.confirm(meetingId, meetingWindow.id, scheduledAt, scheduledDate);
  proposals.reportIncidence(
    meetingId,
    {
      userId: ids.ana,
      type: 'IMPREVISTO',
      reason: 'Cruce con un examen de laboratorio a última hora.',
      delayMinutes: null,
      criticality: criticalityFor('IMPREVISTO', false, null),
      createdAt: ago(2),
    },
    false,
  );

  // «Repaso antes de la entrega»: en votación hasta mañana a las 20:00 (siempre en el futuro), con el voto de Ana.
  const reviewId = proposals.create({
    groupId,
    createdBy: ids.ana,
    title: reviewTitle,
    location: { name: 'Google Meet', latitude: null, longitude: null },
    votingDeadline: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 20, 0).toISOString(),
    windows: [
      { dayOfWeek: 2, startTime: '16:00', endTime: '18:00', availabilityPercentage: 100 },
      { dayOfWeek: 4, startTime: '10:00', endTime: '12:00', availabilityPercentage: 100 },
      { dayOfWeek: 5, startTime: '16:00', endTime: '18:00', availabilityPercentage: 50 },
    ],
    createdAt: ago(1),
  });
  const tuesday = proposals.findById(reviewId, ids.ana)!.windows.find((w) => w.dayOfWeek === 2)!;
  proposals.vote(reviewId, ids.ana, tuesday.id, now.toISOString());

  return DEMO_PROPOSAL_TITLES.length;
}

export function seedDemoData(db: Db, passwordHash: string, now: Date): SeedCounts {
  return withTransaction(db, () => {
    const created: SeedCounts = { users: 0, groups: 0, blocks: 0, proposals: 0, adminReset: false };
    const ids = {} as Record<UserKey, string>;

    for (const u of USERS) {
      const found = db.prepare('SELECT id FROM users WHERE email = ?').get(u.email) as { id: string } | undefined;
      if (found) {
        ids[u.key] = found.id;
        continue;
      }
      ids[u.key] = randomUUID();
      // created_at del reloj inyectado (ISO), como el registro por la API: las estadísticas comparan rangos ISO.
      db.prepare('INSERT INTO users (id, name, email, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(
        ids[u.key], u.name, u.email, passwordHash, u.role, now.toISOString(),
      );
      created.users++;
    }
    // La cuenta demo de administración sigue siéndolo aunque se haya cambiado desde la app o la consola.
    // No se anota en el registro de acciones (solo desarrollo; la semilla no corre en producción): se avisa por consola.
    const reset = db
      .prepare("UPDATE users SET role = 'ADMIN', status = 'ACTIVE' WHERE email = ? AND (role <> 'ADMIN' OR status <> 'ACTIVE')")
      .run(DEMO_ADMIN_EMAIL);
    created.adminReset = Number(reset.changes) > 0;

    for (const g of GROUPS) {
      let group = db.prepare('SELECT id FROM groups WHERE invite_code = ?').get(g.inviteCode) as { id: string } | undefined;
      if (!group) {
        group = { id: randomUUID() };
        db.prepare("INSERT INTO groups (id, name, description, invite_code, availability_threshold, created_at) VALUES (?, ?, '', ?, 80, ?)").run(
          group.id, g.name, g.inviteCode, now.toISOString(),
        );
        created.groups++;
      }
      // Quien salió del grupo desde la app vuelve a entrar; como MEMBER si el grupo ya tiene OWNER (nunca dos).
      for (const m of g.members) {
        db.prepare(
          `INSERT OR IGNORE INTO group_members (group_id, user_id, role)
           VALUES (?, ?, CASE WHEN EXISTS (SELECT 1 FROM group_members WHERE group_id = ? AND role = 'OWNER') THEN 'MEMBER' ELSE ? END)`,
        ).run(group.id, ids[m.user], group.id, m.role);
      }
    }

    for (const b of BLOCKS) {
      const exists = db
        .prepare('SELECT 1 FROM time_blocks WHERE user_id = ? AND label = ? AND day_of_week = ? AND start_time = ?')
        .get(ids[b.user], b.label, b.dayOfWeek, b.startTime);
      if (exists) continue;
      db.prepare(
        `INSERT INTO time_blocks (id, user_id, label, type, start_time, end_time, is_recurring, day_of_week, date)
         VALUES (?, ?, ?, ?, ?, ?, 1, ?, NULL)`,
      ).run(randomUUID(), ids[b.user], b.label, b.type, b.startTime, b.endTime, b.dayOfWeek);
      created.blocks++;
    }

    created.proposals = seedProposals(db, ids, now);
    return created;
  });
}
