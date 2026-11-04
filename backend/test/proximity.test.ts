import type { Express } from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';

import type { Db } from '../src/db/db';
import { bearer, createGroup, joinGroup, makeClock, makeTestApp, NOW, registerUser } from './helpers';

const clock = makeClock(NOW);
const at = (ms: number) => new Date(NOW.getTime() + ms);
let app: Express;
let db: Db;
beforeEach(async () => {
  clock.set(NOW);
  ({ app, db } = await makeTestApp({ now: clock.now }));
});

const post = (path: string, token: string, body: object = {}) => request(app).post(`/api/proximity${path}`).set(bearer(token)).send(body);
const get = (path: string, token: string) => request(app).get(`/api/proximity${path}`).set(bearer(token));
const groupsOf = async (token: string) => (await request(app).get('/api/groups').set(bearer(token))).body as { id: string }[];

// Luis invita a su grupo en NOW y Ana se une `joinAfterMs` después.
async function pair(joinAfterMs = 1000) {
  const luis = await registerUser(app, { name: 'Luis' });
  const ana = await registerUser(app, { name: 'Ana' });
  const group = await createGroup(app, luis.token, { name: 'Equipo' });
  const invite = await post('/invite', luis.token, { groupId: group.id });
  clock.set(at(joinAfterMs));
  const join = await post('/join', ana.token);
  return { luis, ana, group, invite: invite.body, join: join.body };
}

describe('proximidad', () => {
  it('flujo completo: invitar, unirse, aceptar', async () => {
    const { luis, ana, group, invite, join } = await pair();
    expect(invite).toMatchObject({ role: 'INVITE', status: 'WAITING', group: { id: group.id, name: 'Equipo' }, peer: null });
    expect((await get(`/${invite.id}`, luis.token)).body).toMatchObject({ status: 'MATCHED', peer: { name: 'Ana' } });
    expect(join).toMatchObject({ role: 'JOIN', status: 'MATCHED', group: { id: group.id, name: 'Equipo' }, peer: { name: 'Luis' } });
    const seen = await get(`/${join.id}`, ana.token);
    expect(seen.body).toMatchObject({ status: 'MATCHED', group: { name: 'Equipo' }, peer: { name: 'Luis' } });
    expect(seen.body.expiresAt).toBe(at(1000 + 30_000).toISOString());
    expect(seen.body.acceptableFrom).toBe(at(1000 + 3000).toISOString());

    clock.set(at(1000 + 4000));
    const res = await post(`/${invite.id}/accept`, luis.token);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ACCEPTED');
    expect((await get(`/${join.id}`, ana.token)).body.status).toBe('ACCEPTED');
    expect((await groupsOf(ana.token)).map((g) => g.id)).toContain(group.id);
  });

  it('WAITING: sin pareja, expiresAt a 5 s y sin peer ni grupo ajeno', async () => {
    const ana = await registerUser(app);
    const res = await post('/join', ana.token);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ status: 'WAITING', group: null, peer: null, acceptableFrom: null, expiresAt: at(5000).toISOString() });
  });

  it('aceptar antes de 3 s → 409 PROXIMITY_NOT_PENDING', async () => {
    const { luis, invite } = await pair();
    clock.set(at(1000 + 2999));
    const res = await post(`/${invite.id}/accept`, luis.token);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('PROXIMITY_NOT_PENDING');
  });

  it('aceptar justo a +3000 ms → 409 y a +3001 ms → 200', async () => {
    const { luis, invite } = await pair();
    clock.set(at(1000 + 3000));
    expect((await post(`/${invite.id}/accept`, luis.token)).status).toBe(409);
    clock.set(at(1000 + 3001));
    expect((await post(`/${invite.id}/accept`, luis.token)).status).toBe(200);
  });

  it('rechazar: las dos mitades quedan REJECTED y Ana no es miembro', async () => {
    const { luis, ana, group, invite, join } = await pair();
    clock.set(at(5000));
    const res = await post(`/${invite.id}/reject`, luis.token);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('REJECTED');
    expect((await get(`/${join.id}`, ana.token)).body.status).toBe('REJECTED');
    expect((await groupsOf(ana.token)).map((g) => g.id)).not.toContain(group.id);
  });

  it('rechazar antes de 3 s → 409', async () => {
    const { luis, invite } = await pair();
    expect((await post(`/${invite.id}/reject`, luis.token)).status).toBe(409);
  });

  it('quien se une no puede aceptar → 409', async () => {
    const { ana, join } = await pair();
    clock.set(at(5000));
    const res = await post(`/${join.id}/accept`, ana.token);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('PROXIMITY_NOT_PENDING');
  });

  it('aceptar vencido (a +31 s de matched_at) → 409 y GET → EXPIRED', async () => {
    const { luis, invite } = await pair();
    clock.set(at(1000 + 31_000));
    expect((await post(`/${invite.id}/accept`, luis.token)).status).toBe(409);
    const res = await get(`/${invite.id}`, luis.token);
    expect(res.body).toMatchObject({ status: 'EXPIRED', peer: null, expiresAt: null, acceptableFrom: null });
  });

  it('invitar a un grupo ajeno → 403 NOT_A_MEMBER; inexistente → 404 GROUP_NOT_FOUND', async () => {
    const luis = await registerUser(app);
    const otro = await registerUser(app);
    const group = await createGroup(app, otro.token);
    const ajeno = await post('/invite', luis.token, { groupId: group.id });
    expect(ajeno.status).toBe(403);
    expect(ajeno.body.error.code).toBe('NOT_A_MEMBER');
    const nada = await post('/invite', luis.token, { groupId: 'no-existe' });
    expect(nada.status).toBe(404);
    expect(nada.body.error.code).toBe('GROUP_NOT_FOUND');
    expect((await post('/invite', luis.token, {})).status).toBe(400);
  });

  it('GET del intento de otro → 404 PROXIMITY_NOT_FOUND', async () => {
    const { invite } = await pair();
    const otro = await registerUser(app);
    const res = await get(`/${invite.id}`, otro.token);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('PROXIMITY_NOT_FOUND');
  });

  it('DELETE cancela a la pareja', async () => {
    const { luis, ana, invite, join } = await pair();
    expect((await request(app).delete(`/api/proximity/${join.id}`).set(bearer(ana.token))).status).toBe(204);
    expect((await get(`/${invite.id}`, luis.token)).body.status).toBe('CANCELLED');
    expect((await get(`/${join.id}`, ana.token)).body).toMatchObject({ status: 'CANCELLED', peer: null });
    // De otra persona: 404. Repetido: 204.
    expect((await request(app).delete(`/api/proximity/${join.id}`).set(bearer(luis.token))).status).toBe(404);
    expect((await request(app).delete(`/api/proximity/${join.id}`).set(bearer(ana.token))).status).toBe(204);
  });

  it('DELETE de un intento ya aceptado no lo cambia', async () => {
    const { luis, invite } = await pair();
    clock.set(at(5000));
    await post(`/${invite.id}/accept`, luis.token);
    expect((await request(app).delete(`/api/proximity/${invite.id}`).set(bearer(luis.token))).status).toBe(204);
    expect((await get(`/${invite.id}`, luis.token)).body.status).toBe('ACCEPTED');
  });

  it('aceptar cuando Ana ya se unió con el código → 200 ACCEPTED', async () => {
    const { luis, ana, group, invite } = await pair();
    await joinGroup(app, ana.token, group.inviteCode);
    clock.set(at(5000));
    const res = await post(`/${invite.id}/accept`, luis.token);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ACCEPTED');
  });

  it('si el grupo se borró antes de aceptar → 404 PROXIMITY_NOT_FOUND (el borrado en cascada se llevó el aviso de quien invita)', async () => {
    const { luis, ana, group, invite, join } = await pair();
    await db.query('DELETE FROM groups WHERE id = $1', [group.id]);
    clock.set(at(5000));
    const res = await post(`/${invite.id}/accept`, luis.token);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('PROXIMITY_NOT_FOUND');
    expect((await get(`/${join.id}`, ana.token)).body.status).toBe('MATCHED');
  });

  it('AMBIGUOUS no filtra al peer ni el grupo', async () => {
    const luis = await registerUser(app, { name: 'Luis' });
    const ana = await registerUser(app, { name: 'Ana' });
    const eva = await registerUser(app, { name: 'Eva' });
    const group = await createGroup(app, luis.token);
    await post('/invite', luis.token, { groupId: group.id });
    clock.set(at(500));
    const joinAna = (await post('/join', ana.token)).body;
    clock.set(at(1000));
    await post('/join', eva.token);
    const res = await get(`/${joinAna.id}`, ana.token);
    expect(res.body).toMatchObject({ status: 'AMBIGUOUS', peer: null, group: null, expiresAt: null, acceptableFrom: null });
    const luisRes = await db.one<{ id: string }>("SELECT id FROM proximity_requests WHERE user_id = $1", [luis.user.id]);
    expect((await get(`/${luisRes!.id}`, luis.token)).body).toMatchObject({ status: 'AMBIGUOUS', peer: null });
  });

  it('sin token → 401', async () => {
    expect((await request(app).post('/api/proximity/join').send({})).status).toBe(401);
    expect((await request(app).get('/api/proximity/x')).status).toBe(401);
  });
});
