import type { Db } from '../db/db';
import { codeEmail } from '../email/code-email';
import { type EmailClient, EmailSendError } from '../email/email-client';
import { ApiError } from '../middleware/errors';
import { BREVO_DAILY_LIMIT_DEFAULT, CODE_TTL_MINUTES, type ChallengePurpose, DAILY_EMAIL_LIMIT, MAX_ATTEMPTS, MAX_SENDS_PER_CHALLENGE, RESEND_COOLDOWN_SECONDS } from './challenge-rules';
import { challengesRepository, type ChallengeRow } from './challenges.repository';
import { codeMatches, emailHint, generateChallengeId, generateCode, hashCode } from './codes';

// El servicio de los retos con código: el único que conoce las reglas (las rutas no tocan el repositorio).

/** brevoDailyLimit: correos en 24 h entre todas las cuentas (BREVO_DAILY_LIMIT; 280 si se omite). */
export type ChallengeDeps = { db: Db; email: EmailClient; secret: string; now: () => Date; brevoDailyLimit?: number };
export type ChallengeView = { id: string; purpose: ChallengePurpose; emailHint: string; resendAvailableAt: string };
/** quiet: /password/forgot no delata nada (ni 429 ni 503): el fallo solo se registra en el log. */
export type IssueOptions = { quiet?: boolean };

const DAY_MS = 24 * 3600 * 1000;
const expired = () => new ApiError(410, 'CHALLENGE_EXPIRED', 'Pide un código nuevo.');
const dailyLimit = () => new ApiError(429, 'EMAIL_DAILY_LIMIT', 'Ya te enviamos muchos códigos hoy. Inténtalo mañana.');
const sendFailed = () => new ApiError(503, 'EMAIL_SEND_FAILED', 'No pudimos enviar el correo. Intenta reenviar el código en un momento.');
const quotaExhausted = () => new ApiError(503, 'EMAIL_QUOTA_EXHAUSTED', 'Hoy no podemos enviar más códigos. Inténtalo mañana.');
const plus = (iso: string, seconds: number) => new Date(new Date(iso).getTime() + seconds * 1000).toISOString();
const isDead = (c: ChallengeRow, nowIso: string) => c.consumedAt !== null || c.expiresAt <= nowIso;

async function deliver(deps: ChallengeDeps, to: string, purpose: ChallengePurpose, code: string): Promise<void> {
  try {
    await deps.email.send({ to, ...codeEmail(purpose, code) });
  } catch (error) {
    // El mensaje de EmailSendError lleva el estado de Brevo y nunca la clave: sin este log, un 401 sería un 503 sin rastro.
    console.error(`No se pudo enviar el código (${purpose}):`, error instanceof EmailSendError ? error.message : error);
    throw sendFailed();
  }
}

/**
 * Freno global al cupo de Brevo: true (y lo registra, sin datos personales) si en las últimas 24 h ya se mandaron
 * `brevoDailyLimit` correos entre todas las cuentas. Va dentro de la transacción de cada cuenta, pero no bloquea a las
 * demás: dos cuentas a la vez pueden pasarse por uno o dos correos, lo que el margen bajo los 300 de Brevo absorbe.
 */
async function quotaReached(deps: ChallengeDeps, repo: ReturnType<typeof challengesRepository>, sinceIso: string, purpose: ChallengePurpose): Promise<boolean> {
  const limit = deps.brevoDailyLimit ?? BREVO_DAILY_LIMIT_DEFAULT;
  const sent = await repo.allEmailsSentSince(sinceIso);
  if (sent < limit) return false;
  console.error(`Cupo diario de correos agotado (${sent}/${limit} en 24 h): no se envía el código (${purpose}).`);
  return true;
}

const viewOf = (c: { id: string; purpose: ChallengePurpose }, email: string, resendAvailableAt: string): ChallengeView => ({
  id: c.id,
  purpose: c.purpose,
  emailHint: emailHint(email),
  resendAvailableAt,
});

/**
 * Reutiliza el reto vivo si se envió hace menos de 60 s (sin mandar otro correo); si no, cuenta el límite diario de la
 * cuenta (429 EMAIL_DAILY_LIMIT) y el cupo de Brevo (503 EMAIL_QUOTA_EXHAUSTED), consume el vivo, crea uno nuevo y envía
 * (503 EMAIL_SEND_FAILED: el reto queda vivo con last_sent_at nulo, así se puede reenviar sin esperar; el envío fallido
 * sigue contando para los límites).
 * quiet (/password/forgot): en vez de 429/503 devuelve un reto falso con la misma forma; si el correo no salió, además
 * consume el reto real, así un código que nadie recibió no se puede adivinar.
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
  const availableAt = plus(nowIso, RESEND_COOLDOWN_SECONDS);

  // Todo menos el envío va en una transacción con la fila del usuario bloqueada: dos peticiones a la vez para la misma
  // cuenta hacen cola, y la segunda ve el reto de la primera (ya marcado como enviado) y lo reutiliza. El envío HTTP
  // queda fuera para no tener el candado durante la llamada a Brevo.
  type Plan = { kind: 'reuse'; view: ChallengeView } | { kind: 'limit' } | { kind: 'quota' } | { kind: 'send'; id: string; code: string };
  const plan = await deps.db.transaction(async (): Promise<Plan> => {
    await repo.lockUser(user.id);
    const live = await repo.liveFor(user.id, purpose);
    if (live && !isDead(live, nowIso) && live.lastSentAt !== null) {
      const reuseAt = plus(live.lastSentAt, RESEND_COOLDOWN_SECONDS);
      if (reuseAt > nowIso) return { kind: 'reuse', view: viewOf(live, user.email, reuseAt) };
    }
    const sinceIso = new Date(now.getTime() - DAY_MS).toISOString();
    if ((await repo.emailsSentSince(user.id, sinceIso)) >= DAILY_EMAIL_LIMIT) return { kind: 'limit' };
    if (await quotaReached(deps, repo, sinceIso, purpose)) return { kind: 'quota' };
    const id = generateChallengeId();
    const code = generateCode();
    await repo.consumeLive(user.id, purpose, nowIso);
    // Nace con el envío ya contado (send_count 1, last_sent_at ahora); si el correo no sale, solo se borra last_sent_at.
    await repo.insert({ id, userId: user.id, purpose, codeHash: hashCode(deps.secret, id, code), createdAt: nowIso, expiresAt: plus(nowIso, CODE_TTL_MINUTES * 60) });
    await repo.recordSend(id, nowIso);
    return { kind: 'send', id, code };
  });

  if (plan.kind === 'reuse') return plan.view;
  if (plan.kind === 'limit') {
    if (!opts.quiet) throw dailyLimit();
    console.warn(`Límite diario de correos alcanzado (${purpose}, usuario ${user.id}).`);
    return viewOf({ id: generateChallengeId(), purpose }, user.email, availableAt);
  }
  if (plan.kind === 'quota') {
    if (!opts.quiet) throw quotaExhausted();
    return viewOf({ id: generateChallengeId(), purpose }, user.email, availableAt);
  }

  try {
    await deliver(deps, user.email, purpose, plan.code);
  } catch (error) {
    if (!opts.quiet) {
      // El reto queda vivo con last_sent_at nulo: se puede reenviar sin esperar (el envío fallido sigue contando).
      await repo.markUnsent(plan.id);
      throw error;
    }
    // quiet: nadie recibió el código, así que el reto se consume y se responde uno falso (sin esto, con Brevo caído cada
    // forgot dejaría un reto vivo con 5 intentos para adivinar).
    await repo.consume(plan.id, nowIso);
    return viewOf({ id: generateChallengeId(), purpose }, user.email, availableAt);
  }
  return viewOf({ id: plan.id, purpose }, user.email, availableAt);
}

/**
 * Reenvío: no hace nada (y responde 204) si el id no existe; 410 si venció o se consumió; 429 RESEND_TOO_SOON; como mucho 5 envíos por reto (410 al pasarse);
 * límite diario de la cuenta y cupo de Brevo (503 EMAIL_QUOTA_EXHAUSTED). Manda un código nuevo (el anterior deja de valer), con intentos en 0 y vencimiento extendido. Si el
 * correo no sale, nada cambia.
 */
export async function resendChallenge(deps: ChallengeDeps, id: string): Promise<void> {
  const repo = challengesRepository(deps.db);
  // En una transacción con candado: dos reenvíos a la vez no mandan dos correos ni se saltan el tiempo de espera.
  await deps.db.transaction(async () => {
    const now = deps.now();
    const nowIso = now.toISOString();
    const challenge = await repo.findForUpdate(id);
    // Un id que no está en la base responde igual que uno real (204): los retos falsos de /password/forgot no se delatan.
    if (!challenge) return;
    if (isDead(challenge, nowIso) || challenge.sendCount >= MAX_SENDS_PER_CHALLENGE) throw expired();
    if (challenge.lastSentAt !== null) {
      const waitMs = new Date(plus(challenge.lastSentAt, RESEND_COOLDOWN_SECONDS)).getTime() - now.getTime();
      if (waitMs > 0) {
        const retryAfterSeconds = Math.ceil(waitMs / 1000);
        throw new ApiError(429, 'RESEND_TOO_SOON', `Espera ${retryAfterSeconds} s para reenviar el código.`, { retryAfterSeconds });
      }
    }
    const sinceIso = new Date(now.getTime() - DAY_MS).toISOString();
    if ((await repo.emailsSentSince(challenge.userId, sinceIso)) >= DAILY_EMAIL_LIMIT) throw dailyLimit();
    if (await quotaReached(deps, repo, sinceIso, challenge.purpose)) throw quotaExhausted();
    const code = generateCode();
    await deliver(deps, challenge.email, challenge.purpose, code);
    await repo.refreshCode(id, hashCode(deps.secret, id, code), nowIso);
    await repo.recordSend(id, nowIso);
  });
}

type VerifyOutcome = { ok: true; userId: string; purpose: ChallengePurpose } | { ok: false; attemptsLeft: number };

/**
 * Comprueba el código dentro de una transacción con `findForUpdate`: los intentos simultáneos hacen cola, así nunca se
 * cuentan más de 5. Antes que el reto se bloquea la cuenta (`lockUser`): siempre cuenta → reto, el mismo orden que
 * issueChallenge y el registro que reemplaza la contraseña, para que no se interbloqueen con `onSuccess`, que escribe
 * en la cuenta. 410 si no existe, venció o se consumió. Código malo: 400 CODE_INVALID { attemptsLeft }, o 410 si era
 * el quinto (y consume el reto). Bueno: consume y devuelve el usuario y el propósito.
 * `purposeCheck` corre dentro de la misma transacción, tras el candado y ANTES de mirar el código: si lanza, no se gasta
 * intento (las rutas lo usan para rechazar propósitos que no aceptan y, en ENABLE_2FA, el JWT de otra persona).
 * `onSuccess` corre también dentro, justo después de consumir un código bueno: el efecto (p. ej. verificar el correo)
 * queda en la misma transacción que el código, con el reto todavía bloqueado.
 */
export async function verifyChallenge(
  deps: ChallengeDeps,
  id: string,
  code: string,
  opts: {
    purposeCheck?: (c: { userId: string; purpose: ChallengePurpose }) => void;
    onSuccess?: (c: { userId: string; purpose: ChallengePurpose }) => Promise<void>;
  } = {},
): Promise<{ userId: string; purpose: ChallengePurpose }> {
  const repo = challengesRepository(deps.db);
  // El resultado sale de la transacción y recién entonces se lanza: lanzar dentro desharía el conteo del intento fallido.
  const outcome = await deps.db.transaction(async (): Promise<VerifyOutcome> => {
    const nowIso = deps.now().toISOString();
    const owner = await repo.ownerOf(id);
    if (!owner) throw expired();
    await repo.lockUser(owner);
    // Con la cuenta bloqueada, el reto: se vuelve a mirar si sigue vivo (pudo consumirse mientras esperaba).
    const challenge = await repo.findForUpdate(id);
    if (!challenge || isDead(challenge, nowIso)) throw expired();
    opts.purposeCheck?.({ userId: challenge.userId, purpose: challenge.purpose });
    if (codeMatches(deps.secret, id, code, challenge.codeHash)) {
      await repo.consume(id, nowIso);
      await opts.onSuccess?.({ userId: challenge.userId, purpose: challenge.purpose });
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
