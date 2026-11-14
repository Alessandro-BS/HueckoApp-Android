import { createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

/** Seis dígitos, con ceros a la izquierda. */
export const generateCode = (): string => randomInt(0, 1_000_000).toString().padStart(6, '0');

export const generateChallengeId = (): string => randomBytes(32).toString('base64url');

/** HMAC-SHA256 hex de `${challengeId}:${code}`: la base nunca guarda el código. */
export const hashCode = (secret: string, challengeId: string, code: string): string =>
  createHmac('sha256', secret).update(`${challengeId}:${code}`).digest('hex');

export function codeMatches(secret: string, challengeId: string, code: string, hash: string): boolean {
  const expected = Buffer.from(hashCode(secret, challengeId, code));
  const actual = Buffer.from(hash);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/** «a***@gmail.com»: primera letra, `***` y el dominio. */
export function emailHint(email: string): string {
  const at = email.lastIndexOf('@');
  return `${email.slice(0, 1)}***${at >= 0 ? email.slice(at) : ''}`;
}
