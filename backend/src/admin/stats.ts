import type {
  AdminReport, AdminStats, AiTask, AiTaskStats, AiUsage, HourCount, ProposalCounts, ProposalState, StatsBucket, TimeseriesPoint, TopGroup,
} from '@hueckoapp/shared';

import { AI_TASKS } from '../ai/ai-client';
import type { Db, SqlParam } from '../db/db';

/** Intervalo [from, to) de instantes. La API recibe días (A1) y los convierte con `dayRange`. */
export type DateRange = { from: Date; to: Date };

export const DAY_MS = 86_400_000;
export const MAX_RANGE_DAYS = 366;
// Un informe de hasta un mes va por días; uno más largo, por semanas (D9).
export const DAILY_REPORT_MAX_DAYS = 31;

// Planes «en pie»: confirmados o re-coordinándose (D9).
const LIVE_PLAN = "state IN ('CONFIRMADO', 'EN_RECOORDINACION')";

const pad2 = (n: number) => String(n).padStart(2, '0');

/** «YYYY-MM-DD» de un instante en la zona del servidor (TZ). */
export const localDateKey = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

// Con componentes locales (no sumando milisegundos): un cambio de horario no descuadra los días (D8).
const addDays = (d: Date, days: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + days);

const DATE_KEY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** 00:00 (zona del servidor) del día «YYYY-MM-DD»; null si no tiene ese formato o no existe (2026-02-30). */
export function dateFromKey(key: string): Date | null {
  const match = DATE_KEY.exec(key);
  if (!match) return null;
  const [y, m, d] = match.slice(1).map(Number);
  const date = new Date(2000, 0, 1);
  date.setFullYear(y, m - 1, d); // setFullYear no convierte los años 0–99 en 19xx, a diferencia de new Date(y, …)
  date.setHours(0, 0, 0, 0);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d ? date : null;
}

/** Días de calendario (ambos incluidos, «YYYY-MM-DD» válidos) → [00:00 del primero, 00:00 del siguiente al último). */
export function dayRange(fromKey: string, toKey: string): DateRange {
  return { from: dateFromKey(fromKey)!, to: addDays(dateFromKey(toKey)!, 1) };
}

/** Días de calendario que toca [from, to) con límites en medianoches: redondear absorbe la hora de un cambio de horario. */
export const calendarDays = ({ from, to }: DateRange) => Math.round((to.getTime() - from.getTime()) / DAY_MS);

/** Último día incluido en [from, to) cuando `to` es una medianoche. */
export const lastDayKey = ({ to }: DateRange) => localDateKey(addDays(to, -1));

/** 00:00 (zona del servidor) del día, o del lunes de la semana, que contiene `d`. */
export function bucketStart(d: Date, bucket: StatsBucket): Date {
  return addDays(d, bucket === 'week' ? -((d.getDay() + 6) % 7) : 0);
}

const nextBucket = (start: Date, bucket: StatsBucket) => addDays(start, bucket === 'week' ? 7 : 1);

/** Inicio de cada tramo que toca [from, to), en orden y sin huecos (también los vacíos). */
export function bucketKeys({ from, to }: DateRange, bucket: StatsBucket): string[] {
  const keys: string[] = [];
  for (let start = bucketStart(from, bucket); start < to; start = nextBucket(start, bucket)) keys.push(localDateKey(start));
  return keys;
}

const isoRange = ({ from, to }: DateRange) => [from.toISOString(), to.toISOString()] as const;

const count = async (db: Db, sql: string, params: readonly SqlParam[] = []) => (await db.one<{ n: number }>(sql, params))!.n;

// Solo tablas con created_at en ISO UTC (texto ordenable); el nombre es fijo, nunca viene de la petición.
type TimedTable = 'users' | 'groups' | 'proposals' | 'ai_calls';

// La base solo filtra por rango (usa los índices); el tramo se calcula en JS con la zona del servidor (TZ, D8),
// que es la que manda en toda la app (la zona horaria de la base no interviene).
async function createdAtIn(db: Db, table: TimedTable, range: DateRange): Promise<string[]> {
  const rows = await db.many<{ at: string }>(`SELECT created_at AS at FROM ${table} WHERE created_at >= $1 AND created_at < $2`, isoRange(range));
  return rows.map((r) => r.at);
}

function countByBucket(timestamps: readonly string[], bucket: StatsBucket): Map<string, number> {
  const counts = new Map<string, number>();
  for (const at of timestamps) {
    const key = localDateKey(bucketStart(new Date(at), bucket));
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

export async function timeseries(db: Db, range: DateRange, bucket: StatsBucket): Promise<TimeseriesPoint[]> {
  const registrations = countByBucket(await createdAtIn(db, 'users', range), bucket);
  const groupsCreated = countByBucket(await createdAtIn(db, 'groups', range), bucket);
  const proposalsCreated = countByBucket(await createdAtIn(db, 'proposals', range), bucket);
  const aiCalls = countByBucket(await createdAtIn(db, 'ai_calls', range), bucket);
  return bucketKeys(range, bucket).map((start) => ({
    start,
    registrations: registrations.get(start) ?? 0,
    groupsCreated: groupsCreated.get(start) ?? 0,
    proposalsCreated: proposalsCreated.get(start) ?? 0,
    aiCalls: aiCalls.get(start) ?? 0,
  }));
}

/** Hora de inicio (0–23, zona del servidor) de los planes en pie; con rango, los que caen en él. */
export async function popularHours(db: Db, range: DateRange | null): Promise<HourCount[]> {
  const where = range ? ' AND scheduled_at >= $1 AND scheduled_at < $2' : '';
  const rows = await db.many<{ at: string }>(
    `SELECT scheduled_at AS at FROM proposals WHERE ${LIVE_PLAN} AND scheduled_at IS NOT NULL${where}`,
    range ? isoRange(range) : [],
  );
  const hours: HourCount[] = Array.from({ length: 24 }, (_, hour) => ({ hour, count: 0 }));
  for (const { at } of rows) hours[new Date(at).getHours()].count += 1;
  return hours;
}

const rate = (ok: number, calls: number) => (calls === 0 ? null : Math.round((ok * 100) / calls));

/** Llamadas a la IA por función (todas, también las no usadas, en el orden de AI_TASKS) y % de éxito. */
export async function aiUsage(db: Db, range: DateRange | null): Promise<AiUsage> {
  const where = range ? ' WHERE created_at >= $1 AND created_at < $2' : '';
  const rows = await db.many<{ task: AiTask; calls: number; ok: number; avg_ms: number | null }>(
    `SELECT task, COUNT(*) AS calls, COUNT(*) FILTER (WHERE ok) AS ok, AVG(duration_ms) AS avg_ms FROM ai_calls${where} GROUP BY task`,
    range ? isoRange(range) : [],
  );
  const byTask: AiTaskStats[] = AI_TASKS.map((task) => {
    const row = rows.find((r) => r.task === task);
    const calls = row?.calls ?? 0;
    const ok = row?.ok ?? 0;
    return { task, calls, ok, successRate: rate(ok, calls), avgDurationMs: row?.avg_ms == null ? null : Math.round(row.avg_ms) };
  });
  const calls = byTask.reduce((sum, t) => sum + t.calls, 0);
  const ok = byTask.reduce((sum, t) => sum + t.ok, 0);
  return { calls, ok, successRate: rate(ok, calls), byTask };
}

async function proposalCounts(db: Db, range: DateRange | null): Promise<ProposalCounts> {
  const where = range ? ' WHERE created_at >= $1 AND created_at < $2' : '';
  const rows = await db.many<{ state: ProposalState; n: number }>(
    `SELECT state, COUNT(*) AS n FROM proposals${where} GROUP BY state`,
    range ? isoRange(range) : [],
  );
  const counts: ProposalCounts = { PROPUESTO: 0, CONFIRMADO: 0, EN_RECOORDINACION: 0, CANCELADO: 0 };
  for (const r of rows) counts[r.state] = r.n;
  return counts;
}

/** Totales de ahora mismo (GET /admin/stats). `admins` cuenta todas las cuentas ADMIN, activas o no. */
export async function adminStats(db: Db): Promise<AdminStats> {
  const users = (await db.one<AdminStats['users']>(
    `SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE status = 'ACTIVE') AS active,
            COUNT(*) FILTER (WHERE status = 'SUSPENDED') AS suspended, COUNT(*) FILTER (WHERE role = 'ADMIN') AS admins
     FROM users`,
  ))!;
  return {
    users: { total: users.total, active: users.active, suspended: users.suspended, admins: users.admins },
    groups: await count(db, 'SELECT COUNT(*) AS n FROM groups'),
    proposals: await proposalCounts(db, null),
    confirmedPlans: await count(db, `SELECT COUNT(*) AS n FROM proposals WHERE ${LIVE_PLAN}`),
    incidences: await count(db, 'SELECT COUNT(*) AS n FROM incidences'),
    ai: await aiUsage(db, null),
  };
}

/**
 * Todas las cifras de un periodo en una respuesta: la pantalla, el PDF y el CSV usan exactamente estos datos.
 * `range` va de medianoche a medianoche en la zona del servidor (lo construye `dayRange`).
 */
export async function adminReport(db: Db, range: DateRange, now: Date): Promise<AdminReport> {
  const bucket: StatsBucket = calendarDays(range) <= DAILY_REPORT_MAX_DAYS ? 'day' : 'week';
  const [from, to] = isoRange(range);
  const ai = await aiUsage(db, range);
  const topGroups = (
    await db.many<TopGroup>(
      `SELECT g.id, g.name, COUNT(*) AS proposals
       FROM proposals p JOIN groups g ON g.id = p.group_id
       WHERE p.created_at >= $1 AND p.created_at < $2
       GROUP BY g.id ORDER BY proposals DESC, g.name, g.id LIMIT 5`,
      [from, to],
    )
  ).map((g) => ({ id: g.id, name: g.name, proposals: g.proposals }));
  return {
    period: { from, to, fromDate: localDateKey(range.from), toDate: lastDayKey(range) },
    generatedAt: now.toISOString(),
    bucket,
    summary: {
      newUsers: await count(db, 'SELECT COUNT(*) AS n FROM users WHERE created_at >= $1 AND created_at < $2', [from, to]),
      newGroups: await count(db, 'SELECT COUNT(*) AS n FROM groups WHERE created_at >= $1 AND created_at < $2', [from, to]),
      newProposals: await count(db, 'SELECT COUNT(*) AS n FROM proposals WHERE created_at >= $1 AND created_at < $2', [from, to]),
      confirmedPlans: await count(db, `SELECT COUNT(*) AS n FROM proposals WHERE ${LIVE_PLAN} AND scheduled_at >= $1 AND scheduled_at < $2`, [from, to]),
      incidences: await count(db, 'SELECT COUNT(*) AS n FROM incidences WHERE created_at >= $1 AND created_at < $2', [from, to]),
      aiCalls: ai.calls,
    },
    proposalsByState: await proposalCounts(db, range),
    ai,
    timeseries: await timeseries(db, range, bucket),
    popularHours: await popularHours(db, range),
    topGroups,
  };
}
