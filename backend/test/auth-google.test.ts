import request from 'supertest';
import { describe, expect, it } from 'vitest';
import type { Express } from 'express';

import type { GoogleIdentity } from '../src/auth/google-verifier';
import type { Db } from '../src/db/db';
import { bearer, fakeGoogle, makeTestApp, registerUnverified, registerUser } from './helpers';

const ANA: GoogleIdentity = { sub: 'sub-ana', email: 'ana@correo.com', emailVerified: true, name: 'Ana Google' };
const google = (extra: Record<string, GoogleIdentity> = {}) => fakeGoogle({ 'tok-ana': ANA, ...extra });
const enter = (app: Express, idToken: string) => request(app).post('/api/auth/google').send({ idToken });
const rowOf = (db: Db, email: string) =>
  db.one<{ name: string; password_hash: string | null; two_factor_enabled: boolean; email_verified: boolean; google_sub: string | null }>(
    'SELECT name, password_hash, two_factor_enabled, email_verified, google_sub FROM users WHERE email = $1',
    [email],
  );
const countUsers = async (db: Db) => (await db.one<{ n: number }>('SELECT count(*)::int AS n FROM users'))!.n;

describe('POST /api/auth/google', () => {
  it('cuenta nueva: 200 { token, user } con Google y sin contraseña; la segunda vez es la misma cuenta', async () => {
    const { app, db } = await makeTestApp({ google: google() });
    const res = await enter(app, 'tok-ana');
    expect(res.status).toBe(200);
    expect(res.body.user).toEqual({
      id: expect.any(String), name: 'Ana Google', email: 'ana@correo.com', role: 'USER',
      emailVerified: true, twoFactorEnabled: false, hasPassword: false, hasGoogle: true,
    });
    const me = await request(app).get('/api/auth/me').set(bearer(res.body.token));
    expect(me.status).toBe(200);
    const again = await enter(app, 'tok-ana');
    expect(again.status).toBe(200);
    expect(again.body.user.id).toBe(res.body.user.id);
    expect(await countUsers(db)).toBe(1);
  });

  it('busca el correo en minúsculas', async () => {
    const { app } = await makeTestApp({ google: google({ 'tok-2': { ...ANA, sub: 'sub-x', email: 'Ana@Correo.com' } }) });
    const first = await registerUser(app, { email: 'ana@correo.com' });
    const res = await enter(app, 'tok-2');
    expect(res.status).toBe(200);
    expect(res.body.user.id).toBe(first.user.id);
  });

  it('correo ya verificado: se vincula y conserva contraseña y 2FA', async () => {
    const { app, db } = await makeTestApp({ google: google() });
    await registerUser(app, { name: 'Ana', email: 'ana@correo.com', password: 'contrasena-segura' });
    await db.query('UPDATE users SET two_factor_enabled = true WHERE email = $1', ['ana@correo.com']);
    const res = await enter(app, 'tok-ana');
    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(res.body.user).toMatchObject({ name: 'Ana', hasPassword: true, hasGoogle: true, twoFactorEnabled: true, emailVerified: true });
    expect(await rowOf(db, 'ana@correo.com')).toMatchObject({ google_sub: 'sub-ana', two_factor_enabled: true });
    const login = await request(app).post('/api/auth/login').send({ email: 'ana@correo.com', password: 'contrasena-segura' });
    expect(login.status).toBe(200);
  });

  it('Review Focus 4: correo sin verificar de otra persona: pierde contraseña y 2FA, toma el nombre de Google y sus códigos mueren', async () => {
    const { app, db, emails } = await makeTestApp({ google: google() });
    const { challenge, password } = await registerUnverified(app, { name: 'Intruso', email: 'ana@correo.com' });
    await db.query('UPDATE users SET two_factor_enabled = true WHERE email = $1', ['ana@correo.com']);
    const code = emails.lastCodeTo('ana@correo.com');
    const res = await enter(app, 'tok-ana');
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ name: 'Ana Google', hasPassword: false, hasGoogle: true, twoFactorEnabled: false, emailVerified: true });
    expect(await rowOf(db, 'ana@correo.com')).toMatchObject({ password_hash: null, two_factor_enabled: false, name: 'Ana Google' });
    const login = await request(app).post('/api/auth/login').send({ email: 'ana@correo.com', password });
    expect(login.status).toBe(401);
    expect(login.body.error.code).toBe('INVALID_CREDENTIALS');
    const old = await request(app).post(`/api/auth/challenges/${challenge.id}/verify`).send({ code });
    expect(old.status).toBe(410);
  });

  it('emailVerified false o token desconocido: 401 GOOGLE_TOKEN_INVALID, sin crear cuenta', async () => {
    const { app, db } = await makeTestApp({ google: google({ 'tok-no': { ...ANA, emailVerified: false } }) });
    for (const t of ['tok-no', 'desconocido']) {
      const res = await enter(app, t);
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('GOOGLE_TOKEN_INVALID');
    }
    expect(await countUsers(db)).toBe(0);
  });

  it('sin verificador: 503 GOOGLE_NOT_CONFIGURED; sin idToken: 400', async () => {
    const { app } = await makeTestApp();
    const res = await enter(app, 'tok-ana');
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('GOOGLE_NOT_CONFIGURED');
    const { app: app2 } = await makeTestApp({ google: google() });
    expect((await request(app2).post('/api/auth/google').send({})).status).toBe(400);
  });

  it('cuenta suspendida: 403; si estaba sin verificar, no se toca', async () => {
    const { app, db } = await makeTestApp({ google: google() });
    await registerUnverified(app, { email: 'ana@correo.com' });
    await db.query("UPDATE users SET status = 'SUSPENDED' WHERE email = $1", ['ana@correo.com']);
    const res = await enter(app, 'tok-ana');
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('ACCOUNT_SUSPENDED');
    const row = await rowOf(db, 'ana@correo.com');
    expect(row).toMatchObject({ google_sub: null, email_verified: false });
    expect(row!.password_hash).not.toBeNull();
    // también si ya estaba vinculada
    const { app: app2, db: db2 } = await makeTestApp({ google: google() });
    await enter(app2, 'tok-ana');
    await db2.query("UPDATE users SET status = 'SUSPENDED'");
    expect((await enter(app2, 'tok-ana')).status).toBe(403);
  });

  it('cuenta con 2FA entra por Google sin reto', async () => {
    const { app, db } = await makeTestApp({ google: google() });
    await enter(app, 'tok-ana');
    await db.query('UPDATE users SET two_factor_enabled = true');
    const res = await enter(app, 'tok-ana');
    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(res.body.challenge).toBeUndefined();
  });

  it('login con contraseña de una cuenta solo-Google: 401 INVALID_CREDENTIALS', async () => {
    const { app } = await makeTestApp({ google: google() });
    await enter(app, 'tok-ana');
    const res = await request(app).post('/api/auth/login').send({ email: 'ana@correo.com', password: 'contrasena-segura' });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('correo con otra cuenta de Google ya vinculada: 401 GOOGLE_TOKEN_INVALID', async () => {
    const { app } = await makeTestApp({ google: google({ 'tok-otra': { ...ANA, sub: 'sub-otra' } }) });
    expect((await enter(app, 'tok-ana')).status).toBe(200);
    const res = await enter(app, 'tok-otra');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('GOOGLE_TOKEN_INVALID');
  });

  it('dos primeras entradas simultáneas: una cuenta y ninguna da 500', async () => {
    const { app, db } = await makeTestApp({ google: google() });
    const results = await Promise.all([enter(app, 'tok-ana'), enter(app, 'tok-ana'), enter(app, 'tok-ana')]);
    expect(results.map((r) => r.status)).toEqual([200, 200, 200]);
    expect(new Set(results.map((r) => r.body.user.id)).size).toBe(1);
    expect(await countUsers(db)).toBe(1);
  });
});
