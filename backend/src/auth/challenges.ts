import type { Db } from '../db/db';
import { codeEmail } from '../email/code-email';
import { type EmailClient, EmailSendError } from '../email/email-client';
import { ApiError } from '../middleware/errors';
import { CODE_TTL_MINUTES, type ChallengePurpose, DAILY_EMAIL_LIMIT, MAX_ATTEMPTS, MAX_SENDS_PER_CHALLENGE, RESEND_COOLDOWN_SECONDS } from './challenge-rules';
import { challengesRepository, type ChallengeRow } from './challenges.repository';
import { codeMatches, emailHint, generateChallengeId, generateCode, hashCode } from './codes';

// El servicio de los retos con código: el único que conoce las reglas (las rutas no tocan el repositorio).

export type ChallengeDeps = { db: Db; email: EmailClient; secret: string; now: () => Date };
export type ChallengeView = { id: string; purpose: ChallengePurpose; emailHint: string; resendAvailableAt: string };
/** quiet: /password/forgot no delata nada (ni 429 ni 503): el fallo solo se registra en el log. */
export type IssueOptions = { quiet?: boolean };

const DAY_MS = 24 * 3600 * 1000;
const expired = () => new ApiError(410, 'CHALLENGE_EXPIRED', 'Pide un código nuevo.');
const dailyLimit = () => new ApiError(429, 'EMAIL_DAILY_LIMIT', 'Ya te enviamos muchos códigos hoy. Inténtalo mañana.');
const sendFailed = () => new ApiError(503, 'EMAIL_SEND_FAILED', 'No pudimos enviar el correo. Intenta reenviar el código en un momento.');
const plus = (iso: string, seconds: number) => new Date(new Date(iso).getTime() + seconds * 1000).toISOString();
const isDead = (c: ChallengeRow, nowIso: string) => c.consumedAt !== null || c.expiresAt <= nowIso;

async function deliver(deps: ChallengeDeps, to: string, purpose: ChallengePurpose, code: string): Promise<void> {
  try {
    await deps.email.send({ to, ...codeEmail(purpose, code) });
  } catch (error) {
    // Un cliente de correo que lance otra cosa que EmailSendError también significa «no salió».
    if (!(error instanceof EmailSendError)) console.error('El cliente de correo lanzó un error inesperado:', error);
    throw sendFailed();
  }
}

const viewOf = (c: { id: string; purpose: ChallengePurpose }, email: string, resendAvailableAt: string): ChallengeView => ({
  id: c.id,
  purpose: c.purpose,
  emailHint: emailHint(email),
  resendAvailableAt,
});

/**
 * Reutiliza el reto vivo si se envió hace menos de 60 s (sin mandar otro correo); si no, consume el vivo, crea uno nuevo,
 * cuenta el límite diario (429 EMAIL_DAILY_LIMIT) y envía (503 EMAIL_SEND_FAILED: el reto queda vivo y last_sent_at sin
 * tocar, así se puede reenviar sin esperar).
 */
export async function issueChallenge(
  deps: ChallengeDeps,
  user: { id: string; email: string },
  purpose: ChallengePurpose,
  opts: IssueOptions = {},
): Promise<ChallengeView> {
  const repo = challengesRepository(deps.db);
  const now = deps.now();
  const nowIso = now.toISOString();

  const live = await repo.liveFor(user.id, purpose);
  if (live && !isDead(live, nowIso) && live.lastSentAt !== null) {
    const availableAt = plus(live.lastSentAt, RESEND_COOLDOWN_SECONDS);
    if (availableAt > nowIso) return viewOf(live, user.email, availableAt);
  }

  if ((await repo.emailsSentSince(user.id, new Date(now.getTime() - DAY_MS).toISOString())) >= DAILY_EMAIL_LIMIT) {
    if (!opts.quiet) throw dailyLimit();
    console.warn(`Límite diario de correos alcanzado (${purpose}, usuario ${user.id}).`);
    return viewOf({ id: generateChallengeId(), purpose }, user.email, plus(nowIso, RESEND_COOLDOWN_SECONDS));
  }

  const id = generateChallengeId();
  const code = generateCode();
  await deps.db.transaction(async () => {
    await repo.consumeLive(user.id, purpose, nowIso);
    await repo.insert({ id, userId: user.id, purpose, codeHash: hashCode(deps.secret, id, code), createdAt: nowIso, expiresAt: plus(nowIso, CODE_TTL_MINUTES * 60) });
  });

  try {
    await deliver(deps, user.email, purpose, code);
  } catch (error) {
    if (!opts.quiet) throw error;
    console.warn(`No se pudo enviar el código (${purpose}, usuario ${user.id}).`);
    return viewOf({ id, purpose }, user.email, nowIso);
  }
  await repo.recordSend(id, nowIso);
  return viewOf({ id, purpose }, user.email, plus(nowIso, RESEND_COOLDOWN_SECONDS));
}

/**
 * Reenvío: 410 si no existe, venció o se consumió; 429 RESEND_TOO_SOON; como mucho 5 envíos por reto (410 al pasarse);
 * límite diario. Manda un código nuevo (el anterior deja de valer), con intentos en 0 y vencimiento extendido. Si el
 * correo no sale, nada cambia.
 */
export async function resendChallenge(deps: ChallengeDeps, id: string): Promise<void> {
  const repo = challengesRepository(deps.db);
  // En una transacción con candado: dos reenvíos a la vez no mandan dos correos ni se saltan el tiempo de espera.
  await deps.db.transaction(async () => {
    const now = deps.now();
    const nowIso = now.toISOString();
    const challenge = await repo.findForUpdate(id);
    if (!challenge || isDead(challenge, nowIso) || challenge.sendCount >= MAX_SENDS_PER_CHALLENGE) throw expired();
    if (challenge.lastSentAt !== null) {
      const waitMs = new Date(plus(challenge.lastSentAt, RESEND_COOLDOWN_SECONDS)).getTime() - now.getTime();
      if (waitMs > 0) {
        const retryAfterSeconds = Math.ceil(waitMs / 1000);
        throw new ApiError(429, 'RESEND_TOO_SOON', `Espera ${retryAfterSeconds} s para reenviar el código.`, { retryAfterSeconds });
      }
    }
    if ((await repo.emailsSentSince(challenge.userId, new Date(now.getTime() - DAY_MS).toISOString())) >= DAILY_EMAIL_LIMIT) throw dailyLimit();
    const code = generateCode();
    await deliver(deps, challenge.email, challenge.purpose, code);
    await repo.refreshCode(id, hashCode(deps.secret, id, code), nowIso);
    await repo.recordSend(id, nowIso);
  });
}

type VerifyOutcome = { ok: true; userId: string; purpose: ChallengePurpose } | { ok: false; attemptsLeft: number };

/**
 * Comprueba el código dentro de una transacción con `findForUpdate`: los intentos simultáneos hacen cola, así nunca se
 * cuentan más de 5. 410 si no existe, venció o se consumió. Código malo: 400 CODE_INVALID { attemptsLeft }, o 410 si era
 * el quinto (y consume el reto). Bueno: consume y devuelve el usuario y el propósito.
 * `purposeCheck` corre dentro de la misma transacción, tras el candado y ANTES de mirar el código: si lanza, no se gasta
 * intento (las rutas lo usan para rechazar propósitos que no aceptan y, en ENABLE_2FA, el JWT de otra persona).
 */
export async function verifyChallenge(
  deps: ChallengeDeps,
  id: string,
  code: string,
  opts: { purposeCheck?: (c: { userId: string; purpose: ChallengePurpose }) => void } = {},
): Promise<{ userId: string; purpose: ChallengePurpose }> {
  const repo = challengesRepository(deps.db);
  // El resultado sale de la transacción y recién entonces se lanza: lanzar dentro desharía el conteo del intento fallido.
  const outcome = await deps.db.transaction(async (): Promise<VerifyOutcome> => {
    const nowIso = deps.now().toISOString();
    const challenge = await repo.findForUpdate(id);
    if (!challenge || isDead(challenge, nowIso)) throw expired();
    opts.purposeCheck?.({ userId: challenge.userId, purpose: challenge.purpose });
    if (codeMatches(deps.secret, id, code, challenge.codeHash)) {
      await repo.consume(id, nowIso);
      return { ok: true, userId: challenge.userId, purpose: challenge.purpose };
    }
    await repo.recordFailure(id);
    const attemptsLeft = MAX_ATTEMPTS - (challenge.attempts + 1);
    if (attemptsLeft <= 0) await repo.consume(id, nowIso);
    return { ok: false, attemptsLeft };
  });
  if (outcome.ok) return { userId: outcome.userId, purpose: outcome.purpose };
  if (outcome.attemptsLeft <= 0) throw expired();
  throw new ApiError(400, 'CODE_INVALID', 'El código no es correcto.', { attemptsLeft: outcome.attemptsLeft });
}
