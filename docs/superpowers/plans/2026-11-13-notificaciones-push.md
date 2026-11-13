# Notificaciones push — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Seis avisos push (nueva propuesta, confirmado, cancelado, ausencia crítica, resultado exprés, recordatorio
1 h antes) llegan al celular aunque la app esté cerrada, sin perderse ni duplicarse, y cada persona puede apagarlos.

**Architecture:** Bandeja de salida `notifications` escrita en la misma transacción que cada cambio de estado; un envío
(`flushNotifications`) reclama filas, llama a la Expo Push API y las marca. Lo dispara cada petición (en segundo plano)
y un barrido (`tick`) cada minuto en `index.ts`, que además cierra lo vencido y encola recordatorios; GitHub Actions lo
despierta cada 10 min por `POST /api/internal/tick`. La app registra su token Expo, lo borra al salir, y navega al tocar.

**Tech Stack:** Express 5 + zod + `ApiError`, Postgres (Neon / PGlite) detrás de `Db`, Vitest + Supertest; Expo SDK 57
(`expo-notifications`), React Navigation, TanStack Query, Jest + Testing Library; GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-11-13-notificaciones-push-design.md`

## Global Constraints

- Rama `feature/notificaciones-push` (sale de `feature/horario-y-votacion`). Commits convencionales en español con el
  ámbito correcto (`feat(backend)`, `feat(mobile)`, `docs`, `ci`); el cuerpo termina con una línea en blanco y
  `Co-Authored-By: <modelo> <noreply@anthropic.com>`. Sin push.
- Migración nueva al final de `backend/src/db/migrations.ts` (la 12); nunca se edita una publicada.
- `shared/index.d.ts` y `docs/api.md` cambian en el mismo commit que el endpoint.
- Errores con `ApiError`; validación con zod; SQL parametrizado (`$1`).
- `app.ts` no arranca temporizadores; el barrido vive en `index.ts`.
- `kind` exactos: `NEW_PROPOSAL | PLAN_CONFIRMED | PLAN_CANCELLED | EXPRESS_OPENED | EXPRESS_RESULT | REMINDER`.
  `data` = `{ kind, proposalId, groupId, screen }` con `screen` `VOTING` (solo `NEW_PROPOSAL`) o `PLAN`.
- Textos exactos (título = nombre del grupo; cuerpo):
  - `NEW_PROPOSAL`: «{nombre} propuso «{plan}». Vota tus franjas.»
  - `PLAN_CONFIRMED`: ««{plan}» se confirmó para el {cuándo}.» con `{cuándo}` = «jueves 16 de octubre, 16:00» en
    `America/Lima`.
  - `PLAN_CANCELLED`: ««{plan}» se canceló.»; sin votos: ««{plan}» se canceló: nadie votó antes del plazo.»
  - `EXPRESS_OPENED`: «{nombre} no podrá ir a «{plan}» ({razón crítica}). Vota qué hacer.»
  - `EXPRESS_RESULT`: «El grupo decidió {mantener|reagendar|cancelar} «{plan}».»; sin quórum: «Sin quórum: «{plan}» se
    mantiene.»
  - `REMINDER`: ««{plan}» empieza a las {HH:mm} en {lugar}.» o, sin lugar, ««{plan}» empieza a las {HH:mm}.»
- Destinatarios = miembros actuales del grupo; quien actúa a mano no recibe su propio aviso; el admin no se excluye.
  Votación exprés `CANCELAR` → solo `EXPRESS_RESULT`. Moderar (admin) una propuesta ya cancelada sola → ningún aviso.
- Recordatorio: planes `CONFIRMADO` con `scheduled_at` en `(now, now + 60 min]`; destinatarios sin incidencia
  `FALTA`/`IMPREVISTO` en ese plan; `dedupe_key = reminder:{proposalId}:{userId}:{scheduledAt}`.
- Envío: lotes de ≤ 100 mensajes, `channelId: 'planes'`, `priority: 'high'`, `sound: 'default'`; 5 intentos máximo;
  `DeviceNotRegistered` borra el token; reclamo de más de 5 min se reintenta; nunca se mantiene un bloqueo durante la
  llamada HTTP.
- Ningún secreto en el repo ni en la app: `CRON_SECRET` (≥ 32 caracteres) y `EXPO_ACCESS_TOKEN` solo en `backend/.env` y
  Render (`render.yaml` sin valor); la clave de la cuenta de servicio de Firebase solo en EAS. `google-services.json` sí
  puede ir al repo, pero `app.json` no lo referencia hasta que el archivo exista.
- Textos de la app exactos: interruptor «Notificaciones en este celular»; denegado: «Activa las notificaciones de
  HueckoApp en los ajustes del teléfono» + botón «Abrir ajustes»; en Expo Go: «Disponible en la app instalada (APK)».
- Antes de cada commit: `npm run typecheck` (raíz) y los tests de los workspaces tocados (backend `npx vitest run` desde
  `C:/…` con la C mayúscula; mobile `npx jest --maxWorkers=2`). Node 22:
  `export PATH="/c/Users/User/AppData/Roaming/fnm/node-versions/v22.23.5/installation:$PATH"`.

## Review Focus

1. **Nada se envía dos veces:** dos `flushNotifications` a la vez no reclaman la misma fila (`SKIP LOCKED` + `claimed_at`);
   dos barridos no encolan dos recordatorios (`dedupe_key`). Tests en Tasks 3 y 4.
2. **Nada se pierde:** el aviso se escribe en la transacción del cambio (si el cambio se deshace, no queda; si se guarda,
   queda pendiente aunque el envío falle). Tests en Task 2 y 3.
3. **Destinatarios:** sin quien actúa, solo miembros actuales. Tests en Task 2.
4. **Sesión:** cerrar sesión borra el token del servidor antes de olvidar el JWT. Test en Task 5.

---

### Task 1: Dispositivos (migración 12 + `/me/push-devices`)

**Files:**
- Modify: `backend/src/db/migrations.ts` (migración 12), `backend/src/app.ts` (montar el router), `shared/index.d.ts`
  (`PushDeviceInput`, `NotificationKind`, `NotificationData`), `docs/api.md` (§Notificaciones: rutas de dispositivos)
- Create: `backend/src/notifications/devices.repository.ts`, `backend/src/notifications/push-devices.routes.ts`,
  `backend/src/notifications/notifications.schemas.ts`
- Test: `backend/test/migrations.test.ts`, nuevo `backend/test/push-devices.test.ts`

**Interfaces:**
- Produces:
  - Migración 12 = el SQL de la spec §Datos (incluida la columna `claimed_at TEXT COLLATE "C"`), una sola cadena del
    array, con comentario «12 — Notificaciones push: celulares registrados y bandeja de salida de avisos.».
  - `shared`: `type NotificationKind = 'NEW_PROPOSAL' | 'PLAN_CONFIRMED' | 'PLAN_CANCELLED' | 'EXPRESS_OPENED' |
    'EXPRESS_RESULT' | 'REMINDER'`; `type NotificationData = { kind: NotificationKind; proposalId: string; groupId:
    string; screen: 'VOTING' | 'PLAN' }`; `type PushDeviceInput = { token: string }`.
  - `devicesRepository(db)`:
    - `upsert(userId: string, token: string, now: Date): Promise<void>` — `INSERT … ON CONFLICT (token) DO UPDATE SET
      user_id = EXCLUDED.user_id, last_seen_at = EXCLUDED.last_seen_at`;
    - `remove(userId: string, token: string): Promise<void>` — solo si es mío;
    - `removeToken(token: string): Promise<void>` — para `DeviceNotRegistered` (Task 3);
    - `tokensOf(userIds: readonly string[]): Promise<Map<string, string[]>>` — `ANY($1::text[])`.
  - `pushDeviceInputSchema = z.object({ token: z.string().trim().regex(/^Expo(nent)?PushToken\[.+\]$/, 'Token de
    notificaciones inválido') })`.
  - Rutas (montadas en `/api/me/push-devices`, detrás de `auth`, ANTES de `api.use('/me', auth, meRouter(deps))`):
    `PUT /` → `204`; `DELETE /:token` → `204` siempre.

- [ ] **Step 1: Write the failing tests:** migración 12 desde la versión 11 (tablas, CHECK de `kind` rechaza
  `'OTRO'`, `dedupe_key` única, borrar un usuario borra sus dispositivos y avisos); `PUT` registra (`204`) y repetirlo
  actualiza `last_seen_at`; el mismo token desde otra cuenta pasa a ella; `ExponentPushToken[abc]` y `ExpoPushToken[abc]`
  valen, `"abc"` → `400 VALIDATION_ERROR`; sin JWT → `401`; `DELETE` del mío → borrado, de uno ajeno → `204` sin
  borrarlo, inexistente → `204`.
- [ ] **Step 2: Run** `cd C:/Users/User/Desktop/HueckoApp-Android/backend && npx vitest run test/migrations.test.ts
  test/push-devices.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** lo de **Interfaces** y `docs/api.md` (§Notificaciones con las dos rutas y el formato del
  token).
- [ ] **Step 4: Run** `npm run typecheck` y `npx vitest run`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(backend): registrar los celulares para notificaciones push`

### Task 2: Bandeja de salida (encolar avisos en cada cambio)

**Files:**
- Create: `backend/src/notifications/messages.ts`, `backend/src/notifications/outbox.repository.ts`,
  `backend/src/notifications/audience.ts`
- Modify: `backend/src/proposals/proposals.repository.ts` (`create`, `confirm`, `cancel`, `reportIncidence`),
  `backend/src/proposals/voting-close.ts` (`closeProposalIfDue`), `backend/src/proposals/express-votes.repository.ts`
  (`closeDue`), `backend/src/proposals/proposals.routes.ts` y `backend/src/admin/admin-groups.ts` (pasar quién actúa),
  `docs/api.md` (§Notificaciones: tabla de avisos, destinatarios y textos)
- Test: nuevo `backend/test/notifications-outbox.test.ts`, nuevo `backend/test/notification-messages.test.ts`

**Interfaces:**
- Consumes: Task 1 (tabla `notifications`, tipos de `shared`).
- Produces:
  - `messages.ts` (puro): `type PlanInfo = { proposalId: string; groupId: string; groupName: string; title: string;
    scheduledAt: string | null; locationName: string | null }` y una función por aviso que devuelve `{ title, body,
    data }`: `newProposalMessage(plan, creatorName)`, `planConfirmedMessage(plan)`, `planCancelledMessage(plan, { noVotes
    })`, `expressOpenedMessage(plan, reporterName, criticalReason)`, `expressResultMessage(plan, result:
    ExpressOption, byDefault: boolean)`, `reminderMessage(plan)`. `{cuándo}` con `Intl.DateTimeFormat('es-PE', {
    timeZone: 'America/Lima', weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
    hourCycle: 'h23' })` ajustado para producir exactamente «jueves 16 de octubre, 16:00» (testear el texto).
  - `audience.ts`: `planInfo(db, proposalId): Promise<PlanInfo>` (una consulta con el grupo) y
    `groupMemberIds(db, groupId, { except?: string | null }): Promise<string[]>`.
  - `outbox.repository.ts`: `enqueue(db, items: { userId: string; kind: NotificationKind; title: string; body: string;
    data: NotificationData; dedupeKey?: string }[], now: Date): Promise<number>` — un `INSERT` por fila (o uno
    multi-fila) con `ON CONFLICT (dedupe_key) DO NOTHING`; devuelve las insertadas.
  - Se llama **dentro de la transacción ya existente** de cada cambio (si el cambio no tiene una, se envuelve en
    `db.transaction`):
    - `proposals.create(input)` → `NEW_PROPOSAL` a los miembros menos `createdBy`;
    - `proposals.confirm(id, windowId, scheduledAt, scheduledDate, now, actorId: string)` → `PLAN_CONFIRMED` menos
      `actorId`, solo si confirmó;
    - `proposals.cancel(id, actorId: string | null, now: Date)` → en una transacción; `PLAN_CANCELLED` (sin votos:
      `false`) menos `actorId` (admin: `null`), solo si canceló; `clearAutoCancelled` no encola;
    - `closeProposalIfDue` → `PLAN_CONFIRMED` o `PLAN_CANCELLED` con `noVotes: true` a todos, solo si cerró;
    - `reportIncidence` → si abrió votación, `EXPRESS_OPENED` a `voterIds` (nombre de quien avisó, `criticalReason`);
    - express `closeDue` → `EXPRESS_RESULT` (con `result`, `byDefault`) a todos los miembros, solo si cerró.
  - Firmas cambiadas: actualiza todos los llamadores (rutas, admin, seed `demo-data.ts`, tests).

- [ ] **Step 1: Write the failing tests:**
  - `notification-messages.test.ts`: los seis textos exactos de Global Constraints, incluido `{cuándo}` para
    `2026-10-16T21:00:00.000Z` = «jueves 16 de octubre, 16:00», recordatorio con y sin lugar, exprés sin quórum.
  - `notifications-outbox.test.ts` (HTTP, leer la tabla `notifications`):
    - crear propuesta → una fila `NEW_PROPOSAL` por miembro salvo quien la creó, `data.screen = 'VOTING'`;
    - confirmar a mano → `PLAN_CONFIRMED` a todos menos quien confirmó; cancelar a mano → `PLAN_CANCELLED` menos quien
      canceló; cancelar desde el admin → a todos; moderar una cancelada sola → ninguna fila nueva;
    - cierre automático con votos → `PLAN_CONFIRMED` a todos; sin votos → `PLAN_CANCELLED` «…nadie votó antes del
      plazo.»;
    - ausencia crítica → `EXPRESS_OPENED` a los votantes (no a quien avisó); cierre de la exprés → `EXPRESS_RESULT` a
      todos; resultado `CANCELAR` → solo `EXPRESS_RESULT`, ningún `PLAN_CANCELLED`;
    - quien salió del grupo antes del cambio no recibe;
    - **Review Focus 2:** un `confirm` que devuelve `false` (con `interleave` cancelando el plan justo antes de su
      `UPDATE`) no deja ninguna fila `PLAN_CONFIRMED`; y un `enqueue` que falla dentro de `create` deshace la
      propuesta (fuerza el fallo, p. ej. `interleave` que haga fallar el `INSERT INTO notifications`, o un espía sobre
      `db.query`).
- [ ] **Step 2: Run** `npx vitest run test/notification-messages.test.ts test/notifications-outbox.test.ts`. Expected:
  FAIL.
- [ ] **Step 3: Implement** lo de **Interfaces** y `docs/api.md` (tabla de avisos de la spec).
- [ ] **Step 4: Run** `npm run typecheck` y `npx vitest run`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(backend): guardar los avisos en la misma transacción que cada cambio`

### Task 3: Envío a la Expo Push API

**Files:**
- Create: `backend/src/notifications/push-client.ts`, `backend/src/notifications/flush.ts`,
  `backend/src/notifications/flush-scheduler.ts`
- Modify: `backend/src/app.ts` (`AppDeps.push?: PushClient`; middleware que pide un envío al terminar cada petición
  a `/api` si hay cliente), `backend/test/helpers.ts` (`fakePush()`)
- Test: nuevo `backend/test/notifications-flush.test.ts`, nuevo `backend/test/push-client.test.ts`

**Interfaces:**
- Consumes: Task 1 (`devicesRepository.tokensOf`, `removeToken`), Task 2 (filas pendientes).
- Produces:

```ts
// push-client.ts
export type PushMessage = { to: string; title: string; body: string; data: NotificationData;
  channelId: 'planes'; priority: 'high'; sound: 'default' };
export type PushTicket = { status: 'ok'; id: string } | { status: 'error'; message: string;
  details?: { error?: string } };
export class PushTransportError extends Error {} // red, 429 o 5xx: se reintenta
export interface PushClient { send(messages: PushMessage[]): Promise<PushTicket[]> } // ≤ 100 por llamada
export function createExpoPushClient(o: { accessToken?: string; fetchImpl?: typeof fetch; timeoutMs?: number }): PushClient;

// flush.ts
export function flushNotifications(db: Db, push: PushClient, now: Date): Promise<{ sent: number; failed: number }>;

// flush-scheduler.ts — como mucho un envío en curso y uno pendiente; nunca lanza.
export function createFlushScheduler(o: { db: Db; push: PushClient; now: () => Date;
  onBackgroundTask?: (task: Promise<void>) => void }): { kick(): void };
```

  - `createExpoPushClient`: `POST https://exp.host/--/api/v2/push/send` con `accept`, `accept-encoding: gzip,
    deflate`, `content-type: application/json` y, si hay token, `Authorization: Bearer …`; parte en lotes de 100;
    devuelve los tickets en el mismo orden; red/timeout/429/5xx → `PushTransportError`; 400 → tickets de error para
    todo el lote (no se reintenta).
  - `flushNotifications`: en `db.transaction`: `SELECT id, user_id, title, body, data, attempts FROM notifications
    WHERE sent_at IS NULL AND (claimed_at IS NULL OR claimed_at < $1) ORDER BY seq LIMIT 100 FOR UPDATE SKIP LOCKED`
    (`$1` = now − 5 min) + `UPDATE … SET claimed_at = now WHERE id = ANY(…)`; fuera de la transacción: tokens de esos
    usuarios; sin tokens → `sent_at = now`; con tokens → un `PushMessage` por token, `push.send` en lotes ≤ 100; por
    aviso: algún ticket `ok` → `sent_at`; `PushTransportError` → `attempts + 1`, `last_error`, `claimed_at = NULL`
    (si llega a 5 → también `sent_at`); tickets con `details.error === 'DeviceNotRegistered'` → `removeToken`. Nunca
    lanza (errores al log, silencioso en `NODE_ENV=test`).
  - `app.ts`: si `appDeps.push`, `const flusher = createFlushScheduler(...)` y un middleware en `api` que hace
    `res.on('finish', () => flusher.kick())`. Sin `push` no se añade nada.
  - `helpers.ts`: `fakePush(behaviour?)` que guarda los mensajes recibidos y permite responder tickets `ok`, error
    `DeviceNotRegistered` o lanzar `PushTransportError`.

- [ ] **Step 1: Write the failing tests:**
  - `push-client.test.ts` con `fetchImpl` falso: lote de 150 → dos peticiones (100 + 50) y 150 tickets en orden;
    cabecera `Authorization` solo con token; 503 y error de red → `PushTransportError`; 400 → tickets de error.
  - `notifications-flush.test.ts`: un aviso a alguien con dos celulares → dos mensajes, `sent_at` puesto; sin celulares
    → `sent_at` sin mensajes; `PushTransportError` → `attempts` 1, `claimed_at` NULL, sigue pendiente; quinto fallo →
    abandonado (`sent_at` + `last_error`); `DeviceNotRegistered` → token borrado; reclamo viejo (> 5 min) se reintenta y
    uno reciente no; 250 pendientes → tres pasadas de flush los envían todos sin repetir;
    **Review Focus 1:** `interleave` antes del `SELECT … FOR UPDATE SKIP LOCKED` del primer flush marca esas filas como
    reclamadas por otro (`UPDATE notifications SET claimed_at = now`) → el primer flush no las envía; y dos flush
    seguidos sobre lo mismo envían cada aviso una sola vez;
  - con `makeTestApp({ push: fakePush() })`: crear una propuesta → tras la respuesta (esperar la tarea con
    `onBackgroundTask`) el cliente falso recibió el `NEW_PROPOSAL`.
- [ ] **Step 2: Run** `npx vitest run test/push-client.test.ts test/notifications-flush.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** lo de **Interfaces**.
- [ ] **Step 4: Run** `npm run typecheck` y `npx vitest run`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(backend): enviar los avisos pendientes por la Expo Push API`

### Task 4: Barrido, recordatorios y despertador

**Files:**
- Create: `backend/src/notifications/reminders.ts`, `backend/src/notifications/tick.ts`,
  `backend/src/notifications/internal.routes.ts`, `.github/workflows/despertador.yml`
- Modify: `backend/src/proposals/express-votes.repository.ts` (`closeDueInScope` acepta `{ all: true }`),
  `backend/src/config/env-schema.ts` (`CRON_SECRET`, `EXPO_ACCESS_TOKEN`), `backend/src/app.ts` (`cronSecret?`, montar
  `/internal` sin `auth`), `backend/src/index.ts` (cliente Expo, `setInterval` del barrido, parar al apagar),
  `backend/.env.example`, `render.yaml`, `docs/api.md` (§Internal), `docs/despliegue.md` (Render: `CRON_SECRET`;
  GitHub: secreto `CRON_SECRET` y variable `API_URL`)
- Test: nuevo `backend/test/notifications-tick.test.ts`, `backend/test/env-schema.test.ts`

**Interfaces:**
- Consumes: Tasks 2–3 (`enqueue`, `reminderMessage`, `flushNotifications`), `closeDueProposals(db, { all: true }, now)`.
- Produces:
  - `enqueueDueReminders(db, now): Promise<number>` — planes `CONFIRMADO` con `scheduled_at > now` y `<= now + 60 min`;
    por miembro actual sin incidencia `FALTA`/`IMPREVISTO` en el plan: `REMINDER` con `dedupeKey`
    `reminder:{proposalId}:{userId}:{scheduledAt}`.
  - `tick(db, push, now): Promise<{ closed: number; reminders: number; sent: number }>` — cierra propuestas y exprés
    vencidas de todos los grupos, encola recordatorios, envía; nunca lanza.
  - `POST /api/internal/tick`: montada solo si `cronSecret`; compara `Authorization: Bearer …` con
    `crypto.timingSafeEqual` (longitudes distintas → `401`); `401 UNAUTHORIZED` «No autorizado.»; `200 { closed,
    reminders, sent }`. Usa el `push` de las deps (o el noop si no hay).
  - `env-schema`: `CRON_SECRET: z.string().trim().min(32, 'CRON_SECRET debe tener al menos 32 caracteres').optional()`
    (cadena vacía = sin configurar), `EXPO_ACCESS_TOKEN: z.string().trim().optional()`.
  - `index.ts`: `const push = createExpoPushClient({ accessToken: env.EXPO_ACCESS_TOKEN })`; se pasa a `createApp`;
    `const timer = setInterval(() => void tick(db, push, new Date()), 60_000); timer.unref()`; `clearInterval` en
    `shutdown`.
  - Workflow: `on: schedule: [{ cron: '*/10 * * * *' }]` + `workflow_dispatch`; un job que, si `vars.API_URL` y
    `secrets.CRON_SECRET` existen, hace `curl -fsS -X POST "$API_URL/api/internal/tick" -H "Authorization: Bearer
    $CRON_SECRET"` (los dos vía `env:`), y si falta alguno imprime un aviso y termina en éxito.

- [ ] **Step 1: Write the failing tests:**
  - recordatorio: plan confirmado que empieza en 30 min → `REMINDER` a cada miembro; dos `tick` seguidos → una sola fila
    por persona; quien reportó `FALTA` no recibe (con `TARDANZA` sí); plan que empieza en 61 min → nada; ya empezado →
    nada; replanteado y reconfirmado para otra hora → otro recordatorio;
  - `tick` de punta a punta con `fakePush`: propuesta vencida con votos → se cierra y el cliente recibe
    `PLAN_CONFIRMED`; votación exprés vencida → `EXPRESS_RESULT`;
  - `/internal/tick`: sin `cronSecret` → `404`; con secreto y cabecera incorrecta o ausente → `401`; correcta → `200`
    con los conteos;
  - `env-schema`: `CRON_SECRET` corto → error; vacío → sin configurar.
- [ ] **Step 2: Run** `npx vitest run test/notifications-tick.test.ts test/env-schema.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** lo de **Interfaces**, `.env.example`/`render.yaml` (sin valores), `docs/api.md` y
  `docs/despliegue.md`.
- [ ] **Step 4: Run** `npm run typecheck` y `npx vitest run`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(backend): barrido cada minuto con recordatorios y despertador de GitHub Actions`

### Task 5: Registrar el celular y el interruptor de Perfil (app)

**Files:**
- Modify: `mobile/package.json` (vía `npx expo install expo-notifications` dentro de `mobile/`), `mobile/app.json`
  (plugin), `mobile/src/api/` (nuevo `notifications.ts`: `registerPushDevice`, `unregisterPushDevice`),
  `mobile/src/storage/appStorage.ts` (`pushTokenStorage`, `notificationsPreference`), `mobile/src/context/AuthContext.tsx`,
  `mobile/src/screens/profile/ProfileScreen.tsx`, mocks de Jest si el proyecto los centraliza
- Create: `mobile/src/notifications/registration.ts`
- Test: `mobile/src/notifications/__tests__/registration.test.ts`, `mobile/src/context/__tests__/`,
  `mobile/src/screens/profile/__tests__/`, `mobile/src/api/__tests__/endpoints.test.ts`

**Interfaces:**
- Consumes: Task 1 (`PUT /me/push-devices`, `DELETE /me/push-devices/:token`).
- Produces:
  - `app.json` plugins: `["expo-notifications", { "icon": "./assets/android-icon-monochrome.png", "color": "#6750A4"
    }]`. **No** añadir `android.googleServicesFile` (no existe el archivo todavía).
  - `registerDevice(): Promise<'registered' | 'denied' | 'unavailable'>` — Expo Go
    (`Constants.executionEnvironment === 'storeClient'`) → `'unavailable'`; `setNotificationChannelAsync('planes', {
    name: 'Planes', importance: AndroidImportance.HIGH })` antes de pedir permiso; `getPermissionsAsync` /
    `requestPermissionsAsync`; sin permiso → `'denied'`; `getExpoPushTokenAsync({ projectId })` con
    `Constants.expoConfig?.extra?.eas?.projectId`; guarda el token y `PUT`; cualquier error → `'unavailable'`. Nunca
    lanza.
  - `unregisterDevice(): Promise<void>` — si hay token guardado, `DELETE` (errores ignorados, con timeout corto) y lo
    olvida.
  - `notificationsPreference.get(): Promise<boolean>` (por defecto `true`) / `set(enabled)`: del celular, no se borra al
    cerrar sesión. `pushTokenStorage` sí se borra al cerrar sesión.
  - `AuthContext`: tras `startSession` y tras validar la sesión al abrir, si la preferencia es `true`, `void
    registerDevice()`. `logout`: `await unregisterDevice()` **antes** de `setAuthToken(null)` (necesita el JWT); si la
    sesión terminó por 401/suspensión, igual se intenta y se ignora el error.
  - Perfil: fila con `Switch` («Notificaciones en este celular»). Encender → `set(true)` + `registerDevice()`;
    `'denied'` → texto «Activa las notificaciones de HueckoApp en los ajustes del teléfono» + botón «Abrir ajustes»
    (`Linking.openSettings()`) y el interruptor vuelve a apagado; apagar → `set(false)` + `unregisterDevice()`. En Expo
    Go: deshabilitado con «Disponible en la app instalada (APK)».

- [ ] **Step 1: Write the failing tests** (`expo-notifications` y `expo-constants` simulados): registro con permiso →
  `PUT` con el token y canal creado antes de pedir permiso; denegado → `'denied'` sin `PUT`; Expo Go → `'unavailable'`
  sin pedir nada; error de red → `'unavailable'` sin lanzar; `logout` llama a `DELETE` antes de borrar el JWT
  (**Review Focus 4**: el `DELETE` sale con la cabecera `Authorization`); iniciar sesión con la preferencia apagada no
  registra; Perfil: encender, denegado con «Abrir ajustes», apagar, Expo Go deshabilitado.
- [ ] **Step 2: Run** `cd C:/Users/User/Desktop/HueckoApp-Android/mobile && npx jest --maxWorkers=2 src/notifications
  src/context src/screens/profile src/api`. Expected: FAIL.
- [ ] **Step 3: Implement** lo de **Interfaces** (instala con `npx expo install expo-notifications`).
- [ ] **Step 4: Run** `npm run typecheck` y `npx jest --maxWorkers=2`; `npx expo-doctor` dentro de `mobile/` sin
  errores nuevos. Expected: PASS.
- [ ] **Step 5: Commit** `feat(mobile): registrar el celular para notificaciones y apagarlas desde Perfil`

### Task 6: Tocar un aviso, avisos con la app abierta y documentación

**Files:**
- Create: `mobile/src/notifications/useNotificationNavigation.ts`, `mobile/src/navigation/navigationRef.ts`
- Modify: `mobile/App.tsx` (`ref={navigationRef}` y el hook), `README.md` (función y totales), `docs/guia-de-pruebas.md`
  (pasos con el development build y dos celulares), `docs/despliegue.md` (Firebase: `google-services.json`, clave FCM V1
  en EAS con `eas credentials` → Android → production → Google Service Account → FCM V1; `.gitignore` para la clave)
- Test: `mobile/src/notifications/__tests__/useNotificationNavigation.test.tsx`

**Interfaces:**
- Consumes: Task 5 (`registration.ts`), `data` = `NotificationData` de `shared`.
- Produces:
  - `navigationRef = createNavigationContainerRef<RootParamList>()` (usa el tipo raíz que ya exista en
    `navigation/types.ts`).
  - `useNotificationNavigation()`: `setNotificationHandler` con `shouldShowBanner: true, shouldShowList: true,
    shouldPlaySound: true, shouldSetBadge: false`; listener de recepción → `queryClient.invalidateQueries` de Inicio y
    del plan (`data.proposalId`) usando las claves de consulta existentes; listener de respuesta (y
    `getLastNotificationResponseAsync()` al montar, una sola vez) con `actionIdentifier ===
    DEFAULT_ACTION_IDENTIFIER` → si `navigationRef.isReady()` navega (`VOTING` → la pantalla de votar con
    `proposalId`; `PLAN` → el detalle del plan); si no está lista o no hay sesión, guarda el destino y navega cuando lo
    esté. Datos inválidos → no hace nada. Limpia las suscripciones al desmontar.
  - `.gitignore`: patrón para la clave de la cuenta de servicio (p. ej. `*-firebase-adminsdk-*.json` y
    `mobile/google-service-account*.json`); `google-services.json` NO se ignora.

- [ ] **Step 1: Write the failing tests:** tocar un `NEW_PROPOSAL` navega a votar con su `proposalId`; un `PLAN_*` al
  detalle; con la app cerrada (respuesta inicial) navega al estar lista; datos inválidos no navegan; recibir con la app
  abierta invalida las consultas de Inicio y del plan; desmontar quita las suscripciones.
- [ ] **Step 2: Run** `npx jest --maxWorkers=2 src/notifications`. Expected: FAIL.
- [ ] **Step 3: Implement** lo de **Interfaces** y la documentación (README con los totales reales tras correr ambas
  suites).
- [ ] **Step 4: Run** `npm run typecheck` y `npm test` (o backend y mobile por separado con `--maxWorkers=2`).
  Expected: PASS.
- [ ] **Step 5: Commit** `feat(mobile): abrir el plan al tocar un aviso y guía de configuración de Firebase`
