import type { AiTask, AuditAction, AuditEntry, CurrentUser, ProposalState, UserRole, UserStatus } from '@hueckoapp/shared';

import type { DateRange } from '../api/admin';
import { addDays, formatShortDate, toDateKey } from './days';

// Orden fijo de los estados en gráficos, tablas y CSV.
export const PROPOSAL_STATE_ORDER: readonly ProposalState[] = ['PROPUESTO', 'CONFIRMADO', 'EN_RECOORDINACION', 'CANCELADO'];

export const ROLE_LABEL: Record<UserRole, string> = { USER: 'Usuario', ADMIN: 'Administrador' };

export const STATUS_LABEL: Record<UserStatus, string> = { ACTIVE: 'Activa', SUSPENDED: 'Suspendida' };

export const AI_TASK_LABEL: Record<AiTask, string> = {
  'schedule-ocr': 'Leer horario de una foto',
  'proposal-draft': 'Borrador de propuesta',
  'plan-suggestions': 'Ideas de plan',
  'voting-summary': 'Resumen de votación',
};

export const AUDIT_ACTION_LABEL: Record<AuditAction, string> = {
  USER_SUSPENDED: 'Suspendió una cuenta',
  USER_REACTIVATED: 'Reactivó una cuenta',
  USER_PROMOTED: 'Nombró administrador',
  USER_DEMOTED: 'Quitó el rol de administrador',
  GROUP_DELETED: 'Eliminó un grupo',
  PROPOSAL_CANCELLED: 'Canceló una propuesta',
};

// El menú «Administración» (D12). El servidor vuelve a comprobarlo en cada petición.
export const canSeeAdmin = (user: CurrentUser | null) => user?.role === 'ADMIN';

export const percentLabel = (value: number | null) => (value === null ? '—' : `${value} %`);

export const countLabel = (n: number, singular: string, plural: string) => (n === 1 ? `1 ${singular}` : `${n} ${plural}`);

export const auditAuthor = (entry: AuditEntry) => entry.admin?.name ?? 'Consola del servidor';

// Nombre o título guardado en la anotación: el objetivo puede ya no existir (un grupo borrado).
export function auditTarget(entry: AuditEntry): string {
  const { name, title } = entry.details;
  if (typeof name === 'string') return name;
  if (typeof title === 'string') return title;
  return entry.targetId;
}

export const auditReason = (entry: AuditEntry) => (typeof entry.details.reason === 'string' ? entry.details.reason : null);

/** «2026-09-28» → «28/09» (ejes de los gráficos). */
export const shortDayLabel = (key: string) => `${key.slice(8, 10)}/${key.slice(5, 7)}`;

/** «Lun 31/08 – Mar 29/09» con los días que manda el servidor (ReportPeriod). */
export const periodLabel = (fromDate: string, toDate: string) => `${formatShortDate(fromDate)} – ${formatShortDate(toDate)}`;

// ---- Periodo del informe: días de calendario del teléfono, ambos incluidos (el servidor valida lo mismo) ----

export type RangePreset = '7d' | '30d' | 'semester' | 'custom';
export type FixedPreset = Exclude<RangePreset, 'custom'>;

export const RANGE_PRESETS: readonly { key: RangePreset; label: string }[] = [
  { key: '7d', label: '7 días' },
  { key: '30d', label: '30 días' },
  { key: 'semester', label: 'Este semestre' },
  { key: 'custom', label: 'Personalizado' },
];

export const MAX_RANGE_DAYS = 366;

export type RangeResult = { ok: true; range: DateRange } | { ok: false; error: string };

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
// Días de calendario entre dos fechas locales (Date.UTC: el cambio de hora no cuenta).
const daysBetween = (from: Date, to: Date) =>
  Math.round((Date.UTC(to.getFullYear(), to.getMonth(), to.getDate()) - Date.UTC(from.getFullYear(), from.getMonth(), from.getDate())) / 86_400_000);

/**
 * Siempre hasta hoy (incluido): «7 días» y «30 días» cuentan hoy como el último día;
 * «Este semestre» empieza el 1 de enero o el 1 de julio.
 */
export function presetRange(preset: FixedPreset, now: Date): DateRange {
  const today = startOfDay(now);
  const to = toDateKey(today);
  if (preset === '7d') return { from: toDateKey(addDays(today, -6)), to };
  if (preset === '30d') return { from: toDateKey(addDays(today, -29)), to };
  return { from: toDateKey(new Date(now.getFullYear(), now.getMonth() < 6 ? 0 : 6, 1)), to };
}

/** «Personalizado»: del día `from` al día `to`, ambos incluidos. */
export function customRange(from: Date | null, to: Date | null): RangeResult {
  if (!from || !to) return { ok: false, error: 'Elige la fecha de inicio y la de fin.' };
  const days = daysBetween(from, to) + 1;
  if (days < 1) return { ok: false, error: 'La fecha de inicio no puede ser posterior a la de fin.' };
  if (days > MAX_RANGE_DAYS) return { ok: false, error: `El periodo no puede superar ${MAX_RANGE_DAYS} días.` };
  return { ok: true, range: { from: toDateKey(from), to: toDateKey(to) } };
}

/** Las últimas `weeks` semanas de lunes a domingo, hasta hoy (gráficos de «Estadísticas»). */
export function lastWeeksRange(now: Date, weeks: number): DateRange {
  const today = startOfDay(now);
  const monday = addDays(today, -((today.getDay() + 6) % 7));
  return { from: toDateKey(addDays(monday, -7 * (weeks - 1))), to: toDateKey(today) };
}
