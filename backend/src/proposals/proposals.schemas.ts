import { z } from 'zod';

import { TIME_REGEX } from '../schedule/time-blocks.schemas';

const time = z.string({ error: 'Formato HH:mm' }).regex(TIME_REGEX, 'Formato HH:mm');

// Franja de una propuesta: mismas reglas de hora que los bloques de horario.
export const timeWindowInputSchema = z
  .object({
    dayOfWeek: z.number({ error: 'Día inválido' }).int('Día inválido').min(1, 'Día inválido').max(7, 'Día inválido'),
    startTime: time,
    endTime: time,
  })
  .superRefine((w, ctx) => {
    if (TIME_REGEX.test(w.startTime) && TIME_REGEX.test(w.endTime) && w.endTime <= w.startTime) {
      ctx.addIssue({ code: 'custom', path: ['endTime'], message: 'La hora de fin debe ser posterior a la de inicio' });
    }
  });

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

const windowKey = (w: { dayOfWeek: number; startTime: string; endTime: string }) => `${w.dayOfWeek}|${w.startTime}|${w.endTime}`;

export const createProposalSchema = (now: Date) =>
  z.object({
    title: z
      .string({ error: 'El título no puede estar vacío.' })
      .trim()
      .min(1, 'El título no puede estar vacío.')
      .max(80, 'Máximo 80 caracteres'),
    location: locationSchema.nullish().transform((l) => l ?? null),
    votingDeadline: futureDeadline(now),
    windows: z
      .array(timeWindowInputSchema, { error: 'Envía una lista de franjas' })
      .max(10, 'Máximo 10 franjas')
      .refine((ws) => new Set(ws.map(windowKey)).size === ws.length, 'Hay franjas repetidas')
      .default([]),
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
