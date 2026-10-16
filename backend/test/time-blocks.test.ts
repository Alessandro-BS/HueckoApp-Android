import type { TimeBlockInput, User } from '@hueckoapp/shared';
import type { Express } from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';

import { bearer, makeTestApp, registerUser } from './helpers';

const recurrente: TimeBlockInput = {
  label: 'Clase de Android', type: 'CLASE', startTime: '08:00', endTime: '10:00',
  isRecurring: true, dayOfWeek: 1, date: null,
};
const puntual: TimeBlockInput = {
  label: 'Dentista', type: 'PUNTUAL', startTime: '15:00', endTime: '16:00',
  isRecurring: false, dayOfWeek: null, date: '2026-10-02',
};

let app: Express;
let token: string;
let me: User;

beforeEach(async () => {
  ({ app } = await makeTestApp());
  ({ token, user: me } = await registerUser(app));
});

const post = (body: unknown, t = token) => request(app).post('/api/me/time-blocks').set(bearer(t)).send(body as object);
const list = (t = token) => request(app).get('/api/me/time-blocks').set(bearer(t));

describe('POST /api/me/time-blocks', () => {
  it('crea un bloque recurrente con el userId del token', async () => {
    const res = await post(recurrente);
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ ...recurrente, id: expect.any(String), userId: me.id });
  });

  it('crea un bloque puntual con fecha', async () => {
    const res = await post(puntual);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ isRecurring: false, dayOfWeek: null, date: '2026-10-02', type: 'PUNTUAL' });
  });

  it('acepta omitir el campo que no aplica (date en recurrentes, dayOfWeek en puntuales)', async () => {
    const { date: _d, ...sinFecha } = recurrente;
    const { dayOfWeek: _w, ...sinDia } = puntual;
    expect((await post(sinFecha)).body.date).toBeNull();
    expect((await post(sinDia)).body.dayOfWeek).toBeNull();
  });

  it('ignora un userId enviado en el cuerpo y recorta el nombre', async () => {
    const res = await post({ ...recurrente, label: '  Clase de Android  ', userId: 'otro' });
    expect(res.status).toBe(201);
    expect(res.body.userId).toBe(me.id);
    expect(res.body.label).toBe('Clase de Android');
  });

  it.each([
    [{ ...recurrente, startTime: '8:00' }, 'startTime', 'Formato HH:mm'],
    [{ ...recurrente, endTime: '24:00' }, 'endTime', 'Formato HH:mm'],
    [{ ...recurrente, startTime: '10:00', endTime: '10:00' }, 'endTime', 'La hora de fin debe ser posterior a la de inicio'],
    [{ ...recurrente, dayOfWeek: null }, 'dayOfWeek', 'El día es requerido en un bloque recurrente'],
    [{ ...recurrente, dayOfWeek: 8 }, 'dayOfWeek', 'Día inválido'],
    [{ ...recurrente, date: '2026-10-02' }, 'date', 'Un bloque recurrente no lleva fecha'],
    [{ ...puntual, date: null }, 'date', 'La fecha es requerida en un bloque puntual'],
    [{ ...puntual, date: '2026-02-30' }, 'date', 'Fecha inválida (YYYY-MM-DD)'],
    [{ ...puntual, dayOfWeek: 5 }, 'dayOfWeek', 'Un bloque puntual no lleva día de la semana'],
    [{ ...recurrente, type: 'OTRO' }, 'type', 'Tipo de bloque inválido'],
    [{ ...recurrente, label: '   ' }, 'label', 'El nombre es requerido'],
  ])('valida %j → 400 en %s', async (body, field, message) => {
    const res = await post(body);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details).toContainEqual(expect.objectContaining({ path: [field], message }));
  });

  it('sin token → 401', async () => {
    const res = await request(app).post('/api/me/time-blocks').send(recurrente);
    expect(res.status).toBe(401);
  });
});

describe('GET /api/me/time-blocks', () => {
  it('devuelve solo mis bloques: recurrentes por día y hora, después los puntuales', async () => {
    await post(puntual);
    await post({ ...recurrente, label: 'Taller', dayOfWeek: 3, startTime: '09:00', endTime: '11:00' });
    await post(recurrente);
    const otra = await registerUser(app);
    await post({ ...recurrente, label: 'De otra persona' }, otra.token);

    const res = await list();
    expect(res.status).toBe(200);
    expect(res.body.map((b: { label: string }) => b.label)).toEqual(['Clase de Android', 'Taller', 'Dentista']);
  });
});

describe('POST /api/me/time-blocks/bulk', () => {
  it('crea todos los bloques de una vez', async () => {
    const res = await request(app).post('/api/me/time-blocks/bulk').set(bearer(token)).send({ blocks: [recurrente, puntual] });
    expect(res.status).toBe(201);
    expect(res.body).toHaveLength(2);
    expect((await list()).body).toHaveLength(2);
  });

  it('si uno es inválido no guarda ninguno', async () => {
    const res = await request(app)
      .post('/api/me/time-blocks/bulk')
      .set(bearer(token))
      .send({ blocks: [recurrente, { ...recurrente, endTime: '07:00' }] });
    expect(res.status).toBe(400);
    expect(res.body.error.details).toContainEqual(expect.objectContaining({ path: ['blocks', 1, 'endTime'] }));
    expect((await list()).body).toEqual([]);
  });

  it('rechaza una lista vacía', async () => {
    const res = await request(app).post('/api/me/time-blocks/bulk').set(bearer(token)).send({ blocks: [] });
    expect(res.status).toBe(400);
    expect(res.body.error.details).toContainEqual(expect.objectContaining({ message: 'Envía al menos un bloque' }));
  });
});

describe('DELETE /api/me/time-blocks/:id', () => {
  it('borra mi bloque → 204', async () => {
    const { body: block } = await post(recurrente);
    const res = await request(app).delete(`/api/me/time-blocks/${block.id}`).set(bearer(token));
    expect(res.status).toBe(204);
    expect((await list()).body).toEqual([]);
  });

  it('el bloque de otra persona → 404 TIME_BLOCK_NOT_FOUND y no se borra', async () => {
    const otra = await registerUser(app);
    const { body: block } = await post(recurrente, otra.token);
    const res = await request(app).delete(`/api/me/time-blocks/${block.id}`).set(bearer(token));
    expect(res.status).toBe(404);
    expect(res.body.error).toMatchObject({ code: 'TIME_BLOCK_NOT_FOUND', message: 'Bloque no encontrado.' });
    expect((await list(otra.token)).body).toHaveLength(1);
  });
});
