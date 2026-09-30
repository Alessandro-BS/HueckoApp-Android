import type { Server } from 'node:http';

import { createGeminiClient } from './ai/gemini-client';
import { createMockAiClient } from './ai/mock-client';
import { createApp } from './app';
import { env } from './config/env';
import { databaseConfig, openDatabase } from './db/connect';
import type { Db } from './db/db';

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
if (env.NODE_ENV === 'production' && !env.TRUST_PROXY) {
  console.warn(
    'TRUST_PROXY=false en producción: si el servidor está detrás de un proxy (Render, Railway, nginx…), todos los clientes compartirán una sola IP para los límites de intentos. Usa TRUST_PROXY=1 (el número de proxies).',
  );
}

// Ctrl+C o el apagado de Render: deja de aceptar peticiones, termina las que están en curso y cierra la base
// (PGlite suelta su carpeta y su candado; Postgres, sus conexiones). Si algo se cuelga, sale a los 10 s.
// Los manejadores van antes de abrir la base: una señal durante las migraciones también la cierra bien.
let db: Db | undefined;
let server: Server | undefined;
let stopping = false;

// Cierra la base (si llegó a abrirse) y sale con `code`, o con 1 si cerrarla falla.
function closeAndExit(code: number): void {
  const closed = db
    ? db.close().then(
        () => code,
        (error: unknown) => {
          console.error('No se pudo cerrar la base de datos:', error instanceof Error ? error.message : error);
          return 1;
        },
      )
    : Promise.resolve(code);
  void closed.then((exitCode) => process.exit(exitCode));
}

function shutdown(signal: NodeJS.Signals): void {
  if (stopping) return;
  stopping = true;
  console.log(`${signal}: cerrando el servidor…`);
  setTimeout(() => process.exit(1), 10_000).unref();
  if (server) server.close(() => closeAndExit(0));
  else if (db) closeAndExit(0);
  // Si la base aún se está abriendo, main la cierra en cuanto esté lista (stopping).
}
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);

async function main() {
  // Postgres (Neon) con DATABASE_URL; si no, PGlite en PGLITE_DATA_DIR. Crea las tablas que falten (migraciones).
  db = await openDatabase(databaseConfig(env));
  if (stopping) return closeAndExit(0);
  console.log(`Base de datos: ${db.description}`);

  server = createApp({
    db,
    jwtSecret: env.JWT_SECRET,
    jwtExpiresIn: env.JWT_EXPIRES_IN,
    trustProxy: env.TRUST_PROXY,
    loginRateLimit: env.LOGIN_RATE_LIMIT,
    registerRateLimit: env.REGISTER_RATE_LIMIT,
    ai,
    aiRateLimit: env.AI_RATE_LIMIT,
  }).listen(env.PORT, (error?: NodeJS.ErrnoException) => {
    // Express 5 llama a este callback también si no puede escuchar (p. ej. un puerto ocupado): sin tratarlo aquí,
    // el servidor diría que escucha y la base quedaría sin cerrar.
    if (error) {
      console.error(
        error.code === 'EADDRINUSE'
          ? `El puerto ${env.PORT} ya está en uso: detén el otro proceso o cambia PORT en backend/.env.`
          : `No se pudo abrir el servidor: ${error.message}`,
      );
      return closeAndExit(1);
    }
    console.log(`HueckoApp API escuchando en http://localhost:${env.PORT}/api`);
  });
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  closeAndExit(1);
});
