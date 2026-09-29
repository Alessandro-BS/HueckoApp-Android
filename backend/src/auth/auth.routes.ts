import { Router } from 'express';
import rateLimit from 'express-rate-limit';

import type { AppDeps } from '../app';
import { ApiError } from '../middleware/errors';
import { usersRepository } from '../users/users.repository';
import { loginSchema, registerSchema } from './auth.schemas';
import { DUMMY_HASH, hashPassword, verifyPassword } from './passwords';
import { getUserId, requireAuth } from './require-auth';
import { signToken } from './tokens';

export function authRouter({ db, jwtSecret, jwtExpiresIn }: AppDeps) {
  const router = Router();
  const users = usersRepository(db);

  // Frena ataques de fuerza bruta: 20 intentos cada 15 minutos por IP.
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 20,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_req, _res, next) =>
      next(new ApiError(429, 'TOO_MANY_REQUESTS', 'Demasiados intentos. Espera unos minutos.')),
  });

  router.post('/register', limiter, async (req, res) => {
    const { name, email, password } = registerSchema.parse(req.body);
    if (users.findByEmail(email)) {
      throw new ApiError(409, 'EMAIL_TAKEN', 'Ya existe una cuenta con ese correo.');
    }
    const user = users.create({ name, email, passwordHash: await hashPassword(password) });
    res.status(201).json({ token: signToken(user.id, jwtSecret, jwtExpiresIn), user });
  });

  router.post('/login', limiter, async (req, res) => {
    const { email, password } = loginSchema.parse(req.body);
    const found = users.findByEmail(email);
    const ok = await verifyPassword(password, found?.passwordHash ?? DUMMY_HASH);
    if (!found || !ok) {
      throw new ApiError(401, 'INVALID_CREDENTIALS', 'Correo o contraseña incorrectos.');
    }
    const { passwordHash: _omit, ...user } = found;
    res.json({ token: signToken(user.id, jwtSecret, jwtExpiresIn), user });
  });

  router.get('/me', requireAuth(jwtSecret), (_req, res) => {
    const user = users.findById(getUserId(res));
    if (!user) throw new ApiError(401, 'UNAUTHORIZED', 'Tu sesión expiró. Inicia sesión de nuevo.');
    res.json(user);
  });

  return router;
}
