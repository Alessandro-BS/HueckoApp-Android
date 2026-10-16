import type { RequestHandler } from 'express';
import rateLimit from 'express-rate-limit';

import { getUserId } from '../auth/require-auth';
import { ApiError } from '../middleware/errors';

export const AI_RATE_LIMIT_DEFAULT = 20;

// Llamar a la IA cuesta: límite propio, por usuario (no por IP) y compartido por todas las rutas que la usan.
// Va siempre detrás de requireAuth.
export function aiRateLimiter(limit: number): RequestHandler {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    keyGenerator: (_req, res) => `user:${getUserId(res)}`,
    handler: (_req, _res, next) =>
      next(new ApiError(429, 'TOO_MANY_REQUESTS', 'Usaste mucho la IA en poco tiempo. Espera unos minutos.')),
  });
}
