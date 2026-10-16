import { randomUUID } from 'node:crypto';

import type { CurrentUser, UserRole, UserStatus } from '@hueckoapp/shared';

import type { Db } from '../db/db';
import { isUniqueViolation } from '../db/errors';
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
    async create(input: { name: string; email: string; passwordHash: string; createdAt: string }): Promise<CurrentUser> {
      const id = randomUUID();
      try {
        await db.query('INSERT INTO users (id, name, email, password_hash, created_at) VALUES ($1, $2, $3, $4, $5)', [
          id, input.name, input.email, input.passwordHash, input.createdAt,
        ]);
      } catch (e) {
        // Dos registros simultáneos con el mismo correo pasan findByEmail; el UNIQUE los frena.
        if (isUniqueViolation(e, 'users_email_key')) {
          throw new ApiError(409, 'EMAIL_TAKEN', 'Ya existe una cuenta con ese correo.');
        }
        throw e;
      }
      return { id, name: input.name, email: input.email, role: 'USER' };
    },
    async findByEmail(email: string): Promise<(Account & { passwordHash: string }) | undefined> {
      const row = await db.one<UserRow>('SELECT * FROM users WHERE email = $1', [email]);
      return row && { ...toAccount(row), passwordHash: row.password_hash };
    },
    async findById(id: string): Promise<Account | undefined> {
      const row = await db.one<UserRow>('SELECT * FROM users WHERE id = $1', [id]);
      return row && toAccount(row);
    },
  };
}
