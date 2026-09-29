import { randomUUID } from 'node:crypto';

import type { User } from '@hueckoapp/shared';

import type { Db } from '../db/database';
import { ApiError } from '../middleware/errors';

type UserRow = { id: string; name: string; email: string; password_hash: string };

const toUser = (row: UserRow): User => ({ id: row.id, name: row.name, email: row.email });

export function usersRepository(db: Db) {
  return {
    create(input: { name: string; email: string; passwordHash: string }): User {
      const id = randomUUID();
      try {
        db.prepare('INSERT INTO users (id, name, email, password_hash) VALUES (?, ?, ?, ?)').run(
          id, input.name, input.email, input.passwordHash,
        );
      } catch (e) {
        // Dos registros simultáneos con el mismo correo pasan findByEmail; el UNIQUE los frena.
        if (e instanceof Error && e.message.includes('UNIQUE constraint failed: users.email')) {
          throw new ApiError(409, 'EMAIL_TAKEN', 'Ya existe una cuenta con ese correo.');
        }
        throw e;
      }
      return { id, name: input.name, email: input.email };
    },
    findByEmail(email: string): (User & { passwordHash: string }) | undefined {
      const row = db.prepare('SELECT * FROM users WHERE email = ?').get(email) as UserRow | undefined;
      return row && { ...toUser(row), passwordHash: row.password_hash };
    },
    findById(id: string): User | undefined {
      const row = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined;
      return row && toUser(row);
    },
  };
}
