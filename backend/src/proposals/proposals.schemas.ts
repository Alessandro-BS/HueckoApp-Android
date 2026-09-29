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
