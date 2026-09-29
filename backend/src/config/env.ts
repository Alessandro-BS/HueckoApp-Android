import 'dotenv/config';
import { z } from 'zod';

// Valida las variables de entorno al arrancar: si falta algo, el servidor
// no levanta y el error dice qué falta, en vez de fallar más tarde.
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET debe tener al menos 32 caracteres (ver .env.example)'),
  JWT_EXPIRES_IN: z.string().default('7d'),
  DATABASE_PATH: z.string().default('./data/hueckoapp.db'),
});

export const env = envSchema.parse(process.env);
