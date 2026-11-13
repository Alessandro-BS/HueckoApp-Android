import { z } from 'zod';

import { weekSchema } from '../availability/group-availability';
import { instant, isRealDate, mondayOf, validWeeks } from '../common/zone';
import { ApiError } from '../middleware/errors';
import { TIME_REGEX } from '../schedule/time-blocks.schemas';

const time = z.string({ error: 'Formato HH:mm' }).regex(TIME_REGEX, 'Formato HH:mm');

const DATE_MESSAGE = 'Elige una fecha entre esta semana y las próximas 3';
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

// Error de validación fuera de zod, con la misma forma de `details` (cada uno con su `path` y su `message`).
export const validationError = (path: readonly (string | number)[], message: string) =>
  new ApiError(400, 'VALIDATION_ERROR', message, [{ code: 'custom', path, message }]);

/**
 * Franja de una propuesta: una fecha real de las 4 semanas válidas (America/Lima), horas como los bloques de horario
 * y un inicio posterior a `now`. Depende del reloj: se construye en cada petición.
 */
export const timeWindowInputSchema = (now: Date) =>
  z
    .object({
      // Una sola comprobación: mondayOf de algo que no es una fecha real lanzaría un error (y sería un 500).
      date: z
        .string({ error: DATE_MESSAGE })
        .refine((date) => DATE_REGEX.test(date) && isRealDate(date) && validWeeks(now).includes(mondayOf(date)), DATE_MESSAGE),
      startTime: time,
      endTime: time,
    })
    .superRefine((w, ctx) => {
      if (!TIME_REGEX.test(w.startTime) || !TIME_REGEX.test(w.endTime)) return;
      if (w.endTime <= w.startTime) {
        ctx.addIssue({ code: 'custom', path: ['endTime'], message: 'La hora de fin debe ser posterior a la de inicio' });
      } else if (DATE_REGEX.test(w.date) && isRealDate(w.date) && instant(w.date, w.startTime).getTime() <= now.getTime()) {
        ctx.addIssue({ code: 'custom', path: ['startTime'], message: 'La franja ya empezó' });
      }
    });

type WindowTimes = { date: string; startTime: string; endTime: string };

const windowKey = (w: WindowTimes) => `${w.date}|${w.startTime}|${w.endTime}`;

// Mismo día y los intervalos se cruzan (una que acaba justo cuando empieza la otra no se solapa).
export const overlaps = (a: WindowTimes, b: WindowTimes) => a.date === b.date && a.startTime < b.endTime && b.startTime < a.endTime;

/** Lista de franjas de una propuesta: entre `min` y `max`, sin repetidas ni solapadas el mismo día. */
export const windowsSchema = (now: Date, { min, max }: { min: number; max: number }) => {
  const countMessage = `Elige entre ${min} y ${max} franjas`;
  return z
    .array(timeWindowInputSchema(now), { error: 'Envía una lista de franjas' })
    .min(min, countMessage)
    .max(max, countMessage)
    .superRefine((ws, ctx) => {
      if (new Set(ws.map(windowKey)).size !== ws.length) {
        ctx.addIssue({ code: 'custom', message: 'Hay franjas repetidas' });
      } else if (ws.some((a, i) => ws.some((b, j) => i < j && overlaps(a, b)))) {
        ctx.addIssue({ code: 'custom', message: 'Hay franjas que se solapan el mismo día' });
      }
    });
};

export const WINDOW_LIMITS = { min: 2, max: 5 };

/** La votación tiene que cerrar antes de que empiece la primera franja: no se vota una opción que ya empezó. */
export function assertDeadlineBeforeWindows(deadline: string, windows: readonly { date: string; startTime: string }[]): void {
  const first = Math.min(...windows.map((w) => instant(w.date, w.startTime).getTime()));
  if (new Date(deadline).getTime() >= first) {
    throw validationError(['votingDeadline'], 'La votación debe cerrar antes de la primera franja');
  }
}

// Fecha y hora ISO 8601 (con Z u offset) posterior a `now` (C1). Depende del reloj: se construye en cada petición.
export const futureDeadline = (now: Date) =>
  z
    .iso.datetime({ offset: true, error: 'Fecha límite inválida (ISO 8601)' })
    .refine((value) => new Date(value).getTime() > now.getTime(), 'La fecha límite debe ser futura');

const locationSchema = z
  .object({
    name: z.string({ error: 'El lugar necesita un nombre' }).trim().min(1, 'El lugar necesita un nombre').max(100, 'Máximo 100 caracteres'),
    latitude: z.number({ error: 'Latitud inválida' }).min(-90, 'Latitud inválida').max(90, 'Latitud inválida').nullable().default(null),
    longitude: z.number({ error: 'Longitud inválida' }).min(-180, 'Longitud inválida').max(180, 'Longitud inválida').nullable().default(null),
  })
  .refine((l) => (l.latitude === null) === (l.longitude === null), { path: ['latitude'], message: 'Envía latitud y longitud juntas' });

// Con `windows` (2 a 5) se usan esas; vacío u omitido, el servidor elige las mejores de `week` (por defecto, esta semana).
export const createProposalSchema = (now: Date) =>
  z
    .object({
      title: z
        .string({ error: 'El título no puede estar vacío.' })
        .trim()
        .min(1, 'El título no puede estar vacío.')
        .max(80, 'Máximo 80 caracteres'),
      location: locationSchema.nullish().transform((l) => l ?? null),
      votingDeadline: futureDeadline(now),
      windows: z.preprocess((v) => (Array.isArray(v) && v.length === 0 ? undefined : v), windowsSchema(now, WINDOW_LIMITS).optional()),
      week: z.unknown().optional(),
    })
    // `week` solo cuenta (y solo se valida) cuando el servidor elige las franjas.
    .transform(({ week, ...body }, ctx) => {
      if (body.windows) return { ...body, windows: body.windows, week: null };
      const parsed = weekSchema(now).safeParse(week);
      if (!parsed.success) {
        for (const issue of parsed.error.issues) ctx.issues.push({ code: 'custom', input: week, path: ['week'], message: issue.message });
        return z.NEVER;
      }
      return { ...body, windows: null, week: parsed.data };
    });

export const voteSchema = z.object({
  windowId: z.string({ error: 'Elige una franja' }).min(1, 'Elige una franja'),
});

export const INCIDENCE_TYPES = ['FALTA', 'TARDANZA', 'IMPREVISTO'] as const;

// C4: una tardanza lleva minutos (1–600); el resto no.
export const incidenceInputSchema = z
  .object({
    type: z.enum(INCIDENCE_TYPES, { error: 'Tipo de imprevisto inválido' }),
    reason: z.string({ error: 'Cuéntale al grupo qué pasó' }).trim().min(1, 'Cuéntale al grupo qué pasó').max(200, 'Máximo 200 caracteres'),
    delayMinutes: z
      .number({ error: 'Minutos inválidos' })
      .int('Minutos inválidos')
      .min(1, 'Los minutos deben ser mayores que 0')
      .max(600, 'Máximo 600 minutos')
      .nullish(),
  })
  .superRefine((incidence, ctx) => {
    if (incidence.type === 'TARDANZA' && incidence.delayMinutes == null) {
      ctx.addIssue({ code: 'custom', path: ['delayMinutes'], message: 'Indica cuántos minutos llegarás tarde' });
    }
    if (incidence.type !== 'TARDANZA' && incidence.delayMinutes != null) {
      ctx.addIssue({ code: 'custom', path: ['delayMinutes'], message: 'Solo una tardanza lleva minutos de retraso' });
    }
  })
  .transform((incidence) => ({ ...incidence, delayMinutes: incidence.delayMinutes ?? null }));

export const confirmSchema = z.object({
  windowId: z.string({ error: 'Franja inválida' }).min(1, 'Franja inválida').optional(),
});

// G4: reprogramar (PROPUESTO) exige un plazo nuevo y futuro. Con los otros dos estados `votingDeadline`
// se ignora por completo: ni siquiera se valida su formato.
export const resolveIncidencesSchema = (now: Date) =>
  z
    .object({
      newState: z.enum(['CONFIRMADO', 'CANCELADO', 'PROPUESTO'], { error: 'Estado inválido: CONFIRMADO, CANCELADO o PROPUESTO' }),
      votingDeadline: z.unknown().optional(),
    })
    .transform((body, ctx): { newState: 'CONFIRMADO' | 'CANCELADO' | 'PROPUESTO'; votingDeadline: string | null } => {
      if (body.newState !== 'PROPUESTO') return { newState: body.newState, votingDeadline: null };
      if (body.votingDeadline === undefined) {
        ctx.issues.push({ code: 'custom', input: body, path: ['votingDeadline'], message: 'Para reprogramar indica una nueva fecha límite' });
        return z.NEVER;
      }
      const parsed = futureDeadline(now).safeParse(body.votingDeadline);
      if (!parsed.success) {
        for (const issue of parsed.error.issues) ctx.issues.push({ code: 'custom', input: body, path: ['votingDeadline'], message: issue.message });
        return z.NEVER;
      }
      return { newState: 'PROPUESTO', votingDeadline: new Date(parsed.data).toISOString() };
    });
