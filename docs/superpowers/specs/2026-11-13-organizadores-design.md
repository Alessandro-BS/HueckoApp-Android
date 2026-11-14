# Varios organizadores por grupo (fase 3 de paridad con Nakusuo)

Fecha: 2026-11-13 · Rama prevista: `feature/organizadores` (sale de `feature/votacion-expres-grupal`, PR #46, mientras
#43–#46 no estén integrados).

## Intención

Los dos equipos presentan el mismo producto. En la versión de Nakusuo un grupo tiene **varios organizadores**; en la
nuestra hay un único `OWNER` (domain spec C6/C7). El usuario eligió hacerlo **como Nakusuo** (decisión del 2026-11-10):
varios organizadores, y el interruptor «imprescindible» lo controla el organizador.

## Objetivos

- Un grupo puede tener uno o más organizadores; nunca cero.
- Cualquier organizador nombra organizador a un miembro y quita el rol a cualquier organizador (también a sí mismo y al
  creador).
- Los organizadores editan el grupo, marcan imprescindibles, cambian roles y gestionan cualquier propuesta del grupo.
- La ausencia de cualquier organizador sigue siendo crítica en la votación exprés.
- El rol se llama igual en datos, contrato y pantalla: «organizador» (`ORGANIZER`).

## No objetivos

- Expulsar miembros, regenerar el código/QR, añadir por correo (otra fase de la lista de paridad).
- Cambiar quién invita por proximidad: sigue pudiendo invitar cualquier miembro.
- Cuentas (iniciar sesión con Google, correo con Brevo, verificación, 2FA): fase aparte decidida por el usuario.
- Tiempo real: la app ve los cambios de rol al recargar, como hoy con «imprescindible».

## Anti-objetivos (sería un fracaso aunque funcione)

- Un grupo con miembros y sin organizadores (por quitar roles, por salir o por dos cambios a la vez).
- Una propuesta que nadie puede gestionar.
- Restos de `OWNER` en contrato, documentación o pantallas («Administrador», «Administra»).

## Restricciones

- Migración nueva al final de `backend/src/db/migrations.ts` (la 10); nunca se edita una publicada.
- `shared/index.d.ts` y `docs/api.md` cambian en el mismo commit que el endpoint.
- Errores con `ApiError` y la forma `{ error: { code, message, details } }`; validación con zod; SQL parametrizado.
- El backend y el APK nuevo se despliegan juntos (la fase 2 ya lo exige: se retiró `/incidences/resolve`).

## Enfoques considerados (representación del rol)

- **A. Renombrar el rol a `ORGANIZER`** (elegido por el usuario): migración de datos + CHECK nuevo; contrato
  `'ORGANIZER' | 'MEMBER'`; `NOT_OWNER` → `NOT_ORGANIZER`; el admin muestra `organizers`. El nombre dice la verdad.
- B. Mantener `OWNER` y permitir varios: cero migración de datos, pero «owner» en plural confunde en código, docs y admin.
- C. Columna `is_organizer` junto a `role`: dos campos para una idea, con estados inválidos posibles. Descartado.

## Diseño (decidido con el usuario)

### Datos

- Migración 10, en una transacción: quitar el CHECK inline de `group_members.role` (`group_members_role_check`),
  `UPDATE group_members SET role = 'ORGANIZER' WHERE role = 'OWNER'`, y añadir
  `CHECK (role IN ('ORGANIZER', 'MEMBER'))` con el mismo nombre.
- Antes de desplegar, comprobar en Neon el nombre del constraint:
  `SELECT conname FROM pg_constraint WHERE conrelid = 'group_members'::regclass AND contype = 'c';`

### Reglas

1. Quien crea el grupo entra como `ORGANIZER`; quien se une (código o proximidad), como `MEMBER`.
2. Cualquier organizador nombra organizador a un miembro y quita el rol a cualquier organizador, incluido él mismo y el
   creador.
3. Nunca cero organizadores: quitar el rol al último → `409 LAST_ORGANIZER` «El grupo necesita al menos un
   organizador.». El cambio de rol bloquea la fila del grupo (`SELECT … FROM groups WHERE id = $1 FOR UPDATE`), como
   `leave`, y cuenta los organizadores después del cambio dentro de la misma transacción.
4. Salir del grupo (C6 se mantiene): si se va el último organizador y quedan miembros, pasa a serlo quien lleva más
   tiempo (`joined_at, seq`); si no queda nadie, el grupo se borra.
5. Solo un organizador puede: editar el grupo (`PATCH /groups/:id`), cambiar `isEssential` o `role` de un miembro.
6. Gestionar una propuesta (`canManage`): su creador mientras sea miembro, **o** cualquier organizador del grupo.
7. Votación exprés: la ausencia (`FALTA`/`IMPREVISTO`) de cualquier organizador es crítica, razón «es organizador del
   grupo»; mismo orden: quien propuso → imprescindible → organizador.

### API y contrato

- `GroupMember.role: 'ORGANIZER' | 'MEMBER'`.
- `UpdateMemberInput = { isEssential?: boolean; role?: 'ORGANIZER' | 'MEMBER' }`, al menos un campo.
- `PATCH /groups/:id` — solo organizadores: `403 NOT_ORGANIZER` «Solo un organizador del grupo puede hacer esto.»
  (reemplaza a `NOT_OWNER`).
- `PATCH /groups/:id/members/:userId` — solo organizadores. Orden de comprobaciones: grupo (`404`), miembro del grupo
  (`403 NOT_A_MEMBER`), organizador (`403 NOT_ORGANIZER`), cuerpo (`400 VALIDATION_ERROR`), persona del grupo
  (`404 MEMBER_NOT_FOUND`), último organizador (`409 LAST_ORGANIZER`). Si llegan los dos campos se aplican en la misma
  transacción. Responde `200 GroupMember` actualizado.
- Propuestas: el `403 NOT_MANAGER` existente no cambia de forma; cambia `canManage`.
- Admin: `AdminGroupSummary.owner` → `organizers: { id, name, email }[]` (por antigüedad en el grupo), en
  `GET /admin/groups` y `GET /admin/groups/:id`.
- `docs/api.md`: §Grupos, tabla de errores (`NOT_ORGANIZER`, `LAST_ORGANIZER`), «Quién gestiona un plan», §Admin,
  `DELETE /groups/:id/members/me`. README donde nombre al administrador del grupo.

### App

- `MembersTab`: insignia «Organizador» (antes «Administrador»), visible para todos.
- Solo si soy organizador:
  - el interruptor «Imprescindible» de cada miembro (ya existe);
  - bajo cada persona, un botón de texto: «Hacer organizador» (sin confirmación; aviso «{nombre} ahora es organizador
    del grupo.») o «Quitar organizador» (con confirmación; si soy yo: «Dejarás de organizar «{grupo}»: ya no podrás
    editarlo ni gestionar sus planes.»);
  - un error (p. ej. `409 LAST_ORGANIZER`) se muestra con el mensaje del servidor en un aviso, como hoy el interruptor.
- Texto de ayuda: explica imprescindibles y que los organizadores editan el grupo y gestionan sus planes.
- El hook del grupo suma `setMemberRole(userId, role)` (mismo `PATCH`, recarga el grupo).
- Propuestas e Inicio no cambian: la app ya obedece a `canManage` del servidor.
- Admin: en el detalle del grupo, cada miembro «Organiza» / «Imprescindible» / «Miembro» y arriba la lista de
  organizadores; en el detalle del usuario, «{grupo} · Organiza el grupo».

## Mis decisiones (no las tomó el usuario; revisables)

- Se quita el respaldo «el más antiguo» de `canManage`: con la regla 3 y C6 siempre hay un organizador.
- «Hacer organizador» no pide confirmación (es reversible y no quita nada a nadie); «Quitar organizador» sí.
- `PATCH /groups/:id/members/:userId` amplía el endpoint existente en vez de crear uno nuevo (un solo sitio para editar
  a un miembro).
- Datos de demostración: `carlos` sigue organizador y en «Proyecto Integrador» `ana` pasa a organizadora, para probar
  varios organizadores desde la app.
- El aviso de nombrar usa «organizador» sin flexión de género (no conocemos el de cada persona).

## Pruebas

- Backend (Vitest + Supertest, reloj inyectable, PGlite):
  - migración 10 desde una base en versión 9 con `OWNER`: queda `ORGANIZER`, el CHECK rechaza `OWNER`, filas intactas;
  - nombrar (organizador sí; miembro `403`), quitar al último (`409`), quitarse a sí mismo con otro organizador (`200`),
    persona fuera del grupo (`404`), cuerpo vacío o rol inválido (`400`), `isEssential` + `role` juntos;
  - carrera con `interleave`: dos organizadores se quitan el rol a la vez → queda al menos uno;
  - salir: el último organizador → hereda el más antiguo; uno de dos → nadie hereda;
  - un organizador que no creó la propuesta confirma, cancela y replantea; un miembro común `403 NOT_MANAGER`;
  - votación exprés: la ausencia de un segundo organizador es crítica;
  - admin: `organizers` en orden de antigüedad.
- App (Jest + Testing Library): `MembersTab` (botones según mi rol, confirmación al quitar, error con aviso), hook del
  grupo, pantallas de admin; fixtures con `ORGANIZER`.
