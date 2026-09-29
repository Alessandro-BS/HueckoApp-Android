import type { TimeBlockInput } from '@hueckoapp/shared';
import { z } from 'zod';

import { TIME_REGEX } from '../schedule/time-blocks.schemas';
import type { JsonSchema } from './ai-client';

// Prompt de GeminiService.kt (domain spec §4), con la raíz { "blocks": [...] } que exige el esquema
// y qué hacer si la foto no es un horario.
export const OCR_PROMPT = [
  'Analiza esta imagen de un horario y extrae los bloques de tiempo.',
  'Devuelve un JSON con la forma {"blocks": [...]}. Cada objeto de la lista debe tener:',
  '- "dayOfWeek": un número del 1 (Lunes) al 7 (Domingo).',
  '- "startTime": hora de inicio en formato HH:mm.',
  '- "endTime": hora de fin en formato HH:mm.',
  '- "label": nombre de la actividad o clase.',
  '',
  'Si no estás seguro del día, intenta inferirlo por la posición en la tabla.',
  'Si la imagen no es un horario, devuelve {"blocks": []}.',
  'Responde SOLO el JSON.',
].join('\n');

export const OCR_JSON_SCHEMA: JsonSchema = {
  type: 'object',
  properties: {
    blocks: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          dayOfWeek: { type: 'integer', minimum: 1, maximum: 7 },
          startTime: { type: 'string', description: 'Hora de inicio HH:mm' },
          endTime: { type: 'string', description: 'Hora de fin HH:mm' },
          label: { type: 'string', description: 'Nombre de la clase o actividad' },
        },
        required: ['dayOfWeek', 'startTime', 'endTime', 'label'],
      },
    },
  },
  required: ['blocks'],
};

export const OCR_MAX_BLOCKS = 100;

// Raíz estricta: { blocks: [...] } o una lista suelta. Cada bloque se valida aparte en toOcrBlocks (D4).
export const ocrResponseSchema = z
  .union([z.array(z.unknown()), z.object({ blocks: z.array(z.unknown()) })])
  .transform((value) => (Array.isArray(value) ? value : value.blocks));

// "9:00" → "09:00": los modelos a veces omiten el cero de la hora.
const padHour = (value: string) => (/^\d:\d{2}$/.test(value) ? `0${value}` : value);
const time = z.string().trim().transform(padHour).pipe(z.string().regex(TIME_REGEX));

const ocrItemSchema = z
  .object({
    dayOfWeek: z.number().int().min(1).max(7),
    startTime: time,
    endTime: time,
    label: z
      .string()
      .trim()
      .min(1)
      .transform((s) => s.slice(0, 80)),
  })
  .refine((b) => b.startTime < b.endTime);

/**
 * Bloques válidos del OCR (domain spec §4, pasos 3–4): descarta los inválidos y los repetidos (mismo día, horas
 * y nombre sin distinguir mayúsculas), los deja como clases recurrentes (B13), ordena por día y hora y se queda
 * con los 100 primeros.
 */
export function toOcrBlocks(items: readonly unknown[]): TimeBlockInput[] {
  const seen = new Set<string>();
  const blocks: TimeBlockInput[] = [];
  for (const item of items) {
    const parsed = ocrItemSchema.safeParse(item);
    if (!parsed.success) continue;
    const { dayOfWeek, startTime, endTime, label } = parsed.data;
    const key = `${dayOfWeek}|${startTime}|${endTime}|${label.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    blocks.push({ label, type: 'CLASE', startTime, endTime, isRecurring: true, dayOfWeek, date: null });
  }
  return blocks
    .sort((a, b) => (a.dayOfWeek ?? 0) - (b.dayOfWeek ?? 0) || a.startTime.localeCompare(b.startTime))
    .slice(0, OCR_MAX_BLOCKS);
}
