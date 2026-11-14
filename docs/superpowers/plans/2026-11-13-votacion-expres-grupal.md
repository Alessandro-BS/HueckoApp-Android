# Votación exprés grupal — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Una ausencia crítica en un plan confirmado abre una votación del grupo (cancelar / reagendar / mantener) que
se cierra sola y aplica su resultado; la IA recomienda qué votar.

**Architecture:** Reglas puras (`express-rules.ts`) + un repositorio propio (`express-votes.repository.ts`) con dos
tablas nuevas; el cierre es perezoso: las rutas que leen planes llaman a `closeDue` antes de leer, en una transacción
con el plan bloqueado. La recomendación de IA se pide sin esperar (promesa suelta) y se guarda si la votación sigue
abierta. La app reemplaza el «Reprogramar / Cancelar / Mantener» de una persona por la tarjeta de votación.

**Tech Stack:** Express 5 + zod + `ApiError`, Postgres (Neon / PGlite) detrás de `Db`, Vitest + Supertest; Expo React
Native + TanStack Query, Jest.

**Spec:** `docs/superpowers/specs/2026-11-13-votacion-expres-grupal-design.md`

## Global Constraints

- Rama `feature/votacion-expres-grupal` (sale de `feature/franjas-con-fecha`). Commits convencionales en español con
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Sin push.
- Opciones exactas: `CANCELAR | REAGENDAR | MANTENER`. Estados de votación: `ABIERTA | CERRADA`.
- Criticidad (solo `FALTA` o `IMPREVISTO`), en este orden, primera que se cumple:
  «propuso este plan» (`createdBy`) → «el grupo lo marcó como imprescindible» (`isEssential`) →
  «es organizador del grupo» (`role === 'OWNER'`). Ninguna → no crítica. `TARDANZA` nunca es crítica.
- Ausencia crítica → `criticality: 'ALTA'`; las demás, `criticalityFor` como hoy.
- Plazo: `min(abierta + EXPRESS_VOTE_MINUTES, scheduledAt)`, nunca menos de `abierta + 5 min`.
  `EXPRESS_VOTE_MINUTES` entero positivo, por defecto **60**.
- Votan los miembros al abrir menos quien avisó; cuentan solo los que **siguen** en el grupo. Lista vacía al abrir →
  no se abre votación.
- Quórum = `min(2, votantes que siguen)`. Sin quórum → `MANTENER` con `resultByDefault: true`.
  Empate → `MANTENER` > `REAGENDAR` > `CANCELAR`.
- Cierra cuando votaron todos los votantes que siguen, o al vencer. Una sola `ABIERTA` por plan (índice único parcial).
- Resultado solo si el plan sigue `CONFIRMADO`: `CANCELAR` → `CANCELADO`; `MANTENER` → nada; `REAGENDAR` →
  `EN_RECOORDINACION` con `chosen_window_id`, `scheduled_at`, `scheduled_date` a `NULL` y votos de fecha borrados.
  Siempre: incidencias del plan `resolved = TRUE`.
- Reportar solo con el plan `CONFIRMADO` y la franja confirmada sin terminar; si no, `409 INVALID_STATE`
  «Solo se pueden reportar imprevistos de un plan confirmado.».
- Se retira `POST /proposals/:id/incidences/resolve` y `ResolveIncidencesInput`.
- `shared/index.d.ts` y `docs/api.md` cambian en el mismo commit que el endpoint. Migración nueva al final de
  `backend/src/db/migrations.ts` (la 8); nunca se edita una publicada.
- Fechas e instantes con `backend/src/common/zone.ts` / `mobile/src/utils/zone.ts`; nunca la zona del proceso ni del
  teléfono.
- Antes de cada commit: `npm run typecheck` (raíz) y los tests del workspace tocado (mobile: `npx jest --maxWorkers=2`).
- Bash: `export PATH="$HOME/.local/share/fnm:$PATH"; eval "$(fnm env --shell zsh)"`.

## Review Focus

1. **Dos lecturas a la vez cierran la misma votación vencida:** el resultado se aplica una sola vez. Test en Task 3
   (`interleave` antes del UPDATE de cierre).
2. **Aviso a pocos minutos del inicio:** con `scheduledAt` en 2 min, `expiresAt = abierta + 5 min`. Test en Task 1.
3. **Votante que se va del grupo con la votación abierta:** no puede votar (`403`), deja de contar para «votaron
   todos» y para el quórum. Test en Task 3.
4. **Quien gestiona cancela con la votación abierta:** al cerrarse después no resucita el plan (sigue `CANCELADO`).
   Test en Task 3.
5. **La IA falla o responde tarde:** reportar responde `201` igual; una sugerencia que llega con la votación ya
   cerrada se descarta. Test en Task 5.

---

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

### Task 4: Salir de la recoordinación

**Files:**
- Modify: `backend/src/proposals/proposals.routes.ts` (`/replan`), `backend/src/proposals/proposals.repository.ts`
  (`replanWindows`), `docs/api.md` (§replan)
- Test: `backend/test/proposals-replan.test.ts`

**Interfaces:**
- Consumes: Task 2 (`deleteClosedFor`), Task 3.
- Produces: `POST /proposals/:id/replan` acepta `PROPUESTO` **o** `EN_RECOORDINACION` (mismas reglas y guardia atómica
  `WHERE state = ANY(...)`); desde `EN_RECOORDINACION` además borra las incidencias del plan y sus votaciones
  cerradas, en la misma transacción. Pasa a `PROPUESTO`.

- [ ] **Step 1: Write the failing tests**: replantear en `EN_RECOORDINACION` → `200`, `PROPUESTO`, franjas nuevas,
  `incidences: []`, `expressVote: null`; en `CANCELADO` → `409`; quien no gestiona → `403`; cancelar en
  `EN_RECOORDINACION` → `CANCELADO`.
- [ ] **Step 2: Run**. Expected: FAIL.
- [ ] **Step 3: Implement**.
- [ ] **Step 4: Run** `npm test -w backend` y `npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(backend): replantear un plan en recoordinación`

### Task 5: Recomendación de la IA

**Files:**
- Create: `backend/src/ai/express-recommendation.ts`
- Modify: `backend/src/ai/ai-client.ts` (`AI_TASKS` + `'express-recommendation'`), `backend/src/ai/mock-client.ts`,
  `backend/src/proposals/proposals.routes.ts` (disparo tras abrir), `shared/index.d.ts` (`AiTask`), `docs/api.md`
  (§IA y §votación exprés)
- Test: `backend/test/ai-express-recommendation.test.ts`

**Interfaces:**
- Consumes: `askAi` (`backend/src/ai/ask-ai.ts`), el registrador de `ai_calls` con el `userId` de quien avisó,
  `saveRecommendation` (Task 2).
- Produces: `recommendExpressVote(deps: { ai; record; votes }, input: { voteId; planTitle; location: string | null;
  startsAt: string; hoursLeft: number; reason; criticalReason; eligibleVoters: number; defaultResult: 'MANTENER' }):
  Promise<void>` — nunca lanza; prompt en español con esos datos; respuesta validada con zod
  `{ option: ExpressOption; reason: string (1–300, trim) }`; solo nombres y datos del plan, nunca correos.
  La ruta lo llama **sin `await`** tras responder la creación (`void recommendExpressVote(...)`); en tests se espera
  con un hook o promesa expuesta.

- [ ] **Step 1: Write the failing tests**: con el cliente simulado, tras reportar una ausencia crítica,
  `expressVote.recommendation` aparece con `option` y `reason`; IA que lanza → reportar `201` y `recommendation: null`
  (Review Focus 5); IA con opción inválida → `null`; votación cerrada antes de que llegue → no se guarda
  (Review Focus 5); `ai_calls` tiene una fila `express-recommendation` con el `userId` de quien avisó; el prompt no
  contiene correos.
- [ ] **Step 2: Run**. Expected: FAIL.
- [ ] **Step 3: Implement**.
- [ ] **Step 4: Run** `npm test -w backend` y `npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(backend): la IA recomienda qué votar en la votación exprés`

### Task 6: Inicio con la votación exprés

**Files:**
- Modify: `backend/src/dashboard/dashboard.ts`, `shared/index.d.ts` (`ExpressAlert.kind`), `docs/api.md` (§dashboard)
- Test: `backend/test/dashboard.test.ts`

**Interfaces:**
- Produces: `ExpressAlert.kind: 'VOTACION' | 'RECOORDINACION' | 'AVISO'`. Prioridad entre planes que aún no
  ocurrieron: el primero con votación `ABIERTA` (`VOTACION`; `who`/`reason` de la votación), si no el primero
  `EN_RECOORDINACION` (`RECOORDINACION`), si no el primero `CONFIRMADO` con incidencias sin resolver (`AVISO`).
  `canResolve` = `canManage`. `ExpressAlert` añade `expiresAt: string | null` (solo `VOTACION`).

- [ ] **Step 1: Write the failing tests**: votación abierta → `kind: 'VOTACION'` con `expiresAt`; plan reagendado →
  `RECOORDINACION`; ausencia no crítica → `AVISO`; una votación vencida se cierra antes de armar Inicio (la alerta
  refleja el resultado).
- [ ] **Step 2: Run**. Expected: FAIL.
- [ ] **Step 3: Implement**.
- [ ] **Step 4: Run** `npm test -w backend` y `npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(backend): Inicio avisa de la votación exprés`

### Task 7: La votación en la app

**Files:**
- Modify: `mobile/src/api/proposals.ts` (`voteExpress`; quitar `resolveIncidences`), `mobile/src/hooks/useProposal.ts`,
  `mobile/src/screens/proposals/ExpressVoteCard.tsx`, `mobile/src/screens/proposals/ReportIncidenceSheet.tsx`,
  `mobile/src/screens/proposals/PlanDetailScreen.tsx`, `mobile/src/testing/fixtures.ts`
- Test: `__tests__` de esos archivos

**Interfaces:**
- Consumes: Tasks 3–5 (`PUT /proposals/:id/express-vote`, `Proposal.expressVote`), `ReplanSheet` y `replanProposal`
  (fase 1), `mobile/src/utils/zone.ts`.
- Produces: `voteExpress(id: string, option: ExpressOption): Promise<Proposal>`; `useProposal().voteExpress(option)`.
  `ExpressVoteCard({ proposal, now? })`:
  - `ABIERTA`: quién avisó, motivo y `criticalReason`; tres botones «Cancelar», «Reagendar», «Mantener» con su
    recuento, marcado el mío, desactivados si `!canVote`; tiempo restante («Cierra en 42 min»); la sugerencia de la IA
    («Huecko sugiere: Reagendar — …») si hay.
  - `CERRADA`: «El grupo decidió: Reagendar» o «Sin quórum: el plan se mantiene» (`resultByDefault`).
  - Plan `EN_RECOORDINACION` y `canManage`: botón «Proponer franjas» que abre `ReplanSheet` → `replanProposal`.
  - Quien gestiona conserva «Cancelar plan» (flujo de cancelar existente).
  - `ReportIncidenceSheet`: tras reportar, si se abrió votación, «Se abrió una votación del grupo»; si no, «Avisamos al
    grupo».

- [ ] **Step 1: Write the failing tests**: votar «Reagendar» llama a `voteExpress('p1','REAGENDAR')`; botones
  desactivados para quien avisó; muestra recuento y «Cierra en 42 min» con `now` fijo; muestra la sugerencia;
  `CERRADA` sin quórum muestra «Sin quórum: el plan se mantiene»; en `EN_RECOORDINACION` quien gestiona ve «Proponer
  franjas» y envía `replanProposal`; quien no gestiona no lo ve.
- [ ] **Step 2: Run** `npx jest --maxWorkers=2 ExpressVoteCard ReportIncidence PlanDetail useProposal endpoints`.
  Expected: FAIL.
- [ ] **Step 3: Implement**; quita todo uso de `resolveIncidences` y los `TODO(votacion-expres Task 7)`.
- [ ] **Step 4: Run** `npx jest --maxWorkers=2` y `npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(mobile): votar en la votación exprés del grupo`

### Task 8: Inicio de la app y documentación

**Files:**
- Modify: `mobile/src/screens/dashboard/DashboardScreen.tsx` (y su tarjeta de alerta), `README.md`, `docs/api.md`
  (repaso: «Quién gestiona un plan» ya no menciona resolver imprevistos)
- Test: `mobile/src/screens/dashboard/__tests__/DashboardScreen.test.tsx`

**Interfaces:**
- Consumes: Task 6 (`ExpressAlert.kind`, `expiresAt`).
- Produces: alerta `VOTACION` «Votación exprés: {who} no puede ir» con «Cierra en N min» y botón «Votar» que abre el
  plan; `RECOORDINACION` «El grupo decidió reagendar» con «Proponer franjas» si `canResolve`; `AVISO` como hoy.

- [ ] **Step 1: Write the failing tests** de los tres tipos de alerta.
- [ ] **Step 2: Run**. Expected: FAIL.
- [ ] **Step 3: Implement** y actualiza README (funcionalidad «Imprevistos»: decide el grupo; recuento de tests de la
  salida real de `npm test`).
- [ ] **Step 4: Run** `npm run typecheck` y `npm test` desde la raíz. Expected: PASS.
- [ ] **Step 5: Commit** `feat(mobile): Inicio avisa de la votación exprés`
