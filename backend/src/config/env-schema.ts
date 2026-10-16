import { z } from 'zod';

import { THINKING_LEVELS } from '../ai/ai-client';
import { LOGIN_RATE_LIMIT_DEFAULT, REGISTER_RATE_LIMIT_DEFAULT } from '../auth/auth.routes';
import { trustProxySchema } from './trust-proxy';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);
const TLS_MODES = new Set(['require', 'verify-ca', 'verify-full']);

const parseUrl = (value: string): URL | null => {
  try {
    return new URL(value);
  } catch {
    return null;
  }
};

/** true si la URL de Postgres apunta a esta máquina (localhost, 127.0.0.1 o [::1]). */
export const isLocalDatabaseUrl = (value: string): boolean => {
  const url = parseUrl(value);
  return url !== null && LOCAL_HOSTS.has(url.hostname);
};

// Vacía = PGlite local (desarrollo). Con valor: Postgres (Neon), y con TLS si el servidor no es esta máquina (D9).
const databaseUrlSchema = z
  .string()
  .trim()
  .default('')
  .refine((value) => {
    if (value === '') return true;
    const url = parseUrl(value);
    return url !== null && (url.protocol === 'postgres:' || url.protocol === 'postgresql:') && url.hostname !== '';
  }, 'DATABASE_URL debe ser una URL postgresql://usuario:contraseña@host/base (ver .env.example)')
  .refine((value) => {
    const url = value === '' ? null : parseUrl(value);
    return url === null || LOCAL_HOSTS.has(url.hostname) || TLS_MODES.has(url.searchParams.get('sslmode') ?? '');
  }, 'DATABASE_URL apunta a otro servidor sin TLS: añade ?sslmode=verify-full (Neon lo exige).');

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
  // Base de datos (D9): DATABASE_URL de Neon en producción; vacía, PGlite en PGLITE_DATA_DIR.
  DATABASE_URL: databaseUrlSchema,
  PGLITE_DATA_DIR: z.string().trim().min(1, 'PGLITE_DATA_DIR no puede estar vacío').default('./data/pglite'),
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
  // Despliegue (ver .env.example): proxies delante del servidor y límites por IP de /auth.
  TRUST_PROXY: trustProxySchema,
  LOGIN_RATE_LIMIT: z.coerce.number().int().positive().default(LOGIN_RATE_LIMIT_DEFAULT),
  REGISTER_RATE_LIMIT: z.coerce.number().int().positive().default(REGISTER_RATE_LIMIT_DEFAULT),
}).superRefine((env, ctx) => {
  // En producción (Render) el disco es efímero: una base PGlite se perdería en cada despliegue.
  if (env.NODE_ENV === 'production' && env.DATABASE_URL === '') {
    ctx.addIssue({ code: 'custom', path: ['DATABASE_URL'], message: 'En producción DATABASE_URL es obligatoria (Neon): PGlite es solo para desarrollo.' });
  }
});

export type Env = z.output<typeof envSchema>;

// Sin efectos al importar: `env.ts` la usa al arrancar y `make-admin` dentro de su main (así sus errores salen limpios).
export const parseEnv = (source: NodeJS.ProcessEnv = process.env): Env => envSchema.parse(source);
