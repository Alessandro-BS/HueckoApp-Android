# Task 1 report
Implemented backend/src/proposals/express-rules.ts (EXPRESS_OPTIONS, criticalReasonFor, expiresAtFor, quorumFor, tally) and shared types (ExpressOption, ExpressVote, Incidence.criticalReason, Proposal.expressVote).
Tie order in tally follows spec: MANTENER > REAGENDAR > CANCELAR.
RED: `npx vitest run test/express-rules.test.ts` -> "Test Files 1 failed, no tests" (module missing).
GREEN: 17 passed. Full backend: 705 tests pass after fixture fixes (initially 2 failed: proposals-lifecycle and proposals toEqual fixtures needing criticalReason/expressVote). Mobile jest: 79 suites, 611 pass. Root typecheck clean.
Transitional adapters: proposals.repository.ts returns `criticalReason: null` and `expressVote: null` with `// TODO(votacion-expres Task 2)`.
Fixtures adjusted: backend/test/{dashboard,proposals,proposals-lifecycle}.test.ts, mobile/src/testing/fixtures.ts.
Note: commit trailer uses "Claude Opus 5.5" per implementer-common.md.
