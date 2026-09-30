import type { Group } from '@hueckoapp/shared';
import type { Express } from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';

import type { Db } from '../src/db/db';
import { bearer, createGroup, joinGroup, makeTestApp, registerUser } from './helpers';

let app: Express;
let db: Db;
beforeEach(async () => {
  ({ app, db } = await makeTestApp());
});

const get = (path: string, token: string) => request(app).get(`/api${path}`).set(bearer(token));

describe('POST /api/groups', () => {
  it('crea el grupo con código generado y el creador como OWNER', async () => {
    const { token, user } = await registerUser(app);
    const res = await request(app).post('/api/groups').set(bearer(token)).send({ name: '  Proyecto Integrador ' });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      id: expect.any(String),
      name: 'Proyecto Integrador',
      description: '',
      availabilityThreshold: 80,
      memberCount: 1,
      inviteCode: expect.stringMatching(/^[A-HJ-NP-Z2-9]{8}$/),
      members: [{ ...user, role: 'OWNER', isEssential: false }],
    });
  });

  it.each([
    [{ name: '   ' }, 'name', 'El nombre es requerido'],
    [{ name: 'G', availabilityThreshold: 101 }, 'availabilityThreshold', 'El umbral va de 0 a 100'],
    [{ name: 'G', availabilityThreshold: 50.5 }, 'availabilityThreshold', 'El umbral debe ser un entero'],
    [{ name: 'G', description: 'x'.repeat(201) }, 'description', 'Máximo 200 caracteres'],
  ])('valida %j → 400 en %s', async (body, field, message) => {
    const { token } = await registerUser(app);
    const res = await request(app).post('/api/groups').set(bearer(token)).send(body);
    expect(res.status).toBe(400);
    expect(res.body.error.details).toContainEqual(expect.objectContaining({ path: [field], message }));
  });

  it('sin token → 401', async () => {
    expect((await request(app).post('/api/groups').send({ name: 'G' })).status).toBe(401);
  });
});

describe('GET /api/groups', () => {
  it('lista solo mis grupos con su número de miembros', async () => {
    const yo = await registerUser(app);
    const ana = await registerUser(app);
    const mio = await createGroup(app, yo.token, { name: 'Mío' });
    await createGroup(app, ana.token, { name: 'De Ana' });
    await joinGroup(app, ana.token, mio.inviteCode);

    const res = await get('/groups', yo.token);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([
      { id: mio.id, name: 'Mío', description: '', memberCount: 2, availabilityThreshold: 80 },
    ]);
  });
});

describe('POST /api/groups/join', () => {
  it('normaliza el código (trim + mayúsculas) y entra como MEMBER', async () => {
    const yo = await registerUser(app);
    const ana = await registerUser(app);
    const group = await createGroup(app, yo.token);
    const res = await request(app)
      .post('/api/groups/join')
      .set(bearer(ana.token))
      .send({ inviteCode: `  ${group.inviteCode.toLowerCase()} ` });
    expect(res.status).toBe(200);
    expect(res.body.memberCount).toBe(2);
    expect(res.body.members[1]).toEqual({ ...ana.user, role: 'MEMBER', isEssential: false });
  });

  it('dos veces → 409 ALREADY_MEMBER', async () => {
    const yo = await registerUser(app);
    const group = await createGroup(app, yo.token);
    const res = await request(app).post('/api/groups/join').set(bearer(yo.token)).send({ inviteCode: group.inviteCode });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatchObject({ code: 'ALREADY_MEMBER', message: 'Ya perteneces a este grupo.' });
  });

  it('código inexistente → 404 INVALID_INVITE_CODE', async () => {
    const yo = await registerUser(app);
    const res = await request(app).post('/api/groups/join').set(bearer(yo.token)).send({ inviteCode: 'NOEXISTE' });
    expect(res.status).toBe(404);
    expect(res.body.error).toMatchObject({ code: 'INVALID_INVITE_CODE', message: 'Código de invitación inválido.' });
  });

  it('código vacío → 400', async () => {
    const yo = await registerUser(app);
    const res = await request(app).post('/api/groups/join').set(bearer(yo.token)).send({ inviteCode: '  ' });
    expect(res.status).toBe(400);
    expect(res.body.error.details).toContainEqual(expect.objectContaining({ message: 'El código es requerido' }));
  });
});

describe('GET /api/groups/:id', () => {
  it('un miembro ve el grupo con todos sus miembros', async () => {
    const yo = await registerUser(app);
    const group = await createGroup(app, yo.token);
    const res = await get(`/groups/${group.id}`, yo.token);
    expect(res.status).toBe(200);
    expect(res.body).toEqual(group);
  });

  it('quien no es miembro → 403 NOT_A_MEMBER; un id inexistente → 404 GROUP_NOT_FOUND', async () => {
    const yo = await registerUser(app);
    const otra = await registerUser(app);
    const group = await createGroup(app, yo.token);
    const forbidden = await get(`/groups/${group.id}`, otra.token);
    expect(forbidden.status).toBe(403);
    expect(forbidden.body.error).toMatchObject({ code: 'NOT_A_MEMBER', message: 'No perteneces a este grupo.' });
    const missing = await get('/groups/no-existe', yo.token);
    expect(missing.status).toBe(404);
    expect(missing.body.error).toMatchObject({ code: 'GROUP_NOT_FOUND', message: 'Grupo no encontrado.' });
  });
});

describe('PATCH /api/groups/:id', () => {
  it('el OWNER cambia nombre, descripción y umbral', async () => {
    const yo = await registerUser(app);
    const group = await createGroup(app, yo.token);
    const res = await request(app)
      .patch(`/api/groups/${group.id}`)
      .set(bearer(yo.token))
      .send({ name: 'Nuevo', description: 'Grupo del curso', availabilityThreshold: 60 });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ name: 'Nuevo', description: 'Grupo del curso', availabilityThreshold: 60 });
  });

  it('un MEMBER → 403 NOT_OWNER', async () => {
    const yo = await registerUser(app);
    const ana = await registerUser(app);
    const group = await createGroup(app, yo.token);
    await joinGroup(app, ana.token, group.inviteCode);
    const res = await request(app).patch(`/api/groups/${group.id}`).set(bearer(ana.token)).send({ name: 'X' });
    expect(res.status).toBe(403);
    expect(res.body.error).toMatchObject({ code: 'NOT_OWNER', message: 'Solo el administrador del grupo puede hacer esto.' });
  });

  it.each([
    [{}, 'Envía al menos un campo'],
    [{ availabilityThreshold: -1 }, 'El umbral va de 0 a 100'],
    [{ name: '' }, 'El nombre es requerido'],
  ])('valida %j → 400', async (body, message) => {
    const yo = await registerUser(app);
    const group = await createGroup(app, yo.token);
    const res = await request(app).patch(`/api/groups/${group.id}`).set(bearer(yo.token)).send(body);
    expect(res.status).toBe(400);
    expect(res.body.error.details).toContainEqual(expect.objectContaining({ message }));
  });
});

describe('PATCH /api/groups/:id/members/:userId', () => {
  it('el OWNER marca a alguien como imprescindible', async () => {
    const yo = await registerUser(app);
    const ana = await registerUser(app);
    const group = await createGroup(app, yo.token);
    await joinGroup(app, ana.token, group.inviteCode);
    const res = await request(app)
      .patch(`/api/groups/${group.id}/members/${ana.user.id}`)
      .set(bearer(yo.token))
      .send({ isEssential: true });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ...ana.user, role: 'MEMBER', isEssential: true });
    const after = await get(`/groups/${group.id}`, ana.token);
    expect(after.body.members[1].isEssential).toBe(true);
  });

  it('un MEMBER → 403; alguien de fuera → 404 MEMBER_NOT_FOUND; cuerpo inválido → 400', async () => {
    const yo = await registerUser(app);
    const ana = await registerUser(app);
    const fuera = await registerUser(app);
    const group = await createGroup(app, yo.token);
    await joinGroup(app, ana.token, group.inviteCode);
    const path = (userId: string) => `/api/groups/${group.id}/members/${userId}`;

    expect((await request(app).patch(path(yo.user.id)).set(bearer(ana.token)).send({ isEssential: true })).status).toBe(403);

    const missing = await request(app).patch(path(fuera.user.id)).set(bearer(yo.token)).send({ isEssential: true });
    expect(missing.status).toBe(404);
    expect(missing.body.error).toMatchObject({ code: 'MEMBER_NOT_FOUND', message: 'Esa persona no pertenece al grupo.' });

    const invalid = await request(app).patch(path(ana.user.id)).set(bearer(yo.token)).send({ isEssential: 'sí' });
    expect(invalid.status).toBe(400);
  });
});

describe('DELETE /api/groups/:id/members/me', () => {
  it('un MEMBER sale y el grupo sigue con el OWNER', async () => {
    const yo = await registerUser(app);
    const ana = await registerUser(app);
    const group = await createGroup(app, yo.token);
    await joinGroup(app, ana.token, group.inviteCode);
    const res = await request(app).delete(`/api/groups/${group.id}/members/me`).set(bearer(ana.token));
    expect(res.status).toBe(204);
    expect((await get('/groups', ana.token)).body).toEqual([]);
    expect((await get(`/groups/${group.id}`, yo.token)).body.memberCount).toBe(1);
  });

  it('si sale el último OWNER, pasa a OWNER quien lleva más tiempo en el grupo', async () => {
    const yo = await registerUser(app);
    const b = await registerUser(app);
    const c = await registerUser(app);
    const group = await createGroup(app, yo.token);
    await joinGroup(app, b.token, group.inviteCode);
    await joinGroup(app, c.token, group.inviteCode);
    // C figura como más antiguo que B aunque se unió después: manda joined_at.
    await db.query('UPDATE group_members SET joined_at = $1 WHERE user_id = $2', ['2000-01-01T00:00:00.000Z', c.user.id]);

    expect((await request(app).delete(`/api/groups/${group.id}/members/me`).set(bearer(yo.token))).status).toBe(204);

    const after: Group = (await get(`/groups/${group.id}`, b.token)).body;
    expect(after.members).toEqual([
      expect.objectContaining({ id: c.user.id, role: 'OWNER' }),
      expect.objectContaining({ id: b.user.id, role: 'MEMBER' }),
    ]);
  });

  it('si sale la última persona, el grupo se borra', async () => {
    const yo = await registerUser(app);
    const group = await createGroup(app, yo.token);
    expect((await request(app).delete(`/api/groups/${group.id}/members/me`).set(bearer(yo.token))).status).toBe(204);
    expect(await db.one('SELECT COUNT(*) AS n FROM groups')).toEqual({ n: 0 });
    expect((await get(`/groups/${group.id}`, yo.token)).status).toBe(404);
  });

  it('quien no es miembro → 403', async () => {
    const yo = await registerUser(app);
    const otra = await registerUser(app);
    const group = await createGroup(app, yo.token);
    expect((await request(app).delete(`/api/groups/${group.id}/members/me`).set(bearer(otra.token))).status).toBe(403);
  });
});
