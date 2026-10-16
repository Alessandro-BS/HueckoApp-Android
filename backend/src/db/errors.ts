// Errores de Postgres que el código trata (los dos adaptadores los lanzan con `code` y `constraint`).
// https://www.postgresql.org/docs/current/errcodes-appendix.html
const UNIQUE_VIOLATION = '23505';
const FOREIGN_KEY_VIOLATION = '23503';

const hasCode = (error: unknown, code: string, constraint: string): boolean => {
  const e = error as { code?: unknown; constraint?: unknown } | null;
  return typeof e === 'object' && e !== null && e.code === code && e.constraint === constraint;
};

/** true si `error` es una clave repetida en la restricción `constraint` (p. ej. «users_email_key»). */
export function isUniqueViolation(error: unknown, constraint: string): boolean {
  return hasCode(error, UNIQUE_VIOLATION, constraint);
}

/**
 * true si `error` es una clave foránea rota en `constraint` (p. ej. «group_members_group_id_fkey»): la fila a la que
 * apunta se borró mientras tanto (en Neon, otra conexión la borró y este INSERT esperó a que terminara).
 */
export function isForeignKeyViolation(error: unknown, constraint: string): boolean {
  return hasCode(error, FOREIGN_KEY_VIOLATION, constraint);
}

/**
 * Tras un error dentro de una transacción, Postgres la deja abortada y su COMMIT en realidad la deshace (sin error).
 * Si la función capturó ese error y terminó bien, se lanza esto: nada de lo que hizo quedó guardado.
 */
export const abortedTransactionError = () =>
  new Error('Postgres deshizo la transacción: una consulta falló dentro y su error se capturó sin relanzarlo. No se guardó nada.');
