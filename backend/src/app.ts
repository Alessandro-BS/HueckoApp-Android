import cors from 'cors';
import express from 'express';

import { errorHandler, notFound } from './middleware/errors';

// La app se crea aparte de index.ts para poder probarla sin abrir un puerto.
export function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json({ limit: '1mb' }));

  const api = express.Router();
  api.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });
  // Fase 1 en adelante: api.use('/auth', authRouter), api.use('/groups', groupsRouter)...

  app.use('/api', api);
  app.use(notFound);
  app.use(errorHandler);

  return app;
}
