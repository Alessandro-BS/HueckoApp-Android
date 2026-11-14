import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Express } from 'express';

import { bearer, makeClock, makeTestApp, NOW, registerUnverified, registerUser, TEST_SECRET } from './helpers';

let app: Express;
beforeEach(async () => {
  ({ app } = await makeTestApp());
});

const SECOND = 1000;
const register = (target: Express, body: { name: string; email: string; password: string }) => request(target).post('/api/auth/register').send(body);
const login = (target: Express, email: string, password: string) => request(target).post('/api/auth/login').send({ email, password });

describe('POST /api/auth/register', () => {
  it('crea la cuenta sin verificar y responde 201 { challenge } sin token: el código va por correo', async () => {
    const { app: target, db, emails } = await makeTestApp({ now: () => NOW });
    const res = await register(target, { name: '  Ana Pérez ', email: '  Ana@Correo.com ', password: 'contrasena-segura' });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      challenge: {
        id: expect.any(String),
        purpose: 'VERIFY_EMAIL',
        emailHint: 'a***@correo.com',
        resendAvailableAt: new Date(NOW.getTime() + 60 * SECOND).toISOString(),
      },
    });
    expect(emails.sent.map((m) => m.to)).toEqual(['ana@correo.com']);
    expect(await db.one('SELECT name, email, email_verified FROM users')).toEqual({ name: 'Ana Pérez', email: 'ana@correo.com', email_verified: false });
    expect(JSON.stringify(res.body)).not.toContain('password');
  });

  it('rechaza un correo ya verificado con 409 EMAIL_TAKEN', async () => {
    await registerUser(app, { email: 'ana@correo.com' });
    const res = await register(app, { name: 'Otra', email: 'ANA@correo.com', password: 'contrasena-segura' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('EMAIL_TAKEN');
    expect(res.body.error.message).toBe('Ya existe una cuenta con ese correo.');
  });

  it('un correo sin verificar se puede registrar otra vez: valen el nombre y la contraseña nuevos, no los viejos', async () => {
    const { app: target, emails } = await makeTestApp();
    const first = await registerUnverified(target, { name: 'Intruso', email: 'ana@correo.com', password: 'contrasena-vieja' });
    const again = await register(target, { name: 'Ana', email: 'ana@correo.com', password: 'contrasena-nueva' });
    expect(again.status).toBe(201);
    expect(again.body.challenge.purpose).toBe('VERIFY_EMAIL');
    expect(again.body.token).toBeUndefined();
    const verified = await request(target)
      .post(`/api/auth/challenges/${again.body.challenge.id}/verify`)
      .send({ code: emails.lastCodeTo(first.email) });
    expect(verified.status).toBe(200);
    expect(verified.body.user.name).toBe('Ana');
    expect((await login(target, 'ana@correo.com', 'contrasena-vieja')).status).toBe(401);
    expect((await login(target, 'ana@correo.com', 'contrasena-nueva')).status).toBe(200);
  });

  it('un correo sin verificar pero vinculado a Google → 409 EMAIL_TAKEN', async () => {
    const { app: target, db } = await makeTestApp();
    await registerUnverified(target, { email: 'ana@correo.com' });
    await db.query("UPDATE users SET google_sub = 'google-123' WHERE email = 'ana@correo.com'");
    const res = await register(target, { name: 'Otra', email: 'ana@correo.com', password: 'contrasena-segura' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('EMAIL_TAKEN');
  });

  it('si el correo no sale: 503 EMAIL_SEND_FAILED, y registrarse otra vez con el mismo correo lo reenvía (no 409)', async () => {
    const { app: target, emails } = await makeTestApp();
    const body = { name: 'Ana', email: 'ana@correo.com', password: 'contrasena-segura' };
    emails.fail(true);
    const failed = await register(target, body);
    expect(failed.status).toBe(503);
    expect(failed.body.error.code).toBe('EMAIL_SEND_FAILED');
    expect(failed.body.token).toBeUndefined();
    emails.fail(false);
    const retry = await register(target, body);
    expect(retry.status).toBe(201);
    expect(emails.sent.map((m) => m.to)).toEqual(['ana@correo.com']);
  });

  it.each([
    [{ name: '', email: 'a@b.co', password: 'contrasena-segura' }, 'name', 'El nombre es requerido'],
    [{ name: 'Ana', email: 'no-es-correo', password: 'contrasena-segura' }, 'email', 'Ingresa un correo válido'],
    [{ name: 'Ana', email: 'a@b.co', password: 'corta' }, 'password', 'Mínimo 8 caracteres'],
  ])('valida los datos (%j) → 400 en %s', async (body, field, message) => {
    const res = await request(app).post('/api/auth/register').send(body);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details).toContainEqual(expect.objectContaining({ path: [field], message }));
  });
});

describe('POST /api/auth/login', () => {
  it('cuenta verificada: { token, user } con el correo en cualquier formato de mayúsculas', async () => {
    const { user } = await registerUser(app, { email: 'ana@correo.com', password: 'contrasena-segura' });
    const res = await login(app, ' ANA@correo.com', 'contrasena-segura');
    expect(res.status).toBe(200);
    expect(typeof res.body.token).toBe('string');
    expect(res.body.user).toEqual({
      ...user,
      role: 'USER',
      emailVerified: true,
      twoFactorEnabled: false,
      hasPassword: true,
      hasGoogle: false,
    });
  });

  it('cuenta sin verificar: 200 { challenge } VERIFY_EMAIL sin token, y manda un código nuevo', async () => {
    const clock = makeClock(NOW);
    const { app: target, emails } = await makeTestApp({ now: clock.now });
    await registerUnverified(target, { email: 'ana@correo.com', password: 'contrasena-segura' });
    clock.set(new Date(NOW.getTime() + 61 * SECOND));
    const res = await login(target, 'ana@correo.com', 'contrasena-segura');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ challenge: expect.objectContaining({ purpose: 'VERIFY_EMAIL', emailHint: 'a***@correo.com' }) });
    expect(emails.sent).toHaveLength(2);
    const verified = await request(target)
      .post(`/api/auth/challenges/${res.body.challenge.id}/verify`)
      .send({ code: emails.lastCodeTo('ana@correo.com') });
    expect(verified.status).toBe(200);
  });

  it('cuenta sin verificar con la contraseña mala: el 401 de siempre y ningún correo', async () => {
    const { app: target, emails } = await makeTestApp();
    await registerUnverified(target, { email: 'ana@correo.com', password: 'contrasena-segura' });
    const res = await login(target, 'ana@correo.com', 'otra-contrasena');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
    expect(emails.sent).toHaveLength(1);
  });

  it('una cuenta sin contraseña (solo Google) → 401 INVALID_CREDENTIALS', async () => {
    const { app: target, db } = await makeTestApp();
    await registerUser(target, { email: 'ana@correo.com', password: 'contrasena-segura' });
    await db.query("UPDATE users SET password_hash = NULL, google_sub = 'google-123' WHERE email = 'ana@correo.com'");
    const res = await login(target, 'ana@correo.com', 'contrasena-segura');
    expect(res.status).toBe(401);
    expect(res.body.error).toMatchObject({ code: 'INVALID_CREDENTIALS', message: 'Correo o contraseña incorrectos.' });
  });

  it.each([
    ['contraseña incorrecta', 'ana@correo.com', 'otra-contrasena'],
    ['correo inexistente', 'nadie@correo.com', 'contrasena-segura'],
  ])('%s → 401 con el mismo mensaje', async (_caso, email, password) => {
    await registerUser(app, { email: 'ana@correo.com', password: 'contrasena-segura' });
    const res = await login(app, email, password);
    expect(res.status).toBe(401);
    expect(res.body.error).toMatchObject({ code: 'INVALID_CREDENTIALS', message: 'Correo o contraseña incorrectos.' });
  });
});

describe('GET /api/auth/me', () => {
  it('devuelve el usuario del token con los datos de su cuenta', async () => {
    const { token, user } = await registerUser(app);
    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ...user, role: 'USER', emailVerified: true, twoFactorEnabled: false, hasPassword: true, hasGoogle: false });
  });

  it('sin token → 401 UNAUTHORIZED', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('token firmado con otro secreto → 401', async () => {
    const forged = jwt.sign({ sub: 'x' }, 'otro-secreto-cualquiera-de-32-caracteres!!');
    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${forged}`);
    expect(res.status).toBe(401);
  });

  it('token expirado → 401', async () => {
    const { user } = await registerUser(app);
    const expired = jwt.sign({ sub: user.id }, TEST_SECRET, { expiresIn: -10 });
    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${expired}`);
    expect(res.status).toBe(401);
  });
});

describe('versión de la sesión (sv)', () => {
  it('el token lleva sv = session_version de la cuenta', async () => {
    const { token } = await registerUser(app);
    expect(jwt.decode(token)).toMatchObject({ sv: 0 });
  });

  it('un JWT de antes de la actualización (sin sv) sigue entrando: cuenta como sv = 0', async () => {
    const { user } = await registerUser(app);
    const legacy = jwt.sign({}, TEST_SECRET, { subject: user.id, expiresIn: '1h' });
    expect((await request(app).get('/api/auth/me').set(bearer(legacy))).status).toBe(200);
  });

  it('un sv que no es un número entero → 401', async () => {
    const { user } = await registerUser(app);
    const odd = jwt.sign({ sv: '0' }, TEST_SECRET, { subject: user.id, expiresIn: '1h' });
    expect((await request(app).get('/api/auth/me').set(bearer(odd))).status).toBe(401);
  });

  it('subir session_version en la base invalida los tokens anteriores (con sv: 0 y sin sv): 401 UNAUTHORIZED', async () => {
    const { app: target, db } = await makeTestApp();
    const { token, user } = await registerUser(target);
    const legacy = jwt.sign({}, TEST_SECRET, { subject: user.id, expiresIn: '1h' });
    expect((await request(target).get('/api/groups').set(bearer(token))).status).toBe(200); // control positivo
    await db.query('UPDATE users SET session_version = 1 WHERE id = $1', [user.id]);
    for (const t of [token, legacy]) {
      const res = await request(target).get('/api/groups').set(bearer(t));
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    }
    // El login firma con la versión nueva y entra.
    const fresh = await login(target, user.email, 'contrasena-segura');
    expect(jwt.decode(fresh.body.token)).toMatchObject({ sv: 1 });
    expect((await request(target).get('/api/groups').set(bearer(fresh.body.token))).status).toBe(200);
  });
});

describe('límites de intentos en /api/auth (D10)', () => {
  const login = (target: Express, ip?: string) => {
    const req = request(target).post('/api/auth/login');
    if (ip) req.set('X-Forwarded-For', ip);
    return req.send({ email: 'ana@correo.com', password: 'contrasena-segura' });
  };
  const register = (target: Express, n: number) =>
    request(target).post('/api/auth/register').send({ name: `Persona ${n}`, email: `persona${n}@correo.com`, password: 'contrasena-segura' });

  it('el tercer login con límite 2 responde 429 TOO_MANY_REQUESTS', async () => {
    const limited = await (await makeTestApp({ loginRateLimit: 2 })).app;
    await login(limited);
    await login(limited);
    const res = await login(limited);
    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe('TOO_MANY_REQUESTS');
    expect(res.body.error.message).toBe('Demasiados intentos. Espera unos minutos.');
  });

  it('login y registro tienen contadores separados', async () => {
    const limited = await (await makeTestApp({ loginRateLimit: 1, registerRateLimit: 1 })).app;
    expect((await login(limited)).status).toBe(401);
    expect((await login(limited)).status).toBe(429);
    // Agotar el login no bloquea el registro…
    expect((await register(limited, 1)).status).toBe(201);
    // …y el registro tiene su propio tope.
    expect((await register(limited, 2)).status).toBe(429);
  });

  it('con trust proxy = 1, cada IP de X-Forwarded-For tiene su propio contador', async () => {
    const limited = await (await makeTestApp({ loginRateLimit: 1, trustProxy: 1 })).app;
    expect((await login(limited, '203.0.113.1')).status).toBe(401);
    expect((await login(limited, '203.0.113.1')).status).toBe(429);
    expect((await login(limited, '203.0.113.2')).status).toBe(401);
  });

  it('sin trust proxy (por defecto) X-Forwarded-For se ignora: todo cuenta como la misma IP', async () => {
    // express-rate-limit avisa por consola de la cabecera inesperada (ERR_ERL_UNEXPECTED_X_FORWARDED_FOR): se silencia.
    const quietError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const quietWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const limited = await (await makeTestApp({ loginRateLimit: 1 })).app;
      expect((await login(limited, '203.0.113.1')).status).toBe(401);
      expect((await login(limited, '203.0.113.2')).status).toBe(429);
    } finally {
      quietError.mockRestore();
      quietWarn.mockRestore();
    }
  });
});
