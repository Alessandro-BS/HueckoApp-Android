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

describe('EXPRESS_VOTE_MINUTES', () => {
  it('por defecto 60; acepta otro entero positivo y rechaza 0 o decimales', () => {
    expect(parseEnv(BASE).EXPRESS_VOTE_MINUTES).toBe(60);
    expect(parseEnv({ ...BASE, EXPRESS_VOTE_MINUTES: '30' }).EXPRESS_VOTE_MINUTES).toBe(30);
    expect(() => parseEnv({ ...BASE, EXPRESS_VOTE_MINUTES: '0' })).toThrow();
    expect(() => parseEnv({ ...BASE, EXPRESS_VOTE_MINUTES: '1.5' })).toThrow();
  });
});

describe('CRON_SECRET y EXPO_ACCESS_TOKEN', () => {
  it('sin configurar: undefined; vacía o en blanco (Render la deja así) tampoco rompe el arranque', () => {
    expect(parseEnv(BASE).CRON_SECRET).toBeUndefined();
    expect(parseEnv({ ...BASE, CRON_SECRET: '' }).CRON_SECRET).toBeUndefined();
    expect(parseEnv({ ...BASE, CRON_SECRET: '   ' }).CRON_SECRET).toBeUndefined();
  });

  it('con valor exige 32 caracteres', () => {
    expect(() => parseEnv({ ...BASE, CRON_SECRET: 'corto' })).toThrow('CRON_SECRET debe tener al menos 32 caracteres');
    expect(parseEnv({ ...BASE, CRON_SECRET: ' ' + 'x'.repeat(32) + ' ' }).CRON_SECRET).toBe('x'.repeat(32));
  });

  it('EXPO_ACCESS_TOKEN es opcional', () => {
    expect(parseEnv(BASE).EXPO_ACCESS_TOKEN).toBeUndefined();
    expect(parseEnv({ ...BASE, EXPO_ACCESS_TOKEN: ' tok ' }).EXPO_ACCESS_TOKEN).toBe('tok');
  });
});
