import express from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { requireAdmin, requireAuth } from '../src/auth/require-auth';
import type { Db } from '../src/db/database';
import { errorHandler } from '../src/middleware/errors';
import { bearer, createGroup, makeTestApp, NOW, registerUser, TEST_SECRET } from './helpers';

const setRole = (db: Db, id: string, role: 'USER' | 'ADMIN') => db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, id);
const setStatus = (db: Db, id: string, status: 'ACTIVE' | 'SUSPENDED') =>
  db.prepare('UPDATE users SET status = ? WHERE id = ?').run(status, id);

const SUSPENDED = {
  code: 'ACCOUNT_SUSPENDED',
  message: 'Tu cuenta está suspendida. Si crees que es un error, escribe al equipo de HueckoApp.',
};

describe('rol en la sesión (D1)', () => {
  it('registro, login y /auth/me devuelven role USER', async () => {
    const { app } = makeTestApp();
    const reg = await request(app).post('/api/auth/register').send({ name: 'Ana', email: 'ana@correo.com', password: 'contrasena-segura' });
    expect(reg.body.user).toEqual({ id: expect.any(String), name: 'Ana', email: 'ana@correo.com', role: 'USER' });
    const login = await request(app).post('/api/auth/login').send({ email: 'ana@correo.com', password: 'contrasena-segura' });
    expect(login.body.user).toEqual(reg.body.user);
    const me = await request(app).get('/api/auth/me').set(bearer(login.body.token));
    expect(me.body).toEqual(reg.body.user);
  });

  it('el registro nunca crea administradores, aunque el cuerpo lo pida', async () => {
    const { app } = makeTestApp();
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Eva', email: 'eva@correo.com', password: 'contrasena-segura', role: 'ADMIN' });
    expect(res.status).toBe(201);
    expect(res.body.user.role).toBe('USER');
  });

  it('/auth/me lee el rol de la base en cada petición: el mismo token ve el cambio', async () => {
    const { app, db } = makeTestApp();
    const ana = await registerUser(app);
    setRole(db, ana.user.id, 'ADMIN');
    expect((await request(app).get('/api/auth/me').set(bearer(ana.token))).body.role).toBe('ADMIN');
    setRole(db, ana.user.id, 'USER');
    expect((await request(app).get('/api/auth/me').set(bearer(ana.token))).body.role).toBe('USER');
  });

  it('la fecha de alta sale del reloj de la app (las estadísticas cuentan registros por día)', async () => {
    const { app, db } = makeTestApp({ now: () => NOW });
    const ana = await registerUser(app);
    const row = db.prepare('SELECT created_at FROM users WHERE id = ?').get(ana.user.id) as { created_at: string };
    expect(row.created_at).toBe(NOW.toISOString());
  });

  it('la fecha de creación de un grupo sale del reloj de la app (A2)', async () => {
    const { app, db } = makeTestApp({ now: () => NOW });
    const ana = await registerUser(app);
    const res = await request(app)
      .post('/api/groups')
      .set(bearer(ana.token))
      .send({ name: 'Grupo', description: '', availabilityThreshold: 80 });
    expect(res.status).toBe(201);
    const row = db.prepare('SELECT created_at FROM groups WHERE id = ?').get(res.body.id) as { created_at: string };
    expect(row.created_at).toBe(NOW.toISOString());
  });
});

describe('cuentas suspendidas (D2)', () => {
  it('login: con la contraseña correcta → 403 ACCOUNT_SUSPENDED; con una incorrecta, el 401 de siempre', async () => {
    const { app, db } = makeTestApp();
    const ana = await registerUser(app, { email: 'ana@correo.com', password: 'contrasena-segura' });
    const login = (password: string) => request(app).post('/api/auth/login').send({ email: 'ana@correo.com', password });
    expect((await login('contrasena-segura')).status).toBe(200); // control positivo
    setStatus(db, ana.user.id, 'SUSPENDED');
    const ok = await login('contrasena-segura');
    expect(ok.status).toBe(403);
    expect(ok.body.error).toMatchObject(SUSPENDED);
    expect(ok.body.token).toBeUndefined();
    const wrong = await login('otra-contrasena');
    expect(wrong.status).toBe(401);
    expect(wrong.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('un token emitido antes de suspender deja de valer en cualquier ruta y vuelve a valer al reactivar', async () => {
    const { app, db } = makeTestApp();
    const ana = await registerUser(app);
    expect((await request(app).get('/api/groups').set(bearer(ana.token))).status).toBe(200); // control positivo
    setStatus(db, ana.user.id, 'SUSPENDED');
    for (const path of ['/api/groups', '/api/auth/me', '/api/me/dashboard', '/api/ai/status']) {
      const res = await request(app).get(path).set(bearer(ana.token));
      expect(res.status, path).toBe(403);
      expect(res.body.error, path).toMatchObject(SUSPENDED);
    }
    setStatus(db, ana.user.id, 'ACTIVE');
    expect((await request(app).get('/api/groups').set(bearer(ana.token))).status).toBe(200);
  });

  it('una cuenta suspendida tampoco puede usar la IA (POST) y no se anota ninguna llamada', async () => {
    const { app, db } = makeTestApp({ now: () => NOW });
    const ana = await registerUser(app);
    const group = await createGroup(app, ana.token);
    const suggest = () => request(app).post(`/api/groups/${group.id}/ai/suggestions`).set(bearer(ana.token));
    const aiCalls = () => (db.prepare('SELECT COUNT(*) AS n FROM ai_calls').get() as { n: number }).n;
    expect((await suggest()).status).toBe(200); // control positivo: activa, sí (y queda anotada)
    expect(aiCalls()).toBe(1);
    setStatus(db, ana.user.id, 'SUSPENDED');
    const res = await suggest();
    expect(res.status).toBe(403);
    expect(res.body.error).toMatchObject(SUSPENDED);
    expect(aiCalls()).toBe(1);
  });

  it('el token de una cuenta que ya no existe → 401 UNAUTHORIZED', async () => {
    const { app, db } = makeTestApp();
    const ana = await registerUser(app);
    expect((await request(app).get('/api/groups').set(bearer(ana.token))).status).toBe(200); // control positivo
    db.prepare('DELETE FROM users WHERE id = ?').run(ana.user.id);
    const res = await request(app).get('/api/groups').set(bearer(ana.token));
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });
});

describe('requireAuth idempotente (F11)', () => {
  it('montado dos veces en la misma petición, lee la cuenta de la base una sola vez', async () => {
    const { app, db } = makeTestApp();
    const ana = await registerUser(app);
    const prepare = db.prepare.bind(db);
    let reads = 0;
    const counting = {
      prepare: (sql: string) => {
        const statement = prepare(sql);
        return { get: (...args: string[]) => ((reads += 1), statement.get(...args)) };
      },
    } as unknown as Db;
    const auth = requireAuth(counting, TEST_SECRET);
    const twice = express();
    twice.get('/doble', auth, auth, (_req, res) => {
      res.json({ userId: res.locals.userId });
    });
    twice.use(errorHandler);
    const res = await request(twice).get('/doble').set(bearer(ana.token));
    expect(res.body).toEqual({ userId: ana.user.id });
    expect(reads).toBe(1);
    // Control positivo: otra petición vuelve a leer (el atajo es solo dentro de la misma petición).
    await request(twice).get('/doble').set(bearer(ana.token));
    expect(reads).toBe(2);
  });
});

describe('requireAdmin (D2)', () => {
  // App mínima con los dos middlewares: las rutas /api/admin llegan en el Task 3.
  const adminOnly = (db: Db) => {
    const app = express();
    app.get('/solo-admin', requireAuth(db, TEST_SECRET), requireAdmin, (_req, res) => {
      res.json({ ok: true });
    });
    app.use(errorHandler);
    return app;
  };

  it('USER → 403 NOT_ADMIN; el mismo token con rol ADMIN en la base → 200', async () => {
    const { app, db } = makeTestApp();
    const ana = await registerUser(app);
    const guarded = adminOnly(db);
    const denied = await request(guarded).get('/solo-admin').set(bearer(ana.token));
    expect(denied.status).toBe(403);
    expect(denied.body.error).toMatchObject({ code: 'NOT_ADMIN', message: 'Solo la administración de HueckoApp puede hacer esto.' });
    setRole(db, ana.user.id, 'ADMIN');
    expect((await request(guarded).get('/solo-admin').set(bearer(ana.token))).status).toBe(200);
  });

  it('un claim role: ADMIN dentro del JWT no sirve: manda la base', async () => {
    const { app, db } = makeTestApp();
    const ana = await registerUser(app);
    const forged = jwt.sign({ role: 'ADMIN' }, TEST_SECRET, { subject: ana.user.id, expiresIn: '1h' });
    const res = await request(adminOnly(db)).get('/solo-admin').set(bearer(forged));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('NOT_ADMIN');
  });

  it('un ADMIN suspendido tampoco pasa: 403 ACCOUNT_SUSPENDED', async () => {
    const { app, db } = makeTestApp();
    const ana = await registerUser(app);
    setRole(db, ana.user.id, 'ADMIN');
    expect((await request(adminOnly(db)).get('/solo-admin').set(bearer(ana.token))).status).toBe(200); // control positivo
    setStatus(db, ana.user.id, 'SUSPENDED');
    const res = await request(adminOnly(db)).get('/solo-admin').set(bearer(ana.token));
    expect(res.status).toBe(403);
    expect(res.body.error).toMatchObject(SUSPENDED);
  });
});
