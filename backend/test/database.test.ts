import { describe, expect, it } from 'vitest';

import { migrate, openDatabase } from '../src/db/database';
import { migrations } from '../src/db/migrations';

describe('openDatabase', () => {
  it('aplica todas las migraciones y deja user_version al día', () => {
    const db = openDatabase(':memory:');
    const { user_version } = db.prepare('PRAGMA user_version').get() as { user_version: number };
    expect(user_version).toBe(migrations.length);
  });

  it('crea la tabla users con email único', () => {
    const db = openDatabase(':memory:');
    const insert = db.prepare('INSERT INTO users (id, name, email, password_hash) VALUES (?, ?, ?, ?)');
    insert.run('1', 'Ana', 'ana@correo.com', 'x');
    expect(() => insert.run('2', 'Otra', 'ana@correo.com', 'y')).toThrow();
  });

  it('es idempotente: migrar una base ya migrada no hace nada', () => {
    const db = openDatabase(':memory:');
    expect(() => migrate(db)).not.toThrow();
    const { user_version } = db.prepare('PRAGMA user_version').get() as { user_version: number };
    expect(user_version).toBe(migrations.length);
  });

  it('activa las claves foráneas', () => {
    const db = openDatabase(':memory:');
    const { foreign_keys } = db.prepare('PRAGMA foreign_keys').get() as { foreign_keys: number };
    expect(foreign_keys).toBe(1);
  });
});
