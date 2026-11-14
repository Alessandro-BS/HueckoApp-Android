import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { ZodError } from 'zod';

import type { AuthResponse, AuthResult } from '@hueckoapp/shared';
import type { ResolvedDeps } from '../app';
import { devicesRepository } from '../notifications/devices.repository';
import { isUniqueViolation } from '../db/errors';
import { ApiError } from '../middleware/errors';
import { type Account, toCurrentUser, usersRepository } from '../users/users.repository';
import { forgotPasswordSchema, googleLoginSchema, loginSchema, passwordInputSchema, registerSchema, verifyChallengeSchema } from './auth.schemas';
import type { ChallengePurpose } from './challenge-rules';
import { emailHint, generateChallengeId } from './codes';
import { type ChallengeDeps, issueChallenge, resendChallenge, verifyChallenge } from './challenges';
import { RESEND_COOLDOWN_SECONDS } from './challenge-rules';
import { DUMMY_HASH, hashPassword, verifyPassword } from './passwords';
import { accountSuspended, authenticate, getUserId, requireAuth } from './require-auth';
import { signToken } from './tokens';

export const LOGIN_RATE_LIMIT_DEFAULT = 20;
export const REGISTER_RATE_LIMIT_DEFAULT = 10;
export const CODE_RATE_LIMIT_DEFAULT = 30;
export const TWO_FACTOR_RATE_LIMIT_DEFAULT = 5;

// Propósitos que /challenges/:id/verify sabe aplicar. Uno que no esté aquí responde 410 como un reto inexistente, sin
// gastar intento.
const VERIFIABLE_PURPOSES: ReadonlySet<ChallengePurpose> = new Set(['VERIFY_EMAIL', 'RESET_PASSWORD', 'LOGIN_2FA', 'ENABLE_2FA']);
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
  google: googleVerifier,
  loginRateLimit = LOGIN_RATE_LIMIT_DEFAULT,
  registerRateLimit = REGISTER_RATE_LIMIT_DEFAULT,
  codeRateLimit = CODE_RATE_LIMIT_DEFAULT,
  twoFactorRateLimit = TWO_FACTOR_RATE_LIMIT_DEFAULT,
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
  // Activar y desactivar el 2FA comparten un cupo POR CUENTA (no por IP: con un token robado se rotan IP, y detrás de un NAT
  // la gente se bloquearía entre sí). Va después de requireAuth: la clave es el usuario autenticado.
  const twoFactorLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: twoFactorRateLimit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    keyGenerator: (_req, res) => getUserId(res),
    handler: (_req, _res, next) => next(new ApiError(429, 'TOO_MANY_REQUESTS', 'Demasiados intentos. Espera unos minutos.')),
  });

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
    // Sin código no hay JWT: sin verificar manda VERIFY_EMAIL y con 2FA, LOGIN_2FA. La contraseña mala ya dio 401 arriba, sin
    // mandar ningún correo.
    const body: AuthResult = !account.emailVerified
      ? { challenge: await issueChallenge(challengeDeps, account, 'VERIFY_EMAIL') }
      : account.twoFactorEnabled
        ? { challenge: await issueChallenge(challengeDeps, account, 'LOGIN_2FA') }
        : sessionFor(account);
    res.json(body);
  });

  // Entrar con Google: el idToken lo verifica Google (aquí, el verificador inyectado). Exige email_verified. Una cuenta
  // con ese correo se vincula (si estaba sin verificar pierde contraseña y 2FA: ver linkGoogle); sin cuenta, se crea.
  // No pide 2FA: Google ya autenticó a la persona.
  router.post('/google', loginLimiter, async (req, res) => {
    const { idToken } = googleLoginSchema.parse(req.body);
    if (!googleVerifier) throw new ApiError(503, 'GOOGLE_NOT_CONFIGURED', 'Entrar con Google no está disponible por ahora.');
    const identity = await googleVerifier.verify(idToken);
    if (!identity || !identity.emailVerified) throw new ApiError(401, 'GOOGLE_TOKEN_INVALID', 'No pudimos verificar tu cuenta de Google.');
    const email = identity.email.trim().toLowerCase();
    const name = identity.name.slice(0, 80); // el mismo máximo que el registro

    const resolve = async (): Promise<Account> => {
      const bySub = await users.findByGoogleSub(identity.sub);
      if (bySub) return bySub;
      const byEmail = await users.findByEmail(email);
      if (byEmail) {
        // Ese correo ya tiene otro Google vinculado (409, no 401: un 401 cerraría la sesión en la app). Una cuenta suspendida no se toca (se rechaza abajo).
        if (byEmail.hasGoogle) throw new ApiError(409, 'GOOGLE_ACCOUNT_MISMATCH', 'Ese correo ya está vinculado a otra cuenta de Google.');
        if (byEmail.status === 'SUSPENDED') return byEmail;
        const linked = await users.linkGoogle(byEmail.id, identity.sub, { googleName: name, now: now().toISOString() });
        if (!linked) throw new ApiError(401, 'GOOGLE_TOKEN_INVALID', 'No pudimos verificar tu cuenta de Google.');
        return linked;
      }
      return users.createFromGoogle({ name, email, sub: identity.sub, createdAt: now().toISOString() });
    };
    let account: Account;
    try {
      account = await resolve();
    } catch (e) {
      // Dos primeras entradas a la vez: el UNIQUE de correo o google_sub frena a una. Se repite la búsqueda una sola vez:
      // si el reintento también choca, el error se propaga.
      if (!isUniqueViolation(e, 'users_email_key') && !isUniqueViolation(e, 'users_google_sub_key')) throw e;
      account = await resolve();
    }
    if (account.status === 'SUSPENDED') throw accountSuspended();
    res.json(sessionFor(account));
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
    // ENABLE_2FA exige además el JWT de la dueña del reto. Se resuelve aquí (purposeCheck es síncrono) y se descarta
    // cualquier fallo (sin token, token malo, suspendida): purposeCheck responde 410, nunca 401 (la app cierra sesión con un 401).
    const bearerUserId = await authenticate(db, jwtSecret, req.get('authorization')).then((a) => a.userId, () => undefined);
    const { userId, purpose } = await verifyChallenge(challengeDeps, String(req.params.id), code, {
      purposeCheck: ({ userId: challengeUserId, purpose }) => {
        if (!VERIFIABLE_PURPOSES.has(purpose)) throw challengeExpired();
        if (purpose === 'ENABLE_2FA' && bearerUserId !== challengeUserId) throw challengeExpired();
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
        } else if (purpose === 'ENABLE_2FA') {
          await users.setTwoFactor(id, true);
        } else if (purpose === 'VERIFY_EMAIL') {
          await users.markEmailVerified(id);
        }
        // LOGIN_2FA: el código es la prueba, no hay nada que escribir.
      },
    });
    // ENABLE_2FA no abre sesión: la persona ya tiene la suya.
    if (purpose === 'ENABLE_2FA') {
      res.status(204).end();
      return;
    }
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

  // Activar el 2FA: contraseña actual y un código al correo. Sin contraseña (cuenta solo de Google) no se puede. La
  // contraseña mala es 400 (no 401: la app cerraría la sesión). No cambia la versión de sesión.
  const checkPassword = async (res: Parameters<typeof getUserId>[0], password: string) => {
    const id = getUserId(res);
    const hash = await users.findPasswordHash(id);
    if (hash === null) throw new ApiError(409, 'PASSWORD_REQUIRED', 'Para activarla, primero crea una contraseña con «¿Olvidaste tu contraseña?».');
    if (!(await verifyPassword(password, hash))) throw new ApiError(400, 'WRONG_PASSWORD', 'La contraseña es incorrecta.');
    return id;
  };

  router.post('/me/2fa/enable', requireAuth(db, jwtSecret), twoFactorLimiter, async (req, res) => {
    const { password } = passwordInputSchema.parse(req.body);
    const id = await checkPassword(res, password);
    const account = await users.findById(id);
    if (!account) throw new ApiError(401, 'UNAUTHORIZED', 'Tu sesión expiró. Inicia sesión de nuevo.');
    if (account.twoFactorEnabled) throw new ApiError(409, 'TWO_FACTOR_ALREADY_ENABLED', 'La verificación en dos pasos ya está activada.');
    const body: AuthResult = { challenge: await issueChallenge(challengeDeps, account, 'ENABLE_2FA') };
    res.json(body);
  });

  router.post('/me/2fa/disable', requireAuth(db, jwtSecret), twoFactorLimiter, async (req, res) => {
    const { password } = passwordInputSchema.parse(req.body);
    const id = await checkPassword(res, password);
    await users.setTwoFactor(id, false);
    res.status(204).end();
  });

  return router;
}
