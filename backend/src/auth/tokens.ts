import jwt, { type SignOptions } from 'jsonwebtoken';

/** `sv` = session_version de la cuenta: subirla en la base invalida todos los tokens emitidos antes. */
export function signToken(userId: string, secret: string, expiresIn: string, sessionVersion: number): string {
  return jwt.sign({ sv: sessionVersion }, secret, { subject: userId, expiresIn: expiresIn as SignOptions['expiresIn'] });
}

/**
 * El usuario y la versión de sesión del token, o null si es inválido o expiró. Un token emitido antes de que existiera
 * `sv` cuenta como versión 0 (nadie pierde la sesión al actualizar); un `sv` que no es un entero lo invalida.
 */
export function verifyToken(token: string, secret: string): { userId: string; sessionVersion: number } | null {
  try {
    const payload = jwt.verify(token, secret);
    if (typeof payload !== 'object' || typeof payload.sub !== 'string') return null;
    const sv: unknown = payload.sv ?? 0;
    if (typeof sv !== 'number' || !Number.isInteger(sv)) return null;
    return { userId: payload.sub, sessionVersion: sv };
  } catch {
    return null;
  }
}
