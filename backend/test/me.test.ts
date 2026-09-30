import type { Dashboard, Group, Proposal, User } from '@hueckoapp/shared';
import type { Express } from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';

import { bearer, createProposal, DEADLINE, makeClock, makeTestApp, NOW, registerUser, setupSeedGroup, voteFor, windowOf } from './helpers';

let app: Express;
let clock: ReturnType<typeof makeClock>;
let yo: { token: string; user: User };
let ana: { token: string; user: User };
let group: Group;

beforeEach(async () => {
  clock = makeClock(NOW);
  ({ app } = makeTestApp({ now: clock.now }));
  ({ yo, ana, group } = await setupSeedGroup(app));
});

const get = (path: string, token: string) => request(app).get(`/api/me/${path}`).set(bearer(token));
const vote = (p: Proposal, dayOfWeek: number, token: string) => voteFor(app, p.id, windowOf(p, dayOfWeek).id, token);

// La semilla montada por la API: prop_1 confirmada con el imprevisto de Ana y prop_2 en votación con el voto de Ana.
async function seedProposals() {
  const prop1 = await createProposal(app, yo.token, group.id, {
    title: 'Reunión de avance del proyecto',
    location: { name: 'Biblioteca central', latitude: null, longitude: null },
    votingDeadline: DEADLINE,
    windows: [{ dayOfWeek: 3, startTime: '11:00', endTime: '13:00' }],
  });
  await vote(prop1, 3, yo.token);
  await vote(prop1, 3, ana.token);
  await request(app).post(`/api/proposals/${prop1.id}/confirm`).set(bearer(yo.token)).send({});
  await request(app)
    .post(`/api/proposals/${prop1.id}/incidences`)
    .set(bearer(ana.token))
    .send({ type: 'IMPREVISTO', reason: 'Cruce con un examen de laboratorio a última hora.' });
  clock.set(new Date(2026, 8, 29, 10, 1));
  const prop2 = await createProposal(app, ana.token, group.id, {
    title: 'Repaso antes de la entrega',
    location: { name: 'Google Meet', latitude: null, longitude: null },
    votingDeadline: DEADLINE,
    windows: [
      { dayOfWeek: 2, startTime: '16:00', endTime: '18:00' },
      { dayOfWeek: 4, startTime: '10:00', endTime: '12:00' },
      { dayOfWeek: 5, startTime: '16:00', endTime: '18:00' },
    ],
  });
  await vote(prop2, 2, ana.token);
  return { prop1, prop2 };
}

describe('GET /api/me/dashboard', () => {
  it('con el mismo createdAt, el resumen del grupo sigue a la propuesta insertada después', async () => {
    // El reloj no avanza: ambas propuestas tienen exactamente el mismo createdAt y decide el orden de inserción.
    await createProposal(app, yo.token, group.id, { votingDeadline: DEADLINE, windows: [{ dayOfWeek: 2, startTime: '16:00', endTime: '18:00' }] });
    await createProposal(app, yo.token, group.id, { votingDeadline: DEADLINE, windows: [{ dayOfWeek: 5, startTime: '10:00', endTime: '12:00' }] });
    expect(((await get('dashboard', yo.token)).body as Dashboard).groups[0].nextWindow).toMatchObject({ dayOfWeek: 5, startTime: '10:00' });
  });

  it('el resumen del grupo sigue a la propuesta más reciente; si se cancela, vuelve a la anterior', async () => {
    const { prop2 } = await seedProposals();
    expect(((await get('dashboard', yo.token)).body as Dashboard).groups[0].nextWindow).toMatchObject({ dayOfWeek: 2, startTime: '16:00' });
    expect((await request(app).post(`/api/proposals/${prop2.id}/cancel`).set(bearer(ana.token))).status).toBe(200);
    // prop1 está confirmada: se muestra su franja elegida (miércoles 11–13).
    expect(((await get('dashboard', yo.token)).body as Dashboard).groups[0].nextWindow).toEqual({
      dayOfWeek: 3, startTime: '11:00', endTime: '13:00', availabilityPercentage: 100,
    });
  });

  it('sin grupos: todo a cero', async () => {
    const nueva = await registerUser(app);
    const res = await get('dashboard', nueva.token);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      metrics: { activeGroups: 0, openVotes: 0, matchingHours: 0, totalBlocks: 0 },
      nextPlan: null,
      groups: [],
      pendingVotes: [],
      expressAlert: null,
    });
  });

  it('no cuenta los grupos ni las propuestas de otros', async () => {
    await seedProposals();
    const nueva = await registerUser(app);
    const d: Dashboard = (await get('dashboard', nueva.token)).body;
    expect(d.metrics).toEqual({ activeGroups: 0, openVotes: 0, matchingHours: 0, totalBlocks: 0 });
    expect(d.nextPlan).toBeNull();
    expect(d.pendingVotes).toEqual([]);
    expect(d.expressAlert).toBeNull();
  });

  it('de punta a punta con la semilla montada por la API', async () => {
    const { prop1, prop2 } = await seedProposals();
    const d: Dashboard = (await get('dashboard', yo.token)).body;
    // 8 y no 6: aquí el servidor calcula w_23 (viernes 16–18) al 100 %, no el 50 % fijo de Kotlin (B15).
    expect(d.metrics).toEqual({ activeGroups: 1, openVotes: 1, matchingHours: 8, totalBlocks: 2 });
    expect(d.nextPlan).toMatchObject({ id: prop1.id, groupName: 'Proyecto Integrador', scheduledAt: new Date(2026, 8, 30, 11, 0).toISOString() });
    expect(d.nextPlan!.attendees.map((a) => [a.user.name, a.status])).toEqual([
      ['Usuario de Prueba', 'PUNTUAL'],
      ['Ana', 'NO_ASISTE'],
    ]);
    // D6: la propuesta más reciente del grupo es prop2 (martes 16–18, 100 %).
    expect(d.groups).toEqual([
      { id: group.id, name: 'Proyecto Integrador', memberCount: 2, nextWindow: { dayOfWeek: 2, startTime: '16:00', endTime: '18:00', availabilityPercentage: 100 } },
    ]);
    expect(d.pendingVotes).toEqual([expect.objectContaining({ id: prop2.id, groupName: 'Proyecto Integrador', myVoteWindowId: null })]);
    expect(d.expressAlert).toMatchObject({ proposalId: prop1.id, kind: 'AVISO', who: 'Ana', canResolve: true });

    const deAna: Dashboard = (await get('dashboard', ana.token)).body;
    expect(deAna.expressAlert?.canResolve).toBe(false);
    expect(deAna.metrics.totalBlocks).toBe(3);
  });

  it('401 sin token', async () => {
    expect((await request(app).get('/api/me/dashboard')).status).toBe(401);
  });
});

describe('GET /api/me/upcoming-plans (C11)', () => {
  it('mis planes confirmados futuros con el nombre del grupo; al cancelar desaparece', async () => {
    const { prop1 } = await seedProposals();
    const res = await get('upcoming-plans', yo.token);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([expect.objectContaining({ id: prop1.id, groupName: 'Proyecto Integrador', state: 'CONFIRMADO' })]);
    await request(app).post(`/api/proposals/${prop1.id}/cancel`).set(bearer(yo.token)).send({});
    expect((await get('upcoming-plans', yo.token)).body).toEqual([]);
  });

  it('no incluye planes de grupos ajenos', async () => {
    await seedProposals();
    const otra = await registerUser(app);
    expect((await get('upcoming-plans', otra.token)).body).toEqual([]);
  });
});
