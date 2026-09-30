import { afterAll, afterEach } from 'vitest';

import { closeTestDatabases, releaseTestDatabases } from './db';

// Cada test recibe su base PGlite recién migrada y vacía (test/db.ts): al terminar se vacía para el siguiente
// test del mismo archivo, y al terminar el archivo se cierran todas.
afterEach(releaseTestDatabases);
afterAll(closeTestDatabases);
