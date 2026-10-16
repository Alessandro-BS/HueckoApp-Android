import jwt, { type SignOptions } from 'jsonwebtoken';

export function signToken(userId: string, secret: string, expiresIn: string): string {
  return jwt.sign({}, secret, { subject: userId, expiresIn: expiresIn as SignOptions['expiresIn'] });
}

// Devuelve el id del usuario o null si el token es inválido o expiró.
export function verifyToken(token: string, secret: string): string | null {
  try {
    const payload = jwt.verify(token, secret);
    return typeof payload === 'object' && typeof payload.sub === 'string' ? payload.sub : null;
  } catch {
    return null;
  }
}
