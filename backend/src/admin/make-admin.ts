// Da o quita el rol de administrador de la app desde la consola del servidor (D3). La API no puede hacerlo:
// nadie se hace administrador al registrarse ni con una petición.
//   npm run make-admin -w backend -- ana@test.com
//   npm run make-admin -w backend -- ana@test.com --revoke
// Usa DATABASE_PATH de backend/.env (como la semilla) y solo abre una base que ya exista. Queda en el registro de
// acciones como «Consola del servidor».
import 'dotenv/config';
import { z } from 'zod';

import { parseEnv } from '../config/env-schema';
import { openExistingDatabase } from '../db/database';
import { createSqliteDb } from '../db/sqlite-bridge';
import { setRoleByEmail } from './admin-users';
import { parseMakeAdminArgs } from './make-admin-args';

async function main() {
  // Primero los argumentos; el entorno se valida aquí dentro (no al importar) para que sus errores también
  // salgan como un mensaje limpio por consola.
  const { email, revoke } = parseMakeAdminArgs(process.argv.slice(2));
  const env = parseEnv();
  const db = createSqliteDb(openExistingDatabase(env.DATABASE_PATH)); // TEMPORAL: connect.ts en el Task 6
  try {
    const { user, changed } = await setRoleByEmail(db, email, revoke ? 'USER' : 'ADMIN', new Date());
    const who = `${user.name} <${user.email}>`;
    if (!changed) console.log(`${who} ${revoke ? 'no era' : 'ya era'} administrador: no se cambió nada.`);
    else if (revoke) console.log(`${who} ya no es administrador. El cambio se ve al volver a la app, al reabrirla o al iniciar sesión.`);
    else console.log(`${who} ahora es administrador. Verá «Administración» al volver a la app, al reabrirla o al iniciar sesión.`);
  } finally {
    await db.close();
  }
}

main().catch((error: unknown) => {
  if (error instanceof z.ZodError) console.error(`Revisa backend/.env:\n${z.prettifyError(error)}`);
  else console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
