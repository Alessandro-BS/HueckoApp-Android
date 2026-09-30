import { describe, expect, it } from 'vitest';

import type { Db } from '../src/db/db';
import { migrate } from '../src/db/migrate';
import { migrations } from '../src/db/pg-migrations';
import { openEmptyDatabase, openTestDatabase } from './db';

// Errores de Postgres que se esperan: 23505 clave repetida, 23503 clave foránea, 23514 CHECK, 42804 tipo, 42703 columna.
const failsWith = (promise: Promise<unknown>, code: string) => expect(promise).rejects.toMatchObject({ code });
const count = async (db: Db, table: string) => (await db.one<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table}`))!.n;
const versions = async (db: Db) => (await db.many<{ version: number }>('SELECT version FROM schema_migrations ORDER BY version')).map((r) => r.version);
const ALL_VERSIONS = migrations.map((_, i) => i + 1);
const ISO_MS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

describe('migrate', () => {
  it('aplica todas las migraciones y anota cada versión con su fecha en schema_migrations', async () => {
    const db = await openEmptyDatabase();
    await migrate(db);
    expect(await versions(db)).toEqual(ALL_VERSIONS);
    const dates = await db.many<{ applied_at: string }>('SELECT applied_at FROM schema_migrations');
    for (const { applied_at } of dates) expect(applied_at).toMatch(ISO_MS);
  });

  it('es idempotente: migrar una base ya migrada no hace nada', async () => {
    const db = await openTestDatabase();
    await migrate(db);
    expect(await versions(db)).toEqual(ALL_VERSIONS);
  });

  it('si una migración falla, no queda nada a medias', async () => {
    const db = await openEmptyDatabase();
    await expect(migrate(db, [migrations[0], 'CREATE TABLE rota (id INTEGER REFERENCES no_existe(id))'])).rejects.toMatchObject({ code: '42P01' });
    expect(await db.one("SELECT to_regclass('users') IS NOT NULL AS hay")).toEqual({ hay: false });
    expect(await db.one("SELECT to_regclass('schema_migrations') IS NOT NULL AS hay")).toEqual({ hay: false });
  });

  it('la migración 4 sobre una base con datos: las cuentas que ya había quedan USER y ACTIVE y aparecen las tablas nuevas', async () => {
    const db = await openEmptyDatabase();
    await migrate(db, migrations.slice(0, 4));
    await db.query("INSERT INTO users (id, name, email, password_hash) VALUES ('u1', 'Ana', 'ana@correo.com', 'x')");
    await failsWith(db.query('SELECT role FROM users'), '42703'); // control: antes de migrar no hay rol
    await migrate(db);
    expect(await db.one("SELECT role, status FROM users WHERE id = 'u1'")).toEqual({ role: 'USER', status: 'ACTIVE' });
    const tables = (await db.many<{ table_name: string }>('SELECT table_name FROM information_schema.tables WHERE table_schema = current_schema()')).map(
      (t) => t.table_name,
    );
    expect(tables).toEqual(expect.arrayContaining(['admin_audit_log', 'ai_calls']));
    expect(await versions(db)).toEqual(ALL_VERSIONS);
  });
});

describe('esquema: usuarios', () => {
  it('email único, claves foráneas activas y created_at por defecto en ISO UTC con milisegundos', async () => {
    const db = await openTestDatabase();
    const insert = (id: string, email: string) => db.query('INSERT INTO users (id, name, email, password_hash) VALUES ($1, $2, $3, $4)', [id, id, email, 'x']);
    await insert('1', 'ana@correo.com');
    await expect(insert('2', 'ana@correo.com')).rejects.toMatchObject({ code: '23505', constraint: 'users_email_key' });
    await failsWith(db.query("INSERT INTO time_blocks (id, user_id, label, type, start_time, end_time, is_recurring, day_of_week) VALUES ('b', 'nadie', 'x', 'CLASE', '08:00', '09:00', TRUE, 1)"), '23503');
    expect((await db.one<{ created_at: string }>("SELECT created_at FROM users WHERE id = '1'"))!.created_at).toMatch(ISO_MS);
  });

  it('seq sigue el orden de inserción y el texto se ordena byte a byte (COLLATE "C", como SQLite)', async () => {
    const db = await openTestDatabase();
    for (const name of ['b', 'B', 'á', 'a']) {
      await db.query('INSERT INTO users (id, name, email, password_hash) VALUES ($1, $1, $2, $3)', [name, `${name}@correo.com`, 'x']);
    }
    expect((await db.many<{ name: string }>('SELECT name FROM users ORDER BY seq')).map((r) => r.name)).toEqual(['b', 'B', 'á', 'a']);
    expect((await db.many<{ name: string }>('SELECT name FROM users ORDER BY name')).map((r) => r.name)).toEqual(['B', 'a', 'b', 'á']);
  });
});

describe('esquema: time_blocks', () => {
  const setup = async () => {
    const db = await openTestDatabase();
    await db.query("INSERT INTO users (id, name, email, password_hash) VALUES ('u1', 'Ana', 'ana@correo.com', 'x')");
    const insert = (...values: (string | number | boolean | null)[]) =>
      db.query(
        `INSERT INTO time_blocks (id, user_id, label, type, start_time, end_time, is_recurring, day_of_week, date)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        values,
      );
    return { db, insert };
  };

  it('exige día en los recurrentes y fecha en los puntuales', async () => {
    const { insert } = await setup();
    await insert('b1', 'u1', 'Clase', 'CLASE', '08:00', '10:00', true, 1, null);
    await insert('b2', 'u1', 'Dentista', 'PUNTUAL', '15:00', '16:00', false, null, '2026-10-02');
    await failsWith(insert('b3', 'u1', 'Sin día', 'CLASE', '08:00', '10:00', true, null, null), '23514');
    await failsWith(insert('b4', 'u1', 'Tipo raro', 'OTRO', '08:00', '10:00', true, 1, null), '23514');
    await failsWith(insert('b5', 'u1', 'Al revés', 'CLASE', '10:00', '08:00', true, 1, null), '23514');
  });

  it('borrar un usuario borra sus bloques', async () => {
    const { db, insert } = await setup();
    await insert('b1', 'u1', 'Clase', 'CLASE', '08:00', '10:00', true, 1, null);
    await db.query("DELETE FROM users WHERE id = 'u1'");
    expect(await count(db, 'time_blocks')).toBe(0);
  });
});

describe('esquema: grupos', () => {
  it('borrar un grupo borra sus miembros, el código de invitación es único y nadie está dos veces', async () => {
    const db = await openTestDatabase();
    await db.query("INSERT INTO users (id, name, email, password_hash) VALUES ('u1', 'Ana', 'ana@correo.com', 'x')");
    const insertGroup = (id: string) => db.query("INSERT INTO groups (id, name, invite_code) VALUES ($1, 'Grupo', 'PROY2026')", [id]);
    await insertGroup('g1');
    await expect(insertGroup('g2')).rejects.toMatchObject({ code: '23505', constraint: 'groups_invite_code_key' });
    await db.query("INSERT INTO group_members (group_id, user_id, role) VALUES ('g1', 'u1', 'OWNER')");
    await failsWith(db.query("INSERT INTO group_members (group_id, user_id, role) VALUES ('g1', 'u1', 'MEMBER')"), '23505');
    expect(await db.one("SELECT is_essential FROM group_members WHERE group_id = 'g1'")).toEqual({ is_essential: false });
    await db.query("DELETE FROM groups WHERE id = 'g1'");
    expect(await count(db, 'group_members')).toBe(0);
  });
});

describe('esquema: propuestas', () => {
  const setup = async () => {
    const db = await openTestDatabase();
    await db.exec(`
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

  it('un voto por persona y propuesta, y solo a franjas de esa propuesta', async () => {
    const db = await setup();
    const vote = (proposal: string, user: string, window: string) =>
      db.query('INSERT INTO votes (proposal_id, user_id, window_id) VALUES ($1, $2, $3)', [proposal, user, window]);
    await vote('p1', 'u1', 'w1');
    await failsWith(vote('p1', 'u1', 'w1'), '23505');
    await failsWith(vote('p1', 'u2', 'w2'), '23503');
  });

  it('rechaza franjas repetidas, al revés o con día inválido', async () => {
    const db = await setup();
    const insert = (id: string, day: number, start: string, end: string) =>
      db.query(
        'INSERT INTO proposal_windows (id, proposal_id, day_of_week, start_time, end_time, availability_percentage) VALUES ($1, $2, $3, $4, $5, $6)',
        [id, 'p1', day, start, end, 100],
      );
    await failsWith(insert('w3', 2, '16:00', '18:00'), '23505');
    await failsWith(insert('w4', 2, '18:00', '16:00'), '23514');
    await failsWith(insert('w5', 8, '10:00', '11:00'), '23514');
    await insert('w6', 3, '10:00', '11:00');
  });

  it('una tardanza exige minutos y el resto no los lleva', async () => {
    const db = await setup();
    const insert = (id: string, type: string, delay: number | null) =>
      db.query(
        `INSERT INTO incidences (id, proposal_id, user_id, type, reason, delay_minutes, criticality, created_at)
         VALUES ($1, 'p1', 'u2', $2, 'Motivo', $3, 'BAJA', '2026-09-29T10:00:00.000Z')`,
        [id, type, delay],
      );
    await insert('i1', 'TARDANZA', 20);
    await failsWith(insert('i2', 'TARDANZA', null), '23514');
    await failsWith(insert('i3', 'FALTA', 10), '23514');
    await insert('i4', 'FALTA', null);
  });

  it('la latitud conserva todos sus decimales (DOUBLE PRECISION)', async () => {
    const db = await setup();
    await db.query("UPDATE proposals SET location_name = 'Lugar', latitude = $1, longitude = $2 WHERE id = 'p1'", [-12.07, -77.08]);
    expect(await db.one("SELECT latitude, longitude FROM proposals WHERE id = 'p1'")).toEqual({ latitude: -12.07, longitude: -77.08 });
  });

  it('borrar el grupo borra sus propuestas, franjas, votos e incidencias', async () => {
    const db = await setup();
    await db.query("INSERT INTO votes (proposal_id, user_id, window_id) VALUES ('p1', 'u1', 'w1')");
    await db.query(
      `INSERT INTO incidences (id, proposal_id, user_id, type, reason, delay_minutes, criticality, created_at)
       VALUES ('i1', 'p1', 'u2', 'FALTA', 'Motivo', NULL, 'MEDIA', '2026-09-29T10:00:00.000Z')`,
    );
    await db.query("DELETE FROM groups WHERE id = 'g1'");
    for (const table of ['proposals', 'proposal_windows', 'votes', 'incidences']) expect(await count(db, table)).toBe(0);
  });
});

describe('esquema: administración (Fase 4.5)', () => {
  it('users nace con role USER y status ACTIVE, y rechaza otros valores', async () => {
    const db = await openTestDatabase();
    await db.query("INSERT INTO users (id, name, email, password_hash) VALUES ('u1', 'Ana', 'ana@correo.com', 'x')");
    expect(await db.one('SELECT role, status FROM users')).toEqual({ role: 'USER', status: 'ACTIVE' });
    await expect(db.query("UPDATE users SET role = 'ROOT'")).rejects.toMatchObject({ code: '23514', constraint: 'users_role_check' });
    await expect(db.query("UPDATE users SET status = 'BORRADO'")).rejects.toMatchObject({ code: '23514', constraint: 'users_status_check' });
  });

  it('ai_calls solo acepta tareas conocidas y ok booleano; admin_audit_log exige acciones conocidas y JSON válido', async () => {
    const db = await openTestDatabase();
    const call = (task: string, ok: boolean) =>
      db.query("INSERT INTO ai_calls (user_id, task, ok, duration_ms, created_at) VALUES (NULL, $1, $2, 10, '2026-09-29T15:00:00.000Z')", [task, ok]);
    await call('voting-summary', true);
    await failsWith(call('inventada', true), '23514');
    await failsWith(db.query("INSERT INTO ai_calls (user_id, task, ok, duration_ms, created_at) VALUES (NULL, 'voting-summary', 2, 10, 'x')"), '42804');
    const audit = (id: string, action: string, details: string) =>
      db.query("INSERT INTO admin_audit_log (id, admin_id, action, target_type, target_id, details) VALUES ($1, NULL, $2, 'GROUP', 'g1', $3)", [id, action, details]);
    await audit('a1', 'GROUP_DELETED', '{"name":"Grupo","members":2}');
    await expect(audit('a2', 'GROUP_DELETED', 'no es json')).rejects.toMatchObject({ code: '23514', constraint: 'admin_audit_log_details_check' });
    await failsWith(audit('a3', 'USER_DELETED', '{}'), '23514');
    // Se devuelve exactamente el texto guardado (jsonb reordenaría las claves).
    expect(await db.one("SELECT details FROM admin_audit_log WHERE id = 'a1'")).toEqual({ details: '{"name":"Grupo","members":2}' });
  });

  it('ai_calls no tiene columnas para el prompt ni la respuesta', async () => {
    const db = await openTestDatabase();
    const columns = await db.many<{ column_name: string }>(
      "SELECT column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'ai_calls' ORDER BY ordinal_position",
    );
    expect(columns.map((c) => c.column_name)).toEqual(['id', 'user_id', 'task', 'ok', 'duration_ms', 'created_at']);
  });
});
