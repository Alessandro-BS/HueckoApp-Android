import cors from 'cors';
import express from 'express';
import helmet from 'helmet';

import { authRouter } from './auth/auth.routes';
import { requireAuth } from './auth/require-auth';
import type { Db } from './db/database';
import { groupsRouter } from './groups/groups.routes';
import { errorHandler, notFound } from './middleware/errors';
import { groupProposalsRouter, proposalsRouter } from './proposals/proposals.routes';
import { timeBlocksRouter } from './schedule/time-blocks.routes';

export type AppDeps = {
  db: Db;
  jwtSecret: string;
  jwtExpiresIn: string;
  // Intentos por IP cada 15 min en /auth (20 si se omite); las pruebas lo suben.
  authRateLimit?: number;
  // Reloj de la app (plazos de votación, scheduledAt). Los tests lo fijan; por defecto, la hora real.
  now?: () => Date;
};

// El único reloj por defecto de la app; los routers reciben las dependencias con `now` ya resuelto.
export const systemClock = (): Date => new Date();
export type ResolvedDeps = AppDeps & { now: () => Date };

// La app se crea aparte de index.ts para poder probarla sin abrir un puerto
// y con una base de datos en memoria.
export function createApp(appDeps: AppDeps) {
  const deps: ResolvedDeps = { ...appDeps, now: appDeps.now ?? systemClock };
  const app = express();

  app.use(helmet());
  app.use(cors());
  app.use(express.json({ limit: '1mb' }));

  const api = express.Router();
  api.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });
  api.use('/auth', authRouter(deps));
  api.use('/me/time-blocks', requireAuth(deps.jwtSecret), timeBlocksRouter(deps));
  api.use('/groups', requireAuth(deps.jwtSecret), groupsRouter(deps));
  // groupsRouter no tiene /:id/proposals: esas peticiones pasan de largo y las atiende este router.
  api.use('/groups', requireAuth(deps.jwtSecret), groupProposalsRouter(deps));
  api.use('/proposals', requireAuth(deps.jwtSecret), proposalsRouter(deps));

  app.use('/api', api);
  app.use(notFound);
  app.use(errorHandler);

  return app;
}
