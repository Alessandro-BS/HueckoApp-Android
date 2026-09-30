import type { Group, Proposal, ProposalInput, User } from '@hueckoapp/shared';
import type { Express } from 'express';
import request from 'supertest';

import type { AiClient, AiRequest } from '../src/ai/ai-client';
import { createApp } from '../src/app';
import { openDatabase, type Db } from '../src/db/database';

export const TEST_SECRET = 'secreto-de-pruebas-con-mas-de-32-caracteres';

export const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

// «Ahora» fijo de los tests de propuestas: martes 29 de septiembre de 2026, 10:00, hora local.
export const NOW = new Date(2026, 8, 29, 10, 0);
// Plazo de votación válido respecto a NOW (sábado 3 de octubre, 20:00).
export const DEADLINE = new Date(2026, 9, 3, 20, 0).toISOString();
// Un minuto después del plazo: la votación ya cerró.
export const AFTER_DEADLINE = new Date(2026, 9, 3, 20, 1);

export function makeTestApp(options?: {
  authRateLimit?: number;
  now?: () => Date;
  ai?: AiClient;
  aiRateLimit?: number;
}): { app: Express; db: Db } {
  const db = openDatabase(':memory:');
  const app = createApp({
    db,
    jwtSecret: TEST_SECRET,
    jwtExpiresIn: '1h',
    authRateLimit: options?.authRateLimit ?? 10_000,
    now: options?.now,
    // Sin `ai`, createApp usa el cliente de demostración (como un servidor sin GEMINI_API_KEY).
    ai: options?.ai,
    aiRateLimit: options?.aiRateLimit ?? 10_000,
  });
  return { app, db };
}

// IA falsa, sin red: responde `reply` (texto, o una función de la petición) y guarda cada petición en `calls`.
export function fakeAi(reply: string | ((request: AiRequest) => string)) {
  const calls: AiRequest[] = [];
  const client: AiClient = {
    provider: 'gemini',
    generateJson: async (request) => {
      calls.push(request);
      return typeof reply === 'string' ? reply : reply(request);
    },
  };
  return { client, calls };
}

export const fakeAiJson = (value: unknown) => fakeAi(JSON.stringify(value));

// IA que siempre falla, como un proveedor caído o una espera agotada.
export const failingAi = (): AiClient => ({
  provider: 'gemini',
  generateJson: async () => {
    throw new Error('tiempo de espera agotado');
  },
});

// Reloj que el test mueve a mano: makeTestApp({ now: clock.now }) y después clock.set(...).
export function makeClock(start: Date) {
  let current = start;
  return {
    now: () => current,
    set: (date: Date) => {
      current = date;
    },
  };
}

let counter = 0;
export async function registerUser(
  app: Express,
  overrides: Partial<{ name: string; email: string; password: string }> = {},
): Promise<{ token: string; user: User }> {
  counter += 1;
  const body = {
    name: `Usuario ${counter}`,
    email: `usuario${counter}@correo.com`,
    password: 'contrasena-segura',
    ...overrides,
  };
  const res = await request(app).post('/api/auth/register').send(body);
  if (res.status !== 201) throw new Error(`registro falló: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body;
}

export async function createGroup(
  app: Express,
  token: string,
  body: Partial<{ name: string; description: string; availabilityThreshold: number }> = {},
): Promise<Group> {
  const res = await request(app).post('/api/groups').set(bearer(token)).send({ name: 'Proyecto Integrador', ...body });
  if (res.status !== 201) throw new Error(`crear grupo falló: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body;
}

export async function joinGroup(app: Express, token: string, inviteCode: string): Promise<Group> {
  const res = await request(app).post('/api/groups/join').set(bearer(token)).send({ inviteCode });
  if (res.status !== 200) throw new Error(`unirse falló: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body;
}

export async function addWeeklyBlock(app: Express, token: string, dayOfWeek: number, startTime: string, endTime: string): Promise<void> {
  const res = await request(app)
    .post('/api/me/time-blocks')
    .set(bearer(token))
    .send({ label: 'Bloque', type: 'CLASE', startTime, endTime, isRecurring: true, dayOfWeek, date: null });
  if (res.status !== 201) throw new Error(`crear bloque falló: ${res.status} ${JSON.stringify(res.body)}`);
}

// Escenario de la semilla (domain spec §3.1) montado por la API: «Usuario de Prueba» (OWNER) y Ana
// en un grupo, cada uno con sus bloques. Con él, el cruce del grupo es exactamente el ejemplo E3.
export async function setupSeedGroup(app: Express) {
  const yo = await registerUser(app, { name: 'Usuario de Prueba' });
  const ana = await registerUser(app, { name: 'Ana' });
  const group = await createGroup(app, yo.token);
  await joinGroup(app, ana.token, group.inviteCode);
  await addWeeklyBlock(app, yo.token, 1, '08:00', '10:00');
  await addWeeklyBlock(app, yo.token, 3, '14:00', '16:00');
  await addWeeklyBlock(app, ana.token, 1, '08:00', '12:00');
  await addWeeklyBlock(app, ana.token, 3, '15:00', '19:00');
  await addWeeklyBlock(app, ana.token, 5, '09:00', '11:00');
  return { yo, ana, group };
}

export async function createProposal(
  app: Express,
  token: string,
  groupId: string,
  body: Partial<ProposalInput> & { votingDeadline: string },
): Promise<Proposal> {
  const res = await request(app).post(`/api/groups/${groupId}/proposals`).set(bearer(token)).send({ title: 'Plan', ...body });
  if (res.status !== 201) throw new Error(`crear propuesta falló: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body;
}

// Franja de una propuesta por su día de la semana.
export const windowOf = (p: Proposal, dayOfWeek: number) => p.windows.find((w) => w.dayOfWeek === dayOfWeek)!;

export const voteFor = (app: Express, proposalId: string, windowId: string, token: string) =>
  request(app).put(`/api/proposals/${proposalId}/vote`).set(bearer(token)).send({ windowId });

export const unvoteFor = (app: Express, proposalId: string, token: string) =>
  request(app).delete(`/api/proposals/${proposalId}/vote`).set(bearer(token));
