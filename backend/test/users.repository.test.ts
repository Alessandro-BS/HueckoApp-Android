import { describe, expect, it } from 'vitest';

import { openDatabase } from '../src/db/database';
import { ApiError } from '../src/middleware/errors';
import { usersRepository } from '../src/users/users.repository';

describe('usersRepository.create', () => {
  it('un correo repetido lanza ApiError 409 EMAIL_TAKEN (carrera entre registros)', () => {
    const users = usersRepository(openDatabase(':memory:'));
    const input = { name: 'Ana', email: 'ana@correo.com', passwordHash: 'hash', createdAt: '2026-09-29T15:00:00.000Z' };
    users.create(input);
    let error: unknown;
    try {
      users.create(input);
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 409, code: 'EMAIL_TAKEN' });
  });
});
