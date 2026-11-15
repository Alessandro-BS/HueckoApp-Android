import type { TimeBlockInput } from '@hueckoapp/shared';
import type { Express } from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';

import { bearer, createGroup, joinGroup, makeTestApp, registerUser } from './helpers';

// Lunes 9 de noviembre de 2026, 07:00 en Lima: la semana actual (9–15) está entera por delante.
const MONDAY_MORNING = new Date('2026-11-09T07:00:00-05:00');

let app: Express;
beforeEach(async () => {
  ({ app } = await makeTestApp({ now: () => MONDAY_MORNING }));
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
  date: `2026-11-${String(8 + dayOfWeek).padStart(2, '0')}`, dayOfWeek, startTime, endTime, availabilityPercentage, freeMembers,
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

  it('no cuentan los bloques LIBRE, los puntuales de otras semanas ni los de quien no es miembro', async () => {
    const yo = await registerUser(app);
    const ana = await registerUser(app);
    const fuera = await registerUser(app);
    const group = await createGroup(app, yo.token);
    await joinGroup(app, ana.token, group.inviteCode);
    await addBlock(ana.token, { type: 'LIBRE', dayOfWeek: 3, startTime: '08:00', endTime: '20:00' });
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

describe('GET /api/groups/:id/availability?week=', () => {
  // Martes 10 de noviembre de 2026, 07:00 en Lima: semanas válidas = lunes 9, 16, 23 y 30.
  const NOW_LIMA = new Date('2026-11-10T07:00:00-05:00');

  async function twoMembers() {
    ({ app } = await makeTestApp({ now: () => NOW_LIMA }));
    const yo = await registerUser(app);
    const ana = await registerUser(app);
    const group = await createGroup(app, yo.token, { availabilityThreshold: 50 });
    await joinGroup(app, ana.token, group.inviteCode);
    return { yo, ana, group };
  }
  const forWeek = (groupId: string, token: string, week?: string) =>
    request(app).get(`/api/groups/${groupId}/availability`).query(week ? { week } : {}).set(bearer(token));

  it('sin week usa la semana actual, y cada ventana trae su date', async () => {
    const { yo, group } = await twoMembers();
    const res = await forWeek(group.id, yo.token);
    expect(res.status).toBe(200);
    // Martes 10 a las 07:00: del lunes 9 no queda nada; el martes aún tiene la agenda entera (08:00 > 07:00).
    expect(res.body.map((w: { date: string }) => w.date)).toEqual([
      '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14', '2026-11-15',
    ]);
    expect(res.body[0]).toMatchObject({ dayOfWeek: 2, startTime: '08:00', endTime: '20:00' });
  });

  it('week=2026-11-19 se normaliza al lunes 16 y cuenta los puntuales de esa semana', async () => {
    const { yo, ana, group } = await twoMembers();
    await addBlock(ana.token, {
      type: 'PUNTUAL', isRecurring: false, dayOfWeek: null, date: '2026-11-19', startTime: '08:00', endTime: '20:00',
    });
    const res = await forWeek(group.id, yo.token, '2026-11-19');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(7);
    expect(res.body[0]).toMatchObject({ date: '2026-11-16', dayOfWeek: 1 });
    expect(res.body[3]).toMatchObject({ date: '2026-11-19', dayOfWeek: 4, availabilityPercentage: 50, freeMembers: 1 });
    // La semana siguiente no tiene ese puntual.
    const next = await forWeek(group.id, yo.token, '2026-11-23');
    expect(next.body[3]).toMatchObject({ date: '2026-11-26', availabilityPercentage: 100 });
  });

  it.each(['2026-11-02', '2026-12-07', 'mañana', '2026-02-30', '2026-11-1'])('week=%s fuera de las 4 semanas → 400', async (week) => {
    const { yo, group } = await twoMembers();
    const res = await forWeek(group.id, yo.token, week);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});
