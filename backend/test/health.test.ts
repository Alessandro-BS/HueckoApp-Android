import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { makeTestApp } from './helpers';

describe('API base', () => {
  const { app } = makeTestApp();

  it('GET /api/health responde ok', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('una ruta inexistente devuelve 404 con el formato de error del contrato', async () => {
    const res = await request(app).get('/api/no-existe');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});

describe('errores del cuerpo de la petición', () => {
  const { app } = makeTestApp();

  it('JSON malformado devuelve 400 INVALID_JSON', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send('{mal');
    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: { code: 'INVALID_JSON', message: 'El cuerpo de la petición no es JSON válido.', details: null },
    });
  });

  it('un cuerpo demasiado grande devuelve 413 PAYLOAD_TOO_LARGE', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ email: 'a'.repeat(1_100_000) }));
    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });
});
