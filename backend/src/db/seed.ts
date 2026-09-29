// Semilla de desarrollo (domain spec §3.2): usuarios, grupos y bloques de ejemplo.
// Uso: npm run seed -w backend. Idempotente: repetirla no duplica nada.
// Nunca se ejecuta en los tests ni en producción. Las propuestas de la semilla llegan en la Fase 3.
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

import type { BlockType } from '@hueckoapp/shared';

import { hashPassword } from '../auth/passwords';
import { env } from '../config/env';
import { openDatabase, type Db } from './database';
import { withTransaction } from './transaction';

export const DEMO_PASSWORD = 'password123';

const USERS = [
  { key: 'test', name: 'Usuario de Prueba', email: 'test@test.com' },
  { key: 'ana', name: 'Ana', email: 'ana@test.com' },
  { key: 'carlos', name: 'Carlos', email: 'carlos@test.com' },
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

function seed(db: Db, passwordHash: string) {
  const created = { users: 0, groups: 0, blocks: 0 };
  const ids = {} as Record<UserKey, string>;

  for (const u of USERS) {
    const found = db.prepare('SELECT id FROM users WHERE email = ?').get(u.email) as { id: string } | undefined;
    if (found) {
      ids[u.key] = found.id;
      continue;
    }
    ids[u.key] = randomUUID();
    db.prepare('INSERT INTO users (id, name, email, password_hash) VALUES (?, ?, ?, ?)').run(ids[u.key], u.name, u.email, passwordHash);
    created.users++;
  }

  for (const g of GROUPS) {
    if (db.prepare('SELECT 1 FROM groups WHERE invite_code = ?').get(g.inviteCode)) continue;
    const id = randomUUID();
    db.prepare("INSERT INTO groups (id, name, description, invite_code, availability_threshold) VALUES (?, ?, '', ?, 80)").run(
      id, g.name, g.inviteCode,
    );
    for (const m of g.members) {
      db.prepare('INSERT INTO group_members (group_id, user_id, role) VALUES (?, ?, ?)').run(id, ids[m.user], m.role);
    }
    created.groups++;
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

  return created;
}

async function main() {
  if (env.NODE_ENV === 'production') throw new Error('La semilla es solo para desarrollo.');
  const passwordHash = await hashPassword(DEMO_PASSWORD);
  mkdirSync(dirname(env.DATABASE_PATH), { recursive: true });
  const db = openDatabase(env.DATABASE_PATH);
  try {
    const created = withTransaction(db, () => seed(db, passwordHash));
    console.log(
      `Semilla aplicada en ${env.DATABASE_PATH}: ${created.users} usuarios, ${created.groups} grupos y ${created.blocks} bloques nuevos.`,
    );
    console.log(`Cuentas demo: test@test.com, ana@test.com y carlos@test.com — contraseña «${DEMO_PASSWORD}».`);
  } finally {
    db.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
