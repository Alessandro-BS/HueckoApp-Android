// Semilla de desarrollo: npm run seed -w backend. Los datos viven en demo-data.ts (también lo usan los tests).
// Se puede repetir: no duplica nada y renueva los dos planes de ejemplo con fechas de hoy. Nunca en producción, y
// contra un Postgres remoto solo con --allow-remote (seed-guard.ts).
import { hashPassword } from '../auth/passwords';
import { env } from '../config/env';
import { databaseConfig, openDatabase } from './connect';
import { DEMO_ADMIN_EMAIL, DEMO_PASSWORD, seedDemoData } from './demo-data';
import { assertSeedTarget } from './seed-guard';

async function main() {
  if (env.NODE_ENV === 'production') throw new Error('La semilla es solo para desarrollo.');
  const config = databaseConfig(env);
  assertSeedTarget(config, process.argv.slice(2)); // antes de conectarse
  const passwordHash = await hashPassword(DEMO_PASSWORD);
  const db = await openDatabase(config);
  try {
    const created = await seedDemoData(db, passwordHash, new Date());
    console.log(
      `Semilla aplicada en ${db.description}: ${created.users} usuarios, ${created.groups} grupos y ${created.blocks} bloques nuevos; ${created.proposals} planes de ejemplo renovados con fechas de hoy.`,
    );
    if (created.adminReset) console.log(`${DEMO_ADMIN_EMAIL} había dejado de ser administrador activo: vuelve a ser ADMIN y ACTIVE.`);
    console.log(`Cuentas demo: test@test.com, ana@test.com, carlos@test.com y admin@test.com (administración) — contraseña «${DEMO_PASSWORD}».`);
  } finally {
    await db.close();
  }
}

main().catch((error: unknown) => {
  // Los errores esperables (base local en uso, DATABASE_URL mal escrita…) ya explican qué hacer: sin la traza.
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
