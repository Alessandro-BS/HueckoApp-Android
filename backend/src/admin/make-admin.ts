// Da o quita el rol de administrador de la app desde la consola del servidor (D3). La API no puede hacerlo:
// nadie se hace administrador al registrarse ni con una petición.
//   npm run make-admin -w backend -- ana@test.com
//   npm run make-admin -w backend -- ana@test.com --revoke
// Usa DATABASE_PATH de backend/.env (como la semilla). Queda en el registro de acciones como «Consola del servidor».
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

import { env } from '../config/env';
import { openDatabase } from '../db/database';
import { setRoleByEmail } from './admin-users';
import { parseMakeAdminArgs } from './make-admin-args';

function main() {
  const { email, revoke } = parseMakeAdminArgs(process.argv.slice(2));
  mkdirSync(dirname(env.DATABASE_PATH), { recursive: true });
  const db = openDatabase(env.DATABASE_PATH);
  try {
    const { user, changed } = setRoleByEmail(db, email, revoke ? 'USER' : 'ADMIN', new Date());
    const who = `${user.name} <${user.email}>`;
    if (!changed) console.log(`${who} ${revoke ? 'no era' : 'ya era'} administrador: no se cambió nada.`);
    else if (revoke) console.log(`${who} ya no es administrador.`);
    else console.log(`${who} ahora es administrador. Verá «Administración» al volver a abrir la app o iniciar sesión.`);
  } finally {
    db.close();
  }
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
