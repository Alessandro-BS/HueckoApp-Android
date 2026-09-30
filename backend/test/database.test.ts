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

describe('migración de propuestas', () => {
  const setup = () => {
    const db = openDatabase(':memory:');
    db.exec(`
      INSERT INTO users (id, name, email, password_hash) VALUES ('u1', 'Ana', 'ana@correo.com', 'x'), ('u2', 'Beto', 'beto@correo.com', 'x');
      INSERT INTO groups (id, name, invite_code) VALUES ('g1', 'Grupo', 'ABCDEFGH');
      INSERT INTO proposals (id, group_id, title, created_by, voting_deadline, created_at) VALUES
        ('p1', 'g1', 'Plan', 'u1', '2026-10-03T20:00:00.000Z', '2026-09-29T10:00:00.000Z'),
        ('p2', 'g1', 'Otro', 'u1', '2026-10-03T20:00:00.000Z', '2026-09-29T10:00:00.000Z');
      INSERT INTO proposal_windows (id, proposal_id, day_of_week, start_time, end_time, availability_percentage) VALUES
        ('w1', 'p1', 2, '16:00', '18:00', 100),
        ('w2', 'p2', 4, '10:00', '12:00', 100);
    `);
    return db;
  };

  it('un voto por persona y propuesta, y solo a franjas de esa propuesta', () => {
    const db = setup();
    const vote = db.prepare('INSERT INTO votes (proposal_id, user_id, window_id) VALUES (?, ?, ?)');
    expect(() => vote.run('p1', 'u1', 'w1')).not.toThrow();
    expect(() => vote.run('p1', 'u1', 'w1')).toThrow();
    expect(() => vote.run('p1', 'u2', 'w2')).toThrow();
  });

  it('rechaza franjas repetidas, al revés o con día inválido', () => {
    const db = setup();
    const insert = db.prepare(
      'INSERT INTO proposal_windows (id, proposal_id, day_of_week, start_time, end_time, availability_percentage) VALUES (?, ?, ?, ?, ?, ?)',
    );
    expect(() => insert.run('w3', 'p1', 2, '16:00', '18:00', 100)).toThrow();
    expect(() => insert.run('w4', 'p1', 2, '18:00', '16:00', 100)).toThrow();
    expect(() => insert.run('w5', 'p1', 8, '10:00', '11:00', 100)).toThrow();
    expect(() => insert.run('w6', 'p1', 3, '10:00', '11:00', 100)).not.toThrow();
  });

  it('una tardanza exige minutos y el resto no los lleva', () => {
    const db = setup();
    const insert = db.prepare(
      `INSERT INTO incidences (id, proposal_id, user_id, type, reason, delay_minutes, criticality, created_at)
       VALUES (?, 'p1', 'u2', ?, 'Motivo', ?, 'BAJA', '2026-09-29T10:00:00.000Z')`,
    );
    expect(() => insert.run('i1', 'TARDANZA', 20)).not.toThrow();
    expect(() => insert.run('i2', 'TARDANZA', null)).toThrow();
    expect(() => insert.run('i3', 'FALTA', 10)).toThrow();
    expect(() => insert.run('i4', 'FALTA', null)).not.toThrow();
  });

  it('borrar el grupo borra sus propuestas, franjas, votos e incidencias', () => {
    const db = setup();
    db.prepare("INSERT INTO votes (proposal_id, user_id, window_id) VALUES ('p1', 'u1', 'w1')").run();
    db.prepare(
      `INSERT INTO incidences (id, proposal_id, user_id, type, reason, delay_minutes, criticality, created_at)
       VALUES ('i1', 'p1', 'u2', 'FALTA', 'Motivo', NULL, 'MEDIA', '2026-09-29T10:00:00.000Z')`,
    ).run();
    db.prepare("DELETE FROM groups WHERE id = 'g1'").run();
    for (const table of ['proposals', 'proposal_windows', 'votes', 'incidences']) {
      const { n } = db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number };
      expect(n).toBe(0);
    }
  });
});

describe('migración de administración (Fase 4.5)', () => {
  it('users nace con role USER y status ACTIVE, y rechaza otros valores', () => {
    const db = openDatabase(':memory:');
    db.prepare("INSERT INTO users (id, name, email, password_hash) VALUES ('u1', 'Ana', 'ana@correo.com', 'x')").run();
    expect({ ...(db.prepare('SELECT role, status FROM users').get() as object) }).toEqual({ role: 'USER', status: 'ACTIVE' });
    expect(() => db.prepare("UPDATE users SET role = 'ROOT'").run()).toThrow(/CHECK/);
    expect(() => db.prepare("UPDATE users SET status = 'BORRADO'").run()).toThrow(/CHECK/);
  });

  it('ai_calls solo acepta tareas conocidas y ok 0/1; admin_audit_log exige acciones conocidas y JSON válido', () => {
    const db = openDatabase(':memory:');
    const call = db.prepare('INSERT INTO ai_calls (user_id, task, ok, duration_ms, created_at) VALUES (NULL, ?, ?, 10, ?)');
    expect(() => call.run('voting-summary', 1, '2026-09-29T15:00:00.000Z')).not.toThrow();
    expect(() => call.run('inventada', 1, '2026-09-29T15:00:00.000Z')).toThrow(/CHECK/);
    expect(() => call.run('voting-summary', 2, '2026-09-29T15:00:00.000Z')).toThrow(/CHECK/);
    const audit = db.prepare("INSERT INTO admin_audit_log (id, admin_id, action, target_type, target_id, details) VALUES (?, NULL, ?, 'GROUP', 'g1', ?)");
    expect(() => audit.run('a1', 'GROUP_DELETED', '{"name":"Grupo"}')).not.toThrow();
    expect(() => audit.run('a2', 'GROUP_DELETED', 'no es json')).toThrow(/CHECK/);
    expect(() => audit.run('a3', 'USER_DELETED', '{}')).toThrow(/CHECK/);
  });

  it('ai_calls no tiene columnas para el prompt ni la respuesta', () => {
    const db = openDatabase(':memory:');
    const columns = (db.prepare('PRAGMA table_info(ai_calls)').all() as { name: string }[]).map((c) => c.name);
    expect(columns).toEqual(['id', 'user_id', 'task', 'ok', 'duration_ms', 'created_at']);
  });
});
