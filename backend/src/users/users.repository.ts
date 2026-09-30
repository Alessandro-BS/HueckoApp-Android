import { randomUUID } from 'node:crypto';

import type { CurrentUser, UserRole, UserStatus } from '@hueckoapp/shared';

import type { Db } from '../db/database';
import { ApiError } from '../middleware/errors';

type UserRow = { id: string; name: string; email: string; password_hash: string; role: UserRole; status: UserStatus };

// La cuenta completa: lo que ve su dueño (CurrentUser) más su estado. El estado no sale en /auth (D1).
export type Account = CurrentUser & { status: UserStatus };

const toAccount = (row: UserRow): Account => ({ id: row.id, name: row.name, email: row.email, role: row.role, status: row.status });

// Lo que devuelve /auth: sin el estado (una cuenta suspendida no llega a tener sesión).
export const toCurrentUser = ({ status: _status, ...user }: Account): CurrentUser => user;

export function usersRepository(db: Db) {
  return {
    // Siempre nace USER y ACTIVE (valores por defecto de la tabla): nadie se hace administrador al registrarse.
    // `createdAt` sale del reloj de la app, como el resto de fechas que cuentan las estadísticas.
    create(input: { name: string; email: string; passwordHash: string; createdAt: string }): CurrentUser {
      const id = randomUUID();
      try {
        db.prepare('INSERT INTO users (id, name, email, password_hash, created_at) VALUES (?, ?, ?, ?, ?)').run(
          id, input.name, input.email, input.passwordHash, input.createdAt,
        );
      } catch (e) {
        // Dos registros simultáneos con el mismo correo pasan findByEmail; el UNIQUE los frena.
        if (e instanceof Error && e.message.includes('UNIQUE constraint failed: users.email')) {
          throw new ApiError(409, 'EMAIL_TAKEN', 'Ya existe una cuenta con ese correo.');
        }
        throw e;
      }
      return { id, name: input.name, email: input.email, role: 'USER' };
    },
    findByEmail(email: string): (Account & { passwordHash: string }) | undefined {
      const row = db.prepare('SELECT * FROM users WHERE email = ?').get(email) as UserRow | undefined;
      return row && { ...toAccount(row), passwordHash: row.password_hash };
    },
    findById(id: string): Account | undefined {
      const row = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined;
      return row && toAccount(row);
    },
  };
}
