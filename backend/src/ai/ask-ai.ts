import type { z } from 'zod';

import { ApiError } from '../middleware/errors';
import type { AiClient, AiRequest } from './ai-client';

export const aiUnavailable = () =>
  new ApiError(503, 'AI_UNAVAILABLE', 'La IA no está disponible en este momento. Inténtalo en unos minutos.');

export const aiBadResponse = () =>
  new ApiError(502, 'AI_BAD_RESPONSE', 'La IA respondió algo que no pudimos interpretar. Inténtalo de nuevo.');

// Algunos modelos envuelven el JSON en ```json … ``` aunque se les pida JSON puro.
export const stripFences = (text: string) =>
  text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();

/**
 * Llama a la IA y valida su respuesta con zod. Nunca devuelve datos sin validar ni inventados:
 * el proveedor falla → 503 AI_UNAVAILABLE; JSON ilegible o fuera del esquema → 502 AI_BAD_RESPONSE.
 */
export async function askAi<S extends z.ZodType>(ai: AiClient, request: AiRequest, schema: S): Promise<z.output<S>> {
  let text: string;
  try {
    text = await ai.generateJson(request);
  } catch (error) {
    if (process.env.NODE_ENV !== 'test') console.error(`[ia] ${request.task}: el proveedor falló`, error);
    throw aiUnavailable();
  }
  let json: unknown;
  try {
    json = JSON.parse(stripFences(text));
  } catch {
    throw aiBadResponse();
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) throw aiBadResponse();
  return parsed.data;
}
