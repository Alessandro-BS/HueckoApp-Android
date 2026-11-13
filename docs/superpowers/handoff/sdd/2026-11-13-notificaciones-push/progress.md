# SDD ledger — plan: docs/superpowers/plans/2026-11-13-notificaciones-push.md

Spec: docs/superpowers/specs/2026-11-13-notificaciones-push-design.md (reachable). Branch feature/notificaciones-push, start 1d628f7 (parent branch tip 9f940ee).

## Pre-flight scan

| Pair / task | Produces vs consumes | Finding |
|---|---|---|
| T1 ↔ T2 | T1: tables push_devices/notifications (+claimed_at), shared NotificationKind/NotificationData; T2: enqueue into notifications | consistent |
| T1 ↔ T3 | T1: devicesRepository.tokensOf/removeToken; T3: flush uses both | consistent |
| T2 ↔ T3 | T2: pending rows (sent_at NULL); T3: claims them | consistent |
| T2 ↔ T4 | T2: enqueue, reminderMessage, close paths enqueue; T4: reminders + tick | tick must report `closed` count but closeDueProposals/closeDueInScope return void → Ruling C |
| T3 ↔ T4 | T3: PushClient, createExpoPushClient, flushNotifications, AppDeps.push; T4: index.ts uses them, internal route uses deps.push | consistent |
| T1 ↔ T5 | T1: PUT/DELETE /me/push-devices; T5: api client | consistent |
| T5 ↔ T6 | T5: registration.ts; T6: navigation hook + App.tsx | consistent |
| T2 | changes signatures of confirm/cancel (actorId) — all callers incl. admin & seed | plan instructs updating callers |
| T4 | CRON_SECRET "cadena vacía = sin configurar" vs `.min(32).optional()` | Ruling D |
| T2 | `{cuándo}` exact format vs Intl output («jueves, 16 de octubre, 16:00» has an extra comma) | Ruling E |
| T3, T5, T6 | self-consistent | — |

- Ruling: (C) `closeDueProposals` and express `closeDueInScope` return `Promise<number>` (proposals/votes closed) so `tick` can report `closed`; existing callers ignore the value — cost if wrong: none functional.
- Ruling: (D) CRON_SECRET uses a preprocess that turns '' / whitespace into undefined before `.min(32).optional()` — cost if wrong: an empty var in Render would otherwise crash startup.
- Ruling: (E) `{cuándo}` is assembled from Intl parts (weekday, day, month, HH:mm, America/Lima) to produce exactly «jueves 16 de octubre, 16:00»; the test pins the string — cost if wrong: cosmetic.

## Progress
Task 1: dispatched (BASE 1d628f7, implementer sonnet a043e3d81ac96d053)
Task 1: implementer DONE ab92268 (874 backend / 667 mobile)
Task 1: review → Approved. ⚠️ ZodError→400 and ALL_VERSIONS derived: covered by passing tests — resolved. ⚠️ logout unregister belongs to Task 5.
Task 1: minor (deferred): push token has no max length (add .max(255))
Task 1: minor (deferred): tokensOf ORDER BY created_at keeps previous owner's created_at after reassignment
Task 1: minor (deferred): DELETE does not trim the token param
Task 1: complete (commits 1d628f7..ab92268, review clean)
Task 2: dispatched (BASE ab92268, implementer opus a12cc7bbb03002b88)
Task 2: implementer DONE_WITH_CONCERNS 180f916 (899 backend)
- Ruling: {cuándo} example — 2026-10-16 is a Friday; tests pin «viernes 16 de octubre, 16:00» and «jueves 15 de octubre, 16:00»; spec/plan example text is just wrong date arithmetic — cost if wrong: none.
- Ruling: EXPRESS_RESULT only when the plan was still CONFIRMADO at close (a hand-cancel already sent PLAN_CANCELLED) — one notice per fact, per spec intent — cost if wrong: a group misses "el grupo decidió…" after a plan already cancelled by hand.
- Ruling: the seed must not leave pending notifications (demo history would be pushed to testers' phones once the sender exists) → fix in Task 2 loop: seed marks its notifications as sent (or deletes them) at the end — cost if wrong: none.
Task 2: review → Approved. ⚠️ enqueue inserted-count under ON CONFLICT unverified → test added in fix round.
Task 2: minor (deferred): whenText toLocaleLowerCase redundant; depends on full ICU (Node 22 default)
Task 2: fix round 1 dispatched (FIX_BASE 180f916): seed ruling + notifyGroup helper + cancel gate/admin rollback tests + enqueue count test
Task 2: fix round 1/5 (4 addressed, 0 open; commits 180f916..deffb70)
Task 2: minor (deferred): possibly unused group_id reads in closeProposalIfDue / express closeDue after refactor
Task 2: complete (commits ab92268..deffb70, review clean)
- Ruling: (F) notification counts as sent if any token got ok; all-error-without-transport-error (e.g. all DeviceNotRegistered) → sent_at after removing dead tokens — nothing left to retry — cost if wrong: a notice for a user whose only phone died is dropped (correct per spec).
Task 3: dispatched (BASE deffb70, implementer opus ab6b3f46675f1bd71)
Task 3: implementer DONE 673f72e (929 backend)
- Ruling: (G) after a transport error keep claimed_at = now (5-min claim expiry = backoff) instead of NULL — avoids burning 5 attempts in seconds during an Expo outage — cost if wrong: a notice delayed ~5 min after a transient error. Supersedes the spec line "claimed_at = NULL".
- Ruling: (H) per-ticket MessageRateExceeded is retryable (attempts+1, keep claim); other ticket errors are final — Expo documents it as retryable — cost if wrong: none.
Task 3: pre-review adjustments requested from implementer (G, H)
Task 3: rulings applied 7ca3337 (931 backend)
Task 3: review → Approved (no Critical/Important). ⚠️ index.ts wiring = Task 4; ⚠️ SKIP LOCKED untestable on PGlite.
- Ruling: fix minors 1 (only 400/413 final; other 4xx retryable), 2 (record before removeToken, results in one transaction), 3 (per-row poison-pill isolation), 4 (honest test name), 6 (scheduler try/catch), 8 (send rejects >100) and skip kick on /health — they guard the "no loss / no duplicate" anti-goals before Task 4 wires the real token — cost if wrong: one extra small commit.
Task 3: minor (deferred): one flush pass per kick (backlog >100 drains on next request/sweep)
Task 3: minor (deferred): app-level test waitFor(tasks.length > 0) is vacuous
Task 3: fix round 1 dispatched (FIX_BASE 7ca3337)
Task 3: fix round 1/5 (7 addressed, 0 open; commits 7ca3337..5ff06f7)
Task 3: minor (deferred): HEAD /api/health still kicks a flush (only GET skipped)
Task 3: minor (deferred): results-transaction failure after Expo accepted → resend after 5 min without attempts+1 (at-least-once, accepted)
Task 3: complete (commits deffb70..5ff06f7, review clean)
Task 4: brief written (task-4-brief.md), NOT dispatched — user paused session 2026-11-13; resume here with BASE 5ff06f7
