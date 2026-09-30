import pg from 'pg';

import type { Driver, Row, Runner } from './db';
import { abortedTransactionError } from './errors';

const INT8 = 20;
const NUMERIC = 1700;

// pg devuelve int8 (COUNT, SUM) y numeric (AVG) como texto; aquí, como número, igual que PGlite (D3).
const getTypeParser = ((oid: number, format?: 'text' | 'binary') =>
  oid === INT8 || oid === NUMERIC ? (value: string) => Number(value) : pg.types.getTypeParser(oid, format as 'text')) as typeof pg.types.getTypeParser;

/** «Postgres (host)»: sin usuario ni contraseña, para mensajes y logs. */
export function describePostgresUrl(url: string): string {
  return `Postgres (${new URL(url).host})`;
}

function runner(target: pg.Pool | pg.PoolClient): Runner {
  return {
    async query(sql, params) {
      const result = await target.query<Row>(sql, [...params]);
      return { rows: result.rows, rowCount: result.rowCount ?? 0 };
    },
    async exec(sql) {
      await target.query(sql);
    },
  };
}

/** Adaptador de Postgres (Neon en producción) con un Pool de conexiones. */
export function pgDriver(connectionString: string, options: { max?: number } = {}): Driver {
  const pool = new pg.Pool({
    connectionString,
    max: options.max ?? 10,
    // Neon suspende la base sin tráfico: la primera conexión tras un rato puede tardar en despertarla.
    connectionTimeoutMillis: 15_000,
    idleTimeoutMillis: 30_000,
    types: { getTypeParser },
  });
  // Neon cierra conexiones inactivas: sin este manejador, ese error del Pool tumbaría el proceso.
  pool.on('error', (error) => console.error('[db] se cerró una conexión inactiva de Postgres:', error.message));
  return {
    description: describePostgresUrl(connectionString),
    ...runner(pool),
    async transaction<T>(fn: (tx: Runner) => Promise<T>): Promise<T> {
      const client = await pool.connect();
      // Mientras la conexión está fuera del Pool, el Pool no escucha sus errores: si se cae (Neon la corta, la red),
      // ese evento sin nadie que lo escuche tumbaría el proceso. La consulta en curso o la siguiente fallan igual.
      const onError = (error: Error) => console.error('[db] se cortó la conexión de una transacción:', error.message);
      client.on('error', onError);
      const release = (error?: Error) => {
        client.removeListener('error', onError);
        client.release(error);
      };
      let result: T;
      let committed: boolean;
      try {
        await client.query('BEGIN');
        result = await fn(runner(client));
        // Transacción abortada (un error capturado dentro): el COMMIT responde «ROLLBACK» sin lanzar.
        committed = (await client.query('COMMIT')).command === 'COMMIT';
      } catch (error) {
        // Si ni el ROLLBACK funciona, la conexión se descarta en vez de volver al Pool.
        await client.query('ROLLBACK').then(
          () => release(),
          (rollbackError: Error) => release(rollbackError),
        );
        throw error;
      }
      release();
      if (!committed) throw abortedTransactionError();
      return result;
    },
    close: () => pool.end(),
  };
}
