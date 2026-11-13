# SDD ledger — plan: docs/superpowers/plans/2026-11-13-votacion-expres-grupal.md

Spec: docs/superpowers/specs/2026-11-13-votacion-expres-grupal-design.md
Branch: feature/votacion-expres-grupal (from feature/franjas-con-fecha 03a4fe6; spec d2b71f6, plan 3ef0f97). No worktree (same ruling as earlier plans: user works in the main checkout, PR branches stacked).

## Pre-flight scan
| Pair/task | Produces vs consumes | Finding |
|---|---|---|
| T1→T2,T3,T7 | ExpressVote/ExpressOption types, Proposal.expressVote, Incidence.criticalReason, rules fns | consistent; T1 must return nulls until T2 → fixtures change in T1 |
| T2→T3,T4,T5 | expressVotesRepository open/castVote/findOpen/latestFor/saveRecommendation/deleteClosedFor | consistent |
| T3→T4,T6,T7 | closeDue/closeDueInScope, PUT express-vote, REAGENDAR→EN_RECOORDINACION; removes ResolveIncidencesInput | mobile breaks until T7 → adapter marked Task 7 (plan says so) |
| T3→T5 | route hook after open | consistent |
| T6→T8 | ExpressAlert.kind + expiresAt | mobile typecheck may need adapter until T8 |
| T4 | replan from EN_RECOORDINACION + cleanup | consistent with T3 states |
| each task | tests vs code | consistent; T2 latestFor signature (member-set callback) is a suggestion — implementer may pick an equivalent shape if documented |

Ruling: transitional adapters allowed, marked `// TODO(votacion-expres Task N)` — keeps suites green per Global Constraints — cost if wrong: throwaway lines.
Ruling: keep per-model Co-Authored-By trailers if the harness forces them (as in phase 1) — cost: none.

## Tasks
Task 1: BASE 3ef0f97
Task 1: dispatched implementer (sonnet) aa46b3339fa0a9d50
Task 1: implementer DONE 1724d38 (adapter TODO Task 2 nulls in repo; backend 705, mobile 611)
Task 1: reviewer (sonnet) a10c266fb20fc1a14
Task 1: review Approved, spec ✅
Task 1: minor (deferred): expiresAtFor throws on unparseable scheduledAt (Task 3 passes validated values); tally tests lack exact-2-of-6 quorum and 3-way tie; fixture one-line style; minutes unvalidated (env schema in Task 3).
Task 1: complete (commits 3ef0f97..1724d38, review clean)
Task 2: BASE 1724d38
Task 2: dispatched implementer (sonnet) a4c5ffb5256060e6f
Task 2: implementer DONE 39500ed (latestFor(proposalIds, viewerId) via SQL join — allowed deviation; added seq + index; backend 715)
Task 2: reviewer (sonnet) aa14b21e021953df6
Task 2: review Approved, spec ✅
Task 2: minor (deferred): latestFor not tested with several plan ids; no test re-added voter / user-delete cascade.
Carry to Task 3: `open` catches 23505 outside its transaction — inside reportIncidence's locked transaction a 23505 would abort the outer tx. Ruling: Task 3 calls findOpen inside the transaction that holds the plan FOR UPDATE and only then open (plan lock serializes reports, so the unique index is only a backstop) — cost if wrong: a 500 on an impossible race.
Task 2: complete (commits 1724d38..39500ed, review clean)
Task 3: BASE 39500ed
Task 3: dispatched implementer (opus) a676930560c8d6326
Task 3: STOPPED by user request (2026-11-13). Agent was mid-way ("now the routes"): repo/schemas/env/app/me.routes touched, express-vote.test.ts written, routes unfinished; not verified, not committed. Partial work (18 files incl. untracked backend/test/express-vote.test.ts) saved as `git stash` "wip votacion-expres Task 3 (agente detenido a medias, iba por las rutas)". On resume: `git stash pop`, re-dispatch a fresh Task 3 implementer (opus) with the brief + the Task 2 carry ruling + note about partial work. BASE 39500ed.
