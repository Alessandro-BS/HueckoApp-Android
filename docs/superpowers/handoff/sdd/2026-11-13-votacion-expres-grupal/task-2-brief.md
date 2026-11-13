### Task 2: Tablas y repositorio de la votación

**Files:**
- Modify: `backend/src/db/migrations.ts` (migración 8), `backend/src/proposals/proposals.repository.ts` (hidratar
  `expressVote` y `criticalReason`)
- Create: `backend/src/proposals/express-votes.repository.ts`
- Test: `backend/test/migrations.test.ts`, `backend/test/express-votes.repository.test.ts`

**Interfaces:**
- Consumes: Task 1.
- Esquema (migración 8):
  - `incidences.critical_reason TEXT NULL`.
  - `express_votes (id TEXT PK, proposal_id TEXT NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
    reporter_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, reason TEXT NOT NULL, critical_reason TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('ABIERTA','CERRADA')), opened_at TEXT NOT NULL, expires_at TEXT NOT NULL,
    closed_at TEXT NULL, result TEXT NULL, result_by_default BOOLEAN NULL, recommendation TEXT NULL,
    recommendation_reason TEXT NULL)` (los `CHECK` de opción con `CANCELAR|REAGENDAR|MANTENER`; tipos de fecha como en
    `proposals`, sigue el patrón de la migración 3).
  - `CREATE UNIQUE INDEX express_votes_one_open ON express_votes (proposal_id) WHERE status = 'ABIERTA'`.
  - `express_vote_voters (vote_id TEXT REFERENCES express_votes(id) ON DELETE CASCADE, user_id TEXT REFERENCES users(id)
    ON DELETE CASCADE, option TEXT NULL, voted_at TEXT NULL, PRIMARY KEY (vote_id, user_id))` — una fila por votante
    fijado al abrir; `option` es su voto.
- Produces `expressVotesRepository(db)`:
  - `open(i: { proposalId; reporterId; reason; criticalReason; voterIds: string[]; openedAt: string; expiresAt: string }):
    Promise<string | null>` — `null` si ya hay una `ABIERTA` (violación de `express_votes_one_open`).
  - `castVote(voteId: string, userId: string, option: ExpressOption, at: string): Promise<void>`.
  - `findOpen(proposalId: string): Promise<{ id: string; expiresAt: string } | undefined>`.
  - `latestFor(proposalIds: readonly string[], viewerId: string, groupMemberIds: (proposalId: string) => ReadonlySet<string>):
    Promise<Map<string, ExpressVote>>` — la más reciente por plan; `counts`, `eligibleVoters`, `quorum`, `canVote`
    (`ABIERTA` + soy votante + sigo en el grupo) **solo con votantes que siguen**.
  - `saveRecommendation(voteId: string, option: ExpressOption, reason: string): Promise<boolean>` — solo si `ABIERTA`.
  - `deleteClosedFor(proposalId: string): Promise<void>`.
  - (El cierre llega en Task 3.)

- [ ] **Step 1: Write the failing tests**:
  - migración 8: existen las tablas y la columna; dos `ABIERTA` del mismo plan → 23505; dos `CERRADA` sí.
  - repositorio: `open` crea votación y votantes; segundo `open` del mismo plan → `null`; `castVote` cambia el voto;
    `latestFor` da `counts`, `myVote`, `canVote`, `quorum`; un votante que salió del grupo no cuenta en `counts`,
    `eligibleVoters` ni `quorum` y tiene `canVote: false`; `saveRecommendation` en `CERRADA` → `false`.
  - `GET /proposals/:id` trae `expressVote: null` y `incidences[].criticalReason: null` en un plan sin votación.
- [ ] **Step 2: Run** esos tests. Expected: FAIL.
- [ ] **Step 3: Implement** la migración, el repositorio y la hidratación en `proposals.repository.ts` (`hydrate` llama
  a `latestFor` con los miembros actuales del grupo).
- [ ] **Step 4: Run** `npm test -w backend` y `npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(backend): tablas de la votación exprés`

