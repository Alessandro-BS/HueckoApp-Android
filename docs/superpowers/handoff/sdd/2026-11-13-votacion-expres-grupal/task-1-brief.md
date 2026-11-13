### Task 1: Reglas puras de la votación exprés

**Files:**
- Create: `backend/src/proposals/express-rules.ts`
- Modify: `shared/index.d.ts` (tipos de la votación)
- Test: `backend/test/express-rules.test.ts`

**Interfaces:**
- Produces (shared): `ExpressOption = 'CANCELAR' | 'REAGENDAR' | 'MANTENER'`;
  `ExpressVote = { id; status: 'ABIERTA' | 'CERRADA'; reportedBy: User; reason: string; criticalReason: string;
  openedAt: string; expiresAt: string; closedAt: string | null; counts: Record<ExpressOption, number>;
  myVote: ExpressOption | null; canVote: boolean; eligibleVoters: number; quorum: number;
  result: ExpressOption | null; resultByDefault: boolean | null;
  recommendation: { option: ExpressOption; reason: string } | null }`; `Incidence.criticalReason: string | null`;
  `Proposal.expressVote: ExpressVote | null`. (Los campos nuevos de `Proposal`/`Incidence` se rellenan en Task 2–3;
  mientras, el repositorio devuelve `null`.)
- Produces (backend): `EXPRESS_OPTIONS`; `criticalReasonFor(i: { type: IncidenceType; reporterId: string;
  createdById: string; isEssential: boolean; role: 'OWNER' | 'MEMBER' }): string | null`;
  `expiresAtFor(openedAt: Date, scheduledAt: string | null, minutes: number): string` (ISO);
  `quorumFor(eligible: number): number`;
  `tally(options: readonly ExpressOption[], eligible: number): { result: ExpressOption; byDefault: boolean }`.

- [ ] **Step 1: Write the failing tests** (`describe('reglas de la votación exprés')`):
  - `criticalReasonFor`: creador → «propuso este plan» aunque también sea imprescindible y OWNER; imprescindible →
    «el grupo lo marcó como imprescindible»; OWNER → «es organizador del grupo»; ninguno → `null`; `TARDANZA` del
    creador → `null`.
  - `expiresAtFor(abierta 10:00Z, scheduledAt 15:00Z, 60)` → `11:00Z`; con `scheduledAt 10:30Z` → `10:30Z`; con
    `scheduledAt 10:02Z` → `10:05Z` (Review Focus 2); con `scheduledAt` ya pasado → `10:05Z`; con `null` → `11:00Z`.
  - `quorumFor`: 0→0, 1→1, 2→2, 6→2.
  - `tally`: `[]` con 6 → `MANTENER` byDefault; `['CANCELAR']` con 6 → `MANTENER` byDefault; `['CANCELAR']` con 1 →
    `CANCELAR` no byDefault; `['CANCELAR','CANCELAR','REAGENDAR']` → `CANCELAR`; `['CANCELAR','REAGENDAR']` →
    `REAGENDAR`; `['CANCELAR','MANTENER']` → `MANTENER`.
- [ ] **Step 2: Run** `npx vitest run test/express-rules.test.ts` en `backend/`. Expected: FAIL (módulo no existe).
- [ ] **Step 3: Implement** las funciones y los tipos de shared (con `expressVote: ExpressVote | null` en `Proposal`
  y `criticalReason` en `Incidence`; el repositorio de propuestas devuelve `expressVote: null` y
  `criticalReason: null` hasta Task 2 — ajusta fixtures de tests backend/mobile que construyan `Proposal`/`Incidence`).
- [ ] **Step 4: Run** `npm test -w backend`, `cd mobile && npx jest --maxWorkers=2`, `npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(backend): reglas de la votación exprés`

