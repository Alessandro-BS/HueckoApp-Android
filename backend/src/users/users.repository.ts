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
     * Registro sobre un correo que nadie confirmó: cambia nombre y contraseña y anula todos sus códigos pendientes (el
     * código que ya recibió la dueña del correo no debe confirmar la cuenta con la contraseña nueva). Solo si sigue sin
     * verificar y sin Google: lo comprueba al escribir (si otra petición lo verificó o lo vinculó justo antes, 409
     * EMAIL_TAKEN). Bloquea primero la cuenta y después los retos, el mismo orden que la verificación del código y
     * issueChallenge: si hay una verificación en curso, esta espera a que termine y ve la cuenta ya verificada.
     */
    async replaceUnverified(id: string, input: { name: string; passwordHash: string; now: string }): Promise<Account> {
      return db.transaction(async () => {
        await db.query('SELECT id FROM users WHERE id = $1 FOR UPDATE', [id]);
        await db.query('UPDATE auth_challenges SET consumed_at = $2 WHERE user_id = $1 AND consumed_at IS NULL', [id, input.now]);
        const { rowCount } = await db.query(
          'UPDATE users SET name = $2, password_hash = $3 WHERE id = $1 AND email_verified = false AND google_sub IS NULL',
          [id, input.name, input.passwordHash],
        );
        const account = rowCount > 0 ? await findById(id) : undefined;
        if (!account) throw emailTaken();
        return account;
      });
    },
    /** Cuenta creada al entrar con Google: nombre de Google, sin contraseña, correo verificado. El UNIQUE de email/google_sub lo lanza tal cual (carrera: el llamador reintenta la búsqueda). */
    async createFromGoogle(input: { name: string; email: string; sub: string; createdAt: string }): Promise<Account> {
      const id = randomUUID();
      await db.query('INSERT INTO users (id, name, email, email_verified, google_sub, created_at) VALUES ($1, $2, $3, true, $4, $5)', [
        id, input.name, input.email, input.sub, input.createdAt,
      ]);
      return (await findById(id))!;
    },
    /**
     * Vincula la cuenta a Google y la da por verificada. Decide bajo el candado de la fila (no con lo leído antes) si la
     * cuenta estaba sin verificar: entonces el registro pudo ser de otra persona, así que pierde la contraseña y el 2FA,
     * toma el nombre de Google y se anulan sus códigos pendientes (nadie debe verificar el registro viejo). Una cuenta
     * verificada conserva todo. Bloquea la cuenta antes que los retos (mismo orden que el resto de auth). Si ya tenía
     * otro Google, undefined; si ya tenía este mismo (otra petición se adelantó), la devuelve como está.
     */
    async linkGoogle(id: string, sub: string, input: { googleName: string; now: string }): Promise<Account | undefined> {
      return db.transaction(async () => {
        const row = await db.one<UserRow>('SELECT * FROM users WHERE id = $1 FOR UPDATE', [id]);
        if (!row) return undefined;
        if (row.google_sub !== null) return row.google_sub === sub ? toAccount(row) : undefined;
        if (row.email_verified) {
          await db.query('UPDATE users SET google_sub = $2 WHERE id = $1', [id, sub]);
        } else {
          await db.query('UPDATE auth_challenges SET consumed_at = $2 WHERE user_id = $1 AND consumed_at IS NULL', [id, input.now]);
          await db.query(
            'UPDATE users SET google_sub = $2, email_verified = true, password_hash = NULL, two_factor_enabled = false, name = $3 WHERE id = $1',
            [id, sub, input.googleName],
          );
        }
        return findById(id);
      });
    },
    async findByGoogleSub(sub: string): Promise<Account | undefined> {
      const row = await db.one<UserRow>('SELECT * FROM users WHERE google_sub = $1', [sub]);
      return row && toAccount(row);
    },
    async markEmailVerified(id: string): Promise<void> {
      await db.query('UPDATE users SET email_verified = true WHERE id = $1', [id]);
    },
    /** Contraseña nueva: sube la versión de sesión (los JWT anteriores caen) y confirma el correo. Devuelve la versión nueva. */
    async resetPassword(id: string, passwordHash: string): Promise<number> {
      const row = await db.one<{ session_version: number }>(
        'UPDATE users SET password_hash = $2, session_version = session_version + 1, email_verified = true WHERE id = $1 RETURNING session_version',
        [id, passwordHash],
      );
      if (!row) throw new Error('cuenta inexistente');
      return row.session_version;
    },
    async setTwoFactor(id: string, enabled: boolean): Promise<void> {
      await db.query('UPDATE users SET two_factor_enabled = $2 WHERE id = $1', [id, enabled]);
    },
    async findPasswordHash(id: string): Promise<string | null> {
      const row = await db.one<{ password_hash: string | null }>('SELECT password_hash FROM users WHERE id = $1', [id]);
      return row?.password_hash ?? null;
    },
    async findByEmail(email: string): Promise<(Account & { passwordHash: string | null }) | undefined> {
      const row = await db.one<UserRow>('SELECT * FROM users WHERE email = $1', [email]);
      return row && { ...toAccount(row), passwordHash: row.password_hash };
    },
    findById,
  };
}
