import type { TimeBlockInput } from '@hueckoapp/shared';
import type { Express } from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

import type { AiClient } from '../src/ai/ai-client';
import { OCR_PROMPT } from '../src/ai/schedule-ocr';
import { bearer, failingAi, fakeAi, fakeAiJson, makeTestApp, registerUser } from './helpers';

// Cabecera PNG: el servidor no decodifica la imagen, solo la reenvía a la IA.
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
const JPEG = Buffer.from('ffd8ffe000104a464946', 'hex');
const CRLF = String.fromCharCode(13, 10);
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.from([0x1a, 0, 0, 0]), Buffer.from('WEBPVP8 ')]);

const block = (dayOfWeek: number, startTime: string, endTime: string, label: string): TimeBlockInput => ({
  label, type: 'CLASE', startTime, endTime, isRecurring: true, dayOfWeek, date: null,
});

async function setup(ai?: AiClient, aiRateLimit?: number) {
  const { app } = makeTestApp({ ai, aiRateLimit });
  const { token } = await registerUser(app);
  return { app, token };
}

const scan = (app: Express, token: string, file: Buffer = PNG, filename = 'horario.png', contentType = 'image/png', field = 'image') =>
  request(app).post('/api/ai/schedule-ocr').set(bearer(token)).attach(field, file, { filename, contentType });

describe('POST /api/ai/schedule-ocr', () => {
  it('sin token → 401', async () => {
    const { app } = await setup();
    const res = await request(app).post('/api/ai/schedule-ocr').attach('image', PNG, { filename: 'h.png', contentType: 'image/png' });
    expect(res.status).toBe(401);
  });

  it('modo demostración: los 4 bloques del mock de Kotlin, normalizados (B13)', async () => {
    const { app, token } = await setup();
    const res = await scan(app, token);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      blocks: [
        block(1, '08:00', '10:00', 'Matemáticas Discretas'),
        block(1, '10:30', '12:30', 'Arquitectura de Software'),
        block(3, '09:00', '11:00', 'Bases de Datos Avanzadas'),
        block(5, '14:00', '16:00', 'Desarrollo Móvil Android'),
      ],
    });
  });

  it('envía la foto y el prompt a la IA; corrige «9:00», descarta inválidos y repetidos, ordena', async () => {
    const fake = fakeAiJson({
      blocks: [
        { dayOfWeek: 3, startTime: '9:00', endTime: '11:00', label: '  Cálculo  ' },
        { dayOfWeek: 1, startTime: '08:00', endTime: '10:00', label: 'Física' },
        { dayOfWeek: 9, startTime: '08:00', endTime: '10:00', label: 'Día inválido' },
        { dayOfWeek: 2, startTime: '12:00', endTime: '11:00', label: 'Al revés' },
        { dayOfWeek: 1, startTime: '08:00', endTime: '10:00', label: 'física' },
        { dayOfWeek: 4, startTime: '10:00', endTime: '12:00', label: '   ' },
        { dayOfWeek: 4, startTime: '25:00', endTime: '26:00', label: 'Hora imposible' },
        'no soy un bloque',
      ],
    });
    const { app, token } = await setup(fake.client);
    const res = await scan(app, token);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ blocks: [block(1, '08:00', '10:00', 'Física'), block(3, '09:00', '11:00', 'Cálculo')] });

    expect(fake.calls).toHaveLength(1);
    const [call] = fake.calls;
    expect(call.task).toBe('schedule-ocr');
    expect(call.prompt).toBe(OCR_PROMPT);
    expect(call.image?.mimeType).toBe('image/png');
    expect(call.image?.data.equals(PNG)).toBe(true);
  });

  it('acepta una lista suelta envuelta en ```json (como respondía la app Kotlin)', async () => {
    const reply = '```json\n[{"dayOfWeek":2,"startTime":"14:00","endTime":"16:00","label":"Taller"}]\n```';
    const { app, token } = await setup(fakeAi(reply).client);
    expect((await scan(app, token)).body).toEqual({ blocks: [block(2, '14:00', '16:00', 'Taller')] });
  });

  it('recorta nombres a 80 caracteres y devuelve como máximo 100 bloques', async () => {
    const many = Array.from({ length: 120 }, (_, i) => ({
      dayOfWeek: (i % 7) + 1, startTime: '08:00', endTime: '09:00', label: `Clase ${i} ${'x'.repeat(100)}`,
    }));
    const { app, token } = await setup(fakeAiJson({ blocks: many }).client);
    const res = await scan(app, token);
    expect(res.body.blocks).toHaveLength(100);
    expect(res.body.blocks.every((b: TimeBlockInput) => b.label.length === 80)).toBe(true);
  });

  it.each([
    ['image/jpeg', 'horario.jpg', JPEG],
    ['image/webp', 'horario.webp', WEBP],
  ])('acepta %s', async (contentType, filename, bytes) => {
    const { app, token } = await setup(fakeAiJson({ blocks: [] }).client);
    const res = await scan(app, token, bytes, filename, contentType);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ blocks: [] });
  });

  it.each([
    ['una PNG declarada como image/jpeg', PNG, 'foto.jpg', 'image/jpeg', 'image/png'],
    ['una JPEG declarada como image/png', JPEG, 'foto.png', 'image/png', 'image/jpeg'],
    ['una WEBP declarada como image/jpeg', WEBP, 'foto', 'image/jpeg', 'image/webp'],
  ])('acepta %s y envía a la IA el tipo real (el de los primeros bytes)', async (_name, bytes, filename, declared, real) => {
    const fake = fakeAiJson({ blocks: [] });
    const { app, token } = await setup(fake.client);
    const res = await scan(app, token, bytes, filename, declared);
    expect(res.status).toBe(200);
    expect(fake.calls).toHaveLength(1);
    expect(fake.calls[0].image?.mimeType).toBe(real);
  });

  it('JSON ilegible o sin «blocks» → 502 AI_BAD_RESPONSE', async () => {
    for (const reply of ['no es json', '{"items":[]}']) {
      const { app, token } = await setup(fakeAi(reply).client);
      const res = await scan(app, token);
      expect(res.status).toBe(502);
      expect(res.body.error.code).toBe('AI_BAD_RESPONSE');
    }
  });

  it('proveedor caído → 503 AI_UNAVAILABLE', async () => {
    const { app, token } = await setup(failingAi());
    const res = await scan(app, token);
    expect(res.status).toBe(503);
    expect(res.body.error).toEqual({
      code: 'AI_UNAVAILABLE', message: 'La IA no está disponible en este momento. Inténtalo en unos minutos.', details: null,
    });
  });

  it('valida el archivo antes de llamar a la IA', async () => {
    const fake = fakeAiJson({ blocks: [] });
    const { app, token } = await setup(fake.client);

    const sinArchivo = await request(app).post('/api/ai/schedule-ocr').set(bearer(token)).send({});
    expect(sinArchivo.status).toBe(400);
    expect(sinArchivo.body.error.code).toBe('IMAGE_REQUIRED');

    const gif = await scan(app, token, PNG, 'horario.gif', 'image/gif');
    expect(gif.status).toBe(400);
    expect(gif.body.error).toMatchObject({ code: 'INVALID_IMAGE', message: 'La imagen debe ser JPG, PNG o WEBP.' });

    // Los primeros bytes deben coincidir con el tipo declarado (o ser de una imagen conocida).
    const texto = await scan(app, token, Buffer.from('esto no es una imagen'), 'horario.png', 'image/png');
    expect(texto.status).toBe(400);
    expect(texto.body.error).toMatchObject({ code: 'INVALID_IMAGE', message: 'La imagen debe ser JPG, PNG o WEBP.' });
    const riffSinWebp = await scan(app, token, Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WAVEfmt ')]), 'h.webp', 'image/webp');
    expect(riffSinWebp.status).toBe(400);

    // Archivos más cortos que la cabecera (o vacíos).
    const corto = await scan(app, token, Buffer.from('RIFF'), 'h.webp', 'image/webp');
    expect(corto.status).toBe(400);
    expect(corto.body.error.code).toBe('INVALID_IMAGE');
    const vacio = await scan(app, token, Buffer.alloc(0));
    expect(vacio.status).toBe(400);

    // Cuerpo multipart roto o cortado: 400, no 500.
    const roto = await request(app)
      .post('/api/ai/schedule-ocr')
      .set(bearer(token))
      .set('Content-Type', 'multipart/form-data; boundary=X')
      .send(['--X', 'Content-Disposition: form-data; name="image"; filename="h.png"', 'Content-Type: image/png', '', 'abc'].join(CRLF));
    expect(roto.status).toBe(400);
    expect(roto.body.error.code).toBe('INVALID_UPLOAD');
    const sinBoundary = await request(app)
      .post('/api/ai/schedule-ocr')
      .set(bearer(token))
      .set('Content-Type', 'multipart/form-data')
      .send('basura');
    expect(sinBoundary.status).toBe(400);
    expect(sinBoundary.body.error.code).toBe('INVALID_UPLOAD');

    const otroCampo = await scan(app, token, PNG, 'horario.png', 'image/png', 'foto');
    expect(otroCampo.status).toBe(400);
    expect(otroCampo.body.error.code).toBe('INVALID_UPLOAD');

    // Un campo de texto además de la imagen: multer no acepta campos (fields: 0, parts: 1).
    for (const extra of [
      request(app).post('/api/ai/schedule-ocr').set(bearer(token)).field('nota', 'hola').attach('image', PNG, { filename: 'h.png', contentType: 'image/png' }),
      request(app).post('/api/ai/schedule-ocr').set(bearer(token)).attach('image', PNG, { filename: 'h.png', contentType: 'image/png' }).field('nota', 'hola'),
    ]) {
      const res = await extra;
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_UPLOAD');
    }

    const grande = await scan(app, token, Buffer.alloc(5 * 1024 * 1024 + 1));
    expect(grande.status).toBe(413);
    expect(grande.body.error).toMatchObject({ code: 'PAYLOAD_TOO_LARGE', message: 'La imagen supera los 5 MB.' });

    expect(fake.calls).toHaveLength(0);
  });

  it('límite de IA por usuario → 429 TOO_MANY_REQUESTS', async () => {
    const { app, token } = await setup(fakeAiJson({ blocks: [] }).client, 1);
    expect((await scan(app, token)).status).toBe(200);
    const limited = await scan(app, token);
    expect(limited.status).toBe(429);
    expect(limited.body.error.code).toBe('TOO_MANY_REQUESTS');
  });

  it('el límite es por usuario y GET /ai/status no gasta cuota', async () => {
    const { app, token } = await setup(fakeAiJson({ blocks: [] }).client, 1);
    const otro = await registerUser(app);
    for (let i = 0; i < 3; i++) expect((await request(app).get('/api/ai/status').set(bearer(token))).status).toBe(200);
    expect((await scan(app, token)).status).toBe(200);
    expect((await scan(app, token)).status).toBe(429);
    expect((await scan(app, otro.token)).status).toBe(200);
    expect((await scan(app, otro.token)).status).toBe(429);
  });

  it('lo leído se guarda después con POST /me/time-blocks/bulk (el OCR no guarda nada)', async () => {
    const { app, token } = await setup();
    const { body } = await scan(app, token);
    expect((await request(app).get('/api/me/time-blocks').set(bearer(token))).body).toEqual([]);
    const saved = await request(app).post('/api/me/time-blocks/bulk').set(bearer(token)).send({ blocks: body.blocks });
    expect(saved.status).toBe(201);
    expect(saved.body).toHaveLength(4);
  });
});
