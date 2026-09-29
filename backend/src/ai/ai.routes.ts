import type { AiStatus } from '@hueckoapp/shared';
import { Router } from 'express';

import type { ResolvedDeps } from '../app';

// Montado en /api/ai detrás de requireAuth.
export function aiRouter({ ai }: ResolvedDeps) {
  const router = Router();

  // No llama a la IA: no pasa por el limitador.
  router.get('/status', (_req, res) => {
    const body: AiStatus = { provider: ai.provider };
    res.json(body);
  });

  return router;
}
