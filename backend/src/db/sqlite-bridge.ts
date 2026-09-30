// TEMPORAL (Tasks 2–5; se borra en el Task 6): la API asíncrona `Db` sobre la base SQLite de siempre, para pasar el
// código a async por áreas con la suite en verde (D13). El código aún sin convertir sigue usando `prepare` síncrono
// sobre la misma conexión: `BridgeDb` cumple los dos tipos.
import type { DatabaseSync, SQLInputValue } from 'node:sqlite';

import type { Db as LegacyDb } from './database';
import { createDb, type Db, type Driver, type Runner } from './db';

export type BridgeDb = Db & LegacyDb;

// $1, $2… (Postgres) → ?1, ?2… (SQLite los numera igual y admite repetir el mismo parámetro).
const toSqlite = (sql: string) => sql.replace(/\$(\d+)/g, '?$1');
const READS_ROWS = /^\s*(SELECT|WITH|PRAGMA)\b/i;

export function createSqliteDb(sqlite: DatabaseSync): BridgeDb {
  const runner: Runner = {
    async query(sql, params) {
      const statement = sqlite.prepare(toSqlite(sql));
      // SQLite no tiene booleanos: true/false → 1/0, como guardaba el código antiguo.
      const values = params.map((p) => (typeof p === 'boolean' ? Number(p) : p)) as unknown as SQLInputValue[];
      if (READS_ROWS.test(sql)) return { rows: statement.all(...values).map((row) => ({ ...row })), rowCount: 0 };
      return { rows: [], rowCount: Number(statement.run(...values).changes) };
    },
    async exec(sql) {
      sqlite.exec(sql);
    },
  };
  const driver: Driver = {
    description: 'SQLite (puente temporal)',
    ...runner,
    // Una sola conexión: si el código antiguo (síncrono) ya abrió una transacción, se corre dentro de ella.
    async transaction(fn) {
      if (sqlite.isTransaction) return fn(runner);
      sqlite.exec('BEGIN');
      try {
        const result = await fn(runner);
        sqlite.exec('COMMIT');
        return result;
      } catch (error) {
        if (sqlite.isTransaction) sqlite.exec('ROLLBACK');
        throw error;
      }
    },
    async close() {
      sqlite.close();
    },
  };
  const db = createDb(driver);
  // Lo que usa el código aún síncrono (tipo `Db` de database.ts). writable/configurable: vi.spyOn puede espiarlo.
  Object.defineProperty(db, 'prepare', { value: (sql: string) => sqlite.prepare(sql), writable: true, configurable: true });
  Object.defineProperty(db, 'isTransaction', { get: () => sqlite.isTransaction, configurable: true });
  return db as BridgeDb;
}
