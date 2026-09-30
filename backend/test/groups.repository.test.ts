import { describe, expect, it } from 'vitest';

import { generateInviteCode, normalizeInviteCode } from '../src/groups/invite-code';
import { groupsRepository } from '../src/groups/groups.repository';
import { usersRepository } from '../src/users/users.repository';
import { makeTestDb } from './helpers';

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
