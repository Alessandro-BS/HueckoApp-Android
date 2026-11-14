import type { Challenge } from '@hueckoapp/shared';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { bearer, fakeGoogle, makeTestApp, registerUser } from './helpers';

async function setup() {
  const ctx = await makeTestApp();
  const email = 'ana2fa@correo.com';
  const password = 'contrasena-segura';
  const session = await registerUser(ctx.app, { email, password });
  return { ...ctx, email, password, token: session.token };
}

const me = (app: Parameters<typeof request>[0], token: string) => request(app).get('/api/auth/me').set(bearer(token));

async function enable2fa(ctx: Awaited<ReturnType<typeof setup>>) {
  const res = await request(ctx.app).post('/api/auth/me/2fa/enable').set(bearer(ctx.token)).send({ password: ctx.password });
  expect(res.status).toBe(200);
  const challenge = res.body.challenge as Challenge;
  expect(challenge.purpose).toBe('ENABLE_2FA');
  const ok = await request(ctx.app)
    .post(`/api/auth/challenges/${challenge.id}/verify`)
    .set(bearer(ctx.token))
    .send({ code: ctx.emails.lastCodeTo(ctx.email) });
  expect(ok.status).toBe(204);
}

describe('activar la verificación en dos pasos', () => {
  it('contraseña mala: 400 WRONG_PASSWORD, nunca 401', async () => {
    const ctx = await setup();
    const before = ctx.emails.sent.length;
    const res = await request(ctx.app).post('/api/auth/me/2fa/enable').set(bearer(ctx.token)).send({ password: 'otra-cosa-mala' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('WRONG_PASSWORD');
    expect(ctx.emails.sent.length).toBe(before);
  });

  it('sin token: 401', async () => {
    const ctx = await setup();
    const res = await request(ctx.app).post('/api/auth/me/2fa/enable').send({ password: ctx.password });
    expect(res.status).toBe(401);
  });

  it('contraseña buena: reto ENABLE_2FA; verify con el JWT lo activa (204) y /auth/me lo dice', async () => {
    const ctx = await setup();
    await enable2fa(ctx);
    const res = await me(ctx.app, ctx.token);
    expect(res.body.twoFactorEnabled).toBe(true);
    // No cambia la versión de sesión: el mismo JWT sigue valiendo.
    expect(res.status).toBe(200);
  });

  it('verify de ENABLE_2FA sin JWT o con el de otra cuenta: 410 sin gastar intento, el código sigue valiendo', async () => {
    const ctx = await setup();
    const other = await registerUser(ctx.app);
    const res = await request(ctx.app).post('/api/auth/me/2fa/enable').set(bearer(ctx.token)).send({ password: ctx.password });
    const challenge = res.body.challenge as Challenge;
    const code = ctx.emails.lastCodeTo(ctx.email);
    const url = `/api/auth/challenges/${challenge.id}/verify`;

    const noToken = await request(ctx.app).post(url).send({ code });
    expect(noToken.status).toBe(410);
    expect(noToken.body.error.code).toBe('CHALLENGE_EXPIRED');
    const otherToken = await request(ctx.app).post(url).set(bearer(other.token)).send({ code });
    expect(otherToken.status).toBe(410);
    const badToken = await request(ctx.app).post(url).set(bearer('basura')).send({ code });
    expect(badToken.status).toBe(410);
    expect((await me(ctx.app, ctx.token)).body.twoFactorEnabled).toBe(false);

    // Un código malo con el JWT correcto muestra 5 intentos: los rechazos anteriores no gastaron ninguno.
    const wrong = await request(ctx.app).post(url).set(bearer(ctx.token)).send({ code: code === '000000' ? '111111' : '000000' });
    expect(wrong.status).toBe(400);
    expect(wrong.body.error.details.attemptsLeft).toBe(4);

    const ok = await request(ctx.app).post(url).set(bearer(ctx.token)).send({ code });
    expect(ok.status).toBe(204);
  });
});

describe('login con verificación en dos pasos', () => {
  it('contraseña buena: { challenge } LOGIN_2FA sin token; verify da { token, user }', async () => {
    const ctx = await setup();
    await enable2fa(ctx);
    const res = await request(ctx.app).post('/api/auth/login').send({ email: ctx.email, password: ctx.password });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeUndefined();
    expect(res.body.challenge.purpose).toBe('LOGIN_2FA');

    const verified = await request(ctx.app)
      .post(`/api/auth/challenges/${res.body.challenge.id}/verify`)
      .send({ code: ctx.emails.lastCodeTo(ctx.email) });
    expect(verified.status).toBe(200);
    expect(typeof verified.body.token).toBe('string');
    expect(verified.body.user.email).toBe(ctx.email);
    expect((await me(ctx.app, verified.body.token)).status).toBe(200);
  });

  it('contraseña mala: 401 sin mandar correo', async () => {
    const ctx = await setup();
    await enable2fa(ctx);
    const before = ctx.emails.sent.length;
    const res = await request(ctx.app).post('/api/auth/login').send({ email: ctx.email, password: 'mala-mala-mala' });
    expect(res.status).toBe(401);
    expect(res.body.token).toBeUndefined();
    expect(ctx.emails.sent.length).toBe(before);
  });

  it('cuenta suspendida con el código bueno: 403 sin token', async () => {
    const ctx = await setup();
    await enable2fa(ctx);
    const res = await request(ctx.app).post('/api/auth/login').send({ email: ctx.email, password: ctx.password });
    await ctx.db.query("UPDATE users SET status = 'SUSPENDED' WHERE email = $1", [ctx.email]);
    const verified = await request(ctx.app)
      .post(`/api/auth/challenges/${res.body.challenge.id}/verify`)
      .send({ code: ctx.emails.lastCodeTo(ctx.email) });
    expect(verified.status).toBe(403);
    expect(verified.body.token).toBeUndefined();
  });
});

describe('desactivar la verificación en dos pasos', () => {
  it('mala: 400; buena: 204 y el login vuelve a dar el token directo', async () => {
    const ctx = await setup();
    await enable2fa(ctx);
    const bad = await request(ctx.app).post('/api/auth/me/2fa/disable').set(bearer(ctx.token)).send({ password: 'mala-mala-mala' });
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe('WRONG_PASSWORD');
    expect((await me(ctx.app, ctx.token)).body.twoFactorEnabled).toBe(true);

    const ok = await request(ctx.app).post('/api/auth/me/2fa/disable').set(bearer(ctx.token)).send({ password: ctx.password });
    expect(ok.status).toBe(204);
    expect((await me(ctx.app, ctx.token)).body.twoFactorEnabled).toBe(false);

    const login = await request(ctx.app).post('/api/auth/login').send({ email: ctx.email, password: ctx.password });
    expect(login.status).toBe(200);
    expect(typeof login.body.token).toBe('string');
  });
});

describe('cuenta solo de Google', () => {
  it('enable y disable: 409 PASSWORD_REQUIRED', async () => {
    const google = fakeGoogle({ g1: { sub: 'sub-1', email: 'solog@correo.com', emailVerified: true, name: 'Solo G' } });
    const { app } = await makeTestApp({ google });
    const login = await request(app).post('/api/auth/google').send({ idToken: 'g1' });
    expect(login.status).toBe(200);
    const token = login.body.token as string;
    for (const path of ['enable', 'disable']) {
      const res = await request(app).post(`/api/auth/me/2fa/${path}`).set(bearer(token)).send({ password: 'lo-que-sea-1' });
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('PASSWORD_REQUIRED');
    }
  });
});
