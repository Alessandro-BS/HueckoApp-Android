import { AsyncLocalStorage } from 'node:async_hooks';

// Acceso a la base, igual con Postgres (Neon, adaptador `pg`) que con PGlite (desarrollo y tests). Todo el SQL del
// backend usa parámetros $1, $2… y pasa por aquí: los repositorios nunca ven el driver.

/** Valores que admiten los parámetros. Una lista de textos sirve para `= ANY($1::text[])`. */
export type SqlParam = string | number | boolean | null | readonly string[];
export type Row = Record<string, unknown>;
/** `rowCount`: filas escritas por INSERT/UPDATE/DELETE (en un SELECT no se usa). */
export type QueryResult<T> = { rows: T[]; rowCount: number };

/** Una conexión (o la transacción abierta en ella): lo mínimo que implementa cada adaptador. */
export interface Runner {
  query(sql: string, params: readonly SqlParam[]): Promise<QueryResult<Row>>;
  /** Varias sentencias sin parámetros (migraciones). */
  exec(sql: string): Promise<void>;
}

export interface Driver extends Runner {
  /** Para mensajes y logs; nunca lleva contraseñas. */
  readonly description: string;
  /** Ejecuta `fn` con una conexión exclusiva entre BEGIN y COMMIT (ROLLBACK y relanza si `fn` falla). */
  transaction<T>(fn: (tx: Runner) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

export interface Db {
  readonly description: string;
  /** true dentro de `transaction` (en este mismo contexto asíncrono). */
  readonly inTransaction: boolean;
  query<T extends object = Row>(sql: string, params?: readonly SqlParam[]): Promise<QueryResult<T>>;
  many<T extends object = Row>(sql: string, params?: readonly SqlParam[]): Promise<T[]>;
  /** La primera fila, o undefined si no hay ninguna. */
  one<T extends object = Row>(sql: string, params?: readonly SqlParam[]): Promise<T | undefined>;
  exec(sql: string): Promise<void>;
  /**
   * Todo o nada: COMMIT si `fn` termina, ROLLBACK y relanza si lanza. Toda consulta hecha con este `Db` mientras
   * `fn` corre (también desde otros repositorios) va por la conexión de la transacción. Reentrante: si ya hay una
   * abierta, `fn` corre dentro de ella y la de fuera decide. Si `fn` captura un error de la base y termina bien, lanza
   * igual (Postgres ya la deshizo). Después de terminar, la conexión de la transacción ya no admite consultas.
   */
  transaction<T>(fn: () => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

/**
 * La conexión de una transacción, válida solo hasta que termina. Una consulta que la siga usando después (una promesa
 * lanzada dentro sin `await` hereda el contexto asíncrono) falla en vez de ir, con pg, a una conexión ya devuelta al
 * Pool, quizá metida en la transacción de otra petición.
 */
function untilEnd(tx: Runner): { runner: Runner; end: () => void } {
  let active = true;
  const assertActive = () => {
    if (!active) throw new Error('Consulta fuera de tiempo: la transacción ya terminó (¿una promesa sin await dentro de db.transaction?).');
  };
  return {
    runner: {
      async query(sql, params) {
        assertActive();
        return tx.query(sql, params);
      },
      async exec(sql) {
        assertActive();
        return tx.exec(sql);
      },
    },
    end: () => {
      active = false;
    },
  };
}

class DriverDb implements Db {
  readonly #driver: Driver;
  // La conexión de la transacción en curso viaja con el contexto asíncrono: dos peticiones a la vez no se mezclan.
  readonly #tx = new AsyncLocalStorage<Runner>();

  constructor(driver: Driver) {
    this.#driver = driver;
  }

  get description(): string {
    return this.#driver.description;
  }

  get inTransaction(): boolean {
    return this.#tx.getStore() !== undefined;
  }

  #runner(): Runner {
    return this.#tx.getStore() ?? this.#driver;
  }

  async query<T extends object = Row>(sql: string, params: readonly SqlParam[] = []): Promise<QueryResult<T>> {
    return (await this.#runner().query(sql, params)) as QueryResult<T>;
  }

  // many y one pasan por this.query: contar llamadas a `query` cuenta todas las consultas (test de «sin N+1»).
  async many<T extends object = Row>(sql: string, params: readonly SqlParam[] = []): Promise<T[]> {
    return (await this.query<T>(sql, params)).rows;
  }

  async one<T extends object = Row>(sql: string, params: readonly SqlParam[] = []): Promise<T | undefined> {
    return (await this.query<T>(sql, params)).rows[0];
  }

  exec(sql: string): Promise<void> {
    return this.#runner().exec(sql);
  }

  transaction<T>(fn: () => Promise<T>): Promise<T> {
    if (this.inTransaction) return fn();
    return this.#driver.transaction(async (tx) => {
      const { runner, end } = untilEnd(tx);
      try {
        return await this.#tx.run(runner, fn);
      } finally {
        end();
      }
    });
  }

  close(): Promise<void> {
    return this.#driver.close();
  }
}

export const createDb = (driver: Driver): Db => new DriverDb(driver);
