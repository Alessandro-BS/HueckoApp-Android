// Migraciones de Postgres en orden. Nunca se edita una ya publicada: se agrega una nueva al final.
// schema_migrations guarda cuáles se aplicaron (migrate.ts).
//
// Convenciones (ver D4–D7 del plan de migración a Postgres):
// - Fechas como TEXT ISO 8601 UTC con milisegundos: la API las devuelve tal cual y se ordenan igual que las fechas.
// - Todo texto con COLLATE "C": se ordena y compara byte a byte, como SQLite, sea cual sea el idioma de la base.
// - `seq` (IDENTITY) desempata por orden de inserción donde antes se usaba rowid. Nunca sale en la API.

/** Ahora mismo en ISO UTC con milisegundos (2026-09-29T15:00:00.000Z), el formato del reloj de la app. */
export const NOW_ISO_SQL = `to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;

export const migrations: string[] = [
  `CREATE TABLE users (
     id            TEXT COLLATE "C" PRIMARY KEY,
     seq           BIGINT GENERATED ALWAYS AS IDENTITY UNIQUE,
     name          TEXT COLLATE "C" NOT NULL,
     email         TEXT COLLATE "C" NOT NULL UNIQUE,
     password_hash TEXT COLLATE "C" NOT NULL,
     created_at    TEXT COLLATE "C" NOT NULL DEFAULT ${NOW_ISO_SQL}
   );`,
  // 1 — Fase 2: bloques de horario. Recurrente = día de la semana; puntual = fecha concreta.
  `CREATE TABLE time_blocks (
     id           TEXT COLLATE "C" PRIMARY KEY,
     seq          BIGINT GENERATED ALWAYS AS IDENTITY UNIQUE,
     user_id      TEXT COLLATE "C" NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     label        TEXT COLLATE "C" NOT NULL,
     type         TEXT COLLATE "C" NOT NULL CHECK (type IN ('CLASE', 'TRABAJO', 'LIBRE', 'PUNTUAL')),
     start_time   TEXT COLLATE "C" NOT NULL,
     end_time     TEXT COLLATE "C" NOT NULL,
     is_recurring BOOLEAN NOT NULL,
     day_of_week  INTEGER CHECK (day_of_week BETWEEN 1 AND 7),
     date         TEXT COLLATE "C",
     created_at   TEXT COLLATE "C" NOT NULL DEFAULT ${NOW_ISO_SQL},
     CHECK (start_time < end_time),
     CHECK ((is_recurring AND day_of_week IS NOT NULL AND date IS NULL)
         OR (NOT is_recurring AND day_of_week IS NULL AND date IS NOT NULL))
   );
   CREATE INDEX time_blocks_user_idx ON time_blocks (user_id);`,
  // 2 — Fase 2: grupos y sus miembros.
  `CREATE TABLE groups (
     id                     TEXT COLLATE "C" PRIMARY KEY,
     seq                    BIGINT GENERATED ALWAYS AS IDENTITY UNIQUE,
     name                   TEXT COLLATE "C" NOT NULL,
     description            TEXT COLLATE "C" NOT NULL DEFAULT '',
     invite_code            TEXT COLLATE "C" NOT NULL UNIQUE,
     availability_threshold INTEGER NOT NULL DEFAULT 80 CHECK (availability_threshold BETWEEN 0 AND 100),
     created_at             TEXT COLLATE "C" NOT NULL DEFAULT ${NOW_ISO_SQL}
   );
   CREATE TABLE group_members (
     group_id     TEXT COLLATE "C" NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
     user_id      TEXT COLLATE "C" NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     seq          BIGINT GENERATED ALWAYS AS IDENTITY UNIQUE,
     role         TEXT COLLATE "C" NOT NULL CHECK (role IN ('OWNER', 'MEMBER')),
     is_essential BOOLEAN NOT NULL DEFAULT FALSE,
     joined_at    TEXT COLLATE "C" NOT NULL DEFAULT ${NOW_ISO_SQL},
     PRIMARY KEY (group_id, user_id)
   );
   CREATE INDEX group_members_user_idx ON group_members (user_id);`,
  // 3 — Fase 3: propuestas de plan, sus franjas, votos (uno por persona y propuesta) e incidencias.
  // chosen_window_id no lleva FK para no crear un ciclo proposals ↔ proposal_windows: lo garantiza el código.
  // Latitud y longitud en DOUBLE PRECISION: REAL (4 bytes) cambiaría -12.07 por -12.069999694824219.
  `CREATE TABLE proposals (
     id               TEXT COLLATE "C" PRIMARY KEY,
     seq              BIGINT GENERATED ALWAYS AS IDENTITY UNIQUE,
     group_id         TEXT COLLATE "C" NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
     title            TEXT COLLATE "C" NOT NULL,
     location_name    TEXT COLLATE "C",
     latitude         DOUBLE PRECISION CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90),
     longitude        DOUBLE PRECISION CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180),
     created_by       TEXT COLLATE "C" NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     voting_deadline  TEXT COLLATE "C" NOT NULL,
     state            TEXT COLLATE "C" NOT NULL DEFAULT 'PROPUESTO'
                      CHECK (state IN ('PROPUESTO', 'CONFIRMADO', 'CANCELADO', 'EN_RECOORDINACION')),
     chosen_window_id TEXT COLLATE "C",
     scheduled_at     TEXT COLLATE "C",
     scheduled_date   TEXT COLLATE "C",
     created_at       TEXT COLLATE "C" NOT NULL DEFAULT ${NOW_ISO_SQL},
     CHECK ((latitude IS NULL) = (longitude IS NULL)),
     CHECK (location_name IS NOT NULL OR latitude IS NULL)
   );
   CREATE INDEX proposals_group_idx ON proposals (group_id, created_at);
   CREATE TABLE proposal_windows (
     id                      TEXT COLLATE "C" PRIMARY KEY,
     proposal_id             TEXT COLLATE "C" NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
     day_of_week             INTEGER NOT NULL CHECK (day_of_week BETWEEN 1 AND 7),
     start_time              TEXT COLLATE "C" NOT NULL,
     end_time                TEXT COLLATE "C" NOT NULL,
     availability_percentage INTEGER NOT NULL CHECK (availability_percentage BETWEEN 0 AND 100),
     CHECK (start_time < end_time),
     UNIQUE (proposal_id, day_of_week, start_time, end_time),
     UNIQUE (id, proposal_id)
   );
   CREATE TABLE votes (
     proposal_id TEXT COLLATE "C" NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
     user_id     TEXT COLLATE "C" NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     window_id   TEXT COLLATE "C" NOT NULL,
     created_at  TEXT COLLATE "C" NOT NULL DEFAULT ${NOW_ISO_SQL},
     PRIMARY KEY (proposal_id, user_id),
     FOREIGN KEY (window_id, proposal_id) REFERENCES proposal_windows (id, proposal_id) ON DELETE CASCADE
   );
   CREATE INDEX votes_window_idx ON votes (window_id);
   CREATE TABLE incidences (
     id            TEXT COLLATE "C" PRIMARY KEY,
     seq           BIGINT GENERATED ALWAYS AS IDENTITY UNIQUE,
     proposal_id   TEXT COLLATE "C" NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
     user_id       TEXT COLLATE "C" NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     type          TEXT COLLATE "C" NOT NULL CHECK (type IN ('FALTA', 'TARDANZA', 'IMPREVISTO')),
     reason        TEXT COLLATE "C" NOT NULL,
     delay_minutes INTEGER,
     criticality   TEXT COLLATE "C" NOT NULL CHECK (criticality IN ('BAJA', 'MEDIA', 'ALTA')),
     resolved      BOOLEAN NOT NULL DEFAULT FALSE,
     created_at    TEXT COLLATE "C" NOT NULL DEFAULT ${NOW_ISO_SQL},
     CHECK ((type = 'TARDANZA' AND COALESCE(delay_minutes, 0) > 0) OR (type <> 'TARDANZA' AND delay_minutes IS NULL))
   );
   CREATE INDEX incidences_proposal_idx ON incidences (proposal_id);`,

  // 4 — Fase 4.5: administración. Rol y estado de cada cuenta (se leen de aquí en cada petición, nunca del JWT),
  // registro de acciones de administración y de llamadas a la IA (sin prompt ni respuesta), e índices por fecha para
  // las estadísticas (filtran por rango de created_at / scheduled_at). admin_id NULL = consola (npm run make-admin).
  // admin_audit_log.admin_id no tiene ON DELETE a propósito: la app no borra cuentas, y con SET NULL la entrada de un
  // admin borrado se leería como «Consola del servidor». `details` es TEXT (no jsonb) para devolver exactamente el
  // JSON que se escribió (jsonb reordena las claves); IS JSON exige Postgres 16 o posterior.
  `ALTER TABLE users ADD COLUMN role TEXT COLLATE "C" NOT NULL DEFAULT 'USER' CHECK (role IN ('USER', 'ADMIN'));
   ALTER TABLE users ADD COLUMN status TEXT COLLATE "C" NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'SUSPENDED'));
   CREATE INDEX users_created_idx ON users (created_at);
   CREATE INDEX groups_created_idx ON groups (created_at);
   CREATE INDEX proposals_created_idx ON proposals (created_at);
   CREATE INDEX proposals_scheduled_idx ON proposals (scheduled_at);
   CREATE INDEX incidences_created_idx ON incidences (created_at);
   CREATE TABLE admin_audit_log (
     id          TEXT COLLATE "C" PRIMARY KEY,
     seq         BIGINT GENERATED ALWAYS AS IDENTITY UNIQUE,
     admin_id    TEXT COLLATE "C" REFERENCES users(id),
     action      TEXT COLLATE "C" NOT NULL CHECK (action IN ('USER_SUSPENDED', 'USER_REACTIVATED', 'USER_PROMOTED', 'USER_DEMOTED',
                                                           'GROUP_DELETED', 'PROPOSAL_CANCELLED')),
     target_type TEXT COLLATE "C" NOT NULL CHECK (target_type IN ('USER', 'GROUP', 'PROPOSAL')),
     target_id   TEXT COLLATE "C" NOT NULL,
     details     TEXT COLLATE "C" NOT NULL DEFAULT '{}' CHECK (details IS JSON),
     created_at  TEXT COLLATE "C" NOT NULL DEFAULT ${NOW_ISO_SQL}
   );
   CREATE INDEX admin_audit_log_created_idx ON admin_audit_log (created_at);
   CREATE TABLE ai_calls (
     id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
     user_id     TEXT COLLATE "C" REFERENCES users(id) ON DELETE SET NULL,
     task        TEXT COLLATE "C" NOT NULL CHECK (task IN ('schedule-ocr', 'proposal-draft', 'plan-suggestions', 'voting-summary')),
     ok          BOOLEAN NOT NULL,
     duration_ms INTEGER NOT NULL CHECK (duration_ms >= 0),
     created_at  TEXT COLLATE "C" NOT NULL
   );
   CREATE INDEX ai_calls_created_idx ON ai_calls (created_at);`,
];
