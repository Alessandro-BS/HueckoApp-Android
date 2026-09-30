import { readFile } from 'node:fs/promises';

import type { PGlite } from '@electric-sql/pglite';
import { inject } from 'vitest';

import { createDb, type Db } from '../src/db/db';
import { openPglite, pgliteDriver } from '../src/db/pglite-driver';

// Bases PGlite en memoria para los tests (D11). Cada test recibe una base recién migrada y vacía:
// - la primera vez, una copia de la plantilla que test/global-setup.ts migró una sola vez (≈ 0,3 s);
// - después, una base ya abierta de este worker que el test anterior dejó vacía con TRUNCATE (unos milisegundos).
// Si un test rompe el esquema (p. ej. DROP TABLE para forzar un error) o cierra la base, esa base se descarta.

let template: Promise<Blob> | undefined;
let expectedTables: number | undefined; // tablas de la plantilla, sin contar schema_migrations
const idle: PGlite[] = []; // listas para el próximo test
const lent: PGlite[] = []; // prestadas al test en curso
const empties: Db[] = []; // openEmptyDatabase: nunca se reutilizan

const APP_TABLES_SQL = `SELECT quote_ident(tablename) AS name FROM pg_tables
                        WHERE schemaname = current_schema() AND tablename <> 'schema_migrations'`;

async function loadFromTemplate(): Promise<PGlite> {
  template ??= readFile(inject('pgliteTemplate')).then((bytes) => new Blob([bytes]));
  const lite = await openPglite({ loadDataDir: await template });
  expectedTables ??= (await lite.query(APP_TABLES_SQL)).rows.length;
  return lite;
}

/** Base con todas las migraciones aplicadas y sin datos. Se devuelve sola al terminar el test (setup.ts). */
export async function openTestDatabase(): Promise<Db> {
  const lite = idle.pop() ?? (await loadFromTemplate());
  lent.push(lite);
  return createDb(pgliteDriver(lite, 'PGlite (test)'));
}

/** Base nueva SIN migraciones (tests de migrate). Se cierra sola al terminar el test. */
export async function openEmptyDatabase(): Promise<Db> {
  const db = createDb(pgliteDriver(await openPglite(), 'PGlite (vacía)'));
  empties.push(db);
  return db;
}

// Deja la base como recién migrada: todas las tablas vacías y los contadores (seq, ai_calls.id) a 1.
async function reset(lite: PGlite): Promise<boolean> {
  if (lite.closed) return false;
  try {
    const tables = (await lite.query<{ name: string }>(APP_TABLES_SQL)).rows.map((r) => r.name);
    if (tables.length !== expectedTables) return false;
    await lite.exec(`TRUNCATE ${tables.join(', ')} RESTART IDENTITY CASCADE`);
    return true;
  } catch {
    return false;
  }
}

/** afterEach (setup.ts): vacía y guarda para el siguiente test las bases prestadas; cierra las que no sirven. */
export async function releaseTestDatabases(): Promise<void> {
  const returned = lent.splice(0);
  for (const lite of returned) {
    if (await reset(lite)) idle.push(lite);
    else if (!lite.closed) await lite.close();
  }
  await Promise.all(empties.splice(0).map((db) => db.close()));
}

/** afterAll (setup.ts): cierra las bases guardadas. Vitest aísla cada archivo de test: no pasarían al siguiente. */
export async function closeTestDatabases(): Promise<void> {
  await releaseTestDatabases();
  await Promise.all(idle.splice(0).map((lite) => lite.close()));
}
