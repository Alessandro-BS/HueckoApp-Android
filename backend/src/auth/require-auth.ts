import type { RequestHandler, Response } from 'express';

import { ApiError } from '../middleware/errors';
import { verifyToken } from './tokens';

const unauthorized = () => new ApiError(401, 'UNAUTHORIZED', 'Tu sesión expiró. Inicia sesión de nuevo.');

export function requireAuth(secret: string): RequestHandler {
  return (req, res, next) => {
    const header = req.get('authorization') ?? '';
    const [scheme, token] = header.split(' ');
    const userId = scheme === 'Bearer' && token ? verifyToken(token, secret) : null;
    if (!userId) return next(unauthorized());
    res.locals.userId = userId;
    next();
  };
}

// Id del usuario autenticado. Solo se usa detrás de requireAuth.
export function getUserId(res: Response): string {
  const id = res.locals.userId;
  if (typeof id !== 'string') throw unauthorized();
  return id;
}
