import { describe, expect, it } from 'vitest';

import { ApiError } from '../src/middleware/errors';
import { usersRepository } from '../src/users/users.repository';
import { makeTestDb } from './helpers';

describe('usersRepository.create', () => {
  it('un correo repetido lanza ApiError 409 EMAIL_TAKEN (carrera entre registros)', async () => {
    const users = usersRepository(await makeTestDb());
    const input = { name: 'Ana', email: 'ana@correo.com', passwordHash: 'hash', createdAt: '2026-09-29T15:00:00.000Z' };
    await users.create(input);
    const error = await users.create(input).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 409, code: 'EMAIL_TAKEN' });
  });
});
