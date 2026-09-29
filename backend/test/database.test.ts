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

describe('migración de time_blocks', () => {
  const setup = () => {
    const db = openDatabase(':memory:');
    db.prepare("INSERT INTO users (id, name, email, password_hash) VALUES ('u1', 'Ana', 'ana@correo.com', 'x')").run();
    const insert = db.prepare(
      `INSERT INTO time_blocks (id, user_id, label, type, start_time, end_time, is_recurring, day_of_week, date)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    return { db, insert };
  };

  it('exige día en los recurrentes y fecha en los puntuales', () => {
    const { insert } = setup();
    expect(() => insert.run('b1', 'u1', 'Clase', 'CLASE', '08:00', '10:00', 1, 1, null)).not.toThrow();
    expect(() => insert.run('b2', 'u1', 'Dentista', 'PUNTUAL', '15:00', '16:00', 0, null, '2026-10-02')).not.toThrow();
    expect(() => insert.run('b3', 'u1', 'Sin día', 'CLASE', '08:00', '10:00', 1, null, null)).toThrow();
    expect(() => insert.run('b4', 'u1', 'Tipo raro', 'OTRO', '08:00', '10:00', 1, 1, null)).toThrow();
    expect(() => insert.run('b5', 'u1', 'Al revés', 'CLASE', '10:00', '08:00', 1, 1, null)).toThrow();
  });

  it('borrar un usuario borra sus bloques', () => {
    const { db, insert } = setup();
    insert.run('b1', 'u1', 'Clase', 'CLASE', '08:00', '10:00', 1, 1, null);
    db.prepare("DELETE FROM users WHERE id = 'u1'").run();
    const { n } = db.prepare('SELECT COUNT(*) AS n FROM time_blocks').get() as { n: number };
    expect(n).toBe(0);
  });
});

describe('migración de grupos', () => {
  it('borrar un grupo borra sus miembros y el código de invitación es único', () => {
    const db = openDatabase(':memory:');
    db.prepare("INSERT INTO users (id, name, email, password_hash) VALUES ('u1', 'Ana', 'ana@correo.com', 'x')").run();
    const insertGroup = db.prepare("INSERT INTO groups (id, name, invite_code) VALUES (?, 'Grupo', ?)");
    insertGroup.run('g1', 'PROY2026');
    expect(() => insertGroup.run('g2', 'PROY2026')).toThrow();
    db.prepare("INSERT INTO group_members (group_id, user_id, role) VALUES ('g1', 'u1', 'OWNER')").run();
    expect(() => db.prepare("INSERT INTO group_members (group_id, user_id, role) VALUES ('g1', 'u1', 'MEMBER')").run()).toThrow();
    db.prepare("DELETE FROM groups WHERE id = 'g1'").run();
    const { n } = db.prepare('SELECT COUNT(*) AS n FROM group_members').get() as { n: number };
    expect(n).toBe(0);
  });
});
