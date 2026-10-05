import { isLocalDatabaseUrl } from '../config/env-schema';
import type { DatabaseConfig } from './connect';

const ALLOW_REMOTE = '--allow-remote';
export const SEED_USAGE = `Uso: npm run seed -w backend [-- ${ALLOW_REMOTE}]`;

/**
 * La semilla crea cuentas con una contraseña conocida (también admin@test.com, ADMIN). Contra una base que no está en
 * esta máquina (p. ej. Neon, si su DATABASE_URL quedó en backend/.env) se niega, antes de conectarse, salvo que se
 * pida a propósito con --allow-remote (una base remota de pruebas).
 */
export function assertSeedTarget(config: DatabaseConfig, argv: readonly string[]): void {
  const unknown = argv.filter((arg) => arg !== ALLOW_REMOTE);
  if (unknown.length > 0) throw new Error(`Argumento desconocido: ${unknown.join(' ')}. ${SEED_USAGE}`);
  if (config.kind !== 'postgres' || isLocalDatabaseUrl(config.url) || argv.includes(ALLOW_REMOTE)) return;
  throw new Error(
    `DATABASE_URL apunta a otro servidor (${new URL(config.url).host}) y la semilla crea cuentas demo con contraseña conocida, ` +
      `una de ellas ADMIN: no se aplica. Si de verdad es una base de pruebas, repite con: npm run seed -w backend -- ${ALLOW_REMOTE}`,
  );
}
