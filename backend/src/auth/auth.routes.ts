import { Router } from 'express';
import rateLimit from 'express-rate-limit';

import type { AuthResponse } from '@hueckoapp/shared';
import type { ResolvedDeps } from '../app';
import { ApiError } from '../middleware/errors';
import { toCurrentUser, usersRepository } from '../users/users.repository';
import { loginSchema, registerSchema } from './auth.schemas';
import { DUMMY_HASH, hashPassword, verifyPassword } from './passwords';
import { accountSuspended, getUserId, requireAuth } from './require-auth';
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
  now,
  loginRateLimit = LOGIN_RATE_LIMIT_DEFAULT,
  registerRateLimit = REGISTER_RATE_LIMIT_DEFAULT,
}: ResolvedDeps) {
  const router = Router();
  const users = usersRepository(db);
  // Contadores separados (D10): crear cuentas no gasta los intentos de entrar, ni al revés.
  const loginLimiter = authLimiter(loginRateLimit);
  const registerLimiter = authLimiter(registerRateLimit);

  router.post('/register', registerLimiter, async (req, res) => {
    const { name, email, password } = registerSchema.parse(req.body);
    if (await users.findByEmail(email)) {
      throw new ApiError(409, 'EMAIL_TAKEN', 'Ya existe una cuenta con ese correo.');
    }
    const user = await users.create({ name, email, passwordHash: await hashPassword(password), createdAt: now().toISOString() });
    const body: AuthResponse = { token: signToken(user.id, jwtSecret, jwtExpiresIn), user };
    res.status(201).json(body);
  });

  router.post('/login', loginLimiter, async (req, res) => {
    const { email, password } = loginSchema.parse(req.body);
    const found = await users.findByEmail(email);
    const ok = await verifyPassword(password, found?.passwordHash ?? DUMMY_HASH);
    if (!found || !ok) {
      throw new ApiError(401, 'INVALID_CREDENTIALS', 'Correo o contraseña incorrectos.');
    }
    // Solo quien sabe la contraseña se entera de que la cuenta está suspendida (D2).
    if (found.status === 'SUSPENDED') throw accountSuspended();
    const { passwordHash: _omit, ...account } = found;
    const body: AuthResponse = { token: signToken(account.id, jwtSecret, jwtExpiresIn), user: toCurrentUser(account) };
    res.json(body);
  });

  router.get('/me', requireAuth(db, jwtSecret), async (_req, res) => {
    const account = await users.findById(getUserId(res));
    if (!account) throw new ApiError(401, 'UNAUTHORIZED', 'Tu sesión expiró. Inicia sesión de nuevo.');
    res.json(toCurrentUser(account));
  });

  return router;
}
