import type { Dashboard, Group, Proposal, User } from '@hueckoapp/shared';
import type { Express } from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';

import type { Db } from '../src/db/db';
import { canManageProposal, proposalManagerId } from '../src/proposals/permissions';
import { bearer, createGroup, createProposal, DEADLINE, joinGroup, makeTestApp, NOW, registerUser, voteFor, windowOf } from './helpers';

describe('canManageProposal (D1)', () => {
  const owner = { id: 'o', role: 'OWNER' as const };
  const ana = { id: 'a', role: 'MEMBER' as const };
  const carlos = { id: 'c', role: 'MEMBER' as const };

  it('quien la creó, mientras sea miembro', () => {
    expect(proposalManagerId('a', [owner, ana, carlos])).toBe('a');
    expect(canManageProposal({ viewerId: 'a', creatorId: 'a', members: [owner, ana, carlos] })).toBe(true);
    expect(canManageProposal({ viewerId: 'o', creatorId: 'a', members: [owner, ana, carlos] })).toBe(false);
  });

  it('si quien la creó se fue, el OWNER (aunque no sea el primero de la lista)', () => {
    expect(proposalManagerId('x', [ana, owner, carlos])).toBe('o');
  });

  it('sin OWNER (dato roto), quien lleva más tiempo: el primero en orden de llegada', () => {
    expect(proposalManagerId('x', [carlos, ana])).toBe('c');
  });

  it('sin miembros, nadie', () => {
    expect(proposalManagerId('x', [])).toBeNull();
    expect(canManageProposal({ viewerId: 'x', creatorId: 'x', members: [] })).toBe(false);
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
    group = await createGroup(app, yo.token); // yo = OWNER
    await joinGroup(app, ana.token, group.inviteCode);
    await joinGroup(app, carlos.token, group.inviteCode);
  });

  const leave = (token: string) => request(app).delete(`/api/groups/${group.id}/members/me`).set(bearer(token));
  const canManage = async (proposalId: string, token: string): Promise<boolean> =>
    (await request(app).get(`/api/proposals/${proposalId}`).set(bearer(token))).body.canManage;
  const planBy = (token: string) =>
    createProposal(app, token, group.id, { votingDeadline: DEADLINE, windows: [{ dayOfWeek: 2, startTime: '16:00', endTime: '18:00' }] });
  const post = (path: string, token: string, body: object = {}) =>
    request(app).post(`/api/proposals/${path}`).set(bearer(token)).send(body);

  it('quien la creó la gestiona; el OWNER y los demás no (403 NOT_MANAGER)', async () => {
    const p = await planBy(ana.token);
    expect(p.canManage).toBe(true);
    expect([await canManage(p.id, yo.token), await canManage(p.id, carlos.token)]).toEqual([false, false]);
    const res = await post(`${p.id}/cancel`, yo.token);
    expect([res.status, res.body.error.code, res.body.error.message]).toEqual([403, 'NOT_MANAGER', 'Solo quien organiza el plan puede hacer esto.']);
  });

  it('la lista del grupo trae canManage de cada propuesta para quien pregunta', async () => {
    const deAna = await planBy(ana.token);
    const deYo = await planBy(yo.token);
    const list: Proposal[] = (await request(app).get(`/api/groups/${group.id}/proposals`).set(bearer(ana.token))).body;
    expect(list.map((p) => [p.id, p.canManage])).toEqual([[deYo.id, false], [deAna.id, true]]);
  });

  it('si quien la creó se va, la gestiona el OWNER: confirma, resuelve y cancela', async () => {
    const p = await planBy(ana.token);
    await voteFor(app, p.id, windowOf(p, 2).id, carlos.token);
    expect((await leave(ana.token)).status).toBe(204);
    expect([await canManage(p.id, yo.token), await canManage(p.id, carlos.token)]).toEqual([true, false]);
    expect((await post(`${p.id}/confirm`, carlos.token)).status).toBe(403);
    expect((await post(`${p.id}/confirm`, yo.token)).body.state).toBe('CONFIRMADO');
    await post(`${p.id}/incidences`, carlos.token, { type: 'IMPREVISTO', reason: 'Examen' });
    expect((await post(`${p.id}/incidences/resolve`, yo.token, { newState: 'CONFIRMADO' })).status).toBe(200);
    expect((await post(`${p.id}/cancel`, yo.token)).body.state).toBe('CANCELADO');
  });

  it('si se van quien la creó y el OWNER, la gestiona quien lleva más tiempo (nunca queda huérfana)', async () => {
    const dani = await registerUser(app, { name: 'Dani' });
    await joinGroup(app, dani.token, group.inviteCode);
    const p = await planBy(ana.token);
    // Dani figura como más antiguo que Carlos aunque se unió después: manda joined_at (D3).
    await db.query('UPDATE group_members SET joined_at = $1 WHERE user_id = $2', ['2000-01-01T00:00:00.000Z', dani.user.id]);
    await leave(ana.token);
    await leave(yo.token); // C6: el rol OWNER pasa a Dani
    expect([await canManage(p.id, dani.token), await canManage(p.id, carlos.token)]).toEqual([true, false]);
    expect((await post(`${p.id}/cancel`, dani.token)).status).toBe(200);
  });

  it('sin OWNER en la base (dato roto), gestiona el miembro más antiguo', async () => {
    const p = await planBy(ana.token);
    await leave(ana.token);
    await db.query("UPDATE group_members SET role = 'MEMBER' WHERE group_id = $1", [group.id]);
    // yo entró primero (creó el grupo); Carlos, después.
    expect([await canManage(p.id, yo.token), await canManage(p.id, carlos.token)]).toEqual([true, false]);
  });

  it('si quien la creó vuelve al grupo, vuelve a gestionarla', async () => {
    const p = await planBy(ana.token);
    await leave(ana.token);
    expect(await canManage(p.id, yo.token)).toBe(true);
    await joinGroup(app, ana.token, group.inviteCode);
    expect([await canManage(p.id, ana.token), await canManage(p.id, yo.token)]).toEqual([true, false]);
  });

  it('la alerta de Inicio usa la misma regla (canResolve)', async () => {
    const p = await planBy(ana.token);
    await voteFor(app, p.id, windowOf(p, 2).id, ana.token);
    await post(`${p.id}/confirm`, ana.token); // martes 16:00 de hoy: aún no ocurrió
    await post(`${p.id}/incidences`, carlos.token, { type: 'IMPREVISTO', reason: 'Examen' });
    const alertOf = async (token: string) => ((await request(app).get('/api/me/dashboard').set(bearer(token))).body as Dashboard).expressAlert;
    expect([(await alertOf(ana.token))?.canResolve, (await alertOf(yo.token))?.canResolve]).toEqual([true, false]);
    await leave(ana.token);
    expect((await alertOf(yo.token))?.canResolve).toBe(true);
  });
});
