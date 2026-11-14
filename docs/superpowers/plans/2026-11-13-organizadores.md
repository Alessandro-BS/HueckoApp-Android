# Varios organizadores por grupo — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un grupo tiene uno o más organizadores (`ORGANIZER`), que se nombran y se quitan entre sí sin dejar nunca el
grupo sin ninguno, y que gestionan el grupo y todas sus propuestas.

**Architecture:** Migración 10 renombra `OWNER` → `ORGANIZER` (datos + CHECK). La regla «quién gestiona» queda en un
solo sitio (`backend/src/proposals/permissions.ts`); el cambio de rol vive en `groupsRepository.updateMember`, en una
transacción con el grupo bloqueado (`FOR UPDATE`), igual que `leave`. La app solo añade los botones de rol en
`MembersTab`; el resto obedece a `canManage` del servidor.

**Tech Stack:** Express 5 + zod + `ApiError`, Postgres (Neon / PGlite) detrás de `Db`, Vitest + Supertest; Expo React
Native, Jest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-11-13-organizadores-design.md`

## Global Constraints

- Rama `feature/organizadores` (sale de `feature/votacion-expres-grupal`). Commits convencionales en español; el cuerpo
  termina con una línea en blanco y `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Sin push.
- Roles exactos: `ORGANIZER | MEMBER`. No queda `OWNER` en código, contrato, docs ni pantallas (salvo el SQL de la
  migración 10 y el texto histórico de migraciones/specs anteriores).
- Errores exactos: `403 NOT_ORGANIZER` «Solo un organizador del grupo puede hacer esto.» (reemplaza `NOT_OWNER`);
  `409 LAST_ORGANIZER` «El grupo necesita al menos un organizador.».
- Nunca cero organizadores en un grupo con miembros (quitar rol → `409`; salir → hereda quien lleva más tiempo,
  `ORDER BY joined_at, seq`).
- Gestionar una propuesta = su creador mientras sea miembro **o** cualquier organizador del grupo.
- Ausencia (`FALTA`/`IMPREVISTO`) de cualquier organizador = crítica, razón «es organizador del grupo».
- Textos de la app exactos: insignia «Organizador»; botones «Hacer organizador» / «Quitar organizador»; aviso
  «{nombre} ahora es organizador del grupo.»; confirmación propia «Dejarás de organizar «{grupo}»: ya no podrás
  editarlo ni gestionar sus planes.»; admin «Organiza» / «{grupo} · Organiza el grupo».
- `shared/index.d.ts` y `docs/api.md` cambian en el mismo commit que el endpoint. Migración nueva al final de
  `backend/src/db/migrations.ts` (la 10); nunca se edita una publicada.
- Antes de cada commit: `npm run typecheck` (raíz) y los tests de los workspaces tocados (backend `npx vitest run`;
  mobile `npx jest --maxWorkers=2`).

## Review Focus

1. **Dos organizadores se quitan el rol a la vez:** queda al menos uno (bloqueo del grupo + conteo dentro de la
   transacción). Test en Task 3 con `interleave`.
2. **Quitar rol + salir a la vez:** `leave` y `updateMember` bloquean la misma fila del grupo; el grupo nunca queda sin
   organizador. Test en Task 3.
3. **Un organizador que no creó la propuesta la gestiona;** un miembro común no. Test en Task 2.
4. **La migración 10 en una base real** con `OWNER`: los datos pasan a `ORGANIZER` y el CHECK nuevo rechaza `OWNER`.
   Test en Task 1.

---

### Task 1: El rol se llama organizador

Renombrado sin cambiar reglas: sigue habiendo un organizador por grupo al terminar esta tarea.

**Files:**
- Modify: `backend/src/db/migrations.ts` (migración 10), `shared/index.d.ts` (`GroupMember.role`),
  `backend/src/groups/groups.repository.ts` (`create`, `leave`), `backend/src/groups/groups.routes.ts`
  (`loadForOwner` → `loadForOrganizer`, `NOT_ORGANIZER`), `backend/src/proposals/permissions.ts`,
  `backend/src/proposals/express-rules.ts`, `backend/src/admin/admin-groups.ts` (SQL `role = 'ORGANIZER'`, el campo
  `owner` sigue hasta Task 4), `backend/src/db/demo-data.ts`, `mobile/src/screens/groups/tabs/MembersTab.tsx`
  (insignia «Organizador», `isOrganizer`), `mobile/src/screens/admin/AdminGroupDetailScreen.tsx`,
  `mobile/src/screens/admin/AdminUserDetailScreen.tsx`, fixtures (`mobile/src/testing/*`, `backend/test/admin-fixtures.ts`),
  `docs/api.md` (todas las menciones de `OWNER`/`NOT_OWNER`)
- Test: `backend/test/migrations.test.ts`, y los tests que usan `'OWNER'` (`grep -rn "OWNER" backend/test mobile/src`)

**Interfaces:**
- Produces: `GroupMember.role: 'ORGANIZER' | 'MEMBER'` (shared); `loadForOrganizer(groupId, userId)` en
  `groups.routes.ts` (lanza `403 NOT_ORGANIZER`).

- [ ] **Step 1: Write the failing test** en `backend/test/migrations.test.ts`, siguiendo el test de la migración 9
  (migrar hasta la 9, insertar datos, aplicar el resto):
  - con un grupo y un miembro `OWNER` y otro `MEMBER` en versión 9 → tras migrar, `ORGANIZER` y `MEMBER`;
  - insertar `role = 'OWNER'` tras migrar → falla con `23514`; `'ORGANIZER'` se acepta; ninguna fila se pierde.
- [ ] **Step 2: Run** `cd backend && npx vitest run test/migrations.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** la migración 10 al final del array:

```ts
  // 10 — Varios organizadores por grupo: el rol OWNER pasa a llamarse ORGANIZER. El CHECK de `role` (inline en la
  // migración 2, así que Postgres lo llamó group_members_role_check) se rehace con el valor nuevo.
  `ALTER TABLE group_members DROP CONSTRAINT group_members_role_check;
   UPDATE group_members SET role = 'ORGANIZER' WHERE role = 'OWNER';
   ALTER TABLE group_members ADD CONSTRAINT group_members_role_check CHECK (role IN ('ORGANIZER', 'MEMBER'));`,
```

  (`group_members` se crea en la migración 2; el test confirma el nombre del constraint en PGlite.)
- [ ] **Step 4: Rename** en el resto de archivos listados: `'OWNER'` → `'ORGANIZER'`; `NOT_OWNER` →
  `NOT_ORGANIZER` con el mensaje exacto de Global Constraints; en `leave` el conteo pasa a llamarse `organizers`;
  comentarios y docs dicen «organizador». En la app: insignia «Organizador»; admin «Organiza» / «{grupo} · Organiza el
  grupo». En `docs/api.md` añade `NOT_ORGANIZER` a la fila `403` de la tabla de errores.
- [ ] **Step 5: Run** `npm run typecheck`, `npm test -w backend` y `cd mobile && npx jest --maxWorkers=2`.
  `grep -rn "OWNER" backend/src shared mobile/src docs/api.md README.md` solo encuentra la migración 10. Expected: PASS.
- [ ] **Step 6: Commit** `refactor: el rol del grupo pasa a llamarse organizador`

### Task 2: Cualquier organizador gestiona las propuestas

**Files:**
- Modify: `backend/src/proposals/permissions.ts`, `backend/src/proposals/proposals.routes.ts` (comentario de la línea
  ~191), `docs/api.md` («Quién gestiona un plan», `DELETE /groups/:id/members/me`)
- Test: `backend/test/proposal-permissions.test.ts`, `backend/test/proposals-lifecycle.test.ts` (o el archivo de
  ciclo de vida que ya prueba `NOT_MANAGER`), `backend/test/express-vote.test.ts`

**Interfaces:**
- Consumes: Task 1 (`'ORGANIZER'`).
- Produces: `canManageProposal({ viewerId, creatorId, members }): boolean` con la regla nueva; se elimina
  `proposalManagerId` (verifica con `grep` que nadie más la usa).

```ts
/**
 * Quién gestiona (confirma, cancela, replantea) una propuesta: quien la creó mientras siga en el grupo, o cualquier
 * organizador del grupo. Siempre hay al menos un organizador (409 LAST_ORGANIZER y la herencia al salir), así que
 * ninguna propuesta queda huérfana.
 */
export function canManageProposal({ viewerId, creatorId, members }: ManageCheck): boolean {
  const viewer = members.find((m) => m.id === viewerId);
  if (!viewer) return false;
  return viewer.id === creatorId || viewer.role === 'ORGANIZER';
}
```

- [ ] **Step 1: Write the failing tests**:
  - unidad: creador miembro → `true`; organizador no creador → `true`; miembro común no creador → `false`; creador que
    ya no es miembro → `false`; quien no es miembro → `false`;
  - HTTP (Review Focus 3): con un grupo de 3 (organizador A crea; B organizador nombrado directamente en la base; C
    miembro): B confirma una propuesta de A → `200`; B la cancela / replantea → `200`; C → `403 NOT_MANAGER`;
    `GET /proposals/:id` devuelve `canManage: true` a B y `false` a C;
  - votación exprés: la `FALTA` de B (segundo organizador, no creador, no imprescindible) en un plan confirmado →
    `criticality: 'ALTA'`, `criticalReason: 'es organizador del grupo'`, votación `ABIERTA`.
- [ ] **Step 2: Run** `cd backend && npx vitest run test/proposal-permissions.test.ts test/express-vote.test.ts
  <archivo de ciclo de vida>`. Expected: FAIL (B recibe `403`).
- [ ] **Step 3: Implement** el código de arriba; actualiza el comentario de la ruta y `docs/api.md` («Quién gestiona
  un plan»: creador mientras sea miembro o cualquier organizador; quita el punto 3 del más antiguo).
- [ ] **Step 4: Run** `npm test -w backend` y `npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(backend): cualquier organizador gestiona las propuestas del grupo`

### Task 3: Nombrar y quitar organizadores

**Files:**
- Modify: `backend/src/groups/groups.schemas.ts` (`updateMemberSchema`), `backend/src/groups/groups.repository.ts`
  (`updateMember` reemplaza a `setEssential`), `backend/src/groups/groups.routes.ts`
  (`PATCH /groups/:id/members/:userId`), `backend/src/db/demo-data.ts` (Ana organizadora en «Proyecto Integrador»),
  `shared/index.d.ts` (`UpdateMemberInput`), `docs/api.md` (§`PATCH /groups/:id/members/:userId`, tabla de errores
  `409`)
- Test: `backend/test/groups.test.ts`, `backend/test/groups.repository.test.ts`, `backend/test/seed.test.ts`

**Interfaces:**
- Consumes: Task 1 (`loadForOrganizer`).
- Produces:
  - `UpdateMemberInput = { isEssential?: boolean; role?: 'ORGANIZER' | 'MEMBER' }` (al menos uno).
  - `groupsRepository(db).updateMember(groupId: string, userId: string, change: UpdateMemberInput): Promise<'OK' |
    'LAST_ORGANIZER'>` — en `db.transaction`: `SELECT id FROM groups WHERE id = $1 FOR UPDATE`; si
    `change.role === 'MEMBER'`, cuenta los `ORGANIZER` del grupo **distintos de `userId`**
    (`… AND role = 'ORGANIZER' AND user_id <> $2`) y, si son 0 y `userId` es hoy organizador, devuelve
    `'LAST_ORGANIZER'` **antes de escribir nada**; si no, aplica `is_essential` y/o `role` con un solo `UPDATE`
    (`COALESCE($3, is_essential)`, `COALESCE($4, role)`) y devuelve `'OK'`. El bloqueo del grupo hace que el conteo
    sea fiable frente a otro cambio de rol o a `leave` simultáneos.
  - Ruta: el orden de comprobaciones de la spec (§API y contrato); `409 LAST_ORGANIZER`; `200 GroupMember`.

```ts
export const updateMemberSchema = z
  .object({
    isEssential: z.boolean({ error: 'isEssential debe ser true o false' }).optional(),
    role: z.enum(['ORGANIZER', 'MEMBER'], { error: 'role debe ser ORGANIZER o MEMBER' }).optional(),
  })
  .refine((v) => v.isEssential !== undefined || v.role !== undefined, { message: 'Envía isEssential o role' });
```

- [ ] **Step 1: Write the failing tests** (HTTP, Supertest):
  - organizador A nombra a C → `200`, `role: 'ORGANIZER'`; C ya puede `PATCH /groups/:id` (`200`);
  - miembro común C intenta nombrar → `403 NOT_ORGANIZER`; no miembro → `403 NOT_A_MEMBER`; persona ajena →
    `404 MEMBER_NOT_FOUND`;
  - `{}` → `400 VALIDATION_ERROR`; `{ role: 'OWNER' }` → `400`;
  - A (único organizador) se quita el rol → `409 LAST_ORGANIZER`, sigue `ORGANIZER`;
  - con A y B organizadores, A se quita el rol → `200`; B le quita el rol al creador → `200`;
  - `{ isEssential: true, role: 'ORGANIZER' }` aplica los dos;
  - **Review Focus 1:** A y B organizadores; `interleave` hace que B se quite el rol justo antes del `UPDATE` de A
    quitándose el suyo → una de las dos peticiones `409`, queda exactamente un organizador;
  - **Review Focus 2:** A y B organizadores; B se quita el rol mientras A sale del grupo (`interleaveWith` con
    `leave`) → el grupo sigue con un organizador;
  - salir: con A y B organizadores, A sale → B sigue siendo el único organizador y C sigue `MEMBER`; con solo A, A sale →
    hereda quien lleva más tiempo;
  - seed: «Proyecto Integrador» tiene dos organizadores (`test` y `ana`).
- [ ] **Step 2: Run** `cd backend && npx vitest run test/groups.test.ts test/groups.repository.test.ts
  test/seed.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** el esquema, `updateMember` (borra `setEssential`), la ruta, el seed y la documentación
  (`docs/api.md`: cuerpo `{ isEssential?, role? }`, quién puede, errores, «nunca sin organizadores»).
- [ ] **Step 4: Run** `npm test -w backend` y `npm run typecheck`. Si la app deja de compilar por `UpdateMemberInput`,
  ajusta `mobile/src/api` para que envíe `{ isEssential }` igual que hoy (Task 5 añade el rol). Expected: PASS.
- [ ] **Step 5: Commit** `feat(backend): los organizadores nombran y quitan organizadores`

### Task 4: El panel de admin muestra los organizadores

**Files:**
- Modify: `backend/src/admin/admin-groups.ts`, `shared/index.d.ts` (`AdminGroupSummary.organizers`),
  `mobile/src/screens/admin/tabs/GroupsTab.tsx`, `mobile/src/screens/admin/AdminGroupDetailScreen.tsx`,
  `mobile/src/testing/adminFixtures.ts`, `backend/test/admin-fixtures.ts`, `docs/api.md` (§Admin grupos)
- Test: `backend/test/admin-groups.test.ts`, `mobile/src/screens/admin/__tests__/` (tests de `GroupsTab` y
  `AdminGroupDetailScreen`)

**Interfaces:**
- Consumes: Task 1, Task 3 (para crear dos organizadores en los tests).
- Produces: `AdminGroupSummary.organizers: User[]` (por `joined_at, seq`; `[]` si no hay miembros) en lugar de `owner`.
  Sin N+1: una sola consulta extra para todos los grupos de la página (p. ej. `WHERE m.group_id = ANY($1) AND
  m.role = 'ORGANIZER'`), como el resto de cargas por lotes del repositorio.

- [ ] **Step 1: Write the failing tests**: backend — un grupo con dos organizadores devuelve los dos en orden de
  antigüedad en `GET /admin/groups` y `GET /admin/groups/:id`; un grupo sin organizadores devuelve `[]`. App — la lista
  muestra «Organiza: Ana, Carlos» (o «Sin organizadores» con `[]`); el detalle lista los organizadores arriba y cada
  miembro «Organiza» / «Imprescindible» / «Miembro».
- [ ] **Step 2: Run** `cd backend && npx vitest run test/admin-groups.test.ts` y `cd mobile && npx jest
  --maxWorkers=2 admin`. Expected: FAIL.
- [ ] **Step 3: Implement**.
- [ ] **Step 4: Run** `npm run typecheck`, `npm test -w backend`, `cd mobile && npx jest --maxWorkers=2`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(admin): el panel muestra los organizadores de cada grupo`

### Task 5: Nombrar y quitar organizadores desde la app

**Files:**
- Modify: `mobile/src/api/groups.ts` (hoy envía `{ isEssential }` en la línea ~20: pasa a
  `updateMember(groupId, userId, input: UpdateMemberInput)`), `mobile/src/hooks/useGroup.ts` (`setMemberRole`),
  `mobile/src/screens/groups/GroupDetailScreen.tsx`, `mobile/src/screens/groups/tabs/MembersTab.tsx`, `README.md`
  (funcionalidad de grupos: varios organizadores; recuento de tests de la salida real de `npm test`)
- Test: `mobile/src/screens/groups/__tests__/MembersTab.test.tsx`, `mobile/src/hooks/__tests__/useGroups.test.ts`
  (ahí se prueba hoy `useGroup`),
  `mobile/src/screens/groups/__tests__/GroupDetailScreen.test.tsx`

**Interfaces:**
- Consumes: Task 3 (`PATCH /groups/:id/members/:userId` con `{ role }`, `409 LAST_ORGANIZER`).
- Produces: `useGroup(groupId).setMemberRole(userId: string, role: 'ORGANIZER' | 'MEMBER'): Promise<void>` (llama al
  `PATCH` y recarga, como `setEssential`); `MembersTab` recibe `onSetRole` con esa firma.

- [ ] **Step 1: Write the failing tests** (`MembersTab`):
  - todos ven la insignia «Organizador» en cada organizador;
  - si no soy organizador, no veo interruptores ni «Hacer organizador» / «Quitar organizador»;
  - si soy organizador: «Hacer organizador» en un miembro llama `onSetRole('u2', 'ORGANIZER')` sin confirmar y muestra
    «Ana ahora es organizador del grupo.»;
  - «Quitar organizador» en otro organizador pide confirmación (`Alert.alert`) y al aceptar llama
    `onSetRole(id, 'MEMBER')`; en mí mismo la confirmación dice «Dejarás de organizar «{grupo}»: ya no podrás
    editarlo ni gestionar sus planes.»;
  - si `onSetRole` falla con `409 LAST_ORGANIZER`, se muestra el mensaje del servidor en un aviso;
  - el texto de ayuda menciona imprescindibles y organizadores.
  - `useGroup`: `setMemberRole` envía `{ role }` y recarga.
- [ ] **Step 2: Run** `cd mobile && npx jest --maxWorkers=2 MembersTab useGroup GroupDetail`. Expected: FAIL.
- [ ] **Step 3: Implement** y actualiza el README (grupos: varios organizadores; recuento de tests real).
- [ ] **Step 4: Run** `npm run typecheck` y `npm test` desde la raíz. Expected: PASS.
- [ ] **Step 5: Commit** `feat(mobile): nombrar y quitar organizadores del grupo`
