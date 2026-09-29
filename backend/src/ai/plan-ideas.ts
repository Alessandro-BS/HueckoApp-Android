import type { Group, MatchWindow, PlanCategory } from '@hueckoapp/shared';
import { z } from 'zod';

import { nextOccurrence } from '../proposals/rules';
import type { JsonSchema } from './ai-client';
import { userData } from './prompt';
import { numberedWindows, todayLabel } from './plan-context';

export const PLAN_CATEGORIES = ['ESTUDIO', 'REUNION', 'COMIDA', 'DEPORTE', 'SALIDA', 'OTRO'] as const satisfies readonly PlanCategory[];

const CATEGORY_HELP =
  'ESTUDIO (estudiar, repasar, hacer tareas), REUNION (avance de proyecto, coordinar), COMIDA (almorzar, cenar, café), ' +
  'DEPORTE, SALIDA (cine, paseo, fiesta) u OTRO';

export const DEFAULT_DEADLINE_HOURS = 48;
export const SUGGESTION_COUNT = 3;
const HOUR = 60 * 60 * 1000;

// Entrada de POST /groups/:id/ai/proposal-draft.
export const proposalDraftInputSchema = z.object({
  text: z
    .string({ error: 'Cuéntale a Huecko qué plan quieres' })
    .trim()
    .min(3, 'Escribe al menos 3 caracteres')
    .max(500, 'Máximo 500 caracteres'),
});

// Piezas comunes. Lo imprescindible (título, motivo) es estricto; lo accesorio se corrige en vez de fallar.
const titleSchema = z
  .string()
  .trim()
  .min(1)
  .transform((s) => s.slice(0, 80));
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .nullish()
    .catch(null)
    .transform((s) => (s ? s.slice(0, max) : null));
const categorySchema = z.enum(PLAN_CATEGORIES).catch('OTRO');
const windowIndexSchema = z.number().int().nullable().catch(null);

export const draftResponseSchema = z.object({
  title: titleSchema,
  category: categorySchema,
  placeName: optionalText(100),
  windowIndex: windowIndexSchema,
  deadlineHours: z.number().int().min(1).max(168).catch(DEFAULT_DEADLINE_HOURS),
});

export const DRAFT_JSON_SCHEMA: JsonSchema = {
  type: 'object',
  properties: {
    title: { type: 'string', description: 'Título corto del plan (máx. 80 caracteres)' },
    category: { type: 'string', enum: [...PLAN_CATEGORIES] },
    placeName: { type: ['string', 'null'], description: 'Lugar del plan, o null' },
    windowIndex: { type: ['integer', 'null'], description: 'Número de la franja elegida de la lista, o null' },
    deadlineHours: { type: 'integer', minimum: 1, maximum: 168, description: 'Horas hasta el cierre de la votación' },
  },
  required: ['title', 'category', 'placeName', 'windowIndex', 'deadlineHours'],
};

export function draftPrompt({ text, group, windows, now }: { text: string; group: Group; windows: readonly MatchWindow[]; now: Date }): string {
  return [
    `Ayuda a organizar un plan para un grupo de ${group.members.length} integrantes. Hoy es ${todayLabel(now)}.`,
    'A partir de la descripción del usuario, arma un borrador de propuesta:',
    '- "title": un título corto y claro en español.',
    `- "category": una de ${CATEGORY_HELP}.`,
    '- "placeName": el lugar si el usuario lo menciona o si hay uno obvio; si no, null.',
    '- "windowIndex": el número de la franja de la lista que mejor encaje con lo que pide (día, momento del día, duración). ' +
      'Solo puedes elegir un número de la lista; si ninguna encaja, null.',
    `- "deadlineHours": en cuántas horas debería cerrar la votación (entre 1 y 168; si no dice nada, ${DEFAULT_DEADLINE_HOURS}).`,
    '',
    'Franjas en las que el grupo está libre (semana tipo):',
    numberedWindows(windows),
    '',
    'Nombre del grupo:',
    userData(group.name),
    '',
    'Descripción del usuario:',
    userData(text),
  ].join('\n');
}

/**
 * D7: ahora + las horas que propone la IA, redondeado a la hora en punto. Con franja, la votación cierra como tarde
 * 1 h antes de su próximo inicio, siempre que eso deje al menos 1 h desde ahora (si no, se ignora la franja).
 */
export function draftDeadline(now: Date, hours: number, window: MatchWindow | null): string {
  let deadline = new Date(now.getTime() + hours * HOUR);
  deadline.setMinutes(0, 0, 0);
  if (window) {
    const cutoff = new Date(nextOccurrence(window.dayOfWeek, window.startTime, now).getTime() - HOUR);
    if (cutoff.getTime() >= now.getTime() + HOUR && cutoff.getTime() < deadline.getTime()) deadline = cutoff;
  }
  return deadline.toISOString();
}

const suggestionItemSchema = z.object({
  title: titleSchema,
  category: categorySchema,
  placeIdea: optionalText(100),
  windowIndex: windowIndexSchema,
  reason: z
    .string()
    .trim()
    .min(1)
    .transform((s) => s.slice(0, 200)),
});

// D8: las ideas inválidas se descartan; si no queda ninguna, la respuesta no sirve (502).
export const suggestionsResponseSchema = z.object({ suggestions: z.array(z.unknown()) }).transform((value, ctx) => {
  const valid = value.suggestions.flatMap((item) => {
    const parsed = suggestionItemSchema.safeParse(item);
    return parsed.success ? [parsed.data] : [];
  });
  if (valid.length === 0) {
    ctx.issues.push({ code: 'custom', input: value, message: 'La IA no propuso ninguna idea válida' });
    return z.NEVER;
  }
  return valid.slice(0, SUGGESTION_COUNT);
});

export const SUGGESTIONS_JSON_SCHEMA: JsonSchema = {
  type: 'object',
  properties: {
    suggestions: {
      type: 'array',
      minItems: SUGGESTION_COUNT,
      maxItems: SUGGESTION_COUNT,
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          category: { type: 'string', enum: [...PLAN_CATEGORIES] },
          placeIdea: { type: ['string', 'null'] },
          windowIndex: { type: ['integer', 'null'] },
          reason: { type: 'string' },
        },
        required: ['title', 'category', 'placeIdea', 'windowIndex', 'reason'],
      },
    },
  },
  required: ['suggestions'],
};

export function suggestionsPrompt({
  group, windows, recentTitles, now,
}: { group: Group; windows: readonly MatchWindow[]; recentTitles: readonly string[]; now: Date }): string {
  return [
    `Propón ${SUGGESTION_COUNT} ideas de plan distintas para un grupo de ${group.members.length} integrantes. Hoy es ${todayLabel(now)}.`,
    'Cada idea debe ser fácil de organizar y aprovechar un hueco en el que el grupo está libre:',
    '- "title": título corto en español.',
    `- "category": una de ${CATEGORY_HELP}.`,
    '- "placeIdea": un tipo de lugar o un lugar concreto; null si no aplica.',
    '- "windowIndex": el número de la franja de la lista que mejor le va a la idea (solo números de la lista; null si la lista está vacía).',
    '- "reason": una frase que explique por qué encaja (máx. 200 caracteres).',
    'No repitas planes que el grupo ya propuso.',
    '',
    'Franjas en las que el grupo está libre (semana tipo):',
    numberedWindows(windows),
    '',
    'Datos del grupo:',
    userData(
      [
        `Nombre: ${group.name}`,
        `Descripción: ${group.description || '(sin descripción)'}`,
        `Planes ya propuestos: ${recentTitles.length > 0 ? recentTitles.join(' | ') : '(ninguno)'}`,
      ].join('\n'),
    ),
  ].join('\n');
}
