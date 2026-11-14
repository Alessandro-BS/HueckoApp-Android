import { randomUUID } from 'node:crypto';

import type { CurrentUser, UserRole, UserStatus } from '@hueckoapp/shared';

import type { Db } from '../db/db';
import { isUniqueViolation } from '../db/errors';
import { ApiError } from '../middleware/errors';

type UserRow = {
  id: string;
  name: string;
  email: string;
  password_hash: string | null;
  role: UserRole;
  status: UserStatus;
  email_verified: boolean;
  google_sub: string | null;
  two_factor_enabled: boolean;
  session_version: number;
};

// La cuenta completa: lo que ve su dueño (CurrentUser) más su estado y su versión de sesión, que no salen en /auth (D1).
export type Account = CurrentUser & { status: UserStatus; sessionVersion: number };

const toAccount = (row: UserRow): Account => ({
  id: row.id,
  name: row.name,
  email: row.email,
  role: row.role,
  emailVerified: row.email_verified,
  twoFactorEnabled: row.two_factor_enabled,
  hasPassword: row.password_hash !== null,
  hasGoogle: row.google_sub !== null,
  status: row.status,
  sessionVersion: row.session_version,
});

// Lo que devuelve /auth: sin el estado (una cuenta suspendida no llega a tener sesión) ni la versión de sesión.
export const toCurrentUser = ({ status: _status, sessionVersion: _sv, ...user }: Account): CurrentUser => user;

const emailTaken = () => new ApiError(409, 'EMAIL_TAKEN', 'Ya existe una cuenta con ese correo.');

export function usersRepository(db: Db) {
  const findById = async (id: string): Promise<Account | undefined> => {
    const row = await db.one<UserRow>('SELECT * FROM users WHERE id = $1', [id]);
    return row && toAccount(row);
  };

  return {
    // Siempre nace USER, ACTIVE y sin verificar (valores por defecto de la tabla): nadie se hace administrador al
    // registrarse y el correo se confirma con un código. `createdAt` sale del reloj de la app, como el resto de fechas
    // que cuentan las estadísticas.
    async create(input: { name: string; email: string; passwordHash: string; createdAt: string }): Promise<Account> {
      const id = randomUUID();
      try {
        await db.query('INSERT INTO users (id, name, email, password_hash, created_at) VALUES ($1, $2, $3, $4, $5)', [
          id, input.name, input.email, input.passwordHash, input.createdAt,
        ]);
      } catch (e) {
        // Dos registros simultáneos con el mismo correo pasan findByEmail; el UNIQUE los frena.
        if (isUniqueViolation(e, 'users_email_key')) throw emailTaken();
        throw e;
      }
      return {
        id,
        name: input.name,
        email: input.email,
        role: 'USER',
        emailVerified: false,
        twoFactorEnabled: false,
        hasPassword: true,
        hasGoogle: false,
        status: 'ACTIVE',
        sessionVersion: 0,
      };
    },
    /**
     * Registro sobre un correo que nadie confirmó: cambia nombre y contraseña. Solo si sigue sin verificar y sin Google
     * (lo comprueba al escribir: si otra petición lo verificó o lo vinculó justo antes, 409 EMAIL_TAKEN).
     */
    async replaceUnverified(id: string, input: { name: string; passwordHash: string }): Promise<Account> {
      const { rowCount } = await db.query(
        'UPDATE users SET name = $2, password_hash = $3 WHERE id = $1 AND email_verified = false AND google_sub IS NULL',
        [id, input.name, input.passwordHash],
      );
      const account = rowCount > 0 ? await findById(id) : undefined;
      if (!account) throw emailTaken();
      return account;
    },
    async markEmailVerified(id: string): Promise<void> {
      await db.query('UPDATE users SET email_verified = true WHERE id = $1', [id]);
    },
    async findByEmail(email: string): Promise<(Account & { passwordHash: string | null }) | undefined> {
      const row = await db.one<UserRow>('SELECT * FROM users WHERE email = $1', [email]);
      return row && { ...toAccount(row), passwordHash: row.password_hash };
    },
    findById,
  };
}
