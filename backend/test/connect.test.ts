import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { databaseConfig, openDatabase, openExistingDatabase } from '../src/db/connect';
import { migrations } from '../src/db/pg-migrations';
import { acquireDataDirLock } from '../src/db/pglite-lock';
import { openPglite } from '../src/db/pglite-driver';

// Crear una base PGlite en disco (initdb) tarda ≈ 2,5 s sola y bastante más con toda la suite a la vez.
const DISK_TIMEOUT_MS = 60_000;

const dirs: string[] = [];
const tempDir = () => {
  const dir = mkdtempSync(join(tmpdir(), 'hueckoapp-pglite-'));
  dirs.push(dir);
  return dir;
};
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('databaseConfig (D9)', () => {
  it('con DATABASE_URL, Postgres; sin ella, PGlite en PGLITE_DATA_DIR', () => {
    const url = 'postgresql://u:p@ep-x.neon.tech/neondb?sslmode=verify-full';
    expect(databaseConfig({ DATABASE_URL: url, PGLITE_DATA_DIR: './data/pglite' })).toEqual({ kind: 'postgres', url });
    expect(databaseConfig({ DATABASE_URL: '', PGLITE_DATA_DIR: './data/pglite' })).toEqual({ kind: 'pglite', dataDir: './data/pglite' });
  });
});

describe('openDatabase con PGlite en una carpeta', () => {
  it('crea la base, la migra, guarda los datos y suelta el candado al cerrar', async () => {
    const dataDir = join(tempDir(), 'pglite');
    const db = await openDatabase({ kind: 'pglite', dataDir });
    expect(db.description).toBe(`PGlite (${dataDir})`);
    expect(existsSync(`${dataDir}.lock`)).toBe(true);
    expect(readFileSync(`${dataDir}.lock`, 'utf8')).toBe(String(process.pid));
    await db.query("INSERT INTO users (id, name, email, password_hash) VALUES ('u1', 'Ana', 'ana@correo.com', 'x')");
    await db.close();
    expect(existsSync(`${dataDir}.lock`)).toBe(false);

    const again = await openExistingDatabase({ kind: 'pglite', dataDir });
    try {
      expect(await again.one('SELECT name FROM users')).toEqual({ name: 'Ana' });
      expect(await again.one('SELECT MAX(version) AS v FROM schema_migrations')).toEqual({ v: migrations.length });
    } finally {
      await again.close();
    }
  }, DISK_TIMEOUT_MS);
});

describe('openExistingDatabase (npm run make-admin)', () => {
  it('una carpeta sin base no se crea: error que nombra PGLITE_DATA_DIR', async () => {
    const dataDir = join(tempDir(), 'no-existe');
    await expect(openExistingDatabase({ kind: 'pglite', dataDir })).rejects.toThrow(
      `No hay ninguna base local en «${dataDir}» (PGLITE_DATA_DIR).`,
    );
    expect(existsSync(dataDir)).toBe(false);
  });

  it('una base sin el esquema de HueckoApp se rechaza y queda cerrada (se puede volver a abrir)', async () => {
    const dataDir = join(tempDir(), 'pglite');
    await (await openPglite({ dataDir })).close(); // una base Postgres vacía, sin migrar
    await expect(openExistingDatabase({ kind: 'pglite', dataDir })).rejects.toThrow('no tiene el esquema de HueckoApp');
    expect(existsSync(`${dataDir}.lock`)).toBe(false);
  }, DISK_TIMEOUT_MS);
});

describe('acquireDataDirLock (D10)', () => {
  it('un segundo proceso (aquí, el mismo) no puede abrir la carpeta mientras otro la tiene; al soltarla, sí', async () => {
    const dataDir = join(tempDir(), 'pglite');
    const release = await acquireDataDirLock(dataDir);
    await expect(acquireDataDirLock(dataDir, 0)).rejects.toThrow(`está abierta por otro proceso (pid ${process.pid})`);
    release();
    const again = await acquireDataDirLock(dataDir, 0); // control positivo
    again();
  });

  it('el candado de un proceso que ya no existe se recupera', async () => {
    const dataDir = join(tempDir(), 'pglite');
    writeFileSync(`${dataDir}.lock`, '2147483646'); // pid que no existe
    const release = await acquireDataDirLock(dataDir, 0);
    expect(readFileSync(`${dataDir}.lock`, 'utf8')).toBe(String(process.pid));
    release();
  });
});
