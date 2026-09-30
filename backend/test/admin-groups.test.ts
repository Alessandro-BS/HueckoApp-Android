import request from 'supertest';
import { describe, expect, it } from 'vitest';

import type { Db } from '../src/db/database';
import { insertGroup, registerAdmin } from './admin-fixtures';
import { bearer, createGroup, createProposal, DEADLINE, makeTestApp, NOW, setupSeedGroup, voteFor } from './helpers';

async function setupGroups() {
  const { app, db } = makeTestApp({ now: () => NOW });
  const admin = await registerAdmin(app, db, { email: 'admin@correo.com' });
  const { yo, ana, group } = await setupSeedGroup(app); // «Proyecto Integrador»: yo es OWNER, Ana MEMBER
  return { app, db, admin, yo, ana, group };
}

const count = (db: Db, sql: string, ...params: string[]) => (db.prepare(sql).get(...params) as { n: number }).n;
const names = (body: { items: { name: string }[] }) => body.items.map((g) => g.name);

describe('GET /api/admin/groups', () => {
  it('cada grupo con miembros, propuestas y OWNER; busca por nombre o por código', async () => {
    const { app, db, admin, yo, group } = await setupGroups();
    await createProposal(app, yo.token, group.id, { votingDeadline: DEADLINE });
    const other = insertGroup(db, { name: 'Amigos de la Uni', inviteCode: 'HUECKO123' });
    const all = await request(app).get('/api/admin/groups').set(bearer(admin.token));
    expect(all.body).toMatchObject({ page: 1, pageSize: 20, total: 2 });
    const byId = new Map(all.body.items.map((g: { id: string }) => [g.id, g]));
    expect(byId.get(group.id)).toEqual({
      id: group.id, name: 'Proyecto Integrador', description: '', memberCount: 2, proposalCount: 1, owner: yo.user, createdAt: expect.any(String),
    });
    expect(byId.get(other)).toMatchObject({ memberCount: 0, proposalCount: 0, owner: null });
    const search = async (q: string) => names((await request(app).get('/api/admin/groups').query({ search: q }).set(bearer(admin.token))).body);
    expect(await search('huecko1')).toEqual(['Amigos de la Uni']);
    expect(await search('INTEGRADOR')).toEqual(['Proyecto Integrador']);
  });

  it('los más nuevos primero y 20 por página', async () => {
    const { app, db } = makeTestApp({ now: () => NOW });
    const admin = await registerAdmin(app, db);
    for (let i = 0; i < 21; i++) {
      insertGroup(db, { name: `Grupo ${String(i).padStart(2, '0')}`, createdAt: new Date(NOW.getTime() + i * 60_000).toISOString() });
    }
    const first = await request(app).get('/api/admin/groups').set(bearer(admin.token));
    expect(first.body.total).toBe(21);
    expect(first.body.items).toHaveLength(20);
    expect(first.body.items[0].name).toBe('Grupo 20');
    expect(names((await request(app).get('/api/admin/groups').query({ page: 2 }).set(bearer(admin.token))).body)).toEqual(['Grupo 00']);
  });
});

describe('GET /api/admin/groups/:id', () => {
  it('detalle con código, miembros y propuestas; los votos solo cuentan a quien sigue en el grupo', async () => {
    const { app, admin, yo, ana, group } = await setupGroups();
    const plan = await createProposal(app, yo.token, group.id, { title: 'Repaso', votingDeadline: DEADLINE });
    await voteFor(app, plan.id, plan.windows[0].id, ana.token).expect(200);
    const res = await request(app).get(`/api/admin/groups/${group.id}`).set(bearer(admin.token));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: group.id, name: 'Proyecto Integrador', inviteCode: group.inviteCode, availabilityThreshold: 80, memberCount: 2, proposalCount: 1, owner: yo.user,
    });
    expect(res.body.members.map((m: { name: string; role: string }) => [m.name, m.role])).toEqual([
      ['Usuario de Prueba', 'OWNER'],
      ['Ana', 'MEMBER'],
    ]);
    expect(res.body.proposals).toEqual([
      {
        id: plan.id, title: 'Repaso', state: 'PROPUESTO', createdBy: yo.user, createdAt: NOW.toISOString(), votingDeadline: DEADLINE,
        scheduledAt: null, scheduledDate: null, voteCount: 1, incidenceCount: 0,
      },
    ]);
    await request(app).delete(`/api/groups/${group.id}/members/me`).set(bearer(ana.token)).expect(204);
    const after = await request(app).get(`/api/admin/groups/${group.id}`).set(bearer(admin.token));
    expect(after.body.proposals[0].voteCount).toBe(0);
  });

  it('404 GROUP_NOT_FOUND', async () => {
    const { app, admin } = await setupGroups();
    const res = await request(app).get('/api/admin/groups/no-existe').set(bearer(admin.token));
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('GROUP_NOT_FOUND');
  });
});

describe('DELETE /api/admin/groups/:id', () => {
  it('borra el grupo con todo lo suyo, lo anota y no toca los demás grupos', async () => {
    const { app, db, admin, yo, ana, group } = await setupGroups();
    const plan = await createProposal(app, yo.token, group.id, { votingDeadline: DEADLINE });
    await voteFor(app, plan.id, plan.windows[0].id, ana.token).expect(200);
    const other = await createGroup(app, ana.token, { name: 'Otro' });
    expect((await request(app).delete(`/api/admin/groups/${group.id}`).set(bearer(admin.token))).status).toBe(204);
    expect(count(db, 'SELECT COUNT(*) AS n FROM group_members WHERE group_id = ?', group.id)).toBe(0);
    expect(count(db, 'SELECT COUNT(*) AS n FROM proposals WHERE group_id = ?', group.id)).toBe(0);
    expect(count(db, 'SELECT COUNT(*) AS n FROM proposal_windows WHERE proposal_id = ?', plan.id)).toBe(0);
    expect(count(db, 'SELECT COUNT(*) AS n FROM votes WHERE proposal_id = ?', plan.id)).toBe(0);
    expect((await request(app).get(`/api/groups/${group.id}`).set(bearer(yo.token))).status).toBe(404);
    expect((await request(app).get(`/api/groups/${other.id}`).set(bearer(ana.token))).status).toBe(200);
    const audit = await request(app).get('/api/admin/audit').set(bearer(admin.token));
    expect(audit.body.items[0]).toMatchObject({
      action: 'GROUP_DELETED', targetType: 'GROUP', targetId: group.id, details: { name: 'Proyecto Integrador', members: 2, proposals: 1 },
    });
  });

  it('solo ADMIN: el OWNER del grupo recibe 403 NOT_ADMIN y el grupo sigue', async () => {
    const { app, admin, yo, group } = await setupGroups();
    const denied = await request(app).delete(`/api/admin/groups/${group.id}`).set(bearer(yo.token));
    expect(denied.status).toBe(403);
    expect(denied.body.error.code).toBe('NOT_ADMIN');
    expect((await request(app).get(`/api/groups/${group.id}`).set(bearer(yo.token))).status).toBe(200);
    expect((await request(app).delete(`/api/admin/groups/${group.id}`).set(bearer(admin.token))).status).toBe(204); // control positivo
  });

  it('404 GROUP_NOT_FOUND si no existe', async () => {
    const { app, admin } = await setupGroups();
    const res = await request(app).delete('/api/admin/groups/no-existe').set(bearer(admin.token));
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('GROUP_NOT_FOUND');
  });
});

describe('POST /api/admin/proposals/:id/cancel (moderación, D7)', () => {
  it('un admin que no es miembro cancela el plan de otra persona; el grupo lo ve CANCELADO y queda anotado con el motivo', async () => {
    const { app, admin, yo, ana, group } = await setupGroups();
    const plan = await createProposal(app, yo.token, group.id, { title: 'Fiesta', votingDeadline: DEADLINE });
    const res = await request(app)
      .post(`/api/admin/proposals/${plan.id}/cancel`)
      .set(bearer(admin.token))
      .send({ reason: '  Contenido inapropiado  ' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: plan.id, title: 'Fiesta', state: 'CANCELADO' });
    expect((await request(app).get(`/api/proposals/${plan.id}`).set(bearer(ana.token))).body.state).toBe('CANCELADO');
    const audit = await request(app).get('/api/admin/audit').set(bearer(admin.token));
    expect(audit.body.items[0]).toMatchObject({
      action: 'PROPOSAL_CANCELLED',
      targetType: 'PROPOSAL',
      targetId: plan.id,
      details: { title: 'Fiesta', groupId: group.id, from: 'PROPUESTO', reason: 'Contenido inapropiado' },
    });
  });

  it('sin cuerpo también vale (motivo null); otra vez → 409 INVALID_STATE', async () => {
    const { app, admin, yo, group } = await setupGroups();
    const plan = await createProposal(app, yo.token, group.id, { votingDeadline: DEADLINE });
    expect((await request(app).post(`/api/admin/proposals/${plan.id}/cancel`).set(bearer(admin.token))).status).toBe(200);
    const again = await request(app).post(`/api/admin/proposals/${plan.id}/cancel`).set(bearer(admin.token));
    expect(again.status).toBe(409);
    expect(again.body.error).toMatchObject({ code: 'INVALID_STATE', message: 'La propuesta ya está cancelada.' });
    const audit = await request(app).get('/api/admin/audit').set(bearer(admin.token));
    expect(audit.body.total).toBe(1);
    expect(audit.body.items[0].details.reason).toBeNull();
  });

  it('quien organiza el plan no puede usar la ruta de moderación (403 NOT_ADMIN), pero su /cancel de siempre sigue igual', async () => {
    const { app, yo, group } = await setupGroups();
    const plan = await createProposal(app, yo.token, group.id, { votingDeadline: DEADLINE });
    const denied = await request(app).post(`/api/admin/proposals/${plan.id}/cancel`).set(bearer(yo.token));
    expect(denied.status).toBe(403);
    expect(denied.body.error.code).toBe('NOT_ADMIN');
    expect((await request(app).post(`/api/proposals/${plan.id}/cancel`).set(bearer(yo.token))).status).toBe(200); // control positivo
  });

  it('404 PROPOSAL_NOT_FOUND y 400 con un motivo de más de 200 caracteres', async () => {
    const { app, admin, yo, group } = await setupGroups();
    const missing = await request(app).post('/api/admin/proposals/no-existe/cancel').set(bearer(admin.token));
    expect(missing.status).toBe(404);
    expect(missing.body.error.code).toBe('PROPOSAL_NOT_FOUND');
    const plan = await createProposal(app, yo.token, group.id, { votingDeadline: DEADLINE });
    const long = await request(app).post(`/api/admin/proposals/${plan.id}/cancel`).set(bearer(admin.token)).send({ reason: 'x'.repeat(201) });
    expect(long.status).toBe(400);
    expect(long.body.error.details).toContainEqual(expect.objectContaining({ message: 'El motivo admite hasta 200 caracteres.' }));
  });
});
