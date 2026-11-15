import { timingSafeEqual } from 'node:crypto';

import { Router } from 'express';

import type { ResolvedDeps } from '../app';
import { ApiError } from '../middleware/errors';
import { tick } from './tick';

const BEARER = /^Bearer (.+)$/;

/** Compara en tiempo constante; longitudes distintas no coinciden (timingSafeEqual lanzaría). */
function sameSecret(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

// Rutas para el despertador (GitHub Actions): sin token de usuario, con el secreto compartido CRON_SECRET.
export function internalRouter({ db, push, now, cronSecret }: ResolvedDeps & { cronSecret: string }): Router {
  const router = Router();
  router.post('/tick', async (req, res) => {
    const given = BEARER.exec(req.header('authorization') ?? '')?.[1];
    if (given === undefined || !sameSecret(given, cronSecret)) throw new ApiError(401, 'UNAUTHORIZED', 'No autorizado.');
    res.json(await tick(db, push, now()));
  });
  return router;
}
