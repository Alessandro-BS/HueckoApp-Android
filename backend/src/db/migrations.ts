// Migraciones en orden. Nunca se edita una ya publicada: se agrega una nueva al final.
// PRAGMA user_version guarda cuántas se aplicaron.
export const migrations: string[] = [
  `CREATE TABLE users (
     id            TEXT PRIMARY KEY,
     name          TEXT NOT NULL,
     email         TEXT NOT NULL UNIQUE,
     password_hash TEXT NOT NULL,
     created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
   );`,
];
