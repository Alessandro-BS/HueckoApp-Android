import request from 'supertest';
import { describe, expect, it } from 'vitest';
import type { Express } from 'express';

import type { ChallengePurpose } from '../src/auth/challenge-rules';
import { issueChallenge } from '../src/auth/challenges';
import type { Db } from '../src/db/db';
import { bearer, type FakeEmail, makeClock, makeTestApp, NOW, registerUnverified, TEST_SECRET } from './helpers';

const SECOND = 1000;
const verify = (app: Express, id: string, body: object) => request(app).post(`/api/auth/challenges/${id}/verify`).send(body);
const resend = (app: Express, id: string) => request(app).post(`/api/auth/challenges/${id}/resend`);
const attemptsOf = async (db: Db, id: string) =>
  (await db.one<{ attempts: number; consumed_at: string | null }>('SELECT attempts, consumed_at FROM auth_challenges WHERE id = $1', [id]))!;

describe('POST /api/auth/challenges/:id/verify (VERIFY_EMAIL)', () => {
  it('con el código del correo: verifica la cuenta y responde 200 { token, user }; /auth/me funciona', async () => {
    const { app, db, emails } = await makeTestApp();
    const { challenge, email } = await registerUnverified(app, { name: 'Ana', email: 'ana@correo.com' });
    const res = await verify(app, challenge.id, { code: emails.lastCodeTo(email) });
    expect(res.status).toBe(200);
    expect(typeof res.body.token).toBe('string');
    expect(res.body.user).toEqual({
      id: expect.any(String),
      name: 'Ana',
      email: 'ana@correo.com',
      role: 'USER',
      emailVerified: true,
      twoFactorEnabled: false,
      hasPassword: true,
      hasGoogle: false,
    });
    expect(await db.one('SELECT email_verified FROM users WHERE email = $1', [email])).toEqual({ email_verified: true });
    const me = await request(app).get('/api/auth/me').set(bearer(res.body.token));
    expect(me.status).toBe(200);
    expect(me.body).toEqual(res.body.user);
  });

  it('el código acepta espacios alrededor', async () => {
    const { app, emails } = await makeTestApp();
    const { challenge, email } = await registerUnverified(app);
    expect((await verify(app, challenge.id, { code: ` ${emails.lastCodeTo(email)} ` })).status).toBe(200);
  });

  it('un código ya usado no vuelve a servir: 410 CHALLENGE_EXPIRED', async () => {
    const { app, emails } = await makeTestApp();
    const { challenge, email } = await registerUnverified(app);
    const code = emails.lastCodeTo(email);
    expect((await verify(app, challenge.id, { code })).status).toBe(200);
    const again = await verify(app, challenge.id, { code });
    expect(again.status).toBe(410);
    expect(again.body.error).toMatchObject({ code: 'CHALLENGE_EXPIRED', message: 'Pide un código nuevo.' });
  });

  it('código malo → 400 CODE_INVALID con los intentos que quedan, sin token', async () => {
    const { app, emails } = await makeTestApp();
    const { challenge, email } = await registerUnverified(app);
    const wrong = emails.lastCodeTo(email) === '000000' ? '111111' : '000000';
    const res = await verify(app, challenge.id, { code: wrong });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatchObject({ code: 'CODE_INVALID', details: { attemptsLeft: 4 } });
    expect(res.body.token).toBeUndefined();
  });

  it('reenviar manda otro correo y solo el código nuevo vale', async () => {
    const clock = makeClock(NOW);
    const { app, emails } = await makeTestApp({ now: clock.now });
    const { challenge, email } = await registerUnverified(app);
    const oldCode = emails.lastCodeTo(email);
    clock.set(new Date(NOW.getTime() + 61 * SECOND));
    const res = await resend(app, challenge.id);
    expect(res.status).toBe(204);
    expect(emails.sent.filter((m) => m.to === email)).toHaveLength(2);
    const newCode = emails.lastCodeTo(email);
    if (oldCode !== newCode) expect((await verify(app, challenge.id, { code: oldCode })).status).toBe(400);
    expect((await verify(app, challenge.id, { code: newCode })).status).toBe(200);
  });

  it('reenviar antes de 60 s → 429 RESEND_TOO_SOON', async () => {
    const { app } = await makeTestApp({ now: () => NOW });
    const { challenge } = await registerUnverified(app);
    const res = await resend(app, challenge.id);
    expect(res.status).toBe(429);
    expect(res.body.error).toMatchObject({ code: 'RESEND_TOO_SOON', details: { retryAfterSeconds: 60 } });
  });

  it('un reto que no existe → 410 CHALLENGE_EXPIRED', async () => {
    const { app } = await makeTestApp();
    const res = await verify(app, 'xyz', { code: '123456' });
    expect(res.status).toBe(410);
    expect(res.body.error.code).toBe('CHALLENGE_EXPIRED');
  });

  it.each([['12a456'], ['12345'], ['1234567'], ['']])('código «%s» → 400 VALIDATION_ERROR sin gastar intento', async (code) => {
    const { app, db } = await makeTestApp();
    const { challenge } = await registerUnverified(app);
    const res = await verify(app, challenge.id, { code });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details).toContainEqual(expect.objectContaining({ path: ['code'] }));
    expect(await attemptsOf(db, challenge.id)).toEqual({ attempts: 0, consumed_at: null });
  });

  it('una cuenta suspendida con el código bueno: queda verificada pero responde 403 ACCOUNT_SUSPENDED sin token', async () => {
    const { app, db, emails } = await makeTestApp();
    const { challenge, email } = await registerUnverified(app);
    await db.query("UPDATE users SET status = 'SUSPENDED' WHERE email = $1", [email]);
    const res = await verify(app, challenge.id, { code: emails.lastCodeTo(email) });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('ACCOUNT_SUSPENDED');
    expect(res.body.token).toBeUndefined();
    expect(await db.one('SELECT email_verified FROM users WHERE email = $1', [email])).toEqual({ email_verified: true });
  });

  it.each<ChallengePurpose>(['RESET_PASSWORD', 'LOGIN_2FA', 'ENABLE_2FA'])(
    'un reto %s todavía no se acepta aquí: 410 sin gastar intento ni consumirlo',
    async (purpose) => {
      const { app, db, emails } = await makeTestApp({ now: () => NOW });
      const { email } = await registerUnverified(app);
      const user = (await db.one<{ id: string }>('SELECT id FROM users WHERE email = $1', [email]))!;
      const view = await issueChallenge({ db, email: emails, secret: TEST_SECRET, now: () => NOW }, { id: user.id, email }, purpose);
      const res = await verify(app, view.id, { code: (emails as FakeEmail).lastCodeTo(email) });
      expect(res.status).toBe(410);
      expect(res.body.error.code).toBe('CHALLENGE_EXPIRED');
      expect(res.body.token).toBeUndefined();
      expect(await attemptsOf(db, view.id)).toEqual({ attempts: 0, consumed_at: null });
    },
  );

  it('verify y resend tienen su límite por IP (CODE_RATE_LIMIT): 429 TOO_MANY_REQUESTS', async () => {
    const { app } = await makeTestApp({ codeRateLimit: 2 });
    expect((await verify(app, 'xyz', { code: '123456' })).status).toBe(410);
    expect((await resend(app, 'xyz')).status).toBe(410);
    const res = await verify(app, 'xyz', { code: '123456' });
    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe('TOO_MANY_REQUESTS');
  });
});
