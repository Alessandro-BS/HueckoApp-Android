import type { Group, User } from '@hueckoapp/shared';
import type { Express } from 'express';
import request from 'supertest';

import { createApp } from '../src/app';
import { openDatabase, type Db } from '../src/db/database';

export const TEST_SECRET = 'secreto-de-pruebas-con-mas-de-32-caracteres';

export const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

export function makeTestApp(options?: { authRateLimit?: number }): { app: Express; db: Db } {
  const db = openDatabase(':memory:');
  const app = createApp({
    db,
    jwtSecret: TEST_SECRET,
    jwtExpiresIn: '1h',
    authRateLimit: options?.authRateLimit ?? 10_000,
  });
  return { app, db };
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
