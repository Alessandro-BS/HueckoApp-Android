import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { ZodError } from 'zod';

import type { AuthResponse, AuthResult } from '@hueckoapp/shared';
import type { ResolvedDeps } from '../app';
import { devicesRepository } from '../notifications/devices.repository';
import { ApiError } from '../middleware/errors';
import { type Account, toCurrentUser, usersRepository } from '../users/users.repository';
import { forgotPasswordSchema, loginSchema, registerSchema, verifyChallengeSchema } from './auth.schemas';
import type { ChallengePurpose } from './challenge-rules';
import { emailHint, generateChallengeId } from './codes';
import { type ChallengeDeps, issueChallenge, resendChallenge, verifyChallenge } from './challenges';
import { RESEND_COOLDOWN_SECONDS } from './challenge-rules';
import { DUMMY_HASH, hashPassword, verifyPassword } from './passwords';
import { accountSuspended, getUserId, requireAuth } from './require-auth';
import { signToken } from './tokens';

export const LOGIN_RATE_LIMIT_DEFAULT = 20;
export const REGISTER_RATE_LIMIT_DEFAULT = 10;
export const CODE_RATE_LIMIT_DEFAULT = 30;

// Propósitos que /challenges/:id/verify ya sabe aplicar. Los demás responden 410 como un reto inexistente, sin gastar
// intento (los añade el 2FA).
const VERIFIABLE_PURPOSES: ReadonlySet<ChallengePurpose> = new Set(['VERIFY_EMAIL', 'RESET_PASSWORD']);
const challengeExpired = () => new ApiError(410, 'CHALLENGE_EXPIRED', 'Pide un código nuevo.');

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
  email: emailClient,
  loginRateLimit = LOGIN_RATE_LIMIT_DEFAULT,
  registerRateLimit = REGISTER_RATE_LIMIT_DEFAULT,
  codeRateLimit = CODE_RATE_LIMIT_DEFAULT,
}: ResolvedDeps) {
  const router = Router();
  const users = usersRepository(db);
  const devices = devicesRepository(db);
  const challengeDeps: ChallengeDeps = { db, email: emailClient, secret: jwtSecret, now };
  // Contadores separados (D10): crear cuentas no gasta los intentos de entrar, ni al revés. Los códigos (verificar y
  // reenviar) tienen el suyo.
  const loginLimiter = authLimiter(loginRateLimit);
  const registerLimiter = authLimiter(registerRateLimit);
  const codeLimiter = authLimiter(codeRateLimit);

  // La sesión: el JWT lleva la versión de sesión de la cuenta (sv), que requireAuth compara en cada petición.
  const sessionFor = (account: Account): AuthResponse => ({
    token: signToken(account.id, jwtSecret, jwtExpiresIn, account.sessionVersion),
    user: toCurrentUser(account),
  });

  // Sin JWT hasta confirmar el correo: responde el reto VERIFY_EMAIL (y manda el código). Si el correo no sale
  // (503 EMAIL_SEND_FAILED) o se pasó el límite diario (429 EMAIL_DAILY_LIMIT), el error llega tal cual: la cuenta queda
  // sin verificar y volver a registrarse (o entrar) lo reintenta.
  router.post('/register', registerLimiter, async (req, res) => {
    const { name, email, password } = registerSchema.parse(req.body);
    const existing = await users.findByEmail(email);
    // Un correo ya confirmado (o vinculado a Google) tiene dueño. Uno sin confirmar no: se reemplazan nombre y
    // contraseña, así nadie se queda con un correo ajeno registrándolo primero. Al reemplazar se anulan los códigos
    // pendientes: issueChallenge crea un reto nuevo (nunca reutiliza el de antes, que confirmaría la cuenta con la
    // contraseña nueva de otra persona).
    if (existing && (existing.emailVerified || existing.hasGoogle)) {
      throw new ApiError(409, 'EMAIL_TAKEN', 'Ya existe una cuenta con ese correo.');
    }
    const passwordHash = await hashPassword(password);
    const account = existing
      ? await users.replaceUnverified(existing.id, { name, passwordHash, now: now().toISOString() })
      : await users.create({ name, email, passwordHash, createdAt: now().toISOString() });
    const body: AuthResult = { challenge: await issueChallenge(challengeDeps, account, 'VERIFY_EMAIL') };
    res.status(201).json(body);
  });

  router.post('/login', loginLimiter, async (req, res) => {
    const { email, password } = loginSchema.parse(req.body);
    const found = await users.findByEmail(email);
    // Sin cuenta o sin contraseña (solo Google) se compara igual contra DUMMY_HASH: tarda lo mismo y no delata nada.
    const ok = await verifyPassword(password, found?.passwordHash ?? DUMMY_HASH);
    if (!found || found.passwordHash === null || !ok) {
      throw new ApiError(401, 'INVALID_CREDENTIALS', 'Correo o contraseña incorrectos.');
    }
    // Solo quien sabe la contraseña se entera de que la cuenta está suspendida (D2).
    if (found.status === 'SUSPENDED') throw accountSuspended();
    const { passwordHash: _omit, ...account } = found;
    const body: AuthResult = account.emailVerified
      ? sessionFor(account)
      : { challenge: await issueChallenge(challengeDeps, account, 'VERIFY_EMAIL') };
    res.json(body);
  });

  // Siempre 202 { challenge }, exista o no la cuenta, falle o no Brevo, se pase o no el límite diario: no delata qué
  // correos tienen cuenta. Sin cuenta, el reto es falso (nada se guarda ni se envía): verificarlo da 410 y reenviarlo 204.
  router.post('/password/forgot', codeLimiter, async (req, res) => {
    const { email } = forgotPasswordSchema.parse(req.body);
    const found = await users.findByEmail(email);
    const challenge = found
      ? await issueChallenge(challengeDeps, found, 'RESET_PASSWORD', { quiet: true })
      : {
          id: generateChallengeId(),
          purpose: 'RESET_PASSWORD' as const,
          emailHint: emailHint(email),
          resendAvailableAt: new Date(now().getTime() + RESEND_COOLDOWN_SECONDS * 1000).toISOString(),
        };
    const body: AuthResult = { challenge };
    res.status(202).json(body);
  });

  router.post('/challenges/:id/verify', codeLimiter, async (req, res) => {
    const { code, newPassword } = verifyChallengeSchema.parse(req.body);
    // El hash va fuera de la transacción (bcrypt tarda); solo se usa si el reto resulta ser RESET_PASSWORD.
    const newHash = newPassword === undefined ? undefined : await hashPassword(newPassword);
    const { userId } = await verifyChallenge(challengeDeps, String(req.params.id), code, {
      purposeCheck: ({ purpose }) => {
        if (!VERIFIABLE_PURPOSES.has(purpose)) throw challengeExpired();
        // La contraseña nueva es obligatoria al recuperar: se exige antes de mirar el código, así no gasta intento.
        if (purpose === 'RESET_PASSWORD' && newHash === undefined) {
          throw new ZodError([{ code: 'custom', path: ['newPassword'], message: 'La contraseña es requerida', input: undefined }]);
        }
      },
      // VERIFY_EMAIL: el código prueba que lee ese correo. En la misma transacción que el código, con la cuenta
      // bloqueada: un registro que reemplaza la contraseña a la vez espera a que termine y ve la cuenta verificada (409).
      // RESET_PASSWORD: contraseña nueva, versión de sesión +1 (los JWT anteriores caen), correo verificado y sin celulares
      // registrados, todo en la misma transacción.
      onSuccess: async ({ userId: id, purpose }) => {
        if (purpose === 'RESET_PASSWORD') {
          await users.resetPassword(id, newHash!);
          await devices.removeAllOf(id);
        } else {
          await users.markEmailVerified(id);
        }
      },
    });
    const account = await users.findById(userId);
    if (!account) throw challengeExpired(); // la cuenta se borró entre medias
    // El efecto ya se aplicó, pero una cuenta suspendida no recibe sesión.
    if (account.status === 'SUSPENDED') throw accountSuspended();
    res.json(sessionFor(account));
  });

  router.post('/challenges/:id/resend', codeLimiter, async (req, res) => {
    await resendChallenge(challengeDeps, String(req.params.id));
    res.status(204).end();
  });

  router.get('/me', requireAuth(db, jwtSecret), async (_req, res) => {
    const account = await users.findById(getUserId(res));
    if (!account) throw new ApiError(401, 'UNAUTHORIZED', 'Tu sesión expiró. Inicia sesión de nuevo.');
    res.json(toCurrentUser(account));
  });

  return router;
}
