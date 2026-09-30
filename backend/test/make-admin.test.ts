import { describe, expect, it } from 'vitest';

import { setRoleByEmail } from '../src/admin/admin-users';
import { MAKE_ADMIN_USAGE, parseMakeAdminArgs } from '../src/admin/make-admin-args';
import type { Db } from '../src/db/db';
import { insertUser } from './admin-fixtures';
import { makeTestDb, NOW } from './helpers';

describe('parseMakeAdminArgs', () => {
  it.each([
    [['Ana@Test.com '], { email: 'ana@test.com', revoke: false }],
    [['ana@test.com', '--revoke'], { email: 'ana@test.com', revoke: true }],
    [['--revoke', 'ana@test.com'], { email: 'ana@test.com', revoke: true }],
  ])('%j → %j', (argv, expected) => {
    expect(parseMakeAdminArgs(argv)).toEqual(expected);
  });

  it.each([[[]], [['a@b.co', 'c@d.co']], [['a@b.co', '--force']]])('%j → error con el uso', (argv) => {
    expect(() => parseMakeAdminArgs(argv)).toThrow(MAKE_ADMIN_USAGE);
  });

  it('un texto que no es un correo', () => {
    expect(() => parseMakeAdminArgs(['ana'])).toThrow('«ana» no parece un correo.');
  });
});

describe('setRoleByEmail (consola)', () => {
  const auditRows = (db: Db) => db.many<{ action: string; admin_id: string | null }>('SELECT action, admin_id FROM admin_audit_log ORDER BY rowid');

  it('nombra administrador, repetirlo no cambia nada y quitarlo funciona; queda anotado como consola', async () => {
    const db = await makeTestDb();
    await insertUser(db, { email: 'primera@test.com', role: 'ADMIN' });
    const ana = await insertUser(db, { name: 'Ana', email: 'ana@test.com' });
    expect(await setRoleByEmail(db, 'ana@test.com', 'ADMIN', NOW)).toMatchObject({ changed: true, user: { id: ana, role: 'ADMIN' } });
    expect((await setRoleByEmail(db, 'ana@test.com', 'ADMIN', NOW)).changed).toBe(false);
    expect(await setRoleByEmail(db, 'ana@test.com', 'USER', NOW)).toMatchObject({ changed: true, user: { role: 'USER' } });
    expect(await auditRows(db)).toEqual([
      { action: 'USER_PROMOTED', admin_id: null },
      { action: 'USER_DEMOTED', admin_id: null },
    ]);
  });

  it('no deja la app sin administradores activos (409 LAST_ADMIN); con otro admin activo, sí', async () => {
    const db = await makeTestDb();
    await insertUser(db, { email: 'unica@test.com', role: 'ADMIN' });
    await expect(setRoleByEmail(db, 'unica@test.com', 'USER', NOW)).rejects.toThrow('Tiene que quedar al menos un administrador activo.');
    // Una admin suspendida no cuenta como activa.
    await insertUser(db, { email: 'suspendida@test.com', role: 'ADMIN', status: 'SUSPENDED' });
    await expect(setRoleByEmail(db, 'unica@test.com', 'USER', NOW)).rejects.toThrow('Tiene que quedar al menos un administrador activo.');
    await insertUser(db, { email: 'otra@test.com', role: 'ADMIN' });
    expect((await setRoleByEmail(db, 'unica@test.com', 'USER', NOW)).changed).toBe(true); // control positivo
  });

  it('correo desconocido → error que lo nombra', async () => {
    const db = await makeTestDb();
    await expect(setRoleByEmail(db, 'nadie@test.com', 'ADMIN', NOW)).rejects.toThrow('No hay ninguna cuenta con el correo «nadie@test.com».');
  });
});
