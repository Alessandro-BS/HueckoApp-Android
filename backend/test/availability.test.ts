import type { TimeBlockInput } from '@hueckoapp/shared';
import type { Express } from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';

import { bearer, createGroup, joinGroup, makeTestApp, registerUser } from './helpers';

let app: Express;
beforeEach(async () => {
  ({ app } = await makeTestApp());
});

async function addBlock(token: string, block: Partial<TimeBlockInput>) {
  const body: TimeBlockInput = {
    label: 'Bloque', type: 'CLASE', startTime: '08:00', endTime: '10:00',
    isRecurring: true, dayOfWeek: 1, date: null, ...block,
  };
  const res = await request(app).post('/api/me/time-blocks').set(bearer(token)).send(body);
  if (res.status !== 201) throw new Error(`bloque falló: ${res.status} ${JSON.stringify(res.body)}`);
}

const availability = (groupId: string, token: string) =>
  request(app).get(`/api/groups/${groupId}/availability`).set(bearer(token));

const full = (dayOfWeek: number, startTime = '08:00', endTime = '20:00', availabilityPercentage = 100, freeMembers = 2) => ({
  dayOfWeek, startTime, endTime, availabilityPercentage, freeMembers,
});

describe('GET /api/groups/:id/availability', () => {
  it('cruza los horarios recurrentes de los miembros (E3 de la spec con usuarios reales)', async () => {
    const yo = await registerUser(app);
    const ana = await registerUser(app);
    const group = await createGroup(app, yo.token);
    await joinGroup(app, ana.token, group.inviteCode);
    await addBlock(yo.token, { dayOfWeek: 1, startTime: '08:00', endTime: '10:00' });
    await addBlock(yo.token, { dayOfWeek: 3, startTime: '14:00', endTime: '16:00' });
    await addBlock(ana.token, { dayOfWeek: 1, startTime: '08:00', endTime: '12:00' });
    await addBlock(ana.token, { dayOfWeek: 3, startTime: '15:00', endTime: '19:00' });
    await addBlock(ana.token, { dayOfWeek: 5, startTime: '09:00', endTime: '11:00' });

    const res = await availability(group.id, yo.token);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([
      full(1, '12:00'),
      full(2),
      full(3, '08:00', '14:00'),
      full(3, '19:00'),
      full(4),
      full(5, '08:00', '09:00'),
      full(5, '11:00'),
      full(6),
      full(7),
    ]);
  });

  it('no cuentan los bloques LIBRE, los puntuales ni los de quien no es miembro', async () => {
    const yo = await registerUser(app);
    const ana = await registerUser(app);
    const fuera = await registerUser(app);
    const group = await createGroup(app, yo.token);
    await joinGroup(app, ana.token, group.inviteCode);
    await addBlock(ana.token, { type: 'LIBRE', dayOfWeek: 2, startTime: '08:00', endTime: '20:00' });
    await addBlock(ana.token, {
      type: 'PUNTUAL', isRecurring: false, dayOfWeek: null, date: '2026-10-06', startTime: '08:00', endTime: '20:00',
    });
    await addBlock(fuera.token, { dayOfWeek: 2, startTime: '08:00', endTime: '20:00' });

    const res = await availability(group.id, yo.token);
    expect(res.body).toEqual([1, 2, 3, 4, 5, 6, 7].map((d) => full(d)));
  });

  it('usa el umbral del grupo', async () => {
    const yo = await registerUser(app);
    const ana = await registerUser(app);
    const group = await createGroup(app, yo.token, { availabilityThreshold: 50 });
    await joinGroup(app, ana.token, group.inviteCode);
    await addBlock(yo.token, { dayOfWeek: 1, startTime: '08:00', endTime: '20:00' });

    const res = await availability(group.id, yo.token);
    expect(res.body[0]).toEqual(full(1, '08:00', '20:00', 50, 1));
  });

  it('quien no es miembro → 403', async () => {
    const yo = await registerUser(app);
    const otra = await registerUser(app);
    const group = await createGroup(app, yo.token);
    expect((await availability(group.id, otra.token)).status).toBe(403);
  });
});
