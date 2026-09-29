import { describe, expect, it } from 'vitest';

import { openDatabase } from '../src/db/database';
import { withTransaction } from '../src/db/transaction';

const count = (db: ReturnType<typeof openDatabase>) =>
  (db.prepare('SELECT COUNT(*) AS n FROM users').get() as { n: number }).n;
const addUser = (db: ReturnType<typeof openDatabase>, id: string) =>
  db.prepare('INSERT INTO users (id, name, email, password_hash) VALUES (?, ?, ?, ?)').run(id, id, `${id}@correo.com`, 'x');

describe('withTransaction', () => {
  it('confirma los cambios y devuelve el resultado de la función', () => {
    const db = openDatabase(':memory:');
    const result = withTransaction(db, () => {
      addUser(db, 'a');
      addUser(db, 'b');
      return 'listo';
    });
    expect(result).toBe('listo');
    expect(count(db)).toBe(2);
  });

  it('deshace todo y relanza el error si la función falla', () => {
    const db = openDatabase(':memory:');
    expect(() =>
      withTransaction(db, () => {
        addUser(db, 'a');
        throw new Error('boom');
      }),
    ).toThrow('boom');
    expect(count(db)).toBe(0);
  });

  it('anidada: si la interna falla dentro de otra, la externa deshace todo', () => {
    const db = openDatabase(':memory:');
    expect(() =>
      withTransaction(db, () => {
        addUser(db, 'a');
        withTransaction(db, () => {
          addUser(db, 'b');
          throw new Error('boom');
        });
      }),
    ).toThrow('boom');
    expect(db.isTransaction).toBe(false);
    expect(count(db)).toBe(0);
  });

  it('anidada: si todo va bien, confirma las filas de ambas', () => {
    const db = openDatabase(':memory:');
    const result = withTransaction(db, () => {
      addUser(db, 'a');
      return withTransaction(db, () => {
        addUser(db, 'b');
        return 'listo';
      });
    });
    expect(result).toBe('listo');
    expect(db.isTransaction).toBe(false);
    expect(count(db)).toBe(2);
  });
});
