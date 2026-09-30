import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { aiUsage, bucketKeys, bucketStart, localDateKey, popularHours, timeseries } from '../src/admin/stats';
import { insertAiCall, insertGroup, insertProposal, insertUser, registerAdmin } from './admin-fixtures';
import { bearer, makeTestApp, makeTestDb, NOW, registerUser } from './helpers';

// Estos tests suponen TZ=America/Lima (UTC−5 todo el año); vitest.config.mts la fija para todo `npm test`.
const lima = (y: number, m: number, d: number, h = 0) => new Date(y, m - 1, d, h);
const empty = { groupsCreated: 0, proposalsCreated: 0, aiCalls: 0 };

const FORMAT = 'Usa una fecha con el formato AAAA-MM-DD (p. ej. 2026-09-01).';
const NO_SUCH_DAY = 'Esa fecha no existe en el calendario.';
const YEAR_RANGE = 'El año debe estar entre 2000 y 9999.';

describe('precondición', () => {
  it('los tests corren con TZ=America/Lima', () => {
    expect(new Date('2026-09-29T03:00:00.000Z').getHours()).toBe(22);
  });
});

describe('tramos en la zona del servidor (D8)', () => {
  it('bucketStart: el día a las 00:00 y la semana desde el lunes', () => {
    const lateSunday = lima(2026, 10, 4, 23); // domingo 4/10, 23:00
    expect(localDateKey(bucketStart(lateSunday, 'day'))).toBe('2026-10-04');
    expect(localDateKey(bucketStart(lateSunday, 'week'))).toBe('2026-09-28');
    expect(localDateKey(bucketStart(lima(2026, 9, 28), 'week'))).toBe('2026-09-28');
  });

  it('bucketKeys incluye los tramos vacíos y el primero puede empezar antes de from', () => {
    expect(bucketKeys({ from: lima(2026, 9, 30), to: lima(2026, 10, 13) }, 'week')).toEqual(['2026-09-28', '2026-10-05', '2026-10-12']);
    expect(bucketKeys({ from: lima(2026, 9, 29), to: lima(2026, 10, 1) }, 'day')).toEqual(['2026-09-29', '2026-09-30']);
  });

  it('una cuenta creada a las 22:00 de Lima (03:00 UTC del día siguiente) cuenta en el día de Lima', async () => {
    const db = await makeTestDb();
    await insertUser(db, { createdAt: '2026-09-29T03:00:00.000Z' }); // lunes 28/9 22:00 en Lima
    await insertUser(db, { createdAt: '2026-09-29T05:00:00.000Z' }); // martes 29/9 00:00 en Lima
    expect(await timeseries(db, { from: lima(2026, 9, 28), to: lima(2026, 9, 30) }, 'day')).toEqual([
      { start: '2026-09-28', registrations: 1, ...empty },
      { start: '2026-09-29', registrations: 1, ...empty },
    ]);
  });

  it('from se incluye y to no', async () => {
    const db = await makeTestDb();
    const range = { from: lima(2026, 9, 29), to: lima(2026, 9, 30) };
    await insertUser(db, { createdAt: range.from.toISOString() });
    await insertUser(db, { createdAt: range.to.toISOString() });
    expect(await timeseries(db, range, 'day')).toEqual([{ start: '2026-09-29', registrations: 1, ...empty }]);
  });
});

describe('popularHours', () => {
  it('hora de inicio en Lima, solo de planes CONFIRMADO o EN_RECOORDINACION; con rango, los que caen en él', async () => {
    const db = await makeTestDb();
    const u = await insertUser(db);
    const g = await insertGroup(db, { ownerId: u });
    await insertProposal(db, { groupId: g, createdBy: u, state: 'CONFIRMADO', scheduledAt: '2026-10-01T16:00:00.000Z' }); // 1/10 11:00
    await insertProposal(db, { groupId: g, createdBy: u, state: 'EN_RECOORDINACION', scheduledAt: '2026-10-02T16:30:00.000Z' }); // 2/10 11:30
    await insertProposal(db, { groupId: g, createdBy: u, state: 'CONFIRMADO', scheduledAt: '2026-10-03T01:00:00.000Z' }); // 2/10 20:00
    await insertProposal(db, { groupId: g, createdBy: u, state: 'CANCELADO', scheduledAt: '2026-10-01T16:00:00.000Z' }); // no cuenta
    await insertProposal(db, { groupId: g, createdBy: u, state: 'PROPUESTO' });
    const all = await popularHours(db, null);
    expect(all).toHaveLength(24);
    expect(all.filter((h) => h.count > 0)).toEqual([{ hour: 11, count: 2 }, { hour: 20, count: 1 }]);
    const secondOfOctober = await popularHours(db, { from: lima(2026, 10, 2), to: lima(2026, 10, 3) });
    expect(secondOfOctober.filter((h) => h.count > 0)).toEqual([{ hour: 11, count: 1 }, { hour: 20, count: 1 }]);
  });
});

describe('aiUsage', () => {
  it('llamadas y % de éxito por función (todas, también las no usadas) y en total', async () => {
    const db = await makeTestDb();
    const u = await insertUser(db);
    await insertAiCall(db, { userId: u, task: 'schedule-ocr', ok: true, durationMs: 1000 });
    await insertAiCall(db, { userId: u, task: 'schedule-ocr', ok: false, durationMs: 3000 });
    await insertAiCall(db, { userId: u, task: 'schedule-ocr', ok: true, durationMs: 2000 });
    await insertAiCall(db, { userId: u, task: 'voting-summary', ok: true, durationMs: 500 });
    expect(await aiUsage(db, null)).toEqual({
      calls: 4,
      ok: 3,
      successRate: 75,
      byTask: [
        { task: 'schedule-ocr', calls: 3, ok: 2, successRate: 67, avgDurationMs: 2000 },
        { task: 'proposal-draft', calls: 0, ok: 0, successRate: null, avgDurationMs: null },
        { task: 'plan-suggestions', calls: 0, ok: 0, successRate: null, avgDurationMs: null },
        { task: 'voting-summary', calls: 1, ok: 1, successRate: 100, avgDurationMs: 500 },
      ],
    });
  });
});

async function adminApp() {
  const { app, db } = await makeTestApp({ now: () => NOW });
  const admin = await registerAdmin(app, db); // se registra en NOW (martes 29/9 10:00 en Lima)
  return { app, db, admin };
}

describe('GET /api/admin/stats', () => {
  it('totales de cuentas, grupos, propuestas por estado, planes en pie, incidencias e IA', async () => {
    const { app, db, admin } = await adminApp();
    const ana = await insertUser(db, { status: 'SUSPENDED' });
    await insertUser(db, { role: 'ADMIN' });
    const g = await insertGroup(db, { ownerId: ana });
    await insertProposal(db, { groupId: g, createdBy: ana, state: 'CONFIRMADO', scheduledAt: '2026-10-01T16:00:00.000Z' });
    await insertProposal(db, { groupId: g, createdBy: ana, state: 'EN_RECOORDINACION', scheduledAt: '2026-10-01T16:00:00.000Z' });
    await insertProposal(db, { groupId: g, createdBy: ana, state: 'CANCELADO' });
    await insertAiCall(db, { userId: ana, task: 'proposal-draft', ok: false });
    const res = await request(app).get('/api/admin/stats').set(bearer(admin.token));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      users: { total: 3, active: 2, suspended: 1, admins: 2 },
      groups: 1,
      proposals: { PROPUESTO: 0, CONFIRMADO: 1, EN_RECOORDINACION: 1, CANCELADO: 1 },
      confirmedPlans: 2,
      incidences: 0,
      ai: { calls: 1, ok: 0, successRate: 0 },
    });
  });

  it('solo ADMIN: USER → 403 NOT_ADMIN', async () => {
    const { app } = await adminApp();
    const ana = await registerUser(app);
    expect((await request(app).get('/api/admin/stats').set(bearer(ana.token))).body.error.code).toBe('NOT_ADMIN');
  });
});

// A1: el periodo viaja como días de calendario (AAAA-MM-DD, ambos incluidos) y el servidor los pasa a
// medianoches de su zona: la zona del teléfono no puede desplazarlo.
describe('GET /api/admin/stats/timeseries', () => {
  it('por semanas por defecto, con los tramos vacíos; devuelve los días pedidos', async () => {
    const { app, db, admin } = await adminApp();
    await insertUser(db, { createdAt: '2026-10-06T15:00:00.000Z' }); // martes 6/10
    await insertUser(db, { createdAt: '2026-10-19T04:59:59.999Z' }); // domingo 18/10 23:59:59 en Lima: último instante incluido
    await insertUser(db, { createdAt: '2026-10-19T05:00:00.000Z' }); // lunes 19/10 00:00 en Lima: fuera
    const res = await request(app).get('/api/admin/stats/timeseries').query({ from: '2026-09-28', to: '2026-10-18' }).set(bearer(admin.token));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      from: '2026-09-28', to: '2026-10-18', bucket: 'week',
      points: [
        { start: '2026-09-28', registrations: 1, ...empty },
        { start: '2026-10-05', registrations: 1, ...empty },
        { start: '2026-10-12', registrations: 1, ...empty },
      ],
    });
  });

  it('un solo día (from = to) es un periodo válido, medido en la zona del servidor', async () => {
    const { app, db, admin } = await adminApp();
    await insertUser(db, { createdAt: '2026-09-29T04:59:59.999Z' }); // lunes 28/9 23:59 en Lima: fuera
    await insertUser(db, { createdAt: '2026-09-30T04:59:59.999Z' }); // martes 29/9 23:59 en Lima: dentro
    const res = await request(app)
      .get('/api/admin/stats/timeseries')
      .query({ from: '2026-09-29', to: '2026-09-29', bucket: 'day' })
      .set(bearer(admin.token));
    expect(res.status).toBe(200);
    expect(res.body.points).toEqual([{ start: '2026-09-29', registrations: 2, ...empty }]); // el admin (NOW) y la de las 23:59
  });

  it('366 días incluidos es el máximo aceptado', async () => {
    const { app, admin } = await adminApp();
    const res = await request(app).get('/api/admin/stats/timeseries').query({ from: '2025-09-01', to: '2026-09-01' }).set(bearer(admin.token));
    expect(res.status).toBe(200);
  });

  it('los años 2000 y 9999 son los límites aceptados', async () => {
    const { app, admin } = await adminApp();
    const get = (from: string, to: string) =>
      request(app).get('/api/admin/stats/timeseries').query({ from, to, bucket: 'day' }).set(bearer(admin.token));
    const first = await get('2000-01-01', '2000-01-02');
    expect(first.status).toBe(200);
    expect(first.body.points.map((p: { start: string }) => p.start)).toEqual(['2000-01-01', '2000-01-02']);
    expect((await get('9999-12-30', '9999-12-31')).status).toBe(200);
  });

  it.each([
    [{ from: '2026-10-01', to: '2026-09-30' }, '«to» no puede ser anterior a «from».'],
    [{ from: '2025-08-31', to: '2026-09-01' }, 'El periodo no puede superar 366 días.'],
    [{ from: '2026-09-01T05:00:00.000Z', to: '2026-09-02' }, FORMAT],
    [{ from: 'ayer', to: '2026-09-02' }, FORMAT],
    [{ to: '2026-09-02' }, FORMAT],
    [{ from: '2026-02-30', to: '2026-03-02' }, NO_SUCH_DAY],
    [{ from: '2026-09-01', to: '2026-13-01' }, NO_SUCH_DAY],
    [{ from: '0099-01-01', to: '0099-01-02' }, YEAR_RANGE],
    [{ from: '1999-12-31', to: '2000-01-01' }, YEAR_RANGE],
    [{ from: '2026-09-01', to: '2026-09-02', bucket: 'month' }, 'bucket debe ser day o week.'],
  ])('%j → 400 «%s»', async (query, message) => {
    const { app, admin } = await adminApp();
    const res = await request(app).get('/api/admin/stats/timeseries').query(query).set(bearer(admin.token));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details).toContainEqual(expect.objectContaining({ message }));
  });
});

describe('GET /api/admin/stats/popular-hours', () => {
  it('sin rango cuenta todos los planes en pie; con días, los de esos días; from sin to → 400', async () => {
    const { app, db, admin } = await adminApp();
    const u = await insertUser(db);
    const g = await insertGroup(db, { ownerId: u });
    await insertProposal(db, { groupId: g, createdBy: u, state: 'CONFIRMADO', scheduledAt: '2026-10-01T16:00:00.000Z' }); // 1/10 11:00
    await insertProposal(db, { groupId: g, createdBy: u, state: 'CONFIRMADO', scheduledAt: '2026-10-02T02:00:00.000Z' }); // 1/10 21:00
    const res = await request(app).get('/api/admin/stats/popular-hours').set(bearer(admin.token));
    expect(res.body).toMatchObject({ from: null, to: null });
    expect(res.body.hours[11]).toEqual({ hour: 11, count: 1 });
    const oneDay = await request(app).get('/api/admin/stats/popular-hours').query({ from: '2026-10-01', to: '2026-10-01' }).set(bearer(admin.token));
    expect(oneDay.status).toBe(200);
    expect(oneDay.body).toMatchObject({ from: '2026-10-01', to: '2026-10-01' });
    expect(oneDay.body.hours.filter((h: { count: number }) => h.count > 0)).toEqual([{ hour: 11, count: 1 }, { hour: 21, count: 1 }]);
    const half = await request(app).get('/api/admin/stats/popular-hours').query({ from: '2026-10-01' }).set(bearer(admin.token));
    expect(half.status).toBe(400);
    expect(half.body.error.details).toContainEqual(expect.objectContaining({ message: 'Envía «from» y «to» juntos, o ninguno.' }));
    const bad = await request(app).get('/api/admin/stats/popular-hours').query({ from: '2026-10-02', to: '2026-10-01' }).set(bearer(admin.token));
    expect(bad.status).toBe(400);
    expect(bad.body.error.details).toContainEqual(expect.objectContaining({ message: '«to» no puede ser anterior a «from».' }));
  });
});

describe('GET /api/admin/reports', () => {
  it('todas las cifras del periodo en una respuesta, por días si dura hasta 31', async () => {
    const { app, db, admin } = await adminApp();
    const ana = await insertUser(db, { name: 'Ana', createdAt: '2026-09-25T15:00:00.000Z' }); // antes del periodo
    const study = await insertGroup(db, { name: 'Estudio', ownerId: ana, createdAt: '2026-09-29T15:00:00.000Z' });
    const football = await insertGroup(db, { name: 'Fútbol', ownerId: ana, createdAt: '2026-09-29T16:00:00.000Z' });
    await insertProposal(db, { groupId: study, createdBy: ana, state: 'CONFIRMADO', createdAt: '2026-09-29T15:30:00.000Z', scheduledAt: '2026-09-30T21:00:00.000Z' }); // 30/9 16:00
    await insertProposal(db, { groupId: study, createdBy: ana, state: 'PROPUESTO', createdAt: '2026-09-30T15:30:00.000Z' });
    await insertProposal(db, { groupId: football, createdBy: ana, state: 'CANCELADO', createdAt: '2026-09-30T16:00:00.000Z' });
    await insertAiCall(db, { userId: ana, task: 'voting-summary', ok: true, createdAt: '2026-09-30T17:00:00.000Z' });
    const res = await request(app).get('/api/admin/reports').query({ from: '2026-09-29', to: '2026-09-30' }).set(bearer(admin.token));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      // Medianoches de Lima: del martes 29 a las 00:00 al jueves 1/10 a las 00:00 (sin incluir).
      period: { from: '2026-09-29T05:00:00.000Z', to: '2026-10-01T05:00:00.000Z', fromDate: '2026-09-29', toDate: '2026-09-30' },
      generatedAt: NOW.toISOString(),
      bucket: 'day',
      summary: { newUsers: 1, newGroups: 2, newProposals: 3, confirmedPlans: 1, incidences: 0, aiCalls: 1 },
      proposalsByState: { PROPUESTO: 1, CONFIRMADO: 1, EN_RECOORDINACION: 0, CANCELADO: 1 },
      ai: { calls: 1, ok: 1, successRate: 100, byTask: expect.any(Array) },
      timeseries: [
        { start: '2026-09-29', registrations: 1, groupsCreated: 2, proposalsCreated: 1, aiCalls: 0 },
        { start: '2026-09-30', registrations: 0, groupsCreated: 0, proposalsCreated: 2, aiCalls: 1 },
      ],
      popularHours: expect.any(Array),
      topGroups: [
        { id: study, name: 'Estudio', proposals: 2 },
        { id: football, name: 'Fútbol', proposals: 1 },
      ],
    });
    expect(res.body.popularHours[16]).toEqual({ hour: 16, count: 1 });
  });

  it('31 días incluidos → por días; 32 → por semanas', async () => {
    const { app, admin } = await adminApp();
    const get = (from: string, to: string) => request(app).get('/api/admin/reports').query({ from, to }).set(bearer(admin.token));
    const month = await get('2026-09-01', '2026-10-01');
    expect(month.body.bucket).toBe('day');
    expect(month.body.timeseries).toHaveLength(31);
    expect(month.body.timeseries.at(-1).start).toBe('2026-10-01');
    expect((await get('2026-09-01', '2026-10-02')).body.bucket).toBe('week');
  });

  it('más de 31 días → por semanas, desde el lunes de la primera semana', async () => {
    const { app, admin } = await adminApp();
    const res = await request(app).get('/api/admin/reports').query({ from: '2026-08-01', to: '2026-09-30' }).set(bearer(admin.token));
    expect(res.body.bucket).toBe('week');
    expect(res.body.timeseries[0].start).toBe('2026-07-27'); // el 1/8/2026 es sábado
    expect(res.body.timeseries.at(-1).start).toBe('2026-09-28');
    expect(res.body.period).toEqual({ from: lima(2026, 8, 1).toISOString(), to: lima(2026, 10, 1).toISOString(), fromDate: '2026-08-01', toDate: '2026-09-30' });
  });

  it('a igual número de propuestas y nombre, los grupos más activos salen en un orden fijo (por id)', async () => {
    const { app, db, admin } = await adminApp();
    const ana = await insertUser(db);
    const ids = [await insertGroup(db, { name: 'Igual', ownerId: ana }), await insertGroup(db, { name: 'Igual', ownerId: ana })];
    for (const groupId of [...ids].reverse()) await insertProposal(db, { groupId, createdBy: ana, createdAt: '2026-09-29T15:00:00.000Z' });
    const res = await request(app).get('/api/admin/reports').query({ from: '2026-09-29', to: '2026-09-29' }).set(bearer(admin.token));
    expect(res.body.topGroups.map((g: { id: string }) => g.id)).toEqual([...ids].sort());
  });

  it('sin periodo → 400', async () => {
    const { app, admin } = await adminApp();
    const res = await request(app).get('/api/admin/reports').set(bearer(admin.token));
    expect(res.status).toBe(400);
    expect(res.body.error.details).toContainEqual(expect.objectContaining({ message: FORMAT }));
  });
});
