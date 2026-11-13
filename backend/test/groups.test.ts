import type { Group } from '@hueckoapp/shared';
import type { Express } from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';

import type { Db } from '../src/db/db';
import { groupsRepository } from '../src/groups/groups.repository';
import { bearer, createGroup, interleave, interleaveWith, joinGroup, makeTestApp, registerUser } from './helpers';

let app: Express;
let db: Db;
beforeEach(async () => {
  ({ app, db } = await makeTestApp());
});

const get = (path: string, token: string) => request(app).get(`/api${path}`).set(bearer(token));

describe('POST /api/groups', () => {
  it('crea el grupo con código generado y el creador como ORGANIZER', async () => {
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
      members: [{ ...user, role: 'ORGANIZER', isEssential: false }],
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

  it('dos peticiones a la vez: una entra y la otra → 409 ALREADY_MEMBER, nunca un 500 (D12)', async () => {
    const yo = await registerUser(app);
    const ana = await registerUser(app);
    const group = await createGroup(app, yo.token);
    const join = () => request(app).post('/api/groups/join').set(bearer(ana.token)).send({ inviteCode: group.inviteCode });
    const statuses = (await Promise.all([join(), join()])).map((r) => r.status).sort();
    expect(statuses).toEqual([200, 409]);
    expect((await request(app).get(`/api/groups/${group.id}`).set(bearer(yo.token))).body.memberCount).toBe(2);
  });

  it('código inexistente → 404 INVALID_INVITE_CODE', async () => {
    const yo = await registerUser(app);
    const res = await request(app).post('/api/groups/join').set(bearer(yo.token)).send({ inviteCode: 'NOEXISTE' });
    expect(res.status).toBe(404);
    expect(res.body.error).toMatchObject({ code: 'INVALID_INVITE_CODE', message: 'Código de invitación inválido.' });
  });

  it('el grupo desaparece entre leer el código y entrar (su último miembro se fue): 404 INVALID_INVITE_CODE, no un 500', async () => {
    const yo = await registerUser(app);
    const ana = await registerUser(app);
    const group = await createGroup(app, yo.token);
    // En Neon, el INSERT espera al leave (FOR UPDATE) y después falla por la clave foránea (23503).
    interleave(db, /^INSERT INTO group_members/, 'DELETE FROM groups WHERE id = $1', [group.id]);
    const res = await request(app).post('/api/groups/join').set(bearer(ana.token)).send({ inviteCode: group.inviteCode });
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
  it('el ORGANIZER cambia nombre, descripción y umbral', async () => {
    const yo = await registerUser(app);
    const group = await createGroup(app, yo.token);
    const res = await request(app)
      .patch(`/api/groups/${group.id}`)
      .set(bearer(yo.token))
      .send({ name: 'Nuevo', description: 'Grupo del curso', availabilityThreshold: 60 });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ name: 'Nuevo', description: 'Grupo del curso', availabilityThreshold: 60 });
  });

  it('un MEMBER → 403 NOT_ORGANIZER', async () => {
    const yo = await registerUser(app);
    const ana = await registerUser(app);
    const group = await createGroup(app, yo.token);
    await joinGroup(app, ana.token, group.inviteCode);
    const res = await request(app).patch(`/api/groups/${group.id}`).set(bearer(ana.token)).send({ name: 'X' });
    expect(res.status).toBe(403);
    expect(res.body.error).toMatchObject({ code: 'NOT_ORGANIZER', message: 'Solo un organizador del grupo puede hacer esto.' });
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
  it('el ORGANIZER marca a alguien como imprescindible', async () => {
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

  it('un MEMBER → 403 NOT_ORGANIZER; quien no es miembro → 403 NOT_A_MEMBER; alguien de fuera → 404 MEMBER_NOT_FOUND', async () => {
    const yo = await registerUser(app);
    const ana = await registerUser(app);
    const fuera = await registerUser(app);
    const group = await createGroup(app, yo.token);
    await joinGroup(app, ana.token, group.inviteCode);
    const path = (userId: string) => `/api/groups/${group.id}/members/${userId}`;

    const notOrganizer = await request(app).patch(path(yo.user.id)).set(bearer(ana.token)).send({ isEssential: true });
    expect([notOrganizer.status, notOrganizer.body.error?.code]).toEqual([403, 'NOT_ORGANIZER']);
    const selfPromote = await request(app).patch(path(ana.user.id)).set(bearer(ana.token)).send({ role: 'ORGANIZER' });
    expect([selfPromote.status, selfPromote.body.error?.code]).toEqual([403, 'NOT_ORGANIZER']);
    const notMember = await request(app).patch(path(ana.user.id)).set(bearer(fuera.token)).send({ role: 'ORGANIZER' });
    expect([notMember.status, notMember.body.error?.code]).toEqual([403, 'NOT_A_MEMBER']);

    const missing = await request(app).patch(path(fuera.user.id)).set(bearer(yo.token)).send({ role: 'ORGANIZER' });
    expect(missing.status).toBe(404);
    expect(missing.body.error).toMatchObject({ code: 'MEMBER_NOT_FOUND', message: 'Esa persona no pertenece al grupo.' });
    const after: Group = (await get(`/groups/${group.id}`, yo.token)).body;
    expect(after.members.map((m) => m.role)).toEqual(['ORGANIZER', 'MEMBER']);
  });

  it.each([
    [{}, 'Envía isEssential o role'],
    [{ isEssential: 'sí' }, 'isEssential debe ser true o false'],
    [{ role: 'OWNER' }, 'role debe ser ORGANIZER o MEMBER'],
  ])('valida %j → 400', async (body, message) => {
    const yo = await registerUser(app);
    const ana = await registerUser(app);
    const group = await createGroup(app, yo.token);
    await joinGroup(app, ana.token, group.inviteCode);
    const res = await request(app).patch(`/api/groups/${group.id}/members/${ana.user.id}`).set(bearer(yo.token)).send(body);
    expect([res.status, res.body.error?.code]).toEqual([400, 'VALIDATION_ERROR']);
    expect(res.body.error.details).toContainEqual(expect.objectContaining({ message }));
  });

  describe('organizadores', () => {
    let a: Awaited<ReturnType<typeof registerUser>>;
    let b: Awaited<ReturnType<typeof registerUser>>;
    let c: Awaited<ReturnType<typeof registerUser>>;
    let group: Group;
    beforeEach(async () => {
      a = await registerUser(app, { name: 'A' });
      b = await registerUser(app, { name: 'B' });
      c = await registerUser(app, { name: 'C' });
      group = await createGroup(app, a.token);
      await joinGroup(app, b.token, group.inviteCode);
      await joinGroup(app, c.token, group.inviteCode);
    });

    const patchMember = (token: string, userId: string, body: object) =>
      request(app).patch(`/api/groups/${group.id}/members/${userId}`).set(bearer(token)).send(body);
    const roles = async () => ((await get(`/groups/${group.id}`, c.token)).body as Group).members.map((m) => [m.name, m.role]);
    const makeBOrganizer = async () => expect((await patchMember(a.token, b.user.id, { role: 'ORGANIZER' })).status).toBe(200);
    // Lo primero que hace updateMember (y leave) en su transacción; si no bloqueara, lo primero que escribe.
    const LOCK_OR_UPDATE = /^(SELECT id FROM groups WHERE id = \$1 FOR UPDATE|UPDATE group_members SET)/;

    it('un organizador nombra organizador a un miembro, que ya puede editar el grupo', async () => {
      const res = await patchMember(a.token, c.user.id, { role: 'ORGANIZER' });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ...c.user, role: 'ORGANIZER', isEssential: false });
      const edit = await request(app).patch(`/api/groups/${group.id}`).set(bearer(c.token)).send({ name: 'Editado por C' });
      expect([edit.status, edit.body.name]).toEqual([200, 'Editado por C']);
    });

    it('el único organizador no puede quitarse el rol: 409 LAST_ORGANIZER y sigue siéndolo', async () => {
      const res = await patchMember(a.token, a.user.id, { role: 'MEMBER' });
      expect(res.status).toBe(409);
      expect(res.body.error).toMatchObject({ code: 'LAST_ORGANIZER', message: 'El grupo necesita al menos un organizador.' });
      expect(await roles()).toEqual([['A', 'ORGANIZER'], ['B', 'MEMBER'], ['C', 'MEMBER']]);
    });

    it('con el 409 no se escribe nada: tampoco el isEssential que venía en el mismo cuerpo', async () => {
      const res = await patchMember(a.token, a.user.id, { isEssential: true, role: 'MEMBER' });
      expect([res.status, res.body.error?.code]).toEqual([409, 'LAST_ORGANIZER']);
      const after: Group = (await get(`/groups/${group.id}`, a.token)).body;
      expect(after.members[0]).toEqual({ ...a.user, role: 'ORGANIZER', isEssential: false });
    });

    it('con dos organizadores, uno se quita el rol a sí mismo', async () => {
      await makeBOrganizer();
      const res = await patchMember(a.token, a.user.id, { role: 'MEMBER' });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ...a.user, role: 'MEMBER', isEssential: false });
      expect(await roles()).toEqual([['A', 'MEMBER'], ['B', 'ORGANIZER'], ['C', 'MEMBER']]);
    });

    it('un organizador le quita el rol al creador del grupo, que ya no puede editarlo', async () => {
      await makeBOrganizer();
      expect((await patchMember(b.token, a.user.id, { role: 'MEMBER' })).status).toBe(200);
      expect(await roles()).toEqual([['A', 'MEMBER'], ['B', 'ORGANIZER'], ['C', 'MEMBER']]);
      const edit = await request(app).patch(`/api/groups/${group.id}`).set(bearer(a.token)).send({ name: 'X' });
      expect([edit.status, edit.body.error?.code]).toEqual([403, 'NOT_ORGANIZER']);
    });

    it('isEssential y role juntos se aplican los dos; solo isEssential no toca el rol', async () => {
      const res = await patchMember(a.token, c.user.id, { isEssential: true, role: 'ORGANIZER' });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ...c.user, role: 'ORGANIZER', isEssential: true });
      const essentialOnly = await patchMember(a.token, c.user.id, { isEssential: false });
      expect(essentialOnly.body).toEqual({ ...c.user, role: 'ORGANIZER', isEssential: false });
    });

    it('Review Focus 1: dos organizadores se quitan el rol a la vez → uno recibe 409 y queda exactamente uno', async () => {
      await makeBOrganizer();
      let other: string | undefined;
      // B se quita el rol justo antes de que A bloquee el grupo (en Neon, B terminaría antes o esperaría al bloqueo).
      // Si A contara fuera del bloqueo o antes de él, vería a B como organizador y el grupo se quedaría sin ninguno.
      interleaveWith(db, LOCK_OR_UPDATE, async () => {
        other = await groupsRepository(db).updateMember(group.id, b.user.id, { role: 'MEMBER' }, b.user.id);
      });
      const res = await patchMember(a.token, a.user.id, { role: 'MEMBER' });
      expect(other).toBe('OK');
      expect([res.status, res.body.error?.code]).toEqual([409, 'LAST_ORGANIZER']);
      expect(await roles()).toEqual([['A', 'ORGANIZER'], ['B', 'MEMBER'], ['C', 'MEMBER']]);
    });

    it('A deja de ser organizador justo antes de tomar el bloqueo → su «quitar a B» recibe 403 y B sigue siéndolo', async () => {
      await makeBOrganizer();
      expect((await patchMember(a.token, c.user.id, { role: 'ORGANIZER' })).status).toBe(200);
      // B le quita el rol a A justo antes de que la petición de A bloquee el grupo: ya no tiene permiso.
      interleaveWith(db, LOCK_OR_UPDATE, async () => {
        await groupsRepository(db).updateMember(group.id, a.user.id, { role: 'MEMBER' }, b.user.id);
      });
      const res = await patchMember(a.token, b.user.id, { role: 'MEMBER' });
      expect([res.status, res.body.error?.code]).toEqual([403, 'NOT_ORGANIZER']);
      expect(await roles()).toEqual([['A', 'MEMBER'], ['B', 'ORGANIZER'], ['C', 'ORGANIZER']]);
    });

    it('Review Focus 2: un organizador se quita el rol mientras el otro sale → 409 y el grupo sigue con un organizador', async () => {
      await makeBOrganizer();
      let left = false;
      // A sale justo antes de que B bloquee el grupo: B ya es el último organizador.
      interleaveWith(db, LOCK_OR_UPDATE, async () => {
        await groupsRepository(db).leave(group.id, a.user.id);
        left = true;
      });
      const res = await patchMember(b.token, b.user.id, { role: 'MEMBER' });
      expect(left).toBe(true);
      expect([res.status, res.body.error?.code]).toEqual([409, 'LAST_ORGANIZER']);
      expect(await roles()).toEqual([['B', 'ORGANIZER'], ['C', 'MEMBER']]);
    });

    it('Review Focus 2, al revés: un organizador sale mientras el otro se quita el rol → hereda quien lleva más tiempo', async () => {
      await makeBOrganizer();
      let other: string | undefined;
      // B se quita el rol justo antes de que la salida de A bloquee el grupo (o, sin bloqueo, antes de que A se borre).
      interleaveWith(db, /^(SELECT id FROM groups WHERE id = \$1 FOR UPDATE|DELETE FROM group_members)/, async () => {
        other = await groupsRepository(db).updateMember(group.id, b.user.id, { role: 'MEMBER' }, b.user.id);
      });
      expect((await request(app).delete(`/api/groups/${group.id}/members/me`).set(bearer(a.token))).status).toBe(204);
      expect(other).toBe('OK');
      expect(await roles()).toEqual([['B', 'ORGANIZER'], ['C', 'MEMBER']]);
    });

    it('si sale uno de dos organizadores, el otro sigue siendo el único y nadie más hereda', async () => {
      await makeBOrganizer();
      expect((await request(app).delete(`/api/groups/${group.id}/members/me`).set(bearer(a.token))).status).toBe(204);
      expect(await roles()).toEqual([['B', 'ORGANIZER'], ['C', 'MEMBER']]);
    });
  });
});

describe('DELETE /api/groups/:id/members/me', () => {
  it('un MEMBER sale y el grupo sigue con el ORGANIZER', async () => {
    const yo = await registerUser(app);
    const ana = await registerUser(app);
    const group = await createGroup(app, yo.token);
    await joinGroup(app, ana.token, group.inviteCode);
    const res = await request(app).delete(`/api/groups/${group.id}/members/me`).set(bearer(ana.token));
    expect(res.status).toBe(204);
    expect((await get('/groups', ana.token)).body).toEqual([]);
    expect((await get(`/groups/${group.id}`, yo.token)).body.memberCount).toBe(1);
  });

  it('si sale el último ORGANIZER, pasa a ORGANIZER quien lleva más tiempo en el grupo', async () => {
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
      expect.objectContaining({ id: c.user.id, role: 'ORGANIZER' }),
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
