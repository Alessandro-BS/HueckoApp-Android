// Semilla de desarrollo: npm run seed -w backend. Los datos viven en demo-data.ts (también lo usan los tests).
// Se puede repetir: no duplica nada y renueva los dos planes de ejemplo con fechas de hoy. Nunca en producción.
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

import { hashPassword } from '../auth/passwords';
import { env } from '../config/env';
import { openDatabase } from './database';
import { DEMO_PASSWORD, seedDemoData } from './demo-data';

async function main() {
  if (env.NODE_ENV === 'production') throw new Error('La semilla es solo para desarrollo.');
  const passwordHash = await hashPassword(DEMO_PASSWORD);
  mkdirSync(dirname(env.DATABASE_PATH), { recursive: true });
  const db = openDatabase(env.DATABASE_PATH);
  try {
    const created = seedDemoData(db, passwordHash, new Date());
    console.log(
      `Semilla aplicada en ${env.DATABASE_PATH}: ${created.users} usuarios, ${created.groups} grupos y ${created.blocks} bloques nuevos; ${created.proposals} planes de ejemplo renovados con fechas de hoy.`,
    );
    console.log(`Cuentas demo: test@test.com, ana@test.com, carlos@test.com y admin@test.com (administración) — contraseña «${DEMO_PASSWORD}».`);
  } finally {
    db.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
