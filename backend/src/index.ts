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
    })
  : createMockAiClient();
if (ai.provider === 'mock') console.warn('GEMINI_API_KEY está vacía: Huecko IA responde con datos de demostración.');

createApp({ db, jwtSecret: env.JWT_SECRET, jwtExpiresIn: env.JWT_EXPIRES_IN, ai, aiRateLimit: env.AI_RATE_LIMIT }).listen(env.PORT, () => {
  console.log(`HueckoApp API escuchando en http://localhost:${env.PORT}/api`);
});
