import type { AuthResponse, Challenge, Group, Proposal, ProposalInput, TimeWindowInput, User } from '@hueckoapp/shared';
import type { Express } from 'express';
import request from 'supertest';
import { vi } from 'vitest';

import type { AiClient, AiRequest } from '../src/ai/ai-client';
import type { GoogleIdentity, GoogleVerifier } from '../src/auth/google-verifier';
import type { TrustProxy } from '../src/config/trust-proxy';
import { createApp } from '../src/app';
import { addDays } from '../src/common/zone';
import type { Db, SqlParam } from '../src/db/db';
import { type EmailClient, type EmailMessage, EmailSendError } from '../src/email/email-client';
import { type PushClient, type PushMessage, type PushTicket, PushTransportError } from '../src/notifications/push-client';
import { openTestDatabase } from './db';

export const TEST_SECRET = 'secreto-de-pruebas-con-mas-de-32-caracteres';

export const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

// «Ahora» fijo de los tests de propuestas: martes 29 de septiembre de 2026, 10:00, hora local.
export const NOW = new Date(2026, 8, 29, 10, 0);
// Plazo de votación válido respecto a NOW (sábado 3 de octubre, 20:00).
export const DEADLINE = new Date(2026, 9, 3, 20, 0).toISOString();
// Un minuto después del plazo: la votación ya cerró.
export const AFTER_DEADLINE = new Date(2026, 9, 3, 20, 1);
// Lunes de la semana siguiente a NOW: sus franjas empiezan todas después de DEADLINE.
export const NEXT_WEEK = '2026-10-05';
// Fecha de la semana siguiente a NOW con ese día de la semana (1 = lunes 5/10 … 7 = domingo 11/10).
export const dateOf = (dayOfWeek: number) => addDays(NEXT_WEEK, dayOfWeek - 1);
// Franja de la semana siguiente a NOW por su día de la semana.
export const win = (dayOfWeek: number, startTime: string, endTime: string): TimeWindowInput => ({ date: dateOf(dayOfWeek), startTime, endTime });

// Base PGlite nueva y migrada para un test (se cierra sola al terminar: test/setup.ts).
export const makeTestDb = (): Promise<Db> => openTestDatabase();

// El correo falso de cada app de makeTestApp: registerUser saca de ahí el código para verificar la cuenta.
const emailsOf = new WeakMap<Express, FakeEmail>();

export async function makeTestApp(options?: {
  /** Una base ya preparada (p. ej. con la semilla); sin ella, una nueva. */
  db?: Db;
  loginRateLimit?: number;
  registerRateLimit?: number;
  trustProxy?: TrustProxy;
  now?: () => Date;
  ai?: AiClient;
  aiRateLimit?: number;
  proximityRateLimit?: number;
  onBackgroundTask?: (task: Promise<void>) => void;
  push?: PushClient;
  cronSecret?: string;
  email?: EmailClient;
  codeRateLimit?: number;
  twoFactorRateLimit?: number;
  google?: GoogleVerifier;
  brevoDailyLimit?: number;
}): Promise<{ app: Express; db: Db; emails: FakeEmail }> {
  const db = options?.db ?? (await makeTestDb());
  const emails = fakeEmail();
  const app = createApp({
    db,
    jwtSecret: TEST_SECRET,
    jwtExpiresIn: '1h',
    loginRateLimit: options?.loginRateLimit ?? 10_000,
    registerRateLimit: options?.registerRateLimit ?? 10_000,
    trustProxy: options?.trustProxy,
    now: options?.now,
    // Sin `ai`, createApp usa el cliente de demostración (como un servidor sin GEMINI_API_KEY).
    ai: options?.ai,
    aiRateLimit: options?.aiRateLimit ?? 10_000,
    proximityRateLimit: options?.proximityRateLimit ?? 10_000,
    onBackgroundTask: options?.onBackgroundTask,
    // Sin `push` no se envía nada en segundo plano (la mayoría de los tests).
    push: options?.push,
    cronSecret: options?.cronSecret,
    // Sin `email`, el correo falso de `emails` (nunca se llama a Brevo).
    email: options?.email ?? emails,
    codeRateLimit: options?.codeRateLimit ?? 10_000,
    twoFactorRateLimit: options?.twoFactorRateLimit,
    google: options?.google,
    brevoDailyLimit: options?.brevoDailyLimit,
  });
  const client = options?.email ?? emails;
  if ('lastCodeTo' in client) emailsOf.set(app, client as FakeEmail);
  return { app, db, emails };
}

/**
 * Simula otra petición que se cuela entre la comprobación y la escritura (lo que en Neon pasa con dos conexiones y
 * PGlite, con una sola, no puede reproducir): justo antes de la primera consulta cuyo SQL cumpla `before`, ejecuta `sql`.
 */
export function interleave(db: Db, before: RegExp, sql: string, params: readonly SqlParam[] = []): void {
  const original = db.query.bind(db);
  interleaveWith(db, before, () => original(sql, params));
}

/** Como interleave, pero la otra petición es `run` (p. ej. un método de un repositorio con varias consultas). */
export function interleaveWith(db: Db, before: RegExp, run: () => Promise<unknown>): void {
  const original = db.query.bind(db);
  let done = false;
  vi.spyOn(db, 'query').mockImplementation((async (text: string, values?: readonly SqlParam[]) => {
    if (!done && before.test(text)) {
      done = true;
      await run();
    }
    return original(text, values);
  }) as Db['query']);
}

/**
 * Anota cada consulta hecha con `db` (query, many, one y exec), en orden y con si iba dentro de una transacción. Para
 * comprobar que una defensa contra carreras (candado, FOR UPDATE) es lo primero de su transacción.
 */
export function recordQueries(db: Db): { sql: string; params: readonly SqlParam[]; inTransaction: boolean }[] {
  const calls: { sql: string; params: readonly SqlParam[]; inTransaction: boolean }[] = [];
  const query = db.query.bind(db);
  const exec = db.exec.bind(db);
  vi.spyOn(db, 'query').mockImplementation((async (sql: string, params: readonly SqlParam[] = []) => {
    calls.push({ sql, params, inTransaction: db.inTransaction });
    return query(sql, params);
  }) as Db['query']);
  vi.spyOn(db, 'exec').mockImplementation(async (sql: string) => {
    calls.push({ sql, params: [], inTransaction: db.inTransaction });
    return exec(sql);
  });
  return calls;
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

/**
 * Qué responde el Expo falso a cada mensaje: ticket ok, ticket de error DeviceNotRegistered o MessageRateExceeded, o
 * el lote entero falla (red/429/5xx).
 */
export type FakePushReply = 'ok' | 'DeviceNotRegistered' | 'MessageRateExceeded' | 'transport';
export type FakePushBehaviour = FakePushReply | ((message: PushMessage) => FakePushReply);
export type FakePush = PushClient & { calls: PushMessage[][]; reply(next: FakePushBehaviour): void };

/**
 * Expo falso, sin red: es un PushClient (makeTestApp({ push: fakePush() })) que guarda cada lote recibido en `calls`
 * (también los que fallan) y responde según `behaviour`, que `reply(...)` cambia a mitad del test.
 */
export function fakePush(behaviour: FakePushBehaviour = 'ok'): FakePush {
  const replyOf = (b: FakePushBehaviour) => (typeof b === 'function' ? b : () => b);
  let reply = replyOf(behaviour);
  let ticketCount = 0;
  const calls: PushMessage[][] = [];
  return {
    calls,
    reply(next) {
      reply = replyOf(next);
    },
    async send(messages) {
      calls.push([...messages]);
      const replies = messages.map((m) => reply(m));
      if (replies.includes('transport')) throw new PushTransportError('Expo respondió 503');
      return messages.map((m, i): PushTicket => {
        if (replies[i] === 'ok') return { status: 'ok', id: `ticket-${++ticketCount}` };
        if (replies[i] === 'MessageRateExceeded') {
          return { status: 'error', message: `"${m.to}" is receiving too many messages`, details: { error: 'MessageRateExceeded' } };
        }
        return { status: 'error', message: `"${m.to}" is not a registered push notification recipient`, details: { error: 'DeviceNotRegistered' } };
      });
    },
  };
}

export type FakeEmail = EmailClient & { sent: EmailMessage[]; attempted: EmailMessage[]; fail(next: boolean): void; lastCodeTo(email: string): string };

/**
 * Correo falso, sin red: guarda cada mensaje en `sent`; con `fail(true)` los envíos lanzan EmailSendError (Brevo caído)
 * hasta `fail(false)`. `attempted` guarda todos los intentos, también los que fallaron (con el código que nunca llegó).
 * `lastCodeTo` saca el código de 6 dígitos del asunto del último correo enviado a ese destinatario.
 */
export function fakeEmail(): FakeEmail {
  const sent: EmailMessage[] = [];
  const attempted: EmailMessage[] = [];
  let failing = false;
  return {
    sent,
    attempted,
    fail(next) {
      failing = next;
    },
    async send(message) {
      attempted.push(message);
      if (failing) throw new EmailSendError('Brevo respondió 503');
      sent.push(message);
    },
    lastCodeTo(email) {
      const last = [...sent].reverse().find((m) => m.to === email);
      const code = last?.subject.match(/\b(\d{6})\b/)?.[1];
      if (!code) throw new Error(`no hay un correo con código para ${email}`);
      return code;
    },
  };
}

// Google falso, sin red: el idToken es la clave de `identities`; uno desconocido es inválido (null).
export const fakeGoogle = (identities: Record<string, GoogleIdentity>): GoogleVerifier => ({
  verify: async (idToken) => identities[idToken] ?? null,
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

/** Registra una cuenta por la API y la deja sin verificar: devuelve el reto VERIFY_EMAIL y los datos usados. */
export async function registerUnverified(
  app: Express,
  overrides: Partial<{ name: string; email: string; password: string }> = {},
): Promise<{ challenge: Challenge; email: string; password: string }> {
  counter += 1;
  const body = {
    name: `Usuario ${counter}`,
    email: `usuario${counter}@correo.com`,
    password: 'contrasena-segura',
    ...overrides,
  };
  const res = await request(app).post('/api/auth/register').send(body);
  if (res.status !== 201) throw new Error(`registro falló: ${res.status} ${JSON.stringify(res.body)}`);
  // El correo como lo guarda el servidor (trim y minúsculas): es a donde llega el código.
  return { challenge: res.body.challenge, email: body.email.trim().toLowerCase(), password: body.password };
}

/**
 * Registra una cuenta y la verifica con el código del correo falso (como haría la app): devuelve su sesión. El `user`
 * queda como `User` (sin `role` ni los datos de la cuenta), que es como aparece en miembros y propuestas: así los tests
 * comparan con toEqual.
 */
export async function registerUser(
  app: Express,
  overrides: Partial<{ name: string; email: string; password: string }> = {},
): Promise<{ token: string; user: User }> {
  const emails = emailsOf.get(app);
  if (!emails) throw new Error('registerUser necesita una app de makeTestApp con el correo falso');
  const { challenge, email } = await registerUnverified(app, overrides);
  const res = await request(app).post(`/api/auth/challenges/${challenge.id}/verify`).send({ code: emails.lastCodeTo(email) });
  if (res.status !== 200) throw new Error(`verificar el correo falló: ${res.status} ${JSON.stringify(res.body)}`);
  const { token, user: current } = res.body as AuthResponse;
  return { token, user: { id: current.id, name: current.name, email: current.email } };
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

// Escenario de la semilla (domain spec §3.1) montado por la API: «Usuario de Prueba» (ORGANIZER) y Ana
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
  // Sin franjas, las 3 mejores se buscan en la semana siguiente a NOW (las de esta semana empiezan antes de DEADLINE).
  const week = body.windows?.length ? undefined : NEXT_WEEK;
  const res = await request(app).post(`/api/groups/${groupId}/proposals`).set(bearer(token)).send({ title: 'Plan', week, ...body });
  if (res.status !== 201) throw new Error(`crear propuesta falló: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body;
}

// Franja de una propuesta por su día de la semana.
export const windowOf = (p: Proposal, dayOfWeek: number) => p.windows.find((w) => w.dayOfWeek === dayOfWeek)!;

export const voteFor = (app: Express, proposalId: string, windowId: string, token: string) =>
  request(app).put(`/api/proposals/${proposalId}/vote`).set(bearer(token)).send({ windowId });

export const unvoteFor = (app: Express, proposalId: string, token: string) =>
  request(app).delete(`/api/proposals/${proposalId}/vote`).set(bearer(token));
