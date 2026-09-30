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
  // Un 502 deja rastro para poder diagnosticarlo, pero solo la tarea y las rutas de los errores:
  // la respuesta puede llevar datos de usuarios y nunca se escribe en el log.
  const logInvalid = (...details: unknown[]) => {
    if (process.env.NODE_ENV !== 'test') console.warn(...details);
  };
  let json: unknown;
  try {
    json = JSON.parse(stripFences(text));
  } catch {
    logInvalid(`[ia] ${request.task}: la respuesta no es JSON`);
    throw aiBadResponse();
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    logInvalid(
      `[ia] ${request.task}: respuesta no válida`,
      parsed.error.issues.map((issue) => issue.path.join('.')),
    );
    throw aiBadResponse();
  }
  return parsed.data;
}
