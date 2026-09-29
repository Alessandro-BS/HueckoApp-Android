import type { Db } from './database';

// Ejecuta `fn` dentro de una transacción: COMMIT si termina, ROLLBACK y relanza si lanza.
export function withTransaction<T>(db: Db, fn: () => T): T {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
