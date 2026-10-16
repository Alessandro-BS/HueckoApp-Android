import type { Proposal } from '@hueckoapp/shared';
import type { Express } from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

import type { Db } from '../src/db/db';
import { insertGroup, registerAdmin } from './admin-fixtures';
import { bearer, createGroup, createProposal, DEADLINE, interleave, makeTestApp, NOW, setupSeedGroup, voteFor } from './helpers';

async function setupGroups() {
  const { app, db } = await makeTestApp({ now: () => NOW });
  const admin = await registerAdmin(app, db, { email: 'admin@correo.com' });
  const { yo, ana, group } = await setupSeedGroup(app); // «Proyecto Integrador»: yo es OWNER, Ana MEMBER
  return { app, db, admin, yo, ana, group };
}

const count = async (db: Db, sql: string, ...params: string[]) => (await db.one<{ n: number }>(sql, params))!.n;
const names = (body: { items: { name: string }[] }) => body.items.map((g) => g.name);

type Session = { token: string; user: { id: string } };

// Plan de un solo tramo (miércoles 11–13) votado por los dos y confirmado por quien lo creó.
async function confirmedPlan(app: Express, yo: Session, ana: Session, groupId: string, title = 'Reunión'): Promise<Proposal> {
  const plan = await createProposal(app, yo.token, groupId, {
    title, votingDeadline: DEADLINE, windows: [{ dayOfWeek: 3, startTime: '11:00', endTime: '13:00' }],
  });
  await voteFor(app, plan.id, plan.windows[0].id, yo.token).expect(200);
  await voteFor(app, plan.id, plan.windows[0].id, ana.token).expect(200);
  const res = await request(app).post(`/api/proposals/${plan.id}/confirm`).set(bearer(yo.token)).send({});
  if (res.status !== 200) throw new Error(`confirmar falló: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body;
}

describe('GET /api/admin/groups', () => {
  it('cada grupo con miembros, propuestas y OWNER; busca por nombre o por código', async () => {
    const { app, db, admin, yo, group } = await setupGroups();
    await createProposal(app, yo.token, group.id, { votingDeadline: DEADLINE });
    const other = await insertGroup(db, { name: 'Amigos de la Uni', inviteCode: 'HUECKO123' });
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

  it('% y _ se buscan literalmente, no como comodines', async () => {
    const { app, db, admin } = await setupGroups();
    await insertGroup(db, { name: 'Rebajas 100%', inviteCode: 'REBAJAS1' });
    await insertGroup(db, { name: 'Club_Lectura', inviteCode: 'CLUBLEC1' });
    await insertGroup(db, { name: 'Club Lectura', inviteCode: 'CLUBLEC2' });
    const search = async (q: string) => names((await request(app).get('/api/admin/groups').query({ search: q }).set(bearer(admin.token))).body);
    expect(await search('100%')).toEqual(['Rebajas 100%']);
    expect(await search('%')).toEqual(['Rebajas 100%']);
    expect(await search('b_l')).toEqual(['Club_Lectura']);
    expect((await search('club')).sort()).toEqual(['Club Lectura', 'Club_Lectura']); // control positivo
  });

  it('los más nuevos primero y 20 por página', async () => {
    const { app, db } = await makeTestApp({ now: () => NOW });
    const admin = await registerAdmin(app, db);
    for (let i = 0; i < 21; i++) {
      await insertGroup(db, { name: `Grupo ${String(i).padStart(2, '0')}`, createdAt: new Date(NOW.getTime() + i * 60_000).toISOString() });
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
    const plan = await confirmedPlan(app, yo, ana, group.id);
    await request(app).post(`/api/proposals/${plan.id}/incidences`).set(bearer(ana.token)).send({ type: 'FALTA', reason: 'Enferma' }).expect(201);
    const other = await createGroup(app, ana.token, { name: 'Otro' });
    const left = async () => [
      await count(db, 'SELECT COUNT(*) AS n FROM group_members WHERE group_id = $1', group.id),
      await count(db, 'SELECT COUNT(*) AS n FROM proposals WHERE group_id = $1', group.id),
      await count(db, 'SELECT COUNT(*) AS n FROM proposal_windows WHERE proposal_id = $1', plan.id),
      await count(db, 'SELECT COUNT(*) AS n FROM votes WHERE proposal_id = $1', plan.id),
      await count(db, 'SELECT COUNT(*) AS n FROM incidences WHERE proposal_id = $1', plan.id),
    ];
    expect(await left()).toEqual([2, 1, 1, 2, 1]); // control positivo: antes de borrar, todo existe
    expect((await request(app).delete(`/api/admin/groups/${group.id}`).set(bearer(admin.token))).status).toBe(204);
    expect(await left()).toEqual([0, 0, 0, 0, 0]);
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

  it('si no se puede anotar, el grupo no se borra (misma transacción)', async () => {
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {}); // el 500 se escribe en el log
    try {
      const { app, db, admin, group } = await setupGroups();
      await db.exec('DROP TABLE admin_audit_log');
      expect((await request(app).delete(`/api/admin/groups/${group.id}`).set(bearer(admin.token))).status).toBe(500);
      expect(await count(db, 'SELECT COUNT(*) AS n FROM groups WHERE id = $1', group.id)).toBe(1);
      expect(await count(db, 'SELECT COUNT(*) AS n FROM group_members WHERE group_id = $1', group.id)).toBe(2);
    } finally {
      quiet.mockRestore();
    }
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

  it('también cancela un plan CONFIRMADO o EN_RECOORDINACION y anota el estado de partida', async () => {
    const { app, admin, yo, ana, group } = await setupGroups();
    const confirmed = await confirmedPlan(app, yo, ana, group.id, 'Confirmado');
    const recoordinating = await confirmedPlan(app, yo, ana, group.id, 'Re-coordinando');
    await request(app).patch(`/api/groups/${group.id}/members/${ana.user.id}`).set(bearer(yo.token)).send({ isEssential: true }).expect(200);
    const report = await request(app)
      .post(`/api/proposals/${recoordinating.id}/incidences`)
      .set(bearer(ana.token))
      .send({ type: 'FALTA', reason: 'Enferma' });
    expect(report.body.state).toBe('EN_RECOORDINACION'); // control del escenario
    for (const plan of [confirmed, recoordinating]) {
      const res = await request(app).post(`/api/admin/proposals/${plan.id}/cancel`).set(bearer(admin.token)).send({ reason: 'Spam' });
      expect(res.status).toBe(200);
      expect(res.body.state).toBe('CANCELADO');
    }
    const audit = await request(app).get('/api/admin/audit').set(bearer(admin.token));
    expect(audit.body.items.map((e: { details: { from: string } }) => e.details.from)).toEqual(['EN_RECOORDINACION', 'CONFIRMADO']);
  });

  it('si no se puede anotar, la propuesta no se cancela (misma transacción)', async () => {
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {}); // el 500 se escribe en el log
    try {
      const { app, db, admin, yo, group } = await setupGroups();
      const plan = await createProposal(app, yo.token, group.id, { votingDeadline: DEADLINE });
      await db.exec('DROP TABLE admin_audit_log');
      const res = await request(app).post(`/api/admin/proposals/${plan.id}/cancel`).set(bearer(admin.token)).send({ reason: 'Spam' });
      expect(res.status).toBe(500);
      expect((await request(app).get(`/api/proposals/${plan.id}`).set(bearer(yo.token))).body.state).toBe('PROPUESTO');
    } finally {
      quiet.mockRestore();
    }
  });

  it('otra vez → 409 INVALID_STATE y no se anota dos veces', async () => {
    const { app, admin, yo, group } = await setupGroups();
    const plan = await createProposal(app, yo.token, group.id, { votingDeadline: DEADLINE });
    const send = () => request(app).post(`/api/admin/proposals/${plan.id}/cancel`).set(bearer(admin.token)).send({ reason: 'Spam' });
    expect((await send()).status).toBe(200);
    const again = await send();
    expect(again.status).toBe(409);
    expect(again.body.error).toMatchObject({ code: 'INVALID_STATE', message: 'La propuesta ya está cancelada.' });
    const audit = await request(app).get('/api/admin/audit').set(bearer(admin.token));
    expect(audit.body.total).toBe(1);
    expect(audit.body.items[0].details.reason).toBe('Spam');
  });

  it('si quien organiza lo cancela entre la comprobación y la escritura: 409 INVALID_STATE y no se anota', async () => {
    const { app, db, admin, yo, group } = await setupGroups();
    const plan = await createProposal(app, yo.token, group.id, { votingDeadline: DEADLINE });
    interleave(db, /^UPDATE proposals SET state/, "UPDATE proposals SET state = 'CANCELADO' WHERE id = $1", [plan.id]);
    const res = await request(app).post(`/api/admin/proposals/${plan.id}/cancel`).set(bearer(admin.token)).send({ reason: 'Spam' });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatchObject({ code: 'INVALID_STATE', message: 'La propuesta ya está cancelada.' });
    expect(await count(db, 'SELECT COUNT(*) AS n FROM admin_audit_log')).toBe(0);
  });

  it('quien organiza el plan no puede usar la ruta de moderación (403 NOT_ADMIN), pero su /cancel de siempre sigue igual', async () => {
    const { app, yo, group } = await setupGroups();
    const plan = await createProposal(app, yo.token, group.id, { votingDeadline: DEADLINE });
    const denied = await request(app).post(`/api/admin/proposals/${plan.id}/cancel`).set(bearer(yo.token)).send({ reason: 'Spam' });
    expect(denied.status).toBe(403);
    expect(denied.body.error.code).toBe('NOT_ADMIN');
    expect((await request(app).post(`/api/proposals/${plan.id}/cancel`).set(bearer(yo.token))).status).toBe(200); // control positivo
  });

  it('404 PROPOSAL_NOT_FOUND con un motivo válido', async () => {
    const { app, admin } = await setupGroups();
    const missing = await request(app).post('/api/admin/proposals/no-existe/cancel').set(bearer(admin.token)).send({ reason: 'Spam' });
    expect(missing.status).toBe(404);
    expect(missing.body.error.code).toBe('PROPOSAL_NOT_FOUND');
  });

  it.each([
    ['sin cuerpo', undefined],
    ['sin motivo', {}],
    ['motivo en blanco', { reason: '   ' }],
    ['motivo de 2 caracteres tras el trim', { reason: '  ab ' }],
    ['motivo de más de 200 caracteres', { reason: 'x'.repeat(201) }],
    ['motivo que no es texto', { reason: 42 }],
  ])('400 VALIDATION_ERROR: %s, y la propuesta no cambia ni se anota', async (_name, body) => {
    const { app, admin, yo, group } = await setupGroups();
    const plan = await createProposal(app, yo.token, group.id, { votingDeadline: DEADLINE });
    const req = request(app).post(`/api/admin/proposals/${plan.id}/cancel`).set(bearer(admin.token));
    const res = await (body === undefined ? req : req.send(body));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect((await request(app).get(`/api/proposals/${plan.id}`).set(bearer(yo.token))).body.state).toBe('PROPUESTO');
    expect((await request(app).get('/api/admin/audit').set(bearer(admin.token))).body.total).toBe(0);
    // Control positivo: con un motivo de 3 caracteres (límite) sí se cancela.
    const ok = await request(app).post(`/api/admin/proposals/${plan.id}/cancel`).set(bearer(admin.token)).send({ reason: ' abc ' });
    expect(ok.status).toBe(200);
  });

  it('el motivo de 200 caracteres exactos vale; el de 201 no', async () => {
    const { app, admin, yo, group } = await setupGroups();
    const plan = await createProposal(app, yo.token, group.id, { votingDeadline: DEADLINE });
    const long = await request(app).post(`/api/admin/proposals/${plan.id}/cancel`).set(bearer(admin.token)).send({ reason: 'x'.repeat(201) });
    expect(long.status).toBe(400);
    expect(long.body.error.details).toContainEqual(expect.objectContaining({ message: 'El motivo admite hasta 200 caracteres.' }));
    expect((await request(app).post(`/api/admin/proposals/${plan.id}/cancel`).set(bearer(admin.token)).send({ reason: 'x'.repeat(200) })).status).toBe(200);
  });
});
