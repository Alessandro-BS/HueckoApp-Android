import type { AiTask, Group, Proposal, User } from '@hueckoapp/shared';
import type { Express } from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';

import type { AiClient, AiRequest } from '../src/ai/ai-client';
import { type ExpressRecommendationInput, expressRecommendationPrompt } from '../src/ai/express-recommendation';
import { MOCK_RESPONSES } from '../src/ai/mock-client';
import type { Db } from '../src/db/db';
import {
  bearer, createGroup, createProposal, DEADLINE, failingAi, fakeAiJson, joinGroup, makeClock, makeTestApp, NOW, registerUser, voteFor, win, windowOf,
} from './helpers';

type Member = { token: string; user: User };

let app: Express;
let db: Db;
let clock: ReturnType<typeof makeClock>;
let yo: Member;
let ana: Member;
let carlos: Member;
let group: Group;
let pending: Promise<void>[];

const REPLY = { option: 'REAGENDAR', reason: 'Sin quien propuso el plan conviene buscar otra fecha.' };
const settle = async () => {
  await Promise.all(pending);
};

async function setup(ai?: AiClient) {
  clock = makeClock(NOW);
  pending = [];
  ({ app, db } = await makeTestApp({ now: clock.now, ai, onBackgroundTask: (t) => pending.push(t) }));
  yo = await registerUser(app, { name: 'Yo', email: 'yo@correo.com' });
  ana = await registerUser(app, { name: 'Ana', email: 'ana@correo.com' });
  carlos = await registerUser(app, { name: 'Carlos', email: 'carlos@correo.com' });
  group = await createGroup(app, yo.token);
  await joinGroup(app, ana.token, group.inviteCode);
  await joinGroup(app, carlos.token, group.inviteCode);
}

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
const report = (p: Proposal, token: string, body: object) => request(app).post(`/api/proposals/${p.id}/incidences`).set(bearer(token)).send(body);
const getPlan = async (p: Proposal): Promise<Proposal> => (await request(app).get(`/api/proposals/${p.id}`).set(bearer(yo.token)).expect(200)).body;
const aiCalls = () => db.many<{ user_id: string; task: AiTask; ok: boolean }>('SELECT user_id, task, ok FROM ai_calls');

describe('recomendación de la IA en la votación exprés', () => {
  it('con el cliente simulado, tras reportar una ausencia crítica aparece la recomendación', async () => {
    await setup();
    const p = await confirmedPlan();
    const res = await report(p, yo.token, { type: 'FALTA', reason: 'Estoy enfermo' });
    expect(res.status).toBe(201);
    expect(res.body.expressVote.recommendation).toBeNull(); // todavía no llegó: se pide después de responder
    await settle();
    expect((await getPlan(p)).expressVote?.recommendation).toEqual(MOCK_RESPONSES['express-recommendation']);
  });

  it('guarda la opción y el motivo de la IA y anota la llamada con quien avisó', async () => {
    const fake = fakeAiJson(REPLY);
    await setup(fake.client);
    const p = await confirmedPlan();
    await report(p, yo.token, { type: 'FALTA', reason: 'Estoy enfermo' }).expect(201);
    await settle();
    expect((await getPlan(p)).expressVote?.recommendation).toEqual(REPLY);
    expect(await aiCalls()).toEqual([{ user_id: yo.user.id, task: 'express-recommendation', ok: true }]);
    expect(fake.calls).toHaveLength(1);
  });

  it('el prompt lleva el plan y el motivo, pero ningún correo', async () => {
    const fake = fakeAiJson(REPLY);
    await setup(fake.client);
    const p = await confirmedPlan();
    await report(p, yo.token, { type: 'FALTA', reason: 'Estoy enfermo' }).expect(201);
    await settle();
    const prompt = (fake.calls[0] as AiRequest).prompt;
    expect(prompt).toContain('Reunión de avance');
    expect(prompt).toContain('Estoy enfermo');
    expect(prompt).not.toMatch(/@|correo\.com/);
  });

  it('si la IA falla, reportar responde 201 y la recomendación queda en null', async () => {
    await setup(failingAi());
    const p = await confirmedPlan();
    await report(p, yo.token, { type: 'FALTA', reason: 'Estoy enfermo' }).expect(201);
    await settle();
    expect((await getPlan(p)).expressVote?.recommendation).toBeNull();
    expect(await aiCalls()).toEqual([{ user_id: yo.user.id, task: 'express-recommendation', ok: false }]);
  });

  it('una opción inválida no se guarda', async () => {
    await setup(fakeAiJson({ option: 'POSPONER', reason: 'x' }).client);
    const p = await confirmedPlan();
    await report(p, yo.token, { type: 'FALTA', reason: 'Estoy enfermo' }).expect(201);
    await settle();
    expect((await getPlan(p)).expressVote?.recommendation).toBeNull();
  });

  it('si la votación cierra antes de que llegue la respuesta, no se guarda', async () => {
    const slow: AiClient = {
      provider: 'gemini',
      generateJson: async () => {
        // Mientras la IA «piensa» vence el plazo y una consulta cierra la votación.
        clock.set(new Date(NOW.getTime() + 61 * 60_000));
        await getPlan(plan);
        return JSON.stringify(REPLY);
      },
    };
    await setup(slow);
    const plan = await confirmedPlan();
    await report(plan, yo.token, { type: 'FALTA', reason: 'Estoy enfermo' }).expect(201);
    await settle();
    const vote = (await getPlan(plan)).expressVote;
    expect(vote?.status).toBe('CERRADA');
    expect(vote?.recommendation).toBeNull();
  });

  it('una incidencia que no abre votación no llama a la IA', async () => {
    const fake = fakeAiJson(REPLY);
    await setup(fake.client);
    const p = await confirmedPlan();
    await report(p, carlos.token, { type: 'TARDANZA', reason: 'Tráfico', delayMinutes: 10 }).expect(201);
    await settle();
    expect(fake.calls).toHaveLength(0);
  });
});

describe('expressRecommendationPrompt', () => {
  const input: ExpressRecommendationInput = {
    voteId: 'ev_1', planTitle: 'Reunión', location: null, startsAt: NOW.toISOString(), hoursLeft: 24,
    reason: 'Estoy enfermo', criticalReason: 'Propuso el plan', eligibleVoters: 2, defaultResult: 'MANTENER',
  };

  it('con 2 o más votantes el quórum es 2', () => {
    expect(expressRecommendationPrompt(input)).toContain('Si votan menos de 2 personas (el quórum), el resultado por defecto es MANTENER.');
    expect(expressRecommendationPrompt({ ...input, eligibleVoters: 5 })).toContain('menos de 2 personas');
  });

  it('con un solo votante el quórum es 1: el resultado por defecto solo aplica si nadie vota', () => {
    const prompt = expressRecommendationPrompt({ ...input, eligibleVoters: 1 });
    expect(prompt).toContain('Si nadie vota, el resultado por defecto es MANTENER.');
    expect(prompt).not.toContain('menos de 2');
  });
});
