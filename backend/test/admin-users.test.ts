import type { Express } from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

import { adminUsers } from '../src/admin/admin-users';
import type { Db } from '../src/db/database';
import { insertUser, registerAdmin } from './admin-fixtures';
import { bearer, createGroup, makeTestApp, NOW, registerUser } from './helpers';

type AuditRow = { action: string; admin_id: string | null; target_id: string; details: string };
const auditRows = (db: Db) =>
  (db.prepare('SELECT action, admin_id, target_id, details FROM admin_audit_log ORDER BY rowid').all() as AuditRow[]).map((r) => ({ ...r }));

const patchStatus = (app: Express, token: string, id: string, status: string) =>
  request(app).patch(`/api/admin/users/${id}/status`).set(bearer(token)).send({ status });
const patchRole = (app: Express, token: string, id: string, role: string) =>
  request(app).patch(`/api/admin/users/${id}/role`).set(bearer(token)).send({ role });

async function setup() {
  const { app, db } = makeTestApp({ now: () => NOW });
  const admin = await registerAdmin(app, db, { name: 'Admin', email: 'admin@correo.com' });
  const ana = await registerUser(app, { name: 'Ana', email: 'ana@correo.com' });
  return { app, db, admin, ana };
}

describe('acceso a /api/admin', () => {
  it('sin token 401; USER 403 NOT_ADMIN; ADMIN 200', async () => {
    const { app, admin, ana } = await setup();
    expect((await request(app).get('/api/admin/users')).status).toBe(401);
    const denied = await request(app).get('/api/admin/users').set(bearer(ana.token));
    expect(denied.status).toBe(403);
    expect(denied.body.error.code).toBe('NOT_ADMIN');
    expect((await request(app).get('/api/admin/users').set(bearer(admin.token))).status).toBe(200);
  });
});

describe('GET /api/admin/users', () => {
  it('20 por página, las cuentas más nuevas primero, con el total', async () => {
    const { app, db, admin } = await setup();
    for (let i = 0; i < 25; i++) {
      insertUser(db, { name: `Persona ${String(i).padStart(2, '0')}`, createdAt: new Date(NOW.getTime() + (i + 1) * 60_000).toISOString() });
    }
    const first = await request(app).get('/api/admin/users').set(bearer(admin.token));
    expect(first.body).toMatchObject({ page: 1, pageSize: 20, total: 27 });
    expect(first.body.items).toHaveLength(20);
    expect(first.body.items[0]).toMatchObject({ name: 'Persona 24', role: 'USER', status: 'ACTIVE', groupCount: 0 });
    const second = await request(app).get('/api/admin/users').query({ page: 2 }).set(bearer(admin.token));
    // Admin y Ana se registraron a la vez (NOW): a igual fecha, la insertada después va primero.
    expect(second.body.items.map((u: { name: string }) => u.name)).toEqual([
      'Persona 04', 'Persona 03', 'Persona 02', 'Persona 01', 'Persona 00', 'Ana', 'Admin',
    ]);
  });

  it('busca en nombre y correo, sin distinguir mayúsculas y con % y _ literales', async () => {
    const { app, db, admin } = await setup();
    insertUser(db, { name: 'Carla 100%', email: 'carla@uni.edu' });
    insertUser(db, { name: 'Carlos', email: 'carlos_p@uni.edu' });
    const search = async (q: string) =>
      (await request(app).get('/api/admin/users').query({ search: q }).set(bearer(admin.token))).body.items.map((u: { name: string }) => u.name);
    expect(await search('ANA@correo')).toEqual(['Ana']);
    expect(await search('100%')).toEqual(['Carla 100%']);
    expect(await search('%')).toEqual(['Carla 100%']);
    expect(await search('s_p')).toEqual(['Carlos']);
    expect(await search('   ')).toHaveLength(4); // vacía tras el trim = todas
  });

  it('?page= vacío equivale a la página 1 (como omitirlo)', async () => {
    const { app, admin } = await setup();
    const res = await request(app).get('/api/admin/users?page=').set(bearer(admin.token));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ page: 1, total: 2 });
    const audit = await request(app).get('/api/admin/audit?page=').set(bearer(admin.token));
    expect(audit.status).toBe(200);
    expect(audit.body.page).toBe(1);
    // Control positivo: un número sigue valiendo y uno inválido sigue siendo 400.
    expect((await request(app).get('/api/admin/users?page=2').set(bearer(admin.token))).body.page).toBe(2);
    expect((await request(app).get('/api/admin/users?page=0').set(bearer(admin.token))).status).toBe(400);
  });

  it.each([
    [{ page: 0 }, 'La página empieza en 1.'],
    [{ page: 'dos' }, 'La página debe ser un número.'],
    [{ search: 'x'.repeat(101) }, 'La búsqueda admite hasta 100 caracteres.'],
  ])('%j → 400 «%s»', async (query, message) => {
    const { app, admin } = await setup();
    const res = await request(app).get('/api/admin/users').query(query).set(bearer(admin.token));
    expect(res.status).toBe(400);
    expect(res.body.error.details).toContainEqual(expect.objectContaining({ message }));
  });
});

describe('GET /api/admin/users/:id', () => {
  it('detalle con sus grupos y su actividad', async () => {
    const { app, admin, ana } = await setup();
    const group = await createGroup(app, ana.token, { name: 'Estudio' });
    await request(app)
      .post('/api/me/time-blocks')
      .set(bearer(ana.token))
      .send({ label: 'Clase', type: 'CLASE', startTime: '08:00', endTime: '10:00', isRecurring: true, dayOfWeek: 1, date: null })
      .expect(201);
    const res = await request(app).get(`/api/admin/users/${ana.user.id}`).set(bearer(admin.token));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      id: ana.user.id, name: 'Ana', email: 'ana@correo.com', role: 'USER', status: 'ACTIVE', createdAt: NOW.toISOString(), groupCount: 1,
      groups: [{ id: group.id, name: 'Estudio', role: 'OWNER' }],
      activity: { proposalsCreated: 0, votes: 0, incidences: 0, timeBlocks: 1, aiCalls: 0 },
    });
  });

  it('404 USER_NOT_FOUND', async () => {
    const { app, admin } = await setup();
    const res = await request(app).get('/api/admin/users/no-existe').set(bearer(admin.token));
    expect(res.status).toBe(404);
    expect(res.body.error).toMatchObject({ code: 'USER_NOT_FOUND', message: 'Usuario no encontrado.' });
  });
});

describe('PATCH /api/admin/users/:id/status', () => {
  it('suspender corta la sesión de esa persona al instante y queda anotado; reactivar la devuelve', async () => {
    const { app, db, admin, ana } = await setup();
    const res = await patchStatus(app, admin.token, ana.user.id, 'SUSPENDED');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: ana.user.id, status: 'SUSPENDED', activity: expect.any(Object) });
    expect((await request(app).get('/api/groups').set(bearer(ana.token))).body.error.code).toBe('ACCOUNT_SUSPENDED');
    expect(auditRows(db)).toEqual([
      { action: 'USER_SUSPENDED', admin_id: admin.user.id, target_id: ana.user.id, details: JSON.stringify({ name: 'Ana', from: 'ACTIVE', to: 'SUSPENDED' }) },
    ]);
    expect((await patchStatus(app, admin.token, ana.user.id, 'ACTIVE')).body.status).toBe('ACTIVE');
    expect((await request(app).get('/api/groups').set(bearer(ana.token))).status).toBe(200);
    expect(auditRows(db).map((r) => r.action)).toEqual(['USER_SUSPENDED', 'USER_REACTIVATED']);
  });

  it('repetir el mismo estado responde 200 sin cambiar ni anotar nada', async () => {
    const { app, db, admin, ana } = await setup();
    const res = await patchStatus(app, admin.token, ana.user.id, 'ACTIVE');
    expect(res.status).toBe(200);
    expect(auditRows(db)).toEqual([]);
    // Control positivo: un cambio real sí se anota.
    expect((await patchStatus(app, admin.token, ana.user.id, 'SUSPENDED')).status).toBe(200);
    expect(auditRows(db).map((r) => r.action)).toEqual(['USER_SUSPENDED']);
  });

  it('nadie puede suspenderse a sí mismo (409 CANNOT_CHANGE_SELF); a otra admin, sí', async () => {
    const { app, db, admin } = await setup();
    const self = await patchStatus(app, admin.token, admin.user.id, 'SUSPENDED');
    expect(self.status).toBe(409);
    expect(self.body.error).toMatchObject({
      code: 'CANNOT_CHANGE_SELF',
      message: 'No puedes suspender tu propia cuenta ni quitarte el rol de administrador.',
    });
    expect(auditRows(db)).toEqual([]);
    const other = await registerAdmin(app, db, { name: 'Otra admin' });
    expect((await patchStatus(app, admin.token, other.user.id, 'SUSPENDED')).status).toBe(200); // control positivo
  });

  it('400 con un estado desconocido y 404 si la cuenta no existe', async () => {
    const { app, admin, ana } = await setup();
    const bad = await patchStatus(app, admin.token, ana.user.id, 'BORRADA');
    expect(bad.status).toBe(400);
    expect(bad.body.error.details).toContainEqual(expect.objectContaining({ message: 'El estado debe ser ACTIVE o SUSPENDED.' }));
    const missing = await patchStatus(app, admin.token, 'no-existe', 'SUSPENDED');
    expect(missing.status).toBe(404);
    expect(missing.body.error.code).toBe('USER_NOT_FOUND');
    expect((await patchStatus(app, admin.token, ana.user.id, 'SUSPENDED')).status).toBe(200); // control positivo
  });

  it('la acción y su anotación van en la misma transacción: si no se puede anotar, no se suspende', async () => {
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {}); // el 500 se escribe en el log
    try {
      const { app, db, admin, ana } = await setup();
      db.exec('DROP TABLE admin_audit_log');
      expect((await patchStatus(app, admin.token, ana.user.id, 'SUSPENDED')).status).toBe(500);
      const row = db.prepare('SELECT status FROM users WHERE id = ?').get(ana.user.id) as { status: string };
      expect(row.status).toBe('ACTIVE');
    } finally {
      quiet.mockRestore();
    }
  });

  it('servicio: el último ADMIN activo no se puede suspender (409 LAST_ADMIN; defensa en profundidad)', () => {
    // Por la API no se alcanza (quien actúa ya es otro admin activo): se prueba el servicio con otra cuenta como actor.
    const { db } = makeTestApp();
    const actor = { adminId: insertUser(db), now: NOW };
    const only = insertUser(db, { role: 'ADMIN' });
    const users = adminUsers(db);
    expect(() => users.setStatus(actor, only, 'SUSPENDED')).toThrow('Tiene que quedar al menos un administrador activo.');
    expect(auditRows(db)).toEqual([]); // un 409 no deja anotación
    insertUser(db, { role: 'ADMIN' });
    expect(users.setStatus(actor, only, 'SUSPENDED')).toBe(true); // control positivo
  });
});

describe('PATCH /api/admin/users/:id/role', () => {
  it('nombrar administrador surte efecto con el token que ya tenía; quitarlo, también', async () => {
    const { app, db, admin, ana } = await setup();
    expect((await request(app).get('/api/admin/users').set(bearer(ana.token))).status).toBe(403);
    const res = await patchRole(app, admin.token, ana.user.id, 'ADMIN');
    expect(res.status).toBe(200);
    expect(res.body.role).toBe('ADMIN');
    expect((await request(app).get('/api/admin/users').set(bearer(ana.token))).status).toBe(200);
    expect((await patchRole(app, admin.token, ana.user.id, 'USER')).status).toBe(200);
    expect((await request(app).get('/api/admin/users').set(bearer(ana.token))).status).toBe(403);
    expect(auditRows(db).map((r) => [r.action, r.details])).toEqual([
      ['USER_PROMOTED', JSON.stringify({ name: 'Ana', from: 'USER', to: 'ADMIN' })],
      ['USER_DEMOTED', JSON.stringify({ name: 'Ana', from: 'ADMIN', to: 'USER' })],
    ]);
  });

  it('nadie puede quitarse el rol a sí mismo: 409 CANNOT_CHANGE_SELF, sin anotar nada; a otra admin, sí', async () => {
    const { app, db, admin } = await setup();
    const res = await patchRole(app, admin.token, admin.user.id, 'USER');
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CANNOT_CHANGE_SELF');
    expect(auditRows(db)).toEqual([]);
    const other = await registerAdmin(app, db, { name: 'Otra admin' });
    expect((await patchRole(app, admin.token, other.user.id, 'USER')).status).toBe(200); // control positivo
    expect(auditRows(db).map((r) => r.action)).toEqual(['USER_DEMOTED']);
  });

  it('dar el rol que ya tiene responde 200 sin anotar nada', async () => {
    const { app, db, admin, ana } = await setup();
    const res = await patchRole(app, admin.token, ana.user.id, 'USER');
    expect(res.status).toBe(200);
    expect(res.body.role).toBe('USER');
    expect(auditRows(db)).toEqual([]);
    expect((await patchRole(app, admin.token, ana.user.id, 'ADMIN')).status).toBe(200); // control positivo
    expect(auditRows(db).map((r) => r.action)).toEqual(['USER_PROMOTED']);
  });

  it('servicio: quitar el rol al último ADMIN activo → 409 LAST_ADMIN sin anotar nada', () => {
    const { db } = makeTestApp();
    const actor = { adminId: insertUser(db), now: NOW };
    const only = insertUser(db, { role: 'ADMIN' });
    expect(() => adminUsers(db).setRole(actor, only, 'USER')).toThrow('Tiene que quedar al menos un administrador activo.');
    expect(auditRows(db)).toEqual([]);
    insertUser(db, { role: 'ADMIN' });
    expect(adminUsers(db).setRole(actor, only, 'USER')).toBe(true); // control positivo
    expect(auditRows(db).map((r) => r.action)).toEqual(['USER_DEMOTED']);
  });

  it('400 con un rol desconocido; con uno válido, 200', async () => {
    const { app, admin, ana } = await setup();
    const res = await patchRole(app, admin.token, ana.user.id, 'ROOT');
    expect(res.status).toBe(400);
    expect(res.body.error.details).toContainEqual(expect.objectContaining({ message: 'El rol debe ser USER o ADMIN.' }));
    expect((await patchRole(app, admin.token, ana.user.id, 'ADMIN')).status).toBe(200); // control positivo
  });

  it('la acción y su anotación van en la misma transacción: si no se puede anotar, el rol no cambia', async () => {
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {}); // el 500 se escribe en el log
    try {
      const { app, db, admin, ana } = await setup();
      db.exec('DROP TABLE admin_audit_log');
      expect((await patchRole(app, admin.token, ana.user.id, 'ADMIN')).status).toBe(500);
      const row = db.prepare('SELECT role FROM users WHERE id = ?').get(ana.user.id) as { role: string };
      expect(row.role).toBe('USER');
    } finally {
      quiet.mockRestore();
    }
  });
});

describe('GET /api/admin/audit', () => {
  it('lo más reciente primero, con quién lo hizo y sus detalles', async () => {
    const { app, admin, ana } = await setup();
    await patchStatus(app, admin.token, ana.user.id, 'SUSPENDED');
    await patchStatus(app, admin.token, ana.user.id, 'ACTIVE');
    const res = await request(app).get('/api/admin/audit').set(bearer(admin.token));
    expect(res.body).toMatchObject({ page: 1, pageSize: 20, total: 2 });
    expect(res.body.items[0]).toEqual({
      id: expect.any(String),
      action: 'USER_REACTIVATED',
      admin: { id: admin.user.id, name: 'Admin', email: 'admin@correo.com' },
      targetType: 'USER',
      targetId: ana.user.id,
      details: { name: 'Ana', from: 'SUSPENDED', to: 'ACTIVE' },
      createdAt: NOW.toISOString(),
    });
    expect(res.body.items[1].action).toBe('USER_SUSPENDED');
  });
});
