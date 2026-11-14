import type { Dashboard, Group, Proposal, User } from '@hueckoapp/shared';
import type { Express } from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';

import { instant } from '../src/common/zone';
import type { Db } from '../src/db/db';
import { expressVotesRepository } from '../src/proposals/express-votes.repository';
import {
  bearer,
  createGroup,
  createProposal,
  DEADLINE,
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

type Member = { token: string; user: User };

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
  group = await createGroup(app, yo.token);
  await joinGroup(app, ana.token, group.inviteCode);
  await joinGroup(app, carlos.token, group.inviteCode);
});

const post = (path: string, token: string, body: object = {}) => request(app).post(`/api/proposals/${path}`).set(bearer(token)).send(body);
const report = (p: Proposal, token: string, body: object) => post(`${p.id}/incidences`, token, body);
const expressVote = (p: Proposal, token: string, option: unknown) =>
  request(app).put(`/api/proposals/${p.id}/express-vote`).set(bearer(token)).send({ option });
const getPlan = async (p: Proposal, token = yo.token): Promise<Proposal> =>
  (await request(app).get(`/api/proposals/${p.id}`).set(bearer(token)).expect(200)).body;
const leave = (token: string) => request(app).delete(`/api/groups/${group.id}/members/me`).set(bearer(token));

// Miércoles 7/10 11–13, creado por yo y confirmado (empieza mucho después de NOW: el plazo es NOW + 60 min).
async function confirmedPlan(creator: Member = yo, groupId = group.id): Promise<Proposal> {
  const p = await createProposal(app, creator.token, groupId, {
    title: 'Reunión de avance',
    votingDeadline: DEADLINE,
    windows: [win(3, '11:00', '13:00'), win(6, '11:00', '13:00')],
  });
  await voteFor(app, p.id, windowOf(p, 3).id, creator.token);
  const res = await post(`${p.id}/confirm`, creator.token);
  if (res.status !== 200) throw new Error(`confirmar falló: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body;
}

// Plan confirmado en el que yo (quien lo propuso) no puede ir: se abre la votación de Ana y Carlos.
async function planWithVote(): Promise<Proposal> {
  const p = await confirmedPlan();
  const res = await report(p, yo.token, { type: 'FALTA', reason: 'Estoy enfermo' });
  if (res.body.expressVote?.status !== 'ABIERTA') throw new Error(`reportar falló: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body;
}

const voteRows = (p: Proposal) => db.many<{ status: string; result: string | null }>('SELECT status, result FROM express_votes WHERE proposal_id = $1', [p.id]);

describe('POST /api/proposals/:id/incidences: ausencias críticas', () => {
  it('FALTA de quien propuso el plan: ALTA, con su razón, abre la votación y el plan sigue CONFIRMADO', async () => {
    const p = await confirmedPlan();
    const res = await report(p, yo.token, { type: 'FALTA', reason: 'Estoy enfermo' });
    expect(res.status).toBe(201);
    expect(res.body.state).toBe('CONFIRMADO');
    expect(res.body.incidences[0]).toMatchObject({ criticality: 'ALTA', criticalReason: 'propuso este plan', resolved: false });
    expect(res.body.expressVote).toMatchObject({
      status: 'ABIERTA',
      reportedBy: yo.user,
      reason: 'Estoy enfermo',
      criticalReason: 'propuso este plan',
      openedAt: NOW.toISOString(),
      expiresAt: later(60).toISOString(),
      counts: { CANCELAR: 0, REAGENDAR: 0, MANTENER: 0 },
      myVote: null,
      canVote: false,
      eligibleVoters: 2,
      quorum: 2,
      result: null,
      resultByDefault: null,
    });
    expect((await getPlan(p, ana.token)).expressVote?.canVote).toBe(true);
  });

  it('FALTA de un miembro común: MEDIA y sin votación; TARDANZA de quien propuso: tampoco abre', async () => {
    const p = await confirmedPlan();
    const falta = await report(p, ana.token, { type: 'FALTA', reason: 'Viaje' });
    expect(falta.status).toBe(201);
    expect(falta.body.incidences[0]).toMatchObject({ criticality: 'MEDIA', criticalReason: null });
    expect(falta.body.expressVote).toBeNull();
    const tarde = await report(p, yo.token, { type: 'TARDANZA', reason: 'Tráfico', delayMinutes: 15 });
    expect(tarde.body.incidences[1]).toMatchObject({ criticality: 'BAJA', criticalReason: null });
    expect(tarde.body.expressVote).toBeNull();
  });

  it('imprescindible y organizador del grupo también son críticos (en ese orden)', async () => {
    const p = await createProposal(app, ana.token, group.id, { title: 'De Ana', votingDeadline: DEADLINE, windows: [win(3, '11:00', '13:00'), win(6, '11:00', '13:00')] });
    await voteFor(app, p.id, windowOf(p, 3).id, ana.token);
    await post(`${p.id}/confirm`, ana.token).expect(200);
    await request(app).patch(`/api/groups/${group.id}/members/${carlos.user.id}`).set(bearer(yo.token)).send({ isEssential: true }).expect(200);
    const organizador = await report(p, yo.token, { type: 'IMPREVISTO', reason: 'Examen' });
    expect(organizador.body.incidences[0]).toMatchObject({ criticality: 'ALTA', criticalReason: 'es organizador del grupo' });
    const imprescindible = await report(p, carlos.token, { type: 'FALTA', reason: 'Enfermo' });
    expect(imprescindible.body.incidences[1]).toMatchObject({ criticality: 'ALTA', criticalReason: 'el grupo lo marcó como imprescindible' });
  });

  it('la FALTA de un segundo organizador (no creó el plan ni es imprescindible) es ALTA y abre la votación', async () => {
    // Carlos pasa a organizador directamente en la base (aún no hay endpoint para nombrarlo).
    await db.query("UPDATE group_members SET role = 'ORGANIZER' WHERE group_id = $1 AND user_id = $2", [group.id, carlos.user.id]);
    const p = await confirmedPlan(ana);
    const res = await report(p, carlos.token, { type: 'FALTA', reason: 'Viaje' });
    expect(res.status).toBe(201);
    expect(res.body.incidences[0]).toMatchObject({ criticality: 'ALTA', criticalReason: 'es organizador del grupo' });
    expect(res.body.expressVote).toMatchObject({ status: 'ABIERTA', criticalReason: 'es organizador del grupo' });
  });

  it('segunda ausencia crítica con una votación abierta: se guarda (201) y sigue habiendo una sola votación', async () => {
    const p = await planWithVote();
    await request(app).patch(`/api/groups/${group.id}/members/${ana.user.id}`).set(bearer(yo.token)).send({ isEssential: true }).expect(200);
    const res = await report(p, ana.token, { type: 'FALTA', reason: 'Yo tampoco puedo' });
    expect(res.status).toBe(201);
    expect(res.body.incidences.map((i: { criticalReason: string }) => i.criticalReason)).toEqual(['propuso este plan', 'el grupo lo marcó como imprescindible']);
    expect(res.body.expressVote.reportedBy).toEqual(yo.user);
    expect(await voteRows(p)).toEqual([{ status: 'ABIERTA', result: null }]);
  });

  it('quien avisa está solo en el grupo: la ausencia es crítica pero no se abre votación', async () => {
    const solo = await registerUser(app, { name: 'Solo' });
    const suyo = await createGroup(app, solo.token, { name: 'Solo yo' });
    const p = await confirmedPlan(solo, suyo.id);
    const res = await report(p, solo.token, { type: 'FALTA', reason: 'Me enfermé' });
    expect(res.status).toBe(201);
    expect(res.body.incidences[0]).toMatchObject({ criticality: 'ALTA', criticalReason: 'propuso este plan' });
    expect(res.body.expressVote).toBeNull();
    expect(await voteRows(p)).toEqual([]);
  });

  it('409 INVALID_STATE con la franja confirmada ya terminada', async () => {
    const p = await confirmedPlan();
    clock.set(instant('2026-10-07', '13:00'));
    const res = await report(p, ana.token, { type: 'FALTA', reason: 'Tarde' });
    expect([res.status, res.body.error.code, res.body.error.message]).toEqual([
      409, 'INVALID_STATE', 'Solo se pueden reportar imprevistos de un plan confirmado.',
    ]);
    // Durante la franja todavía se puede.
    clock.set(instant('2026-10-07', '12:59'));
    expect((await report(p, ana.token, { type: 'TARDANZA', reason: 'Tráfico', delayMinutes: 5 })).status).toBe(201);
  });

  it('el plazo no pasa del inicio del plan, pero dura al menos 5 minutos', async () => {
    const p = await confirmedPlan();
    clock.set(new Date(instant('2026-10-07', '11:00').getTime() - 2 * MINUTE));
    const res = await report(p, yo.token, { type: 'FALTA', reason: 'Estoy enfermo' });
    expect(res.body.expressVote.expiresAt).toBe(new Date(clock.now().getTime() + 5 * MINUTE).toISOString());
  });
});

describe('PUT /api/proposals/:id/express-vote', () => {
  it('votar y cambiar el voto; el recuento lo ven todos', async () => {
    const p = await planWithVote();
    const first = await expressVote(p, ana.token, 'CANCELAR');
    expect(first.status).toBe(200);
    expect(first.body.expressVote).toMatchObject({ status: 'ABIERTA', myVote: 'CANCELAR', counts: { CANCELAR: 1, REAGENDAR: 0, MANTENER: 0 } });
    const changed = await expressVote(p, ana.token, 'MANTENER');
    expect(changed.body.expressVote).toMatchObject({ myVote: 'MANTENER', counts: { CANCELAR: 0, REAGENDAR: 0, MANTENER: 1 } });
    expect((await getPlan(p, carlos.token)).expressVote).toMatchObject({ myVote: null, canVote: true, counts: { MANTENER: 1 } });
  });

  it('403 NOT_A_VOTER a quien avisó y a quien entró después; 400 con una opción inválida', async () => {
    const p = await planWithVote();
    const reporter = await expressVote(p, yo.token, 'CANCELAR');
    expect([reporter.status, reporter.body.error.code, reporter.body.error.message]).toEqual([403, 'NOT_A_VOTER', 'No puedes votar en esta votación.']);
    const dani = await registerUser(app, { name: 'Dani' });
    await joinGroup(app, dani.token, group.inviteCode);
    expect((await expressVote(p, dani.token, 'CANCELAR')).body.error.code).toBe('NOT_A_VOTER');
    const invalid = await expressVote(p, ana.token, 'POSPONER');
    expect([invalid.status, invalid.body.error.code]).toEqual([400, 'VALIDATION_ERROR']);
    expect((await expressVote(p, ana.token, undefined)).status).toBe(400);
  });

  it('409 VOTING_CLOSED sin votación, o con la votación vencida', async () => {
    const sinVotacion = await confirmedPlan();
    const none = await expressVote(sinVotacion, ana.token, 'CANCELAR');
    expect([none.status, none.body.error.code, none.body.error.message]).toEqual([409, 'VOTING_CLOSED', 'La votación ya cerró.']);
    const p = await planWithVote();
    clock.set(later(61));
    const expired = await expressVote(p, ana.token, 'CANCELAR');
    expect([expired.status, expired.body.error.code]).toEqual([409, 'VOTING_CLOSED']);
  });

  it('cierre anticipado: votan los dos que pueden CANCELAR → plan CANCELADO, votación CERRADA e incidencias resueltas', async () => {
    const p = await planWithVote();
    await expressVote(p, ana.token, 'CANCELAR').expect(200);
    const res = await expressVote(p, carlos.token, 'CANCELAR');
    expect(res.status).toBe(200);
    expect(res.body.state).toBe('CANCELADO');
    expect(res.body.expressVote).toMatchObject({ status: 'CERRADA', result: 'CANCELAR', resultByDefault: false, closedAt: NOW.toISOString(), canVote: false });
    expect(res.body.incidences.map((i: { resolved: boolean }) => i.resolved)).toEqual([true]);
    // Cerrada: ya no se vota.
    expect((await expressVote(p, ana.token, 'MANTENER')).body.error.code).toBe('VOTING_CLOSED');
  });

  it('REAGENDAR gana: EN_RECOORDINACION sin franja elegida ni fecha, sin votos de fecha; ahí no se reporta', async () => {
    const p = await planWithVote();
    await expressVote(p, ana.token, 'REAGENDAR').expect(200);
    const res = await expressVote(p, carlos.token, 'REAGENDAR');
    expect(res.body).toMatchObject({ state: 'EN_RECOORDINACION', chosenWindowId: null, scheduledAt: null, scheduledDate: null, myVoteWindowId: null });
    expect(res.body.expressVote).toMatchObject({ status: 'CERRADA', result: 'REAGENDAR' });
    expect(await db.one('SELECT COUNT(*) AS n FROM votes WHERE proposal_id = $1', [p.id])).toEqual({ n: 0 });
    const again = await report(p, ana.token, { type: 'FALTA', reason: 'x' });
    expect([again.status, again.body.error.code]).toEqual([409, 'INVALID_STATE']);
  });
});

describe('cierre al consultar', () => {
  it('vencida sin quórum: GET /proposals/:id la cierra con MANTENER por defecto y el plan sigue CONFIRMADO', async () => {
    const p = await planWithVote();
    await expressVote(p, ana.token, 'CANCELAR').expect(200);
    clock.set(later(59));
    expect((await getPlan(p)).expressVote?.status).toBe('ABIERTA');
    clock.set(later(61));
    const plan = await getPlan(p);
    expect(plan.state).toBe('CONFIRMADO');
    expect(plan.expressVote).toMatchObject({ status: 'CERRADA', result: 'MANTENER', resultByDefault: true, closedAt: later(61).toISOString() });
    expect(plan.incidences.map((i) => i.resolved)).toEqual([true]);
  });

  it('quien no es miembro no dispara el cierre: primero se comprueba el acceso', async () => {
    const p = await planWithVote();
    const ajeno = await registerUser(app, { name: 'Ajeno' });
    clock.set(later(61));
    await request(app).get(`/api/proposals/${p.id}`).set(bearer(ajeno.token)).expect(403);
    expect(await voteRows(p)).toEqual([{ status: 'ABIERTA', result: null }]);
  });

  it.each([
    ['GET /me/dashboard', () => '/api/me/dashboard'],
    ['GET /me/upcoming-plans', () => '/api/me/upcoming-plans'],
    ['GET /groups/:id/proposals', () => `/api/groups/${group.id}/proposals`],
  ])('%s cierra una votación vencida antes de responder', async (_name, path) => {
    const p = await planWithVote();
    clock.set(later(61));
    await request(app).get(path()).set(bearer(carlos.token)).expect(200);
    expect(await voteRows(p)).toEqual([{ status: 'CERRADA', result: 'MANTENER' }]);
  });

  describe('alerta de Inicio', () => {
    const alertOf = async (token: string) => ((await request(app).get('/api/me/dashboard').set(bearer(token)).expect(200)).body as Dashboard).expressAlert;

    it('con la votación abierta es VOTACION con quién la abrió, su motivo y cuándo vence', async () => {
      const p = await planWithVote();
      expect(await alertOf(carlos.token)).toMatchObject({
        proposalId: p.id, kind: 'VOTACION', who: 'Yo', reason: 'Estoy enfermo', expiresAt: later(60).toISOString(), canResolve: false, canVote: true,
      });
      // Quien avisó gestiona el plan pero no vota: la app le ofrece «Ver votación» en vez de «Votar».
      expect(await alertOf(yo.token)).toMatchObject({ canResolve: true, canVote: false });
    });

    it('vencida con REAGENDAR: Inicio ya muestra RECOORDINACION (se cerró antes de armarlo)', async () => {
      const p = await planWithVote();
      await expressVote(p, ana.token, 'REAGENDAR').expect(200);
      await expressVote(p, carlos.token, 'REAGENDAR').expect(200);
      clock.set(later(61));
      expect(await alertOf(carlos.token)).toMatchObject({ proposalId: p.id, kind: 'RECOORDINACION', expiresAt: null });
    });

    it('vencida sin votos: se mantiene el plan y la alerta desaparece', async () => {
      await planWithVote();
      clock.set(later(61));
      expect(await alertOf(carlos.token)).toBeNull();
    });
  });

  it('POST /incidences cierra antes de comprobar el estado: una REAGENDAR vencida ya no admite reportes', async () => {
    const dani = await registerUser(app, { name: 'Dani' });
    await joinGroup(app, dani.token, group.inviteCode);
    const p = await planWithVote();
    await expressVote(p, ana.token, 'REAGENDAR').expect(200);
    await expressVote(p, carlos.token, 'REAGENDAR').expect(200);
    clock.set(later(61));
    const res = await report(p, dani.token, { type: 'TARDANZA', reason: 'Tráfico', delayMinutes: 5 });
    expect([res.status, res.body.error.code]).toEqual([409, 'INVALID_STATE']);
    expect((await getPlan(p)).state).toBe('EN_RECOORDINACION');
  });

  it('Review Focus 1: dos cierres a la vez aplican el resultado una sola vez', async () => {
    const dani = await registerUser(app, { name: 'Dani' });
    await joinGroup(app, dani.token, group.inviteCode);
    const p = await planWithVote();
    await expressVote(p, ana.token, 'REAGENDAR').expect(200);
    await expressVote(p, carlos.token, 'REAGENDAR').expect(200);
    const votes = expressVotesRepository(db);
    const at = later(61);
    let other: boolean | undefined;
    // Otra lectura cierra la misma votación justo antes del UPDATE de cierre de esta.
    interleaveWith(db, /^UPDATE express_votes SET status = 'CERRADA'/, async () => {
      other = await votes.closeDue(p.id, at);
    });
    expect(await votes.closeDue(p.id, at)).toBe(false);
    expect(other).toBe(true);
    expect(await voteRows(p)).toEqual([{ status: 'CERRADA', result: 'REAGENDAR' }]);
    expect(await db.one('SELECT state, scheduled_at FROM proposals WHERE id = $1', [p.id])).toEqual({ state: 'EN_RECOORDINACION', scheduled_at: null });
  });

  it('closeDue no cierra una votación que ni venció ni tiene todos los votos', async () => {
    const p = await planWithVote();
    await expressVote(p, ana.token, 'CANCELAR').expect(200);
    expect(await expressVotesRepository(db).closeDue(p.id, later(30))).toBe(false);
    expect(await voteRows(p)).toEqual([{ status: 'ABIERTA', result: null }]);
  });

  it('Review Focus 3: quien sale del grupo ya no vota y deja de contar; con el voto de los demás cierra', async () => {
    const p = await planWithVote();
    await expressVote(p, carlos.token, 'MANTENER').expect(200);
    await leave(carlos.token).expect(204);
    expect((await expressVote(p, carlos.token, 'MANTENER')).status).toBe(403);
    expect((await getPlan(p, ana.token)).expressVote).toMatchObject({ eligibleVoters: 1, quorum: 1, counts: { MANTENER: 0 } });
    // Ana es la única votante que sigue: con su voto votaron todos y su opción tiene quórum.
    const res = await expressVote(p, ana.token, 'CANCELAR');
    expect(res.body.state).toBe('CANCELADO');
    expect(res.body.expressVote).toMatchObject({ status: 'CERRADA', result: 'CANCELAR', resultByDefault: false });
  });

  it('Review Focus 4: quien gestiona cancela con la votación abierta; al vencer se cierra y el plan sigue CANCELADO', async () => {
    const p = await planWithVote();
    await expressVote(p, ana.token, 'REAGENDAR').expect(200);
    await post(`${p.id}/cancel`, yo.token).expect(200);
    clock.set(later(61));
    const plan = await getPlan(p);
    expect(plan.state).toBe('CANCELADO');
    expect(plan.expressVote?.status).toBe('CERRADA');
  });

  it('una votación cerrada sin aplicar sobre un plan cancelado no lo resucita aunque se hubiera votado REAGENDAR', async () => {
    const p = await planWithVote();
    await post(`${p.id}/cancel`, yo.token).expect(200);
    // Votos que ya estaban (la API no admite votar con el plan cancelado): se guardan directo en la tabla.
    const votes = expressVotesRepository(db);
    await votes.castVote(p.expressVote!.id, ana.user.id, 'REAGENDAR', NOW.toISOString());
    await votes.castVote(p.expressVote!.id, carlos.user.id, 'REAGENDAR', NOW.toISOString());
    expect(await votes.closeDue(p.id, NOW)).toBe(true);
    const plan = await getPlan(p);
    expect(plan.state).toBe('CANCELADO');
    expect(plan.expressVote).toMatchObject({ status: 'CERRADA', result: 'REAGENDAR' });
  });

  it('409 VOTING_CLOSED al votar con la votación abierta en un plan que quien gestiona ya canceló; no se guarda el voto', async () => {
    const p = await planWithVote();
    await post(`${p.id}/cancel`, yo.token).expect(200);
    const res = await expressVote(p, ana.token, 'REAGENDAR');
    expect([res.status, res.body.error?.code]).toEqual([409, 'VOTING_CLOSED']);
    expect(await db.one('SELECT COUNT(*) AS n FROM express_vote_voters WHERE vote_id = $1 AND option IS NOT NULL', [p.expressVote!.id])).toEqual({ n: 0 });
  });
});

describe('POST /api/proposals/:id/incidences/resolve', () => {
  it('ya no existe: 404', async () => {
    const p = await planWithVote();
    expect((await post(`${p.id}/incidences/resolve`, yo.token, { newState: 'CANCELADO' })).status).toBe(404);
  });
});
