import type { Group, NotificationData, NotificationKind, Proposal, User } from '@hueckoapp/shared';
import type { Express } from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';

import type { Db } from '../src/db/db';
import { enqueue, type OutboxItem } from '../src/notifications/outbox.repository';
import { proposalsRepository } from '../src/proposals/proposals.repository';
import { registerAdmin } from './admin-fixtures';
import {
  AFTER_DEADLINE,
  bearer,
  createGroup,
  createProposal,
  DEADLINE,
  interleave,
  interleaveWith,
  joinGroup,
  makeClock,
  makeTestApp,
  NOW,
  registerUser,
  voteFor,
  win,
  windowOf,
} from './helpers';

// La bandeja de salida: cada cambio de un plan deja sus avisos en `notifications`, en su misma transacción. Aquí no se
// envía nada (eso es del envío): se leen las filas.

type Member = { token: string; user: User };
type Row = { user_id: string; kind: NotificationKind; title: string; body: string; data: NotificationData; sent_at: string | null };

let app: Express;
let db: Db;
let clock: ReturnType<typeof makeClock>;
let yo: Member;
let ana: Member;
let carlos: Member;
let group: Group;

const MINUTE = 60_000;
const later = (minutes: number) => new Date(NOW.getTime() + minutes * MINUTE);

beforeEach(async () => {
  clock = makeClock(NOW);
  ({ app, db } = await makeTestApp({ now: clock.now }));
  yo = await registerUser(app, { name: 'Yo' });
  ana = await registerUser(app, { name: 'Ana' });
  carlos = await registerUser(app, { name: 'Carlos' });
  group = await createGroup(app, yo.token, { name: 'Proyecto Integrador' }); // yo es ORGANIZER
  await joinGroup(app, ana.token, group.inviteCode);
  await joinGroup(app, carlos.token, group.inviteCode);
});

async function notifications(kind?: NotificationKind): Promise<Row[]> {
  const rows = await db.many<Omit<Row, 'data'> & { data: string }>(
    'SELECT user_id, kind, title, body, data, sent_at FROM notifications ORDER BY seq',
  );
  return rows.map((r) => ({ ...r, data: JSON.parse(r.data) as NotificationData })).filter((r) => kind === undefined || r.kind === kind);
}
const recipients = (rows: Row[]) => rows.map((r) => r.user_id).sort();
const ids = (...members: Member[]) => members.map((m) => m.user.id).sort();

const post = (path: string, token: string, body: object = {}) => request(app).post(`/api/proposals/${path}`).set(bearer(token)).send(body);
const getPlan = (p: Proposal, token = yo.token) => request(app).get(`/api/proposals/${p.id}`).set(bearer(token)).expect(200);

// Miércoles 7/10 y sábado 10/10, 11–13, en votación hasta DEADLINE.
const newPlan = (title = 'Reunión de avance', creator: Member = yo) =>
  createProposal(app, creator.token, group.id, { title, votingDeadline: DEADLINE, windows: [win(3, '11:00', '13:00'), win(6, '11:00', '13:00')] });

async function confirmedPlan(): Promise<Proposal> {
  const p = await newPlan();
  await voteFor(app, p.id, windowOf(p, 3).id, yo.token).expect(200);
  return (await post(`${p.id}/confirm`, yo.token).expect(200)).body;
}

// Yo (quien propuso el plan) falta: se abre la votación exprés de Ana y Carlos.
async function planWithExpressVote(): Promise<Proposal> {
  const p = await confirmedPlan();
  const res = await post(`${p.id}/incidences`, yo.token, { type: 'FALTA', reason: 'Estoy enfermo' }).expect(201);
  expect(res.body.expressVote?.status).toBe('ABIERTA');
  return res.body;
}

const expressVote = (p: Proposal, member: Member, option: string) =>
  request(app).put(`/api/proposals/${p.id}/express-vote`).set(bearer(member.token)).send({ option }).expect(200);

describe('enqueue', () => {
  const item = (dedupeKey?: string): OutboxItem => ({
    userId: ana.user.id,
    kind: 'REMINDER',
    title: 'Proyecto Integrador',
    body: '«Plan» empieza a las 16:00.',
    data: { kind: 'REMINDER', proposalId: 'p1', groupId: group.id, screen: 'PLAN' },
    dedupeKey,
  });

  it('devuelve las filas insertadas: la misma dedupe_key una sola vez (1 y después 0)', async () => {
    expect(await enqueue(db, [item('reminder:p1')], NOW)).toBe(1);
    expect(await enqueue(db, [item('reminder:p1')], later(1))).toBe(0);
    expect(await db.one("SELECT COUNT(*) AS n FROM notifications WHERE dedupe_key = 'reminder:p1'")).toEqual({ n: 1 });
    // En un mismo lote cuentan solo las nuevas; sin clave nunca chocan.
    expect(await enqueue(db, [item('reminder:p1'), item('reminder:p2'), item(), item()], NOW)).toBe(3);
    expect(await db.one('SELECT COUNT(*) AS n FROM notifications')).toEqual({ n: 4 });
    expect(await enqueue(db, [], NOW)).toBe(0);
  });
});

describe('crear una propuesta', () => {
  it('NEW_PROPOSAL a cada miembro menos quien la creó, pendiente y con screen VOTING', async () => {
    const p = await newPlan();
    const rows = await notifications();
    expect(recipients(rows)).toEqual(ids(ana, carlos));
    for (const row of rows) {
      expect(row).toEqual({
        user_id: row.user_id,
        kind: 'NEW_PROPOSAL',
        title: 'Proyecto Integrador',
        body: 'Yo propuso «Reunión de avance». Vota tus franjas.',
        data: { kind: 'NEW_PROPOSAL', proposalId: p.id, groupId: group.id, screen: 'VOTING' },
        sent_at: null,
      });
    }
  });

  it('Review Focus 2: si guardar el aviso falla, la propuesta tampoco se crea', async () => {
    interleaveWith(db, /^INSERT INTO notifications/, async () => {
      throw new Error('fallo simulado');
    });
    const res = await request(app)
      .post(`/api/groups/${group.id}/proposals`)
      .set(bearer(yo.token))
      .send({ title: 'Plan', votingDeadline: DEADLINE, windows: [win(3, '11:00', '13:00'), win(6, '11:00', '13:00')] });
    expect(res.status).toBe(500);
    expect(await db.one('SELECT COUNT(*) AS n FROM proposals')).toEqual({ n: 0 });
    expect(await db.one('SELECT COUNT(*) AS n FROM proposal_windows')).toEqual({ n: 0 });
    expect(await notifications()).toEqual([]);
  });
});

describe('confirmar y cancelar a mano', () => {
  it('confirmar: PLAN_CONFIRMED a todos menos quien confirmó, con la fecha en Lima', async () => {
    const p = await confirmedPlan();
    const rows = await notifications('PLAN_CONFIRMED');
    expect(recipients(rows)).toEqual(ids(ana, carlos));
    expect(rows[0]).toMatchObject({
      title: 'Proyecto Integrador',
      body: '«Reunión de avance» se confirmó para el miércoles 7 de octubre, 11:00.',
      data: { kind: 'PLAN_CONFIRMED', proposalId: p.id, groupId: group.id, screen: 'PLAN' },
    });
  });

  it('confirma otra organizadora: se excluye ella y recibe quien creó el plan', async () => {
    await request(app).patch(`/api/groups/${group.id}/members/${ana.user.id}`).set(bearer(yo.token)).send({ role: 'ORGANIZER' }).expect(200);
    const p = await newPlan();
    await post(`${p.id}/confirm`, ana.token, { windowId: windowOf(p, 3).id }).expect(200);
    expect(recipients(await notifications('PLAN_CONFIRMED'))).toEqual(ids(yo, carlos));
  });

  it('Review Focus 2: un confirm que no se aplica (otra petición lo canceló antes del UPDATE) no deja aviso', async () => {
    const p = await newPlan();
    interleave(db, /^UPDATE proposals SET state = 'CONFIRMADO'/, "UPDATE proposals SET state = 'CANCELADO' WHERE id = $1", [p.id]);
    const res = await post(`${p.id}/confirm`, yo.token, { windowId: windowOf(p, 3).id });
    expect([res.status, res.body.error?.code]).toEqual([409, 'INVALID_STATE']);
    expect(await notifications('PLAN_CONFIRMED')).toEqual([]);
  });

  it('cancelar: PLAN_CANCELLED a todos menos quien canceló', async () => {
    const p = await confirmedPlan();
    await post(`${p.id}/cancel`, yo.token).expect(200);
    const rows = await notifications('PLAN_CANCELLED');
    expect(recipients(rows)).toEqual(ids(ana, carlos));
    expect(rows[0]).toMatchObject({
      title: 'Proyecto Integrador',
      body: '«Reunión de avance» se canceló.',
      data: { kind: 'PLAN_CANCELLED', proposalId: p.id, groupId: group.id, screen: 'PLAN' },
    });
  });

  it('Review Focus 2: otra cancelación se cuela antes del UPDATE de cancel: la segunda no escribe avisos', async () => {
    const p = await confirmedPlan();
    // Ana (organizadora) cancela justo antes del UPDATE de la petición de yo: sus avisos se guardan y los de yo no.
    await request(app).patch(`/api/groups/${group.id}/members/${ana.user.id}`).set(bearer(yo.token)).send({ role: 'ORGANIZER' }).expect(200);
    interleaveWith(db, /^UPDATE proposals SET state = 'CANCELADO', auto_closed = FALSE WHERE id = \$1 AND state <> 'CANCELADO'/, () =>
      proposalsRepository(db).cancel(p.id, ana.user.id, clock.now()),
    );
    const res = await post(`${p.id}/cancel`, yo.token);
    expect([res.status, res.body.error?.code]).toEqual([409, 'INVALID_STATE']);
    expect(recipients(await notifications('PLAN_CANCELLED'))).toEqual(ids(yo, carlos));
  });

  it('cancelar una ya cancelada (409): ningún aviso nuevo', async () => {
    const p = await newPlan();
    await post(`${p.id}/cancel`, yo.token).expect(200);
    await post(`${p.id}/cancel`, yo.token).expect(409);
    expect(await notifications('PLAN_CANCELLED')).toHaveLength(2);
  });

  it('quien salió del grupo antes del cambio no recibe', async () => {
    const p = await newPlan();
    await request(app).delete(`/api/groups/${group.id}/members/me`).set(bearer(carlos.token)).expect(204);
    await post(`${p.id}/confirm`, yo.token, { windowId: windowOf(p, 3).id }).expect(200);
    expect(recipients(await notifications('PLAN_CONFIRMED'))).toEqual(ids(ana));
  });
});

describe('moderación del admin', () => {
  it('cancelar desde el admin: PLAN_CANCELLED a todos los miembros (el admin no actúa como miembro)', async () => {
    const admin = await registerAdmin(app, db, { email: 'admin@correo.com' });
    const p = await confirmedPlan();
    await request(app).post(`/api/admin/proposals/${p.id}/cancel`).set(bearer(admin.token)).send({ reason: 'Contenido inapropiado' }).expect(200);
    const rows = await notifications('PLAN_CANCELLED');
    expect(recipients(rows)).toEqual(ids(yo, ana, carlos));
    expect(rows[0].body).toBe('«Reunión de avance» se canceló.');
  });

  it('Review Focus 2: si el registro de acciones falla después de encolar, la cancelación y sus avisos se deshacen', async () => {
    const admin = await registerAdmin(app, db, { email: 'admin@correo.com' });
    const p = await confirmedPlan();
    interleaveWith(db, /^INSERT INTO admin_audit_log/, async () => {
      throw new Error('fallo simulado');
    });
    const res = await request(app).post(`/api/admin/proposals/${p.id}/cancel`).set(bearer(admin.token)).send({ reason: 'Contenido inapropiado' });
    expect(res.status).toBe(500);
    expect((await getPlan(p)).body.state).toBe('CONFIRMADO');
    expect(await notifications('PLAN_CANCELLED')).toEqual([]);
  });

  it('moderar una propuesta que ya se canceló sola: ningún aviso nuevo', async () => {
    const admin = await registerAdmin(app, db, { email: 'admin@correo.com' });
    const p = await newPlan();
    clock.set(AFTER_DEADLINE);
    expect((await getPlan(p)).body).toMatchObject({ state: 'CANCELADO', autoClosed: true });
    const before = await notifications();
    await request(app).post(`/api/admin/proposals/${p.id}/cancel`).set(bearer(admin.token)).send({ reason: 'Limpieza' }).expect(200);
    expect(await notifications()).toEqual(before);
  });
});

describe('cierre automático de la votación', () => {
  it('con votos: PLAN_CONFIRMED a todos, también a quien creó el plan', async () => {
    const p = await newPlan();
    await voteFor(app, p.id, windowOf(p, 6).id, ana.token).expect(200);
    clock.set(AFTER_DEADLINE);
    expect((await getPlan(p)).body).toMatchObject({ state: 'CONFIRMADO', autoClosed: true });
    const rows = await notifications('PLAN_CONFIRMED');
    expect(recipients(rows)).toEqual(ids(yo, ana, carlos));
    expect(rows[0].body).toBe('«Reunión de avance» se confirmó para el sábado 10 de octubre, 11:00.');
  });

  it('sin votos: PLAN_CANCELLED «…nadie votó antes del plazo.» a todos, una sola vez', async () => {
    const p = await newPlan();
    clock.set(AFTER_DEADLINE);
    await getPlan(p);
    await getPlan(p, ana.token);
    const rows = await notifications('PLAN_CANCELLED');
    expect(recipients(rows)).toEqual(ids(yo, ana, carlos));
    expect(rows[0]).toMatchObject({
      body: '«Reunión de avance» se canceló: nadie votó antes del plazo.',
      data: { kind: 'PLAN_CANCELLED', proposalId: p.id, groupId: group.id, screen: 'PLAN' },
    });
  });
});

describe('votación exprés', () => {
  it('ausencia crítica: EXPRESS_OPENED a los votantes (no a quien avisó), con su razón', async () => {
    const p = await planWithExpressVote();
    const rows = await notifications('EXPRESS_OPENED');
    expect(recipients(rows)).toEqual(ids(ana, carlos));
    expect(rows[0]).toMatchObject({
      title: 'Proyecto Integrador',
      body: 'Yo no podrá ir a «Reunión de avance» (propuso este plan). Vota qué hacer.',
      data: { kind: 'EXPRESS_OPENED', proposalId: p.id, groupId: group.id, screen: 'PLAN' },
    });
  });

  it('una ausencia que no es crítica no abre votación ni avisa', async () => {
    const p = await confirmedPlan();
    await post(`${p.id}/incidences`, carlos.token, { type: 'FALTA', reason: 'Viaje' }).expect(201);
    expect(await notifications('EXPRESS_OPENED')).toEqual([]);
  });

  it('cierre (todos votaron MANTENER): EXPRESS_RESULT a todos los miembros, también a quien avisó', async () => {
    const p = await planWithExpressVote();
    await expressVote(p, ana, 'MANTENER');
    await expressVote(p, carlos, 'MANTENER');
    const rows = await notifications('EXPRESS_RESULT');
    expect(recipients(rows)).toEqual(ids(yo, ana, carlos));
    expect(rows[0]).toMatchObject({
      body: 'El grupo decidió mantener «Reunión de avance».',
      data: { kind: 'EXPRESS_RESULT', proposalId: p.id, groupId: group.id, screen: 'PLAN' },
    });
  });

  it('resultado CANCELAR: solo EXPRESS_RESULT, ningún PLAN_CANCELLED', async () => {
    const p = await planWithExpressVote();
    await expressVote(p, ana, 'CANCELAR');
    await expressVote(p, carlos, 'CANCELAR');
    expect((await getPlan(p)).body.state).toBe('CANCELADO');
    expect((await notifications('EXPRESS_RESULT')).map((r) => r.body)).toEqual([
      'El grupo decidió cancelar «Reunión de avance».',
      'El grupo decidió cancelar «Reunión de avance».',
      'El grupo decidió cancelar «Reunión de avance».',
    ]);
    expect(await notifications('PLAN_CANCELLED')).toEqual([]);
  });

  it('vencida sin quórum: «Sin quórum: … se mantiene.»', async () => {
    const p = await planWithExpressVote();
    clock.set(later(61));
    await getPlan(p);
    const rows = await notifications('EXPRESS_RESULT');
    expect(recipients(rows)).toEqual(ids(yo, ana, carlos));
    expect(rows[0].body).toBe('Sin quórum: «Reunión de avance» se mantiene.');
  });

  it('quien gestiona canceló con la votación abierta: al cerrarse no aplica nada y no avisa otra vez', async () => {
    const p = await planWithExpressVote();
    await post(`${p.id}/cancel`, yo.token).expect(200);
    clock.set(later(61));
    expect((await getPlan(p)).body.expressVote).toMatchObject({ status: 'CERRADA' });
    expect(await notifications('EXPRESS_RESULT')).toEqual([]);
    expect(recipients(await notifications('PLAN_CANCELLED'))).toEqual(ids(ana, carlos));
  });
});
