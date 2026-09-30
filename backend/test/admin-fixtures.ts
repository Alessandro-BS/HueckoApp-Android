import { randomUUID } from 'node:crypto';

import type { User, UserRole, UserStatus } from '@hueckoapp/shared';
import type { Express } from 'express';

import type { Db } from '../src/db/database';
import { registerUser } from './helpers';

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
