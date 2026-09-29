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
