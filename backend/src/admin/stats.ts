import type {
  AdminReport, AdminStats, AiTask, AiTaskStats, AiUsage, HourCount, ProposalCounts, ProposalState, StatsBucket, TimeseriesPoint, TopGroup,
} from '@hueckoapp/shared';

import { AI_TASKS } from '../ai/ai-client';
import type { Db } from '../db/database';

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

const count = (db: Db, sql: string, ...params: string[]) => (db.prepare(sql).get(...params) as { n: number }).n;

// Solo tablas con created_at en ISO UTC (texto ordenable); el nombre es fijo, nunca viene de la petición.
type TimedTable = 'users' | 'groups' | 'proposals' | 'ai_calls';

// SQLite solo filtra por rango (usa los índices); el tramo se calcula en JS con la zona del servidor (D8):
// el 'localtime' de SQLite usa la zona del sistema operativo, no la de TZ.
function createdAtIn(db: Db, table: TimedTable, range: DateRange): string[] {
  const rows = db.prepare(`SELECT created_at AS at FROM ${table} WHERE created_at >= ? AND created_at < ?`).all(...isoRange(range)) as { at: string }[];
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

export function timeseries(db: Db, range: DateRange, bucket: StatsBucket): TimeseriesPoint[] {
  const registrations = countByBucket(createdAtIn(db, 'users', range), bucket);
  const groupsCreated = countByBucket(createdAtIn(db, 'groups', range), bucket);
  const proposalsCreated = countByBucket(createdAtIn(db, 'proposals', range), bucket);
  const aiCalls = countByBucket(createdAtIn(db, 'ai_calls', range), bucket);
  return bucketKeys(range, bucket).map((start) => ({
    start,
    registrations: registrations.get(start) ?? 0,
    groupsCreated: groupsCreated.get(start) ?? 0,
    proposalsCreated: proposalsCreated.get(start) ?? 0,
    aiCalls: aiCalls.get(start) ?? 0,
  }));
}

/** Hora de inicio (0–23, zona del servidor) de los planes en pie; con rango, los que caen en él. */
export function popularHours(db: Db, range: DateRange | null): HourCount[] {
  const where = range ? ' AND scheduled_at >= ? AND scheduled_at < ?' : '';
  const rows = db
    .prepare(`SELECT scheduled_at AS at FROM proposals WHERE ${LIVE_PLAN} AND scheduled_at IS NOT NULL${where}`)
    .all(...(range ? isoRange(range) : [])) as { at: string }[];
  const hours: HourCount[] = Array.from({ length: 24 }, (_, hour) => ({ hour, count: 0 }));
  for (const { at } of rows) hours[new Date(at).getHours()].count += 1;
  return hours;
}

const rate = (ok: number, calls: number) => (calls === 0 ? null : Math.round((ok * 100) / calls));

/** Llamadas a la IA por función (todas, también las no usadas, en el orden de AI_TASKS) y % de éxito. */
export function aiUsage(db: Db, range: DateRange | null): AiUsage {
  const where = range ? ' WHERE created_at >= ? AND created_at < ?' : '';
  const rows = db
    .prepare(`SELECT task, COUNT(*) AS calls, COALESCE(SUM(ok), 0) AS ok, AVG(duration_ms) AS avg_ms FROM ai_calls${where} GROUP BY task`)
    .all(...(range ? isoRange(range) : [])) as { task: AiTask; calls: number; ok: number; avg_ms: number | null }[];
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

function proposalCounts(db: Db, range: DateRange | null): ProposalCounts {
  const where = range ? ' WHERE created_at >= ? AND created_at < ?' : '';
  const rows = db
    .prepare(`SELECT state, COUNT(*) AS n FROM proposals${where} GROUP BY state`)
    .all(...(range ? isoRange(range) : [])) as { state: ProposalState; n: number }[];
  const counts: ProposalCounts = { PROPUESTO: 0, CONFIRMADO: 0, EN_RECOORDINACION: 0, CANCELADO: 0 };
  for (const r of rows) counts[r.state] = r.n;
  return counts;
}

/** Totales de ahora mismo (GET /admin/stats). `admins` cuenta todas las cuentas ADMIN, activas o no. */
export function adminStats(db: Db): AdminStats {
  const users = db
    .prepare(
      `SELECT COUNT(*) AS total, COALESCE(SUM(status = 'ACTIVE'), 0) AS active,
              COALESCE(SUM(status = 'SUSPENDED'), 0) AS suspended, COALESCE(SUM(role = 'ADMIN'), 0) AS admins
       FROM users`,
    )
    .get() as AdminStats['users'];
  return {
    users: { total: users.total, active: users.active, suspended: users.suspended, admins: users.admins },
    groups: count(db, 'SELECT COUNT(*) AS n FROM groups'),
    proposals: proposalCounts(db, null),
    confirmedPlans: count(db, `SELECT COUNT(*) AS n FROM proposals WHERE ${LIVE_PLAN}`),
    incidences: count(db, 'SELECT COUNT(*) AS n FROM incidences'),
    ai: aiUsage(db, null),
  };
}

/**
 * Todas las cifras de un periodo en una respuesta: la pantalla, el PDF y el CSV usan exactamente estos datos.
 * `range` va de medianoche a medianoche en la zona del servidor (lo construye `dayRange`).
 */
export function adminReport(db: Db, range: DateRange, now: Date): AdminReport {
  const bucket: StatsBucket = calendarDays(range) <= DAILY_REPORT_MAX_DAYS ? 'day' : 'week';
  const [from, to] = isoRange(range);
  const ai = aiUsage(db, range);
  const topGroups = (
    db
      .prepare(
        `SELECT g.id, g.name, COUNT(*) AS proposals
         FROM proposals p JOIN groups g ON g.id = p.group_id
         WHERE p.created_at >= ? AND p.created_at < ?
         GROUP BY g.id ORDER BY proposals DESC, g.name, g.id LIMIT 5`,
      )
      .all(from, to) as TopGroup[]
  ).map((g) => ({ id: g.id, name: g.name, proposals: g.proposals }));
  return {
    period: { from, to, fromDate: localDateKey(range.from), toDate: lastDayKey(range) },
    generatedAt: now.toISOString(),
    bucket,
    summary: {
      newUsers: count(db, 'SELECT COUNT(*) AS n FROM users WHERE created_at >= ? AND created_at < ?', from, to),
      newGroups: count(db, 'SELECT COUNT(*) AS n FROM groups WHERE created_at >= ? AND created_at < ?', from, to),
      newProposals: count(db, 'SELECT COUNT(*) AS n FROM proposals WHERE created_at >= ? AND created_at < ?', from, to),
      confirmedPlans: count(db, `SELECT COUNT(*) AS n FROM proposals WHERE ${LIVE_PLAN} AND scheduled_at >= ? AND scheduled_at < ?`, from, to),
      incidences: count(db, 'SELECT COUNT(*) AS n FROM incidences WHERE created_at >= ? AND created_at < ?', from, to),
      aiCalls: ai.calls,
    },
    proposalsByState: proposalCounts(db, range),
    ai,
    timeseries: timeseries(db, range, bucket),
    popularHours: popularHours(db, range),
    topGroups,
  };
}
