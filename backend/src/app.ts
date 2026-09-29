import cors from 'cors';
import express from 'express';
import helmet from 'helmet';

import { authRouter } from './auth/auth.routes';
import type { Db } from './db/database';
import { errorHandler, notFound } from './middleware/errors';

export type AppDeps = {
  db: Db;
  jwtSecret: string;
  jwtExpiresIn: string;
};

// La app se crea aparte de index.ts para poder probarla sin abrir un puerto
// y con una base de datos en memoria.
export function createApp(deps: AppDeps) {
  const app = express();

  app.use(helmet());
  app.use(cors());
  app.use(express.json({ limit: '1mb' }));

  const api = express.Router();
  api.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });
  api.use('/auth', authRouter(deps));

  app.use('/api', api);
  app.use(notFound);
  app.use(errorHandler);

  return app;
}
