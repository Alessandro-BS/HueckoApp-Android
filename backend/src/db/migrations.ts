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
  // 3 — Fase 3: propuestas de plan, sus franjas, votos (uno por persona y propuesta) e incidencias.
  // chosen_window_id no lleva FK para no crear un ciclo proposals ↔ proposal_windows: lo garantiza el código.
  `CREATE TABLE proposals (
     id               TEXT PRIMARY KEY,
     group_id         TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
     title            TEXT NOT NULL,
     location_name    TEXT,
     latitude         REAL CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90),
     longitude        REAL CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180),
     created_by       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     voting_deadline  TEXT NOT NULL,
     state            TEXT NOT NULL DEFAULT 'PROPUESTO'
                      CHECK (state IN ('PROPUESTO', 'CONFIRMADO', 'CANCELADO', 'EN_RECOORDINACION')),
     chosen_window_id TEXT,
     scheduled_at     TEXT,
     scheduled_date   TEXT,
     created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
     CHECK ((latitude IS NULL) = (longitude IS NULL)),
     CHECK (location_name IS NOT NULL OR latitude IS NULL)
   );
   CREATE INDEX proposals_group_idx ON proposals (group_id, created_at);
   CREATE TABLE proposal_windows (
     id                      TEXT PRIMARY KEY,
     proposal_id             TEXT NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
     day_of_week             INTEGER NOT NULL CHECK (day_of_week BETWEEN 1 AND 7),
     start_time              TEXT NOT NULL,
     end_time                TEXT NOT NULL,
     availability_percentage INTEGER NOT NULL CHECK (availability_percentage BETWEEN 0 AND 100),
     CHECK (start_time < end_time),
     UNIQUE (proposal_id, day_of_week, start_time, end_time),
     UNIQUE (id, proposal_id)
   );
   CREATE TABLE votes (
     proposal_id TEXT NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
     user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     window_id   TEXT NOT NULL,
     created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
     PRIMARY KEY (proposal_id, user_id),
     FOREIGN KEY (window_id, proposal_id) REFERENCES proposal_windows (id, proposal_id) ON DELETE CASCADE
   );
   CREATE INDEX votes_window_idx ON votes (window_id);
   CREATE TABLE incidences (
     id            TEXT PRIMARY KEY,
     proposal_id   TEXT NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
     user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     type          TEXT NOT NULL CHECK (type IN ('FALTA', 'TARDANZA', 'IMPREVISTO')),
     reason        TEXT NOT NULL,
     delay_minutes INTEGER,
     criticality   TEXT NOT NULL CHECK (criticality IN ('BAJA', 'MEDIA', 'ALTA')),
     resolved      INTEGER NOT NULL DEFAULT 0 CHECK (resolved IN (0, 1)),
     created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
     CHECK ((type = 'TARDANZA' AND COALESCE(delay_minutes, 0) > 0) OR (type <> 'TARDANZA' AND delay_minutes IS NULL))
   );
   CREATE INDEX incidences_proposal_idx ON incidences (proposal_id);`,

  // 4 — Fase 4.5: administración. Rol y estado de cada cuenta (se leen de aquí en cada petición, nunca del JWT),
  // registro de acciones de administración y de llamadas a la IA (sin prompt ni respuesta), e índices por fecha para
  // las estadísticas (filtran por rango de created_at / scheduled_at). admin_id NULL = consola (npm run make-admin).
  // admin_audit_log.admin_id no tiene ON DELETE a propósito: la app no borra cuentas, y con SET NULL la entrada de un
  // admin borrado se leería como «Consola del servidor». Si algún día se borran cuentas, guardar antes su nombre en
  // `details` (una migración nueva; esta ya está aplicada y no se edita).
  `ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'USER' CHECK (role IN ('USER', 'ADMIN'));
   ALTER TABLE users ADD COLUMN status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'SUSPENDED'));
   CREATE INDEX users_created_idx ON users (created_at);
   CREATE INDEX groups_created_idx ON groups (created_at);
   CREATE INDEX proposals_created_idx ON proposals (created_at);
   CREATE INDEX proposals_scheduled_idx ON proposals (scheduled_at);
   CREATE INDEX incidences_created_idx ON incidences (created_at);
   CREATE TABLE admin_audit_log (
     id          TEXT PRIMARY KEY,
     admin_id    TEXT REFERENCES users(id),
     action      TEXT NOT NULL CHECK (action IN ('USER_SUSPENDED', 'USER_REACTIVATED', 'USER_PROMOTED', 'USER_DEMOTED',
                                                 'GROUP_DELETED', 'PROPOSAL_CANCELLED')),
     target_type TEXT NOT NULL CHECK (target_type IN ('USER', 'GROUP', 'PROPOSAL')),
     target_id   TEXT NOT NULL,
     details     TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(details)),
     created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
   );
   CREATE INDEX admin_audit_log_created_idx ON admin_audit_log (created_at);
   CREATE TABLE ai_calls (
     id          INTEGER PRIMARY KEY,
     user_id     TEXT REFERENCES users(id) ON DELETE SET NULL,
     task        TEXT NOT NULL CHECK (task IN ('schedule-ocr', 'proposal-draft', 'plan-suggestions', 'voting-summary')),
     ok          INTEGER NOT NULL CHECK (ok IN (0, 1)),
     duration_ms INTEGER NOT NULL CHECK (duration_ms >= 0),
     created_at  TEXT NOT NULL
   );
   CREATE INDEX ai_calls_created_idx ON ai_calls (created_at);`,
];
