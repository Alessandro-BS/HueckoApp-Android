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

  // 5 — Tercera entrega: unirse a un grupo acercando el celular. Cada fila es un aviso (una mitad de la pareja).
  // peer_id no lleva FK: las dos mitades se apuntan entre sí (un ciclo al insertar); lo garantiza el código.
  // Las fechas son las del reloj del servidor; los vencimientos se calculan al leer (proximity-rules.ts).
  `CREATE TABLE proximity_requests (
     id         TEXT COLLATE "C" PRIMARY KEY,
     user_id    TEXT COLLATE "C" NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     role       TEXT COLLATE "C" NOT NULL CHECK (role IN ('INVITE', 'JOIN')),
     group_id   TEXT COLLATE "C" REFERENCES groups(id) ON DELETE CASCADE,
     status     TEXT COLLATE "C" NOT NULL
                CHECK (status IN ('WAITING', 'MATCHED', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'AMBIGUOUS', 'CANCELLED')),
     peer_id    TEXT COLLATE "C",
     created_at TEXT COLLATE "C" NOT NULL,
     matched_at TEXT COLLATE "C",
     CHECK ((role = 'INVITE') = (group_id IS NOT NULL))
   );
   CREATE INDEX proximity_requests_status_idx ON proximity_requests (status, created_at);`,

  // 6 — El emparejamiento hacia adelante busca parejas MATCHED de los últimos 3 s por matched_at (la tabla no se vacía).
  `CREATE INDEX proximity_requests_matched_idx ON proximity_requests (status, matched_at);`,

  // 7 — Franjas con fecha: cada franja es un día concreto ("YYYY-MM-DD" en America/Lima), no un día de la semana.
  // Corre sobre datos reales: no cambia el estado de ninguna propuesta ni toca los votos (apuntan a la franja por id).
  // - La franja elegida de un plan confirmado toma su scheduled_date.
  // - Las demás, la próxima vez que ocurre su day_of_week desde el día (en Lima) en que se creó la propuesta, ese mismo
  //   día incluido: 0 a 6 días después. Una franja del mismo día de la creación que ya había empezado a esa hora
  //   queda con esa fecha, ya pasada: confirmarla da WINDOW_STARTED y basta con replantear la propuesta.
  // day_of_week se conserva y desde ahora el código siempre lo deriva de date.
  // El UNIQUE viejo se declaró sin nombre en la migración 3: su nombre lo generó Postgres (y lo recorta a 63 bytes),
  // así que se busca en el catálogo por sus columnas. Si no aparece exactamente uno, la migración falla (STRICT).
  `ALTER TABLE proposal_windows ADD COLUMN date TEXT COLLATE "C";
   UPDATE proposal_windows w SET date = p.scheduled_date
   FROM proposals p
   WHERE p.id = w.proposal_id AND p.chosen_window_id = w.id AND p.scheduled_date IS NOT NULL;
   UPDATE proposal_windows w
   SET date = to_char(c.d + ((w.day_of_week - EXTRACT(ISODOW FROM c.d)::int + 7) % 7), 'YYYY-MM-DD')
   FROM (SELECT id, (created_at::timestamptz AT TIME ZONE 'America/Lima')::date AS d FROM proposals) c
   WHERE c.id = w.proposal_id AND w.date IS NULL;
   ALTER TABLE proposal_windows ALTER COLUMN date SET NOT NULL;
   DO $$
   DECLARE old_name TEXT;
   BEGIN
     SELECT con.conname INTO STRICT old_name
     FROM pg_constraint con
     WHERE con.conrelid = 'proposal_windows'::regclass AND con.contype = 'u'
       AND (SELECT array_agg(a.attname::text ORDER BY a.attname::text) FROM pg_attribute a
            WHERE a.attrelid = con.conrelid AND a.attnum = ANY (con.conkey))
           = ARRAY['day_of_week', 'end_time', 'proposal_id', 'start_time'];
     EXECUTE format('ALTER TABLE proposal_windows DROP CONSTRAINT %I', old_name);
   END
   $$;
   ALTER TABLE proposal_windows ADD CONSTRAINT proposal_windows_proposal_date_time_key UNIQUE (proposal_id, date, start_time, end_time);`,

  // 8 — Votación exprés grupal: una falta crítica en un plan confirmado abre una votación corta.
  // - Una sola ABIERTA por plan (índice único parcial); las CERRADAS se acumulan como historial.
  // - express_vote_voters fija quién vota al abrir (una fila por votante; option es su voto, NULL mientras no vote).
  //   Solo cuentan los que siguen en el grupo: se comprueba al leer, no se borran filas al salir de un grupo.
  // - incidences.critical_reason: por qué la incidencia fue crítica (NULL si no lo fue).
  `ALTER TABLE incidences ADD COLUMN critical_reason TEXT COLLATE "C";
   CREATE TABLE express_votes (
     id                    TEXT COLLATE "C" PRIMARY KEY,
     seq                   BIGINT GENERATED ALWAYS AS IDENTITY UNIQUE,
     proposal_id           TEXT COLLATE "C" NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
     reporter_id           TEXT COLLATE "C" NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     reason                TEXT COLLATE "C" NOT NULL,
     critical_reason       TEXT COLLATE "C" NOT NULL,
     status                TEXT COLLATE "C" NOT NULL CHECK (status IN ('ABIERTA', 'CERRADA')),
     opened_at             TEXT COLLATE "C" NOT NULL,
     expires_at            TEXT COLLATE "C" NOT NULL,
     closed_at             TEXT COLLATE "C",
     result                TEXT COLLATE "C" CHECK (result IN ('CANCELAR', 'REAGENDAR', 'MANTENER')),
     result_by_default     BOOLEAN,
     recommendation        TEXT COLLATE "C" CHECK (recommendation IN ('CANCELAR', 'REAGENDAR', 'MANTENER')),
     recommendation_reason TEXT COLLATE "C"
   );
   CREATE UNIQUE INDEX express_votes_one_open ON express_votes (proposal_id) WHERE status = 'ABIERTA';
   CREATE INDEX express_votes_proposal_idx ON express_votes (proposal_id, opened_at);
   CREATE TABLE express_vote_voters (
     vote_id  TEXT COLLATE "C" NOT NULL REFERENCES express_votes(id) ON DELETE CASCADE,
     user_id  TEXT COLLATE "C" NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     option   TEXT COLLATE "C" CHECK (option IN ('CANCELAR', 'REAGENDAR', 'MANTENER')),
     voted_at TEXT COLLATE "C",
     PRIMARY KEY (vote_id, user_id)
   );`,

  // 9 — La recomendación de la IA en la votación exprés se anota en ai_calls como una tarea más: el CHECK de `task`
  // (inline en la migración 4, así que Postgres lo llamó ai_calls_task_check) se rehace con la tarea nueva.
  `ALTER TABLE ai_calls DROP CONSTRAINT ai_calls_task_check;
   ALTER TABLE ai_calls ADD CONSTRAINT ai_calls_task_check
     CHECK (task IN ('schedule-ocr', 'proposal-draft', 'plan-suggestions', 'voting-summary', 'express-recommendation'));`,

  // 10 — Varios organizadores por grupo: el rol OWNER pasa a llamarse ORGANIZER. El CHECK de `role` (inline en la
  // migración 2, así que Postgres lo llamó group_members_role_check) se rehace con el valor nuevo.
  `ALTER TABLE group_members DROP CONSTRAINT group_members_role_check;
   UPDATE group_members SET role = 'ORGANIZER' WHERE role = 'OWNER';
   ALTER TABLE group_members ADD CONSTRAINT group_members_role_check CHECK (role IN ('ORGANIZER', 'MEMBER'));`,

  // 11 — Cierre automático y voto múltiple. La clave de votes (PRIMARY KEY inline de la migración 2, así que Postgres
  // la llamó votes_pkey) pasa a incluir la franja.
  `ALTER TABLE proposals ADD COLUMN multiple_votes BOOLEAN NOT NULL DEFAULT false;
   ALTER TABLE proposals ADD COLUMN auto_closed BOOLEAN NOT NULL DEFAULT false;
   ALTER TABLE votes DROP CONSTRAINT votes_pkey;
   ALTER TABLE votes ADD PRIMARY KEY (proposal_id, user_id, window_id);`,

  // 12 — Notificaciones push: celulares registrados y bandeja de salida de avisos.
  `CREATE TABLE push_devices (
     token        TEXT COLLATE "C" PRIMARY KEY,
     user_id      TEXT COLLATE "C" NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     created_at   TEXT COLLATE "C" NOT NULL,
     last_seen_at TEXT COLLATE "C" NOT NULL
   );
   CREATE INDEX push_devices_user_idx ON push_devices (user_id);
   CREATE TABLE notifications (
     id         TEXT COLLATE "C" PRIMARY KEY,
     seq        BIGINT GENERATED ALWAYS AS IDENTITY UNIQUE,
     user_id    TEXT COLLATE "C" NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     kind       TEXT COLLATE "C" NOT NULL CHECK (kind IN ('NEW_PROPOSAL', 'PLAN_CONFIRMED', 'PLAN_CANCELLED',
                                                          'EXPRESS_OPENED', 'EXPRESS_RESULT', 'REMINDER')),
     title      TEXT COLLATE "C" NOT NULL,
     body       TEXT COLLATE "C" NOT NULL,
     data       TEXT COLLATE "C" NOT NULL,
     dedupe_key TEXT COLLATE "C" UNIQUE,
     created_at TEXT COLLATE "C" NOT NULL,
     sent_at    TEXT COLLATE "C",
     claimed_at TEXT COLLATE "C",
     attempts   INTEGER NOT NULL DEFAULT 0,
     last_error TEXT COLLATE "C"
   );
   CREATE INDEX notifications_pending_idx ON notifications (seq) WHERE sent_at IS NULL;`,

  // 13 — Cuentas: correo verificado, Google, 2FA y retos con código.
  `ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;
   ALTER TABLE users ADD COLUMN email_verified BOOLEAN NOT NULL DEFAULT false;
   UPDATE users SET email_verified = true;
   ALTER TABLE users ADD COLUMN google_sub TEXT COLLATE "C" UNIQUE;
   ALTER TABLE users ADD COLUMN two_factor_enabled BOOLEAN NOT NULL DEFAULT false;
   ALTER TABLE users ADD COLUMN session_version INTEGER NOT NULL DEFAULT 0;
   CREATE TABLE auth_challenges (
     id           TEXT COLLATE "C" PRIMARY KEY,
     user_id      TEXT COLLATE "C" NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     purpose      TEXT COLLATE "C" NOT NULL CHECK (purpose IN ('VERIFY_EMAIL', 'LOGIN_2FA', 'RESET_PASSWORD', 'ENABLE_2FA')),
     code_hash    TEXT COLLATE "C" NOT NULL,
     attempts     INTEGER NOT NULL DEFAULT 0,
     send_count   INTEGER NOT NULL DEFAULT 0,
     created_at   TEXT COLLATE "C" NOT NULL,
     expires_at   TEXT COLLATE "C" NOT NULL,
     last_sent_at TEXT COLLATE "C",
     consumed_at  TEXT COLLATE "C"
   );
   CREATE UNIQUE INDEX auth_challenges_one_live ON auth_challenges (user_id, purpose) WHERE consumed_at IS NULL;
   CREATE INDEX auth_challenges_user_created_idx ON auth_challenges (user_id, created_at);`,
];
