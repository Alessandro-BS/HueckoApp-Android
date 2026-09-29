import { randomUUID } from 'node:crypto';

import type { User } from '@hueckoapp/shared';

import type { Db } from '../db/database';

type UserRow = { id: string; name: string; email: string; password_hash: string };

const toUser = (row: UserRow): User => ({ id: row.id, name: row.name, email: row.email });

export function usersRepository(db: Db) {
  return {
    create(input: { name: string; email: string; passwordHash: string }): User {
      const id = randomUUID();
      db.prepare('INSERT INTO users (id, name, email, password_hash) VALUES (?, ?, ?, ?)').run(
        id, input.name, input.email, input.passwordHash,
      );
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
