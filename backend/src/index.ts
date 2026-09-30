import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

import { createGeminiClient } from './ai/gemini-client';
import { createMockAiClient } from './ai/mock-client';
import { createApp } from './app';
import { env } from './config/env';
import { openDatabase } from './db/database';

mkdirSync(dirname(env.DATABASE_PATH), { recursive: true });
const db = openDatabase(env.DATABASE_PATH);

// Sin clave, la IA responde con datos de demostración para que la app se pueda probar igual (D2).
const ai = env.GEMINI_API_KEY
  ? createGeminiClient({
      apiKey: env.GEMINI_API_KEY,
      model: env.GEMINI_MODEL,
      fallbackModel: env.GEMINI_FALLBACK_MODEL,
      timeoutMs: env.GEMINI_TIMEOUT_MS,
      thinkingLevel: env.GEMINI_THINKING_LEVEL,
    })
  : createMockAiClient();
if (ai.provider === 'mock') console.warn('GEMINI_API_KEY está vacía: Huecko IA responde con datos de demostración.');

if (env.TRUST_PROXY === true) {
  console.warn('TRUST_PROXY=true confía en cualquier X-Forwarded-For: usa el número de proxies (p. ej. TRUST_PROXY=1).');
}
if (env.NODE_ENV === 'production' && env.TRUST_PROXY === false) {
  console.warn(
    'TRUST_PROXY=false en producción: si el servidor está detrás de un proxy (Render, Railway, nginx…), todos los clientes compartirán una sola IP para los límites de intentos. Usa TRUST_PROXY=1 (el número de proxies).',
  );
}

createApp({
  db,
  jwtSecret: env.JWT_SECRET,
  jwtExpiresIn: env.JWT_EXPIRES_IN,
  trustProxy: env.TRUST_PROXY,
  loginRateLimit: env.LOGIN_RATE_LIMIT,
  registerRateLimit: env.REGISTER_RATE_LIMIT,
  ai,
  aiRateLimit: env.AI_RATE_LIMIT,
}).listen(env.PORT, () => {
  console.log(`HueckoApp API escuchando en http://localhost:${env.PORT}/api`);
});
