import { Router } from 'express';
import rateLimit from 'express-rate-limit';

import type { AuthResponse } from '@hueckoapp/shared';
import type { AppDeps } from '../app';
import { ApiError } from '../middleware/errors';
import { usersRepository } from '../users/users.repository';
import { loginSchema, registerSchema } from './auth.schemas';
import { DUMMY_HASH, hashPassword, verifyPassword } from './passwords';
import { getUserId, requireAuth } from './require-auth';
import { signToken } from './tokens';

export const LOGIN_RATE_LIMIT_DEFAULT = 20;
export const REGISTER_RATE_LIMIT_DEFAULT = 10;

// Frena la fuerza bruta por IP cada 15 minutos. La IP es req.ip: detrás de un proxy depende de TRUST_PROXY (D9).
function authLimiter(limit: number) {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_req, _res, next) => next(new ApiError(429, 'TOO_MANY_REQUESTS', 'Demasiados intentos. Espera unos minutos.')),
  });
}

export function authRouter({
  db,
  jwtSecret,
  jwtExpiresIn,
  loginRateLimit = LOGIN_RATE_LIMIT_DEFAULT,
  registerRateLimit = REGISTER_RATE_LIMIT_DEFAULT,
}: AppDeps) {
  const router = Router();
  const users = usersRepository(db);
  // Contadores separados (D10): crear cuentas no gasta los intentos de entrar, ni al revés.
  const loginLimiter = authLimiter(loginRateLimit);
  const registerLimiter = authLimiter(registerRateLimit);

  router.post('/register', registerLimiter, async (req, res) => {
    const { name, email, password } = registerSchema.parse(req.body);
    if (users.findByEmail(email)) {
      throw new ApiError(409, 'EMAIL_TAKEN', 'Ya existe una cuenta con ese correo.');
    }
    const user = users.create({ name, email, passwordHash: await hashPassword(password) });
    const body: AuthResponse = { token: signToken(user.id, jwtSecret, jwtExpiresIn), user };
    res.status(201).json(body);
  });

  router.post('/login', loginLimiter, async (req, res) => {
    const { email, password } = loginSchema.parse(req.body);
    const found = users.findByEmail(email);
    const ok = await verifyPassword(password, found?.passwordHash ?? DUMMY_HASH);
    if (!found || !ok) {
      throw new ApiError(401, 'INVALID_CREDENTIALS', 'Correo o contraseña incorrectos.');
    }
    const { passwordHash: _omit, ...user } = found;
    const body: AuthResponse = { token: signToken(user.id, jwtSecret, jwtExpiresIn), user };
    res.json(body);
  });

  router.get('/me', requireAuth(jwtSecret), (_req, res) => {
    const user = users.findById(getUserId(res));
    if (!user) throw new ApiError(401, 'UNAUTHORIZED', 'Tu sesión expiró. Inicia sesión de nuevo.');
    res.json(user);
  });

  return router;
}
