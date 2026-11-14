import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';

import type { ChallengePurpose } from '../src/auth/challenge-rules';
import { type ChallengeDeps, issueChallenge, resendChallenge, verifyChallenge } from '../src/auth/challenges';
import { emailHint, generateChallengeId, generateCode, hashCode, codeMatches } from '../src/auth/codes';
import type { Db } from '../src/db/db';
import { codeEmail } from '../src/email/code-email';
import { fakeEmail, makeClock, makeTestDb, recordQueries, TEST_SECRET } from './helpers';

const START = new Date('2026-11-13T10:00:00.000Z');
const USER = { id: 'u1', email: 'usuario@correo.com' };
const later = (seconds: number) => new Date(START.getTime() + seconds * 1000);

let db: Db;
let email: ReturnType<typeof fakeEmail>;
let clock: ReturnType<typeof makeClock>;
let deps: ChallengeDeps;
let errorLog: MockInstance;
let warnLog: MockInstance;

beforeEach(async () => {
  // Los fallos de envío y el límite diario se registran en el log: aquí se silencian y se comprueban.
  errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
  warnLog = vi.spyOn(console, 'warn').mockImplementation(() => {});
  db = await makeTestDb();
  await db.query('INSERT INTO users (id, name, email) VALUES ($1, $2, $3)', [USER.id, 'Usuario', USER.email]);
  email = fakeEmail();
  clock = makeClock(START);
  deps = { db, email, secret: TEST_SECRET, now: clock.now };
});

afterEach(() => {
  vi.restoreAllMocks();
});

const rejection = (promise: Promise<unknown>) => promise.then(() => undefined, (e: unknown) => e);
const expectApiError = async (promise: Promise<unknown>, status: number, code: string, details?: unknown) => {
  const error = (await rejection(promise)) as { status: number; code: string; details: unknown } | undefined;
  expect(error).toBeDefined();
  expect({ status: error!.status, code: error!.code }).toEqual({ status, code });
  if (details !== undefined) expect(error!.details).toEqual(details);
};
const row = (id: string) => db.one<{ attempts: number; send_count: number; last_sent_at: string | null; consumed_at: string | null; expires_at: string }>(
  'SELECT * FROM auth_challenges WHERE id = $1',
  [id],
);

describe('codes', () => {
  it('generateCode da 6 dígitos (con ceros a la izquierda) y hashCode/codeMatches dependen del reto y del código', () => {
    for (let i = 0; i < 50; i++) expect(generateCode()).toMatch(/^\d{6}$/);
    const id = generateChallengeId();
    expect(id).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const hash = hashCode('s', id, '012345');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(codeMatches('s', id, '012345', hash)).toBe(true);
    expect(codeMatches('s', id, '012346', hash)).toBe(false);
    expect(codeMatches('s', 'otro', '012345', hash)).toBe(false);
    expect(codeMatches('otro-secreto', id, '012345', hash)).toBe(false);
    expect(codeMatches('s', id, '012345', 'corto')).toBe(false);
  });

  it('emailHint: primera letra, *** y el dominio', () => {
    expect(emailHint('alessandro@gmail.com')).toBe('a***@gmail.com');
  });

  it('codeEmail: asunto exacto, código, motivo y vencimiento', () => {
    const reasons: Record<ChallengePurpose, string> = {
      VERIFY_EMAIL: 'verificar tu correo',
      LOGIN_2FA: 'iniciar sesión',
      RESET_PASSWORD: 'restablecer tu contraseña',
      ENABLE_2FA: 'activar la verificación en dos pasos',
    };
    for (const [purpose, reason] of Object.entries(reasons)) {
      const message = codeEmail(purpose as ChallengePurpose, '042042');
      expect(message.subject).toBe('Tu código de HueckoApp: 042042');
      for (const body of [message.text, message.html]) {
        expect(body).toContain('042042');
        expect(body).toContain(reason);
        expect(body).toContain('Vence en 15 minutos.');
      }
    }
  });
});

describe('issueChallenge', () => {
  it('guarda solo el hash, manda el correo con el asunto exacto y devuelve el aviso y cuándo reenviar', async () => {
    const view = await issueChallenge(deps, USER, 'VERIFY_EMAIL');
    const code = email.lastCodeTo(USER.email);
    expect(email.sent).toHaveLength(1);
    expect(email.sent[0].subject).toBe(`Tu código de HueckoApp: ${code}`);
    expect(view).toEqual({ id: expect.any(String), purpose: 'VERIFY_EMAIL', emailHint: 'u***@correo.com', resendAvailableAt: later(60).toISOString() });
    const stored = await db.many('SELECT * FROM auth_challenges');
    expect(stored).toHaveLength(1);
    expect(JSON.stringify(stored)).not.toContain(code);
    expect(await row(view.id)).toMatchObject({ attempts: 0, send_count: 1, last_sent_at: START.toISOString(), consumed_at: null, expires_at: later(15 * 60).toISOString() });
  });

  it('a los 30 s devuelve el mismo reto sin otro correo; a los 61 s crea uno nuevo y el anterior queda consumido', async () => {
    const first = await issueChallenge(deps, USER, 'LOGIN_2FA');
    const firstCode = email.lastCodeTo(USER.email);
    clock.set(later(30));
    const again = await issueChallenge(deps, USER, 'LOGIN_2FA');
    expect(again).toEqual(first);
    expect(email.sent).toHaveLength(1);
    clock.set(later(61));
    const second = await issueChallenge(deps, USER, 'LOGIN_2FA');
    expect(second.id).not.toBe(first.id);
    expect(email.sent).toHaveLength(2);
    await expectApiError(verifyChallenge(deps, first.id, firstCode), 410, 'CHALLENGE_EXPIRED');
    expect(await verifyChallenge(deps, second.id, email.lastCodeTo(USER.email))).toEqual({ userId: 'u1', purpose: 'LOGIN_2FA' });
  });

  // 10 correos: 4 retos nuevos (uno por propósito), 4 reenvíos, 2 reenvíos más; el siguiente reto nuevo ya es el 11.º.
  async function sendTenEmails(): Promise<void> {
    const purposes: ChallengePurpose[] = ['VERIFY_EMAIL', 'LOGIN_2FA', 'RESET_PASSWORD', 'ENABLE_2FA'];
    const views = [];
    for (const purpose of purposes) views.push(await issueChallenge(deps, USER, purpose));
    clock.set(later(61));
    for (const view of views) await resendChallenge(deps, view.id);
    clock.set(later(122));
    await resendChallenge(deps, views[0].id);
    await resendChallenge(deps, views[1].id);
    expect(email.sent).toHaveLength(10);
    clock.set(later(183));
  }

  it('el 11.º correo del día (mezclando propósitos y reenvíos) da 429 EMAIL_DAILY_LIMIT', async () => {
    await sendTenEmails();
    await expectApiError(issueChallenge(deps, USER, 'VERIFY_EMAIL'), 429, 'EMAIL_DAILY_LIMIT');
    expect(email.sent).toHaveLength(10);
    // 24 h después de la creación de los retos, el límite se libera.
    clock.set(later(24 * 3600 + 1));
    await issueChallenge(deps, USER, 'VERIFY_EMAIL');
    expect(email.sent).toHaveLength(11);
  });

  it('con el límite diario y quiet: no lanza, no envía y devuelve un reto con la misma forma', async () => {
    await sendTenEmails();
    const view = await issueChallenge(deps, USER, 'VERIFY_EMAIL', { quiet: true });
    expect(view).toEqual({ id: expect.any(String), purpose: 'VERIFY_EMAIL', emailHint: 'u***@correo.com', resendAvailableAt: later(183 + 60).toISOString() });
    expect(email.sent).toHaveLength(10);
    expect(warnLog).toHaveBeenCalledTimes(1);
  });

  it('si Brevo falla: 503 EMAIL_SEND_FAILED, el reto sigue vivo con last_sent_at nulo y se reenvía sin esperar', async () => {
    email.fail(true);
    await expectApiError(issueChallenge(deps, USER, 'VERIFY_EMAIL'), 503, 'EMAIL_SEND_FAILED');
    expect(errorLog).toHaveBeenCalledWith(expect.stringContaining('VERIFY_EMAIL'), 'Brevo respondió 503'); // la causa queda en el log
    const live = await db.one<{ id: string; last_sent_at: string | null; consumed_at: string | null; send_count: number }>('SELECT * FROM auth_challenges');
    expect(live).toMatchObject({ last_sent_at: null, consumed_at: null, send_count: 0 });
    email.fail(false);
    await resendChallenge(deps, live!.id); // sin avanzar el reloj
    expect(await verifyChallenge(deps, live!.id, email.lastCodeTo(USER.email))).toEqual({ userId: 'u1', purpose: 'VERIFY_EMAIL' });
  });

  it('si Brevo falla con quiet: no lanza, registra la causa y devuelve resendAvailableAt = ahora + 60 s como si hubiera salido', async () => {
    email.fail(true);
    const view = await issueChallenge(deps, USER, 'RESET_PASSWORD', { quiet: true });
    expect(view).toMatchObject({ purpose: 'RESET_PASSWORD', emailHint: 'u***@correo.com', resendAvailableAt: later(60).toISOString() });
    expect(errorLog).toHaveBeenCalledWith(expect.stringContaining('RESET_PASSWORD'), 'Brevo respondió 503');
  });

  it('dos peticiones a la vez para la misma cuenta y propósito: el mismo reto, un solo correo y ningún error', async () => {
    const [a, b] = await Promise.all([issueChallenge(deps, USER, 'LOGIN_2FA'), issueChallenge(deps, USER, 'LOGIN_2FA')]);
    expect(b).toEqual(a);
    expect(email.sent).toHaveLength(1);
    expect(await db.many('SELECT id FROM auth_challenges WHERE consumed_at IS NULL')).toHaveLength(1);
    const [c, d] = await Promise.all([
      issueChallenge(deps, USER, 'RESET_PASSWORD', { quiet: true }),
      issueChallenge(deps, USER, 'RESET_PASSWORD', { quiet: true }),
    ]);
    expect(d).toEqual(c);
    expect(email.sent).toHaveLength(2);
  });

  it('lo primero de la transacción de issueChallenge es el candado de la fila del usuario', async () => {
    const calls = recordQueries(db);
    await issueChallenge(deps, USER, 'VERIFY_EMAIL');
    expect(calls.find((c) => c.inTransaction)!.sql).toMatch(/FROM users WHERE id = \$1 FOR UPDATE/);
  });
});

describe('resendChallenge', () => {
  it('antes de 60 s da 429 RESEND_TOO_SOON con retryAfterSeconds; después manda otro código', async () => {
    const view = await issueChallenge(deps, USER, 'VERIFY_EMAIL');
    clock.set(later(20));
    await expectApiError(resendChallenge(deps, view.id), 429, 'RESEND_TOO_SOON', { retryAfterSeconds: 40 });
    expect(email.sent).toHaveLength(1);
    clock.set(later(60));
    await resendChallenge(deps, view.id);
    expect(email.sent).toHaveLength(2);
    expect(await row(view.id)).toMatchObject({ send_count: 2, last_sent_at: later(60).toISOString() });
  });

  it('el código anterior deja de valer, los intentos vuelven a 0 y el vencimiento se extiende', async () => {
    const view = await issueChallenge(deps, USER, 'VERIFY_EMAIL');
    const oldCode = email.lastCodeTo(USER.email);
    await expectApiError(verifyChallenge(deps, view.id, '000000' === oldCode ? '111111' : '000000'), 400, 'CODE_INVALID', { attemptsLeft: 4 });
    clock.set(later(600));
    await resendChallenge(deps, view.id);
    expect(await row(view.id)).toMatchObject({ attempts: 0, expires_at: later(600 + 15 * 60).toISOString() });
    const newCode = email.lastCodeTo(USER.email);
    if (newCode !== oldCode) await expectApiError(verifyChallenge(deps, view.id, oldCode), 400, 'CODE_INVALID', { attemptsLeft: 4 });
    expect(await verifyChallenge(deps, view.id, newCode)).toEqual({ userId: 'u1', purpose: 'VERIFY_EMAIL' });
  });

  it('el 6.º envío del reto da 410', async () => {
    const view = await issueChallenge(deps, USER, 'VERIFY_EMAIL');
    for (let i = 1; i <= 4; i++) {
      clock.set(later(61 * i));
      await resendChallenge(deps, view.id);
    }
    expect(email.sent).toHaveLength(5);
    clock.set(later(61 * 5));
    await expectApiError(resendChallenge(deps, view.id), 410, 'CHALLENGE_EXPIRED');
    expect(email.sent).toHaveLength(5);
  });

  it('410 si no existe, está vencido o ya se consumió', async () => {
    await expectApiError(resendChallenge(deps, 'no-existe'), 410, 'CHALLENGE_EXPIRED');
    const view = await issueChallenge(deps, USER, 'VERIFY_EMAIL');
    await verifyChallenge(deps, view.id, email.lastCodeTo(USER.email));
    clock.set(later(61));
    await expectApiError(resendChallenge(deps, view.id), 410, 'CHALLENGE_EXPIRED');
    const other = await issueChallenge(deps, USER, 'LOGIN_2FA');
    clock.set(later(61 + 15 * 60 + 1));
    await expectApiError(resendChallenge(deps, other.id), 410, 'CHALLENGE_EXPIRED');
  });

  it('si Brevo falla al reenviar: 503 y el código anterior sigue valiendo', async () => {
    const view = await issueChallenge(deps, USER, 'VERIFY_EMAIL');
    const code = email.lastCodeTo(USER.email);
    clock.set(later(61));
    email.fail(true);
    await expectApiError(resendChallenge(deps, view.id), 503, 'EMAIL_SEND_FAILED');
    expect(errorLog).toHaveBeenCalledWith(expect.stringContaining('VERIFY_EMAIL'), 'Brevo respondió 503');
    expect(await row(view.id)).toMatchObject({ send_count: 1, last_sent_at: START.toISOString() });
    expect(await verifyChallenge(deps, view.id, code)).toEqual({ userId: 'u1', purpose: 'VERIFY_EMAIL' });
  });
});

describe('verifyChallenge', () => {
  const wrongCode = (right: string) => (right === '000000' ? '111111' : '000000');

  it('código bueno: devuelve el usuario y el propósito; un segundo uso da 410', async () => {
    const view = await issueChallenge(deps, USER, 'RESET_PASSWORD');
    const code = email.lastCodeTo(USER.email);
    expect(await verifyChallenge(deps, view.id, code)).toEqual({ userId: 'u1', purpose: 'RESET_PASSWORD' });
    expect((await row(view.id))!.consumed_at).toBe(START.toISOString());
    await expectApiError(verifyChallenge(deps, view.id, code), 410, 'CHALLENGE_EXPIRED');
  });

  it('código malo: 400 CODE_INVALID con attemptsLeft 4, 3, 2, 1 y el quinto da 410 (después el bueno también)', async () => {
    const view = await issueChallenge(deps, USER, 'VERIFY_EMAIL');
    const code = email.lastCodeTo(USER.email);
    for (const left of [4, 3, 2, 1]) await expectApiError(verifyChallenge(deps, view.id, wrongCode(code)), 400, 'CODE_INVALID', { attemptsLeft: left });
    await expectApiError(verifyChallenge(deps, view.id, wrongCode(code)), 410, 'CHALLENGE_EXPIRED');
    expect(await row(view.id)).toMatchObject({ attempts: 5, consumed_at: START.toISOString() });
    await expectApiError(verifyChallenge(deps, view.id, code), 410, 'CHALLENGE_EXPIRED');
  });

  it('a los 15 min + 1 s da 410 (y 1 s antes todavía vale); un id inexistente da 410', async () => {
    const view = await issueChallenge(deps, USER, 'VERIFY_EMAIL');
    const code = email.lastCodeTo(USER.email);
    clock.set(later(15 * 60 - 1));
    expect(await verifyChallenge(deps, view.id, code)).toEqual({ userId: 'u1', purpose: 'VERIFY_EMAIL' });
    const second = await issueChallenge(deps, USER, 'VERIFY_EMAIL');
    clock.set(later(2 * 15 * 60 + 1));
    await expectApiError(verifyChallenge(deps, second.id, email.lastCodeTo(USER.email)), 410, 'CHALLENGE_EXPIRED');
    await expectApiError(verifyChallenge(deps, 'no-existe', '123456'), 410, 'CHALLENGE_EXPIRED');
  });

  it('purposeCheck corre tras el candado y antes de mirar el código: si lanza, no se gasta intento', async () => {
    const view = await issueChallenge(deps, USER, 'ENABLE_2FA');
    const code = email.lastCodeTo(USER.email);
    const purposeCheck = () => {
      throw Object.assign(new Error('no'), { status: 403, code: 'FORBIDDEN' });
    };
    await expectApiError(verifyChallenge(deps, view.id, wrongCode(code), { purposeCheck }), 403, 'FORBIDDEN');
    expect(await row(view.id)).toMatchObject({ attempts: 0, consumed_at: null });
    let seen: unknown;
    await verifyChallenge(deps, view.id, code, { purposeCheck: (c) => void (seen = c) });
    expect(seen).toEqual({ userId: 'u1', purpose: 'ENABLE_2FA' });
  });

  it('Review Focus 2: el candado FOR UPDATE es lo primero de la transacción y dos códigos malos con attempts = 4 dejan solo 410 y el reto consumido', async () => {
    const view = await issueChallenge(deps, USER, 'LOGIN_2FA');
    const code = email.lastCodeTo(USER.email);
    await db.query('UPDATE auth_challenges SET attempts = 4 WHERE id = $1', [view.id]);
    const calls = recordQueries(db);
    const results = await Promise.all([
      rejection(verifyChallenge(deps, view.id, wrongCode(code))),
      rejection(verifyChallenge(deps, view.id, wrongCode(code))),
    ]);
    expect(results.map((r) => (r as { status: number }).status)).toEqual([410, 410]);
    expect(await row(view.id)).toMatchObject({ attempts: 5, consumed_at: START.toISOString() });
    const inTx = calls.filter((c) => c.inTransaction);
    expect(inTx[0].sql).toMatch(/FOR UPDATE/);
    expect(calls.filter((c) => /FOR UPDATE/.test(c.sql))).toHaveLength(2);
    await expectApiError(verifyChallenge(deps, view.id, code), 410, 'CHALLENGE_EXPIRED');
  });
});
