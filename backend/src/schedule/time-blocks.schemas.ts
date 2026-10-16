import { z } from 'zod';

export const BLOCK_TYPES = ['CLASE', 'TRABAJO', 'LIBRE', 'PUNTUAL'] as const;

// "HH:mm" de 00:00 a 23:59 con dos dígitos (misma regla que AddScheduleScreen.kt y la app).
export const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

// "2026-02-30" pasa la regex pero no existe: se comprueba que la fecha sea real.
const isRealDate = (value: string) => {
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
};

const time = z.string({ error: 'Formato HH:mm' }).regex(TIME_REGEX, 'Formato HH:mm');

export const timeBlockInputSchema = z
  .object({
    label: z
      .string({ error: 'El nombre es requerido' })
      .trim()
      .min(1, 'El nombre es requerido')
      .max(80, 'Máximo 80 caracteres'),
    type: z.enum(BLOCK_TYPES, { error: 'Tipo de bloque inválido' }),
    startTime: time,
    endTime: time,
    isRecurring: z.boolean({ error: 'Indica si el bloque es recurrente' }),
    dayOfWeek: z
      .number({ error: 'Día inválido' })
      .int('Día inválido')
      .min(1, 'Día inválido')
      .max(7, 'Día inválido')
      .nullish(),
    date: z
      .string({ error: 'Fecha inválida (YYYY-MM-DD)' })
      .regex(DATE_REGEX, 'Fecha inválida (YYYY-MM-DD)')
      .refine(isRealDate, 'Fecha inválida (YYYY-MM-DD)')
      .nullish(),
  })
  .superRefine((block, ctx) => {
    // Solo se compara el orden si ambas horas tienen buen formato (si no, ya hay un error en el campo).
    if (TIME_REGEX.test(block.startTime) && TIME_REGEX.test(block.endTime) && block.endTime <= block.startTime) {
      ctx.addIssue({ code: 'custom', path: ['endTime'], message: 'La hora de fin debe ser posterior a la de inicio' });
    }
    if (block.isRecurring) {
      if (block.dayOfWeek == null) {
        ctx.addIssue({ code: 'custom', path: ['dayOfWeek'], message: 'El día es requerido en un bloque recurrente' });
      }
      if (block.date != null) {
        ctx.addIssue({ code: 'custom', path: ['date'], message: 'Un bloque recurrente no lleva fecha' });
      }
    } else {
      if (block.date == null) {
        ctx.addIssue({ code: 'custom', path: ['date'], message: 'La fecha es requerida en un bloque puntual' });
      }
      if (block.dayOfWeek != null) {
        ctx.addIssue({ code: 'custom', path: ['dayOfWeek'], message: 'Un bloque puntual no lleva día de la semana' });
      }
    }
  })
  // Lo omitido se guarda como null, igual que en el contrato.
  .transform((block) => ({ ...block, dayOfWeek: block.dayOfWeek ?? null, date: block.date ?? null }));

export const bulkTimeBlocksSchema = z.object({
  blocks: z
    .array(timeBlockInputSchema, { error: 'Envía una lista de bloques' })
    .min(1, 'Envía al menos un bloque')
    .max(100, 'Máximo 100 bloques'),
});
