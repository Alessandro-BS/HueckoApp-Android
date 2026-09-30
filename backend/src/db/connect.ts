import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

import { createDb, type Db } from './db';
import { migrate } from './migrate';
import { migrations } from './migrations';
import { pgDriver } from './pg-driver';
import { acquireDataDirLock } from './pglite-lock';
import { openPglite, pgliteDriver } from './pglite-driver';

/** Dónde está la base: Postgres (Neon) por URL, PGlite en una carpeta (desarrollo) o PGlite en memoria. */
export type DatabaseConfig = { kind: 'postgres'; url: string } | { kind: 'pglite'; dataDir: string } | { kind: 'memory' };

/** Con DATABASE_URL, Postgres; sin ella, PGlite en PGLITE_DATA_DIR (D9). No lee process.env: recibe el entorno ya validado. */
export function databaseConfig(env: { DATABASE_URL: string; PGLITE_DATA_DIR: string }): DatabaseConfig {
  return env.DATABASE_URL ? { kind: 'postgres', url: env.DATABASE_URL } : { kind: 'pglite', dataDir: env.PGLITE_DATA_DIR };
}

async function connect(config: DatabaseConfig): Promise<Db> {
  switch (config.kind) {
    case 'postgres':
      return createDb(pgDriver(config.url));
    case 'memory':
      return createDb(pgliteDriver(await openPglite(), 'PGlite (memoria)'));
    case 'pglite': {
      const dataDir = resolve(config.dataDir);
      mkdirSync(dirname(dataDir), { recursive: true });
      const release = await acquireDataDirLock(dataDir);
      try {
        return createDb(pgliteDriver(await openPglite({ dataDir }), `PGlite (${config.dataDir})`, release));
      } catch (error) {
        release();
        throw error;
      }
    }
  }
}

/** El servidor y la semilla: abre (o crea) la base y la deja al día. */
export async function openDatabase(config: DatabaseConfig): Promise<Db> {
  const db = await connect(config);
  try {
    await migrate(db);
    return db;
  } catch (error) {
    await db.close();
    throw error;
  }
}

/**
 * Las herramientas de consola (npm run make-admin): solo una base que YA existe y ya tiene el esquema de HueckoApp, en
 * la misma versión que este código (no la migra).
 * Con una carpeta o una URL equivocadas no crea una base vacía (donde el correo nunca aparecería): falla y dice qué revisar.
 */
export async function openExistingDatabase(config: DatabaseConfig): Promise<Db> {
  if (config.kind === 'pglite' && !existsSync(join(config.dataDir, 'PG_VERSION'))) {
    throw new Error(
      `No hay ninguna base local en «${config.dataDir}» (PGLITE_DATA_DIR). Revisa backend/.env o arranca el servidor una vez para crearla.`,
    );
  }
  const db = await connect(config);
  try {
    const found = await db.one<{ ready: boolean }>("SELECT to_regclass('schema_migrations') IS NOT NULL AS ready");
    if (!found?.ready) {
      throw new Error(
        `La base ${db.description} no tiene el esquema de HueckoApp. Revisa DATABASE_URL en backend/.env o arranca el servidor una vez para crearlo.`,
      );
    }
    // No migra: con una copia del código más nueva que el servidor desplegado, migraría producción antes del despliegue.
    const { current } = (await db.one<{ current: number }>('SELECT COALESCE(MAX(version), 0) AS current FROM schema_migrations'))!;
    if (current !== migrations.length) {
      throw new Error(
        `La base ${db.description} está en la versión ${current} del esquema y este código espera la ${migrations.length}: ` +
          (current < migrations.length
            ? 'despliega (o arranca) antes el servidor con este código, que es quien la migra, y repite.'
            : 'actualiza tu copia del repositorio (git pull) y repite.'),
      );
    }
    return db;
  } catch (error) {
    await db.close();
    throw error;
  }
}
