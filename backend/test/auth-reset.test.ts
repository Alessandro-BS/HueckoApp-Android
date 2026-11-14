import request from 'supertest';
import { describe, expect, it } from 'vitest';
import type { Express } from 'express';

import type { Db } from '../src/db/db';
import { bearer, makeClock, makeTestApp, NOW, registerUnverified, registerUser } from './helpers';

const forgot = (app: Express, email: string) => request(app).post('/api/auth/password/forgot').send({ email });
const verify = (app: Express, id: string, body: object) => request(app).post(`/api/auth/challenges/${id}/verify`).send(body);
const resend = (app: Express, id: string) => request(app).post(`/api/auth/challenges/${id}/resend`);
const login = (app: Express, email: string, password: string) => request(app).post('/api/auth/login').send({ email, password });
const attemptsOf = async (db: Db, id: string) =>
  (await db.one<{ attempts: number; consumed_at: string | null }>('SELECT attempts, consumed_at FROM auth_challenges WHERE id = $1', [id]))!;

describe('recuperar la contraseña', () => {
  it('flujo completo: forgot -> código -> verify con newPassword; la vieja ya no entra, la nueva sí; token y celulares anteriores caen', async () => {
    const { app, db, emails } = await makeTestApp();
    const { token, user } = await registerUser(app, { email: 'ana@correo.com', password: 'contrasena-vieja' });
    await db.query("INSERT INTO push_devices (token, user_id, created_at, last_seen_at) VALUES ('t1', $1, 'x', 'x')", [user.id]);
    expect((await request(app).get('/api/auth/me').set(bearer(token))).status).toBe(200);

    const res = await forgot(app, 'ana@correo.com');
    expect(res.status).toBe(202);
    expect(res.body.challenge).toMatchObject({ purpose: 'RESET_PASSWORD', emailHint: 'a***@correo.com' });
    expect(res.body.token).toBeUndefined();

    const done = await verify(app, res.body.challenge.id, { code: emails.lastCodeTo('ana@correo.com'), newPassword: 'contrasena-nueva' });
    expect(done.status).toBe(200);
    expect(typeof done.body.token).toBe('string');
    expect(done.body.user).toMatchObject({ email: 'ana@correo.com', emailVerified: true, hasPassword: true });

    expect((await login(app, 'ana@correo.com', 'contrasena-vieja')).status).toBe(401);
    expect((await login(app, 'ana@correo.com', 'contrasena-nueva')).status).toBe(200);
    expect((await request(app).get('/api/auth/me').set(bearer(token))).status).toBe(401);
    expect((await request(app).get('/api/auth/me').set(bearer(done.body.token))).status).toBe(200);
    expect(await db.many('SELECT token FROM push_devices WHERE user_id = $1', [user.id])).toEqual([]);
  });

  it('una cuenta sin verificar queda verificada tras el reset', async () => {
    const { app, emails } = await makeTestApp();
    const { email } = await registerUnverified(app, { email: 'sin@correo.com' });
    const res = await forgot(app, email);
    expect(res.status).toBe(202);
    const done = await verify(app, res.body.challenge.id, { code: emails.lastCodeTo(email), newPassword: 'otra-contrasena' });
    expect(done.status).toBe(200);
    expect(done.body.user.emailVerified).toBe(true);
  });

  it('cuenta suspendida: se aplica el cambio pero responde 403 sin token', async () => {
    const { app, db, emails } = await makeTestApp();
    await registerUser(app, { email: 'sus@correo.com' });
    await db.query("UPDATE users SET status = 'SUSPENDED' WHERE email = 'sus@correo.com'");
    const res = await forgot(app, 'sus@correo.com');
    const done = await verify(app, res.body.challenge.id, { code: emails.lastCodeTo('sus@correo.com'), newPassword: 'otra-contrasena' });
    expect(done.status).toBe(403);
    expect(done.body.error.code).toBe('ACCOUNT_SUSPENDED');
    expect(done.body.token).toBeUndefined();
    expect((await login(app, 'sus@correo.com', 'otra-contrasena')).status).toBe(403);
  });

  it('verify sin newPassword -> 400 y no gasta intento (el código bueno sigue valiendo)', async () => {
    const { app, db, emails } = await makeTestApp();
    await registerUser(app, { email: 'ana@correo.com' });
    const res = await forgot(app, 'ana@correo.com');
    const code = emails.lastCodeTo('ana@correo.com');
    const bad = await verify(app, res.body.challenge.id, { code });
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe('VALIDATION_ERROR');
    const short = await verify(app, res.body.challenge.id, { code, newPassword: 'corta' });
    expect(short.status).toBe(400);
    expect(await attemptsOf(db, res.body.challenge.id)).toEqual({ attempts: 0, consumed_at: null });
    expect((await verify(app, res.body.challenge.id, { code, newPassword: 'contrasena-nueva' })).status).toBe(200);
  });

  it('una cuenta solo-Google también recibe el código y puede crear contraseña', async () => {
    const { app, db, emails } = await makeTestApp();
    const { user } = await registerUser(app, { email: 'goo@correo.com' });
    await db.query("UPDATE users SET password_hash = NULL, google_sub = 'g1' WHERE id = $1", [user.id]);
    const res = await forgot(app, 'goo@correo.com');
    const done = await verify(app, res.body.challenge.id, { code: emails.lastCodeTo('goo@correo.com'), newPassword: 'contrasena-nueva' });
    expect(done.status).toBe(200);
    expect(done.body.user).toMatchObject({ hasPassword: true, hasGoogle: true });
  });

  it('forgot valida el correo (400) y tiene su límite por IP', async () => {
    const { app } = await makeTestApp({ codeRateLimit: 2 });
    expect((await forgot(app, 'no-es-correo')).status).toBe(400);
    expect((await forgot(app, 'x@correo.com')).status).toBe(202);
    expect((await forgot(app, 'y@correo.com')).status).toBe(429);
  });
});

describe('forgot no delata cuentas (Review Focus 3)', () => {
  const shape = (body: { challenge: Record<string, unknown> }) => ({
    keys: Object.keys(body).sort(),
    challengeKeys: Object.keys(body.challenge).sort(),
    idLength: String(body.challenge.id).length,
    idFormat: /^[A-Za-z0-9_-]+$/.test(String(body.challenge.id)),
    purpose: body.challenge.purpose,
    emailHint: body.challenge.emailHint,
    resendAvailableAt: body.challenge.resendAvailableAt,
  });

  it('correo inexistente: 202 con la misma forma, ningún correo; verificar -> 410; reenviar -> 204', async () => {
    const clock = makeClock(NOW);
    const { app, emails } = await makeTestApp({ now: clock.now });
    await registerUser(app, { email: 'ana@correo.com' });
    const before = emails.sent.length;
    const real = await forgot(app, 'ana@correo.com');
    const fake = await forgot(app, 'nadie@correo.com');
    expect(fake.status).toBe(202);
    expect(real.status).toBe(202);
    expect(emails.sent.length).toBe(before + 1);
    const a = shape(real.body);
    const b = shape(fake.body);
    expect(b).toEqual({ ...a, emailHint: 'n***@correo.com' });
    expect(b.resendAvailableAt).toBe(new Date(NOW.getTime() + 60_000).toISOString());
    expect(b.idLength).toBe(43);
    expect(b.purpose).toBe('RESET_PASSWORD');
    expect((await verify(app, fake.body.challenge.id, { code: '123456', newPassword: 'contrasena-nueva' })).status).toBe(410);
    expect((await resend(app, fake.body.challenge.id)).status).toBe(204);
    expect(emails.sent.length).toBe(before + 1);
  });

  it('con Brevo caído, el correo existente responde 202 con la misma forma', async () => {
    const { app, emails } = await makeTestApp({ now: () => NOW });
    await registerUser(app, { email: 'ana@correo.com' });
    emails.fail(true);
    const real = await forgot(app, 'ana@correo.com');
    const fake = await forgot(app, 'nadie@correo.com');
    expect(real.status).toBe(202);
    expect(shape(real.body)).toEqual({ ...shape(fake.body), emailHint: 'a***@correo.com' });
  });

  it('con el límite diario agotado, el correo existente responde 202 con la misma forma', async () => {
    const { app, db, emails } = await makeTestApp({ now: () => NOW });
    const { user } = await registerUser(app, { email: 'ana@correo.com' });
    for (let i = 0; i < 10; i++) {
      await db.query(
        "INSERT INTO auth_challenges (id, user_id, purpose, code_hash, created_at, expires_at, send_count, last_sent_at, consumed_at) VALUES ($1, $2, 'LOGIN_2FA', 'h', $3, $4, 1, $3, $3)",
        [`lim${i}`, user.id, NOW.toISOString(), new Date(NOW.getTime() + 900_000).toISOString()],
      );
    }
    const before = emails.sent.length;
    const real = await forgot(app, 'ana@correo.com');
    const fake = await forgot(app, 'nadie@correo.com');
    expect(real.status).toBe(202);
    expect(emails.sent.length).toBe(before);
    expect(shape(real.body)).toEqual({ ...shape(fake.body), emailHint: 'a***@correo.com' });
  });

  it('reenviar un reto real consumido sigue dando 410', async () => {
    const { app, emails } = await makeTestApp();
    await registerUser(app, { email: 'ana@correo.com' });
    const res = await forgot(app, 'ana@correo.com');
    await verify(app, res.body.challenge.id, { code: emails.lastCodeTo('ana@correo.com'), newPassword: 'contrasena-nueva' });
    expect((await resend(app, res.body.challenge.id)).status).toBe(410);
  });
});

describe('newPassword en otros propósitos', () => {
  it('verify de VERIFY_EMAIL con un newPassword válido: 200 y la contraseña no cambia', async () => {
    const { app, emails } = await makeTestApp();
    const { challenge, email, password } = await registerUnverified(app, { email: 'np@correo.com' });
    const res = await verify(app, challenge.id, { code: emails.lastCodeTo(email), newPassword: 'contrasena-ajena' });
    expect(res.status).toBe(200);
    expect((await login(app, email, password)).status).toBe(200);
    expect((await login(app, email, 'contrasena-ajena')).status).toBe(401);
  });
});
