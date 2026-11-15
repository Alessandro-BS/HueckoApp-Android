# Cuentas: Google, verificación de correo, recuperar contraseña y 2FA — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entrar con Google, verificación de correo obligatoria, recuperar la contraseña y 2FA opcional por correo, sin
que ninguna cuenta obtenga un JWT sin el código que corresponde, y una guía única de puesta en marcha antes del APK.

**Architecture:** Un solo mecanismo de *retos* (`auth_challenges`): cuando falta un código, `/auth/register`,
`/auth/login`, `/auth/password/forgot` y `/auth/me/2fa/enable` devuelven `{ challenge }` en vez del JWT; la app manda
el código a `/auth/challenges/:id/verify` y recibe `{ token, user }`. Los códigos (6 dígitos, HMAC con `JWT_SECRET`) se
mandan con Brevo por un `EmailClient` inyectable; Google se verifica con un `GoogleVerifier` inyectable
(`google-auth-library`). El JWT lleva `sv` (`session_version`): recuperar la contraseña cierra las sesiones viejas.

**Tech Stack:** Express 5 + zod + `ApiError`, Postgres (Neon / PGlite) detrás de `Db`, Vitest + Supertest,
`google-auth-library`, API HTTP de Brevo (sin SDK); Expo SDK 57, React Navigation, `@react-native-google-signin/google-signin`
(API «Original», gratis), Jest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-11-13-cuentas-google-brevo-design.md` (aprobada por el usuario el 2026-11-14 con
sus 9 «Decisiones tomadas por Claude»). Léela entera antes de cada tarea: este plan fija nombres y orden, la spec fija
las reglas.

## Global Constraints

- Rama `feature/cuentas-google-brevo` (sale de `feature/notificaciones-push`, PR #49). Commits convencionales en
  español con el ámbito correcto (`feat(backend)`, `feat(mobile)`, `docs`); el cuerpo termina con una línea en blanco y
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Identidad: `GIT_AUTHOR_NAME="Aless Bustamante"`,
  `GIT_AUTHOR_EMAIL=fabrizio.bs9012@gmail.com` y las mismas en `GIT_COMMITTER_*`. **Sin push.**
- Migración nueva al final de `backend/src/db/migrations.ts` (la **13**); nunca se edita una publicada.
- `shared/index.d.ts` y `docs/api.md` cambian en el mismo commit que el endpoint.
- Errores con `ApiError(status, code, message, details?)`; validación con zod; SQL parametrizado (`$1`); fechas como
  texto ISO desde `deps.now()` (como el resto del backend).
- Todos los endpoints nuevos viven en `/api/auth` (incluidos los de 2FA: `/api/auth/me/2fa/enable` y `/disable`, con
  `requireAuth`).
- Reglas del código (constantes en `backend/src/auth/challenge-rules.ts`, exactas): `CODE_TTL_MINUTES = 15`,
  `MAX_ATTEMPTS = 5`, `RESEND_COOLDOWN_SECONDS = 60`, `MAX_SENDS_PER_CHALLENGE = 5`, `DAILY_EMAIL_LIMIT = 10`
  (correos por cuenta en 24 h, todos los propósitos).
- Códigos de error exactos: `CODE_INVALID` (400, `details: { attemptsLeft }`), `CHALLENGE_EXPIRED` (410, «Pide un
  código nuevo.»), `RESEND_TOO_SOON` (429, `details: { retryAfterSeconds }`), `EMAIL_DAILY_LIMIT` (429, «Ya te enviamos
  muchos códigos hoy. Inténtalo mañana.»), `EMAIL_SEND_FAILED` (503, «No pudimos enviar el correo. Intenta reenviar el
  código en un momento.»), `GOOGLE_TOKEN_INVALID` (401), `GOOGLE_NOT_CONFIGURED` (503, sin `GOOGLE_WEB_CLIENT_ID`),
  `WRONG_PASSWORD` (400, **nunca 401**: el interceptor de la app cierra la sesión con cualquier 401),
  `PASSWORD_REQUIRED` (409), `EMAIL_TAKEN` (409, como hoy), `INVALID_CREDENTIALS` (401, como hoy).
- `ChallengePurpose = 'VERIFY_EMAIL' | 'LOGIN_2FA' | 'RESET_PASSWORD' | 'ENABLE_2FA'`.
- Ningún secreto en el repo ni en la app: `BREVO_API_KEY` solo en `backend/.env` y Render (`render.yaml` con
  `sync: false`). `GOOGLE_WEB_CLIENT_ID` no es secreto (va en `backend/.env`/Render y en `mobile/app.json` →
  `extra.googleWebClientId`).
- Los tests nunca llaman a Google ni a Brevo: dobles inyectados por `AppDeps`.
- Textos de la app en español con el tono actual. Textos fijos: botón «Continuar con Google»; enlace «¿Olvidaste tu
  contraseña?»; pantalla del código «Escribe el código» + «Te enviamos un código a {emailHint}» + «Reenviar código» /
  «Reenviar en {s} s»; interruptor de Perfil «Verificación en dos pasos»; sin contraseña: «Para activarla, primero crea
  una contraseña con «¿Olvidaste tu contraseña?».».
- Antes de cada commit: `npm run typecheck` (raíz) y los tests de los workspaces tocados. Node 22 en Bash:
  `eval "$(fnm env --shell bash)" && fnm use 22`. Backend: `cd C:/Users/fabri/OneDrive/Desktop/Repositorios/HueckoApp-Android/backend && npx vitest run`
  (con la **C mayúscula**; con `c:/` falla «failed to find the current suite»). Mobile: `npx jest --maxWorkers=2` (sin
  el límite fallan tests por carga de memoria).

## Review Focus

1. **Sin código no hay JWT:** ninguna respuesta de `/register`, `/login` (cuenta sin verificar o con 2FA) ni
   `/password/forgot` trae `token`. Tests en Tasks 2, 3 y 5.
2. **Fuerza bruta:** el contador de intentos se actualiza bajo `SELECT … FOR UPDATE` en una transacción; dos intentos
   simultáneos no suman más de 5 en total; un código usado, vencido o del quinto fallo no vuelve a servir. Tests en
   Tasks 1 y 2.
3. **No delatar cuentas:** `/password/forgot` responde igual (forma y estado) exista o no el correo, falle o no Brevo,
   se pase o no el límite; `resend` de un reto falso responde `204`. Tests en Task 3.
4. **Apropiación de cuentas:** Google exige `email_verified`; vincular a una cuenta sin verificar borra su contraseña y
   su 2FA; registro sobre un correo sin verificar reemplaza los datos. Tests en Tasks 2 y 4.
5. **Nadie queda fuera al actualizar:** la migración pone `email_verified = true` en las filas existentes; un JWT sin
   `sv` cuenta como `sv = 0`. Tests en Tasks 1 y 2.

---

### Task 1: Datos, retos y envío de correos (backend, sin rutas nuevas)

**Files:**
- Modify: `backend/src/db/migrations.ts` (migración 13), `backend/src/config/env-schema.ts`,
  `backend/src/app.ts` (`AppDeps.email?: EmailClient`; por defecto el de consola), `backend/src/index.ts` (Brevo si
  hay `BREVO_API_KEY`), `backend/.env.example`, `backend/package.json` (nada nuevo: `fetch` nativo)
- Create: `backend/src/auth/challenge-rules.ts`, `backend/src/auth/codes.ts`,
  `backend/src/auth/challenges.repository.ts`, `backend/src/auth/challenges.ts`, `backend/src/email/email-client.ts`,
  `backend/src/email/brevo-client.ts`, `backend/src/email/code-email.ts`
- Test: `backend/test/migrations.test.ts`, `backend/test/env-schema.test.ts`, nuevo `backend/test/challenges.test.ts`,
  nuevo `backend/test/brevo-client.test.ts`, `backend/test/helpers.ts` (`fakeEmail`)

**Interfaces:**
- Produces:
  - Migración 13 (una cadena, comentario «13 — Cuentas: correo verificado, Google, 2FA y retos con código.»):
    ```sql
    ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;
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
    CREATE INDEX auth_challenges_user_created_idx ON auth_challenges (user_id, created_at);
    ```
    `send_count` no está en la lista de la spec pero la exige su regla «como mucho 5 envíos por reto» y el límite
    diario (= `SUM(send_count)` de los retos del usuario con `created_at` de las últimas 24 h).
  - `env-schema.ts`: `BREVO_API_KEY`, `BREVO_SENDER_EMAIL`, `GOOGLE_WEB_CLIENT_ID` opcionales (cadena vacía =
    `undefined`, mismo `z.preprocess` que `CRON_SECRET`); `BREVO_SENDER_NAME` con `default('HueckoApp')`;
    `CODE_RATE_LIMIT` (`default(30)`, intentos por IP cada 15 min en verify/resend/forgot). En `superRefine`: con
    `NODE_ENV=production`, faltar `BREVO_API_KEY` o `BREVO_SENDER_EMAIL` es error («En producción BREVO_API_KEY y
    BREVO_SENDER_EMAIL son obligatorias: sin ellas nadie puede verificar su correo.»).
  - `email-client.ts`: `type EmailMessage = { to: string; subject: string; text: string; html: string }`;
    `interface EmailClient { send(message: EmailMessage): Promise<void> }` (lanza `EmailSendError` si no salió);
    `class EmailSendError extends Error`; `createConsoleEmailClient(log = console.log): EmailClient` (escribe
    destinatario, asunto y texto: así se ve el código en desarrollo).
  - `brevo-client.ts`: `createBrevoEmailClient({ apiKey, senderEmail, senderName, fetchImpl = fetch, timeoutMs = 10_000 })`
    → `POST https://api.brevo.com/v3/smtp/email` con cabeceras `api-key`, `content-type: application/json`,
    `accept: application/json` y cuerpo `{ sender: { email, name }, to: [{ email }], subject, textContent, htmlContent }`.
    Red caída, espera agotada o estado no 2xx → `EmailSendError` (con el estado, nunca con la clave).
  - `code-email.ts` (puro): `codeEmail(purpose: ChallengePurpose, code: string): Omit<EmailMessage, 'to'>` — asunto
    exacto «Tu código de HueckoApp: {code}»; texto y HTML simple con el código, para qué es (verificar tu correo /
    iniciar sesión / restablecer tu contraseña / activar la verificación en dos pasos) y «Vence en 15 minutos.».
  - `codes.ts`: `generateCode(): string` (`crypto.randomInt(0, 1_000_000)` con ceros a la izquierda, 6 dígitos);
    `generateChallengeId(): string` (`randomBytes(32).toString('base64url')`); `hashCode(secret, challengeId, code)` =
    HMAC-SHA256 hex de `${challengeId}:${code}`; `codeMatches(secret, challengeId, code, hash): boolean` con
    `timingSafeEqual`; `emailHint(email)`: «a***@gmail.com» (primera letra + `***` + `@dominio`).
  - `challenges.repository.ts` (`challengesRepository(db)`): `insert(row)`, `liveFor(userId, purpose)`,
    `findForUpdate(id)` (`SELECT … FOR UPDATE`), `consume(id, now)`, `consumeLive(userId, purpose, now)`,
    `recordFailure(id)`, `recordSend(id, now)` (suma `send_count`, pone `last_sent_at`), `refreshCode(id, codeHash, now)`
    (nuevo hash, `attempts = 0`, `expires_at = now + 15 min`), `emailsSentSince(userId, sinceIso): Promise<number>`.
  - `challenges.ts` — el servicio, único que conoce las reglas (las rutas no tocan el repositorio):
    ```ts
    export type ChallengeDeps = { db: Db; email: EmailClient; secret: string; now: () => Date };
    export type ChallengeView = { id: string; purpose: ChallengePurpose; emailHint: string; resendAvailableAt: string };
    export type IssueOptions = { quiet?: boolean }; // quiet: /password/forgot (ni 429 ni 503: se registra en el log)
    // Reutiliza el reto vivo si se envió hace < 60 s (sin mandar otro correo); si no, consume el vivo, crea uno nuevo,
    // cuenta el límite diario (429 EMAIL_DAILY_LIMIT) y envía (503 EMAIL_SEND_FAILED; el reto queda vivo y last_sent_at
    // sin tocar, así se puede reenviar sin esperar).
    export function issueChallenge(deps, user: { id: string; email: string }, purpose, opts?): Promise<ChallengeView>;
    // Reglas de reenvío: 410 si no existe/vencido/consumido, 429 RESEND_TOO_SOON, máximo 5 envíos (410 al pasarse),
    // límite diario, código nuevo con attempts = 0 y expires_at extendido.
    export function resendChallenge(deps, id: string): Promise<void>;
    // En una transacción con findForUpdate: 410 si no existe/vencido/consumido; código malo → recordFailure y 400
    // CODE_INVALID { attemptsLeft }, o 410 si era el quinto (y lo consume); bueno → consume y devuelve el reto.
    // `purposeCheck` corre dentro de la misma transacción, tras el candado y ANTES de mirar el código: si lanza, no se
    // gasta intento (las rutas lo usan para rechazar propósitos que no aceptan y, en ENABLE_2FA, al JWT de otra persona).
    export function verifyChallenge(deps, id: string, code: string, opts?: { purposeCheck?: (c: { userId: string; purpose: ChallengePurpose }) => void }):
      Promise<{ userId: string; purpose: ChallengePurpose }>;
    ```
    `resendAvailableAt` = `last_sent_at + 60 s` (o «ahora» si nunca salió).
  - `helpers.ts`: `fakeEmail(): EmailClient & { sent: EmailMessage[]; fail(next: boolean): void; lastCodeTo(email):
    string }` (saca el código de 6 dígitos del asunto del último correo a ese destinatario). `makeTestApp` inyecta uno
    por defecto (opción `email?`) y lo devuelve: `{ app, db, emails }`.
  - `app.ts`: `AppDeps.email?: EmailClient` y `codeRateLimit?: number`; `ResolvedDeps.email: EmailClient` (consola si
    se omite). `index.ts`: `createBrevoEmailClient(...)` si hay `BREVO_API_KEY`; si no, consola y un `console.warn`
    («BREVO_API_KEY está vacía: los códigos se escriben en este log en vez de enviarse por correo.»).

- [ ] **Step 1: Write the failing tests:**
  - `migrations.test.ts`: migrar de 12 a 13 con un usuario existente → queda `email_verified = true`,
    `session_version = 0`, `two_factor_enabled = false`; un usuario nuevo nace `email_verified = false`;
    `password_hash` admite `NULL`; `google_sub` único; dos retos vivos del mismo usuario y propósito violan
    `auth_challenges_one_live`, uno consumido no; borrar el usuario borra sus retos; `purpose = 'OTRO'` lo rechaza el
    CHECK.
  - `env-schema.test.ts`: producción sin `BREVO_API_KEY` o sin `BREVO_SENDER_EMAIL` → error con el texto; desarrollo
    sin ellas → válido; `BREVO_SENDER_NAME` por defecto «HueckoApp»; `GOOGLE_WEB_CLIENT_ID=""` → `undefined`.
  - `brevo-client.test.ts` (con `fetchImpl` falso): URL, cabecera `api-key`, cuerpo exacto; 400/401/500 →
    `EmailSendError` sin la clave en el mensaje; espera agotada (`timeoutMs: 10` y un fetch que no responde) →
    `EmailSendError`.
  - `challenges.test.ts` (servicio directo, base de test, reloj `makeClock`, `fakeEmail`):
    - `issueChallenge` guarda el hash (nunca el código en claro: ninguna columna contiene los 6 dígitos), manda un
      correo con el asunto exacto y devuelve `emailHint` «u***@correo.com» y `resendAvailableAt` = ahora + 60 s;
    - pedirlo otra vez a los 30 s devuelve el **mismo** `id` y no manda correo; a los 61 s crea otro y el anterior queda
      consumido (verificarlo → `410`);
    - el 11.º correo del día (mezclando propósitos y reenvíos) → `429 EMAIL_DAILY_LIMIT`; con `quiet` no lanza, no envía
      y devuelve un reto con la misma forma;
    - Brevo falla → `503 EMAIL_SEND_FAILED`, el reto sigue vivo, `last_sent_at` nulo y `resendChallenge` funciona sin
      esperar; con `quiet` no lanza;
    - `resendChallenge` antes de 60 s → `429 RESEND_TOO_SOON` con `retryAfterSeconds`; el 6.º envío del reto → `410`;
      reenviar invalida el código anterior y resetea los intentos;
    - `verifyChallenge`: código bueno → `{ userId, purpose }` y un segundo uso → `410`; malo → `400 CODE_INVALID`
      `attemptsLeft` 4, 3, 2, 1 y el quinto → `410` (y después el bueno → `410`); a los 15 min + 1 s → `410`; id
      inexistente → `410`;
    - **Review Focus 2:** dos `verifyChallenge` con código malo lanzados a la vez con `attempts = 4` dejan exactamente
      un `410` y el reto consumido (usar `interleaveWith` para colar el segundo antes del `UPDATE` del primero y
      comprobar que espera al candado; con PGlite basta comprobar con `recordQueries` que `FOR UPDATE` es la primera
      consulta de la transacción).
- [ ] **Step 2: Run** `npx vitest run test/migrations.test.ts test/env-schema.test.ts test/brevo-client.test.ts test/challenges.test.ts`.
  Expected: FAIL.
- [ ] **Step 3: Implement** lo de **Interfaces** y `.env.example` (las cinco variables nuevas, comentadas, sin valores).
- [ ] **Step 4: Run** `npm run typecheck` y `npx vitest run`. Expected: PASS (el resto de la suite no cambia todavía).
- [ ] **Step 5: Commit** `feat(backend): retos con código por correo (Brevo) y migración de cuentas`

### Task 2: Registro, login y verificación del correo (backend)

**Files:**
- Modify: `backend/src/auth/auth.routes.ts`, `backend/src/auth/auth.schemas.ts`, `backend/src/auth/tokens.ts`,
  `backend/src/auth/require-auth.ts`, `backend/src/users/users.repository.ts`, `backend/src/db/demo-data.ts` (cuentas
  verificadas), `shared/index.d.ts`, `docs/api.md` (§Autenticación), `backend/test/helpers.ts` (`registerUser`)
- Test: `backend/test/auth.test.ts`, `backend/test/account-status.test.ts`, nuevo `backend/test/auth-verify.test.ts`,
  `backend/test/seed.test.ts`

**Interfaces:**
- Consumes: Task 1 (`issueChallenge`, `resendChallenge`, `verifyChallenge`, `fakeEmail`, columnas nuevas).
- Produces:
  - `shared`: `type ChallengePurpose = …`; `type Challenge = { id: string; purpose: ChallengePurpose; emailHint: string;
    resendAvailableAt: string }`; `type AuthResponse = { token: string; user: CurrentUser }` (se queda);
    `type AuthResult = AuthResponse | { challenge: Challenge }`; `CurrentUser = User & { role: UserRole; emailVerified:
    boolean; twoFactorEnabled: boolean; hasPassword: boolean; hasGoogle: boolean }`; `VerifyChallengeInput = { code:
    string; newPassword?: string }`.
  - `tokens.ts`: `signToken(userId, secret, expiresIn, sessionVersion: number)` pone `{ sv }` en el payload;
    `verifyToken(token, secret): { userId: string; sessionVersion: number } | null` (sin `sv` → `0`).
  - `require-auth.ts`: lee también `session_version`; distinto del `sv` del token → `401 UNAUTHORIZED`.
  - `users.repository.ts`: `UserRow`/`Account` con `emailVerified`, `twoFactorEnabled`, `hasPassword`
    (`password_hash IS NOT NULL`), `hasGoogle` (`google_sub IS NOT NULL`), `sessionVersion`; `findByEmail` devuelve
    `passwordHash: string | null`; `create({ name, email, passwordHash, createdAt })` nace sin verificar;
    `replaceUnverified(id, { name, passwordHash })`; `markEmailVerified(id)`; `toCurrentUser` incluye los 4 campos y
    omite `status` y `sessionVersion`. Helper de la ruta: `sessionFor(account) → AuthResponse` (firma con su
    `sessionVersion`).
  - `auth.schemas.ts`: `verifyChallengeSchema = z.object({ code: z.string().trim().regex(/^\d{6}$/, 'El código tiene 6
    dígitos'), newPassword: <mismas reglas que password de registro>.optional() })`.
  - Rutas (`auth.routes.ts`), con `codeLimiter` (`CODE_RATE_LIMIT`) en verify y resend:
    - `POST /register` → `201 { challenge }` (`VERIFY_EMAIL`). Correo existente sin verificar y sin Google → reemplaza
      nombre y contraseña, `201 { challenge }`. Existente verificado (o con Google) → `409 EMAIL_TAKEN`.
    - `POST /login` → `401 INVALID_CREDENTIALS` (también sin contraseña, comparando contra `DUMMY_HASH`); `403`
      suspendida; sin verificar → `200 { challenge }` `VERIFY_EMAIL`; si no → `200 { token, user }` (el 2FA llega en
      la Task 5).
    - `POST /challenges/:id/verify` → `VERIFY_EMAIL`: `markEmailVerified` y `200 { token, user }`. Si la cuenta está
      suspendida tras un código bueno: se aplica el efecto y `403 ACCOUNT_SUSPENDED` en vez del token.
      `RESET_PASSWORD`/`LOGIN_2FA`/`ENABLE_2FA` todavía no se aceptan aquí (los añaden las Tasks 3 y 5): mientras tanto
      responden `410`.
    - `POST /challenges/:id/resend` → `204`.
  - `helpers.ts`: `registerUser(app, overrides)` hace register → `emails.lastCodeTo(email)` → verify y devuelve `{ token,
    user }` como hoy (el `user` sin `role` ni los 4 campos nuevos, para que siga comparando con `User`). El `fakeEmail`
    de cada app se encuentra con un `WeakMap<Express, FakeEmail>` que llena `makeTestApp`. Añade
    `registerUnverified(app, overrides): Promise<{ challenge: Challenge; email: string; password: string }>`.

- [ ] **Step 1: Write the failing tests:**
  - `auth.test.ts` (adaptado): registro → `201` con `challenge` y **sin `token`**; correo con mayúsculas se guarda en
    minúsculas; correo verificado repetido → `409 EMAIL_TAKEN`; correo sin verificar repetido → `201`, el nombre y la
    contraseña nuevos valen y la vieja ya no; login de cuenta verificada → `{ token, user }` con
    `emailVerified: true, twoFactorEnabled: false, hasPassword: true, hasGoogle: false`; login sin verificar → `200
    { challenge }` sin `token` y manda correo; contraseña mala → `401` igual exista o no el correo.
  - `auth-verify.test.ts`: register → verify con el código del correo → `200 { token, user }` y `GET /auth/me`
    funciona; código malo → `400 CODE_INVALID` con `attemptsLeft`; reenviar → otro correo y solo el código nuevo vale;
    `/challenges/xyz/verify` → `410`; `code: "12a456"` → `400 VALIDATION_ERROR` sin gastar intento.
  - **Review Focus 5:** un JWT firmado sin `sv` (con `jwt.sign({}, TEST_SECRET, { subject })`) sigue entrando;
    subir `session_version` en la base invalida un token con `sv: 0` (`401`).
  - `account-status.test.ts` y `seed.test.ts`: las cuentas de la semilla y `make-admin` entran con contraseña sin
    pedir código.
- [ ] **Step 2: Run** `npx vitest run test/auth.test.ts test/auth-verify.test.ts test/account-status.test.ts`.
  Expected: FAIL.
- [ ] **Step 3: Implement** lo de **Interfaces**; `docs/api.md` (§Autenticación: nueva forma de register/login,
  `AuthResult`, `Challenge`, verify y resend con sus errores, `CurrentUser` con los 4 campos, reglas del código).
- [ ] **Step 4: Run** `npm run typecheck` (mobile seguirá compilando: `AuthResponse` no cambia; si `CurrentUser` rompe
  algún test de mobile por fixtures sin los campos nuevos, añade los campos a esos fixtures) y la suite entera de
  backend. Expected: PASS (todos los tests que registran usuarios pasan por el `registerUser` nuevo).
- [ ] **Step 5: Commit** `feat(backend): verificación obligatoria del correo al registrarse y al entrar`

### Task 3: Recuperar la contraseña (backend)

**Files:**
- Modify: `backend/src/auth/auth.routes.ts`, `backend/src/auth/auth.schemas.ts`, `backend/src/users/users.repository.ts`,
  `backend/src/notifications/devices.repository.ts` (`removeAllOf(userId)`), `shared/index.d.ts`
  (`ForgotPasswordInput`), `docs/api.md`
- Test: nuevo `backend/test/auth-reset.test.ts`

**Interfaces:**
- Consumes: Tasks 1–2.
- Produces:
  - `POST /password/forgot` `{ email }` (`codeLimiter`) → **siempre `202 { challenge }`**. Correo con cuenta (también
    solo-Google o sin verificar): `issueChallenge(…, 'RESET_PASSWORD', { quiet: true })`. Sin cuenta: reto falso con
    `generateChallengeId()`, `emailHint(email)` y `resendAvailableAt` = ahora + 60 s, sin guardar nada.
  - `resend` de un id que no existe en la base → `204` (antes devolvía `410`): así un reto falso no se delata. (Un
    reto real vencido o consumido sigue dando `410`.)
  - `verify` con `RESET_PASSWORD`: `newPassword` obligatorio (`400 VALIDATION_ERROR` antes de gastar intento si
    falta); dentro de la transacción: nueva contraseña, `session_version + 1`, `email_verified = true`,
    `devices.removeAllOf(userId)`; responde `{ token, user }` con el `sv` nuevo. Suspendida: efecto aplicado y `403`.
  - `users.repository.ts`: `resetPassword(id, passwordHash): Promise<number>` (devuelve la `session_version` nueva).

- [ ] **Step 1: Write the failing tests (`auth-reset.test.ts`):**
  - flujo completo: forgot → código del correo → verify con `newPassword` → `{ token, user }`; la contraseña vieja da
    `401` y la nueva entra; el token de antes del cambio → `401` en `/auth/me`; los `push_devices` del usuario
    desaparecen;
  - cuenta sin verificar: tras el reset queda `emailVerified: true`;
  - **Review Focus 3:** correo inexistente → mismo estado `202`, mismas claves en `challenge`, ningún correo; verificar
    ese reto → `410`; reenviarlo → `204`; con Brevo fallando (`emails.fail(true)`) y con el límite diario agotado, el
    correo existente responde también `202 { challenge }` (comparar la forma con la de uno inexistente);
  - `verify` de `RESET_PASSWORD` sin `newPassword` → `400` y el intento no cuenta (el código bueno sigue valiendo).
- [ ] **Step 2: Run** `npx vitest run test/auth-reset.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** lo de **Interfaces** y `docs/api.md`.
- [ ] **Step 4: Run** `npm run typecheck` y `npx vitest run`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(backend): recuperar la contraseña con un código al correo`

### Task 4: Entrar con Google (backend)

**Files:**
- Modify: `backend/package.json` (`npm install google-auth-library -w backend` desde la raíz), `backend/src/app.ts`
  (`AppDeps.google?: GoogleVerifier`), `backend/src/index.ts`, `backend/src/auth/auth.routes.ts`,
  `backend/src/auth/auth.schemas.ts`, `backend/src/users/users.repository.ts`, `shared/index.d.ts`
  (`GoogleLoginInput`), `docs/api.md`
- Create: `backend/src/auth/google-verifier.ts`
- Test: nuevo `backend/test/auth-google.test.ts`, `backend/test/helpers.ts` (`fakeGoogle`)

**Interfaces:**
- Consumes: Tasks 1–2.
- Produces:
  - `google-verifier.ts`:
    ```ts
    export type GoogleIdentity = { sub: string; email: string; emailVerified: boolean; name: string };
    export interface GoogleVerifier { verify(idToken: string): Promise<GoogleIdentity | null> } // null = token inválido
    export function createGoogleVerifier(webClientId: string): GoogleVerifier; // OAuth2Client().verifyIdToken({ idToken, audience: webClientId })
    ```
    Cualquier excepción de `verifyIdToken` → `null`. `name` vacío → la parte del correo antes de la `@`.
  - `helpers.ts`: `fakeGoogle(identities: Record<string, GoogleIdentity>): GoogleVerifier` (token desconocido → `null`).
  - `index.ts`: `google: env.GOOGLE_WEB_CLIENT_ID ? createGoogleVerifier(env.GOOGLE_WEB_CLIENT_ID) : undefined`.
  - `POST /google` `{ idToken }` (`loginLimiter`): sin verificador → `503 GOOGLE_NOT_CONFIGURED`; `null` o
    `emailVerified: false` → `401 GOOGLE_TOKEN_INVALID`. Busca por `google_sub`; si no, por correo (en minúsculas) y
    vincula: `google_sub`, `email_verified = true`; si la cuenta **no estaba verificada**, además `password_hash = NULL`,
    `two_factor_enabled = false` y `name` = el de Google. Sin cuenta: la crea (nombre de Google, sin contraseña,
    verificada, `google_sub`). Suspendida → `403`. **Sin 2FA.** Responde `200 { token, user }`.
  - `users.repository.ts`: `findByGoogleSub(sub)`, `linkGoogle(id, sub, { wasVerified, googleName })`,
    `createFromGoogle({ name, email, sub, createdAt })` (el `UNIQUE` de `email`/`google_sub` en carrera → reintentar la
    búsqueda una vez).

- [ ] **Step 1: Write the failing tests (`auth-google.test.ts`):**
  - cuenta nueva → `200 { token, user }` con `hasGoogle: true, hasPassword: false, emailVerified: true`; segunda
    entrada con el mismo `sub` → la misma cuenta;
  - correo ya registrado y verificado → se vincula, conserva su contraseña (login con contraseña sigue entrando) y su
    2FA;
  - **Review Focus 4:** correo registrado sin verificar por otra persona → al entrar con Google la contraseña de ese
    registro deja de servir (`401`), `two_factor_enabled` queda `false` y el nombre es el de Google;
  - `emailVerified: false` o token desconocido → `401 GOOGLE_TOKEN_INVALID`; suspendida → `403`; sin `google` en
    `makeTestApp` → `503 GOOGLE_NOT_CONFIGURED`; cuenta con 2FA entra por Google sin reto;
  - login con contraseña de una cuenta solo-Google → `401 INVALID_CREDENTIALS`.
- [ ] **Step 2: Run** `npx vitest run test/auth-google.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** lo de **Interfaces**, `GOOGLE_WEB_CLIENT_ID` en `.env.example` (ya añadido en Task 1:
  comprobar el comentario) y `docs/api.md`.
- [ ] **Step 4: Run** `npm run typecheck` y `npx vitest run`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(backend): entrar con Google`

### Task 5: Verificación en dos pasos (backend)

**Files:**
- Modify: `backend/src/auth/auth.routes.ts`, `backend/src/auth/auth.schemas.ts`, `backend/src/users/users.repository.ts`,
  `shared/index.d.ts` (`PasswordInput`), `docs/api.md`
- Test: nuevo `backend/test/auth-2fa.test.ts`

**Interfaces:**
- Consumes: Tasks 1–4.
- Produces:
  - `POST /me/2fa/enable` `{ password }` (`requireAuth`): sin contraseña → `409 PASSWORD_REQUIRED`; incorrecta →
    `400 WRONG_PASSWORD`; si no → `issueChallenge(…, 'ENABLE_2FA')` y `200 { challenge }`.
  - `POST /me/2fa/disable` `{ password }` (`requireAuth`): mismos errores; correcta → `two_factor_enabled = false`,
    `204`.
  - `/login` con `two_factor_enabled` (y correo verificado) → `200 { challenge }` `LOGIN_2FA`.
  - `verify`: `LOGIN_2FA` → `{ token, user }`; `ENABLE_2FA` → exige un `Authorization: Bearer` válido (mismas reglas que
    `requireAuth`, incluido `sv`) **del mismo usuario del reto**, comprobado en `purposeCheck` antes de mirar el
    código: sin token o de otra persona → `410 CHALLENGE_EXPIRED` sin gastar intento; correcto →
    `two_factor_enabled = true` y `204`.
  - `users.repository.ts`: `setTwoFactor(id, enabled)`, `findPasswordHash(id)`.

- [ ] **Step 1: Write the failing tests (`auth-2fa.test.ts`):**
  - activar: contraseña mala → `400 WRONG_PASSWORD` (nunca `401`); buena → `{ challenge }`, verify con el JWT → `204` y
    `/auth/me` dice `twoFactorEnabled: true`;
  - **Review Focus 1:** con 2FA, login con contraseña buena → `{ challenge }` `LOGIN_2FA` **sin `token`**; verify con
    el código → `{ token, user }`; contraseña mala → `401` sin mandar correo;
  - verify de `ENABLE_2FA` sin JWT o con el JWT de otra cuenta → `410` y el código sigue valiendo para su dueño;
  - desactivar: mala → `400`, buena → `204` y el login vuelve a dar el token directo;
  - cuenta solo-Google: enable y disable → `409 PASSWORD_REQUIRED`.
- [ ] **Step 2: Run** `npx vitest run test/auth-2fa.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** lo de **Interfaces** y `docs/api.md`.
- [ ] **Step 4: Run** `npm run typecheck` y `npx vitest run`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(backend): verificación en dos pasos con un código al correo`

### Task 6: Pantalla del código, registro, login y «¿Olvidaste tu contraseña?» (app)

**Files:**
- Modify: `mobile/src/api/auth.ts`, `mobile/src/context/AuthContext.tsx`, `mobile/src/navigation/RootNavigator.tsx`,
  `mobile/src/navigation/types.ts`, `mobile/src/screens/auth/LoginScreen.tsx`, `mobile/src/screens/auth/RegisterScreen.tsx`,
  `mobile/src/storage/appStorage.ts` (`isCurrentUser` acepta perfiles guardados sin los 4 campos nuevos y los completa
  con `emailVerified: true, twoFactorEnabled: false, hasPassword: true, hasGoogle: false`)
- Create: `mobile/src/components/CodeInput.tsx` (exportado en `components/index.ts`),
  `mobile/src/hooks/useResendCountdown.ts`, `mobile/src/screens/auth/VerifyCodeScreen.tsx`,
  `mobile/src/screens/auth/ForgotPasswordScreen.tsx`
- Test: `mobile/src/context/__tests__/AuthContext.test.tsx`, `mobile/src/screens/auth/__tests__/LoginScreen.test.tsx`,
  `mobile/src/screens/auth/__tests__/RegisterScreen.test.tsx`, nuevos `VerifyCodeScreen.test.tsx`,
  `ForgotPasswordScreen.test.tsx`, `mobile/src/components/__tests__/CodeInput.test.tsx`,
  `mobile/src/storage/__tests__/appStorage.test.ts`

**Interfaces:**
- Consumes: Tasks 2–3 (contrato de `docs/api.md` y tipos de `shared`).
- Produces:
  - `api/auth.ts`: `loginRequest` y `registerRequest` devuelven `AuthResult`; `verifyChallengeRequest(id, code,
    newPassword?) → AuthResponse | null` (`null` con `204`); `resendChallengeRequest(id)`; `forgotPasswordRequest(email)
    → { challenge: Challenge }`; `isChallenge(r: AuthResult): r is { challenge: Challenge }`.
  - `AuthContext`: `login` y `register` devuelven `Promise<Challenge | null>` (`null` = ya hay sesión);
    `completeChallenge(id, code, newPassword?) → Promise<void>` (inicia sesión con la respuesta).
  - `AuthStackParamList = { Login: undefined; Register: undefined; ForgotPassword: { email?: string }; VerifyCode: {
    challenge: Challenge } }`.
  - `CodeInput` (`value`, `onChange`, `error?`, `autoFocus?`): un `TextInput` oculto con `keyboardType="number-pad"`,
    `maxLength={6}`, `textContentType="oneTimeCode"`, `autoComplete="sms-otp"` y 6 casillas visibles;
    `accessibilityLabel="Código de 6 dígitos"`.
  - `useResendCountdown(resendAvailableAt: string) → { secondsLeft: number; restart(nextIso: string) }`.
  - `VerifyCodeScreen`: «Escribe el código» + «Te enviamos un código a {emailHint}»; con `RESET_PASSWORD` añade
    «Contraseña nueva» y «Repite la contraseña» (`validatePassword` y coincidencia: «Las contraseñas no coinciden»);
    al completar 6 dígitos no envía solo: botón «Verificar». `CODE_INVALID` → mensaje del servidor en `ErrorBanner` y
    el campo se vacía; `CHALLENGE_EXPIRED` → mensaje y botón «Volver» (`navigation.goBack()`); «Reenviar código» con
    cuenta atrás («Reenviar en {s} s») → `resendChallengeRequest` y toast «Te enviamos un código nuevo.».
  - `LoginScreen`: si `login` devuelve un reto → `navigation.navigate('VerifyCode', { challenge })`; enlace
    «¿Olvidaste tu contraseña?» → `ForgotPassword` con el correo escrito. `RegisterScreen`: igual tras registrarse.
  - `ForgotPasswordScreen`: pide el correo (`validateEmail`) → `forgotPasswordRequest` → `VerifyCode`.

- [ ] **Step 1: Write the failing tests:** `AuthContext` (login con reto no inicia sesión ni guarda token;
  `completeChallenge` guarda el token en `tokenStorage` e inicia sesión); `LoginScreen` (reto → navega a `VerifyCode`
  con el reto; enlace de olvido navega con el correo); `RegisterScreen` (reto → `VerifyCode`); `VerifyCodeScreen`
  (verificar llama con el código; `CODE_INVALID` muestra el mensaje y vacía; `CHALLENGE_EXPIRED` muestra «Volver»;
  reenviar deshabilitado hasta que llega a 0 con temporizadores falsos; modo reset exige contraseñas iguales y las
  manda); `ForgotPasswordScreen`; `CodeInput` (solo dígitos, máximo 6); `appStorage` (perfil viejo sin los campos se
  carga completado).
- [ ] **Step 2: Run** `cd mobile && npx jest --maxWorkers=2 src/context src/screens/auth src/components/__tests__/CodeInput.test.tsx src/storage`.
  Expected: FAIL.
- [ ] **Step 3: Implement** lo de **Interfaces**.
- [ ] **Step 4: Run** `npm run typecheck` y `npx jest --maxWorkers=2`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(mobile): código por correo al registrarse, al entrar y para recuperar la contraseña`

### Task 7: Continuar con Google y verificación en dos pasos en Perfil (app)

**Files:**
- Modify: `mobile/package.json` (`cd mobile && npx expo install @react-native-google-signin/google-signin`),
  `mobile/app.json` (plugin `@react-native-google-signin/google-signin` y `extra.googleWebClientId: ""`),
  `mobile/src/api/auth.ts` (`googleRequest(idToken)`, `enable2faRequest(password)`, `disable2faRequest(password)`),
  `mobile/src/context/AuthContext.tsx` (`loginWithGoogle`, `logout` cierra Google), `mobile/src/screens/auth/LoginScreen.tsx`,
  `mobile/src/screens/auth/RegisterScreen.tsx`, `mobile/src/screens/profile/ProfileScreen.tsx`,
  `mobile/src/navigation/RootNavigator.tsx` y `types.ts` (pantalla `EnableTwoFactor` en `AppStack`), mock de Jest de la
  librería (`mobile/__mocks__/@react-native-google-signin/google-signin.ts` o `jest.mock` en el setup existente)
- Create: `mobile/src/auth/googleSignIn.ts`, `mobile/src/components/GoogleButton.tsx`,
  `mobile/src/screens/profile/EnableTwoFactorScreen.tsx`
- Test: `LoginScreen.test.tsx`, `RegisterScreen.test.tsx`, `AuthContext.test.tsx`, nuevos
  `mobile/src/auth/__tests__/googleSignIn.test.ts`, `mobile/src/screens/profile/__tests__/EnableTwoFactorScreen.test.tsx`,
  `mobile/src/screens/profile/__tests__/ProfileScreen.test.tsx`

**Interfaces:**
- Consumes: Tasks 4–6.
- Produces:
  - `googleSignIn.ts`: `isGoogleSignInAvailable(): boolean` (falso en Expo Go —
    `Constants.executionEnvironment === 'storeClient'`, reutiliza `isExpoGo` de `notifications/registration.ts`— o sin
    `Constants.expoConfig?.extra?.googleWebClientId`); `getGoogleIdToken(): Promise<string | null>` — `require` perezoso
    de la librería (no se carga en Expo Go), `GoogleSignin.configure({ webClientId })` una vez,
    `hasPlayServices({ showPlayServicesUpdateDialog: true })`, `signIn()`: `isCancelledResponse` → `null`;
    `isSuccessResponse` → `response.data.idToken` (sin `idToken` → error «Google no devolvió la cuenta. Inténtalo de
    nuevo.»); `statusCodes.IN_PROGRESS` → `null`; `PLAY_SERVICES_NOT_AVAILABLE` → error «Actualiza Google Play Services
    para continuar con Google.»; `signOutGoogle(): Promise<void>` (no falla nunca, no hace nada si no está disponible).
  - `AuthContext`: `loginWithGoogle(): Promise<boolean>` (`false` si se canceló; sin error visible) → `googleRequest` →
    `startSession`. `logout` llama a `signOutGoogle()` sin esperar a que termine bien.
  - `GoogleButton` («Continuar con Google», ícono de Google de `@expo/vector-icons`): no se renderiza si
    `!isGoogleSignInAvailable()`; en Login y Registro bajo el botón principal con un separador «o».
  - `ProfileScreen`: interruptor «Verificación en dos pasos» con `user.twoFactorEnabled`; deshabilitado y con el texto
    de Global Constraints si `!user.hasPassword`. Activar → pide la contraseña (`AppDialog` con `TextField` seguro) →
    `enable2faRequest` → `navigation.navigate('EnableTwoFactor', { challenge })`. Desactivar → pide la contraseña →
    `disable2faRequest` → refresca el usuario (`meRequest`) y toast «Verificación en dos pasos desactivada.».
    `WRONG_PASSWORD` → mensaje en el diálogo.
  - `EnableTwoFactorScreen`: reutiliza `CodeInput` y `useResendCountdown`; verify (`204`) → refresca el usuario, toast
    «Verificación en dos pasos activada.» y `goBack()`. El `AuthContext` expone `refreshUser(): Promise<void>` para
    esto.
  - `app.json`: plugin sin opciones; si `npx expo config --type prebuild` falla pidiendo `iosUrlScheme`, añade
    `{ "iosUrlScheme": "com.googleusercontent.apps.hueckoapp-ios-sin-configurar" }` (iOS no se compila) y anótalo en
    la guía de la Task 8.

- [ ] **Step 1: Write the failing tests:** `googleSignIn` (Expo Go → no disponible; sin `webClientId` → no disponible;
  cancelado → `null`; éxito → `idToken`; Play Services → error con el texto); `LoginScreen`/`RegisterScreen` (botón
  visible solo si disponible; tocarlo llama a `loginWithGoogle`; cancelar no muestra error); `AuthContext` (logout
  llama a `signOutGoogle`; `loginWithGoogle` inicia sesión); `ProfileScreen` (interruptor según `twoFactorEnabled`;
  deshabilitado sin contraseña con el texto; activar con contraseña mala muestra el error y no navega; buena navega a
  `EnableTwoFactor`; desactivar refresca); `EnableTwoFactorScreen` (verify → toast y `goBack`).
- [ ] **Step 2: Run** `cd mobile && npx jest --maxWorkers=2 src/auth src/screens/auth src/screens/profile src/context`.
  Expected: FAIL.
- [ ] **Step 3: Implement** lo de **Interfaces**; `npx expo config --type prebuild` sin errores.
- [ ] **Step 4: Run** `npm run typecheck`, `npx jest --maxWorkers=2` y `npx expo-doctor` (dentro de `mobile/`; anota
  cualquier aviso nuevo, no lo arregles si no es de esta fase). Expected: PASS.
- [ ] **Step 5: Commit** `feat(mobile): continuar con Google y verificación en dos pasos en Perfil`

### Task 8: Guía única de puesta en marcha y documentación

**Files:**
- Create: `docs/puesta-en-marcha.md`
- Modify: `README.md` (funciones de cuentas, totales de tests, enlace a la guía), `docs/guia-de-pruebas.md` (pruebas
  de la fase 6), `render.yaml` (`BREVO_API_KEY` y `GOOGLE_WEB_CLIENT_ID` con `sync: false`, `BREVO_SENDER_EMAIL`
  `sync: false`, `BREVO_SENDER_NAME` `value: HueckoApp`), `docs/despliegue.md` (enlace a la guía, sin duplicar),
  `backend/.env.example` (revisar)
- Delete: `docs/superpowers/handoff/` (commit propio)

**Interfaces:**
- Consumes: todo lo anterior y la memoria del proyecto (pendientes de las fases 1–5).
- Produces — `docs/puesta-en-marcha.md`, en este orden, con pasos numerados y casillas `- [ ]`:
  1. **Firebase (push):** proyecto, app Android con el paquete de `app.json`, `google-services.json` en `mobile/` y
     `android.googleServicesFile` en `app.json`, clave de cuenta de servicio FCM V1 subida con `eas credentials`
     (enlaza a la sección de `docs/despliegue.md`).
  2. **Google Cloud (Google Sign-In):** pantalla de consentimiento; cliente OAuth **Android** con el paquete y el SHA-1
     de `eas credentials -p android` (el del keystore de EAS, no uno local); cliente OAuth **Web** → su ID va a
     `GOOGLE_WEB_CLIENT_ID` (Render y `backend/.env`) y a `mobile/app.json` → `extra.googleWebClientId`. Si se usa el
     mismo proyecto de Firebase, los clientes pueden salir de ahí.
  3. **Brevo:** cuenta gratis (300 correos/día), remitente verificado, clave API → `BREVO_API_KEY`,
     `BREVO_SENDER_EMAIL`, `BREVO_SENDER_NAME` en Render.
  4. **Variables de Render y de GitHub:** tabla completa (las de `render.yaml`, con `CRON_SECRET`), secreto
     `CRON_SECRET` y variable `API_URL` en GitHub para el despertador.
  5. **Consultas de control en Neon antes de desplegar** (todas deben dar lo indicado), con el texto exacto:
     - Fase 1 (antes de la migración 7, debe dar 0 filas):
       `SELECT p.id, p.scheduled_date, w.day_of_week FROM proposals p JOIN proposal_windows w ON w.id = p.chosen_window_id WHERE p.scheduled_date IS NOT NULL AND EXTRACT(ISODOW FROM p.scheduled_date::date) <> w.day_of_week;`
     - Fase 2: `SELECT conname FROM pg_constraint WHERE conrelid='ai_calls'::regclass AND contype='c';` → `ai_calls_task_check`.
     - Fase 3: `SELECT conname FROM pg_constraint WHERE conrelid='group_members'::regclass AND contype='c';` → `group_members_role_check`.
     - Fase 4: `SELECT conname FROM pg_constraint WHERE conrelid='votes'::regclass AND contype='p';` → `votes_pkey`.
     - Fase 6: ninguna previa; después de desplegar, `SELECT count(*) FROM users WHERE NOT email_verified;` → `0` (nadie
       quedó bloqueado).
  6. **Orden de integración:** PRs #43 → #44 → #45 → #46 → #47 → #48 → #49 → #50 (esta fase), cada uno a `develop`
     cuando el anterior entra (GitHub cambia la base al borrar la rama); luego `release/3.0.0` → `main` con tag
     `v3.0.0`; cambiar en Render la rama del servicio a `main`; borrar la rama remota `wip/votacion-expres-task3`.
  7. **Desplegar el backend antes del APK** (el APK nuevo no funciona con el backend viejo); tras desplegar, llamar
     una vez `GET /api/admin/stats` con una cuenta admin (cierra votaciones atrasadas).
  8. **APK:** `eas build -p android --profile preview` (Google Sign-In y proximidad no funcionan en Expo Go).
  9. **Prueba en dos celulares:** lista por función (proximidad, franjas con fecha, votación exprés, organizadores,
     cierre automático y voto múltiple, push con la app cerrada, registro con código, login con 2FA, recuperar
     contraseña, Google), cada una con el resultado esperado; enlaza a `docs/guia-de-pruebas.md` en vez de repetir
     pasos que ya estén allí.
- README: sección de funciones con cuentas; requisitos de la tercera entrega al día (Volley/TanStack Query, proximidad
  y giroscopio pasan a ✅ «en PR #43/#44» o el estado real), totales de tests reales tras `npm test`.

- [ ] **Step 1:** Escribe `docs/puesta-en-marcha.md` y los cambios de README, guía de pruebas, `render.yaml` y
  `docs/despliegue.md`.
- [ ] **Step 2: Run** `npm run typecheck` y `npm test` (mobile con `--maxWorkers=2` si la suite completa falla por
  memoria) y pon los totales en el README.
- [ ] **Step 3: Commit** `docs: guía única de puesta en marcha antes del APK`
- [ ] **Step 4:** `git rm -r docs/superpowers/handoff` y commit `docs: quitar el traspaso entre ordenadores`.
