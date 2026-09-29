import type { Db } from './database';

// Ejecuta `fn` dentro de una transacción: COMMIT si termina, ROLLBACK y relanza si lanza.
// Reentrante: si ya hay una transacción abierta, `fn` corre dentro de ella sin BEGIN/COMMIT propios;
// la transacción externa decide (si `fn` lanza, el error sube y la externa hace ROLLBACK de todo).
export function withTransaction<T>(db: Db, fn: () => T): T {
  if (db.isTransaction) return fn();
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
