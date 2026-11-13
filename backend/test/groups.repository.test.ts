import { describe, expect, it } from 'vitest';

import { generateInviteCode, normalizeInviteCode } from '../src/groups/invite-code';
import { groupsRepository } from '../src/groups/groups.repository';
import { usersRepository } from '../src/users/users.repository';
import { makeTestDb, recordQueries } from './helpers';

const input = { name: 'Grupo', description: '', availabilityThreshold: 80, createdAt: '2026-09-29T15:00:00.000Z' };

const setup = async (generateCode: () => string) => {
  const db = await makeTestDb();
  const owner = await usersRepository(db).create({ name: 'Ana', email: 'ana@correo.com', passwordHash: 'x', createdAt: '2026-09-29T15:00:00.000Z' });
  return { repo: groupsRepository(db, generateCode), owner };
};

describe('generateInviteCode', () => {
  it('toma 8 símbolos del alfabeto sin ambiguos (módulo 32)', () => {
    expect(generateInviteCode(() => Uint8Array.from([0, 1, 2, 3, 4, 5, 6, 7]))).toBe('ABCDEFGH');
    expect(generateInviteCode(() => Uint8Array.from([31, 32, 63, 255, 8, 13, 23, 24]))).toBe('9A99JPZ2');
  });

  it('con bytes aleatorios reales nunca produce 0, O, 1 ni I', () => {
    for (let i = 0; i < 200; i++) expect(generateInviteCode()).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
  });

  it('normaliza con trim y mayúsculas (G10)', () => {
    expect(normalizeInviteCode('  proy2026 ')).toBe('PROY2026');
  });
});

describe('groupsRepository.create — código único', () => {
  it('reintenta si el código generado ya existe', async () => {
    const codes = ['AAAAAAAA', 'AAAAAAAA', 'BBBBBBBB'];
    const { repo, owner } = await setup(() => codes.shift()!);
    expect((await repo.create(owner.id, input)).inviteCode).toBe('AAAAAAAA');
    expect((await repo.create(owner.id, input)).inviteCode).toBe('BBBBBBBB');
  });

  it('se rinde tras 5 colisiones seguidas', async () => {
    const { repo, owner } = await setup(() => 'AAAAAAAA');
    await repo.create(owner.id, input);
    await expect(repo.create(owner.id, input)).rejects.toThrow('No se pudo generar un código de invitación único');
  });
});

describe('groupsRepository.leave', () => {
  it('lo primero, dentro de su transacción, es bloquear el grupo (FOR UPDATE): dos salidas a la vez no lo dejan vacío', async () => {
    // PGlite tiene una sola conexión y no puede reproducir la carrera: este test impide que un cambio quite el bloqueo.
    const db = await makeTestDb();
    const users = usersRepository(db);
    const ana = await users.create({ name: 'Ana', email: 'ana@correo.com', passwordHash: 'x', createdAt: input.createdAt });
    const luis = await users.create({ name: 'Luis', email: 'luis@correo.com', passwordHash: 'x', createdAt: input.createdAt });
    const repo = groupsRepository(db);
    const group = await repo.create(ana.id, input);
    await repo.addMember(group.id, luis.id);
    const calls = recordQueries(db);
    await repo.leave(group.id, ana.id);
    expect(calls[0]).toEqual({ sql: 'SELECT id FROM groups WHERE id = $1 FOR UPDATE', params: [group.id], inTransaction: true });
    expect((await repo.findById(group.id))!.members.map((m) => [m.name, m.role])).toEqual([['Luis', 'ORGANIZER']]); // control
  });
});

describe('groupsRepository.updateMember', () => {
  const setupTwo = async () => {
    const db = await makeTestDb();
    const users = usersRepository(db);
    const ana = await users.create({ name: 'Ana', email: 'ana@correo.com', passwordHash: 'x', createdAt: input.createdAt });
    const luis = await users.create({ name: 'Luis', email: 'luis@correo.com', passwordHash: 'x', createdAt: input.createdAt });
    const repo = groupsRepository(db);
    const group = await repo.create(ana.id, input);
    await repo.addMember(group.id, luis.id);
    const roles = async () => (await repo.findById(group.id))!.members.map((m) => [m.name, m.role, m.isEssential]);
    return { db, repo, group, ana, luis, roles };
  };

  it('lo primero, dentro de su transacción, es bloquear el grupo (FOR UPDATE), igual que leave; después cuenta y escribe', async () => {
    // PGlite tiene una sola conexión y no puede reproducir la carrera: este test impide que un cambio quite el bloqueo
    // o cuente los organizadores antes de él.
    const { db, repo, group, ana, luis, roles } = await setupTwo();
    await repo.updateMember(group.id, luis.id, { role: 'ORGANIZER' });
    const calls = recordQueries(db);
    expect(await repo.updateMember(group.id, ana.id, { role: 'MEMBER' })).toBe('OK');
    expect(calls[0]).toEqual({ sql: 'SELECT id FROM groups WHERE id = $1 FOR UPDATE', params: [group.id], inTransaction: true });
    expect(calls.length).toBeGreaterThan(2);
    expect(calls.every((c) => c.inTransaction)).toBe(true);
    expect(await roles()).toEqual([['Ana', 'MEMBER', false], ['Luis', 'ORGANIZER', false]]); // control
  });

  it('quitar el rol al último organizador: LAST_ORGANIZER sin escribir nada', async () => {
    const { repo, group, ana, roles } = await setupTwo();
    expect(await repo.updateMember(group.id, ana.id, { role: 'MEMBER', isEssential: true })).toBe('LAST_ORGANIZER');
    expect(await roles()).toEqual([['Ana', 'ORGANIZER', false], ['Luis', 'MEMBER', false]]);
  });

  it('dejar como MEMBER a quien ya lo es no cuenta como quitar el último organizador', async () => {
    const { repo, group, luis, roles } = await setupTwo();
    expect(await repo.updateMember(group.id, luis.id, { role: 'MEMBER', isEssential: true })).toBe('OK');
    expect(await roles()).toEqual([['Ana', 'ORGANIZER', false], ['Luis', 'MEMBER', true]]);
  });

  it('solo isEssential no toca el rol; los dos campos se aplican juntos', async () => {
    const { repo, group, ana, luis, roles } = await setupTwo();
    expect(await repo.updateMember(group.id, ana.id, { isEssential: true })).toBe('OK');
    expect(await repo.updateMember(group.id, luis.id, { isEssential: true, role: 'ORGANIZER' })).toBe('OK');
    expect(await roles()).toEqual([['Ana', 'ORGANIZER', true], ['Luis', 'ORGANIZER', true]]);
  });
});
