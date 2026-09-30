import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { TestProject } from 'vitest/node';

import { createDb } from '../src/db/db';
import { migrate } from '../src/db/migrate';
import { openPglite, pgliteDriver } from '../src/db/pglite-driver';

declare module 'vitest' {
  export interface ProvidedContext {
    /** Archivo con una base PGlite ya migrada (dumpDataDir): cada test carga una copia (test/db.ts). */
    pgliteTemplate: string;
  }
}

// Una sola vez por `npm test`, antes de arrancar los workers: migrar una base PGlite cuesta 1,5–2,5 s y hacerlo a la
// vez en todos los workers satura la CPU. Los workers solo cargan esta copia (≈ 0,3 s por base).
export default async function setup(project: TestProject) {
  const lite = await openPglite();
  let dump: Blob | File;
  try {
    await migrate(createDb(pgliteDriver(lite, 'PGlite (plantilla)')));
    dump = await lite.dumpDataDir('none');
  } finally {
    await lite.close();
  }
  const dir = mkdtempSync(join(tmpdir(), 'hueckoapp-pglite-template-'));
  const file = join(dir, 'template.tar');
  writeFileSync(file, Buffer.from(await dump.arrayBuffer()));
  project.provide('pgliteTemplate', file);
  return () => rmSync(dir, { recursive: true, force: true });
}
