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
    expect(parseEnv({ ...BASE, NODE_ENV: 'production', DATABASE_URL: NEON, BREVO_API_KEY: 'k', BREVO_SENDER_EMAIL: 'a@b.com' }).NODE_ENV).toBe('production'); // control positivo
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

describe('Brevo, Google y CODE_RATE_LIMIT (cuentas)', () => {
  const NEON_PROD = { ...BASE, NODE_ENV: 'production', DATABASE_URL: NEON };
  const BREVO = { BREVO_API_KEY: 'xkeysib-clave', BREVO_SENDER_EMAIL: 'avisos@hueckoapp.com' };
  const MESSAGE = 'En producción BREVO_API_KEY y BREVO_SENDER_EMAIL son obligatorias: sin ellas nadie puede verificar su correo.';

  it('en producción faltan BREVO_API_KEY o BREVO_SENDER_EMAIL (o vacías): error con el texto; con ambas, arranca', () => {
    expect(() => parseEnv(NEON_PROD)).toThrow(MESSAGE);
    expect(() => parseEnv({ ...NEON_PROD, BREVO_SENDER_EMAIL: BREVO.BREVO_SENDER_EMAIL })).toThrow(MESSAGE);
    expect(() => parseEnv({ ...NEON_PROD, BREVO_API_KEY: BREVO.BREVO_API_KEY })).toThrow(MESSAGE);
    expect(() => parseEnv({ ...NEON_PROD, ...BREVO, BREVO_API_KEY: '' })).toThrow(MESSAGE);
    expect(parseEnv({ ...NEON_PROD, ...BREVO }).BREVO_API_KEY).toBe('xkeysib-clave');
  });

  it('en desarrollo no hacen falta; el remitente se llama HueckoApp por defecto y GOOGLE_WEB_CLIENT_ID vacío es undefined', () => {
    const env = parseEnv({ ...BASE, BREVO_API_KEY: '', GOOGLE_WEB_CLIENT_ID: '' });
    expect([env.BREVO_API_KEY, env.BREVO_SENDER_EMAIL, env.GOOGLE_WEB_CLIENT_ID]).toEqual([undefined, undefined, undefined]);
    expect(env.BREVO_SENDER_NAME).toBe('HueckoApp');
    expect(parseEnv({ ...BASE, BREVO_SENDER_NAME: 'Otro' }).BREVO_SENDER_NAME).toBe('Otro');
    expect(parseEnv({ ...NEON_PROD, ...BREVO }).GOOGLE_WEB_CLIENT_ID).toBeUndefined(); // en producción sigue siendo opcional
    expect(parseEnv({ ...BASE, GOOGLE_WEB_CLIENT_ID: ' abc.apps.googleusercontent.com ' }).GOOGLE_WEB_CLIENT_ID).toBe('abc.apps.googleusercontent.com');
  });

  it('BREVO_SENDER_NAME y CODE_RATE_LIMIT vacíos (Render) usan su valor por defecto', () => {
    const env = parseEnv({ ...BASE, BREVO_SENDER_NAME: '', CODE_RATE_LIMIT: '' });
    expect([env.BREVO_SENDER_NAME, env.CODE_RATE_LIMIT]).toEqual(['HueckoApp', 30]);
  });

  it('CODE_RATE_LIMIT: 30 por defecto; acepta otro entero positivo', () => {
    expect(parseEnv(BASE).CODE_RATE_LIMIT).toBe(30);
    expect(parseEnv({ ...BASE, CODE_RATE_LIMIT: '5' }).CODE_RATE_LIMIT).toBe(5);
    expect(() => parseEnv({ ...BASE, CODE_RATE_LIMIT: '0' })).toThrow();
  });
});
