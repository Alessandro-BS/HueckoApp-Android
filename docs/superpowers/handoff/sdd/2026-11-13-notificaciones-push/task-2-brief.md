### Task 2: Bandeja de salida (encolar avisos en cada cambio)

**Files:**
- Create: `backend/src/notifications/messages.ts`, `backend/src/notifications/outbox.repository.ts`,
  `backend/src/notifications/audience.ts`
- Modify: `backend/src/proposals/proposals.repository.ts` (`create`, `confirm`, `cancel`, `reportIncidence`),
  `backend/src/proposals/voting-close.ts` (`closeProposalIfDue`), `backend/src/proposals/express-votes.repository.ts`
  (`closeDue`), `backend/src/proposals/proposals.routes.ts` y `backend/src/admin/admin-groups.ts` (pasar quién actúa),
  `docs/api.md` (§Notificaciones: tabla de avisos, destinatarios y textos)
- Test: nuevo `backend/test/notifications-outbox.test.ts`, nuevo `backend/test/notification-messages.test.ts`

**Interfaces:**
- Consumes: Task 1 (tabla `notifications`, tipos de `shared`).
- Produces:
  - `messages.ts` (puro): `type PlanInfo = { proposalId: string; groupId: string; groupName: string; title: string;
    scheduledAt: string | null; locationName: string | null }` y una función por aviso que devuelve `{ title, body,
    data }`: `newProposalMessage(plan, creatorName)`, `planConfirmedMessage(plan)`, `planCancelledMessage(plan, { noVotes
    })`, `expressOpenedMessage(plan, reporterName, criticalReason)`, `expressResultMessage(plan, result:
    ExpressOption, byDefault: boolean)`, `reminderMessage(plan)`. `{cuándo}` con `Intl.DateTimeFormat('es-PE', {
    timeZone: 'America/Lima', weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
    hourCycle: 'h23' })` ajustado para producir exactamente «jueves 16 de octubre, 16:00» (testear el texto).
  - `audience.ts`: `planInfo(db, proposalId): Promise<PlanInfo>` (una consulta con el grupo) y
    `groupMemberIds(db, groupId, { except?: string | null }): Promise<string[]>`.
  - `outbox.repository.ts`: `enqueue(db, items: { userId: string; kind: NotificationKind; title: string; body: string;
    data: NotificationData; dedupeKey?: string }[], now: Date): Promise<number>` — un `INSERT` por fila (o uno
    multi-fila) con `ON CONFLICT (dedupe_key) DO NOTHING`; devuelve las insertadas.
  - Se llama **dentro de la transacción ya existente** de cada cambio (si el cambio no tiene una, se envuelve en
    `db.transaction`):
    - `proposals.create(input)` → `NEW_PROPOSAL` a los miembros menos `createdBy`;
    - `proposals.confirm(id, windowId, scheduledAt, scheduledDate, now, actorId: string)` → `PLAN_CONFIRMED` menos
      `actorId`, solo si confirmó;
    - `proposals.cancel(id, actorId: string | null, now: Date)` → en una transacción; `PLAN_CANCELLED` (sin votos:
      `false`) menos `actorId` (admin: `null`), solo si canceló; `clearAutoCancelled` no encola;
    - `closeProposalIfDue` → `PLAN_CONFIRMED` o `PLAN_CANCELLED` con `noVotes: true` a todos, solo si cerró;
    - `reportIncidence` → si abrió votación, `EXPRESS_OPENED` a `voterIds` (nombre de quien avisó, `criticalReason`);
    - express `closeDue` → `EXPRESS_RESULT` (con `result`, `byDefault`) a todos los miembros, solo si cerró.
  - Firmas cambiadas: actualiza todos los llamadores (rutas, admin, seed `demo-data.ts`, tests).

- [ ] **Step 1: Write the failing tests:**
  - `notification-messages.test.ts`: los seis textos exactos de Global Constraints, incluido `{cuándo}` para
    `2026-10-16T21:00:00.000Z` = «jueves 16 de octubre, 16:00», recordatorio con y sin lugar, exprés sin quórum.
  - `notifications-outbox.test.ts` (HTTP, leer la tabla `notifications`):
    - crear propuesta → una fila `NEW_PROPOSAL` por miembro salvo quien la creó, `data.screen = 'VOTING'`;
    - confirmar a mano → `PLAN_CONFIRMED` a todos menos quien confirmó; cancelar a mano → `PLAN_CANCELLED` menos quien
      canceló; cancelar desde el admin → a todos; moderar una cancelada sola → ninguna fila nueva;
    - cierre automático con votos → `PLAN_CONFIRMED` a todos; sin votos → `PLAN_CANCELLED` «…nadie votó antes del
      plazo.»;
    - ausencia crítica → `EXPRESS_OPENED` a los votantes (no a quien avisó); cierre de la exprés → `EXPRESS_RESULT` a
      todos; resultado `CANCELAR` → solo `EXPRESS_RESULT`, ningún `PLAN_CANCELLED`;
    - quien salió del grupo antes del cambio no recibe;
    - **Review Focus 2:** un `confirm` que devuelve `false` (con `interleave` cancelando el plan justo antes de su
      `UPDATE`) no deja ninguna fila `PLAN_CONFIRMED`; y un `enqueue` que falla dentro de `create` deshace la
      propuesta (fuerza el fallo, p. ej. `interleave` que haga fallar el `INSERT INTO notifications`, o un espía sobre
      `db.query`).
- [ ] **Step 2: Run** `npx vitest run test/notification-messages.test.ts test/notifications-outbox.test.ts`. Expected:
  FAIL.
- [ ] **Step 3: Implement** lo de **Interfaces** y `docs/api.md` (tabla de avisos de la spec).
- [ ] **Step 4: Run** `npm run typecheck` y `npx vitest run`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(backend): guardar los avisos en la misma transacción que cada cambio`

