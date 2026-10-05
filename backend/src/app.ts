import cors from 'cors';
import express, { type RequestHandler } from 'express';
import helmet from 'helmet';

import { adminRouter } from './admin/admin.routes';
import type { AiClient } from './ai/ai-client';
import { AI_RATE_LIMIT_DEFAULT, aiRateLimiter } from './ai/ai-limiter';
import { aiRouter, groupAiRouter, proposalAiRouter } from './ai/ai.routes';
import { createMockAiClient } from './ai/mock-client';
import { authRouter } from './auth/auth.routes';
import { requireAdmin, requireAuth } from './auth/require-auth';
import type { TrustProxy } from './config/trust-proxy';
import type { Db } from './db/db';
import { groupsRouter } from './groups/groups.routes';
import { meRouter } from './me/me.routes';
import { errorHandler, notFound } from './middleware/errors';
import { groupProposalsRouter, proposalsRouter } from './proposals/proposals.routes';
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
};

// El único reloj por defecto de la app; los routers reciben las dependencias con `now` ya resuelto.
export const systemClock = (): Date => new Date();
export type ResolvedDeps = AppDeps & { now: () => Date; ai: AiClient; aiLimiter: RequestHandler };

// La app se crea aparte de index.ts para poder probarla sin abrir un puerto
// y con una base de datos en memoria.
export function createApp(appDeps: AppDeps) {
  const deps: ResolvedDeps = {
    ...appDeps,
    now: appDeps.now ?? systemClock,
    ai: appDeps.ai ?? createMockAiClient(),
    // Una sola instancia: todas las rutas de IA cuentan contra el mismo límite.
    aiLimiter: aiRateLimiter(appDeps.aiRateLimit ?? AI_RATE_LIMIT_DEFAULT),
  };
  const app = express();
  // Con un proxy delante, req.ip (y por tanto los límites por IP) sale de X-Forwarded-For solo si se confía en él.
  app.set('trust proxy', appDeps.trustProxy ?? false);

  app.use(helmet());
  app.use(cors());
  app.use(express.json({ limit: '1mb' }));

  const api = express.Router();
  api.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });
  api.use('/auth', authRouter(deps));
  // Un único middleware para todas las rutas con token: lee rol y estado de la base en cada petición (D2).
  const auth = requireAuth(deps.db, deps.jwtSecret);
  api.use('/me/time-blocks', auth, timeBlocksRouter(deps));
  api.use('/me', auth, meRouter(deps));
  api.use('/groups', auth, groupsRouter(deps));
  // groupsRouter no tiene /:id/proposals: esas peticiones pasan de largo y las atiende este router.
  api.use('/groups', auth, groupProposalsRouter(deps));
  // /groups/:id/ai/... tampoco lo atienden los dos routers anteriores: llega hasta aquí.
  api.use('/groups', auth, groupAiRouter(deps));
  api.use('/proposals', auth, proposalsRouter(deps));
  api.use('/proposals', auth, proposalAiRouter(deps));
  api.use('/ai', auth, aiRouter(deps));
  // Administración de la app (Fase 4.5): además del token, rol ADMIN leído de la base (D2).
  api.use('/admin', auth, requireAdmin, adminRouter(deps));

  app.use('/api', api);
  app.use(notFound);
  app.use(errorHandler);

  return app;
}
