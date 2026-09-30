import 'dotenv/config';
import { z } from 'zod';

import { THINKING_LEVELS } from '../ai/ai-client';

// Valida las variables de entorno al arrancar: si falta algo, el servidor
// no levanta y el error dice qué falta, en vez de fallar más tarde.
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET debe tener al menos 32 caracteres (ver .env.example)'),
  JWT_EXPIRES_IN: z
    .string()
    .regex(/^\d+[smhd]$/, 'JWT_EXPIRES_IN debe ser un número con unidad: s, m, h o d (p. ej. 7d)')
    .default('7d'),
  DATABASE_PATH: z.string().default('./data/hueckoapp.db'),
  // IA (Fase 4). Sin clave, la IA responde con datos de demostración (GET /ai/status → "mock").
  GEMINI_API_KEY: z.string().trim().default(''),
  GEMINI_MODEL: z.string().trim().min(1, 'GEMINI_MODEL no puede estar vacío').default('gemini-3.5-flash-lite'),
  GEMINI_FALLBACK_MODEL: z
    .string()
    .trim()
    .min(1, 'GEMINI_FALLBACK_MODEL no puede estar vacío')
    .default('gemini-3.5-flash'),
  GEMINI_THINKING_LEVEL: z.enum(THINKING_LEVELS).default('low'),
  GEMINI_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),
  AI_RATE_LIMIT: z.coerce.number().int().positive().default(20),
});

export const env = envSchema.parse(process.env);
