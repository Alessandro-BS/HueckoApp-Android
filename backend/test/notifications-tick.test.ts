import type { Group, Proposal, User } from '@hueckoapp/shared';
import type { Express } from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';

import { instant } from '../src/common/zone';
import type { Db } from '../src/db/db';
import { devicesRepository } from '../src/notifications/devices.repository';
import { enqueueDueReminders } from '../src/notifications/reminders';
import { tick } from '../src/notifications/tick';
import {
  bearer, createGroup, createProposal, DEADLINE, dateOf, fakePush, joinGroup, makeClock, makeTestApp, NOW, registerUser, voteFor, win, windowOf,
} from './helpers';

type Member = { token: string; user: User };

let app: Express;
let db: Db;
let clock: ReturnType<typeof makeClock>;
let yo: Member;
let ana: Member;
let carlos: Member;
let group: Group;

const MINUTE = 60_000;
const SECRET = 's'.repeat(40);
// El plan empieza el miércoles de la semana siguiente a las 11:00 (Lima).
const START = instant(dateOf(3), '11:00');
const before = (minutes: number) => new Date(START.getTime() - minutes * MINUTE);

beforeEach(async () => {
  clock = makeClock(NOW);
  ({ app, db } = await makeTestApp({ now: clock.now }));
  yo = await registerUser(app, { name: 'Yo' });
  ana = await registerUser(app, { name: 'Ana' });
  carlos = await registerUser(app, { name: 'Carlos' });
  group = await createGroup(app, yo.token);
  await joinGroup(app, ana.token, group.inviteCode);
  await joinGroup(app, carlos.token, group.inviteCode);
});

async function confirmedPlan(): Promise<Proposal> {
  const p = await createProposal(app, yo.token, group.id, {
    title: 'Reunión de avance',
    votingDeadline: DEADLINE,
    windows: [win(3, '11:00', '13:00'), win(6, '11:00', '13:00')],
  });
  await voteFor(app, p.id, windowOf(p, 3).id, yo.token);
  const res = await request(app).post(`/api/proposals/${p.id}/confirm`).set(bearer(yo.token)).send({});
  if (res.status !== 200) throw new Error(`confirmar falló: ${res.status}`);
  return res.body;
}

const reminders = () =>
  db.many<{ user_id: string; dedupe_key: string; body: string }>(
    "SELECT user_id, dedupe_key, body FROM notifications WHERE kind = 'REMINDER' ORDER BY user_id",
  );
const kinds = async () => (await db.many<{ kind: string }>('SELECT kind FROM notifications ORDER BY seq')).map((r) => r.kind);

describe('enqueueDueReminders', () => {
  it('plan confirmado que empieza en 30 min: un REMINDER a cada miembro; dos pasadas seguidas, una sola fila por persona', async () => {
    const p = await confirmedPlan();
    expect(await enqueueDueReminders(db, before(30))).toBe(3);
    expect(await enqueueDueReminders(db, before(29))).toBe(0);
    const rows = await reminders();
    expect(rows.map((r) => r.user_id).sort()).toEqual([yo, ana, carlos].map((m) => m.user.id).sort());
    expect(rows[0]!.dedupe_key).toBe(`reminder:${p.id}:${rows[0]!.user_id}:${START.toISOString()}`);
    expect(rows[0]!.body).toContain('empieza a las 11:00');
  });

  it('quien reportó FALTA no recibe; con TARDANZA sí', async () => {
    const p = await confirmedPlan();
    await request(app).post(`/api/proposals/${p.id}/incidences`).set(bearer(ana.token)).send({ type: 'FALTA', reason: 'Enferma' }).expect(201);
    await request(app).post(`/api/proposals/${p.id}/incidences`).set(bearer(carlos.token)).send({ type: 'TARDANZA', reason: 'Tráfico', delayMinutes: 10 }).expect(201);
    await enqueueDueReminders(db, before(30));
    expect((await reminders()).map((r) => r.user_id).sort()).toEqual([yo, carlos].map((m) => m.user.id).sort());
  });

  it('empieza en 61 min: nada; en 60: sí; ya empezado: nada', async () => {
    await confirmedPlan();
    expect(await enqueueDueReminders(db, before(61))).toBe(0);
    expect(await enqueueDueReminders(db, START)).toBe(0);
    expect(await enqueueDueReminders(db, new Date(START.getTime() + MINUTE))).toBe(0);
    expect(await enqueueDueReminders(db, before(60))).toBe(3);
  });

  it('un plan que no está CONFIRMADO no avisa', async () => {
    const p = await confirmedPlan();
    await db.query("UPDATE proposals SET state = 'CANCELADO' WHERE id = $1", [p.id]);
    expect(await enqueueDueReminders(db, before(30))).toBe(0);
  });

  it('reconfirmado para otra hora: otro recordatorio', async () => {
    const p = await confirmedPlan();
    await enqueueDueReminders(db, before(30));
    const other = new Date(START.getTime() + 2 * 60 * MINUTE).toISOString();
    await db.query('UPDATE proposals SET scheduled_at = $2 WHERE id = $1', [p.id, other]);
    expect(await enqueueDueReminders(db, new Date(START.getTime() + 90 * MINUTE))).toBe(3);
    expect(await reminders()).toHaveLength(6);
  });
});

describe('tick', () => {
  it('propuesta vencida con votos: se cierra y el cliente recibe PLAN_CONFIRMED', async () => {
    const p = await createProposal(app, yo.token, group.id, {
      title: 'Plan', votingDeadline: DEADLINE, windows: [win(3, '11:00', '13:00'), win(6, '11:00', '13:00')],
    });
    await voteFor(app, p.id, windowOf(p, 3).id, ana.token);
    await devicesRepository(db).upsert(ana.user.id, 'ExponentPushToken[ana]', NOW);
    const push = fakePush();
    const at = new Date(new Date(DEADLINE).getTime() + MINUTE);
    const result = await tick(db, push, at);
    expect(result.closed).toBe(1);
    expect(result.sent).toBeGreaterThanOrEqual(1);
    expect(push.calls.flat().map((m) => m.data.kind)).toContain('PLAN_CONFIRMED');
  });

  it('votación exprés vencida: EXPRESS_RESULT', async () => {
    const p = await confirmedPlan();
    await request(app).post(`/api/proposals/${p.id}/incidences`).set(bearer(yo.token)).send({ type: 'FALTA', reason: 'Enfermo' }).expect(201);
    await devicesRepository(db).upsert(ana.user.id, 'ExponentPushToken[ana]', NOW);
    const push = fakePush();
    const result = await tick(db, push, new Date(NOW.getTime() + 61 * MINUTE));
    expect(result.closed).toBe(1);
    expect(await kinds()).toContain('EXPRESS_RESULT');
    expect(push.calls.flat().map((m) => m.data.kind)).toContain('EXPRESS_RESULT');
  });

  it('manda el recordatorio y cuenta lo enviado', async () => {
    await confirmedPlan();
    await devicesRepository(db).upsert(ana.user.id, 'ExponentPushToken[ana]', NOW);
    const push = fakePush();
    const result = await tick(db, push, before(30));
    expect(result.reminders).toBe(3);
    expect(push.calls.flat().filter((m) => m.data.kind === 'REMINDER')).toHaveLength(1);
  });

  it('nunca lanza: con la base rota devuelve ceros', async () => {
    await db.close();
    await expect(tick(db, fakePush(), NOW)).resolves.toEqual({ closed: 0, reminders: 0, sent: 0 });
  });
});

describe('POST /api/internal/tick', () => {
  it('sin cronSecret la ruta no existe: 404', async () => {
    await request(app).post('/api/internal/tick').set(bearer(SECRET)).expect(404);
  });

  it('con secreto: cabecera ausente o incorrecta → 401; correcta → 200 con los conteos', async () => {
    ({ app, db } = await makeTestApp({ now: clock.now, push: fakePush(), cronSecret: SECRET }));
    const noAuth = await request(app).post('/api/internal/tick');
    expect([noAuth.status, noAuth.body.error.code, noAuth.body.error.message]).toEqual([401, 'UNAUTHORIZED', 'No autorizado.']);
    await request(app).post('/api/internal/tick').set(bearer('x'.repeat(40))).expect(401);
    await request(app).post('/api/internal/tick').set(bearer('corto')).expect(401);
    await request(app).post('/api/internal/tick').set('Authorization', SECRET).expect(401);
    const ok = await request(app).post('/api/internal/tick').set(bearer(SECRET));
    expect([ok.status, ok.body]).toEqual([200, { closed: 0, reminders: 0, sent: 0 }]);
  });

  it('sin push en las deps también responde 200', async () => {
    ({ app, db } = await makeTestApp({ now: clock.now, cronSecret: SECRET }));
    await request(app).post('/api/internal/tick').set(bearer(SECRET)).expect(200);
  });
});
