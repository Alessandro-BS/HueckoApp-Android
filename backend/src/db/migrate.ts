import type { Db } from './db';
import { migrations, NOW_ISO_SQL } from './pg-migrations';

// Número fijo del candado de migraciones: dos procesos que arrancan a la vez (p. ej. dos instancias del servidor)
// no aplican la misma migración dos veces; el segundo espera y ya la encuentra hecha.
const MIGRATION_LOCK_ID = 72_616_001;

/**
 * Deja la base al día: aplica, en orden y en UNA transacción, las migraciones que aún no están en schema_migrations.
 * Si una falla, no queda ninguna a medias (el DDL de Postgres es transaccional). `list` solo cambia en los tests.
 */
export async function migrate(db: Db, list: readonly string[] = migrations): Promise<void> {
  await db.transaction(async () => {
    await db.query('SELECT pg_advisory_xact_lock($1)', [MIGRATION_LOCK_ID]);
    await db.exec(
      `CREATE TABLE IF NOT EXISTS schema_migrations (
         version    INTEGER PRIMARY KEY,
         applied_at TEXT NOT NULL DEFAULT ${NOW_ISO_SQL}
       )`,
    );
    const { current } = (await db.one<{ current: number }>('SELECT COALESCE(MAX(version), 0) AS current FROM schema_migrations'))!;
    for (let version = current; version < list.length; version++) {
      await db.exec(list[version]);
      await db.query('INSERT INTO schema_migrations (version) VALUES ($1)', [version + 1]);
    }
  });
}
