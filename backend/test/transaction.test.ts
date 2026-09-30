import { describe, expect, it } from 'vitest';

import type { Db } from '../src/db/db';
import { usersRepository } from '../src/users/users.repository';
import { makeTestDb } from './helpers';

const count = async (db: Db) => (await db.one<{ n: number }>('SELECT COUNT(*) AS n FROM users'))!.n;
const addUser = (db: Db, id: string) =>
  db.query('INSERT INTO users (id, name, email, password_hash) VALUES ($1, $1, $2, $3)', [id, `${id}@correo.com`, 'x']);

// Las mismas garantías que tenía withTransaction, ahora con db.transaction sobre el esquema real (D2).
describe('db.transaction', () => {
  it('confirma los cambios y devuelve el resultado de la función', async () => {
    const db = await makeTestDb();
    const result = await db.transaction(async () => {
      await addUser(db, 'a');
      await addUser(db, 'b');
      return 'listo';
    });
    expect(result).toBe('listo');
    expect(await count(db)).toBe(2);
  });

  it('deshace todo y relanza el error si la función falla', async () => {
    const db = await makeTestDb();
    await expect(
      db.transaction(async () => {
        await addUser(db, 'a');
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(await count(db)).toBe(0);
  });

  it('anidada: si la interna falla dentro de otra, la externa deshace todo', async () => {
    const db = await makeTestDb();
    await expect(
      db.transaction(async () => {
        await addUser(db, 'a');
        await db.transaction(async () => {
          await addUser(db, 'b');
          throw new Error('boom');
        });
      }),
    ).rejects.toThrow('boom');
    expect(db.inTransaction).toBe(false);
    expect(await count(db)).toBe(0);
  });

  it('anidada: si todo va bien, confirma las filas de ambas', async () => {
    const db = await makeTestDb();
    const result = await db.transaction(async () => {
      await addUser(db, 'a');
      return db.transaction(async () => {
        await addUser(db, 'b');
        return 'listo';
      });
    });
    expect(result).toBe('listo');
    expect(db.inTransaction).toBe(false);
    expect(await count(db)).toBe(2);
  });

  it('las consultas de otros repositorios dentro de la transacción van por su conexión y se deshacen con ella', async () => {
    const db = await makeTestDb();
    const users = usersRepository(db);
    await expect(
      db.transaction(async () => {
        await users.create({ name: 'Ana', email: 'ana@correo.com', passwordHash: 'x', createdAt: '2026-09-29T15:00:00.000Z' });
        expect(await users.findByEmail('ana@correo.com')).toBeDefined(); // dentro se ve
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(await users.findByEmail('ana@correo.com')).toBeUndefined();
  });
});
