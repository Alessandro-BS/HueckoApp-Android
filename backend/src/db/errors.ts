// Errores de Postgres que el código trata (los dos adaptadores los lanzan con `code` y `constraint`).
// https://www.postgresql.org/docs/current/errcodes-appendix.html
const UNIQUE_VIOLATION = '23505';

/** true si `error` es una clave repetida en la restricción `constraint` (p. ej. «users_email_key»). */
export function isUniqueViolation(error: unknown, constraint: string): boolean {
  const e = error as { code?: unknown; constraint?: unknown } | null;
  return typeof e === 'object' && e !== null && e.code === UNIQUE_VIOLATION && e.constraint === constraint;
}
