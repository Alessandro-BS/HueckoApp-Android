### Task 3: Reportar, votar y cerrar

**Files:**
- Modify: `backend/src/proposals/proposals.routes.ts`, `backend/src/proposals/proposals.repository.ts`
  (`reportIncidence` sin `escalate`; quitar `resolveIncidences`), `backend/src/proposals/proposals.schemas.ts`
  (quitar `resolveIncidencesSchema`; `expressVoteInputSchema`), `backend/src/proposals/express-votes.repository.ts`
  (cierre), `backend/src/me/me.routes.ts` (la lista del grupo, `GET /groups/:id/proposals`, también vive en
  `proposals.routes.ts`),
  `backend/src/config/env-schema.ts` (`EXPRESS_VOTE_MINUTES`), `backend/src/app.ts` (dependencia `expressVoteMinutes`),
  `shared/index.d.ts` (`ExpressVoteInput`, quitar `ResolveIncidencesInput`), `docs/api.md` (§incidencias, §votación
  exprés nueva, quitar §resolve, códigos)
- Test: `backend/test/express-vote.test.ts` (nuevo), tests existentes de incidencias/resolve (adaptar o borrar)

**Interfaces:**
- Consumes: Tasks 1–2.
- Produces:
  - `expressVotesRepository.closeDue(proposalId: string, now: Date): Promise<boolean>` — en `db.transaction`: bloquea
    el plan (`SELECT … FROM proposals WHERE id=$1 FOR UPDATE`), luego la votación `ABIERTA` (`FOR UPDATE`); si venció
    o votaron todos los votantes que siguen, `tally`, la marca `CERRADA` (`closed_at`, `result`, `result_by_default`),
    aplica el resultado según Global Constraints y resuelve las incidencias. `true` si cerró.
  - `expressVotesRepository.closeDueInScope(scope: { groupId: string } | { userId: string }, now: Date): Promise<void>` —
    `closeDue` de cada votación `ABIERTA` del alcance **vencida** (`expires_at <= now`); un error se registra con
    `console.error` (salvo `NODE_ENV=test`) y no corta la lectura.
  - `PUT /proposals/:id/express-vote` con `ExpressVoteInput = { option: ExpressOption }` → `200 Proposal`.
    Errores: `409 VOTING_CLOSED` «La votación ya cerró.» (sin votación abierta o vencida); `403 NOT_A_VOTER`
    «No puedes votar en esta votación.» (quien avisó, no votante o ya no es miembro); `400 VALIDATION_ERROR`.
    Tras guardar el voto llama a `closeDue` (cierre anticipado).
  - `POST /proposals/:id/incidences`: `ExpressVoteMinutes` de la config; `criticalReasonFor`; guarda la incidencia con
    `criticality` (`ALTA` si crítica) y `critical_reason`; si crítica y hay votantes y no hay otra abierta, `open` con
    `expiresAtFor(now, scheduledAt, minutes)`. Mismo bloqueo del plan que hoy (todo o nada).
  - Lecturas que cierran antes de leer: `GET /proposals/:id`, `GET /groups/:id/proposals`, `GET /me/dashboard`,
    `GET /me/upcoming-plans`, y `POST /incidences` (antes de comprobar estado).

- [ ] **Step 1: Write the failing tests** (reloj inyectable):
  - reportar `FALTA` del creador → `201`, `criticality: 'ALTA'`, `criticalReason: 'propuso este plan'`,
    `expressVote.status: 'ABIERTA'`, estado sigue `CONFIRMADO`.
  - `FALTA` de un miembro común → no abre votación, `criticality: 'MEDIA'`; `TARDANZA` del creador → no abre.
  - reportar en `EN_RECOORDINACION` → `409`; reportar con la franja confirmada ya terminada → `409`.
  - segunda ausencia crítica con una abierta → `201`, se guarda, sigue una sola votación.
  - quien avisa está solo en el grupo → no se abre votación.
  - votar: quien avisó → `403 NOT_A_VOTER`; opción inválida → `400`; votar cambia el voto.
  - cierre anticipado: grupo de 3 (avisa 1), votan 2 `CANCELAR` → plan `CANCELADO`, votación `CERRADA`, incidencias
    `resolved`.
  - vencida sin quórum: avanza el reloj 61 min, `GET /proposals/:id` → `MANTENER` `resultByDefault: true`, sigue
    `CONFIRMADO`.
  - `REAGENDAR` gana → `EN_RECOORDINACION`, `chosenWindowId`/`scheduledAt`/`scheduledDate` `null`, sin votos de fecha.
  - votar con la votación vencida → `409 VOTING_CLOSED`.
  - **Review Focus 1:** `interleave` hace un segundo `closeDue` justo antes del UPDATE de cierre → resultado aplicado
    una vez (un único `CERRADA`, estado coherente).
  - **Review Focus 3:** votante que salió del grupo → `403`; con los demás votos, cierra como si no estuviera.
  - **Review Focus 4:** quien gestiona cancela con la votación abierta; vence y `GET` → plan `CANCELADO`, votación
    `CERRADA`.
  - `GET /me/dashboard` con una vencida la cierra antes de responder.
  - `POST /incidences/resolve` ya no existe → `404`.
- [ ] **Step 2: Run** `npx vitest run test/express-vote.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** según las interfaces; borra `resolveIncidences`, su schema y sus tests.
- [ ] **Step 4: Run** `npm test -w backend` y `npm run typecheck`. Si la app deja de compilar por quitar
  `ResolveIncidencesInput`, adaptador mínimo marcado `// TODO(votacion-expres Task 7)`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(backend): el grupo vota qué hacer con una ausencia crítica`

