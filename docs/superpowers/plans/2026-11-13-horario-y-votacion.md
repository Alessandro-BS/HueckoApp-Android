# Horario y votación — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** La votación de franjas se cierra sola al vencer el plazo, quien propone elige si se votan varias franjas, y
los bloques del horario se editan y nunca se solapan.

**Architecture:** Migración 11 añade `multiple_votes`/`auto_closed` y amplía la clave de `votes`. El cierre automático
es perezoso, como la votación exprés: `closeDueProposals` (nuevo `backend/src/proposals/voting-close.ts`) corre antes
de cada lectura y acción sobre propuestas, con el plan bloqueado, y reutiliza `pickWinner`. El solape de bloques es una
función pura (`backend/src/schedule/block-overlap.ts`) que el repositorio usa con la fila del usuario bloqueada. La app
solo adapta pantallas existentes.

**Tech Stack:** Express 5 + zod + `ApiError`, Postgres (Neon / PGlite) detrás de `Db`, Vitest + Supertest; Expo React
Native, Jest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-11-13-horario-y-votacion-design.md`

## Global Constraints

- Rama `feature/horario-y-votacion` (sale de `feature/organizadores`). Commits convencionales en español; el cuerpo
  termina con una línea en blanco y `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Sin push.
- Migración nueva al final de `backend/src/db/migrations.ts` (la 11); nunca se edita una publicada.
- `shared/index.d.ts` y `docs/api.md` cambian en el mismo commit que el endpoint.
- Errores con `ApiError(status, code, message, details)`; validación con zod; SQL parametrizado (`$1`).
- Contrato exacto: `ProposalInput.multipleVotes?: boolean` (por defecto `true`); `Proposal.multipleVotes: boolean`;
  `Proposal.autoClosed: boolean`; `Proposal.myVoteWindowIds: string[]` (reemplaza a `myVoteWindowId`, en el orden de
  las franjas).
- Errores nuevos exactos: `409 TIME_BLOCK_OVERLAP` «Se solapa con «{label}» ({cuándo} {inicio}–{fin}).» con `{cuándo}` =
  día en minúsculas («lunes») para un recurrente o `dd/MM/yyyy` para un puntual; p. ej. «Se solapa con «Cálculo II»
  (lunes 08:00–11:00).». `details: { blockId }`, o en `bulk` `details: { path: ['blocks', i], blockId }` /
  `{ path: ['blocks', i], otherIndex }`.
- Cierre automático: gana `pickWinner` (votos → % → fecha y hora); sin votos de miembros actuales → `CANCELADO`;
  `auto_closed = true` en los dos casos; se aplica una sola vez (plan bloqueado y estado/plazo comprobados dentro).
- Textos de la app exactos: «Permitir votar varias franjas»; «Puedes votar todas las franjas que te sirvan»; «Votaste N
  franjas» (N ≥ 2; con 1, «Votaste 1 franja»); «Confirmado al cerrar la votación»; «Cancelado: nadie votó antes del
  plazo»; «La votación cierra el {fecha y hora}. Si nadie vota, el plan se cancela.»; título «Editar bloque».
- Antes de cada commit: `npm run typecheck` (raíz) y los tests de los workspaces tocados (backend
  `npx vitest run` desde `C:/…` con la C mayúscula; mobile `npx jest --maxWorkers=2`). Node 22:
  `export PATH="/c/Users/User/AppData/Roaming/fnm/node-versions/v22.23.5/installation:$PATH"`.

## Review Focus

1. **Un voto no entra después del recuento:** votar y quitar el voto bloquean el plan y comprueban estado y plazo dentro
   (Task 1); el cierre bloquea el mismo plan (Task 2). Test con `interleave` en Task 2.
2. **El cierre se aplica una vez:** dos lecturas a la vez sobre una propuesta vencida → un solo cambio de estado
   (Task 2, `interleave`).
3. **El resultado no depende de quién mire ni cuándo:** solo votos de miembros actuales, `pickWinner`, plazo en vez de
   «ahora» para decidir (Task 2).
4. **Dos bloques solapados guardados a la vez:** la fila del usuario se bloquea antes de comprobar (Task 3,
   `interleave`).
5. **Migración 11 en una base con votos:** filas intactas y la clave nueva (Task 1).

---

### Task 1: Voto múltiple (backend)

**Files:**
- Modify: `backend/src/db/migrations.ts` (migración 11), `backend/src/proposals/proposals.schemas.ts`
  (`createProposalSchema`: `multipleVotes`; `unvoteQuerySchema`), `backend/src/proposals/proposals.repository.ts`
  (`ProposalRow`, `hydrate`, `create`, `voteIfOpen`, `unvoteIfOpen`), `backend/src/proposals/proposals.routes.ts`
  (`PUT`/`DELETE /:id/vote`, crear), `backend/src/admin/admin-users.ts:94` (`COUNT(DISTINCT proposal_id)`),
  `backend/src/ai/voting-summary.ts` (dato `votoMultiple` en el prompt), `shared/index.d.ts`, `docs/api.md`
  (§`POST /groups/:id/proposals`, §`PUT`/`DELETE /proposals/:id/vote`, `Proposal` en §Tipos)
- Modify (solo para compilar; la UI es Task 5): `mobile/src/hooks/useProposal.ts`, `mobile/src/hooks/useDashboard.ts`,
  `mobile/src/screens/dashboard/DashboardScreen.tsx`, `mobile/src/screens/proposals/PlanDetailScreen.tsx`,
  `mobile/src/screens/proposals/VotingScreen.tsx`, `mobile/src/testing/fixtures.ts`
- Test: `backend/test/migrations.test.ts`, `backend/test/member-votes.test.ts` (o nuevo
  `backend/test/multiple-votes.test.ts`), `backend/test/proposals.test.ts`, `backend/test/admin-users.test.ts`,
  `backend/test/ai-voting-summary.test.ts`

**Interfaces:**
- Produces:
  - Migración 11 (una sola cadena del array):

```sql
ALTER TABLE proposals ADD COLUMN multiple_votes BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE proposals ADD COLUMN auto_closed BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE votes DROP CONSTRAINT votes_pkey;
ALTER TABLE votes ADD PRIMARY KEY (proposal_id, user_id, window_id);
```

  Comentario encima: «11 — Cierre automático y voto múltiple. La clave de votes (PRIMARY KEY inline de la migración 2,
  así que Postgres la llamó votes_pkey) pasa a incluir la franja.»
  - `shared`: `Proposal.multipleVotes: boolean`, `Proposal.autoClosed: boolean` (`ProposalRow` suma `multiple_votes` y
    `auto_closed`; `hydrate` devuelve `multipleVotes: row.multiple_votes` y `autoClosed: row.auto_closed`, que hasta
    Task 2 siempre es `false`), `Proposal.myVoteWindowIds: string[]` (borra `myVoteWindowId`), `ProposalInput.multipleVotes?: boolean`.
  - `NewProposal.multipleVotes: boolean`; `create` lo inserta en `multiple_votes`.
  - `hydrate`: `myVoteWindowIds` = las franjas votadas por `viewerId`, en el orden de `windows`
    (`windows.filter((w) => mine.has(w.id)).map((w) => w.id)`).
  - `proposalsRepository(db).voteIfOpen(proposalId, userId, windowId, now: Date): Promise<'OK' | 'CLOSED'>` — en
    `db.transaction`: `SELECT state, voting_deadline, multiple_votes FROM proposals WHERE id = $1 FOR UPDATE`; si
    `state <> 'PROPUESTO'` o `voting_deadline <= now` → `'CLOSED'`; si `!multiple_votes`,
    `DELETE FROM votes WHERE proposal_id = $1 AND user_id = $2 AND window_id <> $3`; después
    `INSERT … ON CONFLICT (proposal_id, user_id, window_id) DO NOTHING` (repetir no cambia `created_at`). Borra
    `vote`.
  - `proposalsRepository(db).unvoteIfOpen(proposalId, userId, windowId: string | null, now: Date): Promise<'OK' |
    'CLOSED'>` — mismo bloqueo y comprobación; `windowId === null` borra todos mis votos, si no solo esa franja. Borra
    `unvote`.
  - Rutas: `PUT` → `'CLOSED'` = `409 VOTING_CLOSED`; la clave foránea de un replanteo simultáneo sigue dando
    `404 WINDOW_NOT_FOUND`. `DELETE` acepta `?windowId=` (`unvoteQuerySchema = z.object({ windowId:
    z.string().min(1).optional() })`).
  - Replantear conserva `multiple_votes` (no se toca la columna).

- [ ] **Step 1: Write the failing tests:**
  - migración 11 desde una base en versión 10 con dos votos: siguen, `multiple_votes`/`auto_closed` en `false`, y la
    misma persona puede tener dos filas en franjas distintas de la misma propuesta (el estilo de los `describe` de
    las migraciones 9 y 10 en `migrations.test.ts`);
  - crear sin `multipleVotes` → `multipleVotes: true`; con `false` → `false`; `"sí"` → `400`;
  - voto múltiple: votar A y B → `myVoteWindowIds: [A, B]`, `voteCount` 1 y 1; votar A otra vez → igual;
    `DELETE ?windowId=A` → `[B]`; `DELETE` sin parámetros → `[]`; quitar una no votada → `200` sin cambios;
  - voto único (`multipleVotes: false`): votar A y luego B → `[B]` (se mueve); `DELETE` → `[]`;
  - confirmar sin `windowId` con votos múltiples: gana la de más filas (`pickWinner` no cambia);
  - votar tras el plazo → `409 VOTING_CLOSED` (con el reloj de `makeClock` en `AFTER_DEADLINE`);
  - replantear una propuesta `multipleVotes: false` → sigue `false`;
  - admin: un usuario con 2 votos en la misma propuesta → «votos» 1;
  - resumen con IA: el JSON del prompt lleva `votoMultiple: true|false`.
- [ ] **Step 2: Run** `cd C:/Users/User/Desktop/HueckoApp-Android/backend && npx vitest run test/migrations.test.ts
  test/member-votes.test.ts test/proposals.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** lo de **Interfaces**, la documentación (`docs/api.md`: regla del voto según
  `multipleVotes`, `?windowId=`, `myVoteWindowIds`) y lo mínimo de la app para compilar sin cambiar comportamiento:
  `myVoteWindowId` → `myVoteWindowIds[0] ?? null` donde se usaba como valor y `myVoteWindowIds.includes(w.id)` donde se
  comparaba; fixtures con `myVoteWindowIds: []` / `['w_1']` y `multipleVotes: false`, `autoClosed: false`.
- [ ] **Step 4: Run** `npm run typecheck` (raíz), `npx vitest run` (backend) y `npx jest --maxWorkers=2` (mobile).
  Expected: PASS.
- [ ] **Step 5: Commit** `feat(backend): voto múltiple en las propuestas`

### Task 2: Cierre automático de la votación (backend)

**Files:**
- Create: `backend/src/proposals/voting-close.ts`
- Modify: `backend/src/proposals/proposals.routes.ts` (`closeDue`, `loadForMemberClosingDue`, `loadForManager`, todas
  las rutas de `/proposals/:id/...`, `replan`), `backend/src/proposals/proposals.repository.ts` (`replanWindows`), `backend/src/me/me.routes.ts`, `backend/src/admin/admin.routes.ts`, `docs/api.md`
  (§Propuestas y votación: «Cierre automático»; `GET /groups/:id/proposals`, `GET /proposals/:id`, `/me/dashboard`,
  `/me/upcoming-plans`, `POST /confirm` («antes o después del plazo» → solo antes), `POST /replan`, §Admin)
- Test: nuevo `backend/test/voting-close.test.ts`; ajustar `backend/test/proposals-lifecycle.test.ts`,
  `backend/test/proposals-replan.test.ts`, `backend/test/dashboard.test.ts` y los que confirmaban o replanteaban
  después del plazo

**Interfaces:**
- Consumes: Task 1 (`auto_closed`, `voteIfOpen`).
- Produces:

```ts
// backend/src/proposals/voting-close.ts
import type { CloseScope } from './express-votes.repository';
export type ProposalCloseScope = CloseScope | { all: true };

/** Cierra la votación de la propuesta si sigue PROPUESTO y su plazo venció. true si la cerró. */
export function closeProposalIfDue(db: Db, proposalId: string, now: Date): Promise<boolean>;

/** Cierre perezoso: closeProposalIfDue de cada PROPUESTO vencido del alcance. Nunca lanza (logCloseError). */
export function closeDueProposals(db: Db, scope: ProposalCloseScope, now: Date): Promise<void>;
```

  - `closeProposalIfDue`, en `db.transaction`: `SELECT state, voting_deadline, group_id FROM proposals WHERE id = $1
    FOR UPDATE`; si no es `PROPUESTO` o `voting_deadline > now` → `false`. Franjas con `vote_count` de miembros
    actuales (la misma consulta de `hydrate`: `LEFT JOIN votes … LEFT JOIN group_members m ON m.group_id = p.group_id AND
    m.user_id = v.user_id`, `COUNT(m.user_id)`), mapeadas a `TimeWindow` y `pickWinner`. Con ganadora:
    `UPDATE proposals SET state = 'CONFIRMADO', chosen_window_id = $2, scheduled_at = $3, scheduled_date = $4,
    auto_closed = TRUE WHERE id = $1 AND state = 'PROPUESTO'` con `scheduleFor(date, startTime)` (sin comprobar si ya
    empezó). Sin ganadora: `UPDATE … SET state = 'CANCELADO', auto_closed = TRUE WHERE id = $1 AND state =
    'PROPUESTO'`. Devuelve `rowCount > 0`.
  - `closeDueProposals`: `SELECT p.id FROM proposals p WHERE <filtro> AND p.state = 'PROPUESTO' AND p.voting_deadline
    <= $n` con el filtro de `CloseScope` (mismos textos que `SCOPE_FILTER`; `{ all: true }` sin filtro); cada id con
    `closeProposalIfDue` en su propio `try` (un fallo no corta los demás).
  - `proposals.routes.ts`: `closeDue(scope)` = `closeDueProposals` y después `expressVotes.closeDueInScope`.
    `loadForMemberClosingDue` también cierra la votación de franjas si `state === 'PROPUESTO'` y el plazo venció (antes
    de mirar la exprés; relee después). Todas las rutas de `proposalsRouter` (votar, quitar, añadir franja, confirmar,
    cancelar, incidencias, exprés, replantear) cargan con `loadForMemberClosingDue`; `loadForManager` se apoya en él.
    Tras el plazo: votar/quitar/añadir → `409 VOTING_CLOSED`; confirmar → `409 INVALID_STATE`.
  - `me.routes.ts`: `/upcoming-plans` y `/dashboard` llaman a `closeDueProposals(db, { userId }, now)` antes del cierre
    exprés.
  - `admin.routes.ts`: `/groups/:id` → `closeDueProposals(db, { groupId }, now())` antes de `detail`; `/stats`,
    `/stats/timeseries`, `/stats/popular-hours`, `/reports` → `closeDueProposals(db, { all: true }, now())` antes de
    calcular.
  - Replantear: `REPLANNABLE` sigue `['PROPUESTO', 'EN_RECOORDINACION']` y además vale `CANCELADO` si
    `proposal.autoClosed`; `replanWindows(…, fromStates)` recibe `['PROPUESTO', 'EN_RECOORDINACION', 'CANCELADO']`
    solo en ese caso y su `UPDATE` exige además `(state <> 'CANCELADO' OR auto_closed)`; pone `auto_closed = FALSE`.

- [ ] **Step 1: Write the failing tests** (`voting-close.test.ts`, reloj con `makeClock`):
  - A 2 votos, B 1 → tras el plazo, `GET /proposals/:id` → `CONFIRMADO`, `chosenWindowId` A, `autoClosed: true`,
    `scheduledAt`/`scheduledDate` de A;
  - empate en votos → gana la de mayor `availabilityPercentage`; empate total → la más temprana;
  - sin votos → `CANCELADO`, `autoClosed: true`; votos solo de alguien que salió del grupo → `CANCELADO`;
  - el cierre llega por cada lectura: `GET /groups/:id/proposals`, `/me/dashboard`, `/me/upcoming-plans`,
    `GET /admin/groups/:id`, `GET /admin/stats` (`proposalsByState`);
  - antes del plazo nada cambia (`PROPUESTO`, `autoClosed: false`);
  - la franja ganadora ya empezó cuando alguien mira (reloj días después) → igual `CONFIRMADO`;
  - tras el plazo: votar → `409 VOTING_CLOSED`; confirmar → `409 INVALID_STATE`; confirmar a mano antes del plazo →
    `CONFIRMADO` con `autoClosed: false`;
  - **Review Focus 2:** `interleave` justo antes del `UPDATE proposals SET state = 'CONFIRMADO'` del cierre ejecuta
    `UPDATE proposals SET state = 'CANCELADO', auto_closed = TRUE WHERE id = $1` (otro cierre acaba de terminar) → el
    `UPDATE` del primero afecta 0 filas, `closeProposalIfDue` devuelve `false` y el plan queda como lo dejó el otro
    (los tests usan PGlite con una sola conexión: `interleave` simula al otro escritor que confirmó justo antes);
  - **Review Focus 1:** `interleave` justo antes del `SELECT … FROM proposals WHERE id = $1 FOR UPDATE` de
    `voteIfOpen` ejecuta el cierre (`UPDATE proposals SET state = 'CONFIRMADO', … auto_closed = TRUE …`) → el voto ve
    el estado dentro del bloqueo, responde `409 VOTING_CLOSED` y no queda guardado;
  - replantear: una `CANCELADO` con `autoClosed` → `200`, `PROPUESTO`, `autoClosed: false`; una cancelada a mano →
    `409 INVALID_STATE`.
- [ ] **Step 2: Run** `npx vitest run test/voting-close.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** lo de **Interfaces** y la documentación. Ajusta los tests existentes que confirmaban,
  votaban o replanteaban una propuesta vencida: ahora se cierra antes (decide en cada uno si el test sigue teniendo
  sentido moviendo el reloj antes del plazo o si debe esperar el nuevo comportamiento; nunca lo borres sin sustituirlo).
- [ ] **Step 4: Run** `npm run typecheck` y `npx vitest run` (backend completo). Expected: PASS.
- [ ] **Step 5: Commit** `feat(backend): la votación de franjas se cierra sola al vencer el plazo`

### Task 3: Editar bloques y sin solapes (backend)

**Files:**
- Create: `backend/src/schedule/block-overlap.ts`
- Modify: `backend/src/schedule/time-blocks.repository.ts`, `backend/src/schedule/time-blocks.routes.ts`,
  `docs/api.md` (§Mi horario: `PUT`, solapes; tabla de errores `TIME_BLOCK_OVERLAP`)
- Test: nuevo `backend/test/block-overlap.test.ts` (puro), `backend/test/time-blocks.test.ts`

**Interfaces:**
- Produces:

```ts
// backend/src/schedule/block-overlap.ts
import type { TimeBlock, TimeBlockInput } from '@hueckoapp/shared';
type Slot = Pick<TimeBlockInput, 'startTime' | 'endTime' | 'isRecurring' | 'dayOfWeek' | 'date'>;

/** Las horas se cruzan de forma estricta: 08–10 y 10–12 no se solapan. */
export const timesCross = (a: Slot, b: Slot): boolean => a.startTime < b.endTime && b.startTime < a.endTime;

/** Mismo rato: recurrentes del mismo día; puntuales de la misma fecha; puntual cuya fecha (isoDay) es el día del recurrente. */
export function blocksOverlap(a: Slot, b: Slot): boolean;

/** El primer bloque de `existing` que choca con `candidate`, sin contar el que tiene `ignoreId`. */
export function firstOverlap(candidate: Slot, existing: readonly TimeBlock[], ignoreId?: string): TimeBlock | undefined;

/** «Se solapa con «Cálculo II» (lunes 08:00–11:00).» / «… (16/11/2026 09:00–10:00).» */
export function overlapMessage(block: Pick<TimeBlock, 'label'> & Slot): string;
```

  - `isoDay` viene de `backend/src/common/zone.ts`; nombres de día `['lunes', 'martes', 'miércoles', 'jueves',
    'viernes', 'sábado', 'domingo'][dayOfWeek - 1]`.
  - Repositorio (todas en `db.transaction` y empezando por `SELECT id FROM users WHERE id = $1 FOR UPDATE`):
    - `create(userId, input): Promise<TimeBlock | { overlap: TimeBlock }>`;
    - `update(userId, id, input): Promise<TimeBlock | { overlap: TimeBlock } | undefined>` (`undefined` = no existe o es
      ajeno; compara con `ignoreId = id`; `UPDATE … WHERE id = $1 AND user_id = $2`);
    - `createMany(userId, inputs): Promise<TimeBlock[] | { index: number; overlap: TimeBlock } | { index: number;
      otherIndex: number }>` (primero contra los guardados, después cada uno contra los anteriores del lote; nada se
      guarda si hay choque).
  - Rutas: `PUT /:id` con `timeBlockInputSchema` → `200`; `404 TIME_BLOCK_NOT_FOUND` «Bloque no encontrado.»;
    `409 TIME_BLOCK_OVERLAP` con `overlapMessage(overlap)` y `details: { blockId }`; en `bulk`, con un guardado:
    `details: { path: ['blocks', i], blockId }`; dentro del lote: mensaje con el otro bloque del lote y `details:
    { path: ['blocks', i], otherIndex }`.

- [ ] **Step 1: Write the failing tests:**
  - puros (`block-overlap.test.ts`): recurrentes mismo día que se cruzan → sí; distinto día → no; borde (08–10 y
    10–12) → no; puntuales misma fecha → sí; distinta fecha → no; puntual el lunes 2026-11-16 contra recurrente lunes →
    sí; contra recurrente martes → no; `LIBRE` cuenta; `firstOverlap` ignora `ignoreId`; los dos formatos de
    `overlapMessage`;
  - HTTP: `PUT` propio → `200` con los campos nuevos y `GET` lo refleja; ajeno o inexistente → `404`; cuerpo inválido →
    `400`; mover un bloque media hora sin chocar con otro → `200` (no choca consigo mismo); `POST` que choca → `409`
    con el mensaje exacto y `details.blockId`; `PUT` que choca → `409`; `bulk` con un bloque que choca con uno guardado
    → `409` con `details.path` `['blocks', 1]` y no se guarda ninguno; `bulk` con dos del lote que se solapan → `409`
    con `otherIndex`; los solapes ya guardados antes de esta fase no impiden `GET`;
  - **Review Focus 4:** `interleave` justo antes del `SELECT id FROM users WHERE id = $1 FOR UPDATE` de un `POST`
    inserta un bloque solapado del mismo usuario (otro guardado que acaba de confirmarse) → el `POST` lo ve al comprobar
    tras el bloqueo y responde `409`; queda un solo bloque en ese rato. (PGlite tiene una sola conexión: así se
    comprueba que la comprobación va después del bloqueo.)
- [ ] **Step 2: Run** `npx vitest run test/block-overlap.test.ts test/time-blocks.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** lo de **Interfaces** y la documentación. Si el seed (`backend/src/db/demo-data.ts`) o
  algún test existente crea bloques que se solapan, corrígelos (cambia horas, no la regla).
- [ ] **Step 4: Run** `npm run typecheck` y `npx vitest run`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(backend): editar bloques del horario sin solapes`

### Task 4: Editar bloques y avisar del solape (app)

**Files:**
- Modify: `mobile/src/api/schedule.ts` (`updateTimeBlock`), `mobile/src/navigation/types.ts`
  (`AddSchedule: { initialDay?: number; block?: TimeBlock } | undefined`), `mobile/src/navigation/RootNavigator.tsx`
  (título «Editar bloque» con `block`), `mobile/src/screens/schedule/AddScheduleScreen.tsx`,
  `mobile/src/components/TimeBlockItem.tsx` (`onPress?`), `mobile/src/screens/schedule/MyScheduleScreen.tsx`,
  `mobile/src/screens/schedule/OcrBlocksEditor.tsx`
- Test: `mobile/src/screens/schedule/__tests__/`, `mobile/src/api/__tests__/endpoints.test.ts`,
  `mobile/src/components/__tests__/`

**Interfaces:**
- Consumes: Task 3 (`PUT /me/time-blocks/:id`, `409 TIME_BLOCK_OVERLAP` con `details`).
- Produces:
  - `updateTimeBlock(id: string, input: TimeBlockInput): Promise<TimeBlock>` (`api.put`).
  - `TimeBlockItem` con `onPress?: () => void` (accesible: `accessibilityRole="button"`, etiqueta `Editar {label}`);
    el botón de borrar sigue igual.
  - `AddScheduleScreen`: con `route.params.block` arranca con sus valores, `navigation.setOptions({ title: 'Editar
    bloque' })` y guarda con `updateTimeBlock(block.id, input)`; sin él, como hoy. El `409` se ve en el `ErrorBanner`
    existente con el mensaje del servidor (ya lo hace `errorMessage`).
  - `OcrBlocksEditor`: al fallar `createTimeBlocksBulk` con `ApiError` `TIME_BLOCK_OVERLAP` y `details.path[1]`
    numérico, el borrador de ese índice muestra el mensaje bajo sus campos (como los errores de validación) y el
    `ErrorBanner` sigue mostrando el mensaje general; al editar ese borrador se limpia la marca.

- [ ] **Step 1: Write the failing tests:** tocar un bloque en «Mi horario» navega a `AddSchedule` con `block`; la
  pantalla abre rellena con «Editar bloque» y guarda con `PUT` (mock de `api`); un `409` muestra «Se solapa con
  «Cálculo II» (lunes 08:00–11:00).»; en el OCR un `409` con `path: ['blocks', 1]` marca el segundo borrador y editarlo
  quita la marca; `endpoints.test.ts` cubre `updateTimeBlock`.
- [ ] **Step 2: Run** `cd C:/Users/User/Desktop/HueckoApp-Android/mobile && npx jest --maxWorkers=2 src/screens/schedule
  src/api src/components`. Expected: FAIL.
- [ ] **Step 3: Implement** lo de **Interfaces**.
- [ ] **Step 4: Run** `npm run typecheck` y `npx jest --maxWorkers=2`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(mobile): editar bloques del horario y avisar de solapes`

### Task 5: Voto múltiple y cierre automático en la app

**Files:**
- Modify: `mobile/src/api/proposals.ts` (`removeVote(id, windowId?)`), `mobile/src/hooks/useVoteToggle.ts`,
  `mobile/src/hooks/useProposal.ts`, `mobile/src/hooks/useDashboard.ts`,
  `mobile/src/screens/proposals/CreateProposalScreen.tsx`, `mobile/src/screens/proposals/VotingScreen.tsx`,
  `mobile/src/screens/proposals/PlanDetailScreen.tsx`, `mobile/src/screens/dashboard/DashboardScreen.tsx`,
  `README.md` (número de tests y la función), `docs/guia-de-pruebas.md` (cierre automático, voto múltiple, editar
  bloque, solapes)
- Test: `mobile/src/hooks/__tests__/`, `mobile/src/screens/proposals/__tests__/`,
  `mobile/src/screens/dashboard/__tests__/`

**Interfaces:**
- Consumes: Tasks 1–2 (`multipleVotes`, `myVoteWindowIds`, `autoClosed`, `DELETE ?windowId=`, replantear una cancelada
  sola).
- Produces:
  - `removeVote(id: string, windowId?: string)` → `DELETE …/vote` con `params: { windowId }` si viene.
  - `useVoteToggle({ votesOf, isMultiple, vote, unvote })`: `votesOf(proposalId): readonly string[]`,
    `isMultiple(proposalId): boolean`, `unvote(proposalId, windowId?: string)`. Tocar una franja ya votada la quita
    (con voto múltiple solo esa: `unvote(id, windowId)`; con voto único: `unvote(id)`); si no, vota. Sigue siendo la
    única implementación de la alternancia; `VoteOutcome` igual.
  - `CreateProposalScreen`: interruptor (`Switch` con `accessibilityLabel="Permitir votar varias franjas"`) activado
    por defecto; envía `multipleVotes`.
  - `VotingScreen` y la tarjeta de votación de Inicio: con `multipleVotes`, «Puedes votar todas las franjas que te
    sirvan»; `voted={proposal.myVoteWindowIds.includes(w.id)}`; en Inicio «Votaste N franjas» / «Votaste 1 franja»
    cuando hay votos y `multipleVotes`. Debajo, en votación: «La votación cierra el {fecha y hora}. Si nadie vota, el
    plan se cancela.» (formato de fecha y hora que ya usa la pantalla para `votingDeadline`).
  - `PlanDetailScreen`: con `autoClosed`, «Confirmado al cerrar la votación» (`CONFIRMADO`) o «Cancelado: nadie votó
    antes del plazo» (`CANCELADO`); con `CANCELADO` + `autoClosed` + `canManage`, botón «Replantear» que abre el
    `ReplanSheet` existente.

- [ ] **Step 1: Write the failing tests:** `useVoteToggle` con voto múltiple (votar A y B; tocar A quita solo A) y
  único (tocar otra mueve); el interruptor al crear envía `multipleVotes: false` al apagarlo; `VotingScreen` muestra la
  ayuda solo con voto múltiple y marca varias franjas; Inicio «Votaste 2 franjas»; detalle con los dos textos de
  `autoClosed` y el botón «Replantear» solo para quien gestiona.
- [ ] **Step 2: Run** `npx jest --maxWorkers=2 src/hooks src/screens/proposals src/screens/dashboard`. Expected: FAIL.
- [ ] **Step 3: Implement** lo de **Interfaces**, el README (total de tests de backend + app tras correr ambas suites)
  y la guía de pruebas.
- [ ] **Step 4: Run** `npm run typecheck` y `npm test` (raíz). Expected: PASS.
- [ ] **Step 5: Commit** `feat(mobile): voto múltiple y cierre automático de la votación`
