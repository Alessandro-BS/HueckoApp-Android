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
  // 1 — Fase 2: bloques de horario. Recurrente = día de la semana; puntual = fecha concreta.
  `CREATE TABLE time_blocks (
     id           TEXT PRIMARY KEY,
     user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     label        TEXT NOT NULL,
     type         TEXT NOT NULL CHECK (type IN ('CLASE', 'TRABAJO', 'LIBRE', 'PUNTUAL')),
     start_time   TEXT NOT NULL,
     end_time     TEXT NOT NULL,
     is_recurring INTEGER NOT NULL CHECK (is_recurring IN (0, 1)),
     day_of_week  INTEGER CHECK (day_of_week BETWEEN 1 AND 7),
     date         TEXT,
     created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
     CHECK (start_time < end_time),
     CHECK ((is_recurring = 1 AND day_of_week IS NOT NULL AND date IS NULL)
         OR (is_recurring = 0 AND day_of_week IS NULL AND date IS NOT NULL))
   );
   CREATE INDEX time_blocks_user_idx ON time_blocks (user_id);`,
  // 2 — Fase 2: grupos y sus miembros. GROUPS es palabra clave "fallback" de SQLite: vale como nombre de tabla.
  `CREATE TABLE groups (
     id                     TEXT PRIMARY KEY,
     name                   TEXT NOT NULL,
     description            TEXT NOT NULL DEFAULT '',
     invite_code            TEXT NOT NULL UNIQUE,
     availability_threshold INTEGER NOT NULL DEFAULT 80 CHECK (availability_threshold BETWEEN 0 AND 100),
     created_at             TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
   );
   CREATE TABLE group_members (
     group_id     TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
     user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     role         TEXT NOT NULL CHECK (role IN ('OWNER', 'MEMBER')),
     is_essential INTEGER NOT NULL DEFAULT 0 CHECK (is_essential IN (0, 1)),
     joined_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
     PRIMARY KEY (group_id, user_id)
   );
   CREATE INDEX group_members_user_idx ON group_members (user_id);`,
];
