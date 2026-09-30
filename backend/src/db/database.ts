import { existsSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

import { migrations } from './migrations';

export type Db = DatabaseSync;

// Abre (o crea) la base y la deja al día. ':memory:' para tests.
export function openDatabase(path: string): Db {
  return ready(new DatabaseSync(path));
}

function ready(db: Db): Db {
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec('PRAGMA journal_mode = WAL;');
  migrate(db);
  return db;
}

// Milisegundos que una escritura espera si otro proceso (el servidor) tiene la base bloqueada, en vez de fallar al instante.
export const BUSY_TIMEOUT_MS = 5000;

/**
 * Para las herramientas de consola (npm run make-admin): abre una base que YA existe. Con una ruta equivocada
 * no crea un archivo vacío (donde el correo nunca aparecería) sino que falla nombrando DATABASE_PATH.
 * Espera BUSY_TIMEOUT_MS si el servidor está escribiendo a la vez.
 */
export function openExistingDatabase(path: string): Db {
  if (!existsSync(path)) {
    throw new Error(
      `No hay ninguna base de datos en «${path}» (DATABASE_PATH). Revisa backend/.env o arranca el servidor una vez para crearla.`,
    );
  }
  const db = new DatabaseSync(path);
  db.exec(`PRAGMA busy_timeout = ${BUSY_TIMEOUT_MS};`);
  return ready(db);
}

export function migrate(db: Db): void {
  const { user_version: current } = db.prepare('PRAGMA user_version').get() as { user_version: number };
  for (let version = current; version < migrations.length; version++) {
    db.exec('BEGIN');
    try {
      db.exec(migrations[version]);
      db.exec(`PRAGMA user_version = ${version + 1}`);
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }
}
