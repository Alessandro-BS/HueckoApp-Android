import type { Group, User } from '@hueckoapp/shared';
import type { Express } from 'express';
import request from 'supertest';

import { createApp } from '../src/app';
import { openDatabase, type Db } from '../src/db/database';

export const TEST_SECRET = 'secreto-de-pruebas-con-mas-de-32-caracteres';

export const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

// «Ahora» fijo de los tests de propuestas: martes 29 de septiembre de 2026, 10:00, hora local.
export const NOW = new Date(2026, 8, 29, 10, 0);
// Plazo de votación válido respecto a NOW (sábado 3 de octubre, 20:00).
export const DEADLINE = new Date(2026, 9, 3, 20, 0).toISOString();

export function makeTestApp(options?: { authRateLimit?: number; now?: () => Date }): { app: Express; db: Db } {
  const db = openDatabase(':memory:');
  const app = createApp({
    db,
    jwtSecret: TEST_SECRET,
    jwtExpiresIn: '1h',
    authRateLimit: options?.authRateLimit ?? 10_000,
    now: options?.now,
  });
  return { app, db };
}

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
