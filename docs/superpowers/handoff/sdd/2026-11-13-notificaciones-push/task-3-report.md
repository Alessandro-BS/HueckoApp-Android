# Task 3 — Envío a la Expo Push API: report

Status: DONE. Commit `673f72e feat(backend): enviar los avisos pendientes por la Expo Push API` (not pushed).

## What I implemented

- `backend/src/notifications/push-client.ts`
  - Types `PushMessage`, `PushTicket`, `PushTransportError`, `PushClient`, exactly as the brief specifies, plus the
    exported constants `EXPO_PUSH_URL` and `PUSH_BATCH_SIZE = 100`.
  - `createExpoPushClient({ accessToken?, fetchImpl = fetch, timeoutMs = 10_000 })`: `POST EXPO_PUSH_URL` with `accept`,
    `accept-encoding: gzip, deflate`, `content-type: application/json` and `authorization: Bearer …` only when a token
    is given. It splits messages into batches of 100 and sends them one after another, returning the tickets in order.
    There is one AbortController timer per request, and it covers both the fetch and reading the body.
  - Network error, abort/timeout, 429 or 5xx → `PushTransportError`. A 200 whose `data` is not an array of exactly
    batch length also → `PushTransportError`, because tickets can't be matched to messages. A 400, and any other
    4xx, → one `{status:'error', message}` ticket per message of that batch, with the `errors[].message` text from
    Expo's body. An empty input → `[]` with no request.
- `backend/src/notifications/flush.ts` — `flushNotifications(db, push, now)`
  - **Claim:** inside `db.transaction`, the brief's SQL verbatim (`… claimed_at < $1 ORDER BY seq LIMIT 100 FOR UPDATE
    SKIP LOCKED`, `$1 = now − 5 min`), then `UPDATE … SET claimed_at = now WHERE id = ANY($2::text[])`. The transaction
    commits before anything else runs.
  - **Send (outside the transaction):** one `tokensOf` query for the distinct recipients, then one `PushMessage` per
    token (`channelId 'planes'`, `priority 'high'`, `sound 'default'`, `data` parsed from the stored JSON).
    `push.send` is called in chunks of ≤ 100. Any throw from `send`, or a ticket count that doesn't match the chunk,
    marks every notification in that chunk as having a transport error.
  - **Per-notification result:**
    - Any `ok` ticket → `sent_at`. `last_error` is left as it was.
    - Otherwise, any transport error → `attempts + 1`, `last_error`, `claimed_at = NULL`. When `attempts + 1 >= 5` it
      sets `sent_at` instead (abandoned).
    - Otherwise (no tokens, or only error tickets such as all `DeviceNotRegistered`) → `sent_at`, with `last_error` set
      to the first ticket error, e.g. `DeviceNotRegistered: …`.
    - Results are written with one UPDATE per (result, error) group rather than one per row. Every UPDATE has
      `AND sent_at IS NULL`, so a notification that is already resolved is never rewritten.
  - Each distinct `DeviceNotRegistered` token → `devices.removeToken(token)`.
  - Returns `{ sent, failed }`. `sent` = resolved notifications (including the no-device and dead-token cases);
    `failed` = transport failures (retried or abandoned). It never throws: everything is in a try/catch that calls
    `logFlushError`, which is silent when `NODE_ENV=test`, and then returns `{0,0}`.
- `backend/src/notifications/flush-scheduler.ts` — `createFlushScheduler({ db, push, now, onBackgroundTask? })` →
  `{ kick() }`.
  - When idle, `kick()` starts a run and hands the promise to `onBackgroundTask`. While a run is in progress, `kick()`
    only sets `again = true`, so the run does one more pass when it finishes. That gives at most one run in progress
    plus one pending, however many kicks arrive.
  - A pass that throws (including `now()` throwing) is logged and swallowed, and `running` is reset in `finally`.
- `backend/src/app.ts`: new `AppDeps.push?: PushClient`. If it is set, `createFlushScheduler(...)` is created with
  `deps.now` and `deps.onBackgroundTask`, and the first middleware on `api` does
  `res.on('finish', () => flusher.kick())`. Without `push` nothing is added, so no query or behaviour changes.
- `backend/test/helpers.ts`:
  - `makeTestApp({ push? })`.
  - `fakePush(behaviour = 'ok')` → `FakePush` (a `PushClient` plus `calls: PushMessage[][]` and `reply(next)`).
    `behaviour` is `'ok' | 'DeviceNotRegistered' | 'transport'` or a per-message function. `'transport'` on any
    message makes the whole `send` throw `PushTransportError('Expo respondió 503')`.

## Files changed

- New: `backend/src/notifications/push-client.ts`, `backend/src/notifications/flush.ts`,
  `backend/src/notifications/flush-scheduler.ts`, `backend/test/push-client.test.ts`,
  `backend/test/notifications-flush.test.ts`
- Modified: `backend/src/app.ts`, `backend/test/helpers.ts`

## TDD evidence

**RED** (`npx vitest run test/push-client.test.ts test/notifications-flush.test.ts`, before any implementation):

```
Error: Cannot find module '../src/notifications/push-client' imported from .../test/push-client.test.ts
 Test Files  2 failed (2)
      Tests  no tests
```

**First run after implementing:** 1 failure. The test itself was wrong: a proposal needs at least 2 time slots. I fixed
the test and ran it again:

```
 Test Files  2 passed (2)
      Tests  26 passed (26)
```

I ran it 3 times in a row and it passed every time (no flakiness from the background tasks).

**Mutation check:** I disabled the claim `UPDATE` in `flush.ts`. Two tests failed: «llama a Expo con el reclamo ya
guardado y fuera de la transacción» and «dos envíos seguidos o a la vez mandan cada aviso una sola vez». I then
restored the file and checked that `git diff` on it was clean.

### Test coverage

- **push-client (9 tests):**
  - 150 messages → 100 + 50 requests and 150 tickets in order.
  - Headers; `Authorization` only when a token is given.
  - Empty input → no request.
  - `DeviceNotRegistered` tickets come back as Expo returns them.
  - 503/500/429 → `PushTransportError`; a network error → `PushTransportError`.
  - Timeout → the request is aborted and `PushTransportError` is thrown.
  - A ticket count that doesn't match → `PushTransportError`.
  - 400 → one error ticket per message.
- **flush (13 tests):**
  - Two phones → two messages and `sent_at` set.
  - No phones → `sent_at` and no call to Expo.
  - Nothing pending → no call to Expo.
  - Transport error → `attempts 1`, `claimed_at NULL`, still pending; the next flush sends it.
  - Fifth failure → abandoned (`sent_at`, `attempts 5`, `last_error`), and it is never retried.
  - `DeviceNotRegistered` with another token `ok` → the dead token is removed and the notification is sent.
  - Every token `DeviceNotRegistered` → the tokens are removed and the notification gets `sent_at` + `last_error`;
    other users' tokens are untouched.
  - A claim older than 5 min is retried; one from 4 min ago is not.
  - 250 pending → passes of 100/100/50, no repeats, in `seq` order, and a 4th pass finds nothing.
  - **`send` runs with `db.inTransaction === false` and the claim already committed.**
  - **Review Focus 1:**
    - `interleave` before the `FOR UPDATE SKIP LOCKED` claims the rows for another flusher → this flush sends
      nothing.
    - Two flushes run concurrently with `Promise.all`, then a third → each notification is sent exactly once.
  - Never throws: an unexpected `Error` from `send` counts as a failure, and a `db.transaction` rejection → `{0,0}`.
- **scheduler (2 tests):**
  - Kicks during a blocked send collapse into one extra pass: 1 task, 2 claims, at most 1 send in flight, and the
    notification enqueued mid-flight still goes out. A later kick starts a new task.
  - A pass that throws (`now()` throws) neither propagates nor blocks the next kick.
- **app (2 tests):**
  - `makeTestApp({ push: fakePush(), onBackgroundTask })`: the registration and device requests send nothing. After
    creating a proposal, the fake client receives exactly the `NEW_PROPOSAL` for the other member's token, and
    nothing is left pending.
  - Without `push`, requests produce no background tasks.

## Full-suite results

- `npm run typecheck` (root): backend and mobile `tsc --noEmit` both clean. The first attempt failed on
  `satisfies PushClient` with the extra `calls` property; I fixed it with an explicit `FakePush` type.
- `npx vitest run` (backend):

```
 Test Files  54 passed (54)
      Tests  929 passed (929)
```

## Self-review

- The brief's interfaces are followed verbatim. The only additions are the exported constants (`EXPO_PUSH_URL`,
  `PUSH_BATCH_SIZE`, `FLUSH_BATCH_SIZE`, `CLAIM_EXPIRES_MS`, `MAX_ATTEMPTS`) and `logFlushError`.
  `createFlushScheduler` has no extra injection point: the tests count passes by spying on `db.transaction`.
- No transaction or lock is held across the HTTP call; the test above checks this directly.
- Existing tests are unaffected, because the middleware is only mounted when `push` is passed. The full suite and
  its query-count tests are unchanged and green.
- No secrets. `index.ts`, `env`, `.env.example` and `render.yaml` are not touched: wiring the real Expo client and
  `EXPO_ACCESS_TOKEN` is not in this task's file list (the spec puts it with the tick/env work). `docs/api.md` is
  unchanged because no endpoint changed.

## Concerns

1. **No backoff between transport retries.** As the brief requires, a transport error sets `claimed_at = NULL`. With
   immediate sending, the next `/api` request triggers another attempt right away, so during an Expo outage on a busy
   server the 5 attempts could be used up within seconds, and the notification abandoned. The spec's Expo facts say
   "retry with backoff". A cheap fix, if the controller agrees: on a transport error, keep `claimed_at = now` (so the
   5-minute claim expiry becomes the backoff), or add a `next_attempt_at`. I did not do this because the brief and its
   test say `claimed_at` NULL.
2. **Ticket errors other than DeviceNotRegistered are final.** Following the ruling, a notification whose tickets are
   all errors gets `sent_at`. That includes `MessageRateExceeded`, which Expo documents as retryable. This only
   matters at very high volume.
3. **Transport failures in multi-batch sends:** if `createExpoPushClient.send` gets more than 100 messages and a later
   batch fails, the tickets from earlier batches are lost (the whole call throws). `flush` always calls `send` with
   ≤ 100 messages, so this cannot happen in the flush path.
4. Notifications that are already resolved keep their previous `last_error` (`COALESCE`), so a notification that
   failed once and then succeeded still shows the old transport error. This is deliberate, as a diagnostic trail.

---

## Fix report: controller rulings 1 and 2 (commit `7ca3337`)

**Changes (`backend/src/notifications/flush.ts`)**

1. **Backoff after a retryable error.** The `retry` UPDATE now writes `attempts = attempts + 1, last_error = $1,
   claimed_at = $2` (now) instead of `claimed_at = NULL`. The 5-minute claim expiry (`CLAIM_EXPIRES_MS`) therefore
   acts as the wait before the next attempt. The 5th attempt is still marked `sent_at` (abandoned), as before. The
   doc comments on `CLAIM_EXPIRES_MS`, `record` and `flushNotifications` were updated to match.
2. **`MessageRateExceeded` is retryable.** I added `RETRYABLE_TICKET_ERRORS = {'MessageRateExceeded'}`. A ticket with
   that `details.error` sets the notification's `retryError` (renamed from `transportError`, because it now covers
   transport errors and retryable tickets). So a notification with no `ok` ticket and at least one
   `MessageRateExceeded` is handled like a transport error: attempts + 1, last_error, claim kept, abandoned at 5.
   - `DeviceNotRegistered` still removes the token.
   - A notification whose tickets are all non-retryable errors still gets `sent_at` plus `last_error`.
   - Any `ok` ticket still wins.

`docs/api.md` does not mention `claimed_at` or retries, so it is unchanged. The spec file was left alone as you asked.

**Tests**

- `backend/test/helpers.ts`: `FakePushReply` now also accepts `'MessageRateExceeded'`, which returns an error ticket
  with `details.error = 'MessageRateExceeded'`.
- `backend/test/notifications-flush.test.ts`:
  - Transport-error test: after a failure at `later(1)` it now expects `claimed_at = later(1)`. A flush at `later(5)`
    sends nothing even though Expo has recovered; a flush at `later(7)` sends.
  - Fifth-failure test: the retries are now spaced 6 min apart (`later(i * 6)`); the abandon happens at `later(30)`.
  - Never-throws test: now expects `claimed_at = later(1)` instead of NULL.
  - New test: Ana's only token gets `MessageRateExceeded`, so she is retried (attempts 1, claim kept, token not
    removed) and sent after the claim expires. Carlos has one `MessageRateExceeded` and one `ok` ticket, so he is sent.
  - New test: one token gets `DeviceNotRegistered` and the other `MessageRateExceeded` → the dead token is removed and
    the notification is retried (attempts 1, no `sent_at`).
- RED, before the implementation: `Tests  4 failed | 15 passed (19)`. The failures were the transport/backoff test,
  both new `MessageRateExceeded` tests and the never-throws test.

**Commands and results**

- `npx vitest run test/push-client.test.ts test/notifications-flush.test.ts` → `Test Files  2 passed (2)` /
  `Tests  28 passed (28)`
- `npm run typecheck` (root) → backend and mobile `tsc --noEmit` clean
- `npx vitest run` (backend) → `Test Files  54 passed (54)` / `Tests  931 passed (931)`

Concerns 1 and 2 above are resolved by this fix. Concerns 3 and 4 stand, and the `index.ts` wiring is left for
Task 4.

---

## Fix report: review minors 1–7 (commit `5ff06f7`)

**Changes**

1. **`push-client.ts`: only 400 and 413 are final.**
   - 400 and 413 → one error ticket per message.
   - Every other non-2xx (401, 403, 404, 408, 429, 5xx), plus network errors and timeouts → `PushTransportError`.
     These are retried with the 5-minute claim backoff, up to 5 attempts.
2. **`flush.ts`: results are recorded atomically, then tokens are removed.**
   - All result UPDATEs of a pass (sent / retry / abandoned) run inside one `db.transaction`.
   - `removeToken` for `DeviceNotRegistered` runs only after that commits.
   - If recording fails, the notifications stay claimed (and are retried once the claim expires), nothing is half
     written, and the dead tokens stay, so the retry finds out about them again.
3. **`flush.ts`: a bad row is abandoned on its own.** `data` is parsed per row with `parseData`, which throws unless
   the value is a JSON object with a string `kind`. A row that fails is abandoned by itself (`sent_at`,
   `attempts + 1`, `last_error = 'data ilegible: …'`) and counted in `failed`. The other rows in the pass are sent as
   usual.
4. **Review Focus 1 test renamed** to «si otro envío ya reclamó los avisos (claimed_at reciente), este no los envía».
5. **`flush-scheduler.ts`:** `onBackgroundTask?.(task)` is wrapped in try/catch, which calls `logFlushError`. `kick()`
   never throws, and the task still runs.
6. **`push-client.ts`:**
   - The `PushClient.send` doc now says callers pass at most 100 messages (`PUSH_BATCH_SIZE`).
   - `createExpoPushClient.send` rejects with a plain `Error` (not a `PushTransportError`) when given more than 100,
     before making any request. The internal multi-batch loop is gone.
   - `flush` already sends chunks of ≤ 100.
7. **`app.ts`:** the middleware skips `GET /health`. Every other request under `/api`, GETs included, still kicks a
   flush.

**Tests**

- `push-client.test.ts`:
  - The 150-message test is replaced by «100 mensajes van en una sola petición…»: 1 request, the body is all 100, and
    100 tickets come back in order.
  - New: «más de 100… rechaza sin hacer ninguna petición». It rejects with a message matching `/100/`, the error is
    not a `PushTransportError`, and no fetch is made.
  - The transport test now covers 503/500/429/401/403/404/408.
  - The 400 test now also checks 413 (one error ticket per message).
- `notifications-flush.test.ts`:
  - New: «un aviso con `data` ilegible se abandona solo…». Three rows: `'{no es json'`, `'null'` and a good one →
    `{sent:1, failed:2}`. Only «Bueno» is sent; the two bad rows get `sent_at` and a `last_error` mentioning `data`.
    A later pass finds nothing left.
  - New: «anota los resultados juntos en una transacción y después borra los tokens muertos». `recordQueries` checks
    that after the claim the writes are two `UPDATE notifications` with `inTransaction: true`, then
    `DELETE FROM push_devices` with `inTransaction: false`.
  - New: «si anotar un resultado falla, no queda ninguno a medias ni se borran tokens…». The second result UPDATE
    fails, so the first (Ana's retry) is rolled back: both rows are left with `sent_at` NULL, `attempts` 0 and the
    claim kept, and Carlos's dead token is not removed.
  - New: «kick() no lanza aunque onBackgroundTask lance, y el envío sigue».
  - New: «GET /api/health no pide envío; cualquier otra petición, también un GET, sí». With `push` injected, health
    adds no task and `GET /api/me/dashboard` adds one.
  - The scheduler test now counts passes by the `SKIP LOCKED` claim queries rather than `db.transaction` calls,
    because recording now opens a second transaction.
- RED, before the implementation:

```
 Test Files  2 failed (2)
      Tests  7 failed | 27 passed (34)
```

  The 7 failures were the >100 rejection, 401/403/404/408, bad data, ordering/transaction, all-or-nothing,
  `onBackgroundTask` throwing, and health.

**Commands and results**

- `npx vitest run test/push-client.test.ts test/notifications-flush.test.ts` → `Test Files  2 passed (2)` /
  `Tests  34 passed (34)`
- `npm run typecheck` (root) → backend and mobile `tsc --noEmit` clean
- `npx vitest run` (backend) → `Test Files  54 passed (54)` / `Tests  937 passed (937)`

Concern 3 above (lost tickets from earlier batches in a multi-batch `send`) no longer applies, because `send` now
rejects more than 100 messages. Concern 4 (`last_error` kept after a later success) stands.
