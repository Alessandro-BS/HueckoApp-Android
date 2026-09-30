import { describe, expect, it } from 'vitest';

import { setRoleByEmail } from '../src/admin/admin-users';
import { MAKE_ADMIN_USAGE, parseMakeAdminArgs } from '../src/admin/make-admin-args';
import { openDatabase } from '../src/db/database';
import { insertUser } from './admin-fixtures';
import { NOW } from './helpers';

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
  const auditRows = (db: ReturnType<typeof openDatabase>) =>
    (db.prepare('SELECT action, admin_id FROM admin_audit_log ORDER BY rowid').all() as { action: string; admin_id: string | null }[]).map((r) => ({ ...r }));

  it('nombra administrador, repetirlo no cambia nada y quitarlo funciona; queda anotado como consola', () => {
    const db = openDatabase(':memory:');
    insertUser(db, { email: 'primera@test.com', role: 'ADMIN' });
    const ana = insertUser(db, { name: 'Ana', email: 'ana@test.com' });
    expect(setRoleByEmail(db, 'ana@test.com', 'ADMIN', NOW)).toMatchObject({ changed: true, user: { id: ana, role: 'ADMIN' } });
    expect(setRoleByEmail(db, 'ana@test.com', 'ADMIN', NOW).changed).toBe(false);
    expect(setRoleByEmail(db, 'ana@test.com', 'USER', NOW)).toMatchObject({ changed: true, user: { role: 'USER' } });
    expect(auditRows(db)).toEqual([
      { action: 'USER_PROMOTED', admin_id: null },
      { action: 'USER_DEMOTED', admin_id: null },
    ]);
  });

  it('no deja la app sin administradores activos (409 LAST_ADMIN); con otro admin activo, sí', () => {
    const db = openDatabase(':memory:');
    insertUser(db, { email: 'unica@test.com', role: 'ADMIN' });
    expect(() => setRoleByEmail(db, 'unica@test.com', 'USER', NOW)).toThrow('Tiene que quedar al menos un administrador activo.');
    // Una admin suspendida no cuenta como activa.
    insertUser(db, { email: 'suspendida@test.com', role: 'ADMIN', status: 'SUSPENDED' });
    expect(() => setRoleByEmail(db, 'unica@test.com', 'USER', NOW)).toThrow('Tiene que quedar al menos un administrador activo.');
    insertUser(db, { email: 'otra@test.com', role: 'ADMIN' });
    expect(setRoleByEmail(db, 'unica@test.com', 'USER', NOW).changed).toBe(true); // control positivo
  });

  it('correo desconocido → error que lo nombra', () => {
    const db = openDatabase(':memory:');
    expect(() => setRoleByEmail(db, 'nadie@test.com', 'ADMIN', NOW)).toThrow('No hay ninguna cuenta con el correo «nadie@test.com».');
  });
});
