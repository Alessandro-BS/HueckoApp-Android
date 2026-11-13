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

