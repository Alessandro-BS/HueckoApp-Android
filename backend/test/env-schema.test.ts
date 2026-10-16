import { describe, expect, it } from 'vitest';

import { parseEnv } from '../src/config/env-schema';

const BASE = { JWT_SECRET: 'secreto-de-pruebas-con-mas-de-32-caracteres' };
const NEON = 'postgresql://usuario:clave@ep-ejemplo-123.us-east-2.aws.neon.tech/neondb?sslmode=verify-full&channel_binding=require';

describe('DATABASE_URL y PGLITE_DATA_DIR (D9)', () => {
  it('sin DATABASE_URL: vacía y PGlite en ./data/pglite', () => {
    const env = parseEnv(BASE);
    expect([env.DATABASE_URL, env.PGLITE_DATA_DIR]).toEqual(['', './data/pglite']);
  });

  it('acepta la URL de Neon con sslmode (require o verify-full) y una local sin TLS', () => {
    expect(parseEnv({ ...BASE, DATABASE_URL: NEON }).DATABASE_URL).toBe(NEON);
    expect(parseEnv({ ...BASE, DATABASE_URL: NEON.replace('verify-full', 'require') }).DATABASE_URL).toContain('sslmode=require');
    expect(parseEnv({ ...BASE, DATABASE_URL: 'postgres://postgres@localhost:5432/hueckoapp' }).DATABASE_URL).toContain('localhost');
  });

  it('rechaza lo que no es postgresql:// y una URL remota sin TLS', () => {
    expect(() => parseEnv({ ...BASE, DATABASE_URL: 'mysql://u:p@host/db' })).toThrow('DATABASE_URL debe ser una URL postgresql://');
    expect(() => parseEnv({ ...BASE, DATABASE_URL: NEON.replace('?sslmode=verify-full&', '?') })).toThrow('añade ?sslmode=verify-full');
  });

  it('en producción DATABASE_URL es obligatoria; con ella, arranca', () => {
    expect(() => parseEnv({ ...BASE, NODE_ENV: 'production' })).toThrow('En producción DATABASE_URL es obligatoria');
    expect(parseEnv({ ...BASE, NODE_ENV: 'production', DATABASE_URL: NEON }).NODE_ENV).toBe('production'); // control positivo
  });
});
