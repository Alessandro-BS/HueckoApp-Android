// TEMPORAL (se borra en el Task 6 junto con el puente).
import { describe, expect, it } from 'vitest';

import { withTransaction } from '../src/db/transaction';
import { makeTestDb } from './helpers';

const addUser = (db: Awaited<ReturnType<typeof makeTestDb>>, id: string) =>
  db.query('INSERT INTO users (id, name, email, password_hash) VALUES ($1, $1, $2, $3)', [id, `${id}@correo.com`, 'x']);
const ids = async (db: Awaited<ReturnType<typeof makeTestDb>>) => (await db.many<{ id: string }>('SELECT id FROM users ORDER BY id')).map((r) => r.id);

describe('puente SQLite con la API async (D13)', () => {
  it('$1… repetidos, booleanos como 1/0, filas como objetos normales y rowCount', async () => {
    const db = await makeTestDb();
    expect((await addUser(db, 'a')).rowCount).toBe(1);
    expect(await db.one('SELECT $1 AS x, $2 AS y, $1 AS z', ['p', true])).toEqual({ x: 'p', y: 1, z: 'p' });
    expect((await db.query('DELETE FROM users WHERE id = $1', ['no-existe'])).rowCount).toBe(0);
  });

  it('transaction: COMMIT, ROLLBACK si lanza y reentrante (también con el withTransaction síncrono de dentro)', async () => {
    const db = await makeTestDb();
    await expect(
      db.transaction(async () => {
        await addUser(db, 'a');
        withTransaction(db, () => db.prepare("INSERT INTO users (id, name, email, password_hash) VALUES ('b', 'b', 'b@correo.com', 'x')").run());
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(await ids(db)).toEqual([]);
    await db.transaction(async () => {
      await addUser(db, 'a');
      await db.transaction(() => addUser(db, 'b'));
    });
    expect(await ids(db)).toEqual(['a', 'b']);
    expect(db.isTransaction).toBe(false);
  });
});
