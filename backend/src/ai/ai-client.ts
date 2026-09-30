import type { AiProvider } from '@hueckoapp/shared';

// Qué se le pide a la IA. El cliente de demostración responde según la tarea; Gemini solo lee el prompt.
export type AiTask = 'schedule-ocr' | 'proposal-draft' | 'plan-suggestions' | 'voting-summary';

// JSON Schema de la respuesta (el subconjunto que acepta Gemini en response_format.schema).
export type JsonSchema = Record<string, unknown>;

// Niveles de razonamiento que acepta la Interactions API de Gemini (generation_config.thinking_level).
export const THINKING_LEVELS = ['minimal', 'low', 'medium', 'high'] as const;
export type ThinkingLevel = (typeof THINKING_LEVELS)[number];

export type AiImage = { data: Buffer; mimeType: string };

export type AiRequest = { task: AiTask; prompt: string; schema: JsonSchema; image?: AiImage };

// Frontera con el proveedor: devuelve el texto JSON tal cual (se valida después con zod en askAi).
// Lanza si el proveedor falla o se agota el tiempo.
export interface AiClient {
  readonly provider: AiProvider;
  generateJson(request: AiRequest): Promise<string>;
}
