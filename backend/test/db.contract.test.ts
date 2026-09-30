import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { createDb, type Db } from '../src/db/db';
import { pgDriver } from '../src/db/pg-driver';
import { openPglite, pgliteDriver } from '../src/db/pglite-driver';

// El mismo contrato con los dos adaptadores: PGlite (desarrollo y tests) y pg (producción, Neon). pg se prueba contra
// un PGlite servido por un socket en 127.0.0.1 con un puerto libre: sin red externa ni Postgres instalado. Con una sola
// conexión en el Pool (max: 1), porque ese servidor atiende una conexión a la vez.
let server: PGLiteSocketServer;
let pgUrl = '';

beforeAll(async () => {
  server = new PGLiteSocketServer({ db: await openPglite(), port: 0, host: '127.0.0.1' });
  await server.start();
  pgUrl = `postgresql://postgres@${server.getServerConn()}/postgres?sslmode=disable`;
});

afterAll(async () => {
  await server.stop();
  await server.db.close();
});

const adapters: [string, () => Promise<Db>][] = [
  ['PGlite', async () => createDb(pgliteDriver(await openPglite(), 'PGlite (memoria)'))],
  ['pg', async () => createDb(pgDriver(pgUrl, { max: 1 }))],
];

describe.each(adapters)('Db con el adaptador %s', (_name, open) => {
  let db: Db;
  const ids = async () => (await db.many<{ id: string }>('SELECT id FROM t ORDER BY id')).map((r) => r.id);

  beforeAll(async () => {
    db = await open();
  });
  afterAll(() => db.close());
  beforeEach(() => db.exec('DROP TABLE IF EXISTS t; CREATE TABLE t (id TEXT COLLATE "C" PRIMARY KEY, n INTEGER, ok BOOLEAN NOT NULL DEFAULT FALSE)'));

  it('query, one y many con parámetros $1…; rowCount cuenta las filas escritas', async () => {
    const inserted = await db.query('INSERT INTO t (id, n, ok) VALUES ($1, $2, $3), ($4, $5, $6)', ['a', 1, true, 'b', 2, false]);
    expect(inserted.rowCount).toBe(2);
    expect(await db.one('SELECT id, n, ok FROM t WHERE id = $1', ['a'])).toEqual({ id: 'a', n: 1, ok: true });
    expect(await db.one('SELECT id FROM t WHERE id = $1', ['no-existe'])).toBeUndefined();
    expect(await db.many('SELECT id FROM t WHERE n > $1 ORDER BY id', [0])).toEqual([{ id: 'a' }, { id: 'b' }]);
    expect((await db.query('UPDATE t SET n = n + 1 WHERE id = $1', ['no-existe'])).rowCount).toBe(0);
  });

  it('COUNT y SUM (int8) y AVG (numeric) llegan como número; BOOLEAN como true/false (D3)', async () => {
    await db.query('INSERT INTO t (id, n, ok) VALUES ($1, 1, TRUE), ($2, 2, FALSE)', ['a', 'b']);
    expect(await db.one('SELECT COUNT(*) AS c, SUM(n) AS s, AVG(n) AS a, COUNT(*) FILTER (WHERE ok) AS k FROM t')).toEqual({
      c: 2,
      s: 3,
      a: 1.5,
      k: 1,
    });
  });

  it('= ANY($1::text[]) con una lista de JS, también vacía', async () => {
    await db.query("INSERT INTO t (id) VALUES ('a'), ('b'), ('c')");
    expect(await db.many('SELECT id FROM t WHERE id = ANY($1::text[]) ORDER BY id', [['c', 'a', 'z']])).toEqual([{ id: 'a' }, { id: 'c' }]);
    expect(await db.many('SELECT id FROM t WHERE id = ANY($1::text[])', [[]])).toEqual([]);
  });

  it('transaction confirma y devuelve el resultado; inTransaction solo vale dentro', async () => {
    expect(db.inTransaction).toBe(false);
    const result = await db.transaction(async () => {
      expect(db.inTransaction).toBe(true);
      await db.query("INSERT INTO t (id) VALUES ('a')");
      await db.query("INSERT INTO t (id) VALUES ('b')");
      return 'listo';
    });
    expect(result).toBe('listo');
    expect(db.inTransaction).toBe(false);
    expect(await ids()).toEqual(['a', 'b']);
  });

  it('si la función lanza, deshace todo y relanza; una anidada reutiliza la de fuera y su error la deshace entera', async () => {
    await expect(
      db.transaction(async () => {
        await db.query("INSERT INTO t (id) VALUES ('a')");
        await db.transaction(async () => {
          await db.query("INSERT INTO t (id) VALUES ('b')");
          throw new Error('boom');
        });
      }),
    ).rejects.toThrow('boom');
    expect(await ids()).toEqual([]);
    // Control positivo: anidada sin errores confirma las filas de las dos.
    await db.transaction(async () => {
      await db.query("INSERT INTO t (id) VALUES ('a')");
      await db.transaction(() => db.query("INSERT INTO t (id) VALUES ('b')"));
    });
    expect(await ids()).toEqual(['a', 'b']);
  });

  it('un error de Postgres dentro deshace la transacción; el error trae code y constraint (D12)', async () => {
    await db.query("INSERT INTO t (id) VALUES ('a')");
    await expect(
      db.transaction(async () => {
        await db.query("INSERT INTO t (id) VALUES ('b')");
        await db.query("INSERT INTO t (id) VALUES ('a')");
      }),
    ).rejects.toMatchObject({ code: '23505', constraint: 't_pkey' });
    expect(await ids()).toEqual(['a']);
    await db.query("INSERT INTO t (id) VALUES ('b')"); // la conexión sigue sirviendo
    expect(await ids()).toEqual(['a', 'b']);
  });

  it('aislamiento: una consulta de fuera no entra en la transacción abierta (espera a que termine)', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const tx = db.transaction(async () => {
      await db.query("INSERT INTO t (id) VALUES ('dentro')");
      await gate;
      throw new Error('se deshace');
    });
    const outside = db.query("INSERT INTO t (id) VALUES ('fuera')");
    setTimeout(release, 50);
    await expect(tx).rejects.toThrow('se deshace');
    await outside;
    expect(await ids()).toEqual(['fuera']);
  });

  it('si un error de Postgres se captura dentro y la función termina bien, no se da por confirmada: lanza y no guarda nada', async () => {
    await db.query("INSERT INTO t (id) VALUES ('a')");
    // Tras un error, Postgres deja la transacción abortada y su COMMIT es en realidad un ROLLBACK (sin error).
    await expect(
      db.transaction(async () => {
        await db.query("INSERT INTO t (id) VALUES ('b')");
        await db.query("INSERT INTO t (id) VALUES ('a')").catch(() => undefined);
        return 'listo';
      }),
    ).rejects.toThrow('Postgres deshizo la transacción');
    expect(await ids()).toEqual(['a']);
    await db.query("INSERT INTO t (id) VALUES ('b')"); // la conexión sigue sirviendo
    expect(await ids()).toEqual(['a', 'b']);
  });

  it('la conexión de una transacción terminada no se puede usar (una consulta que se quedó para después falla)', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    let late!: Promise<unknown>;
    await db.transaction(async () => {
      await db.query("INSERT INTO t (id) VALUES ('dentro')");
      late = gate.then(() => db.query("INSERT INTO t (id) VALUES ('tarde')")); // hereda el contexto de la transacción
    });
    release();
    await expect(late).rejects.toThrow('la transacción ya terminó');
    expect(await ids()).toEqual(['dentro']);
  });

  it('exec ejecuta varias sentencias seguidas', async () => {
    await db.exec("INSERT INTO t (id) VALUES ('a'); INSERT INTO t (id) VALUES ('b');");
    expect(await ids()).toEqual(['a', 'b']);
  });
});

describe('adaptador pg: la conexión se cae en mitad de una transacción', () => {
  it('el proceso no se cae (hay quien escucha el error de la conexión): la transacción falla', async () => {
    const lonely = new PGLiteSocketServer({ db: await openPglite(), port: 0, host: '127.0.0.1' });
    await lonely.start();
    const db = createDb(pgDriver(`postgresql://postgres@${lonely.getServerConn()}/postgres?sslmode=disable`, { max: 1 }));
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      let release!: () => void;
      const gate = new Promise<void>((resolve) => (release = resolve));
      let started!: () => void;
      const inside = new Promise<void>((resolve) => (started = resolve));
      const tx = db.transaction(async () => {
        await db.query('SELECT 1');
        started();
        await gate;
        await db.query('SELECT 1');
      });
      await inside;
      await lonely.stop(); // corta la conexión mientras la transacción la tiene en uso (sin consulta en curso)
      await new Promise((resolve) => setTimeout(resolve, 100));
      release();
      await expect(tx).rejects.toThrow();
      expect(errors).toHaveBeenCalledWith(expect.stringContaining('[db]'), expect.anything());
    } finally {
      errors.mockRestore();
      await db.close();
      await lonely.db.close();
    }
  });
});
