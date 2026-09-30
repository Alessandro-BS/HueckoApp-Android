import { randomUUID } from 'node:crypto';

import type { AiTask, ProposalState, User, UserRole, UserStatus } from '@hueckoapp/shared';
import type { Express } from 'express';

import type { Db } from '../src/db/database';
import { NOW, registerUser } from './helpers';

// Cuenta registrada por la API y promovida en la base, como haría `npm run make-admin`.
export async function registerAdmin(
  app: Express,
  db: Db,
  overrides: Partial<{ name: string; email: string }> = {},
): Promise<{ token: string; user: User }> {
  const session = await registerUser(app, { name: 'Admin', ...overrides });
  db.prepare("UPDATE users SET role = 'ADMIN' WHERE id = ?").run(session.user.id);
  return session;
}

// Cuenta creada directamente en la base (rápido, sin bcrypt ni sesión): listas largas y fechas concretas.
export function insertUser(
  db: Db,
  over: Partial<{ name: string; email: string; role: UserRole; status: UserStatus; createdAt: string }> = {},
): string {
  const id = randomUUID();
  db.prepare('INSERT INTO users (id, name, email, password_hash, role, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
    id,
    over.name ?? `Persona ${id.slice(0, 8)}`,
    over.email ?? `${id}@correo.com`,
    'hash-de-prueba',
    over.role ?? 'USER',
    over.status ?? 'ACTIVE',
    over.createdAt ?? new Date().toISOString(),
  );
  return id;
}

// Grupo creado en la base con fecha concreta; el OWNER y los miembros son opcionales.
export function insertGroup(
  db: Db,
  over: Partial<{ name: string; inviteCode: string; createdAt: string; ownerId: string; memberIds: string[] }> = {},
): string {
  const id = randomUUID();
  db.prepare("INSERT INTO groups (id, name, description, invite_code, availability_threshold, created_at) VALUES (?, ?, '', ?, 80, ?)").run(
    id,
    over.name ?? `Grupo ${id.slice(0, 8)}`,
    over.inviteCode ?? id.slice(0, 8).toUpperCase(),
    over.createdAt ?? new Date().toISOString(),
  );
  if (over.ownerId) db.prepare("INSERT INTO group_members (group_id, user_id, role) VALUES (?, ?, 'OWNER')").run(id, over.ownerId);
  for (const memberId of over.memberIds ?? []) {
    db.prepare("INSERT INTO group_members (group_id, user_id, role) VALUES (?, ?, 'MEMBER')").run(id, memberId);
  }
  return id;
}

// Propuesta sin franjas creada en la base (estadísticas y listas). `scheduledDate` se deriva a lo bruto del ISO:
// las estadísticas no lo usan.
export function insertProposal(
  db: Db,
  over: { groupId: string; createdBy: string } & Partial<{ title: string; state: ProposalState; createdAt: string; scheduledAt: string | null }>,
): string {
  const id = randomUUID();
  const scheduledAt = over.scheduledAt ?? null;
  db.prepare(
    `INSERT INTO proposals (id, group_id, title, created_by, voting_deadline, state, scheduled_at, scheduled_date, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id, over.groupId, over.title ?? 'Plan', over.createdBy, '2026-10-03T01:00:00.000Z', over.state ?? 'PROPUESTO',
    scheduledAt, scheduledAt ? scheduledAt.slice(0, 10) : null, over.createdAt ?? new Date().toISOString(),
  );
  return id;
}

// Llamada a la IA anotada a mano (por defecto: voting-summary correcta de 1 s en NOW).
export function insertAiCall(
  db: Db,
  over: Partial<{ userId: string | null; task: AiTask; ok: boolean; durationMs: number; createdAt: string }> = {},
): void {
  db.prepare('INSERT INTO ai_calls (user_id, task, ok, duration_ms, created_at) VALUES (?, ?, ?, ?, ?)').run(
    over.userId ?? null,
    over.task ?? 'voting-summary',
    over.ok === false ? 0 : 1,
    over.durationMs ?? 1000,
    over.createdAt ?? NOW.toISOString(),
  );
}
