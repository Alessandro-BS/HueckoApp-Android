# Franjas con fecha — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cada franja de una propuesta tiene fecha concreta (semana elegida + día + horas), la disponibilidad de una semana
cuenta los horarios puntuales, y confirmar, reprogramar y replantear trabajan con esas fechas.

**Architecture:** Se añade `date` a `proposal_windows` y se conserva `day_of_week` derivado, para reutilizar el cálculo
semanal de `availability/matcher.ts`. Un módulo de zona fija (America/Lima) da «hoy», lunes y el instante de una
fecha+hora, en el backend y en la app. Las rutas de propuestas validan las franjas con reglas nuevas (2–5, futuras, sin
solapes, plazo antes de la primera).

**Tech Stack:** Express 5 + zod + PostgreSQL (Neon / PGlite) + Vitest; Expo SDK 57 + React Navigation + TanStack Query + Jest.

**Spec:** `docs/superpowers/specs/2026-11-10-franjas-con-fecha-design.md`

## Global Constraints

- Rama `feature/franjas-con-fecha` (sale de `feature/unirse-por-proximidad`). Commits convencionales en español
  (`feat(backend): …`, `feat(mobile): …`), con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Zona horaria fija: `APP_TIME_ZONE = 'America/Lima'`. Nunca `TZ` del proceso ni la zona del celular.
- Semanas válidas: la del lunes de hoy y las 3 siguientes (lunes ∈ `[mondayOf(today), mondayOf(today) + 21 días]`).
  `week` se normaliza al lunes; fuera de rango → `400 VALIDATION_ERROR`.
- Franjas: `date` `YYYY-MM-DD` real dentro de las semanas válidas; `HH:mm`; `startTime < endTime`; inicio posterior a
  ahora; sin repetidas ni solapadas el mismo día; **2 a 5** al crear a mano, al reprogramar y al replantear; añadir una
  solo si el total queda ≤ 5 y empieza después del plazo vigente.
- `votingDeadline` futuro y **anterior al inicio de la primera franja**.
- El % no tiene mínimo: solo informa.
- Errores de franjas y plazo: `400 VALIDATION_ERROR` con mensajes distintos. Códigos 409 nuevos: `WINDOW_STARTED`.
  Se mantienen `NO_COMMON_WINDOWS`, `WINDOW_EXISTS`, `NO_VOTES`, `INVALID_STATE`, `NOT_MANAGER`.
- Bloques `LIBRE` (recurrentes o puntuales) no ocupan.
- Migraciones: se añade una al final de `backend/src/db/migrations.ts`, nunca se edita una publicada.
- `shared/index.d.ts` y `docs/api.md` cambian en el mismo commit que el endpoint.
- Antes de cada commit: `npm run typecheck` (raíz) y los tests del workspace tocado. Mobile: `npx jest --maxWorkers=2`.
- Bash: `export PATH="$HOME/.local/share/fnm:$PATH"; eval "$(fnm env --shell zsh)"`.

## Review Focus

1. **Render corre en UTC:** a las 20:00 de Lima ya es el día siguiente en UTC; «hoy», el lunes y `instant` no deben
   correrse. Test en Task 1 (reloj a las 23:30 de Lima de un domingo) y en Task 4 (franja de hoy a las 22:00 aceptada).
2. **Semana actual con días ya pasados:** proponer el lunes estando a jueves se rechaza en el servidor y la app lo
   desactiva. Tests en Task 4 y Task 8.
3. **Propuesta migrada con todas sus franjas en el pasado:** se puede replantear; confirmar da `WINDOW_STARTED`.
   Tests en Task 2 (backfill) y Task 5.
4. **Puntual de otra semana:** un puntual del jueves 20 no ocupa el jueves 13 ni el 27. Test en Task 3.
5. **Borrador de IA con menos de 2 opciones:** se completa con las mejores de la semana; si no hay 2, `409`. Test en Task 6.

---

### Task 1: Zona fija y fechas (backend)

**Files:**
- Create: `backend/src/common/zone.ts`
- Test: `backend/test/zone.test.ts`

**Interfaces:**
- Produces (todas puras; fechas como `'YYYY-MM-DD'`):
  - `APP_TIME_ZONE = 'America/Lima'`
  - `today(now: Date): string` — fecha en Lima.
  - `isoDay(date: string): number` — 1 = lunes … 7 = domingo.
  - `addDays(date: string, days: number): string`
  - `mondayOf(date: string): string`
  - `instant(date: string, time: string): Date` — `date` a las `time` en Lima.
  - `validWeeks(now: Date): string[]` — los 4 lunes válidos, en orden.
  - `isRealDate(date: string): boolean` (mover aquí el de `schedule/time-blocks.schemas.ts:9-12` y reexportarlo allí).

- [ ] **Step 1: Write the failing tests** (`zone.test.ts`):
  - `today usa Lima, no UTC`: `today(new Date('2026-11-16T04:30:00Z'))` → `'2026-11-15'` (domingo 23:30 en Lima).
  - `mondayOf`: `mondayOf('2026-11-15')` → `'2026-11-09'`; `mondayOf('2026-11-16')` → `'2026-11-16'`.
  - `isoDay('2026-11-15')` → `7`; `addDays('2026-11-30', 1)` → `'2026-12-01'`.
  - `instant('2026-11-20', '16:00').toISOString()` → `'2026-11-20T21:00:00.000Z'`.
  - `validWeeks(new Date('2026-11-16T04:30:00Z'))` → `['2026-11-09','2026-11-16','2026-11-23','2026-11-30']`.
  - `isRealDate('2026-02-30')` → `false`.
- [ ] **Step 2: Run** `npx vitest run test/zone.test.ts` en `backend/`. Expected: FAIL (módulo no existe).
- [ ] **Step 3: Implement** con `Intl.DateTimeFormat('en-CA', { timeZone: APP_TIME_ZONE })` para `today`; aritmética de
  fechas en UTC (`Date.UTC`) para `addDays`/`isoDay`; `instant` con offset fijo `-05:00` (Lima no tiene horario de
  verano; dejarlo comentado).
- [ ] **Step 4: Run** el test y `npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(backend): zona horaria fija de Lima para fechas y semanas`

### Task 2: Columna `date` en las franjas y migración

**Files:**
- Modify: `backend/src/db/migrations.ts` (migración 7), `backend/src/proposals/proposals.repository.ts`
  (`WindowRow`, `NewWindow`, `toWindow`, SELECT/INSERT, `ORDER BY w.date, w.start_time`), `shared/index.d.ts`
  (`TimeWindow.date`), `backend/src/db/demo-data.ts`
- Test: `backend/test/migrations.test.ts`, `backend/test/proposals.repository.test.ts` (o el que cubra el repositorio)

**Interfaces:**
- Consumes: `isoDay` (Task 1).
- Produces:
  - `NewWindow = { date: string; startTime: string; endTime: string; availabilityPercentage: number }` — el repositorio
    guarda `day_of_week = isoDay(date)`.
  - `TimeWindow` añade `date: string` (se mantiene `dayOfWeek`).
  - Repositorio: `replaceWindows(proposalId: string, windows: NewWindow[], votingDeadline: string): Promise<void>` —
    en una transacción borra votos y franjas, inserta las nuevas, limpia `chosen_window_id`/`scheduled_*`, pone el plazo.

- [ ] **Step 1: Write the failing tests**:
  - `migración 7: la franja elegida toma scheduled_date`: insertar con el esquema de la migración 6 una propuesta
    confirmada (`scheduled_date '2026-11-19'`, franja `day_of_week 4`) → tras migrar, `date = '2026-11-19'`.
  - `migración 7: las demás toman la próxima ocurrencia desde la creación en Lima`: propuesta creada
    `'2026-11-10T15:00:00.000Z'` (martes en Lima) con franja `day_of_week 4` → `'2026-11-12'`; con `day_of_week 2` →
    `'2026-11-10'`.
  - `migración 7: date es NOT NULL y el UNIQUE es por (proposal_id, date, start_time, end_time)`.
  - `los votos sobreviven a la migración`.
  - Repositorio: `insert guarda day_of_week derivado de date`; `findById ordena por fecha y hora`;
    `replaceWindows borra votos y franjas viejas y limpia la confirmación`.
- [ ] **Step 2: Run** `npx vitest run test/migrations.test.ts test/proposals.repository.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** la migración 7 (SQL multi-sentencia):
  `ADD COLUMN date TEXT COLLATE "C"`; backfill de la elegida desde `proposals.scheduled_date`; el resto:
  `d := (p.created_at::timestamptz AT TIME ZONE 'America/Lima')::date` y
  `d + ((w.day_of_week - EXTRACT(ISODOW FROM d)::int + 7) % 7)` formateado `YYYY-MM-DD`; `SET NOT NULL`; quitar el
  `UNIQUE` viejo (buscar su nombre real en el catálogo, en PGlite y Neon es el autogenerado) y crear el nuevo.
  Actualizar el repositorio y la semilla (franjas con fecha dentro de las semanas válidas, usando `today`/`addDays`).
- [ ] **Step 4: Run** `npm test -w backend` y `npm run typecheck`. Expected: PASS (los tests que aún construyen
  `NewWindow` con `dayOfWeek` se ajustan en el helper de `backend/test/helpers.ts`).
- [ ] **Step 5: Commit** `feat(backend): fecha en las franjas de las propuestas`

### Task 3: Disponibilidad de una semana concreta

**Files:**
- Modify: `backend/src/availability/group-availability.ts`, `backend/src/schedule/time-blocks.repository.ts`,
  `backend/src/groups/groups.routes.ts` (`GET /:id/availability`), `shared/index.d.ts` (`MatchWindow.date`),
  `docs/api.md` (§availability: quitar «los puntuales no entran…»)
- Test: `backend/test/window-availability.test.ts`, `backend/test/groups-availability.test.ts` (o el existente de esa ruta)

**Interfaces:**
- Consumes: `mondayOf`, `addDays`, `isoDay`, `instant`, `validWeeks`, `today` (Task 1).
- Produces:
  - `MatchWindow` añade `date: string`.
  - `weekAvailability(group: MatcherGroup, blocks: readonly TimeBlock[], week: string, now: Date): MatchWindow[]` —
    para cada día de la semana: `windowsFor` con los recurrentes de ese `isoDay` + los puntuales de esa fecha
    (no `LIBRE`); cada `MatchWindow` lleva su `date`; descarta las que ya empezaron (`instant(date,startTime) <= now`).
  - `windowAvailability(group, blocks, window: { date: string; startTime: string; endTime: string }): number` — mismos
    redondeos; recurrentes de `isoDay(date)` + puntuales con `b.date === date`.
  - `groupWeekWindows(group: Group, blocks: TimeBlocksRepository, week: string, now: Date): Promise<MatchWindow[]>`
    (reemplaza a `groupWindows`).
  - Repositorio: `listForUsersInRange(userIds: readonly string[], from: string, to: string): Promise<TimeBlock[]>` —
    recurrentes + puntuales con `date` en `[from, to]`.
  - `parseWeek(value: unknown, now: Date): string` (en `group-availability.ts` o un `week.schema.ts`): zod; por defecto
    `mondayOf(today(now))`; normaliza con `mondayOf`; fuera de `validWeeks(now)` → `ZodError` (sale como
    `400 VALIDATION_ERROR`, mensaje «Elige una semana entre esta y las próximas 3»).
  - `GET /groups/:id/availability?week=YYYY-MM-DD`.

- [ ] **Step 1: Write the failing tests**:
  - `un puntual del jueves 20 ocupa solo esa fecha`: semana del 16 → el jueves 20 baja de %; semanas del 9 y del 23 no.
  - `un puntual LIBRE no ocupa`.
  - `windowAvailability de una fecha suma recurrentes de su día y puntuales de esa fecha`.
  - `en la semana actual no se ofrecen franjas que ya empezaron` (now jueves 15:30 Lima → nada del lunes–miércoles
    ni las de jueves que empiezan antes de 15:30).
  - Ruta: `sin week usa la semana actual`; `week=2026-11-19 se normaliza al lunes 16`; `week fuera de las 4 → 400`;
    cada ventana trae `date`.
- [ ] **Step 2: Run** esos tests. Expected: FAIL.
- [ ] **Step 3: Implement** según las interfaces. `matcher.ts` no cambia.
- [ ] **Step 4: Run** `npm test -w backend` y `npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(backend): disponibilidad de una semana con los horarios puntuales`

### Task 4: Crear, añadir y confirmar con fechas

**Files:**
- Modify: `backend/src/proposals/proposals.schemas.ts`, `backend/src/proposals/proposals.routes.ts`,
  `backend/src/proposals/rules.ts`, `shared/index.d.ts` (`TimeWindowInput`, `ProposalInput.week`), `docs/api.md`
  (§crear propuesta, §windows, §confirm, códigos)
- Test: `backend/test/proposals*.test.ts`, `backend/test/proposal-rules.test.ts`

**Interfaces:**
- Consumes: Tasks 1–3 (`instant`, `validWeeks`, `windowAvailability`, `weekAvailability`, `parseWeek`, `NewWindow`).
- Produces:
  - `TimeWindowInput = { date: string; startTime: string; endTime: string }`.
  - `ProposalInput` añade `week?: string` (solo se usa con `windows` vacío o ausente).
  - `windowsSchema(now: Date, { min: 2, max: 5 })`: lista de franjas con todas las reglas de Global Constraints
    (mensajes: «La franja ya empezó», «Hay franjas repetidas», «Hay franjas que se solapan el mismo día»,
    «Elige entre 2 y 5 franjas», «Elige una fecha entre esta semana y las próximas 3»).
  - `assertDeadlineBeforeWindows(deadline: string, windows: readonly { date: string; startTime: string }[]): void`
    → `400 VALIDATION_ERROR` «La votación debe cerrar antes de la primera franja».
  - `rules.ts`: `scheduleFor(date: string, startTime: string): { scheduledAt: string; scheduledDate: string }` (sin
    «próxima ocurrencia»; se borran `nextOccurrence` e `isoDayOf` si nadie más los usa); `pickWinner` y `bestWindows`
    desempatan por `date` y luego `startTime` (en vez de `dayOfWeek`).
- Reglas de ruta:
  - Crear: con `windows` → `windowsSchema` + plazo; sin `windows` → `bestWindows(weekAvailability(..., week))`; si
    salen menos de 2 → `409 NO_COMMON_WINDOWS`; el plazo también se valida contra las elegidas.
  - `POST /proposals/:id/windows`: una franja (mismas reglas individuales), `WINDOW_EXISTS` por
    `(date,startTime,endTime)`, solapada con una existente → 400, total > 5 → 400 «Máximo 5 franjas», debe empezar
    después del `votingDeadline` vigente → 400.
  - Confirmar: si la franja elegida ya empezó (`instant <= now`) → `409 WINDOW_STARTED` «Esa franja ya empezó:
    replantea la propuesta.»; si no, `scheduleFor(chosen.date, chosen.startTime)`.

- [ ] **Step 1: Write the failing tests** (ajustando el helper de `backend/test/helpers.ts` para franjas con fecha):
  - `crear con 1 franja → 400`; `con 6 → 400`; `con 2 válidas → 201 y cada franja trae date y dayOfWeek`.
  - `una franja de hoy a las 22:00 (now 21:30 UTC = 16:30 Lima) se acepta` (Review Focus 1).
  - `una franja del lunes estando a jueves → 400 «La franja ya empezó»` (Review Focus 2).
  - `dos franjas solapadas el mismo día → 400`; `plazo después de la primera franja → 400`.
  - `sin franjas con week elige hasta 3 de esa semana`; `si hay menos de 2 → 409 NO_COMMON_WINDOWS`.
  - `añadir una franja que empieza antes del plazo → 400`; `añadir la sexta → 400`; `repetida → 409 WINDOW_EXISTS`.
  - `confirmar guarda scheduledAt = instant(date,startTime) y scheduledDate = date`.
  - `confirmar una franja que ya empezó → 409 WINDOW_STARTED`.
  - `pickWinner desempata por fecha más temprana`.
- [ ] **Step 2: Run** esos tests. Expected: FAIL.
- [ ] **Step 3: Implement** según las interfaces.
- [ ] **Step 4: Run** `npm test -w backend` y `npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(backend): propuestas con franjas fechadas (2 a 5)`

### Task 5: Reprogramar y replantear con franjas nuevas

**Files:**
- Modify: `backend/src/proposals/proposals.schemas.ts` (`resolveIncidencesSchema`, `replanSchema`),
  `backend/src/proposals/proposals.routes.ts`, `shared/index.d.ts` (`ResolveIncidencesInput.windows`,
  `ReplanInput`), `docs/api.md` (§resolve, §replan nuevo)
- Test: `backend/test/proposals-incidences.test.ts` (o el que cubra resolve), `backend/test/proposals-replan.test.ts`

**Interfaces:**
- Consumes: `windowsSchema`, `assertDeadlineBeforeWindows` (Task 4), `replaceWindows` (Task 2), `windowAvailability` (Task 3).
- Produces:
  - `ResolveIncidencesInput` con `newState: 'PROPUESTO'` exige `votingDeadline` y `windows` (2–5). Con los otros
    estados ambos se ignoran.
  - `POST /proposals/:id/replan` con `ReplanInput = { votingDeadline: string; windows: TimeWindowInput[] }`: solo quien
    gestiona (`NOT_MANAGER`), solo en `PROPUESTO` (`INVALID_STATE`); `replaceWindows` y devuelve la propuesta.

- [ ] **Step 1: Write the failing tests**:
  - `reprogramar sin windows → 400`; `con windows válidas reemplaza franjas, borra votos y vuelve a PROPUESTO`.
  - `replantear una propuesta migrada con todas las franjas pasadas funciona` (Review Focus 3).
  - `replantear en CONFIRMADO → 409 INVALID_STATE`; `quien no gestiona → 403 NOT_MANAGER`.
  - `replantear con plazo después de la primera franja → 400`.
- [ ] **Step 2: Run** esos tests. Expected: FAIL.
- [ ] **Step 3: Implement** según las interfaces.
- [ ] **Step 4: Run** `npm test -w backend` y `npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(backend): reprogramar y replantear con franjas nuevas`

### Task 6: IA e Inicio con fechas

**Files:**
- Modify: `backend/src/ai/plan-context.ts`, `backend/src/ai/plan-ideas.ts`, `backend/src/ai/ai.routes.ts`,
  `backend/src/ai/voting-summary.ts`, `backend/src/dashboard/dashboard.ts`, `shared/index.d.ts`
  (`ProposalDraftInput.week?`, `DashboardGroup.nextWindow.date`, comentario de `ProposalDraft.windows` «2–5»),
  `docs/api.md` (§IA, §dashboard)
- Test: `backend/test/ai-*.test.ts`, `backend/test/dashboard.test.ts`

**Interfaces:**
- Consumes: `groupWeekWindows`, `bestWindows`, `parseWeek`, `instant` (Tasks 1–4).
- Produces:
  - Borrador y sugerencias aceptan `week?` en el cuerpo. Sin `week`, los candidatos son los de la semana actual y la
    siguiente (los que no empezaron), como máximo `MAX_AI_WINDOWS`.
  - `draftWindows` devuelve de 2 a 5 opciones: las elegidas por la IA y, si son menos de 2, completa con
    `bestWindows` de los candidatos sin repetir; si no llega a 2 → `409 NO_COMMON_WINDOWS`.
  - El prompt del borrador lista franjas con fecha («Jue 20 nov 16:00–18:00»); se quita «semana tipo» y el truco
    «hoy / la próxima semana» (`draftCandidates` desaparece o se reduce a filtrar). `draftDeadline` usa `instant`.
  - Resumen de votación: cada franja en el JSON del prompt con su fecha.
  - `DashboardGroup.nextWindow` incluye `date`.

- [ ] **Step 1: Write the failing tests**:
  - `el borrador trae entre 2 y 5 opciones con date`; `si la IA da 1, se completa hasta 2`; `si solo hay 1 candidata → 409`
    (Review Focus 5).
  - `el prompt del borrador muestra fechas y no dice «semana tipo»`.
  - `sugerencias con week usan esa semana`.
  - `el prompt del resumen incluye la fecha de cada franja`.
  - `dashboard: nextWindow trae date`.
- [ ] **Step 2: Run** esos tests. Expected: FAIL.
- [ ] **Step 3: Implement** según las interfaces. El cliente simulado (`mock-client.ts`) sigue con `windowIndex`.
- [ ] **Step 4: Run** `npm test -w backend` y `npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(backend): IA e Inicio con franjas fechadas`

### Task 7: Fechas en la app (utilidades, API y etiquetas)

**Files:**
- Create: `mobile/src/utils/zone.ts`
- Modify: `mobile/src/utils/proposals.ts` (`windowLabel`, `scheduleLabel`), `mobile/src/utils/dashboard.ts`
  (`groupSlotLabel`), `mobile/src/utils/groups.ts` (`groupWindowsByDay` agrupa por `date`), `mobile/src/utils/ai.ts`
  (`prefillWindows`/`toWindowInput` copian `date`), `mobile/src/api/groups.ts` (`getAvailability(groupId, week?)`),
  `mobile/src/api/proposals.ts` (`replanProposal`), `mobile/src/hooks/useAvailability.ts` (`useAvailability(groupId, week?)`,
  queryKey con la semana), `mobile/src/testing/fixtures.ts`
- Test: `mobile/src/utils/__tests__/zone.test.ts`, tests existentes de esas utilidades

**Interfaces:**
- Produces:
  - `zone.ts`: `limaToday(now: Date): string`, `mondayOf(date: string): string`, `addDays(date, n): string`,
    `isoDay(date): number`, `weekOptions(now: Date): { week: string; label: string }[]` (labels exactos: «Esta semana»,
    «Próxima semana», «En 2 semanas», «En 3 semanas»), `dateFor(week: string, dayOfWeek: number): string`,
    `hasStarted(date: string, time: string, now: Date): boolean`, `shortDate(date): string` («Jue 20 nov»).
  - `windowLabel(w: { date: string; startTime: string; endTime: string })` → `'Jue 20 nov · 16:00 - 18:00'`.
  - `replanProposal(id: string, input: ReplanInput): Promise<Proposal>` → `POST /proposals/:id/replan`.

- [ ] **Step 1: Write the failing tests**: `limaToday(new Date('2026-11-16T04:30:00Z'))` → `'2026-11-15'`;
  `weekOptions` da 4 lunes con esos labels; `dateFor('2026-11-16', 4)` → `'2026-11-19'`;
  `hasStarted('2026-11-19','16:00', new Date('2026-11-19T21:30:00Z'))` → `true`;
  `windowLabel` con fecha; `getAvailability('g1','2026-11-16')` pide `/groups/g1/availability?week=2026-11-16`;
  `replanProposal` usa `POST /proposals/p1/replan`.
- [ ] **Step 2: Run** `npx jest --maxWorkers=2 zone proposals dashboard groups ai endpoints` en `mobile/`. Expected: FAIL.
- [ ] **Step 3: Implement** con `Intl.DateTimeFormat` en `America/Lima` (mismo criterio que el backend).
- [ ] **Step 4: Run** `npx jest --maxWorkers=2` y `npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(mobile): fechas de Lima y etiquetas de franjas con fecha`

### Task 8: Editor de franjas y nueva propuesta

**Files:**
- Modify: `mobile/src/screens/proposals/WindowEditor.tsx`, `mobile/src/screens/proposals/CreateProposalScreen.tsx`,
  `mobile/src/screens/proposals/AddWindowSheet.tsx`
- Create: `mobile/src/components/WeekSelector.tsx`
- Test: `__tests__` de esas pantallas y `mobile/src/components/__tests__/WeekSelector.test.tsx`

**Interfaces:**
- Consumes: `zone.ts`, `windowLabel` (Task 7).
- Produces:
  - `WeekSelector({ value: string; onChange(week: string): void; now?: Date })`: 4 opciones de `weekOptions`.
  - `WindowEditor` recibe `week: string` (y `now?: Date` para tests); el selector de día desactiva los días con
    `hasStarted(dateFor(week, d), '23:59', now)`; muestra la fecha resultante; `onSubmit` recibe `TimeWindowInput` con `date`.
  - `CreateProposalScreen`: `WeekSelector` arriba; mínimo 2 y máximo 5 franjas (botón crear desactivado fuera de rango,
    texto «Elige entre 2 y 5 franjas»); «las 3 mejores» envía `week`; prefill de IA respeta las fechas recibidas.

- [ ] **Step 1: Write the failing tests**:
  - `WeekSelector muestra las 4 semanas y cambia`.
  - `en la semana actual los días pasados están desactivados` (Review Focus 2).
  - `la franja enviada lleva date = dateFor(week, día)`.
  - `crear con 1 franja está desactivado; con 6 no se puede añadir más`.
  - `«las 3 mejores» envía week`.
- [ ] **Step 2: Run** `npx jest --maxWorkers=2 WindowEditor CreateProposal AddWindow WeekSelector`. Expected: FAIL.
- [ ] **Step 3: Implement**.
- [ ] **Step 4: Run** `npx jest --maxWorkers=2` y `npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(mobile): elegir semana, día y horas al proponer`

### Task 9: Disponibilidad, reprogramar, replantear e Inicio en la app

**Files:**
- Modify: `mobile/src/screens/groups/tabs/AvailabilityTab.tsx`, `mobile/src/screens/proposals/ExpressVoteCard.tsx`,
  `mobile/src/screens/proposals/VotingScreen.tsx` (acción «Replantear»), `mobile/src/screens/proposals/ConfirmPlanDialog.tsx`
  (error `WINDOW_STARTED`), `mobile/src/screens/groups/SuggestionsSheet.tsx`, `mobile/src/screens/DashboardScreen.tsx`
  (si usa `groupSlotLabel`)
- Create: `mobile/src/screens/proposals/ReplanSheet.tsx` (plazo + `WeekSelector` + `WindowEditor`, 2–5 franjas;
  la usan reprogramar y replantear)
- Test: `__tests__` de esas pantallas

**Interfaces:**
- Consumes: Tasks 7–8 (`WeekSelector`, `WindowEditor`, `useAvailability(groupId, week)`, `replanProposal`,
  `resolveIncidences` con `windows`).
- Produces: `ReplanSheet({ title: string; submitLabel: string; onSubmit(input: { votingDeadline: string; windows: TimeWindowInput[] }): Promise<void> })`.

- [ ] **Step 1: Write the failing tests**:
  - `AvailabilityTab cambia de semana y pide esa semana`.
  - `reprogramar envía votingDeadline y windows`.
  - `quien gestiona ve «Replantear» en una propuesta en votación; llama a replanProposal`.
  - `confirmar una franja que ya empezó muestra «Esa franja ya empezó: replantea la propuesta.» y ofrece Replantear`.
  - `Inicio muestra la fecha de la próxima franja`.
- [ ] **Step 2: Run** `npx jest --maxWorkers=2 AvailabilityTab ExpressVoteCard VotingScreen ConfirmPlan ReplanSheet Dashboard`.
  Expected: FAIL.
- [ ] **Step 3: Implement**.
- [ ] **Step 4: Run** `npx jest --maxWorkers=2` y `npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(mobile): disponibilidad por semana, reprogramar y replantear con fechas`

### Task 10: Documentación y verificación final

**Files:**
- Modify: `README.md` (funcionalidades: franjas con fecha, puntuales cuentan, replantear; recuento de tests),
  `docs/api.md` (sección «Cambios respecto a Kotlin»: franjas con fecha; revisar que no quede «semana tipo» ni
  «próxima ocurrencia» salvo en esa sección histórica)

- [ ] **Step 1:** Actualizar la documentación.
- [ ] **Step 2: Run** `npm run typecheck` y `npm test` desde la raíz. Expected: PASS.
- [ ] **Step 3: Commit** `docs: franjas con fecha y replantear propuestas`
- [ ] **Step 4:** Con el OK del usuario: push y PR a `develop` (o apilado sobre #44 si aún no está integrado).
