import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Express } from 'express';

import { makeTestApp, registerUser, TEST_SECRET } from './helpers';

let app: Express;
beforeEach(() => {
  ({ app } = makeTestApp());
});

describe('POST /api/auth/register', () => {
  it('crea la cuenta y devuelve token + usuario sin contraseña', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: '  Ana Pérez ', email: '  Ana@Correo.com ', password: 'contrasena-segura' });
    expect(res.status).toBe(201);
    expect(typeof res.body.token).toBe('string');
    expect(res.body.user).toEqual({ id: expect.any(String), name: 'Ana Pérez', email: 'ana@correo.com' });
    expect(JSON.stringify(res.body)).not.toContain('password');
  });

  it('rechaza un correo ya registrado con 409 EMAIL_TAKEN', async () => {
    await registerUser(app, { email: 'ana@correo.com' });
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Otra', email: 'ANA@correo.com', password: 'contrasena-segura' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('EMAIL_TAKEN');
    expect(res.body.error.message).toBe('Ya existe una cuenta con ese correo.');
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
  it('inicia sesión con el correo en cualquier formato de mayúsculas', async () => {
    await registerUser(app, { email: 'ana@correo.com', password: 'contrasena-segura' });
    const res = await request(app).post('/api/auth/login').send({ email: ' ANA@correo.com', password: 'contrasena-segura' });
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe('ana@correo.com');
    expect(typeof res.body.token).toBe('string');
  });

  it.each([
    ['contraseña incorrecta', 'ana@correo.com', 'otra-contrasena'],
    ['correo inexistente', 'nadie@correo.com', 'contrasena-segura'],
  ])('%s → 401 con el mismo mensaje', async (_caso, email, password) => {
    await registerUser(app, { email: 'ana@correo.com', password: 'contrasena-segura' });
    const res = await request(app).post('/api/auth/login').send({ email, password });
    expect(res.status).toBe(401);
    expect(res.body.error).toMatchObject({ code: 'INVALID_CREDENTIALS', message: 'Correo o contraseña incorrectos.' });
  });
});

describe('GET /api/auth/me', () => {
  it('devuelve el usuario del token', async () => {
    const { token, user } = await registerUser(app);
    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual(user);
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
