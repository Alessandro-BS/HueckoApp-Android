import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import type { AiClient, AiRequest } from '../src/ai/ai-client';
import { askAi, type AiCallOutcome } from '../src/ai/ask-ai';
import type { Db } from '../src/db/database';
import { bearer, createProposal, DEADLINE, failingAi, fakeAi, fakeAiJson, makeTestApp, NOW, setupSeedGroup } from './helpers';

const REQUEST: AiRequest = { task: 'voting-summary', prompt: 'Resume la votación', schema: { type: 'object' } };
const schema = z.object({ answer: z.string() });

const recorder = () => {
  const outcomes: AiCallOutcome[] = [];
  return { outcomes, record: (outcome: AiCallOutcome) => void outcomes.push(outcome) };
};

describe('askAi anota cada llamada (D6)', () => {
  it('respuesta válida → una anotación ok con su tarea y una duración ≥ 0', async () => {
    const { outcomes, record } = recorder();
    await askAi(fakeAi('{"answer":"sí"}').client, REQUEST, schema, record);
    expect(outcomes).toEqual([{ task: 'voting-summary', ok: true, durationMs: expect.any(Number) }]);
    expect(outcomes[0].durationMs).toBeGreaterThanOrEqual(0);
  });

  it.each([
    ['el proveedor falla (503)', () => failingAi(), 503],
    ['no es JSON (502)', () => fakeAi('hola').client, 502],
    ['JSON fuera del esquema (502)', () => fakeAi('{"answer": 3}').client, 502],
  ])('%s → una anotación con ok false', async (_label, client, status) => {
    const { outcomes, record } = recorder();
    await expect(askAi(client(), REQUEST, schema, record)).rejects.toMatchObject({ status });
    expect(outcomes).toEqual([{ task: 'voting-summary', ok: false, durationMs: expect.any(Number) }]);
  });

  it('si anotar falla, la respuesta de la IA llega igual', async () => {
    const record = vi.fn(() => {
      throw new Error('disco lleno');
    });
    await expect(askAi(fakeAi('{"answer":"sí"}').client, REQUEST, schema, record)).resolves.toEqual({ answer: 'sí' });
    expect(record).toHaveBeenCalledTimes(1);
  });
});

type CallRow = { user_id: string | null; task: string; ok: number; duration_ms: number; created_at: string };
const aiCalls = (db: Db) =>
  (db.prepare('SELECT user_id, task, ok, duration_ms, created_at FROM ai_calls ORDER BY id').all() as CallRow[]).map((r) => ({ ...r }));

const SUMMARY = { summary: 'Votó 1 de 2 integrantes.', recommendation: 'CONFIRMAR', reason: 'Hay una franja clara.' };

async function groupWithPlan(ai?: AiClient) {
  const { app, db } = makeTestApp({ now: () => NOW, ai });
  const { yo, group } = await setupSeedGroup(app);
  const plan = await createProposal(app, yo.token, group.id, { votingDeadline: DEADLINE });
  return { app, db, yo, group, plan };
}

describe('las rutas de IA guardan quién, qué función, si salió bien, cuánto tardó y cuándo', () => {
  it('resumen correcto → una fila con ok 1, el usuario y la hora del reloj de la app', async () => {
    const { app, db, yo, plan } = await groupWithPlan(fakeAiJson(SUMMARY).client);
    expect((await request(app).post(`/api/proposals/${plan.id}/ai/summary`).set(bearer(yo.token))).status).toBe(200);
    expect(aiCalls(db)).toEqual([
      { user_id: yo.user.id, task: 'voting-summary', ok: 1, duration_ms: expect.any(Number), created_at: NOW.toISOString() },
    ]);
  });

  it('con la IA caída la ruta responde 503 y la fila queda con ok 0', async () => {
    const { app, db, yo, plan } = await groupWithPlan(failingAi());
    expect((await request(app).post(`/api/proposals/${plan.id}/ai/summary`).set(bearer(yo.token))).status).toBe(503);
    expect(aiCalls(db).map((r) => [r.task, r.ok])).toEqual([['voting-summary', 0]]);
  });

  it('lo que no llega a la IA no se registra (plan cancelado → 409)', async () => {
    const { app, db, yo, plan } = await groupWithPlan(fakeAiJson(SUMMARY).client);
    await request(app).post(`/api/proposals/${plan.id}/cancel`).set(bearer(yo.token)).expect(200);
    expect((await request(app).post(`/api/proposals/${plan.id}/ai/summary`).set(bearer(yo.token))).status).toBe(409);
    expect(aiCalls(db)).toEqual([]);
  });

  it('ideas y borrador también anotan su función (modo demostración)', async () => {
    const { app, db, yo, group } = await groupWithPlan();
    await request(app).post(`/api/groups/${group.id}/ai/suggestions`).set(bearer(yo.token)).expect(200);
    await request(app).post(`/api/groups/${group.id}/ai/proposal-draft`).set(bearer(yo.token)).send({ text: 'Estudiar el martes' }).expect(200);
    expect(aiCalls(db).map((r) => [r.task, r.ok, r.user_id])).toEqual([
      ['plan-suggestions', 1, yo.user.id],
      ['proposal-draft', 1, yo.user.id],
    ]);
  });
});
