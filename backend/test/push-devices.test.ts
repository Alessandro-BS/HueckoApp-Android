import type { Express } from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';

import { bearer, makeClock, makeTestApp, NOW, registerUser } from './helpers';

const TOKEN = 'ExponentPushToken[abc]';

let app: Express;
let db: Awaited<ReturnType<typeof makeTestApp>>['db'];
let clock: ReturnType<typeof makeClock>;
let a: { token: string; user: { id: string } };
let b: { token: string; user: { id: string } };

beforeEach(async () => {
  clock = makeClock(NOW);
  ({ app, db } = await makeTestApp({ now: clock.now }));
  a = await registerUser(app);
  b = await registerUser(app);
});

const put = (body: unknown, t = a.token) => request(app).put('/api/me/push-devices').set(bearer(t)).send(body as object);
const del = (token: string, t = a.token) => request(app).delete(`/api/me/push-devices/${encodeURIComponent(token)}`).set(bearer(t));
const rows = () => db.many<{ token: string; user_id: string; created_at: string; last_seen_at: string }>('SELECT * FROM push_devices ORDER BY token');

describe('PUT /api/me/push-devices', () => {
  it('registra el token (204) y repetirlo solo actualiza last_seen_at', async () => {
    expect((await put({ token: TOKEN })).status).toBe(204);
    const [first] = await rows();
    expect(first).toMatchObject({ token: TOKEN, user_id: a.user.id, created_at: NOW.toISOString(), last_seen_at: NOW.toISOString() });
    clock.set(new Date(NOW.getTime() + 60_000));
    expect((await put({ token: TOKEN })).status).toBe(204);
    const all = await rows();
    expect(all).toHaveLength(1);
    expect(all[0].created_at).toBe(NOW.toISOString());
    expect(all[0].last_seen_at).toBe(new Date(NOW.getTime() + 60_000).toISOString());
  });

  it('el mismo token desde otra cuenta pasa a ella', async () => {
    await put({ token: TOKEN });
    expect((await put({ token: TOKEN }, b.token)).status).toBe(204);
    expect(await rows()).toMatchObject([{ token: TOKEN, user_id: b.user.id }]);
  });

  it('acepta ExponentPushToken[...] y ExpoPushToken[...]', async () => {
    expect((await put({ token: 'ExponentPushToken[abc]' })).status).toBe(204);
    expect((await put({ token: 'ExpoPushToken[abc]' })).status).toBe(204);
    expect(await rows()).toHaveLength(2);
  });

  it('rechaza un token que no es de Expo con 400 VALIDATION_ERROR', async () => {
    for (const body of [{ token: 'abc' }, { token: 'ExponentPushToken[]' }, {}, { token: 5 }]) {
      const res = await put(body);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    }
    expect(await rows()).toHaveLength(0);
  });

  it('rechaza un token de más de 255 caracteres con 400 (un token enorme haría rechazar todo el lote en Expo)', async () => {
    const res = await put({ token: `ExponentPushToken[${'a'.repeat(240)}]` });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect((await put({ token: `ExponentPushToken[${'a'.repeat(200)}]` })).status).toBe(204);
  });

  it('sin JWT, 401', async () => {
    expect((await request(app).put('/api/me/push-devices').send({ token: TOKEN })).status).toBe(401);
  });
});

describe('DELETE /api/me/push-devices/:token', () => {
  it('borra el mío (con el token codificado en la URL)', async () => {
    await put({ token: TOKEN });
    expect((await del(TOKEN)).status).toBe(204);
    expect(await rows()).toHaveLength(0);
  });

  it('el de otra persona: 204 sin borrarlo', async () => {
    await put({ token: TOKEN });
    expect((await del(TOKEN, b.token)).status).toBe(204);
    expect(await rows()).toHaveLength(1);
  });

  it('uno inexistente: 204', async () => {
    expect((await del('ExponentPushToken[nada]')).status).toBe(204);
  });

  it('sin JWT, 401', async () => {
    expect((await request(app).delete(`/api/me/push-devices/${encodeURIComponent(TOKEN)}`)).status).toBe(401);
  });
});
