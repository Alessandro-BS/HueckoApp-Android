import type { ExpressOption, IncidenceType } from '@hueckoapp/shared';

// Reglas puras de la votación exprés (spec 2026-11-13). Sin base de datos: se prueban aparte.

export const EXPRESS_OPTIONS = ['CANCELAR', 'REAGENDAR', 'MANTENER'] as const satisfies readonly ExpressOption[];

const MIN_WINDOW_MINUTES = 5;
const QUORUM = 2;

/**
 * Por qué una incidencia es crítica (null si no lo es). Orden: quien propuso el plan, imprescindible, organizador.
 * Una TARDANZA nunca abre votación.
 */
export function criticalReasonFor(i: {
  type: IncidenceType;
  reporterId: string;
  createdById: string;
  isEssential: boolean;
  role: 'OWNER' | 'MEMBER';
}): string | null {
  if (i.type === 'TARDANZA') return null;
  if (i.reporterId === i.createdById) return 'propuso este plan';
  if (i.isEssential) return 'el grupo lo marcó como imprescindible';
  if (i.role === 'OWNER') return 'es organizador del grupo';
  return null;
}

/** Plazo: `minutes` desde la apertura, sin pasar del inicio del plan y con al menos 5 minutos. ISO (UTC). */
export function expiresAtFor(openedAt: Date, scheduledAt: string | null, minutes: number): string {
  const opened = openedAt.getTime();
  let end = opened + minutes * 60_000;
  if (scheduledAt !== null) end = Math.min(end, new Date(scheduledAt).getTime());
  return new Date(Math.max(end, opened + MIN_WINDOW_MINUTES * 60_000)).toISOString();
}

/** 2 votos, o todos los que pueden votar si son menos. */
export const quorumFor = (eligible: number): number => Math.min(QUORUM, eligible);

// Empate: gana la opción más prudente.
const PRUDENCE: readonly ExpressOption[] = ['MANTENER', 'REAGENDAR', 'CANCELAR'];

/** Resultado: sin quórum, MANTENER por defecto; si no, la más votada y, en empate, la más prudente. */
export function tally(options: readonly ExpressOption[], eligible: number): { result: ExpressOption; byDefault: boolean } {
  if (options.length === 0 || options.length < quorumFor(eligible)) return { result: 'MANTENER', byDefault: true };
  const count = (o: ExpressOption) => options.filter((x) => x === o).length;
  const result = [...PRUDENCE].sort((a, b) => count(b) - count(a))[0];
  return { result, byDefault: false };
}
