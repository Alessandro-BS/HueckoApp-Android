import type { Dashboard, Group, Proposal, User } from '@hueckoapp/shared';
import type { Express } from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';

import type { Db } from '../src/db/db';
import { canManageProposal } from '../src/proposals/permissions';
import { bearer, createGroup, createProposal, DEADLINE, joinGroup, makeTestApp, NOW, registerUser, voteFor, win, windowOf } from './helpers';

describe('canManageProposal', () => {
  const owner = { id: 'o', role: 'ORGANIZER' as const };
  const otro = { id: 'p', role: 'ORGANIZER' as const };
  const ana = { id: 'a', role: 'MEMBER' as const };
  const carlos = { id: 'c', role: 'MEMBER' as const };
  const members = [owner, otro, ana, carlos];

  it('quien la creó la gestiona, mientras sea miembro', () => {
    expect(canManageProposal({ viewerId: 'a', creatorId: 'a', members })).toBe(true);
  });

  it('cualquier organizador la gestiona, aunque no la creara', () => {
    expect(canManageProposal({ viewerId: 'o', creatorId: 'a', members })).toBe(true);
    expect(canManageProposal({ viewerId: 'p', creatorId: 'a', members })).toBe(true);
  });

  it('un miembro común que no la creó, no', () => {
    expect(canManageProposal({ viewerId: 'c', creatorId: 'a', members })).toBe(false);
  });

  it('quien la creó pero ya no es miembro, no la gestiona', () => {
    expect(canManageProposal({ viewerId: 'x', creatorId: 'x', members })).toBe(false);
  });

  it('quien no es miembro no gestiona nada', () => {
    expect(canManageProposal({ viewerId: 'z', creatorId: 'a', members })).toBe(false);
    expect(canManageProposal({ viewerId: 'z', creatorId: 'a', members: [] })).toBe(false);
  });
});

describe('canManage en la API', () => {
  let app: Express;
  let db: Db;
  let yo: { token: string; user: User };
  let ana: { token: string; user: User };
  let carlos: { token: string; user: User };
  let group: Group;

  beforeEach(async () => {
    ({ app, db } = await makeTestApp({ now: () => NOW }));
    yo = await registerUser(app, { name: 'Usuario de Prueba' });
    ana = await registerUser(app, { name: 'Ana' });
    carlos = await registerUser(app, { name: 'Carlos' });
    group = await createGroup(app, yo.token); // yo = ORGANIZER
    await joinGroup(app, ana.token, group.inviteCode);
    await joinGroup(app, carlos.token, group.inviteCode);
  });

  const leave = (token: string) => request(app).delete(`/api/groups/${group.id}/members/me`).set(bearer(token));
  const canManage = async (proposalId: string, token: string): Promise<boolean> =>
    (await request(app).get(`/api/proposals/${proposalId}`).set(bearer(token))).body.canManage;
  const planBy = (token: string) =>
    createProposal(app, token, group.id, { votingDeadline: DEADLINE, windows: [win(2, '16:00', '18:00'), win(4, '16:00', '18:00')] });
  const post = (path: string, token: string, body: object = {}) =>
    request(app).post(`/api/proposals/${path}`).set(bearer(token)).send(body);

  it('quien la creó y cualquier organizador la gestionan; un miembro común no (403 NOT_MANAGER)', async () => {
    const p = await planBy(ana.token);
    expect(p.canManage).toBe(true);
    expect([await canManage(p.id, yo.token), await canManage(p.id, carlos.token)]).toEqual([true, false]);
    const res = await post(`${p.id}/cancel`, carlos.token);
    expect([res.status, res.body.error.code, res.body.error.message]).toEqual([403, 'NOT_MANAGER', 'Solo quien organiza el plan puede hacer esto.']);
  });

  describe('con un segundo organizador (B) que no creó el plan', () => {
    // A = yo (crea el grupo y el plan), B = ana (organizadora nombrada directamente en la base), C = carlos (miembro).
    beforeEach(async () => {
      await db.query("UPDATE group_members SET role = 'ORGANIZER' WHERE group_id = $1 AND user_id = $2", [group.id, ana.user.id]);
    });

    it('B confirma un plan de A y C recibe 403 NOT_MANAGER', async () => {
      const p = await planBy(yo.token);
      await voteFor(app, p.id, windowOf(p, 2).id, carlos.token);
      const denegado = await post(`${p.id}/confirm`, carlos.token);
      expect([denegado.status, denegado.body.error.code]).toEqual([403, 'NOT_MANAGER']);
      const res = await post(`${p.id}/confirm`, ana.token);
      expect([res.status, res.body.state]).toEqual([200, 'CONFIRMADO']);
    });

    it('B cancela un plan de A', async () => {
      const p = await planBy(yo.token);
      const res = await post(`${p.id}/cancel`, ana.token);
      expect([res.status, res.body.state]).toEqual([200, 'CANCELADO']);
    });

    it('B replantea un plan de A y C recibe 403 NOT_MANAGER', async () => {
      const p = await planBy(yo.token);
      const body = { votingDeadline: DEADLINE, windows: [win(3, '16:00', '18:00'), win(5, '16:00', '18:00')] };
      const denegado = await post(`${p.id}/replan`, carlos.token, body);
      expect([denegado.status, denegado.body.error.code]).toEqual([403, 'NOT_MANAGER']);
      const res = await post(`${p.id}/replan`, ana.token, body);
      expect([res.status, res.body.state]).toEqual([200, 'PROPUESTO']);
    });

    it('GET /proposals/:id devuelve canManage true a B y false a C', async () => {
      const p = await planBy(yo.token);
      expect([await canManage(p.id, ana.token), await canManage(p.id, carlos.token)]).toEqual([true, false]);
    });
  });

  it('la lista del grupo trae canManage de cada propuesta para quien pregunta', async () => {
    const deAna = await planBy(ana.token);
    const deYo = await planBy(yo.token);
    const list: Proposal[] = (await request(app).get(`/api/groups/${group.id}/proposals`).set(bearer(ana.token))).body;
    expect(list.map((p) => [p.id, p.canManage])).toEqual([[deYo.id, false], [deAna.id, true]]);
  });

  it('si quien la creó se va, la gestiona el ORGANIZER: confirma y cancela', async () => {
    const p = await planBy(ana.token);
    await voteFor(app, p.id, windowOf(p, 2).id, carlos.token);
    expect((await leave(ana.token)).status).toBe(204);
    expect([await canManage(p.id, yo.token), await canManage(p.id, carlos.token)]).toEqual([true, false]);
    expect((await post(`${p.id}/confirm`, carlos.token)).status).toBe(403);
    expect((await post(`${p.id}/confirm`, yo.token)).body.state).toBe('CONFIRMADO');
    expect((await post(`${p.id}/cancel`, yo.token)).body.state).toBe('CANCELADO');
  });

  it('si se van quien la creó y el único ORGANIZER, la gestiona quien heredó el rol de organizador al salir (nunca queda huérfana)', async () => {
    const dani = await registerUser(app, { name: 'Dani' });
    await joinGroup(app, dani.token, group.inviteCode);
    const p = await planBy(ana.token);
    // Dani figura como más antiguo que Carlos aunque se unió después: manda joined_at (D3), así que hereda Dani.
    await db.query('UPDATE group_members SET joined_at = $1 WHERE user_id = $2', ['2000-01-01T00:00:00.000Z', dani.user.id]);
    await leave(ana.token);
    await leave(yo.token); // C6: el rol ORGANIZER pasa a Dani
    expect([await canManage(p.id, dani.token), await canManage(p.id, carlos.token)]).toEqual([true, false]);
    expect((await post(`${p.id}/cancel`, dani.token)).status).toBe(200);
  });

  it('sin organizador en la base (dato roto) y sin quien la creó, nadie la gestiona', async () => {
    const p = await planBy(ana.token);
    await leave(ana.token);
    await db.query("UPDATE group_members SET role = 'MEMBER' WHERE group_id = $1", [group.id]);
    expect([await canManage(p.id, yo.token), await canManage(p.id, carlos.token)]).toEqual([false, false]);
  });

  it('si quien la creó vuelve al grupo, la gestiona junto con el organizador', async () => {
    const p = await planBy(ana.token);
    await leave(ana.token);
    expect(await canManage(p.id, yo.token)).toBe(true);
    await joinGroup(app, ana.token, group.inviteCode);
    expect([await canManage(p.id, ana.token), await canManage(p.id, yo.token)]).toEqual([true, true]);
  });

  it('la alerta de Inicio usa la misma regla (canResolve)', async () => {
    const p = await planBy(ana.token);
    await voteFor(app, p.id, windowOf(p, 2).id, ana.token);
    await post(`${p.id}/confirm`, ana.token); // martes 16:00 de hoy: aún no ocurrió
    await post(`${p.id}/incidences`, carlos.token, { type: 'IMPREVISTO', reason: 'Examen' });
    const alertOf = async (token: string) => ((await request(app).get('/api/me/dashboard').set(bearer(token))).body as Dashboard).expressAlert;
    expect([(await alertOf(ana.token))?.canResolve, (await alertOf(yo.token))?.canResolve, (await alertOf(carlos.token))?.canResolve]).toEqual([true, true, false]);
    await leave(ana.token);
    expect((await alertOf(yo.token))?.canResolve).toBe(true);
  });
});
