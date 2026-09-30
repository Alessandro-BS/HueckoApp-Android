import { PGlite, type Transaction } from '@electric-sql/pglite';

import type { Driver, Row, Runner } from './db';

// COUNT/SUM (int8, OID 20) y AVG (numeric, OID 1700) llegan como número, igual que con el adaptador pg (D3).
const toNumber = (value: string) => Number(value);
const PARSERS = { 20: toNumber, 1700: toNumber };

export type PgliteOptions = {
  /** Carpeta donde PGlite guarda la base. Sin ella, en memoria. */
  dataDir?: string;
  /** Copia de una base (dumpDataDir) con la que arrancar: los tests cargan así una plantilla ya migrada. */
  loadDataDir?: Blob | File;
};

/** PGlite: Postgres 18 compilado a WebAssembly, dentro de este mismo proceso (sin instalar nada). */
export function openPglite(options: PgliteOptions = {}): Promise<PGlite> {
  return PGlite.create({ ...options, parsers: PARSERS });
}

function runner(target: PGlite | Transaction): Runner {
  return {
    async query(sql, params) {
      const result = await target.query<Row>(sql, [...params]);
      return { rows: result.rows, rowCount: result.affectedRows ?? 0 };
    },
    async exec(sql) {
      await target.exec(sql);
    },
  };
}

/**
 * Adaptador de PGlite. `PGlite.transaction` toma su única conexión en exclusiva: mientras dura, las consultas de
 * fuera esperan su turno y no se cuelan dentro (comprobado). `onClose` suelta el candado de la carpeta (pglite-lock.ts).
 */
export function pgliteDriver(lite: PGlite, description: string, onClose?: () => void): Driver {
  return {
    description,
    ...runner(lite),
    transaction: (fn) => lite.transaction((tx) => fn(runner(tx))),
    async close() {
      try {
        await lite.close();
      } finally {
        onClose?.();
      }
    },
  };
}
