import { describe, expect, it } from 'vitest';

import { isLocalDatabaseUrl } from '../src/config/env-schema';
import { assertSeedTarget, SEED_USAGE } from '../src/db/seed-guard';

const NEON = 'postgresql://usuario:clave@ep-ejemplo-123.us-east-2.aws.neon.tech/neondb?sslmode=verify-full';

describe('isLocalDatabaseUrl', () => {
  it.each([
    ['postgres://postgres@localhost:5432/hueckoapp', true],
    ['postgresql://u:p@127.0.0.1/db', true],
    ['postgresql://u:p@[::1]:5432/db', true],
    [NEON, false],
    ['postgresql://u:p@localhost.ejemplo.com/db', false],
  ])('%s → %s', (url, expected) => {
    expect(isLocalDatabaseUrl(url)).toBe(expected);
  });
});

describe('assertSeedTarget (la semilla no escribe cuentas demo en una base remota por descuido)', () => {
  it('PGlite (carpeta o memoria) y un Postgres local: adelante', () => {
    expect(() => assertSeedTarget({ kind: 'pglite', dataDir: './data/pglite' }, [])).not.toThrow();
    expect(() => assertSeedTarget({ kind: 'memory' }, [])).not.toThrow();
    expect(() => assertSeedTarget({ kind: 'postgres', url: 'postgres://postgres@localhost:5432/hueckoapp' }, [])).not.toThrow();
  });

  it('un Postgres remoto se rechaza, nombra solo el host (sin contraseña) y explica --allow-remote', () => {
    const run = () => assertSeedTarget({ kind: 'postgres', url: NEON }, []);
    expect(run).toThrow('ep-ejemplo-123.us-east-2.aws.neon.tech');
    expect(run).toThrow('--allow-remote');
    expect(run).not.toThrow('clave');
  });

  it('con --allow-remote, un Postgres remoto se acepta (control positivo)', () => {
    expect(() => assertSeedTarget({ kind: 'postgres', url: NEON }, ['--allow-remote'])).not.toThrow();
  });

  it('un argumento desconocido es un error con el uso', () => {
    expect(() => assertSeedTarget({ kind: 'memory' }, ['--allow-remot'])).toThrow(SEED_USAGE);
  });
});
