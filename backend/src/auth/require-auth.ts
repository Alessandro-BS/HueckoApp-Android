import type { UserRole, UserStatus } from '@hueckoapp/shared';
import type { RequestHandler, Response } from 'express';

import type { Db } from '../db/db';
import { ApiError } from '../middleware/errors';
import { verifyToken } from './tokens';

const unauthorized = () => new ApiError(401, 'UNAUTHORIZED', 'Tu sesión expiró. Inicia sesión de nuevo.');

export const accountSuspended = () =>
  new ApiError(403, 'ACCOUNT_SUSPENDED', 'Tu cuenta está suspendida. Si crees que es un error, escribe al equipo de HueckoApp.');

type AccessRow = { role: UserRole; status: UserStatus; session_version: number };

/**
 * Exige un JWT válido y una cuenta ACTIVE (D2). El rol y el estado se leen de la base en CADA petición: suspender
 * o cambiar el rol surte efecto al instante, sin esperar a que caduque el token, y nada de lo que venga dentro del
 * JWT (salvo `sub` y `sv`) cuenta. `sv` distinto de session_version → 401: así se cierran todas las sesiones anteriores
 * (p. ej. al recuperar la contraseña). No mira email_verified: una cuenta sin verificar nunca recibe un JWT.
 */
export async function authenticate(db: Db, secret: string, authorization: string | undefined): Promise<{ userId: string; role: UserRole }> {
  const [scheme, token] = (authorization ?? '').split(' ');
  const claims = scheme === 'Bearer' && token ? verifyToken(token, secret) : null;
  if (!claims) throw unauthorized();
  const { userId } = claims;
  const access = await db.one<AccessRow>('SELECT role, status, session_version FROM users WHERE id = $1', [userId]);
  if (!access) throw unauthorized(); // la cuenta ya no existe
  if (access.session_version !== claims.sessionVersion) throw unauthorized(); // sesión cerrada desde otro lado
  if (access.status === 'SUSPENDED') throw accountSuspended();
  return { userId, role: access.role };
}

export function requireAuth(db: Db, secret: string): RequestHandler {
  return async (req, res, next) => {
    // Ya comprobado en esta misma petición (p. ej. /groups/:id/ai/* atraviesa varios routers con este middleware).
    if (typeof res.locals.userId === 'string') return next();
    try {
      const { userId, role } = await authenticate(db, secret, req.get('authorization'));
      res.locals.userId = userId;
      res.locals.role = role;
      next();
    } catch (e) {
      next(e);
    }
  };
}

// Id del usuario autenticado. Solo se usa detrás de requireAuth.
export function getUserId(res: Response): string {
  const id = res.locals.userId;
  if (typeof id !== 'string') throw unauthorized();
  return id;
}

// Rol del usuario autenticado, tal como lo leyó requireAuth de la base.
export function getUserRole(res: Response): UserRole {
  const role = res.locals.role;
  if (role !== 'USER' && role !== 'ADMIN') throw unauthorized();
  return role;
}

// Rutas de administración (/api/admin). Va siempre detrás de requireAuth.
export const requireAdmin: RequestHandler = (_req, res, next) => {
  if (getUserRole(res) !== 'ADMIN') {
    return next(new ApiError(403, 'NOT_ADMIN', 'Solo la administración de HueckoApp puede hacer esto.'));
  }
  next();
};
