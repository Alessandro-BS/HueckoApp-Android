import { z } from 'zod';

import { calendarDays, dateFromKey, dayRange, MAX_RANGE_DAYS, type DateRange } from './stats';

// ?search=&page= de las listas (D10). `search` vacío = sin filtro.
export const listQuerySchema = z.object({
  search: z
    .string({ error: 'La búsqueda debe ser un texto.' })
    .trim()
    .max(100, 'La búsqueda admite hasta 100 caracteres.')
    .default(''),
  // `?page=` vacío cuenta como omitido (página 1): z.coerce lo convertiría en 0 y daría un 400 confuso.
  page: z.preprocess(
    (value) => (value === '' ? undefined : value),
    z.coerce
      .number({ error: 'La página debe ser un número.' })
      .int('La página debe ser un número entero.')
      .min(1, 'La página empieza en 1.')
      .max(100_000, 'Página demasiado alta.')
      .default(1),
  ),
});

export const pageQuerySchema = listQuerySchema.pick({ page: true });

export const userStatusSchema = z.object({
  status: z.enum(['ACTIVE', 'SUSPENDED'], { error: 'El estado debe ser ACTIVE o SUSPENDED.' }),
});

export const userRoleSchema = z.object({
  role: z.enum(['USER', 'ADMIN'], { error: 'El rol debe ser USER o ADMIN.' }),
});

// POST /admin/proposals/:id/cancel: el motivo es obligatorio (3-200 caracteres tras el trim) y queda en el registro.
export const cancelProposalSchema = z.object({
  reason: z
    .string({ error: 'Indica el motivo de la cancelación.' })
    .trim()
    .min(3, 'El motivo necesita al menos 3 caracteres.')
    .max(200, 'El motivo admite hasta 200 caracteres.'),
});

// ---- Periodos de estadísticas e informes (D9, A1): días de calendario «YYYY-MM-DD», ambos incluidos ----
// El servidor los convierte en medianoches de su zona (TZ): la zona del teléfono no puede desplazar el periodo.

const DATE_FORMAT = 'Usa una fecha con el formato AAAA-MM-DD (p. ej. 2026-09-01).';

// Años 2000–9999: con los años 0–99, `new Date(año, …)` (que usan los tramos) saltaría a 19xx.
export const MIN_YEAR = 2000;
export const MAX_YEAR = 9999;

const dayKey = z.string({ error: DATE_FORMAT }).superRefine((value, ctx) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) ctx.addIssue({ code: 'custom', message: DATE_FORMAT });
  else if (!dateFromKey(value)) ctx.addIssue({ code: 'custom', message: 'Esa fecha no existe en el calendario.' });
  else if (Number(value.slice(0, 4)) < MIN_YEAR) ctx.addIssue({ code: 'custom', message: `El año debe estar entre ${MIN_YEAR} y ${MAX_YEAR}.` });
});

// Problema del periodo, o null. Con alguna fecha inválida no dice nada: ese error ya lo da `dayKey`.
function rangeProblem(from: string, to: string): string | null {
  const first = dateFromKey(from);
  const last = dateFromKey(to);
  if (!first || !last) return null;
  if (last < first) return '«to» no puede ser anterior a «from».';
  if (calendarDays(dayRange(from, to)) > MAX_RANGE_DAYS) return `El periodo no puede superar ${MAX_RANGE_DAYS} días.`;
  return null;
}

const checkRange = (q: { from?: string; to?: string }, ctx: z.RefinementCtx) => {
  const problem = q.from !== undefined && q.to !== undefined ? rangeProblem(q.from, q.to) : null;
  if (problem) ctx.addIssue({ code: 'custom', path: ['to'], message: problem });
};

// Salida: el intervalo [00:00 de from, 00:00 del día siguiente a to) y los días tal cual llegaron.
export type DayPeriod = { range: DateRange; fromDate: string; toDate: string };

const toPeriod = (from: string, to: string): DayPeriod => ({ range: dayRange(from, to), fromDate: from, toDate: to });

export const rangeQuerySchema = z
  .object({ from: dayKey, to: dayKey })
  .superRefine(checkRange)
  .transform((q) => toPeriod(q.from, q.to));

export const timeseriesQuerySchema = z
  .object({ from: dayKey, to: dayKey, bucket: z.enum(['day', 'week'], { error: 'bucket debe ser day o week.' }).default('week') })
  .superRefine(checkRange)
  .transform((q) => ({ ...toPeriod(q.from, q.to), bucket: q.bucket }));

// popular-hours: sin periodo = desde siempre; con periodo, `from` y `to` van juntos.
export const optionalRangeQuerySchema = z
  .object({ from: dayKey.optional(), to: dayKey.optional() })
  .superRefine((q, ctx) => {
    if ((q.from === undefined) !== (q.to === undefined)) {
      ctx.addIssue({ code: 'custom', path: ['from'], message: 'Envía «from» y «to» juntos, o ninguno.' });
      return;
    }
    checkRange(q, ctx);
  })
  .transform((q): DayPeriod | null => (q.from !== undefined && q.to !== undefined ? toPeriod(q.from, q.to) : null));
