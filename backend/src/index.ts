import type { Server } from 'node:http';

import { createGeminiClient } from './ai/gemini-client';
import { createMockAiClient } from './ai/mock-client';
import { createApp } from './app';
import { createGoogleVerifier } from './auth/google-verifier';
import { env } from './config/env';
import { databaseConfig, openDatabase } from './db/connect';
import type { Db } from './db/db';
import { createBrevoEmailClient } from './email/brevo-client';
import { createConsoleEmailClient } from './email/email-client';
import { createExpoPushClient } from './notifications/push-client';
import { tick } from './notifications/tick';

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

// Sin clave de Brevo (desarrollo), los códigos de verificación se escriben en el log en vez de enviarse por correo.
const email =
  env.BREVO_API_KEY && env.BREVO_SENDER_EMAIL
    ? createBrevoEmailClient({ apiKey: env.BREVO_API_KEY, senderEmail: env.BREVO_SENDER_EMAIL, senderName: env.BREVO_SENDER_NAME })
    : createConsoleEmailClient();
if (!env.BREVO_API_KEY) console.warn('BREVO_API_KEY está vacía: los códigos se escriben en este log en vez de enviarse por correo.');

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
let sweep: NodeJS.Timeout | undefined;
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
  if (sweep) clearInterval(sweep);
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

  // Avisos push: el barrido corre cada minuto en este proceso (y el despertador de GitHub Actions lo mantiene vivo).
  const push = createExpoPushClient({ accessToken: env.EXPO_ACCESS_TOKEN });
  server = createApp({
    db,
    jwtSecret: env.JWT_SECRET,
    jwtExpiresIn: env.JWT_EXPIRES_IN,
    trustProxy: env.TRUST_PROXY,
    loginRateLimit: env.LOGIN_RATE_LIMIT,
    registerRateLimit: env.REGISTER_RATE_LIMIT,
    ai,
    aiRateLimit: env.AI_RATE_LIMIT,
    expressVoteMinutes: env.EXPRESS_VOTE_MINUTES,
    push,
    cronSecret: env.CRON_SECRET,
    email,
    codeRateLimit: env.CODE_RATE_LIMIT,
    brevoDailyLimit: env.BREVO_DAILY_LIMIT,
    google: env.GOOGLE_WEB_CLIENT_ID ? createGoogleVerifier(env.GOOGLE_WEB_CLIENT_ID) : undefined,
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
    // Cierra votaciones vencidas, encola recordatorios y envía lo pendiente; tick nunca lanza.
    const openDb = db!;
    sweep = setInterval(() => void tick(openDb, push, new Date()), 60_000);
    sweep.unref();
    console.log(`HueckoApp API escuchando en http://localhost:${env.PORT}/api`);
  });
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  closeAndExit(1);
});
