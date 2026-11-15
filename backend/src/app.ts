import cors from 'cors';
import express, { type RequestHandler } from 'express';
import helmet from 'helmet';

import { adminRouter } from './admin/admin.routes';
import type { AiClient } from './ai/ai-client';
import { AI_RATE_LIMIT_DEFAULT, aiRateLimiter } from './ai/ai-limiter';
import { aiRouter, groupAiRouter, proposalAiRouter } from './ai/ai.routes';
import { createMockAiClient } from './ai/mock-client';
import { authRouter } from './auth/auth.routes';
import type { GoogleVerifier } from './auth/google-verifier';
import { requireAdmin, requireAuth } from './auth/require-auth';
import type { TrustProxy } from './config/trust-proxy';
import type { Db } from './db/db';
import { createConsoleEmailClient, type EmailClient } from './email/email-client';
import { groupsRouter } from './groups/groups.routes';
import { meRouter } from './me/me.routes';
import { errorHandler, notFound } from './middleware/errors';
import { internalRouter } from './notifications/internal.routes';
import { createFlushScheduler } from './notifications/flush-scheduler';
import type { PushClient } from './notifications/push-client';
import { pushDevicesRouter } from './notifications/push-devices.routes';
import { EXPRESS_VOTE_MINUTES_DEFAULT } from './proposals/express-rules';
import { groupProposalsRouter, proposalsRouter } from './proposals/proposals.routes';
import { proximityRouter } from './proximity/proximity.routes';
import { timeBlocksRouter } from './schedule/time-blocks.routes';

export type AppDeps = {
  db: Db;
  jwtSecret: string;
  jwtExpiresIn: string;
  // Proxies delante del servidor (app.set('trust proxy')): false si se omite. Ver TRUST_PROXY en .env.example.
  trustProxy?: TrustProxy;
  // Intentos por IP cada 15 min en /auth/login (20) y /auth/register (10) si se omiten; las pruebas los cambian.
  loginRateLimit?: number;
  registerRateLimit?: number;
  // Reloj de la app (plazos de votación, scheduledAt). Los tests lo fijan; por defecto, la hora real.
  now?: () => Date;
  // Cliente de IA. Si se omite, el de demostración (como sin GEMINI_API_KEY); los tests inyectan uno falso.
  ai?: AiClient;
  // Llamadas a la IA por usuario cada 15 min (20 si se omite); las pruebas lo suben.
  aiRateLimit?: number;
  // Avisos de proximidad (invite + join) por usuario y minuto (10 si se omite); las pruebas lo suben.
  proximityRateLimit?: number;
  // Minutos que dura una votación exprés (EXPRESS_VOTE_MINUTES; 60 si se omite).
  expressVoteMinutes?: number;
  // Recibe las tareas que siguen tras responder (p. ej. la recomendación de la IA) para que los tests las esperen.
  onBackgroundTask?: (task: Promise<void>) => void;
  // Cliente de la Expo Push API. Con él, al terminar cada petición a /api se envían los avisos pendientes en segundo
  // plano; sin él (la mayoría de los tests) no se envía nada.
  push?: PushClient;
  // Secreto del despertador (CRON_SECRET). Con él se monta POST /api/internal/tick; sin él, esa ruta no existe.
  cronSecret?: string;
  // Cliente de correo (códigos de verificación). Si se omite, el de consola (el código sale en el log); los tests inyectan uno falso.
  email?: EmailClient;
  // Intentos por IP cada 15 min en verify/resend/forgot (CODE_RATE_LIMIT; 30 si se omite); las pruebas lo suben.
  codeRateLimit?: number;
  // Intentos por cuenta cada 15 min entre activar y desactivar el 2FA (5 si se omite): frena adivinar la contraseña con un token robado.
  twoFactorRateLimit?: number;
  // Verificador de idTokens de Google. Sin él (no hay GOOGLE_WEB_CLIENT_ID), POST /auth/google responde 503.
  google?: GoogleVerifier;
  // Correos con código en 24 h entre todas las cuentas (BREVO_DAILY_LIMIT; 280 si se omite); las pruebas lo bajan.
  brevoDailyLimit?: number;
};

// El único reloj por defecto de la app; los routers reciben las dependencias con `now` ya resuelto.
export const systemClock = (): Date => new Date();
export type ResolvedDeps = AppDeps & { now: () => Date; ai: AiClient; aiLimiter: RequestHandler; expressVoteMinutes: number; email: EmailClient };

// La app se crea aparte de index.ts para poder probarla sin abrir un puerto
// y con una base de datos en memoria.
export function createApp(appDeps: AppDeps) {
  const deps: ResolvedDeps = {
    ...appDeps,
    now: appDeps.now ?? systemClock,
    ai: appDeps.ai ?? createMockAiClient(),
    // Una sola instancia: todas las rutas de IA cuentan contra el mismo límite.
    aiLimiter: aiRateLimiter(appDeps.aiRateLimit ?? AI_RATE_LIMIT_DEFAULT),
    expressVoteMinutes: appDeps.expressVoteMinutes ?? EXPRESS_VOTE_MINUTES_DEFAULT,
    email: appDeps.email ?? createConsoleEmailClient(),
  };
  const app = express();
  // Con un proxy delante, req.ip (y por tanto los límites por IP) sale de X-Forwarded-For solo si se confía en él.
  app.set('trust proxy', appDeps.trustProxy ?? false);

  app.use(helmet());
  app.use(cors());
  app.use(express.json({ limit: '1mb' }));

  const api = express.Router();
  if (appDeps.push) {
    // Lo que una petición encoló sale al terminarla, sin hacerla esperar. También tras los GET (las lecturas cierran
    // votaciones vencidas y encolan sus avisos), salvo /health, que no toca la base.
    const flusher = createFlushScheduler({ db: deps.db, push: appDeps.push, now: deps.now, onBackgroundTask: deps.onBackgroundTask });
    api.use((req, res, next) => {
      if (!(req.method === 'GET' && req.path === '/health')) res.on('finish', () => flusher.kick());
      next();
    });
  }
  api.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });
  api.use('/auth', authRouter(deps));
  // Sin token de usuario: lo protege el secreto compartido.
  if (appDeps.cronSecret) api.use('/internal', internalRouter({ ...deps, cronSecret: appDeps.cronSecret }));
  // Un único middleware para todas las rutas con token: lee rol y estado de la base en cada petición (D2).
  const auth = requireAuth(deps.db, deps.jwtSecret);
  api.use('/me/time-blocks', auth, timeBlocksRouter(deps));
  api.use('/me/push-devices', auth, pushDevicesRouter(deps));
  api.use('/me', auth, meRouter(deps));
  api.use('/groups', auth, groupsRouter(deps));
  // groupsRouter no tiene /:id/proposals: esas peticiones pasan de largo y las atiende este router.
  api.use('/groups', auth, groupProposalsRouter(deps));
  // /groups/:id/ai/... tampoco lo atienden los dos routers anteriores: llega hasta aquí.
  api.use('/groups', auth, groupAiRouter(deps));
  api.use('/proposals', auth, proposalsRouter(deps));
  api.use('/proposals', auth, proposalAiRouter(deps));
  api.use('/ai', auth, aiRouter(deps));
  api.use('/proximity', auth, proximityRouter(deps));
  // Administración de la app (Fase 4.5): además del token, rol ADMIN leído de la base (D2).
  api.use('/admin', auth, requireAdmin, adminRouter(deps));

  app.use('/api', api);
  app.use(notFound);
  app.use(errorHandler);

  return app;
}
