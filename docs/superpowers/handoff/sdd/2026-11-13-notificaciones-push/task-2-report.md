# Task 2 report: Bandeja de salida (encolar avisos en cada cambio)

**Status:** DONE_WITH_CONCERNS (see Concerns 1 and 2)
**Commit:** `180f916 feat(backend): guardar los avisos en la misma transacción que cada cambio` (branch `feature/notificaciones-push`, not pushed)

## What was implemented

- `backend/src/notifications/messages.ts` (pure): `PlanInfo`, `NotificationMessage = { title, body, data }`,
  `whenText(iso)` ({cuándo}) and `timeText(iso)` ({HH:mm}), both in `America/Lima` via
  `Intl.DateTimeFormat('es-PE', {..., hourCycle: 'h23'}).formatToParts`, put together as
  `${weekday} ${day} de ${month}, ${hour}:${minute}` (lowercase, no comma after the weekday, 24h). There is one function
  per notice: `newProposalMessage`, `planConfirmedMessage`, `planCancelledMessage(plan, { noVotes })`,
  `expressOpenedMessage`, `expressResultMessage(plan, result, byDefault)` and `reminderMessage`. Title = group name.
  `data.screen` is `VOTING` only for `NEW_PROPOSAL`. `planConfirmedMessage`/`reminderMessage` throw if `scheduledAt` is
  null; that should never happen, because a CONFIRMADO plan always has one.
- `backend/src/notifications/audience.ts`:
  - `planInfo(db, proposalId)`: one query, joined with `groups`.
  - `groupMemberIds(db, groupId, { except? })`: the current members.
  - `userName(db, userId)` (extra helper): supplies {nombre}.
- `backend/src/notifications/outbox.repository.ts`:
  - `enqueue(db, items, now): Promise<number>`: one multi-row `INSERT ... ON CONFLICT (dedupe_key) DO NOTHING`, with
    `data` stored as `JSON.stringify(data)`. It returns the number of inserted rows and runs no query for an empty list.
  - `enqueueMessage(db, userIds, message, now)` (extra helper): sends the same message to each recipient.
- Enqueue happens inside the existing transaction, after the state UPDATE, and only when the change actually happened:
  - `proposals.create`: `NEW_PROPOSAL` to members except `createdBy`.
  - `proposals.confirm(..., now, actorId)`: `PLAN_CONFIRMED` except `actorId`, only if `rowCount > 0`.
  - `proposals.cancel(id, actorId, now)`: now wrapped in `db.transaction`. Sends `PLAN_CANCELLED` (noVotes false)
    except `actorId`; the admin passes `null`. `clearAutoCancelled` enqueues nothing.
  - `closeProposalIfDue`: `PLAN_CONFIRMED`, or `PLAN_CANCELLED` with `noVotes: true`, to all members, only if it closed.
    The two UPDATE branches were merged so that one `rowCount` check covers both.
  - `reportIncidence`: if `openedVoteId !== null`, `EXPRESS_OPENED` to `voterIds` with the reporter's name and the stored
    `criticalReason`.
  - Express `closeDue`: `EXPRESS_RESULT(result, byDefault)` to all members, only if it closed **and the plan was still
    CONFIRMADO** (see Concern 2). `CANCELAR` sends only `EXPRESS_RESULT`; `applyResult` does not go through
    `proposals.cancel`, so it never sends a `PLAN_CANCELLED`.
- `docs/api.md` §Notificaciones: the intro now describes the outbox and transactions. Added an «Avisos» subsection
  with the spec's table, the recipient rules, the «un aviso por hecho» rules, `data`, and the exact texts.

## Files changed

- New: `backend/src/notifications/{messages,audience,outbox.repository}.ts`,
  `backend/test/notification-messages.test.ts`, `backend/test/notifications-outbox.test.ts`
- Modified: `backend/src/proposals/proposals.repository.ts`, `backend/src/proposals/voting-close.ts`,
  `backend/src/proposals/express-votes.repository.ts`, `backend/src/proposals/proposals.routes.ts`,
  `backend/src/admin/admin-groups.ts`, `backend/src/db/demo-data.ts`, `backend/test/proposals-batch.test.ts`,
  `backend/test/proposals.repository.test.ts`, `docs/api.md`

## Changed signatures and callers

- `confirm(id, windowId, scheduledAt, scheduledDate, now, actorId: string)`. Callers:
  - `proposals.routes.ts` POST `/:id/confirm` passes `userId`.
  - `demo-data.ts` passes `ids.test`, the creator.
  - `proposals-batch.test.ts` passes `yoId`.
  - `proposals.repository.test.ts` (4 calls) passes `ana.id`.
- `cancel(id, actorId: string | null, now: Date)`. Callers:
  - `proposals.routes.ts` POST `/:id/cancel` passes `(userId, ctx.now())`.
  - `admin-groups.ts` `cancelProposal` passes `(null, actor.now)`.
  - No tests called it directly.
- Unchanged signatures: `create`, `reportIncidence`, `closeProposalIfDue`, `closeDue`, `clearAutoCancelled`.

## TDD evidence

RED, with both files written before any implementation:
`npx vitest run test/notification-messages.test.ts test/notifications-outbox.test.ts`
```
Error: Cannot find module '../src/notifications/messages' imported from .../test/notification-messages.test.ts
 Test Files  2 failed (2)
      Tests  15 failed | 3 passed (18)
```
(The 3 outbox tests that already passed are guard tests that expect *no* rows: confirm that returns false, a
non-critical absence, and moderating an auto-cancelled plan.)

GREEN:
```
 Test Files  2 passed (2)
      Tests  25 passed (25)
```

Outbox tests (HTTP, reading `notifications` straight from the DB):
- NEW_PROPOSAL to everyone except the creator, with exact row contents (`screen: 'VOTING'`, `sent_at: null`).
- Review Focus 2: an `INSERT INTO notifications` forced to fail inside `create` returns 500, and there are 0 proposals,
  0 windows and 0 notifications afterwards.
- Manual confirm goes to everyone except the confirmer: «miércoles 7 de octubre, 11:00».
- Confirm by another organizer excludes her, and the creator does receive it.
- Review Focus 2: a `confirm` with `interleave` cancelling the plan before its UPDATE returns 409, and there is no
  PLAN_CONFIRMED.
- Manual cancel goes to everyone except the canceller; a second cancel returns 409 and adds no rows.
- A member who left before the change does not receive it.
- Admin cancel goes to all 3 members.
- Admin moderating an auto-cancelled plan leaves the rows unchanged.
- Auto-close with votes sends PLAN_CONFIRMED to all, the creator included.
- Auto-close with no votes sends «…nadie votó antes del plazo.» to all, exactly once across two reads.
- A critical absence sends EXPRESS_OPENED to the voters only, with «(propuso este plan)».
- A non-critical absence sends nothing.
- An express close on MANTENER sends EXPRESS_RESULT to all, the reporter included.
- An express close on CANCELAR sends only EXPRESS_RESULT, and no PLAN_CANCELLED.
- An expired express vote with no quorum sends «Sin quórum: … se mantiene.»
- A manager cancelling while an express vote is open: when it closes there is no EXPRESS_RESULT.

## Full-suite results

- `npm run typecheck` (root): backend and mobile `tsc --noEmit` both clean.
- `npx vitest run` (backend):
```
 Test Files  52 passed (52)
      Tests  899 passed (899)
```
- Mobile jest was not run: `shared/` was not changed.

## Self-review

- Every enqueue sits after the UPDATE and after the `rowCount === 0 → return false` check, inside the same
  `db.transaction`. Nested transactions flatten, so the admin's `cancelProposal` transaction also covers the enqueue
  and the audit.
- `grep "SET state" backend/src` turns up no other state change that should notify. `replanWindows` (back to PROPUESTO)
  and REAGENDAR (EN_RECOORDINACION) are not in the spec's table.
- Query cost per change: no more than 3 extra queries (members, planInfo, multi-row INSERT), plus `userName` for
  NEW_PROPOSAL and EXPRESS_OPENED. Existing tests that count queries (lists, batch) are unaffected.
- The `create` route's FK-violation → 404 handling is unchanged, because the FK error comes from the
  `INSERT INTO proposals`, before the enqueue.

## Concerns

1. **The controller's `{cuándo}` pin is factually wrong.** 2026-10-16 is a **Friday** (the test helpers have Monday
   5/10), so `2026-10-16T21:00:00.000Z` formats as «**viernes** 16 de octubre, 16:00», not «jueves…». «jueves 16 de
   octubre» in the spec is only an example of the format. I pinned the real output and added
   `2026-10-15T21:00:00.000Z` = «jueves 15 de octubre, 16:00». I also pinned midnight («00:05») and a one-digit day
   («lunes 2 de noviembre, 09:30»). The `docs/api.md` example now says «jueves 15 de octubre, 16:00». The spec and plan
   files still say «jueves 16»; I did not edit them.
2. **EXPRESS_RESULT is only sent when the plan was still CONFIRMADO.** This is a deliberate narrowing of «solo si
   cerró». If a manager cancels the plan while an express vote is open, the group already got PLAN_CANCELLED, and the
   later close applies nothing. Saying «El grupo decidió reagendar…» about a cancelled plan would be a second,
   misleading notice for the same fact, which goes against «un aviso por hecho». This rule is documented in
   `docs/api.md` and covered by a test. If you want the literal behaviour, remove the `if (plan.state === 'CONFIRMADO')`
   guard around the enqueue in `closeDue` and flip the last test.
3. **The seed now enqueues notices.** `demo-data.ts` calls `create`/`confirm`, so each `seed` run queues
   NEW_PROPOSAL/PLAN_CONFIRMED rows for the demo users. Once Task 3's sender exists they would be pushed to any demo
   account with a registered device (dev only). This is harmless, but whoever runs the seed should know about it.

---

## Fix report (review round 1)

**Commit:** `deffb70 fix(backend): la semilla no deja avisos pendientes y un solo punto para avisar al grupo`

### Changes
1. **The seed leaves no pending notifications (controller ruling).** This resolves Concern 3 above.
   - In `backend/src/db/demo-data.ts`, the two demo-proposal DELETEs now use `RETURNING id`.
   - At the end of `seedProposals`, it runs:
     `DELETE FROM notifications WHERE data::json->>'proposalId' = ANY($1::text[])`.
     The list holds the demo proposals it removed plus the two it just created. That covers the notices this run
     queued and leftovers that point at earlier demo proposals.
   - Notifications for proposals created in the app are not touched.
2. **One helper for group notices (review minor 1).** I added `backend/src/notifications/notify.ts`:
   `notifyGroup(db, proposalId, build: (plan) => NotificationMessage, { except }, now): Promise<number>`, which
   does `planInfo` → `groupMemberIds(plan.groupId, { except })` → `enqueueMessage`.
   - It is used by `create` (except the creator), `confirm` and `cancel` (except `actorId`), `closeProposalIfDue`
     (`{}`), and express `closeDue` (`{}`, still only when the plan was CONFIRMADO).
   - `EXPRESS_OPENED` still goes to `voterIds` through `planInfo`, `userName` and `enqueueMessage`.
3. **New tests in `notifications-outbox.test.ts` (review minor 2):**
   - A concurrent `proposalsRepository.cancel` by Ana runs via `interleaveWith` right before the UPDATE inside
     `proposals.cancel`. The request returns 409 `INVALID_STATE`. The only PLAN_CANCELLED rows are Ana's (to yo and
     Carlos); the second cancel wrote none.
   - The admin cancel with `INSERT INTO admin_audit_log` forced to throw, so the failure comes after the enqueue,
     returns 500. The plan stays CONFIRMADO and there are 0 PLAN_CANCELLED rows.
4. **New `enqueue` test (review minor 4):**
   - The same `dedupe_key` returns 1, then 0, and leaves one row.
   - A mixed batch (one existing key, one new key, two without a key) returns 3.
   - An empty list returns 0.

### TDD
- I wrote the tests first.
  - The seed test «no deja avisos pendientes…» was RED: `AssertionError: expected 3 to be +0`.
  - The item 3/4 tests passed right away, because they cover behaviour that already existed: the rowCount gate,
    the outer transaction, and `ON CONFLICT DO NOTHING` with `rowCount`.
- I also extended the seed test «no toca las propuestas creadas desde la app…». An app-created proposal's NEW_PROPOSAL
  notice survives a re-seed.

### Commands and results
- `npm run typecheck` (root): backend and mobile `tsc --noEmit` both clean.
- `npx vitest run test/notifications-outbox.test.ts test/notification-messages.test.ts test/seed.test.ts test/proposals.repository.test.ts`:
```
 Test Files  4 passed (4)
      Tests  48 passed (48)
```
- `npx vitest run` (full backend suite):
```
 Test Files  52 passed (52)
      Tests  903 passed (903)
```
