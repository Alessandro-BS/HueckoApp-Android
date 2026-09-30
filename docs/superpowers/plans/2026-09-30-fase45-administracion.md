# Fase 4.5 «Administración»: plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un administrador de la app (rol `ADMIN`, nombrado solo por consola) ve dentro de la app móvil un panel «Administración» con estadísticas, informes exportables a PDF y CSV, gestión de usuarios (suspender / reactivar / nombrar o quitar administradores), gestión de grupos (ver, borrar, cancelar propuestas) y el registro de acciones; el servidor comprueba rol y estado en cada petición y registra cada acción de administración y cada llamada a la IA.

**Architecture:** El backend guarda `users.role` y `users.status` (migración 4, con `CHECK`) y dos tablas nuevas: `admin_audit_log` y `ai_calls`. `requireAuth(db, secret)` lee rol y estado **de la base en cada petición** (nunca del JWT): una cuenta suspendida recibe `403 ACCOUNT_SUSPENDED` en el login y con cualquier token; `requireAdmin` protege `/api/admin/*` (`403 NOT_ADMIN`). La lógica de administración vive en `backend/src/admin/` (servicios con las guardas y la auditoría en la misma transacción, consultas de estadísticas e informes, router). Los tramos por día/semana y las horas se calculan **en JavaScript con la zona del servidor (`TZ`)**; SQLite solo filtra por rango de fechas ISO. La app pide los números ya calculados y solo los dibuja (`react-native-gifted-charts` sobre `react-native-svg`) o los exporta (HTML → PDF con `expo-print`, CSV con `expo-file-system`, ambos compartidos con `expo-sharing`).

**Tech Stack:** Express 5, TypeScript 7, zod 4.6, `node:sqlite` (JSON1), Vitest + Supertest · Expo SDK 57 (`expo` ~57.0.26, RN 0.86), React Navigation 7 (`drawer`, `material-top-tabs`, `native-stack`), `react-native-gifted-charts` 1.4.78 + `react-native-svg` 15.15.4 + `expo-linear-gradient` ~57.0.2, `expo-print` ~57.0.2, `expo-sharing` ~57.0.22, `expo-file-system` ~57.0.7, jest-expo + @testing-library/react-native 14.

> **Estado tras la implementación (ronda final de correcciones):** los bloques de código de los Tasks son el borrador original. Donde difieren de lo implementado mandan el código, `shared/index.d.ts` y `docs/api.md`: periodos como días `YYYY-MM-DD` (ruling A1, Tasks 5–7), `groups.created_at` con `deps.now()` (A2), rol refrescado al volver a primer plano y con `403 NOT_ADMIN` (A3 y M3), motivo de moderación obligatorio de 3 a 200 caracteres (A5), `TZ` fijada por la configuración de los tests (I1), PDF con el nombre del periodo y la etiqueta «Planes con fecha en el periodo» (M2).

**Spec:** no hay spec aparte: los requisitos son las decisiones del encargo de la Fase 4.5 (resumidas en «Decisiones»). Contrato: `docs/api.md` y `shared/index.d.ts`. Contexto: `CLAUDE.md`, `README.md` y los planes anteriores `docs/superpowers/plans/2026-09-30-correcciones-pendientes.md` y `docs/superpowers/plans/2026-09-29-fase4-ia.md`.

## Global Constraints

- **Rama:** `feature/fase45-administracion`, **ya creada y activa**. Ningún task crea ni cambia de rama. Nunca commits en `develop`/`main`.
- Errores del backend con `throw new ApiError(status, code, message)`; forma `{ "error": { "code", "message", "details" } }`. Validación de cuerpos, `req.query` y entorno con zod. Mensajes en español.
- `docs/api.md` y `shared/index.d.ts` se actualizan **en el mismo task** que cambia o crea el endpoint (Tasks 1–5). `shared/` solo tiene tipos: se importan con `import type`.
- `app.ts` no importa `config/env.ts` (los tests crean la app sin `.env`); la configuración entra por `AppDeps` desde `index.ts`. Reloj del backend: `deps.now()`; los tests fijan `NOW` = martes 29/09/2026 10:00 hora local.
- **Rol y estado se leen de la base en cada petición**; el JWT solo lleva `sub`. Nadie se hace administrador por la API: solo con `npm run make-admin -w backend -- <correo>` (y `--revoke`).
- **Toda escritura de administración** se registra en `admin_audit_log` **en la misma transacción** (`withTransaction`). `details` nunca lleva contraseñas, hashes, tokens ni correos.
- `ai_calls` guarda solo `user_id`, `task`, `ok`, `duration_ms`, `created_at`: **nunca** el prompt ni la respuesta.
- Fechas de la API en ISO 8601 UTC. Los tramos (`day`/`week`, semanas de lunes a domingo) y las horas se calculan en la zona del servidor (`TZ`), en JavaScript (ver D8).
- Los números de estadísticas e informes se calculan **solo en el servidor**; la app solo los muestra y exporta.
- Mobile: navegación **solo con React Navigation** (nada de Expo Router). Paquetes nativos con `npx expo install <paquete>` **dentro de `mobile/`**. Mocks de módulos nativos nuevos en `mobile/jest.setup.ts`. No se tocan `android/`/`ios/`.
- Comentarios del código y todo texto visible en **español con tildes correctas**.
- Tests de mobile: RNTL v14 es **asíncrono** (`await render`, `await fireEvent.press`, `await act(async () => …)`). En fábricas de `jest.mock` solo variables con prefijo `mock` (o definidas dentro de la fábrica). Una guarda se prueba con **control positivo** en el mismo test.
- Verificación antes de cada commit, desde la raíz: `npm run typecheck` y `npm test` en verde. Los tests fijan ellos mismos `TZ=America/Lima` (`backend/vitest.config.mts` y `mobile/jest.globalSetup.js`), así que pasan igual en cualquier PC, CI o terminal (también PowerShell), sin prefijos.
- Commits convencionales en español. Identidad (no hay `user.name` configurado) y trailer = **la línea de atribución del modelo que implementa el task** (la suya propia):
  ```bash
  GIT_AUTHOR_NAME="Aless Bustamante" GIT_AUTHOR_EMAIL="fabrizio.bs9012@gmail.com" \
  GIT_COMMITTER_NAME="Aless Bustamante" GIT_COMMITTER_EMAIL="fabrizio.bs9012@gmail.com" \
  git commit -m "<tipo>(<área>): <mensaje>" -m "Co-Authored-By: <modelo que implementa> <noreply@anthropic.com>"
  ```
- `git add` siempre con rutas explícitas. **Nunca** se añaden `.claude/` ni `.superpowers/` (nada de `git add -A` ni `git add .`).
- Fuera de alcance (YAGNI): borrar usuarios, editar datos de otros usuarios, auditar acciones de usuarios normales, avisar al suspendido, filtros por estado en las listas, búsqueda sin distinguir tildes, datos de IA de ejemplo en la semilla.

### Decisiones tomadas en este plan

| # | Decisión | Dónde |
|---|---|---|
| D1 | **El rol solo viaja en la sesión.** Nuevo `CurrentUser = User & { role }` en `AuthResponse.user` y `GET /auth/me`. `User` (miembros, creadores, incidencias) **no** cambia: el rol de los demás no se publica. `status` no sale en `/auth` (una cuenta suspendida no llega a tener sesión). | Task 1 |
| D2 | **`requireAuth(db, secret)`** verifica el JWT y lee `role, status` de `users` en cada petición: sin fila → `401 UNAUTHORIZED` (cuenta borrada); `SUSPENDED` → `403 ACCOUNT_SUSPENDED` «Tu cuenta está suspendida. Si crees que es un error, escribe al equipo de HueckoApp.». Deja `res.locals.userId` y `res.locals.role`. `requireAdmin` → `403 NOT_ADMIN` «Solo la administración de HueckoApp puede hacer esto.». En el login, la suspensión solo se revela **tras** comprobar la contraseña (con una incorrecta sigue siendo `401 INVALID_CREDENTIALS`). | Task 1 |
| D3 | **Primer admin por consola:** `npm run make-admin -w backend -- <correo>` / `-- <correo> --revoke`, con la misma guarda `LAST_ADMIN`. Queda en la auditoría con `admin: null` («Consola del servidor»). La semilla crea `admin@test.com` / `password123` con rol `ADMIN` (y lo deja `ADMIN` y `ACTIVE` en cada ejecución). | Task 3 |
| D4 | **Guardas** en `adminUsers(db)` (las usan la API y la consola): cambiar al mismo valor no hace nada (200, sin auditoría); uno mismo no puede suspenderse ni quitarse el rol → `409 CANNOT_CHANGE_SELF`; el último `ADMIN` `ACTIVE` no puede suspenderse ni perder el rol → `409 LAST_ADMIN`. Por la API, `LAST_ADMIN` es defensa en profundidad (quien actúa ya es otro admin activo); por la consola (`--revoke`) sí se alcanza. | Task 3 |
| D5 | **Auditoría:** `admin_audit_log(id, admin_id NULL = consola, action, target_type, target_id, details JSON, created_at)`. Acciones: `USER_SUSPENDED`, `USER_REACTIVATED`, `USER_PROMOTED`, `USER_DEMOTED`, `GROUP_DELETED`, `PROPOSAL_CANCELLED`. `details`: solo nombres/títulos, `from`/`to`, contadores y el motivo obligatorio de la moderación (3–200 caracteres, A5); nunca correos, hashes ni tokens. Si falla la auditoría, la acción se deshace (misma transacción; hay test). | Tasks 3–4 |
| D6 | **`ai_calls`:** `askAi(ai, request, schema, record)` recibe un `record` obligatorio y lo llama una vez por petición al proveedor: `ok = true` solo con respuesta validada; `503`/`502` → `ok = false`. `durationMs` con `performance.now()`; `created_at` = `deps.now()` al empezar. Si registrar falla, se escribe en el log y la respuesta sigue igual. Lo que no llega a la IA (`429`, `400` de subida, `403`/`404`/`409`) no se registra. | Task 2 |
| D7 | **Moderación con endpoint propio `POST /admin/proposals/:id/cancel`** (no ampliando `canManageProposal`). Motivos: (1) `canManage` es «quién organiza el plan» *dentro del grupo* y lo consume la app de miembros; un admin que no es miembro ni siquiera pasa `loadForMember` (403), así que habría que saltarse la membresía en todas las rutas de propuestas; (2) la moderación tiene que quedar auditada y con motivo, cosa que no hacen las rutas de miembros; (3) todo lo de administración queda detrás de `requireAdmin` en un solo router. Reutiliza la regla `canCancel(state)` (se extrae a `rules.ts`) y `proposalsRepository.setState`. | Task 4 |
| D8 | **Zona horaria sin SQLite:** el modificador `'localtime'` de SQLite usa la zona del **sistema operativo**, no `process.env.TZ` (comprobado en este PC con Windows: con `process.env.TZ='Asia/Tokyo'`, `new Date('2026-09-29T15:00:00.000Z').getHours()` da `0` y `datetime(…,'localtime')` sigue dando `10:00`, la hora de Lima del sistema). Por eso SQLite solo filtra `created_at >= from AND created_at < to` (los ISO con `Z` y milisegundos se ordenan igual como texto y como fecha; hay índices) y el agrupado por día/semana y la hora del plan se hacen en JS con `getFullYear/getMonth/getDate/getDay/getHours`, que siguen `TZ`. Los tramos se generan con `new Date(año, mes, día)` (sin sumar milisegundos), así un cambio de horario no los descuadra. | Task 5 |
| D9 | **Rangos (ruling A1):** `from`/`to` son días de calendario `YYYY-MM-DD`, **ambos incluidos** (`from ≤ to`, máximo **366 días**, años 2000–9999; fecha inexistente, fuera de esos años o con otro formato → `400 VALIDATION_ERROR`); el servidor los convierte en `[00:00 de from, 00:00 del día siguiente a to)` con las medianoches de **su** zona, así que la zona del teléfono no desplaza el periodo. `timeseries`: `bucket` `day`\|`week` (por defecto `week`), incluye tramos vacíos. `reports`: `bucket` automático (`day` si el rango dura ≤ 31 días; si no, `week`) y `period.fromDate`/`toDate` (los días pedidos; `period.from`/`to` = el intervalo ISO calculado). `timeseries`/`popular-hours` devuelven en `from`/`to` los días pedidos. «Planes confirmados» = estado `CONFIRMADO` o `EN_RECOORDINACION`; en un periodo cuentan por `scheduled_at` (no se guarda cuándo se confirmó). `popular-hours`: hora de inicio (`scheduled_at` en la zona del servidor) de esos planes; `from`/`to` opcionales (juntos). | Task 5 |
| D10 | **Listas:** `page` desde 1 (vacío = 1), 20 por página fijos, `search` ≤ 100 caracteres con `LIKE … ESCAPE '\'` (se escapan `%`, `_` y `\`). SQLite compara sin mayúsculas solo en ASCII: «pérez» no encuentra «PÉREZ» (aceptado). Usuarios: por nombre o correo; grupos: por nombre o código. Orden: más recientes primero (`created_at DESC, rowid DESC`). | Tasks 3–4 |
| D11 | **Gráficos: `react-native-gifted-charts`** (1.4.78, JS puro sobre `react-native-svg`; su README para Expo: `npx expo install react-native-gifted-charts expo-linear-gradient react-native-svg`). `react-native-svg` está «Included in Expo Go» en SDK 57 (https://docs.expo.dev/versions/v57.0.0/sdk/svg/) y `bundledNativeModules.json` de SDK 57 fija `react-native-svg` 15.15.4 y `expo-linear-gradient` ~57.0.2; los peers de la librería son `*` (`expo-linear-gradient` y `react-native-linear-gradient` opcionales). Descartadas: `victory-native` 42 (exige `@shopify/react-native-skia` 2.6 + reanimated + gesture-handler: demasiado para unas barras y líneas) y `react-native-chart-kit` 7.0.4 (menos tipos de gráfico y opciones de ejes). Todos los gráficos pasan por un solo componente propio (`ChartCard`): la librería se mockea en un sitio y se podría cambiar sin tocar pantallas. | Task 7 |
| D12 | **Navegación:** ítem «Administración» del drawer (icono `admin-panel-settings`) solo si `user.role === 'ADMIN'`; dentro, `material-top-tabs` desplazables con 5 pestañas: Estadísticas, Informes, Usuarios, Grupos, Registro (como el detalle de grupo). Los detalles (`AdminUserDetail`, `AdminGroupDetail`) se apilan en el `AppStack`. | Tasks 7–8 |
| D13 | **Exportar:** PDF = HTML propio (tablas y barras con CSS, sin imágenes) → `Print.printToFileAsync({ html })` → `Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf' })`. CSV = `;` como separador (Excel en español), BOM UTF-8, `\r\n`, comillas cuando hace falta y apóstrofo delante de celdas que empiezan con `= + - @` (los nombres de grupo los escriben usuarios: evita fórmulas). Se escribe con `new File(Paths.cache, nombre)` + `create({ overwrite: true })` + `write(csv)` y se comparte con `mimeType: 'text/csv'`. `Sharing.isAvailableAsync()` se comprueba **antes** de generar nada (si no hay, error visible y no se imprime ni escribe). El PDF impreso se mueve a la caché con el nombre del periodo (`reportFileName`, igual que el CSV). Mientras se exporta, los dos botones están desactivados y el error mostrado es siempre el de la última exportación. Todo en Expo Go (docs de SDK 57 de print, sharing y filesystem: «Included in Expo Go»). | Task 7 |
| D14 | **Fin de sesión en la app:** el interceptor llama al manejador con el motivo (`'UNAUTHORIZED'` o `'ACCOUNT_SUSPENDED'`) solo si la petición salió con el token vigente; con `ACCOUNT_SUSPENDED`, `AuthContext` muestra el mensaje del servidor en un toast y cierra sesión. Un `403` de otro código (p. ej. `NOT_A_MEMBER`) no cierra sesión. El rol nuevo se ve al volver a la app (primer plano), al reabrirla o al iniciar sesión: `AuthContext` pide `/auth/me` al arrancar y al volver a primer plano (A3), y también cuando una petición con el token vigente responde `403 NOT_ADMIN` (M3); los detalles de administración del `AppStack` solo se registran para `ADMIN`. | Task 6 |

## Mapa de archivos

**shared/**
| Archivo | Cambio |
|---|---|
| `index.d.ts` | `UserRole`, `UserStatus`, `CurrentUser`, `AuthResponse.user: CurrentUser` (T1) · `AiTask` (T2) · `Page`, `AdminUserSummary`, `AdminUserDetail`, `AdminUserGroup`, `AdminUserActivity`, `UserStatusInput`, `UserRoleInput`, `AuditAction`, `AuditTargetType`, `AuditDetails`, `AuditEntry` (T3) · `AdminGroupSummary`, `AdminGroupDetail`, `AdminProposalSummary`, `AdminCancelProposalInput` (T4) · `ProposalCounts`, `AiTaskStats`, `AiUsage`, `AdminStats`, `StatsBucket`, `TimeseriesPoint`, `Timeseries`, `HourCount`, `PopularHours`, `ReportPeriod`, `ReportSummary`, `TopGroup`, `AdminReport` (T5) |

**backend/**
| Archivo | Responsabilidad |
|---|---|
| `src/db/migrations.ts` | Migración 4: `role`, `status`, índices por `created_at`, `admin_audit_log`, `ai_calls` (T1) |
| `src/auth/require-auth.ts` | `requireAuth(db, secret)`, `getUserRole`, `requireAdmin`, `accountSuspended` (T1) |
| `src/users/users.repository.ts` | `Account`, `toCurrentUser`, rol y estado (T1) |
| `src/auth/auth.routes.ts`, `src/app.ts` | Login con suspendidos, `/me` con rol, `requireAuth` nuevo (T1); monta `/admin` (T3) |
| `src/ai/ai-client.ts`, `src/ai/ask-ai.ts`, `src/ai/ai-calls.repository.ts` (nuevo), `src/ai/ai.routes.ts` | Registro de llamadas a la IA (T2) |
| `src/admin/paging.ts` (nuevo) | `ADMIN_PAGE_SIZE`, `offsetOf`, `likePattern`, `toPage` (T3) |
| `src/admin/admin.schemas.ts` (nuevo) | zod de listas, estado, rol (T3), cancelar (T4), rangos (T5) |
| `src/admin/audit.repository.ts` (nuevo) | Escribir y listar la auditoría (T3) |
| `src/admin/admin-users.ts` (nuevo) | Lista, detalle, `setStatus`, `setRole` con guardas y auditoría; `setRoleByEmail` (T3) |
| `src/admin/make-admin-args.ts`, `src/admin/make-admin.ts` (nuevos) | CLI (T3) |
| `src/admin/admin-groups.ts` (nuevo) | Lista, detalle, borrar grupo, cancelar propuesta (T4) |
| `src/admin/stats.ts` (nuevo) | Totales, series, horas, uso de IA, informe (T5) |
| `src/admin/admin.routes.ts` (nuevo) | Router `/api/admin` (T3, T4, T5) |
| `src/proposals/rules.ts`, `src/proposals/proposals.routes.ts` | `canCancel` compartido (T4) |
| `src/db/demo-data.ts`, `src/db/seed.ts`, `package.json` | Cuenta `admin@test.com`, script `make-admin` (T3) |
| `test/helpers.ts` | `registerUser` devuelve `User` sin rol (T1) |
| `test/admin-fixtures.ts` (nuevo) | `registerAdmin`, `insertUser` (T3), `insertGroup`, `insertProposal` (T4), `insertAiCall` (T5) |
| `test/account-status.test.ts`, `test/ai-calls.test.ts`, `test/admin-users.test.ts`, `test/make-admin.test.ts`, `test/admin-groups.test.ts`, `test/admin-stats.test.ts` (nuevos) | Tests |
| `test/auth.test.ts`, `test/database.test.ts`, `test/ai-core.test.ts`, `test/gemini-client.test.ts`, `test/seed.test.ts` | Ajustes |

**mobile/**
| Archivo | Responsabilidad |
|---|---|
| `src/api/client.ts`, `src/api/auth.ts`, `src/context/AuthContext.tsx` | Motivo de fin de sesión, `CurrentUser`, suspendido → toast + logout (T6) |
| `src/api/admin.ts` (nuevo) | Endpoints de administración (T6) |
| `src/utils/admin.ts` (nuevo) | Etiquetas, rangos del informe, `canSeeAdmin` (T6) |
| `src/hooks/usePagedList.ts`, `useAdminLists.ts`, `useAdminStats.ts`, `useAdminReport.ts`, `useAdminUser.ts`, `useAdminGroup.ts` (nuevos) | Hooks por pantalla (T6) |
| `src/utils/reportExport.ts`, `src/utils/shareReport.ts` (nuevos) | CSV/HTML del informe y compartir (T7) |
| `src/components/ChartCard.tsx`, `src/components/StatTile.tsx` (nuevos), `src/components/index.ts` | Gráficos y cifras (T7) |
| `src/screens/admin/AdminScreen.tsx`, `tabs/StatsTab.tsx`, `tabs/ReportsTab.tsx` (nuevos) | Panel, Estadísticas, Informes (T7) |
| `src/screens/admin/tabs/UsersTab.tsx`, `tabs/GroupsTab.tsx`, `tabs/AuditTab.tsx`, `Pager.tsx`, `AdminUserDetailScreen.tsx`, `AdminGroupDetailScreen.tsx`, `CancelProposalDialog.tsx` (nuevos) | Usuarios, Grupos, Registro, detalles (T8) |
| `src/navigation/types.ts`, `AppDrawer.tsx`, `RootNavigator.tsx` | Ítem del drawer y pantallas apiladas (T7, T8) |
| `jest.setup.ts`, `package.json`, `app.json` (solo si `expo install` lo toca), `../package-lock.json` | Dependencias y mocks (T7) |

**docs/** `api.md` (T1–T5) · `README.md` (T3, T8)

---

### Task 1: Backend — rol y estado de la cuenta, leídos de la base en cada petición

**Files:**
- Modify: `backend/src/db/migrations.ts` (añadir la migración 4 al final del array)
- Modify: `shared/index.d.ts` (tipos de usuario)
- Modify (reemplazo completo): `backend/src/users/users.repository.ts`, `backend/src/auth/require-auth.ts`
- Modify: `backend/src/auth/auth.routes.ts`, `backend/src/app.ts`
- Modify: `backend/test/helpers.ts`, `backend/test/auth.test.ts`, `backend/test/users.repository.test.ts`, `backend/test/database.test.ts`, `mobile/src/context/__tests__/AuthContext.test.tsx`
- Create: `backend/test/account-status.test.ts`
- Modify: `docs/api.md`

**Interfaces:**
- Consumes: `Db`, `ApiError`, `verifyToken`, `withTransaction` (no cambia), helpers de test (`makeTestApp`, `registerUser`, `bearer`, `TEST_SECRET`, `NOW`).
- Produces:
  - shared: `UserRole = 'USER' | 'ADMIN'`, `UserStatus = 'ACTIVE' | 'SUSPENDED'`, `CurrentUser = User & { role: UserRole }`, `AuthResponse = { token: string; user: CurrentUser }`.
  - `backend/src/auth/require-auth.ts`: `requireAuth(db: Db, secret: string): RequestHandler`, `getUserId(res): string`, `getUserRole(res): UserRole`, `requireAdmin: RequestHandler`, `accountSuspended(): ApiError`.
  - `backend/src/users/users.repository.ts`: `type Account = CurrentUser & { status: UserStatus }`, `toCurrentUser(account: Account): CurrentUser`, `usersRepository(db)` con `create({ name, email, passwordHash, createdAt }): CurrentUser`, `findByEmail(email): (Account & { passwordHash: string }) | undefined`, `findById(id): Account | undefined`.
  - `authRouter(deps: ResolvedDeps)` (ahora usa `deps.now` para `users.created_at`).
  - Tablas nuevas (las usan los Tasks 2–5): `admin_audit_log`, `ai_calls`; columnas `users.role`, `users.status`.
  - `test/helpers.ts`: `registerUser(app, overrides)` sigue devolviendo `{ token: string; user: User }` (**sin** `role`, igual que el usuario aparece en miembros y propuestas).

- [ ] **Step 1: Escribir los tests que fallan**

`backend/test/account-status.test.ts` (nuevo):

```ts
import express from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { requireAdmin, requireAuth } from '../src/auth/require-auth';
import type { Db } from '../src/db/database';
import { errorHandler } from '../src/middleware/errors';
import { bearer, makeTestApp, NOW, registerUser, TEST_SECRET } from './helpers';

const setRole = (db: Db, id: string, role: 'USER' | 'ADMIN') => db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, id);
const setStatus = (db: Db, id: string, status: 'ACTIVE' | 'SUSPENDED') =>
  db.prepare('UPDATE users SET status = ? WHERE id = ?').run(status, id);

const SUSPENDED = {
  code: 'ACCOUNT_SUSPENDED',
  message: 'Tu cuenta está suspendida. Si crees que es un error, escribe al equipo de HueckoApp.',
};

describe('rol en la sesión (D1)', () => {
  it('registro, login y /auth/me devuelven role USER', async () => {
    const { app } = makeTestApp();
    const reg = await request(app).post('/api/auth/register').send({ name: 'Ana', email: 'ana@correo.com', password: 'contrasena-segura' });
    expect(reg.body.user).toEqual({ id: expect.any(String), name: 'Ana', email: 'ana@correo.com', role: 'USER' });
    const login = await request(app).post('/api/auth/login').send({ email: 'ana@correo.com', password: 'contrasena-segura' });
    expect(login.body.user).toEqual(reg.body.user);
    const me = await request(app).get('/api/auth/me').set(bearer(login.body.token));
    expect(me.body).toEqual(reg.body.user);
  });

  it('el registro nunca crea administradores, aunque el cuerpo lo pida', async () => {
    const { app } = makeTestApp();
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Eva', email: 'eva@correo.com', password: 'contrasena-segura', role: 'ADMIN' });
    expect(res.status).toBe(201);
    expect(res.body.user.role).toBe('USER');
  });

  it('/auth/me lee el rol de la base en cada petición: el mismo token ve el cambio', async () => {
    const { app, db } = makeTestApp();
    const ana = await registerUser(app);
    setRole(db, ana.user.id, 'ADMIN');
    expect((await request(app).get('/api/auth/me').set(bearer(ana.token))).body.role).toBe('ADMIN');
    setRole(db, ana.user.id, 'USER');
    expect((await request(app).get('/api/auth/me').set(bearer(ana.token))).body.role).toBe('USER');
  });

  it('la fecha de alta sale del reloj de la app (las estadísticas cuentan registros por día)', async () => {
    const { app, db } = makeTestApp({ now: () => NOW });
    const ana = await registerUser(app);
    const row = db.prepare('SELECT created_at FROM users WHERE id = ?').get(ana.user.id) as { created_at: string };
    expect(row.created_at).toBe(NOW.toISOString());
  });
});

describe('cuentas suspendidas (D2)', () => {
  it('login: con la contraseña correcta → 403 ACCOUNT_SUSPENDED; con una incorrecta, el 401 de siempre', async () => {
    const { app, db } = makeTestApp();
    const ana = await registerUser(app, { email: 'ana@correo.com', password: 'contrasena-segura' });
    const login = (password: string) => request(app).post('/api/auth/login').send({ email: 'ana@correo.com', password });
    expect((await login('contrasena-segura')).status).toBe(200); // control positivo
    setStatus(db, ana.user.id, 'SUSPENDED');
    const ok = await login('contrasena-segura');
    expect(ok.status).toBe(403);
    expect(ok.body.error).toMatchObject(SUSPENDED);
    expect(ok.body.token).toBeUndefined();
    const wrong = await login('otra-contrasena');
    expect(wrong.status).toBe(401);
    expect(wrong.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('un token emitido antes de suspender deja de valer en cualquier ruta y vuelve a valer al reactivar', async () => {
    const { app, db } = makeTestApp();
    const ana = await registerUser(app);
    expect((await request(app).get('/api/groups').set(bearer(ana.token))).status).toBe(200); // control positivo
    setStatus(db, ana.user.id, 'SUSPENDED');
    for (const path of ['/api/groups', '/api/auth/me', '/api/me/dashboard', '/api/ai/status']) {
      const res = await request(app).get(path).set(bearer(ana.token));
      expect(res.status, path).toBe(403);
      expect(res.body.error, path).toMatchObject(SUSPENDED);
    }
    setStatus(db, ana.user.id, 'ACTIVE');
    expect((await request(app).get('/api/groups').set(bearer(ana.token))).status).toBe(200);
  });

  it('el token de una cuenta que ya no existe → 401 UNAUTHORIZED', async () => {
    const { app, db } = makeTestApp();
    const ana = await registerUser(app);
    db.prepare('DELETE FROM users WHERE id = ?').run(ana.user.id);
    const res = await request(app).get('/api/groups').set(bearer(ana.token));
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });
});

describe('requireAdmin (D2)', () => {
  // App mínima con los dos middlewares: las rutas /api/admin llegan en el Task 3.
  const adminOnly = (db: Db) => {
    const app = express();
    app.get('/solo-admin', requireAuth(db, TEST_SECRET), requireAdmin, (_req, res) => {
      res.json({ ok: true });
    });
    app.use(errorHandler);
    return app;
  };

  it('USER → 403 NOT_ADMIN; el mismo token con rol ADMIN en la base → 200', async () => {
    const { app, db } = makeTestApp();
    const ana = await registerUser(app);
    const guarded = adminOnly(db);
    const denied = await request(guarded).get('/solo-admin').set(bearer(ana.token));
    expect(denied.status).toBe(403);
    expect(denied.body.error).toMatchObject({ code: 'NOT_ADMIN', message: 'Solo la administración de HueckoApp puede hacer esto.' });
    setRole(db, ana.user.id, 'ADMIN');
    expect((await request(guarded).get('/solo-admin').set(bearer(ana.token))).status).toBe(200);
  });

  it('un claim role: ADMIN dentro del JWT no sirve: manda la base', async () => {
    const { app, db } = makeTestApp();
    const ana = await registerUser(app);
    const forged = jwt.sign({ role: 'ADMIN' }, TEST_SECRET, { subject: ana.user.id, expiresIn: '1h' });
    const res = await request(adminOnly(db)).get('/solo-admin').set(bearer(forged));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('NOT_ADMIN');
  });

  it('un ADMIN suspendido tampoco pasa: 403 ACCOUNT_SUSPENDED', async () => {
    const { app, db } = makeTestApp();
    const ana = await registerUser(app);
    setRole(db, ana.user.id, 'ADMIN');
    setStatus(db, ana.user.id, 'SUSPENDED');
    const res = await request(adminOnly(db)).get('/solo-admin').set(bearer(ana.token));
    expect(res.status).toBe(403);
    expect(res.body.error).toMatchObject(SUSPENDED);
  });
});
```

Al final de `backend/test/database.test.ts`, añadir:

```ts
describe('migración de administración (Fase 4.5)', () => {
  it('users nace con role USER y status ACTIVE, y rechaza otros valores', () => {
    const db = openDatabase(':memory:');
    db.prepare("INSERT INTO users (id, name, email, password_hash) VALUES ('u1', 'Ana', 'ana@correo.com', 'x')").run();
    expect({ ...(db.prepare('SELECT role, status FROM users').get() as object) }).toEqual({ role: 'USER', status: 'ACTIVE' });
    expect(() => db.prepare("UPDATE users SET role = 'ROOT'").run()).toThrow(/CHECK/);
    expect(() => db.prepare("UPDATE users SET status = 'BORRADO'").run()).toThrow(/CHECK/);
  });

  it('ai_calls solo acepta tareas conocidas y ok 0/1; admin_audit_log exige acciones conocidas y JSON válido', () => {
    const db = openDatabase(':memory:');
    const call = db.prepare('INSERT INTO ai_calls (user_id, task, ok, duration_ms, created_at) VALUES (NULL, ?, ?, 10, ?)');
    expect(() => call.run('voting-summary', 1, '2026-09-29T15:00:00.000Z')).not.toThrow();
    expect(() => call.run('inventada', 1, '2026-09-29T15:00:00.000Z')).toThrow(/CHECK/);
    expect(() => call.run('voting-summary', 2, '2026-09-29T15:00:00.000Z')).toThrow(/CHECK/);
    const audit = db.prepare("INSERT INTO admin_audit_log (id, admin_id, action, target_type, target_id, details) VALUES (?, NULL, ?, 'GROUP', 'g1', ?)");
    expect(() => audit.run('a1', 'GROUP_DELETED', '{"name":"Grupo"}')).not.toThrow();
    expect(() => audit.run('a2', 'GROUP_DELETED', 'no es json')).toThrow(/CHECK/);
    expect(() => audit.run('a3', 'USER_DELETED', '{}')).toThrow(/CHECK/);
  });

  it('ai_calls no tiene columnas para el prompt ni la respuesta', () => {
    const db = openDatabase(':memory:');
    const columns = (db.prepare('PRAGMA table_info(ai_calls)').all() as { name: string }[]).map((c) => c.name);
    expect(columns).toEqual(['id', 'user_id', 'task', 'ok', 'duration_ms', 'created_at']);
  });
});
```

Ajustes de tests existentes (el usuario de `/auth` ahora lleva `role`):
- `backend/test/auth.test.ts` línea 20: `expect(res.body.user).toEqual({ id: expect.any(String), name: 'Ana Pérez', email: 'ana@correo.com' });` → `expect(res.body.user).toEqual({ id: expect.any(String), name: 'Ana Pérez', email: 'ana@correo.com', role: 'USER' });`
- `backend/test/auth.test.ts` línea 72 (dentro de «devuelve el usuario del token»): `expect(res.body).toEqual(user);` → `expect(res.body).toEqual({ ...user, role: 'USER' });`
- `backend/test/users.repository.test.ts`: `const input = { name: 'Ana', email: 'ana@correo.com', passwordHash: 'hash' };` → `const input = { name: 'Ana', email: 'ana@correo.com', passwordHash: 'hash', createdAt: '2026-09-29T15:00:00.000Z' };`
- `mobile/src/context/__tests__/AuthContext.test.tsx` línea 11: `const ana = { id: 'u1', name: 'Ana', email: 'ana@correo.com' };` → `const ana = { id: 'u1', name: 'Ana', email: 'ana@correo.com', role: 'USER' as const };` (`AuthResponse.user` pasa a ser `CurrentUser`; sin esto no compila el typecheck de mobile).

- [ ] **Step 2: Ejecutar y ver que fallan**

Run: `cd backend && npx vitest run test/account-status.test.ts test/database.test.ts`
Expected: FAIL — `no such column: role` / `no such table: ai_calls`, y `requireAuth(db, …)` con la firma vieja.

- [ ] **Step 3: Migración 4** — en `backend/src/db/migrations.ts`, añadir este elemento al final del array (después de la migración 3):

```ts
  // 4 — Fase 4.5: administración. Rol y estado de cada cuenta (se leen de aquí en cada petición, nunca del JWT),
  // registro de acciones de administración y de llamadas a la IA (sin prompt ni respuesta), e índices por fecha para
  // las estadísticas (filtran por rango de created_at / scheduled_at). admin_id NULL = consola (npm run make-admin).
  `ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'USER' CHECK (role IN ('USER', 'ADMIN'));
   ALTER TABLE users ADD COLUMN status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'SUSPENDED'));
   CREATE INDEX users_created_idx ON users (created_at);
   CREATE INDEX groups_created_idx ON groups (created_at);
   CREATE INDEX proposals_created_idx ON proposals (created_at);
   CREATE INDEX proposals_scheduled_idx ON proposals (scheduled_at);
   CREATE INDEX incidences_created_idx ON incidences (created_at);
   CREATE TABLE admin_audit_log (
     id          TEXT PRIMARY KEY,
     admin_id    TEXT REFERENCES users(id),
     action      TEXT NOT NULL CHECK (action IN ('USER_SUSPENDED', 'USER_REACTIVATED', 'USER_PROMOTED', 'USER_DEMOTED',
                                                 'GROUP_DELETED', 'PROPOSAL_CANCELLED')),
     target_type TEXT NOT NULL CHECK (target_type IN ('USER', 'GROUP', 'PROPOSAL')),
     target_id   TEXT NOT NULL,
     details     TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(details)),
     created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
   );
   CREATE INDEX admin_audit_log_created_idx ON admin_audit_log (created_at);
   CREATE TABLE ai_calls (
     id          INTEGER PRIMARY KEY,
     user_id     TEXT REFERENCES users(id) ON DELETE SET NULL,
     task        TEXT NOT NULL CHECK (task IN ('schedule-ocr', 'proposal-draft', 'plan-suggestions', 'voting-summary')),
     ok          INTEGER NOT NULL CHECK (ok IN (0, 1)),
     duration_ms INTEGER NOT NULL CHECK (duration_ms >= 0),
     created_at  TEXT NOT NULL
   );
   CREATE INDEX ai_calls_created_idx ON ai_calls (created_at);`,
```

(Comprobado con `node:sqlite`: `ALTER TABLE … ADD COLUMN … NOT NULL DEFAULT 'USER' CHECK (…)` rellena las filas existentes y el `CHECK` rechaza otros valores.)

- [ ] **Step 4: Tipos compartidos** — en `shared/index.d.ts`, sustituir:

```ts
export type User = { id: string; name: string; email: string };

export type AuthResponse = { token: string; user: User };
```

por:

```ts
export type User = { id: string; name: string; email: string };

// Rol en la app y estado de la cuenta (docs/api.md, «Rol y estado de la cuenta»).
export type UserRole = 'USER' | 'ADMIN';
export type UserStatus = 'ACTIVE' | 'SUSPENDED';

// Quien inició sesión: solo lo devuelve /auth. Los demás usuarios (miembros, creadores…) siguen siendo `User`:
// el rol de otras personas no se publica.
export type CurrentUser = User & { role: UserRole };

export type AuthResponse = { token: string; user: CurrentUser };
```

- [ ] **Step 5: Repositorio de usuarios** — reemplazar `backend/src/users/users.repository.ts` completo:

```ts
import { randomUUID } from 'node:crypto';

import type { CurrentUser, UserRole, UserStatus } from '@hueckoapp/shared';

import type { Db } from '../db/database';
import { ApiError } from '../middleware/errors';

type UserRow = { id: string; name: string; email: string; password_hash: string; role: UserRole; status: UserStatus };

// La cuenta completa: lo que ve su dueño (CurrentUser) más su estado. El estado no sale en /auth (D1).
export type Account = CurrentUser & { status: UserStatus };

const toAccount = (row: UserRow): Account => ({ id: row.id, name: row.name, email: row.email, role: row.role, status: row.status });

// Lo que devuelve /auth: sin el estado (una cuenta suspendida no llega a tener sesión).
export const toCurrentUser = ({ status: _status, ...user }: Account): CurrentUser => user;

export function usersRepository(db: Db) {
  return {
    // Siempre nace USER y ACTIVE (valores por defecto de la tabla): nadie se hace administrador al registrarse.
    // `createdAt` sale del reloj de la app, como el resto de fechas que cuentan las estadísticas.
    create(input: { name: string; email: string; passwordHash: string; createdAt: string }): CurrentUser {
      const id = randomUUID();
      try {
        db.prepare('INSERT INTO users (id, name, email, password_hash, created_at) VALUES (?, ?, ?, ?, ?)').run(
          id, input.name, input.email, input.passwordHash, input.createdAt,
        );
      } catch (e) {
        // Dos registros simultáneos con el mismo correo pasan findByEmail; el UNIQUE los frena.
        if (e instanceof Error && e.message.includes('UNIQUE constraint failed: users.email')) {
          throw new ApiError(409, 'EMAIL_TAKEN', 'Ya existe una cuenta con ese correo.');
        }
        throw e;
      }
      return { id, name: input.name, email: input.email, role: 'USER' };
    },
    findByEmail(email: string): (Account & { passwordHash: string }) | undefined {
      const row = db.prepare('SELECT * FROM users WHERE email = ?').get(email) as UserRow | undefined;
      return row && { ...toAccount(row), passwordHash: row.password_hash };
    },
    findById(id: string): Account | undefined {
      const row = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined;
      return row && toAccount(row);
    },
  };
}
```

- [ ] **Step 6: Middlewares** — reemplazar `backend/src/auth/require-auth.ts` completo:

```ts
import type { UserRole, UserStatus } from '@hueckoapp/shared';
import type { RequestHandler, Response } from 'express';

import type { Db } from '../db/database';
import { ApiError } from '../middleware/errors';
import { verifyToken } from './tokens';

const unauthorized = () => new ApiError(401, 'UNAUTHORIZED', 'Tu sesión expiró. Inicia sesión de nuevo.');

export const accountSuspended = () =>
  new ApiError(403, 'ACCOUNT_SUSPENDED', 'Tu cuenta está suspendida. Si crees que es un error, escribe al equipo de HueckoApp.');

type AccessRow = { role: UserRole; status: UserStatus };

/**
 * Exige un JWT válido y una cuenta ACTIVE (D2). El rol y el estado se leen de la base en CADA petición: suspender
 * o cambiar el rol surte efecto al instante, sin esperar a que caduque el token, y nada de lo que venga dentro del
 * JWT (salvo `sub`) cuenta.
 */
export function requireAuth(db: Db, secret: string): RequestHandler {
  const findAccess = db.prepare('SELECT role, status FROM users WHERE id = ?');
  return (req, res, next) => {
    const header = req.get('authorization') ?? '';
    const [scheme, token] = header.split(' ');
    const userId = scheme === 'Bearer' && token ? verifyToken(token, secret) : null;
    if (!userId) return next(unauthorized());
    const access = findAccess.get(userId) as AccessRow | undefined;
    if (!access) return next(unauthorized()); // la cuenta ya no existe
    if (access.status === 'SUSPENDED') return next(accountSuspended());
    res.locals.userId = userId;
    res.locals.role = access.role;
    next();
  };
}

// Id del usuario autenticado. Solo se usa detrás de requireAuth.
export function getUserId(res: Response): string {
  const id = res.locals.userId;
  if (typeof id !== 'string') throw unauthorized();
  return id;
}

// Rol del usuario autenticado, tal como lo leyó requireAuth de la base.
export function getUserRole(res: Response): UserRole {
  const role = res.locals.role;
  if (role !== 'USER' && role !== 'ADMIN') throw unauthorized();
  return role;
}

// Rutas de administración (/api/admin). Va siempre detrás de requireAuth.
export const requireAdmin: RequestHandler = (_req, res, next) => {
  if (getUserRole(res) !== 'ADMIN') {
    return next(new ApiError(403, 'NOT_ADMIN', 'Solo la administración de HueckoApp puede hacer esto.'));
  }
  next();
};
```

- [ ] **Step 7: Rutas de `/auth`** — en `backend/src/auth/auth.routes.ts`:
  - Imports: `import type { AppDeps } from '../app';` → `import type { ResolvedDeps } from '../app';`; `import { usersRepository } from '../users/users.repository';` → `import { toCurrentUser, usersRepository } from '../users/users.repository';`; `import { getUserId, requireAuth } from './require-auth';` → `import { accountSuspended, getUserId, requireAuth } from './require-auth';`
  - Firma: `export function authRouter({ db, jwtSecret, jwtExpiresIn, loginRateLimit = LOGIN_RATE_LIMIT_DEFAULT, registerRateLimit = REGISTER_RATE_LIMIT_DEFAULT }: AppDeps) {` → igual pero con `now,` después de `jwtExpiresIn,` y el tipo `ResolvedDeps`.
  - En `/register`: `const user = users.create({ name, email, passwordHash: await hashPassword(password) });` → `const user = users.create({ name, email, passwordHash: await hashPassword(password), createdAt: now().toISOString() });`
  - En `/login`, sustituir desde `if (!found || !ok) {` hasta `res.json(body);` por:

```ts
    if (!found || !ok) {
      throw new ApiError(401, 'INVALID_CREDENTIALS', 'Correo o contraseña incorrectos.');
    }
    // Solo quien sabe la contraseña se entera de que la cuenta está suspendida (D2).
    if (found.status === 'SUSPENDED') throw accountSuspended();
    const { passwordHash: _omit, ...account } = found;
    const body: AuthResponse = { token: signToken(account.id, jwtSecret, jwtExpiresIn), user: toCurrentUser(account) };
    res.json(body);
```

  - `/me` completo:

```ts
  router.get('/me', requireAuth(db, jwtSecret), (_req, res) => {
    const account = users.findById(getUserId(res));
    if (!account) throw new ApiError(401, 'UNAUTHORIZED', 'Tu sesión expiró. Inicia sesión de nuevo.');
    res.json(toCurrentUser(account));
  });
```

- [ ] **Step 8: `app.ts`** — en `backend/src/app.ts`, justo después de `api.use('/auth', authRouter(deps));`, sustituir las siete líneas `api.use(... requireAuth(deps.jwtSecret) ...)` (con sus comentarios intermedios) por:

```ts
  // Un único middleware para todas las rutas con token: lee rol y estado de la base en cada petición (D2).
  const auth = requireAuth(deps.db, deps.jwtSecret);
  api.use('/me/time-blocks', auth, timeBlocksRouter(deps));
  api.use('/me', auth, meRouter(deps));
  api.use('/groups', auth, groupsRouter(deps));
  // groupsRouter no tiene /:id/proposals: esas peticiones pasan de largo y las atiende este router.
  api.use('/groups', auth, groupProposalsRouter(deps));
  // /groups/:id/ai/... tampoco lo atienden los dos routers anteriores: llega hasta aquí.
  api.use('/groups', auth, groupAiRouter(deps));
  api.use('/proposals', auth, proposalsRouter(deps));
  api.use('/proposals', auth, proposalAiRouter(deps));
  api.use('/ai', auth, aiRouter(deps));
```

- [ ] **Step 9: Helper de tests** — en `backend/test/helpers.ts`:
  - Import: `import type { Group, Proposal, ProposalInput, User } from '@hueckoapp/shared';` → `import type { CurrentUser, Group, Proposal, ProposalInput, User } from '@hueckoapp/shared';`
  - En `registerUser`, sustituir `return res.body;` por:

```ts
  // Como `User` (sin `role`), que es como aparece en miembros y propuestas: así los tests comparan con toEqual.
  const { role: _role, ...user } = res.body.user as CurrentUser;
  return { token: res.body.token, user };
```

- [ ] **Step 10: Contrato** — en `docs/api.md`:
  - Tabla de errores: `| 401 | Falta el token o expiró → la app vuelve al login |` → `| 401 | Falta el token, expiró o la cuenta ya no existe → la app vuelve al login |`
  - `| 403 | Autenticado pero sin permiso (p. ej. no es miembro del grupo) |` → `| 403 | Autenticado pero sin permiso (p. ej. no es miembro del grupo). `ACCOUNT_SUSPENDED`: la cuenta está suspendida (en el login y con cualquier token) → la app cierra sesión y muestra el mensaje. `NOT_ADMIN`: ruta de administración y la cuenta no es `ADMIN` |`
  - Tabla de tipos: después de la fila `| `User` | Usuario (`id`, `name`, `email`) |` añadir `| `CurrentUser` | Quien inició sesión: `User` + `role` (`USER`/`ADMIN`). Solo lo devuelven `/auth/register`, `/auth/login` y `/auth/me` |`
  - `` `201 { "token": "<jwt>", "user": User }` · `409 EMAIL_TAKEN` `` → `` `201 { "token": "<jwt>", "user": CurrentUser }` · `409 EMAIL_TAKEN`. La cuenta nace siempre con `role: "USER"` (un `role` en el cuerpo se ignora). ``
  - `` `200 { "token": "<jwt>", "user": User }` · `401 INVALID_CREDENTIALS` `` → `` `200 { "token": "<jwt>", "user": CurrentUser }` · `401 INVALID_CREDENTIALS` · `403 ACCOUNT_SUSPENDED` ``
  - Al final del párrafo «El `401 INVALID_CREDENTIALS` lleva el mensaje…», añadir: `` `403 ACCOUNT_SUSPENDED` («Tu cuenta está suspendida. Si crees que es un error, escribe al equipo de HueckoApp.») solo sale si la contraseña es correcta; con una incorrecta la respuesta es el mismo `401`. ``
  - `` `200 User`. La app lo usa al abrir para comprobar si el token guardado sigue siendo válido. `` → `` `200 CurrentUser` (`{ id, name, email, role }`). La app lo usa al abrir para comprobar si el token guardado sigue siendo válido y para saber si mostrar «Administración». ``
  - Justo antes de la línea `> **Cerrar sesión** se hace en la app…`, añadir:

~~~markdown
### Rol y estado de la cuenta
Cada cuenta tiene `role` (`USER` o `ADMIN`) y `status` (`ACTIVE` o `SUSPENDED`). El JWT solo identifica a la persona (`sub`): **en cada petición con token el servidor lee el rol y el estado de la base**, así que un cambio surte efecto al instante, sin esperar a que caduque el token (un `role` metido en el JWT no cuenta).
- Cuenta suspendida → `403 ACCOUNT_SUSPENDED` en cualquier ruta con token y en el login; la app cierra sesión.
- Token de una cuenta que ya no existe → `401 UNAUTHORIZED`.
- Solo las cuentas `ADMIN` entran en `/admin/...` (`403 NOT_ADMIN`). Nadie se hace administrador por la API (ver «Administración»).

~~~

- [ ] **Step 11: Verificar**

Run: `cd backend && npx vitest run test/account-status.test.ts test/database.test.ts test/auth.test.ts test/users.repository.test.ts`
Expected: PASS.
Run (raíz): `npm run typecheck` y `npm test`
Expected: todo en verde (los tests existentes no cambian de comportamiento; `registerUser` sigue devolviendo `User`).

- [ ] **Step 12: Commit**

```bash
git add backend/src/db/migrations.ts shared/index.d.ts backend/src/users/users.repository.ts backend/src/auth/require-auth.ts \
  backend/src/auth/auth.routes.ts backend/src/app.ts backend/test/helpers.ts backend/test/auth.test.ts \
  backend/test/users.repository.test.ts backend/test/database.test.ts backend/test/account-status.test.ts \
  mobile/src/context/__tests__/AuthContext.test.tsx docs/api.md
GIT_AUTHOR_NAME="Aless Bustamante" GIT_AUTHOR_EMAIL="fabrizio.bs9012@gmail.com" \
GIT_COMMITTER_NAME="Aless Bustamante" GIT_COMMITTER_EMAIL="fabrizio.bs9012@gmail.com" \
git commit -m "feat(backend): rol y estado de la cuenta leídos de la base en cada petición" -m "Co-Authored-By: <modelo que implementa> <noreply@anthropic.com>"
```

---

### Task 2: Backend — registro de cada llamada a la IA (`ai_calls`)

**Files:**
- Create: `backend/src/ai/ai-calls.repository.ts`, `backend/test/ai-calls.test.ts`
- Modify: `shared/index.d.ts`, `backend/src/ai/ai-client.ts`, `backend/src/ai/ask-ai.ts`
- Modify (reemplazo completo): `backend/src/ai/ai.routes.ts`
- Modify: `backend/test/ai-core.test.ts`, `backend/test/gemini-client.test.ts`, `docs/api.md`

**Interfaces:**
- Consumes: tabla `ai_calls` (Task 1); `ResolvedDeps` (`db`, `ai`, `aiLimiter`, `now`); `getUserId`; helpers `fakeAi`, `fakeAiJson`, `failingAi`, `makeTestApp`, `setupSeedGroup`, `createProposal`, `DEADLINE`, `NOW`.
- Produces:
  - shared: `AiTask = 'schedule-ocr' | 'proposal-draft' | 'plan-suggestions' | 'voting-summary'`.
  - `backend/src/ai/ai-client.ts`: `export type { AiTask }` (re-exportado desde shared) y `AI_TASKS` (tupla en ese orden).
  - `backend/src/ai/ask-ai.ts`: `type AiCallOutcome = { task: AiTask; ok: boolean; durationMs: number }`, `type AiCallRecorder = (outcome: AiCallOutcome) => void`, `askAi(ai, request, schema, record: AiCallRecorder)`.
  - `backend/src/ai/ai-calls.repository.ts`: `type NewAiCall`, `aiCallsRepository(db)` con `record(call: NewAiCall): void`, `type AiCallsRepository`, `aiCallRecorder(calls, userId, startedAt: Date): AiCallRecorder`.

- [ ] **Step 1: Escribir los tests que fallan** — `backend/test/ai-calls.test.ts`:

```ts
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import type { AiClient, AiRequest } from '../src/ai/ai-client';
import { askAi, type AiCallOutcome } from '../src/ai/ask-ai';
import type { Db } from '../src/db/database';
import { bearer, createProposal, DEADLINE, failingAi, fakeAi, fakeAiJson, makeTestApp, NOW, setupSeedGroup } from './helpers';

const REQUEST: AiRequest = { task: 'voting-summary', prompt: 'Resume la votación', schema: { type: 'object' } };
const schema = z.object({ answer: z.string() });

const recorder = () => {
  const outcomes: AiCallOutcome[] = [];
  return { outcomes, record: (outcome: AiCallOutcome) => void outcomes.push(outcome) };
};

describe('askAi anota cada llamada (D6)', () => {
  it('respuesta válida → una anotación ok con su tarea y una duración ≥ 0', async () => {
    const { outcomes, record } = recorder();
    await askAi(fakeAi('{"answer":"sí"}').client, REQUEST, schema, record);
    expect(outcomes).toEqual([{ task: 'voting-summary', ok: true, durationMs: expect.any(Number) }]);
    expect(outcomes[0].durationMs).toBeGreaterThanOrEqual(0);
  });

  it.each([
    ['el proveedor falla (503)', () => failingAi(), 503],
    ['no es JSON (502)', () => fakeAi('hola').client, 502],
    ['JSON fuera del esquema (502)', () => fakeAi('{"answer": 3}').client, 502],
  ])('%s → una anotación con ok false', async (_label, client, status) => {
    const { outcomes, record } = recorder();
    await expect(askAi(client(), REQUEST, schema, record)).rejects.toMatchObject({ status });
    expect(outcomes).toEqual([{ task: 'voting-summary', ok: false, durationMs: expect.any(Number) }]);
  });

  it('si anotar falla, la respuesta de la IA llega igual', async () => {
    const record = vi.fn(() => {
      throw new Error('disco lleno');
    });
    await expect(askAi(fakeAi('{"answer":"sí"}').client, REQUEST, schema, record)).resolves.toEqual({ answer: 'sí' });
    expect(record).toHaveBeenCalledTimes(1);
  });
});

type CallRow = { user_id: string | null; task: string; ok: number; duration_ms: number; created_at: string };
const aiCalls = (db: Db) =>
  (db.prepare('SELECT user_id, task, ok, duration_ms, created_at FROM ai_calls ORDER BY id').all() as CallRow[]).map((r) => ({ ...r }));

const SUMMARY = { summary: 'Votó 1 de 2 integrantes.', recommendation: 'CONFIRMAR', reason: 'Hay una franja clara.' };

async function groupWithPlan(ai?: AiClient) {
  const { app, db } = makeTestApp({ now: () => NOW, ai });
  const { yo, group } = await setupSeedGroup(app);
  const plan = await createProposal(app, yo.token, group.id, { votingDeadline: DEADLINE });
  return { app, db, yo, group, plan };
}

describe('las rutas de IA guardan quién, qué función, si salió bien, cuánto tardó y cuándo', () => {
  it('resumen correcto → una fila con ok 1, el usuario y la hora del reloj de la app', async () => {
    const { app, db, yo, plan } = await groupWithPlan(fakeAiJson(SUMMARY).client);
    expect((await request(app).post(`/api/proposals/${plan.id}/ai/summary`).set(bearer(yo.token))).status).toBe(200);
    expect(aiCalls(db)).toEqual([
      { user_id: yo.user.id, task: 'voting-summary', ok: 1, duration_ms: expect.any(Number), created_at: NOW.toISOString() },
    ]);
  });

  it('con la IA caída la ruta responde 503 y la fila queda con ok 0', async () => {
    const { app, db, yo, plan } = await groupWithPlan(failingAi());
    expect((await request(app).post(`/api/proposals/${plan.id}/ai/summary`).set(bearer(yo.token))).status).toBe(503);
    expect(aiCalls(db).map((r) => [r.task, r.ok])).toEqual([['voting-summary', 0]]);
  });

  it('lo que no llega a la IA no se registra (plan cancelado → 409)', async () => {
    const { app, db, yo, plan } = await groupWithPlan(fakeAiJson(SUMMARY).client);
    await request(app).post(`/api/proposals/${plan.id}/cancel`).set(bearer(yo.token)).expect(200);
    expect((await request(app).post(`/api/proposals/${plan.id}/ai/summary`).set(bearer(yo.token))).status).toBe(409);
    expect(aiCalls(db)).toEqual([]);
  });

  it('ideas y borrador también anotan su función (modo demostración)', async () => {
    const { app, db, yo, group } = await groupWithPlan();
    await request(app).post(`/api/groups/${group.id}/ai/suggestions`).set(bearer(yo.token)).expect(200);
    await request(app).post(`/api/groups/${group.id}/ai/proposal-draft`).set(bearer(yo.token)).send({ text: 'Estudiar el martes' }).expect(200);
    expect(aiCalls(db).map((r) => [r.task, r.ok, r.user_id])).toEqual([
      ['plan-suggestions', 1, yo.user.id],
      ['proposal-draft', 1, yo.user.id],
    ]);
  });
});
```

Ajustes de tests existentes (`askAi` recibe ahora el `record` obligatorio):
- `backend/test/ai-core.test.ts`: `import { askAi, stripFences } from '../src/ai/ask-ai';` → `import { askAi, stripFences, type AiCallRecorder } from '../src/ai/ask-ai';`; debajo de `const schema = …` añadir `const noRecord: AiCallRecorder = () => {};` y, en las 6 llamadas `askAi(<cliente>, REQUEST, schema)`, añadir `, noRecord` como cuarto argumento (líneas 41, 46, 55, 58, 71 y 79).
- `backend/test/gemini-client.test.ts`: en las 2 llamadas `askAi(createGeminiClient(OPTIONS), REQUEST, z.object({}))` (líneas 135 y 182) añadir `, () => {}` como cuarto argumento.

- [ ] **Step 2: Ejecutar y ver que fallan**

Run: `cd backend && npx vitest run test/ai-calls.test.ts`
Expected: FAIL — `outcomes` vacío y ninguna fila en `ai_calls`.

- [ ] **Step 3: Tipo compartido** — en `shared/index.d.ts`, debajo de `export type AiStatus = { provider: AiProvider };`, añadir:

```ts

// Función de la app que llamó a la IA (estadísticas de administración, `ai_calls`).
export type AiTask = 'schedule-ocr' | 'proposal-draft' | 'plan-suggestions' | 'voting-summary';
```

- [ ] **Step 4: `ai-client.ts`** — en `backend/src/ai/ai-client.ts`, sustituir:

```ts
import type { AiProvider } from '@hueckoapp/shared';

// Qué se le pide a la IA. El cliente de demostración responde según la tarea; Gemini solo lee el prompt.
export type AiTask = 'schedule-ocr' | 'proposal-draft' | 'plan-suggestions' | 'voting-summary';
```

por:

```ts
import type { AiProvider, AiTask } from '@hueckoapp/shared';

// Qué se le pide a la IA. El cliente de demostración responde según la tarea; Gemini solo lee el prompt.
export type { AiTask };

// Las mismas tareas en tiempo de ejecución, en el orden de las estadísticas. La tabla ai_calls tiene el mismo CHECK.
export const AI_TASKS = ['schedule-ocr', 'proposal-draft', 'plan-suggestions', 'voting-summary'] as const satisfies readonly AiTask[];
```

- [ ] **Step 5: `askAi` anota** — en `backend/src/ai/ask-ai.ts`:
  - Import: `import type { AiClient, AiRequest } from './ai-client';` → `import type { AiClient, AiRequest, AiTask } from './ai-client';`
  - Sustituir desde el comentario `/**` que precede a `askAi` hasta el final del archivo por:

```ts
// Resultado de una llamada, para ai_calls (D6): nunca lleva el prompt, la imagen ni la respuesta.
export type AiCallOutcome = { task: AiTask; ok: boolean; durationMs: number };
export type AiCallRecorder = (outcome: AiCallOutcome) => void;

/**
 * Llama a la IA y valida su respuesta con zod. Nunca devuelve datos sin validar ni inventados:
 * el proveedor falla → 503 AI_UNAVAILABLE; JSON ilegible o fuera del esquema → 502 AI_BAD_RESPONSE.
 * Cada llamada se anota una vez con `record` (ok solo si la respuesta es válida). Si anotar falla, queda en el
 * log y la respuesta sigue su curso: las estadísticas nunca rompen una función de la app.
 */
export async function askAi<S extends z.ZodType>(
  ai: AiClient,
  request: AiRequest,
  schema: S,
  record: AiCallRecorder,
): Promise<z.output<S>> {
  const startedAt = performance.now();
  const finish = (ok: boolean) => {
    try {
      record({ task: request.task, ok, durationMs: performance.now() - startedAt });
    } catch (error) {
      if (process.env.NODE_ENV !== 'test') console.error(`[ia] ${request.task}: no se pudo registrar la llamada`, error);
    }
  };
  let text: string;
  try {
    text = await ai.generateJson(request);
  } catch (error) {
    if (process.env.NODE_ENV !== 'test') console.error(`[ia] ${request.task}: el proveedor falló`, error);
    finish(false);
    throw aiUnavailable();
  }
  // Un 502 deja rastro para poder diagnosticarlo, pero solo la tarea y las rutas de los errores:
  // la respuesta puede llevar datos de usuarios y nunca se escribe en el log.
  const logInvalid = (...details: unknown[]) => {
    if (process.env.NODE_ENV !== 'test') console.warn(...details);
  };
  let json: unknown;
  try {
    json = JSON.parse(stripFences(text));
  } catch {
    logInvalid(`[ia] ${request.task}: la respuesta no es JSON`);
    finish(false);
    throw aiBadResponse();
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    logInvalid(
      `[ia] ${request.task}: respuesta no válida`,
      parsed.error.issues.map((issue) => issue.path.join('.')),
    );
    finish(false);
    throw aiBadResponse();
  }
  finish(true);
  return parsed.data;
}
```

- [ ] **Step 6: Repositorio** — `backend/src/ai/ai-calls.repository.ts`:

```ts
import type { AiTask } from '@hueckoapp/shared';

import type { Db } from '../db/database';
import type { AiCallRecorder } from './ask-ai';

export type NewAiCall = { userId: string | null; task: AiTask; ok: boolean; durationMs: number; createdAt: string };

// Registro de llamadas a la IA para las estadísticas de administración (D6). Nunca guarda el prompt ni la respuesta.
export function aiCallsRepository(db: Db) {
  const insert = db.prepare('INSERT INTO ai_calls (user_id, task, ok, duration_ms, created_at) VALUES (?, ?, ?, ?, ?)');
  return {
    record(call: NewAiCall): void {
      insert.run(call.userId, call.task, call.ok ? 1 : 0, Math.max(0, Math.round(call.durationMs)), call.createdAt);
    },
  };
}

export type AiCallsRepository = ReturnType<typeof aiCallsRepository>;

// El `record` que recibe askAi en una petición: quién la hizo y cuándo empezó (reloj de la app).
export function aiCallRecorder(calls: AiCallsRepository, userId: string, startedAt: Date): AiCallRecorder {
  const createdAt = startedAt.toISOString();
  return ({ task, ok, durationMs }) => calls.record({ userId, task, ok, durationMs, createdAt });
}
```

- [ ] **Step 7: Rutas** — reemplazar `backend/src/ai/ai.routes.ts` completo:

```ts
import type { AiStatus, PlanSuggestions, ProposalDraft, ScheduleOcrResult, VotingSummary } from '@hueckoapp/shared';
import { Router } from 'express';

import type { ResolvedDeps } from '../app';
import { getUserId } from '../auth/require-auth';
import { loadGroupForMember } from '../groups/group-access';
import { groupsRepository } from '../groups/groups.repository';
import { ApiError } from '../middleware/errors';
import { proposalsRepository } from '../proposals/proposals.repository';
import { timeBlocksRepository } from '../schedule/time-blocks.repository';
import { aiCallRecorder, aiCallsRepository } from './ai-calls.repository';
import { askAi } from './ask-ai';
import { commonWindows, pickWindow } from './plan-context';
import {
  DRAFT_JSON_SCHEMA, draftDeadline, draftPrompt, draftResponseSchema, proposalDraftInputSchema,
  SUGGESTIONS_JSON_SCHEMA, suggestionsPrompt, suggestionsResponseSchema,
} from './plan-ideas';
import { OCR_JSON_SCHEMA, OCR_PROMPT, ocrResponseSchema, toOcrBlocks } from './schedule-ocr';
import { uploadScheduleImage } from './upload';
import { SUMMARY_JSON_SCHEMA, summaryPrompt, summaryResponseSchema } from './voting-summary';

// Montado en /api/ai detrás de requireAuth.
export function aiRouter({ db, ai, aiLimiter, now }: ResolvedDeps) {
  const router = Router();
  const calls = aiCallsRepository(db);

  // No llama a la IA: no pasa por el limitador ni se anota.
  router.get('/status', (_req, res) => {
    const body: AiStatus = { provider: ai.provider };
    res.json(body);
  });

  // El limitador va antes que la subida: una petición limitada no llega a leer los 5 MB.
  router.post('/schedule-ocr', aiLimiter, uploadScheduleImage, async (req, res) => {
    const file = req.file;
    if (!file) throw new ApiError(400, 'IMAGE_REQUIRED', 'Adjunta la foto de tu horario en el campo «image».');
    const items = await askAi(
      ai,
      { task: 'schedule-ocr', prompt: OCR_PROMPT, schema: OCR_JSON_SCHEMA, image: { data: file.buffer, mimeType: file.mimetype } },
      ocrResponseSchema,
      aiCallRecorder(calls, getUserId(res), now()),
    );
    const body: ScheduleOcrResult = { blocks: toOcrBlocks(items) };
    res.json(body);
  });

  return router;
}

// Montado en /api/groups detrás de requireAuth, después de groupsRouter y groupProposalsRouter.
export function groupAiRouter({ db, ai, aiLimiter, now }: ResolvedDeps) {
  const router = Router();
  const groups = groupsRepository(db);
  const blocks = timeBlocksRepository(db);
  const proposals = proposalsRepository(db);
  const calls = aiCallsRepository(db);

  router.post('/:id/ai/proposal-draft', aiLimiter, async (req, res) => {
    const userId = getUserId(res);
    const { group } = loadGroupForMember(groups, String(req.params.id), userId);
    const { text } = proposalDraftInputSchema.parse(req.body);
    const windows = commonWindows(group, blocks);
    const at = now();
    const answer = await askAi(
      ai,
      { task: 'proposal-draft', prompt: draftPrompt({ text, group, windows, now: at }), schema: DRAFT_JSON_SCHEMA },
      draftResponseSchema,
      aiCallRecorder(calls, userId, at),
    );
    const window = pickWindow(windows, answer.windowIndex);
    const draft: ProposalDraft = {
      title: answer.title,
      category: answer.category,
      placeName: answer.placeName,
      window,
      votingDeadline: draftDeadline(at, answer.deadlineHours, window),
    };
    res.json(draft);
  });

  router.post('/:id/ai/suggestions', aiLimiter, async (req, res) => {
    const userId = getUserId(res);
    const { group } = loadGroupForMember(groups, String(req.params.id), userId);
    const windows = commonWindows(group, blocks);
    // Las 5 propuestas más recientes, para que la IA no repita planes.
    const recentTitles = proposals.listByGroup(group.id, userId).slice(0, 5).map((p) => p.title);
    const at = now();
    const ideas = await askAi(
      ai,
      { task: 'plan-suggestions', prompt: suggestionsPrompt({ group, windows, recentTitles, now: at }), schema: SUGGESTIONS_JSON_SCHEMA },
      suggestionsResponseSchema,
      aiCallRecorder(calls, userId, at),
    );
    const body: PlanSuggestions = {
      suggestions: ideas.map((idea) => ({
        title: idea.title,
        category: idea.category,
        placeIdea: idea.placeIdea,
        window: pickWindow(windows, idea.windowIndex),
        reason: idea.reason,
      })),
    };
    res.json(body);
  });

  return router;
}

// Montado en /api/proposals detrás de requireAuth, después de proposalsRouter.
export function proposalAiRouter({ db, ai, aiLimiter, now }: ResolvedDeps) {
  const router = Router();
  const groups = groupsRepository(db);
  const proposals = proposalsRepository(db);
  const calls = aiCallsRepository(db);

  // Solo lee: nunca confirma, cancela ni reprograma (lo decide quien organiza el plan, D9).
  router.post('/:id/ai/summary', aiLimiter, async (req, res) => {
    const userId = getUserId(res);
    const proposal = proposals.findById(String(req.params.id), userId);
    if (!proposal) throw new ApiError(404, 'PROPOSAL_NOT_FOUND', 'Propuesta no encontrada.');
    const { group } = loadGroupForMember(groups, proposal.groupId, userId);
    if (proposal.state === 'CANCELADO') {
      throw new ApiError(409, 'INVALID_STATE', 'Este plan está cancelado: no hay votación que resumir.');
    }
    const at = now();
    const body: VotingSummary = await askAi(
      ai,
      { task: 'voting-summary', prompt: summaryPrompt(proposal, group, at), schema: SUMMARY_JSON_SCHEMA },
      summaryResponseSchema,
      aiCallRecorder(calls, userId, at),
    );
    res.json(body);
  });

  return router;
}
```

- [ ] **Step 8: Contrato** — en `docs/api.md`, sección «Inteligencia artificial»:
  - Sustituir la viñeta `- La IA **solo sugiere**: ninguna de estas rutas guarda nada. El usuario revisa el resultado y lo confirma con los endpoints de siempre.` por:

~~~markdown
- La IA **solo sugiere**: ninguna de estas rutas guarda datos del usuario (solo la anotación de uso de la viñeta siguiente). El usuario revisa el resultado y lo confirma con los endpoints de siempre.
- **Registro de uso:** cada petición que llega al proveedor se anota en `ai_calls` con quién la hizo, la función (`AiTask`: `schedule-ocr`, `proposal-draft`, `plan-suggestions`, `voting-summary`), si salió bien (respuesta válida) o mal (`502`/`503`), cuánto tardó y cuándo. **Nunca** se guarda el prompt, la foto ni la respuesta. Lo que no llega a la IA (`429`, `400` de la subida, `403`, `404`, `409`) no se anota. Lo usan las estadísticas de «Administración».
~~~

  - Tabla de tipos: después de la fila de `AiStatus`, añadir `| `AiTask` | Función de la app que llamó a la IA (estadísticas) |`

- [ ] **Step 9: Verificar**

Run: `cd backend && npx vitest run test/ai-calls.test.ts test/ai-core.test.ts test/gemini-client.test.ts`
Expected: PASS.
Run (raíz): `npm run typecheck` y `npm test` → verde.

- [ ] **Step 10: Commit**

```bash
git add shared/index.d.ts backend/src/ai/ai-client.ts backend/src/ai/ask-ai.ts backend/src/ai/ai-calls.repository.ts \
  backend/src/ai/ai.routes.ts backend/test/ai-calls.test.ts backend/test/ai-core.test.ts backend/test/gemini-client.test.ts docs/api.md
GIT_AUTHOR_NAME="Aless Bustamante" GIT_AUTHOR_EMAIL="fabrizio.bs9012@gmail.com" \
GIT_COMMITTER_NAME="Aless Bustamante" GIT_COMMITTER_EMAIL="fabrizio.bs9012@gmail.com" \
git commit -m "feat(backend): registro de cada llamada a la IA sin prompt ni respuesta" -m "Co-Authored-By: <modelo que implementa> <noreply@anthropic.com>"
```

---

### Task 3: Backend — usuarios, registro de acciones y primer administrador por consola

**Files:**
- Create: `backend/src/admin/paging.ts`, `backend/src/admin/admin.schemas.ts`, `backend/src/admin/audit.repository.ts`, `backend/src/admin/admin-users.ts`, `backend/src/admin/make-admin-args.ts`, `backend/src/admin/make-admin.ts`, `backend/src/admin/admin.routes.ts`
- Create: `backend/test/admin-fixtures.ts`, `backend/test/admin-users.test.ts`, `backend/test/make-admin.test.ts`
- Modify: `backend/src/app.ts`, `backend/package.json`, `backend/src/db/demo-data.ts`, `backend/src/db/seed.ts`, `backend/test/seed.test.ts`
- Modify: `shared/index.d.ts`, `docs/api.md`, `README.md`

**Interfaces:**
- Consumes: `requireAuth`, `requireAdmin`, `getUserId` (Task 1); tablas `admin_audit_log`, `users.role/status` (Task 1); `withTransaction`; `MEMBER_ORDER` (`'ORDER BY m.joined_at, m.rowid'`, de `groups.repository.ts`); `ResolvedDeps`.
- Produces:
  - shared: `Page<T>`, `AdminUserSummary`, `AdminUserGroup`, `AdminUserActivity`, `AdminUserDetail`, `UserStatusInput`, `UserRoleInput`, `AuditAction`, `AuditTargetType`, `AuditDetails`, `AuditEntry`.
  - `paging.ts`: `ADMIN_PAGE_SIZE = 20`, `offsetOf(page)`, `likePattern(search)`, `toPage(items, page, total)`.
  - `admin.schemas.ts`: `listQuerySchema` (`{ search: string; page: number }`), `pageQuerySchema` (`{ page }`), `userStatusSchema`, `userRoleSchema`.
  - `audit.repository.ts`: `type NewAuditEntry`, `auditRepository(db)` con `record(entry)` y `list(page): Page<AuditEntry>`.
  - `admin-users.ts`: `type AdminActor = { adminId: string | null; now: Date }`, `userNotFound()`, `adminUsers(db)` con `list(search, page)`, `summary(id)`, `detail(id)`, `setStatus(actor, id, status): boolean`, `setRole(actor, id, role): boolean`; `setRoleByEmail(db, email, role, now): { user: AdminUserSummary; changed: boolean }`.
  - `make-admin-args.ts`: `MAKE_ADMIN_USAGE`, `type MakeAdminArgs`, `parseMakeAdminArgs(argv)`.
  - `admin.routes.ts`: `adminRouter(deps: ResolvedDeps): Router` — los Tasks 4 y 5 le añaden rutas.
  - `demo-data.ts`: `DEMO_ADMIN_EMAIL = 'admin@test.com'`.
  - `test/admin-fixtures.ts`: `registerAdmin(app, db, overrides?)`, `insertUser(db, over?)`.

- [ ] **Step 1: Fixtures de test** — `backend/test/admin-fixtures.ts`:

```ts
import { randomUUID } from 'node:crypto';

import type { User, UserRole, UserStatus } from '@hueckoapp/shared';
import type { Express } from 'express';

import type { Db } from '../src/db/database';
import { registerUser } from './helpers';

// Cuenta registrada por la API y promovida en la base, como haría `npm run make-admin`.
export async function registerAdmin(
  app: Express,
  db: Db,
  overrides: Partial<{ name: string; email: string }> = {},
): Promise<{ token: string; user: User }> {
  const session = await registerUser(app, { name: 'Admin', ...overrides });
  db.prepare("UPDATE users SET role = 'ADMIN' WHERE id = ?").run(session.user.id);
  return session;
}

// Cuenta creada directamente en la base (rápido, sin bcrypt ni sesión): listas largas y fechas concretas.
export function insertUser(
  db: Db,
  over: Partial<{ name: string; email: string; role: UserRole; status: UserStatus; createdAt: string }> = {},
): string {
  const id = randomUUID();
  db.prepare('INSERT INTO users (id, name, email, password_hash, role, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
    id,
    over.name ?? `Persona ${id.slice(0, 8)}`,
    over.email ?? `${id}@correo.com`,
    'hash-de-prueba',
    over.role ?? 'USER',
    over.status ?? 'ACTIVE',
    over.createdAt ?? new Date().toISOString(),
  );
  return id;
}
```

- [ ] **Step 2: Escribir los tests que fallan**

`backend/test/admin-users.test.ts`:

```ts
import type { Express } from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

import { adminUsers } from '../src/admin/admin-users';
import type { Db } from '../src/db/database';
import { insertUser, registerAdmin } from './admin-fixtures';
import { bearer, createGroup, makeTestApp, NOW, registerUser } from './helpers';

type AuditRow = { action: string; admin_id: string | null; target_id: string; details: string };
const auditRows = (db: Db) =>
  (db.prepare('SELECT action, admin_id, target_id, details FROM admin_audit_log ORDER BY rowid').all() as AuditRow[]).map((r) => ({ ...r }));

const patchStatus = (app: Express, token: string, id: string, status: string) =>
  request(app).patch(`/api/admin/users/${id}/status`).set(bearer(token)).send({ status });
const patchRole = (app: Express, token: string, id: string, role: string) =>
  request(app).patch(`/api/admin/users/${id}/role`).set(bearer(token)).send({ role });

async function setup() {
  const { app, db } = makeTestApp({ now: () => NOW });
  const admin = await registerAdmin(app, db, { name: 'Admin', email: 'admin@correo.com' });
  const ana = await registerUser(app, { name: 'Ana', email: 'ana@correo.com' });
  return { app, db, admin, ana };
}

describe('acceso a /api/admin', () => {
  it('sin token 401; USER 403 NOT_ADMIN; ADMIN 200', async () => {
    const { app, admin, ana } = await setup();
    expect((await request(app).get('/api/admin/users')).status).toBe(401);
    const denied = await request(app).get('/api/admin/users').set(bearer(ana.token));
    expect(denied.status).toBe(403);
    expect(denied.body.error.code).toBe('NOT_ADMIN');
    expect((await request(app).get('/api/admin/users').set(bearer(admin.token))).status).toBe(200);
  });
});

describe('GET /api/admin/users', () => {
  it('20 por página, las cuentas más nuevas primero, con el total', async () => {
    const { app, db, admin } = await setup();
    for (let i = 0; i < 25; i++) {
      insertUser(db, { name: `Persona ${String(i).padStart(2, '0')}`, createdAt: new Date(NOW.getTime() + (i + 1) * 60_000).toISOString() });
    }
    const first = await request(app).get('/api/admin/users').set(bearer(admin.token));
    expect(first.body).toMatchObject({ page: 1, pageSize: 20, total: 27 });
    expect(first.body.items).toHaveLength(20);
    expect(first.body.items[0]).toMatchObject({ name: 'Persona 24', role: 'USER', status: 'ACTIVE', groupCount: 0 });
    const second = await request(app).get('/api/admin/users').query({ page: 2 }).set(bearer(admin.token));
    // Admin y Ana se registraron a la vez (NOW): a igual fecha, la insertada después va primero.
    expect(second.body.items.map((u: { name: string }) => u.name)).toEqual([
      'Persona 04', 'Persona 03', 'Persona 02', 'Persona 01', 'Persona 00', 'Ana', 'Admin',
    ]);
  });

  it('busca en nombre y correo, sin distinguir mayúsculas y con % y _ literales', async () => {
    const { app, db, admin } = await setup();
    insertUser(db, { name: 'Carla 100%', email: 'carla@uni.edu' });
    insertUser(db, { name: 'Carlos', email: 'carlos_p@uni.edu' });
    const search = async (q: string) =>
      (await request(app).get('/api/admin/users').query({ search: q }).set(bearer(admin.token))).body.items.map((u: { name: string }) => u.name);
    expect(await search('ANA@correo')).toEqual(['Ana']);
    expect(await search('100%')).toEqual(['Carla 100%']);
    expect(await search('%')).toEqual(['Carla 100%']);
    expect(await search('s_p')).toEqual(['Carlos']);
    expect(await search('   ')).toHaveLength(4); // vacía tras el trim = todas
  });

  it.each([
    [{ page: 0 }, 'La página empieza en 1.'],
    [{ page: 'dos' }, 'La página debe ser un número.'],
    [{ search: 'x'.repeat(101) }, 'La búsqueda admite hasta 100 caracteres.'],
  ])('%j → 400 «%s»', async (query, message) => {
    const { app, admin } = await setup();
    const res = await request(app).get('/api/admin/users').query(query).set(bearer(admin.token));
    expect(res.status).toBe(400);
    expect(res.body.error.details).toContainEqual(expect.objectContaining({ message }));
  });
});

describe('GET /api/admin/users/:id', () => {
  it('detalle con sus grupos y su actividad', async () => {
    const { app, admin, ana } = await setup();
    const group = await createGroup(app, ana.token, { name: 'Estudio' });
    await request(app)
      .post('/api/me/time-blocks')
      .set(bearer(ana.token))
      .send({ label: 'Clase', type: 'CLASE', startTime: '08:00', endTime: '10:00', isRecurring: true, dayOfWeek: 1, date: null })
      .expect(201);
    const res = await request(app).get(`/api/admin/users/${ana.user.id}`).set(bearer(admin.token));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      id: ana.user.id, name: 'Ana', email: 'ana@correo.com', role: 'USER', status: 'ACTIVE', createdAt: NOW.toISOString(), groupCount: 1,
      groups: [{ id: group.id, name: 'Estudio', role: 'OWNER' }],
      activity: { proposalsCreated: 0, votes: 0, incidences: 0, timeBlocks: 1, aiCalls: 0 },
    });
  });

  it('404 USER_NOT_FOUND', async () => {
    const { app, admin } = await setup();
    const res = await request(app).get('/api/admin/users/no-existe').set(bearer(admin.token));
    expect(res.status).toBe(404);
    expect(res.body.error).toMatchObject({ code: 'USER_NOT_FOUND', message: 'Usuario no encontrado.' });
  });
});

describe('PATCH /api/admin/users/:id/status', () => {
  it('suspender corta la sesión de esa persona al instante y queda anotado; reactivar la devuelve', async () => {
    const { app, db, admin, ana } = await setup();
    const res = await patchStatus(app, admin.token, ana.user.id, 'SUSPENDED');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: ana.user.id, status: 'SUSPENDED', activity: expect.any(Object) });
    expect((await request(app).get('/api/groups').set(bearer(ana.token))).body.error.code).toBe('ACCOUNT_SUSPENDED');
    expect(auditRows(db)).toEqual([
      { action: 'USER_SUSPENDED', admin_id: admin.user.id, target_id: ana.user.id, details: JSON.stringify({ name: 'Ana', from: 'ACTIVE', to: 'SUSPENDED' }) },
    ]);
    expect((await patchStatus(app, admin.token, ana.user.id, 'ACTIVE')).body.status).toBe('ACTIVE');
    expect((await request(app).get('/api/groups').set(bearer(ana.token))).status).toBe(200);
    expect(auditRows(db).map((r) => r.action)).toEqual(['USER_SUSPENDED', 'USER_REACTIVATED']);
  });

  it('repetir el mismo estado responde 200 sin cambiar ni anotar nada', async () => {
    const { app, db, admin, ana } = await setup();
    const res = await patchStatus(app, admin.token, ana.user.id, 'ACTIVE');
    expect(res.status).toBe(200);
    expect(auditRows(db)).toEqual([]);
  });

  it('nadie puede suspenderse a sí mismo (409 CANNOT_CHANGE_SELF); a otra admin, sí', async () => {
    const { app, db, admin } = await setup();
    const self = await patchStatus(app, admin.token, admin.user.id, 'SUSPENDED');
    expect(self.status).toBe(409);
    expect(self.body.error).toMatchObject({
      code: 'CANNOT_CHANGE_SELF',
      message: 'No puedes suspender tu propia cuenta ni quitarte el rol de administrador.',
    });
    expect(auditRows(db)).toEqual([]);
    const other = await registerAdmin(app, db, { name: 'Otra admin' });
    expect((await patchStatus(app, admin.token, other.user.id, 'SUSPENDED')).status).toBe(200); // control positivo
  });

  it('400 con un estado desconocido y 404 si la cuenta no existe', async () => {
    const { app, admin, ana } = await setup();
    const bad = await patchStatus(app, admin.token, ana.user.id, 'BORRADA');
    expect(bad.status).toBe(400);
    expect(bad.body.error.details).toContainEqual(expect.objectContaining({ message: 'El estado debe ser ACTIVE o SUSPENDED.' }));
    expect((await patchStatus(app, admin.token, 'no-existe', 'SUSPENDED')).status).toBe(404);
  });

  it('la acción y su anotación van en la misma transacción: si no se puede anotar, no se suspende', async () => {
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {}); // el 500 se escribe en el log
    try {
      const { app, db, admin, ana } = await setup();
      db.exec('DROP TABLE admin_audit_log');
      expect((await patchStatus(app, admin.token, ana.user.id, 'SUSPENDED')).status).toBe(500);
      const row = db.prepare('SELECT status FROM users WHERE id = ?').get(ana.user.id) as { status: string };
      expect(row.status).toBe('ACTIVE');
    } finally {
      quiet.mockRestore();
    }
  });

  it('servicio: el último ADMIN activo no se puede suspender (409 LAST_ADMIN; defensa en profundidad)', () => {
    // Por la API no se alcanza (quien actúa ya es otro admin activo): se prueba el servicio con otra cuenta como actor.
    const { db } = makeTestApp();
    const actor = { adminId: insertUser(db), now: NOW };
    const only = insertUser(db, { role: 'ADMIN' });
    const users = adminUsers(db);
    expect(() => users.setStatus(actor, only, 'SUSPENDED')).toThrow('Tiene que quedar al menos un administrador activo.');
    insertUser(db, { role: 'ADMIN' });
    expect(users.setStatus(actor, only, 'SUSPENDED')).toBe(true); // control positivo
  });
});

describe('PATCH /api/admin/users/:id/role', () => {
  it('nombrar administrador surte efecto con el token que ya tenía; quitarlo, también', async () => {
    const { app, db, admin, ana } = await setup();
    expect((await request(app).get('/api/admin/users').set(bearer(ana.token))).status).toBe(403);
    const res = await patchRole(app, admin.token, ana.user.id, 'ADMIN');
    expect(res.status).toBe(200);
    expect(res.body.role).toBe('ADMIN');
    expect((await request(app).get('/api/admin/users').set(bearer(ana.token))).status).toBe(200);
    expect((await patchRole(app, admin.token, ana.user.id, 'USER')).status).toBe(200);
    expect((await request(app).get('/api/admin/users').set(bearer(ana.token))).status).toBe(403);
    expect(auditRows(db).map((r) => [r.action, r.details])).toEqual([
      ['USER_PROMOTED', JSON.stringify({ name: 'Ana', from: 'USER', to: 'ADMIN' })],
      ['USER_DEMOTED', JSON.stringify({ name: 'Ana', from: 'ADMIN', to: 'USER' })],
    ]);
  });

  it('nadie puede quitarse el rol a sí mismo: 409 CANNOT_CHANGE_SELF', async () => {
    const { app, admin } = await setup();
    const res = await patchRole(app, admin.token, admin.user.id, 'USER');
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CANNOT_CHANGE_SELF');
  });

  it('400 con un rol desconocido', async () => {
    const { app, admin, ana } = await setup();
    const res = await patchRole(app, admin.token, ana.user.id, 'ROOT');
    expect(res.status).toBe(400);
    expect(res.body.error.details).toContainEqual(expect.objectContaining({ message: 'El rol debe ser USER o ADMIN.' }));
  });
});

describe('GET /api/admin/audit', () => {
  it('lo más reciente primero, con quién lo hizo y sus detalles', async () => {
    const { app, admin, ana } = await setup();
    await patchStatus(app, admin.token, ana.user.id, 'SUSPENDED');
    await patchStatus(app, admin.token, ana.user.id, 'ACTIVE');
    const res = await request(app).get('/api/admin/audit').set(bearer(admin.token));
    expect(res.body).toMatchObject({ page: 1, pageSize: 20, total: 2 });
    expect(res.body.items[0]).toEqual({
      id: expect.any(String),
      action: 'USER_REACTIVATED',
      admin: { id: admin.user.id, name: 'Admin', email: 'admin@correo.com' },
      targetType: 'USER',
      targetId: ana.user.id,
      details: { name: 'Ana', from: 'SUSPENDED', to: 'ACTIVE' },
      createdAt: NOW.toISOString(),
    });
    expect(res.body.items[1].action).toBe('USER_SUSPENDED');
  });
});
```

`backend/test/make-admin.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { setRoleByEmail } from '../src/admin/admin-users';
import { MAKE_ADMIN_USAGE, parseMakeAdminArgs } from '../src/admin/make-admin-args';
import { openDatabase } from '../src/db/database';
import { insertUser } from './admin-fixtures';
import { NOW } from './helpers';

describe('parseMakeAdminArgs', () => {
  it.each([
    [['Ana@Test.com '], { email: 'ana@test.com', revoke: false }],
    [['ana@test.com', '--revoke'], { email: 'ana@test.com', revoke: true }],
    [['--revoke', 'ana@test.com'], { email: 'ana@test.com', revoke: true }],
  ])('%j → %j', (argv, expected) => {
    expect(parseMakeAdminArgs(argv)).toEqual(expected);
  });

  it.each([[[]], [['a@b.co', 'c@d.co']], [['a@b.co', '--force']]])('%j → error con el uso', (argv) => {
    expect(() => parseMakeAdminArgs(argv)).toThrow(MAKE_ADMIN_USAGE);
  });

  it('un texto que no es un correo', () => {
    expect(() => parseMakeAdminArgs(['ana'])).toThrow('«ana» no parece un correo.');
  });
});

describe('setRoleByEmail (consola)', () => {
  const auditRows = (db: ReturnType<typeof openDatabase>) =>
    (db.prepare('SELECT action, admin_id FROM admin_audit_log ORDER BY rowid').all() as { action: string; admin_id: string | null }[]).map((r) => ({ ...r }));

  it('nombra administrador, repetirlo no cambia nada y quitarlo funciona; queda anotado como consola', () => {
    const db = openDatabase(':memory:');
    insertUser(db, { email: 'primera@test.com', role: 'ADMIN' });
    const ana = insertUser(db, { name: 'Ana', email: 'ana@test.com' });
    expect(setRoleByEmail(db, 'ana@test.com', 'ADMIN', NOW)).toMatchObject({ changed: true, user: { id: ana, role: 'ADMIN' } });
    expect(setRoleByEmail(db, 'ana@test.com', 'ADMIN', NOW).changed).toBe(false);
    expect(setRoleByEmail(db, 'ana@test.com', 'USER', NOW)).toMatchObject({ changed: true, user: { role: 'USER' } });
    expect(auditRows(db)).toEqual([
      { action: 'USER_PROMOTED', admin_id: null },
      { action: 'USER_DEMOTED', admin_id: null },
    ]);
  });

  it('no deja la app sin administradores activos (409 LAST_ADMIN); con otro admin activo, sí', () => {
    const db = openDatabase(':memory:');
    insertUser(db, { email: 'unica@test.com', role: 'ADMIN' });
    expect(() => setRoleByEmail(db, 'unica@test.com', 'USER', NOW)).toThrow('Tiene que quedar al menos un administrador activo.');
    // Una admin suspendida no cuenta como activa.
    insertUser(db, { email: 'suspendida@test.com', role: 'ADMIN', status: 'SUSPENDED' });
    expect(() => setRoleByEmail(db, 'unica@test.com', 'USER', NOW)).toThrow('Tiene que quedar al menos un administrador activo.');
    insertUser(db, { email: 'otra@test.com', role: 'ADMIN' });
    expect(setRoleByEmail(db, 'unica@test.com', 'USER', NOW).changed).toBe(true); // control positivo
  });

  it('correo desconocido → error que lo nombra', () => {
    const db = openDatabase(':memory:');
    expect(() => setRoleByEmail(db, 'nadie@test.com', 'ADMIN', NOW)).toThrow('No hay ninguna cuenta con el correo «nadie@test.com».');
  });
});
```

En `backend/test/seed.test.ts`:
- `expect(seedDemoData(db, HASH, NOW)).toEqual({ users: 3, groups: 2, blocks: 5, proposals: 2 });` → `users: 4`.
- `expect(column(db, 'SELECT email AS v FROM users ORDER BY email')).toEqual(['ana@test.com', 'carlos@test.com', 'test@test.com']);` → `toEqual(['admin@test.com', 'ana@test.com', 'carlos@test.com', 'test@test.com']);`
- Dentro del `describe`, añadir:

```ts
  it('admin@test.com es ADMIN sin grupos, y la semilla lo deja ADMIN y ACTIVE aunque lo hayan cambiado', () => {
    const db = openDatabase(':memory:');
    seedDemoData(db, HASH, NOW);
    const admin = () => ({ ...(db.prepare("SELECT role, status FROM users WHERE email = 'admin@test.com'").get() as object) });
    expect(admin()).toEqual({ role: 'ADMIN', status: 'ACTIVE' });
    expect(column(db, "SELECT u.email AS v FROM users u JOIN group_members m ON m.user_id = u.id WHERE u.email = 'admin@test.com'")).toEqual([]);
    expect(column(db, "SELECT email AS v FROM users WHERE role = 'ADMIN'")).toEqual(['admin@test.com']);
    db.prepare("UPDATE users SET role = 'USER', status = 'SUSPENDED' WHERE email = 'admin@test.com'").run();
    seedDemoData(db, HASH, NOW);
    expect(admin()).toEqual({ role: 'ADMIN', status: 'ACTIVE' });
  });
```

- [ ] **Step 3: Ejecutar y ver que fallan**

Run: `cd backend && npx vitest run test/admin-users.test.ts test/make-admin.test.ts test/seed.test.ts`
Expected: FAIL — no existen `src/admin/*` y `/api/admin/users` responde 404 `NOT_FOUND`.

- [ ] **Step 4: Tipos compartidos** — al final de `shared/index.d.ts`, añadir:

```ts

// ---- Administración (docs/api.md, «Administración») ----

// Lista paginada: 20 por página, `page` desde 1.
export type Page<T> = { items: T[]; page: number; pageSize: number; total: number };

export type AdminUserSummary = User & { role: UserRole; status: UserStatus; createdAt: string; groupCount: number };

export type AdminUserGroup = { id: string; name: string; role: GroupMember['role'] };

export type AdminUserActivity = {
  proposalsCreated: number;
  votes: number;
  incidences: number;
  timeBlocks: number;
  aiCalls: number;
};

export type AdminUserDetail = AdminUserSummary & { groups: AdminUserGroup[]; activity: AdminUserActivity };

// Cuerpos de PATCH /admin/users/:id/status y /admin/users/:id/role.
export type UserStatusInput = { status: UserStatus };
export type UserRoleInput = { role: UserRole };

export type AuditAction =
  | 'USER_SUSPENDED'
  | 'USER_REACTIVATED'
  | 'USER_PROMOTED'
  | 'USER_DEMOTED'
  | 'GROUP_DELETED'
  | 'PROPOSAL_CANCELLED';

export type AuditTargetType = 'USER' | 'GROUP' | 'PROPOSAL';

// Lo justo para entender la acción aunque el objetivo ya no exista; nunca correos, contraseñas ni tokens.
export type AuditDetails = Record<string, string | number | boolean | null>;

export type AuditEntry = {
  id: string;
  action: AuditAction;
  admin: User | null;              // null = consola del servidor (npm run make-admin)
  targetType: AuditTargetType;
  targetId: string;
  details: AuditDetails;
  createdAt: string;
};
```

- [ ] **Step 5: Paginación y esquemas**

`backend/src/admin/paging.ts`:

```ts
import type { Page } from '@hueckoapp/shared';

// Listas de administración: 20 por página; la primera es la 1 (D10).
export const ADMIN_PAGE_SIZE = 20;

export const offsetOf = (page: number) => (page - 1) * ADMIN_PAGE_SIZE;

// Texto buscado → patrón para `LIKE ? ESCAPE '\'`: «100%» busca literalmente «100%», no «100 y lo que sea».
export const likePattern = (search: string) => `%${search.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

export const toPage = <T>(items: T[], page: number, total: number): Page<T> => ({ items, page, pageSize: ADMIN_PAGE_SIZE, total });
```

`backend/src/admin/admin.schemas.ts`:

```ts
import { z } from 'zod';

// ?search=&page= de las listas (D10). `search` vacío = sin filtro.
export const listQuerySchema = z.object({
  search: z
    .string({ error: 'La búsqueda debe ser un texto.' })
    .trim()
    .max(100, 'La búsqueda admite hasta 100 caracteres.')
    .default(''),
  page: z.coerce
    .number({ error: 'La página debe ser un número.' })
    .int('La página debe ser un número entero.')
    .min(1, 'La página empieza en 1.')
    .max(100_000, 'Página demasiado alta.')
    .default(1),
});

export const pageQuerySchema = listQuerySchema.pick({ page: true });

export const userStatusSchema = z.object({
  status: z.enum(['ACTIVE', 'SUSPENDED'], { error: 'El estado debe ser ACTIVE o SUSPENDED.' }),
});

export const userRoleSchema = z.object({
  role: z.enum(['USER', 'ADMIN'], { error: 'El rol debe ser USER o ADMIN.' }),
});
```

- [ ] **Step 6: Registro de acciones** — `backend/src/admin/audit.repository.ts`:

```ts
import { randomUUID } from 'node:crypto';

import type { AuditAction, AuditDetails, AuditEntry, AuditTargetType, Page } from '@hueckoapp/shared';

import type { Db } from '../db/database';
import { ADMIN_PAGE_SIZE, offsetOf, toPage } from './paging';

export type NewAuditEntry = {
  adminId: string | null; // null = consola del servidor
  action: AuditAction;
  targetType: AuditTargetType;
  targetId: string;
  details: AuditDetails;
  createdAt: string;
};

type AuditRow = {
  id: string;
  action: AuditAction;
  target_type: AuditTargetType;
  target_id: string;
  details: string;
  created_at: string;
  admin_id: string | null;
  admin_name: string | null;
  admin_email: string | null;
};

const toEntry = (r: AuditRow): AuditEntry => ({
  id: r.id,
  action: r.action,
  admin: r.admin_id === null ? null : { id: r.admin_id, name: r.admin_name ?? '', email: r.admin_email ?? '' },
  targetType: r.target_type,
  targetId: r.target_id,
  details: JSON.parse(r.details) as AuditDetails,
  createdAt: r.created_at,
});

export function auditRepository(db: Db) {
  return {
    // Se llama DENTRO de la transacción de la acción: si no se puede anotar, la acción se deshace (D5).
    record(entry: NewAuditEntry): void {
      db.prepare(
        'INSERT INTO admin_audit_log (id, admin_id, action, target_type, target_id, details, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      ).run(randomUUID(), entry.adminId, entry.action, entry.targetType, entry.targetId, JSON.stringify(entry.details), entry.createdAt);
    },

    // Lo más reciente primero; a igual fecha, lo anotado después.
    list(page: number): Page<AuditEntry> {
      const { total } = db.prepare('SELECT COUNT(*) AS total FROM admin_audit_log').get() as { total: number };
      const rows = db
        .prepare(
          `SELECT a.id, a.action, a.target_type, a.target_id, a.details, a.created_at,
                  u.id AS admin_id, u.name AS admin_name, u.email AS admin_email
           FROM admin_audit_log a LEFT JOIN users u ON u.id = a.admin_id
           ORDER BY a.created_at DESC, a.rowid DESC
           LIMIT ? OFFSET ?`,
        )
        .all(ADMIN_PAGE_SIZE, offsetOf(page)) as AuditRow[];
      return toPage(rows.map(toEntry), page, total);
    },
  };
}
```

- [ ] **Step 7: Servicio de usuarios** — `backend/src/admin/admin-users.ts`:

```ts
import type { AdminUserActivity, AdminUserDetail, AdminUserGroup, AdminUserSummary, Page, UserRole, UserStatus } from '@hueckoapp/shared';

import type { Db } from '../db/database';
import { withTransaction } from '../db/transaction';
import { MEMBER_ORDER } from '../groups/groups.repository';
import { ApiError } from '../middleware/errors';
import { auditRepository } from './audit.repository';
import { ADMIN_PAGE_SIZE, likePattern, offsetOf, toPage } from './paging';

// Quién hace el cambio: un admin (su id) o la consola del servidor (null), y con qué reloj (D3–D5).
export type AdminActor = { adminId: string | null; now: Date };

type SummaryRow = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  created_at: string;
  group_count: number;
};
type ActivityRow = { proposals_created: number; votes: number; incidences: number; time_blocks: number; ai_calls: number };

const SUMMARY_SELECT = `
  SELECT u.id, u.name, u.email, u.role, u.status, u.created_at,
         (SELECT COUNT(*) FROM group_members m WHERE m.user_id = u.id) AS group_count
  FROM users u`;

const toSummary = (r: SummaryRow): AdminUserSummary => ({
  id: r.id,
  name: r.name,
  email: r.email,
  role: r.role,
  status: r.status,
  createdAt: r.created_at,
  groupCount: r.group_count,
});

export const userNotFound = () => new ApiError(404, 'USER_NOT_FOUND', 'Usuario no encontrado.');

export function adminUsers(db: Db) {
  const audit = auditRepository(db);

  const load = (id: string): SummaryRow => {
    const row = db.prepare(`${SUMMARY_SELECT} WHERE u.id = ?`).get(id) as SummaryRow | undefined;
    if (!row) throw userNotFound();
    return row;
  };

  const activeAdmins = () =>
    (db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'ADMIN' AND status = 'ACTIVE'").get() as { n: number }).n;

  const assertNotSelf = (actor: AdminActor, targetId: string) => {
    if (actor.adminId === targetId) {
      throw new ApiError(409, 'CANNOT_CHANGE_SELF', 'No puedes suspender tu propia cuenta ni quitarte el rol de administrador.');
    }
  };

  // Quien deja de ser administrador activo (suspendido o sin rol) no puede ser el último (D4).
  const assertNotLastAdmin = (target: SummaryRow) => {
    if (target.role === 'ADMIN' && target.status === 'ACTIVE' && activeAdmins() <= 1) {
      throw new ApiError(409, 'LAST_ADMIN', 'Tiene que quedar al menos un administrador activo.');
    }
  };

  const summary = (id: string): AdminUserSummary => toSummary(load(id));

  return {
    list(search: string, page: number): Page<AdminUserSummary> {
      const where = search ? `WHERE u.name LIKE ? ESCAPE '\\' OR u.email LIKE ? ESCAPE '\\'` : '';
      const params = search ? [likePattern(search), likePattern(search)] : [];
      const { total } = db.prepare(`SELECT COUNT(*) AS total FROM users u ${where}`).get(...params) as { total: number };
      const rows = db
        .prepare(`${SUMMARY_SELECT} ${where} ORDER BY u.created_at DESC, u.rowid DESC LIMIT ? OFFSET ?`)
        .all(...params, ADMIN_PAGE_SIZE, offsetOf(page)) as SummaryRow[];
      return toPage(rows.map(toSummary), page, total);
    },

    summary,

    detail(id: string): AdminUserDetail {
      const base = summary(id);
      const groups = (
        db
          .prepare(`SELECT g.id, g.name, m.role FROM group_members m JOIN groups g ON g.id = m.group_id WHERE m.user_id = ? ${MEMBER_ORDER}`)
          .all(id) as AdminUserGroup[]
      ).map((g) => ({ id: g.id, name: g.name, role: g.role }));
      const a = db
        .prepare(
          `SELECT (SELECT COUNT(*) FROM proposals WHERE created_by = ?) AS proposals_created,
                  (SELECT COUNT(*) FROM votes WHERE user_id = ?) AS votes,
                  (SELECT COUNT(*) FROM incidences WHERE user_id = ?) AS incidences,
                  (SELECT COUNT(*) FROM time_blocks WHERE user_id = ?) AS time_blocks,
                  (SELECT COUNT(*) FROM ai_calls WHERE user_id = ?) AS ai_calls`,
        )
        .get(id, id, id, id, id) as ActivityRow;
      const activity: AdminUserActivity = {
        proposalsCreated: a.proposals_created,
        votes: a.votes,
        incidences: a.incidences,
        timeBlocks: a.time_blocks,
        aiCalls: a.ai_calls,
      };
      return { ...base, groups, activity };
    },

    /** Suspende o reactiva. `false` si ya estaba así (no se anota nada). */
    setStatus(actor: AdminActor, id: string, status: UserStatus): boolean {
      return withTransaction(db, () => {
        const target = load(id);
        if (target.status === status) return false;
        assertNotSelf(actor, id);
        if (status === 'SUSPENDED') assertNotLastAdmin(target);
        db.prepare('UPDATE users SET status = ? WHERE id = ?').run(status, id);
        audit.record({
          adminId: actor.adminId,
          action: status === 'SUSPENDED' ? 'USER_SUSPENDED' : 'USER_REACTIVATED',
          targetType: 'USER',
          targetId: id,
          details: { name: target.name, from: target.status, to: status },
          createdAt: actor.now.toISOString(),
        });
        return true;
      });
    },

    /** Da o quita el rol ADMIN. `false` si ya lo tenía así. */
    setRole(actor: AdminActor, id: string, role: UserRole): boolean {
      return withTransaction(db, () => {
        const target = load(id);
        if (target.role === role) return false;
        assertNotSelf(actor, id);
        if (role === 'USER') assertNotLastAdmin(target);
        db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, id);
        audit.record({
          adminId: actor.adminId,
          action: role === 'ADMIN' ? 'USER_PROMOTED' : 'USER_DEMOTED',
          targetType: 'USER',
          targetId: id,
          details: { name: target.name, from: target.role, to: role },
          createdAt: actor.now.toISOString(),
        });
        return true;
      });
    },
  };
}

/** Para la consola (npm run make-admin): da o quita el rol por correo, con las mismas guardas. */
export function setRoleByEmail(db: Db, email: string, role: UserRole, now: Date): { user: AdminUserSummary; changed: boolean } {
  const row = db.prepare('SELECT id FROM users WHERE email = ?').get(email) as { id: string } | undefined;
  if (!row) throw new ApiError(404, 'USER_NOT_FOUND', `No hay ninguna cuenta con el correo «${email}».`);
  const users = adminUsers(db);
  const changed = users.setRole({ adminId: null, now }, row.id, role);
  return { user: users.summary(row.id), changed };
}
```

- [ ] **Step 8: CLI**

`backend/src/admin/make-admin-args.ts`:

```ts
export const MAKE_ADMIN_USAGE = 'Uso: npm run make-admin -w backend -- <correo> [--revoke]';

export type MakeAdminArgs = { email: string; revoke: boolean };

// Un correo y, opcionalmente, --revoke (en cualquier orden). El correo se normaliza como en el registro.
export function parseMakeAdminArgs(argv: readonly string[]): MakeAdminArgs {
  const flags = argv.filter((a) => a.startsWith('--'));
  const rest = argv.filter((a) => !a.startsWith('--'));
  if (flags.some((f) => f !== '--revoke') || rest.length !== 1) throw new Error(MAKE_ADMIN_USAGE);
  const email = rest[0].trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error(`«${rest[0]}» no parece un correo. ${MAKE_ADMIN_USAGE}`);
  return { email, revoke: flags.includes('--revoke') };
}
```

`backend/src/admin/make-admin.ts`:

```ts
// Da o quita el rol de administrador de la app desde la consola del servidor (D3). La API no puede hacerlo:
// nadie se hace administrador al registrarse ni con una petición.
//   npm run make-admin -w backend -- ana@test.com
//   npm run make-admin -w backend -- ana@test.com --revoke
// Usa DATABASE_PATH de backend/.env (como la semilla). Queda en el registro de acciones como «Consola del servidor».
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

import { env } from '../config/env';
import { openDatabase } from '../db/database';
import { setRoleByEmail } from './admin-users';
import { parseMakeAdminArgs } from './make-admin-args';

function main() {
  const { email, revoke } = parseMakeAdminArgs(process.argv.slice(2));
  mkdirSync(dirname(env.DATABASE_PATH), { recursive: true });
  const db = openDatabase(env.DATABASE_PATH);
  try {
    const { user, changed } = setRoleByEmail(db, email, revoke ? 'USER' : 'ADMIN', new Date());
    const who = `${user.name} <${user.email}>`;
    if (!changed) console.log(`${who} ${revoke ? 'no era' : 'ya era'} administrador: no se cambió nada.`);
    else if (revoke) console.log(`${who} ya no es administrador.`);
    else console.log(`${who} ahora es administrador. Verá «Administración» al volver a abrir la app o iniciar sesión.`);
  } finally {
    db.close();
  }
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
```

En `backend/package.json`, en `scripts`, después de `"seed": "tsx src/db/seed.ts"` añadir `,` y `"make-admin": "tsx src/admin/make-admin.ts"`.

- [ ] **Step 9: Router y montaje** — `backend/src/admin/admin.routes.ts`:

```ts
import { Router, type Response } from 'express';

import type { ResolvedDeps } from '../app';
import { getUserId } from '../auth/require-auth';
import { adminUsers, type AdminActor } from './admin-users';
import { listQuerySchema, pageQuerySchema, userRoleSchema, userStatusSchema } from './admin.schemas';
import { auditRepository } from './audit.repository';

// Montado en /api/admin detrás de requireAuth y requireAdmin: todo lo de aquí es solo para ADMIN.
export function adminRouter({ db, now }: ResolvedDeps) {
  const router = Router();
  const users = adminUsers(db);
  const audit = auditRepository(db);
  const actor = (res: Response): AdminActor => ({ adminId: getUserId(res), now: now() });

  router.get('/users', (req, res) => {
    const { search, page } = listQuerySchema.parse(req.query);
    res.json(users.list(search, page));
  });

  router.get('/users/:id', (req, res) => {
    res.json(users.detail(req.params.id));
  });

  // Validación antes que existencia: un cuerpo inválido es 400 aunque la cuenta no exista.
  router.patch('/users/:id/status', (req, res) => {
    const { status } = userStatusSchema.parse(req.body);
    users.setStatus(actor(res), req.params.id, status);
    res.json(users.detail(req.params.id));
  });

  router.patch('/users/:id/role', (req, res) => {
    const { role } = userRoleSchema.parse(req.body);
    users.setRole(actor(res), req.params.id, role);
    res.json(users.detail(req.params.id));
  });

  router.get('/audit', (req, res) => {
    const { page } = pageQuerySchema.parse(req.query);
    res.json(audit.list(page));
  });

  return router;
}
```

En `backend/src/app.ts`:
- Imports: añadir `import { adminRouter } from './admin/admin.routes';` (primero, orden alfabético) y cambiar `import { requireAuth } from './auth/require-auth';` → `import { requireAdmin, requireAuth } from './auth/require-auth';`
- Después de `api.use('/ai', auth, aiRouter(deps));` añadir:

```ts
  // Administración de la app (Fase 4.5): además del token, rol ADMIN leído de la base (D2).
  api.use('/admin', auth, requireAdmin, adminRouter(deps));
```

- [ ] **Step 10: Semilla** — en `backend/src/db/demo-data.ts`:
  - Sustituir la constante `USERS` por:

```ts
export const DEMO_ADMIN_EMAIL = 'admin@test.com';

const USERS = [
  { key: 'test', name: 'Usuario de Prueba', email: 'test@test.com', role: 'USER' },
  { key: 'ana', name: 'Ana', email: 'ana@test.com', role: 'USER' },
  { key: 'carlos', name: 'Carlos', email: 'carlos@test.com', role: 'USER' },
  // Administración de la app (D3): no pertenece a ningún grupo.
  { key: 'admin', name: 'Administración HueckoApp', email: DEMO_ADMIN_EMAIL, role: 'ADMIN' },
] as const;
```

  - En `seedDemoData`, la inserción: `db.prepare('INSERT INTO users (id, name, email, password_hash) VALUES (?, ?, ?, ?)').run(ids[u.key], u.name, u.email, passwordHash);` → `db.prepare('INSERT INTO users (id, name, email, password_hash, role) VALUES (?, ?, ?, ?, ?)').run(ids[u.key], u.name, u.email, passwordHash, u.role);`
  - Justo después del `for (const u of USERS) { … }`, añadir:

```ts
    // La cuenta demo de administración sigue siéndolo aunque se haya cambiado desde la app o la consola.
    db.prepare("UPDATE users SET role = 'ADMIN', status = 'ACTIVE' WHERE email = ?").run(DEMO_ADMIN_EMAIL);
```

En `backend/src/db/seed.ts`: `console.log(\`Cuentas demo: test@test.com, ana@test.com y carlos@test.com — contraseña «${DEMO_PASSWORD}».\`);` → `console.log(\`Cuentas demo: test@test.com, ana@test.com, carlos@test.com y admin@test.com (administración) — contraseña «${DEMO_PASSWORD}».\`);`

- [ ] **Step 11: Contrato** — en `docs/api.md`:
  - Tabla de errores, fila 409: sustituir `plan sin franjas y sin huecos en común en el grupo (`NO_COMMON_WINDOWS`) |` por `plan sin franjas y sin huecos en común en el grupo (`NO_COMMON_WINDOWS`); en administración, cambiarse a uno mismo (`CANNOT_CHANGE_SELF`) o dejar la app sin administradores activos (`LAST_ADMIN`) |`
  - Tabla de tipos, al final: `| `Page<T>` | Lista paginada de administración (`items`, `page`, `pageSize`, `total`) |`, `| `AdminUserSummary` / `AdminUserDetail` | Cuenta vista por la administración (rol, estado, grupos, actividad) |`, `| `AuditEntry` | Una acción del registro de administración |`
  - Sustituir `---\n\n## Cambios respecto a la app Kotlin` por el bloque siguiente seguido de `---\n\n## Cambios respecto a la app Kotlin`:

~~~markdown
## Administración

Rutas para las cuentas con rol `ADMIN` (ver «Rol y estado de la cuenta»). Todas exigen token y rol: si no, `403 NOT_ADMIN`. Reglas comunes:
- **Primer administrador:** solo desde la consola del servidor: `npm run make-admin -w backend -- <correo>` (`--revoke` para quitarlo). No hay endpoint para hacerse administrador.
- **Listas paginadas:** `?page=` (desde 1; por defecto 1) y, donde se indica, `?search=` (≤ 100 caracteres; busca el texto tal cual, sin distinguir mayúsculas en letras sin tilde; `%` y `_` son literales). 20 por página. Responden `Page<T>`: `{ "items": [...], "page": 1, "pageSize": 20, "total": 57 }`. Parámetros inválidos → `400 VALIDATION_ERROR`.
- **Registro de acciones:** toda escritura de esta sección se anota en el registro (`GET /admin/audit`) en la misma transacción: si no se puede anotar, la acción no se hace.
- Fechas en ISO 8601 UTC.

### `GET /admin/users?search=&page=`
`200 Page<AdminUserSummary>`: `{ id, name, email, role, status, createdAt, groupCount }`, las cuentas más nuevas primero. `search` busca en nombre y correo.

### `GET /admin/users/:id`
`200 AdminUserDetail` = `AdminUserSummary` + `groups` (`{ id, name, role }` en el orden en que se unió) + `activity` (`{ proposalsCreated, votes, incidences, timeBlocks, aiCalls }`). `404 USER_NOT_FOUND`.

### `PATCH /admin/users/:id/status`
`{ "status": "SUSPENDED" }` o `{ "status": "ACTIVE" }` (`UserStatusInput`) → `200 AdminUserDetail`.
- Suspender surte efecto al instante: su login y sus peticiones con token responden `403 ACCOUNT_SUSPENDED`. Sus grupos, planes y votos no se tocan.
- Si ya tenía ese estado → `200` sin cambios ni anotación.
- `409 CANNOT_CHANGE_SELF` «No puedes suspender tu propia cuenta ni quitarte el rol de administrador.» · `409 LAST_ADMIN` «Tiene que quedar al menos un administrador activo.» · `404 USER_NOT_FOUND` · `400 VALIDATION_ERROR` (el cuerpo se valida antes de buscar la cuenta).

### `PATCH /admin/users/:id/role`
`{ "role": "ADMIN" }` o `{ "role": "USER" }` (`UserRoleInput`) → `200 AdminUserDetail`. Mismas reglas que el estado (`CANNOT_CHANGE_SELF`, `LAST_ADMIN`, sin cambios si ya lo tenía). Cuenta desde la siguiente petición de esa persona; la app muestra u oculta «Administración» al volver a abrirse.

### `GET /admin/audit?page=`
`200 Page<AuditEntry>`, lo más reciente primero:
```json
{ "id": "…", "action": "USER_SUSPENDED", "admin": { "id": "…", "name": "Admin", "email": "admin@test.com" },
  "targetType": "USER", "targetId": "…", "details": { "name": "Ana", "from": "ACTIVE", "to": "SUSPENDED" },
  "createdAt": "2026-09-29T15:00:00.000Z" }
```
- `action` ∈ `USER_SUSPENDED | USER_REACTIVATED | USER_PROMOTED | USER_DEMOTED | GROUP_DELETED | PROPOSAL_CANCELLED`; `targetType` ∈ `USER | GROUP | PROPOSAL`.
- `admin: null` = cambio hecho desde la consola (`npm run make-admin`).
- `details` guarda lo necesario para entender la acción aunque el objetivo ya no exista (nombre, título, estado anterior y nuevo, contadores, motivo); nunca correos, contraseñas ni tokens.

~~~

- [ ] **Step 12: README** — en `README.md`:
  - Tabla de cuentas demo (paso 2b), añadir la fila: `| `admin@test.com` | `password123` | Administración de la app (rol `ADMIN`): ve «Administración» en el menú. No pertenece a ningún grupo |`
  - Justo antes de `### Comandos útiles`, añadir:

~~~markdown
### Administración de la app
Una cuenta con rol `ADMIN` ve **«Administración»** en el menú lateral: estadísticas, informes (PDF y CSV), usuarios, grupos y el registro de acciones. Nadie se hace administrador al registrarse ni desde la API: el rol se da (o se quita) **desde la consola del servidor**:
```bash
npm run make-admin -w backend -- ana@test.com            # dar el rol
npm run make-admin -w backend -- ana@test.com --revoke   # quitarlo
```
Usa la base de `DATABASE_PATH` (`backend/.env`), no deja la app sin ningún administrador activo y queda en el registro de acciones como «Consola del servidor». La persona ve el menú al volver a abrir la app o iniciar sesión. Con la semilla (paso 2b) ya existe `admin@test.com`.

~~~

  - Tabla «Comandos útiles», añadir: `| raíz | `npm run make-admin -w backend -- <correo> [--revoke]` | Dar o quitar el rol de administrador |`

- [ ] **Step 13: Verificar**

Run: `cd backend && npx vitest run test/admin-users.test.ts test/make-admin.test.ts test/seed.test.ts`
Expected: PASS.
Run (raíz): `npm run typecheck` y `npm test` → verde.
Prueba manual rápida: `npm run seed -w backend` y `npm run make-admin -w backend -- ana@test.com` → «Ana <ana@test.com> ahora es administrador…»; repetirlo → «…ya era administrador: no se cambió nada.»; `npm run make-admin -w backend -- ana@test.com --revoke` → «…ya no es administrador.».

- [ ] **Step 14: Commit**

```bash
git add shared/index.d.ts backend/src/admin/paging.ts backend/src/admin/admin.schemas.ts backend/src/admin/audit.repository.ts \
  backend/src/admin/admin-users.ts backend/src/admin/make-admin-args.ts backend/src/admin/make-admin.ts backend/src/admin/admin.routes.ts \
  backend/src/app.ts backend/package.json backend/src/db/demo-data.ts backend/src/db/seed.ts \
  backend/test/admin-fixtures.ts backend/test/admin-users.test.ts backend/test/make-admin.test.ts backend/test/seed.test.ts \
  docs/api.md README.md
GIT_AUTHOR_NAME="Aless Bustamante" GIT_AUTHOR_EMAIL="fabrizio.bs9012@gmail.com" \
GIT_COMMITTER_NAME="Aless Bustamante" GIT_COMMITTER_EMAIL="fabrizio.bs9012@gmail.com" \
git commit -m "feat(backend): administración de usuarios, registro de acciones y make-admin por consola" -m "Co-Authored-By: <modelo que implementa> <noreply@anthropic.com>"
```

---

### Task 4: Backend — grupos (ver, borrar) y moderación de propuestas

**Files:**
- Create: `backend/src/admin/admin-groups.ts`, `backend/test/admin-groups.test.ts`
- Modify: `backend/src/admin/admin.routes.ts`, `backend/src/admin/admin.schemas.ts`, `backend/src/proposals/rules.ts`, `backend/src/proposals/proposals.routes.ts`, `backend/test/admin-fixtures.ts`
- Modify: `shared/index.d.ts`, `docs/api.md`

**Interfaces:**
- Consumes: `auditRepository`, `AdminActor`, `paging.ts` (Task 3); `groupsRepository(db).findById(id): Group | undefined`; `proposalsRepository(db).setState(id, state)`; `withTransaction`; helpers `setupSeedGroup`, `createProposal`, `createGroup`, `voteFor`, `DEADLINE`; `registerAdmin`, `insertUser` (Task 3).
- Produces:
  - shared: `AdminGroupSummary`, `AdminProposalSummary`, `AdminGroupDetail`, `AdminCancelProposalInput`.
  - `rules.ts`: `canCancel(state: ProposalState): boolean`.
  - `admin-groups.ts`: `adminGroups(db)` con `list(search, page): Page<AdminGroupSummary>`, `detail(id): AdminGroupDetail`, `remove(actor, id): void`, `cancelProposal(actor, id, reason: string | null): AdminProposalSummary`.
  - `admin.schemas.ts`: `cancelProposalSchema` (`{ reason?: string }`).
  - Rutas: `GET /admin/groups`, `GET /admin/groups/:id`, `DELETE /admin/groups/:id`, `POST /admin/proposals/:id/cancel`.
  - `test/admin-fixtures.ts`: `insertGroup(db, over?)`, `insertProposal(db, over)`.

- [ ] **Step 1: Fixtures** — al final de `backend/test/admin-fixtures.ts` añadir (y cambiar el import de tipos a `import type { ProposalState, User, UserRole, UserStatus } from '@hueckoapp/shared';`):

```ts
// Grupo creado en la base con fecha concreta; el OWNER y los miembros son opcionales.
export function insertGroup(
  db: Db,
  over: Partial<{ name: string; inviteCode: string; createdAt: string; ownerId: string; memberIds: string[] }> = {},
): string {
  const id = randomUUID();
  db.prepare("INSERT INTO groups (id, name, description, invite_code, availability_threshold, created_at) VALUES (?, ?, '', ?, 80, ?)").run(
    id,
    over.name ?? `Grupo ${id.slice(0, 8)}`,
    over.inviteCode ?? id.slice(0, 8).toUpperCase(),
    over.createdAt ?? new Date().toISOString(),
  );
  if (over.ownerId) db.prepare("INSERT INTO group_members (group_id, user_id, role) VALUES (?, ?, 'OWNER')").run(id, over.ownerId);
  for (const memberId of over.memberIds ?? []) {
    db.prepare("INSERT INTO group_members (group_id, user_id, role) VALUES (?, ?, 'MEMBER')").run(id, memberId);
  }
  return id;
}

// Propuesta sin franjas creada en la base (estadísticas y listas). `scheduledDate` se deriva a lo bruto del ISO:
// las estadísticas no lo usan.
export function insertProposal(
  db: Db,
  over: { groupId: string; createdBy: string } & Partial<{ title: string; state: ProposalState; createdAt: string; scheduledAt: string | null }>,
): string {
  const id = randomUUID();
  const scheduledAt = over.scheduledAt ?? null;
  db.prepare(
    `INSERT INTO proposals (id, group_id, title, created_by, voting_deadline, state, scheduled_at, scheduled_date, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id, over.groupId, over.title ?? 'Plan', over.createdBy, '2026-10-03T01:00:00.000Z', over.state ?? 'PROPUESTO',
    scheduledAt, scheduledAt ? scheduledAt.slice(0, 10) : null, over.createdAt ?? new Date().toISOString(),
  );
  return id;
}
```

- [ ] **Step 2: Escribir los tests que fallan** — `backend/test/admin-groups.test.ts`:

```ts
import request from 'supertest';
import { describe, expect, it } from 'vitest';

import type { Db } from '../src/db/database';
import { insertGroup, registerAdmin } from './admin-fixtures';
import { bearer, createGroup, createProposal, DEADLINE, makeTestApp, NOW, setupSeedGroup, voteFor } from './helpers';

async function setupGroups() {
  const { app, db } = makeTestApp({ now: () => NOW });
  const admin = await registerAdmin(app, db, { email: 'admin@correo.com' });
  const { yo, ana, group } = await setupSeedGroup(app); // «Proyecto Integrador»: yo es OWNER, Ana MEMBER
  return { app, db, admin, yo, ana, group };
}

const count = (db: Db, sql: string, ...params: string[]) => (db.prepare(sql).get(...params) as { n: number }).n;
const names = (body: { items: { name: string }[] }) => body.items.map((g) => g.name);

describe('GET /api/admin/groups', () => {
  it('cada grupo con miembros, propuestas y OWNER; busca por nombre o por código', async () => {
    const { app, db, admin, yo, group } = await setupGroups();
    await createProposal(app, yo.token, group.id, { votingDeadline: DEADLINE });
    const other = insertGroup(db, { name: 'Amigos de la Uni', inviteCode: 'HUECKO123' });
    const all = await request(app).get('/api/admin/groups').set(bearer(admin.token));
    expect(all.body).toMatchObject({ page: 1, pageSize: 20, total: 2 });
    const byId = new Map(all.body.items.map((g: { id: string }) => [g.id, g]));
    expect(byId.get(group.id)).toEqual({
      id: group.id, name: 'Proyecto Integrador', description: '', memberCount: 2, proposalCount: 1, owner: yo.user, createdAt: expect.any(String),
    });
    expect(byId.get(other)).toMatchObject({ memberCount: 0, proposalCount: 0, owner: null });
    const search = async (q: string) => names((await request(app).get('/api/admin/groups').query({ search: q }).set(bearer(admin.token))).body);
    expect(await search('huecko1')).toEqual(['Amigos de la Uni']);
    expect(await search('INTEGRADOR')).toEqual(['Proyecto Integrador']);
  });

  it('los más nuevos primero y 20 por página', async () => {
    const { app, db } = makeTestApp({ now: () => NOW });
    const admin = await registerAdmin(app, db);
    for (let i = 0; i < 21; i++) {
      insertGroup(db, { name: `Grupo ${String(i).padStart(2, '0')}`, createdAt: new Date(NOW.getTime() + i * 60_000).toISOString() });
    }
    const first = await request(app).get('/api/admin/groups').set(bearer(admin.token));
    expect(first.body.total).toBe(21);
    expect(first.body.items).toHaveLength(20);
    expect(first.body.items[0].name).toBe('Grupo 20');
    expect(names((await request(app).get('/api/admin/groups').query({ page: 2 }).set(bearer(admin.token))).body)).toEqual(['Grupo 00']);
  });
});

describe('GET /api/admin/groups/:id', () => {
  it('detalle con código, miembros y propuestas; los votos solo cuentan a quien sigue en el grupo', async () => {
    const { app, admin, yo, ana, group } = await setupGroups();
    const plan = await createProposal(app, yo.token, group.id, { title: 'Repaso', votingDeadline: DEADLINE });
    await voteFor(app, plan.id, plan.windows[0].id, ana.token).expect(200);
    const res = await request(app).get(`/api/admin/groups/${group.id}`).set(bearer(admin.token));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: group.id, name: 'Proyecto Integrador', inviteCode: group.inviteCode, availabilityThreshold: 80, memberCount: 2, proposalCount: 1, owner: yo.user,
    });
    expect(res.body.members.map((m: { name: string; role: string }) => [m.name, m.role])).toEqual([
      ['Usuario de Prueba', 'OWNER'],
      ['Ana', 'MEMBER'],
    ]);
    expect(res.body.proposals).toEqual([
      {
        id: plan.id, title: 'Repaso', state: 'PROPUESTO', createdBy: yo.user, createdAt: NOW.toISOString(), votingDeadline: DEADLINE,
        scheduledAt: null, scheduledDate: null, voteCount: 1, incidenceCount: 0,
      },
    ]);
    await request(app).delete(`/api/groups/${group.id}/members/me`).set(bearer(ana.token)).expect(204);
    const after = await request(app).get(`/api/admin/groups/${group.id}`).set(bearer(admin.token));
    expect(after.body.proposals[0].voteCount).toBe(0);
  });

  it('404 GROUP_NOT_FOUND', async () => {
    const { app, admin } = await setupGroups();
    const res = await request(app).get('/api/admin/groups/no-existe').set(bearer(admin.token));
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('GROUP_NOT_FOUND');
  });
});

describe('DELETE /api/admin/groups/:id', () => {
  it('borra el grupo con todo lo suyo, lo anota y no toca los demás grupos', async () => {
    const { app, db, admin, yo, ana, group } = await setupGroups();
    const plan = await createProposal(app, yo.token, group.id, { votingDeadline: DEADLINE });
    await voteFor(app, plan.id, plan.windows[0].id, ana.token).expect(200);
    const other = await createGroup(app, ana.token, { name: 'Otro' });
    expect((await request(app).delete(`/api/admin/groups/${group.id}`).set(bearer(admin.token))).status).toBe(204);
    expect(count(db, 'SELECT COUNT(*) AS n FROM group_members WHERE group_id = ?', group.id)).toBe(0);
    expect(count(db, 'SELECT COUNT(*) AS n FROM proposals WHERE group_id = ?', group.id)).toBe(0);
    expect(count(db, 'SELECT COUNT(*) AS n FROM proposal_windows WHERE proposal_id = ?', plan.id)).toBe(0);
    expect(count(db, 'SELECT COUNT(*) AS n FROM votes WHERE proposal_id = ?', plan.id)).toBe(0);
    expect((await request(app).get(`/api/groups/${group.id}`).set(bearer(yo.token))).status).toBe(404);
    expect((await request(app).get(`/api/groups/${other.id}`).set(bearer(ana.token))).status).toBe(200);
    const audit = await request(app).get('/api/admin/audit').set(bearer(admin.token));
    expect(audit.body.items[0]).toMatchObject({
      action: 'GROUP_DELETED', targetType: 'GROUP', targetId: group.id, details: { name: 'Proyecto Integrador', members: 2, proposals: 1 },
    });
  });

  it('solo ADMIN: el OWNER del grupo recibe 403 NOT_ADMIN y el grupo sigue', async () => {
    const { app, admin, yo, group } = await setupGroups();
    const denied = await request(app).delete(`/api/admin/groups/${group.id}`).set(bearer(yo.token));
    expect(denied.status).toBe(403);
    expect(denied.body.error.code).toBe('NOT_ADMIN');
    expect((await request(app).get(`/api/groups/${group.id}`).set(bearer(yo.token))).status).toBe(200);
    expect((await request(app).delete(`/api/admin/groups/${group.id}`).set(bearer(admin.token))).status).toBe(204); // control positivo
  });

  it('404 GROUP_NOT_FOUND si no existe', async () => {
    const { app, admin } = await setupGroups();
    expect((await request(app).delete('/api/admin/groups/no-existe').set(bearer(admin.token))).status).toBe(404);
  });
});

describe('POST /api/admin/proposals/:id/cancel (moderación, D7)', () => {
  it('un admin que no es miembro cancela el plan de otra persona; el grupo lo ve CANCELADO y queda anotado con el motivo', async () => {
    const { app, admin, yo, ana, group } = await setupGroups();
    const plan = await createProposal(app, yo.token, group.id, { title: 'Fiesta', votingDeadline: DEADLINE });
    const res = await request(app)
      .post(`/api/admin/proposals/${plan.id}/cancel`)
      .set(bearer(admin.token))
      .send({ reason: '  Contenido inapropiado  ' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: plan.id, title: 'Fiesta', state: 'CANCELADO' });
    expect((await request(app).get(`/api/proposals/${plan.id}`).set(bearer(ana.token))).body.state).toBe('CANCELADO');
    const audit = await request(app).get('/api/admin/audit').set(bearer(admin.token));
    expect(audit.body.items[0]).toMatchObject({
      action: 'PROPOSAL_CANCELLED',
      targetType: 'PROPOSAL',
      targetId: plan.id,
      details: { title: 'Fiesta', groupId: group.id, from: 'PROPUESTO', reason: 'Contenido inapropiado' },
    });
  });

  it('sin cuerpo también vale (motivo null); otra vez → 409 INVALID_STATE', async () => {
    const { app, admin, yo, group } = await setupGroups();
    const plan = await createProposal(app, yo.token, group.id, { votingDeadline: DEADLINE });
    expect((await request(app).post(`/api/admin/proposals/${plan.id}/cancel`).set(bearer(admin.token))).status).toBe(200);
    const again = await request(app).post(`/api/admin/proposals/${plan.id}/cancel`).set(bearer(admin.token));
    expect(again.status).toBe(409);
    expect(again.body.error).toMatchObject({ code: 'INVALID_STATE', message: 'La propuesta ya está cancelada.' });
    const audit = await request(app).get('/api/admin/audit').set(bearer(admin.token));
    expect(audit.body.total).toBe(1);
    expect(audit.body.items[0].details.reason).toBeNull();
  });

  it('quien organiza el plan no puede usar la ruta de moderación (403 NOT_ADMIN), pero su /cancel de siempre sigue igual', async () => {
    const { app, yo, group } = await setupGroups();
    const plan = await createProposal(app, yo.token, group.id, { votingDeadline: DEADLINE });
    const denied = await request(app).post(`/api/admin/proposals/${plan.id}/cancel`).set(bearer(yo.token));
    expect(denied.status).toBe(403);
    expect(denied.body.error.code).toBe('NOT_ADMIN');
    expect((await request(app).post(`/api/proposals/${plan.id}/cancel`).set(bearer(yo.token))).status).toBe(200); // control positivo
  });

  it('404 PROPOSAL_NOT_FOUND y 400 con un motivo de más de 200 caracteres', async () => {
    const { app, admin, yo, group } = await setupGroups();
    expect((await request(app).post('/api/admin/proposals/no-existe/cancel').set(bearer(admin.token))).status).toBe(404);
    const plan = await createProposal(app, yo.token, group.id, { votingDeadline: DEADLINE });
    const long = await request(app).post(`/api/admin/proposals/${plan.id}/cancel`).set(bearer(admin.token)).send({ reason: 'x'.repeat(201) });
    expect(long.status).toBe(400);
    expect(long.body.error.details).toContainEqual(expect.objectContaining({ message: 'El motivo admite hasta 200 caracteres.' }));
  });
});
```

- [ ] **Step 3: Ejecutar y ver que fallan**

Run: `cd backend && npx vitest run test/admin-groups.test.ts`
Expected: FAIL — `/api/admin/groups` y `/api/admin/proposals/:id/cancel` responden 404 `NOT_FOUND`.

- [ ] **Step 4: Tipos compartidos** — al final de `shared/index.d.ts`, añadir:

```ts

export type AdminGroupSummary = {
  id: string;
  name: string;
  description: string;
  memberCount: number;
  proposalCount: number;
  owner: User | null;              // OWNER actual; null si el grupo no tiene miembros
  createdAt: string;
};

export type AdminProposalSummary = {
  id: string;
  title: string;
  state: ProposalState;
  createdBy: User;
  createdAt: string;
  votingDeadline: string;
  scheduledAt: string | null;
  scheduledDate: string | null;
  voteCount: number;               // solo votos de quienes siguen en el grupo
  incidenceCount: number;
};

export type AdminGroupDetail = AdminGroupSummary & {
  inviteCode: string;
  availabilityThreshold: number;
  members: GroupMember[];
  proposals: AdminProposalSummary[]; // las más recientes primero
};

// Cuerpo (opcional) de POST /admin/proposals/:id/cancel.
export type AdminCancelProposalInput = { reason?: string };
```

- [ ] **Step 5: Regla compartida de cancelar** — en `backend/src/proposals/rules.ts`:
  - Import: `import type { Criticality, IncidenceType, MatchWindow, Proposal, TimeWindow } from '@hueckoapp/shared';` → `import type { Criticality, IncidenceType, MatchWindow, Proposal, ProposalState, TimeWindow } from '@hueckoapp/shared';`
  - Al final del archivo:

```ts

// Cancelar vale desde cualquier estado salvo CANCELADO. La usan quien gestiona el plan y la moderación (D7).
export const canCancel = (state: ProposalState) => state !== 'CANCELADO';
```

  En `backend/src/proposals/proposals.routes.ts`:
  - `import { bestWindows, criticalityFor, isVotingOpen, pickWinner, scheduleFor } from './rules';` → `import { bestWindows, canCancel, criticalityFor, isVotingOpen, pickWinner, scheduleFor } from './rules';`
  - En `/:id/cancel`: `if (proposal.state === 'CANCELADO') throw invalidState();` → `if (!canCancel(proposal.state)) throw invalidState();`

- [ ] **Step 6: Servicio de grupos** — `backend/src/admin/admin-groups.ts`:

```ts
import type { AdminGroupDetail, AdminGroupSummary, AdminProposalSummary, Page, ProposalState } from '@hueckoapp/shared';

import type { Db } from '../db/database';
import { withTransaction } from '../db/transaction';
import { groupsRepository } from '../groups/groups.repository';
import { ApiError } from '../middleware/errors';
import { proposalsRepository } from '../proposals/proposals.repository';
import { canCancel } from '../proposals/rules';
import type { AdminActor } from './admin-users';
import { auditRepository } from './audit.repository';
import { ADMIN_PAGE_SIZE, likePattern, offsetOf, toPage } from './paging';

type GroupRow = {
  id: string;
  name: string;
  description: string;
  created_at: string;
  member_count: number;
  proposal_count: number;
  owner_id: string | null;
  owner_name: string | null;
  owner_email: string | null;
};

type ProposalRow = {
  id: string;
  group_id: string;
  title: string;
  state: ProposalState;
  created_at: string;
  voting_deadline: string;
  scheduled_at: string | null;
  scheduled_date: string | null;
  creator_id: string;
  creator_name: string;
  creator_email: string;
  vote_count: number;
  incidence_count: number;
};

// El OWNER actual (si por datos rotos hubiera dos, el que llegó antes).
const GROUP_SELECT = `
  SELECT g.id, g.name, g.description, g.created_at,
         (SELECT COUNT(*) FROM group_members m WHERE m.group_id = g.id) AS member_count,
         (SELECT COUNT(*) FROM proposals p WHERE p.group_id = g.id) AS proposal_count,
         o.id AS owner_id, o.name AS owner_name, o.email AS owner_email
  FROM groups g
  LEFT JOIN users o ON o.id = (
    SELECT m.user_id FROM group_members m WHERE m.group_id = g.id AND m.role = 'OWNER' ORDER BY m.joined_at, m.rowid LIMIT 1
  )`;

// voteCount solo cuenta a quienes siguen en el grupo, igual que GET /proposals/:id.
const PROPOSAL_SELECT = `
  SELECT p.id, p.group_id, p.title, p.state, p.created_at, p.voting_deadline, p.scheduled_at, p.scheduled_date,
         u.id AS creator_id, u.name AS creator_name, u.email AS creator_email,
         (SELECT COUNT(*) FROM votes v JOIN group_members m ON m.group_id = p.group_id AND m.user_id = v.user_id
          WHERE v.proposal_id = p.id) AS vote_count,
         (SELECT COUNT(*) FROM incidences i WHERE i.proposal_id = p.id) AS incidence_count
  FROM proposals p JOIN users u ON u.id = p.created_by`;

const toGroup = (r: GroupRow): AdminGroupSummary => ({
  id: r.id,
  name: r.name,
  description: r.description,
  memberCount: r.member_count,
  proposalCount: r.proposal_count,
  owner: r.owner_id === null ? null : { id: r.owner_id, name: r.owner_name ?? '', email: r.owner_email ?? '' },
  createdAt: r.created_at,
});

const toProposal = (r: ProposalRow): AdminProposalSummary => ({
  id: r.id,
  title: r.title,
  state: r.state,
  createdBy: { id: r.creator_id, name: r.creator_name, email: r.creator_email },
  createdAt: r.created_at,
  votingDeadline: r.voting_deadline,
  scheduledAt: r.scheduled_at,
  scheduledDate: r.scheduled_date,
  voteCount: r.vote_count,
  incidenceCount: r.incidence_count,
});

const groupNotFound = () => new ApiError(404, 'GROUP_NOT_FOUND', 'Grupo no encontrado.');
const proposalNotFound = () => new ApiError(404, 'PROPOSAL_NOT_FOUND', 'Propuesta no encontrada.');

export function adminGroups(db: Db) {
  const audit = auditRepository(db);
  const groups = groupsRepository(db);
  const proposals = proposalsRepository(db);

  const loadGroup = (id: string): GroupRow => {
    const row = db.prepare(`${GROUP_SELECT} WHERE g.id = ?`).get(id) as GroupRow | undefined;
    if (!row) throw groupNotFound();
    return row;
  };
  const findProposal = (id: string) => db.prepare(`${PROPOSAL_SELECT} WHERE p.id = ?`).get(id) as ProposalRow | undefined;

  return {
    list(search: string, page: number): Page<AdminGroupSummary> {
      const where = search ? `WHERE g.name LIKE ? ESCAPE '\\' OR g.invite_code LIKE ? ESCAPE '\\'` : '';
      const params = search ? [likePattern(search), likePattern(search)] : [];
      const { total } = db.prepare(`SELECT COUNT(*) AS total FROM groups g ${where}`).get(...params) as { total: number };
      const rows = db
        .prepare(`${GROUP_SELECT} ${where} ORDER BY g.created_at DESC, g.rowid DESC LIMIT ? OFFSET ?`)
        .all(...params, ADMIN_PAGE_SIZE, offsetOf(page)) as GroupRow[];
      return toPage(rows.map(toGroup), page, total);
    },

    detail(id: string): AdminGroupDetail {
      const row = loadGroup(id);
      const group = groups.findById(id);
      if (!group) throw groupNotFound();
      const rows = db.prepare(`${PROPOSAL_SELECT} WHERE p.group_id = ? ORDER BY p.created_at DESC, p.rowid DESC`).all(id) as ProposalRow[];
      return {
        ...toGroup(row),
        inviteCode: group.inviteCode,
        availabilityThreshold: group.availabilityThreshold,
        members: group.members,
        proposals: rows.map(toProposal),
      };
    },

    // Borra el grupo con todo lo suyo: miembros, propuestas, franjas, votos e incidencias caen por ON DELETE CASCADE.
    remove(actor: AdminActor, id: string): void {
      withTransaction(db, () => {
        const row = loadGroup(id);
        db.prepare('DELETE FROM groups WHERE id = ?').run(id);
        audit.record({
          adminId: actor.adminId,
          action: 'GROUP_DELETED',
          targetType: 'GROUP',
          targetId: id,
          details: { name: row.name, members: row.member_count, proposals: row.proposal_count },
          createdAt: actor.now.toISOString(),
        });
      });
    },

    // Moderación (D7): cualquier propuesta que no esté cancelada, sea de quien sea y sin ser miembro.
    cancelProposal(actor: AdminActor, id: string, reason: string | null): AdminProposalSummary {
      return withTransaction(db, () => {
        const row = findProposal(id);
        if (!row) throw proposalNotFound();
        if (!canCancel(row.state)) throw new ApiError(409, 'INVALID_STATE', 'La propuesta ya está cancelada.');
        proposals.setState(id, 'CANCELADO');
        audit.record({
          adminId: actor.adminId,
          action: 'PROPOSAL_CANCELLED',
          targetType: 'PROPOSAL',
          targetId: id,
          details: { title: row.title, groupId: row.group_id, from: row.state, reason },
          createdAt: actor.now.toISOString(),
        });
        return toProposal(findProposal(id)!);
      });
    },
  };
}
```

- [ ] **Step 7: Esquema y rutas**

Al final de `backend/src/admin/admin.schemas.ts`:

```ts

// POST /admin/proposals/:id/cancel: motivo OBLIGATORIO (3-200 caracteres tras el trim, A5); queda en el registro de acciones.
// (Borrador original: el código implementado usa .min(3) y no es .optional(); ver admin.schemas.ts.)
export const cancelProposalSchema = z.object({
  reason: z.string({ error: 'El motivo debe ser un texto.' }).trim().max(200, 'El motivo admite hasta 200 caracteres.').optional(),
});
```

En `backend/src/admin/admin.routes.ts`:
- Imports: añadir `import { adminGroups } from './admin-groups';` y cambiar el import de esquemas a `import { cancelProposalSchema, listQuerySchema, pageQuerySchema, userRoleSchema, userStatusSchema } from './admin.schemas';`
- Debajo de `const audit = auditRepository(db);` añadir `const groups = adminGroups(db);`
- Antes de `router.get('/audit', …)` añadir:

```ts
  router.get('/groups', (req, res) => {
    const { search, page } = listQuerySchema.parse(req.query);
    res.json(groups.list(search, page));
  });

  router.get('/groups/:id', (req, res) => {
    res.json(groups.detail(req.params.id));
  });

  router.delete('/groups/:id', (req, res) => {
    groups.remove(actor(res), req.params.id);
    res.status(204).end();
  });

  // Moderación: cancelar la propuesta de cualquier grupo (D7). Sin cuerpo o con { reason }.
  router.post('/proposals/:id/cancel', (req, res) => {
    const { reason } = cancelProposalSchema.parse(req.body ?? {});
    res.json(groups.cancelProposal(actor(res), req.params.id, reason || null));
  });
```

- [ ] **Step 8: Contrato** — en `docs/api.md`:
  - Tabla de tipos, al final: `| `AdminGroupSummary` / `AdminGroupDetail` / `AdminProposalSummary` | Grupo y propuestas vistos por la administración |`
  - En «Administración», justo antes de `### `GET /admin/audit?page=``, añadir:

~~~markdown
### `GET /admin/groups?search=&page=`
`200 Page<AdminGroupSummary>`: `{ id, name, description, memberCount, proposalCount, owner, createdAt }`, los más nuevos primero. `owner` es el `OWNER` actual (`User`) o `null` si no quedan miembros. `search` busca en el nombre y el código de invitación.

### `GET /admin/groups/:id`
`200 AdminGroupDetail` = `AdminGroupSummary` + `inviteCode`, `availabilityThreshold`, `members` (`GroupMember[]`, en orden de llegada) y `proposals` (`AdminProposalSummary[]`, las más recientes primero: `{ id, title, state, createdBy, createdAt, votingDeadline, scheduledAt, scheduledDate, voteCount, incidenceCount }`; `voteCount` solo cuenta a quienes siguen en el grupo). La administración lo ve **sin ser miembro**. `404 GROUP_NOT_FOUND`.

### `DELETE /admin/groups/:id`
Borra el grupo con sus miembros, propuestas, franjas, votos e incidencias. `204` · `404 GROUP_NOT_FOUND`. Se anota como `GROUP_DELETED` con `{ name, members, proposals }`.

### `POST /admin/proposals/:id/cancel`
Moderación: cancela una propuesta de **cualquier** grupo, sin ser miembro ni quien la organiza. Cuerpo opcional `AdminCancelProposalInput`: `{ "reason": "Contenido inapropiado" }` (≤ 200 caracteres tras `trim`; se guarda en el registro). Misma regla de estado que `POST /proposals/:id/cancel` (desde cualquier estado salvo `CANCELADO`). `200 AdminProposalSummary` · `409 INVALID_STATE` «La propuesta ya está cancelada.» · `404 PROPOSAL_NOT_FOUND` · `400 VALIDATION_ERROR`. Se anota como `PROPOSAL_CANCELLED` con `{ title, groupId, from, reason }`. Quien organiza el plan sigue usando `POST /proposals/:id/cancel`; esta ruta es solo para `ADMIN`.

~~~

- [ ] **Step 9: Verificar**

Run: `cd backend && npx vitest run test/admin-groups.test.ts test/proposals-lifecycle.test.ts test/proposals.test.ts`
Expected: PASS.
Run (raíz): `npm run typecheck` y `npm test` → verde.

- [ ] **Step 10: Commit**

```bash
git add shared/index.d.ts backend/src/admin/admin-groups.ts backend/src/admin/admin.routes.ts backend/src/admin/admin.schemas.ts \
  backend/src/proposals/rules.ts backend/src/proposals/proposals.routes.ts backend/test/admin-fixtures.ts backend/test/admin-groups.test.ts docs/api.md
GIT_AUTHOR_NAME="Aless Bustamante" GIT_AUTHOR_EMAIL="fabrizio.bs9012@gmail.com" \
GIT_COMMITTER_NAME="Aless Bustamante" GIT_COMMITTER_EMAIL="fabrizio.bs9012@gmail.com" \
git commit -m "feat(backend): administración de grupos y moderación de propuestas" -m "Co-Authored-By: <modelo que implementa> <noreply@anthropic.com>"
```

---

### Task 5: Backend — estadísticas e informes (zona horaria del servidor)

**Files:**
- Create: `backend/src/admin/stats.ts`, `backend/test/admin-stats.test.ts`
- Modify: `backend/src/admin/admin.schemas.ts`, `backend/src/admin/admin.routes.ts`, `backend/test/admin-fixtures.ts`
- Modify: `shared/index.d.ts`, `docs/api.md`

**Interfaces:**
- Consumes: `AI_TASKS`, `AiTask` (Task 2); tablas y índices (Task 1); `adminRouter` (Tasks 3–4); fixtures `registerAdmin`, `insertUser`, `insertGroup`, `insertProposal`.
- Produces:
  - shared: `ProposalCounts`, `AiTaskStats`, `AiUsage`, `AdminStats`, `StatsBucket`, `TimeseriesPoint`, `Timeseries`, `HourCount`, `PopularHours`, `ReportPeriod`, `ReportSummary`, `TopGroup`, `AdminReport`.
  - `stats.ts`: `type DateRange = { from: Date; to: Date }`, `DAY_MS`, `MAX_RANGE_DAYS = 366`, `DAILY_REPORT_MAX_DAYS = 31`, `localDateKey(d)`, `bucketStart(d, bucket)`, `bucketKeys(range, bucket)`, `timeseries(db, range, bucket)`, `popularHours(db, range | null)`, `aiUsage(db, range | null)`, `adminStats(db)`, `adminReport(db, range, now)`.
  - `admin.schemas.ts`: `rangeQuerySchema` (→ `DateRange`), `timeseriesQuerySchema` (→ `{ range, bucket }`), `optionalRangeQuerySchema` (→ `DateRange | null`).
  - Rutas: `GET /admin/stats`, `GET /admin/stats/timeseries`, `GET /admin/stats/popular-hours`, `GET /admin/reports`.
  - `test/admin-fixtures.ts`: `insertAiCall(db, over?)`.

- [ ] **Step 1: Fixture** — al final de `backend/test/admin-fixtures.ts` añadir (y los imports `import type { AiTask, ProposalState, User, UserRole, UserStatus } from '@hueckoapp/shared';` y `import { NOW, registerUser } from './helpers';`):

```ts
// Llamada a la IA anotada a mano (por defecto: voting-summary correcta de 1 s en NOW).
export function insertAiCall(
  db: Db,
  over: Partial<{ userId: string | null; task: AiTask; ok: boolean; durationMs: number; createdAt: string }> = {},
): void {
  db.prepare('INSERT INTO ai_calls (user_id, task, ok, duration_ms, created_at) VALUES (?, ?, ?, ?, ?)').run(
    over.userId ?? null,
    over.task ?? 'voting-summary',
    over.ok === false ? 0 : 1,
    over.durationMs ?? 1000,
    over.createdAt ?? NOW.toISOString(),
  );
}
```

- [ ] **Step 2: Escribir los tests que fallan** — `backend/test/admin-stats.test.ts`:

```ts
import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { aiUsage, bucketKeys, bucketStart, localDateKey, popularHours, timeseries } from '../src/admin/stats';
import { openDatabase } from '../src/db/database';
import { insertAiCall, insertGroup, insertProposal, insertUser, registerAdmin } from './admin-fixtures';
import { bearer, makeTestApp, NOW, registerUser } from './helpers';

// Estos tests suponen TZ=America/Lima (UTC−5 todo el año); vitest.config.mts la fija para todo `npm test`.
const lima = (y: number, m: number, d: number, h = 0) => new Date(y, m - 1, d, h);
const empty = { groupsCreated: 0, proposalsCreated: 0, aiCalls: 0 };

describe('precondición', () => {
  it('los tests corren con TZ=America/Lima', () => {
    expect(new Date('2026-09-29T03:00:00.000Z').getHours()).toBe(22);
  });
});

describe('tramos en la zona del servidor (D8)', () => {
  it('bucketStart: el día a las 00:00 y la semana desde el lunes', () => {
    const lateSunday = lima(2026, 10, 4, 23); // domingo 4/10, 23:00
    expect(localDateKey(bucketStart(lateSunday, 'day'))).toBe('2026-10-04');
    expect(localDateKey(bucketStart(lateSunday, 'week'))).toBe('2026-09-28');
    expect(localDateKey(bucketStart(lima(2026, 9, 28), 'week'))).toBe('2026-09-28');
  });

  it('bucketKeys incluye los tramos vacíos y el primero puede empezar antes de from', () => {
    expect(bucketKeys({ from: lima(2026, 9, 30), to: lima(2026, 10, 13) }, 'week')).toEqual(['2026-09-28', '2026-10-05', '2026-10-12']);
    expect(bucketKeys({ from: lima(2026, 9, 29), to: lima(2026, 10, 1) }, 'day')).toEqual(['2026-09-29', '2026-09-30']);
  });

  it('una cuenta creada a las 22:00 de Lima (03:00 UTC del día siguiente) cuenta en el día de Lima', () => {
    const db = openDatabase(':memory:');
    insertUser(db, { createdAt: '2026-09-29T03:00:00.000Z' }); // lunes 28/9 22:00 en Lima
    insertUser(db, { createdAt: '2026-09-29T05:00:00.000Z' }); // martes 29/9 00:00 en Lima
    expect(timeseries(db, { from: lima(2026, 9, 28), to: lima(2026, 9, 30) }, 'day')).toEqual([
      { start: '2026-09-28', registrations: 1, ...empty },
      { start: '2026-09-29', registrations: 1, ...empty },
    ]);
  });

  it('from se incluye y to no', () => {
    const db = openDatabase(':memory:');
    const range = { from: lima(2026, 9, 29), to: lima(2026, 9, 30) };
    insertUser(db, { createdAt: range.from.toISOString() });
    insertUser(db, { createdAt: range.to.toISOString() });
    expect(timeseries(db, range, 'day')).toEqual([{ start: '2026-09-29', registrations: 1, ...empty }]);
  });
});

describe('popularHours', () => {
  it('hora de inicio en Lima, solo de planes CONFIRMADO o EN_RECOORDINACION; con rango, los que caen en él', () => {
    const db = openDatabase(':memory:');
    const u = insertUser(db);
    const g = insertGroup(db, { ownerId: u });
    insertProposal(db, { groupId: g, createdBy: u, state: 'CONFIRMADO', scheduledAt: '2026-10-01T16:00:00.000Z' }); // 1/10 11:00
    insertProposal(db, { groupId: g, createdBy: u, state: 'EN_RECOORDINACION', scheduledAt: '2026-10-02T16:30:00.000Z' }); // 2/10 11:30
    insertProposal(db, { groupId: g, createdBy: u, state: 'CONFIRMADO', scheduledAt: '2026-10-03T01:00:00.000Z' }); // 2/10 20:00
    insertProposal(db, { groupId: g, createdBy: u, state: 'CANCELADO', scheduledAt: '2026-10-01T16:00:00.000Z' }); // no cuenta
    insertProposal(db, { groupId: g, createdBy: u, state: 'PROPUESTO' });
    const all = popularHours(db, null);
    expect(all).toHaveLength(24);
    expect(all.filter((h) => h.count > 0)).toEqual([{ hour: 11, count: 2 }, { hour: 20, count: 1 }]);
    const secondOfOctober = popularHours(db, { from: lima(2026, 10, 2), to: lima(2026, 10, 3) });
    expect(secondOfOctober.filter((h) => h.count > 0)).toEqual([{ hour: 11, count: 1 }, { hour: 20, count: 1 }]);
  });
});

describe('aiUsage', () => {
  it('llamadas y % de éxito por función (todas, también las no usadas) y en total', () => {
    const db = openDatabase(':memory:');
    const u = insertUser(db);
    insertAiCall(db, { userId: u, task: 'schedule-ocr', ok: true, durationMs: 1000 });
    insertAiCall(db, { userId: u, task: 'schedule-ocr', ok: false, durationMs: 3000 });
    insertAiCall(db, { userId: u, task: 'schedule-ocr', ok: true, durationMs: 2000 });
    insertAiCall(db, { userId: u, task: 'voting-summary', ok: true, durationMs: 500 });
    expect(aiUsage(db, null)).toEqual({
      calls: 4,
      ok: 3,
      successRate: 75,
      byTask: [
        { task: 'schedule-ocr', calls: 3, ok: 2, successRate: 67, avgDurationMs: 2000 },
        { task: 'proposal-draft', calls: 0, ok: 0, successRate: null, avgDurationMs: null },
        { task: 'plan-suggestions', calls: 0, ok: 0, successRate: null, avgDurationMs: null },
        { task: 'voting-summary', calls: 1, ok: 1, successRate: 100, avgDurationMs: 500 },
      ],
    });
  });
});

async function adminApp() {
  const { app, db } = makeTestApp({ now: () => NOW });
  const admin = await registerAdmin(app, db); // se registra en NOW (martes 29/9 10:00 en Lima)
  return { app, db, admin };
}

describe('GET /api/admin/stats', () => {
  it('totales de cuentas, grupos, propuestas por estado, planes en pie, incidencias e IA', async () => {
    const { app, db, admin } = await adminApp();
    const ana = insertUser(db, { status: 'SUSPENDED' });
    insertUser(db, { role: 'ADMIN' });
    const g = insertGroup(db, { ownerId: ana });
    insertProposal(db, { groupId: g, createdBy: ana, state: 'CONFIRMADO', scheduledAt: '2026-10-01T16:00:00.000Z' });
    insertProposal(db, { groupId: g, createdBy: ana, state: 'EN_RECOORDINACION', scheduledAt: '2026-10-01T16:00:00.000Z' });
    insertProposal(db, { groupId: g, createdBy: ana, state: 'CANCELADO' });
    insertAiCall(db, { userId: ana, task: 'proposal-draft', ok: false });
    const res = await request(app).get('/api/admin/stats').set(bearer(admin.token));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      users: { total: 3, active: 2, suspended: 1, admins: 2 },
      groups: 1,
      proposals: { PROPUESTO: 0, CONFIRMADO: 1, EN_RECOORDINACION: 1, CANCELADO: 1 },
      confirmedPlans: 2,
      incidences: 0,
      ai: { calls: 1, ok: 0, successRate: 0 },
    });
  });

  it('solo ADMIN: USER → 403 NOT_ADMIN', async () => {
    const { app } = await adminApp();
    const ana = await registerUser(app);
    expect((await request(app).get('/api/admin/stats').set(bearer(ana.token))).body.error.code).toBe('NOT_ADMIN');
  });
});

describe('GET /api/admin/stats/timeseries', () => {
  it('por semanas por defecto, con los tramos vacíos', async () => {
    const { app, db, admin } = await adminApp();
    insertUser(db, { createdAt: '2026-10-06T15:00:00.000Z' }); // martes 6/10
    const from = lima(2026, 9, 28).toISOString();
    const to = lima(2026, 10, 19).toISOString();
    const res = await request(app).get('/api/admin/stats/timeseries').query({ from, to }).set(bearer(admin.token));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      from, to, bucket: 'week',
      points: [
        { start: '2026-09-28', registrations: 1, ...empty },
        { start: '2026-10-05', registrations: 1, ...empty },
        { start: '2026-10-12', registrations: 0, ...empty },
      ],
    });
  });

  it.each([
    [{ from: '2026-10-01T00:00:00.000Z', to: '2026-09-01T00:00:00.000Z' }, '«to» debe ser posterior a «from».'],
    [{ from: '2025-01-01T00:00:00.000Z', to: '2026-09-01T00:00:00.000Z' }, 'El periodo no puede superar 366 días.'],
    [{ from: 'ayer', to: '2026-09-01T00:00:00.000Z' }, 'Usa una fecha ISO 8601 con zona (p. ej. 2026-09-01T05:00:00.000Z).'],
    [{ from: '2026-09-01T00:00:00.000Z', to: '2026-09-02T00:00:00.000Z', bucket: 'month' }, 'bucket debe ser day o week.'],
  ])('%j → 400 «%s»', async (query, message) => {
    const { app, admin } = await adminApp();
    const res = await request(app).get('/api/admin/stats/timeseries').query(query).set(bearer(admin.token));
    expect(res.status).toBe(400);
    expect(res.body.error.details).toContainEqual(expect.objectContaining({ message }));
  });
});

describe('GET /api/admin/stats/popular-hours', () => {
  it('sin rango cuenta todos los planes en pie; from sin to → 400', async () => {
    const { app, db, admin } = await adminApp();
    const u = insertUser(db);
    const g = insertGroup(db, { ownerId: u });
    insertProposal(db, { groupId: g, createdBy: u, state: 'CONFIRMADO', scheduledAt: '2026-10-01T16:00:00.000Z' });
    const res = await request(app).get('/api/admin/stats/popular-hours').set(bearer(admin.token));
    expect(res.body).toMatchObject({ from: null, to: null });
    expect(res.body.hours[11]).toEqual({ hour: 11, count: 1 });
    const half = await request(app).get('/api/admin/stats/popular-hours').query({ from: '2026-10-01T05:00:00.000Z' }).set(bearer(admin.token));
    expect(half.status).toBe(400);
    expect(half.body.error.details).toContainEqual(expect.objectContaining({ message: 'Envía «from» y «to» juntos, o ninguno.' }));
  });
});

describe('GET /api/admin/reports', () => {
  it('todas las cifras del periodo en una respuesta, por días si dura hasta 31', async () => {
    const { app, db, admin } = await adminApp();
    const ana = insertUser(db, { name: 'Ana', createdAt: '2026-09-25T15:00:00.000Z' }); // antes del periodo
    const study = insertGroup(db, { name: 'Estudio', ownerId: ana, createdAt: '2026-09-29T15:00:00.000Z' });
    const football = insertGroup(db, { name: 'Fútbol', ownerId: ana, createdAt: '2026-09-29T16:00:00.000Z' });
    insertProposal(db, { groupId: study, createdBy: ana, state: 'CONFIRMADO', createdAt: '2026-09-29T15:30:00.000Z', scheduledAt: '2026-09-30T21:00:00.000Z' }); // 30/9 16:00
    insertProposal(db, { groupId: study, createdBy: ana, state: 'PROPUESTO', createdAt: '2026-09-30T15:30:00.000Z' });
    insertProposal(db, { groupId: football, createdBy: ana, state: 'CANCELADO', createdAt: '2026-09-30T16:00:00.000Z' });
    insertAiCall(db, { userId: ana, task: 'voting-summary', ok: true, createdAt: '2026-09-30T17:00:00.000Z' });
    const from = lima(2026, 9, 29);
    const to = lima(2026, 10, 1); // martes 29 y miércoles 30 de septiembre
    const res = await request(app).get('/api/admin/reports').query({ from: from.toISOString(), to: to.toISOString() }).set(bearer(admin.token));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      period: { from: from.toISOString(), to: to.toISOString(), fromDate: '2026-09-29', toDate: '2026-09-30' },
      generatedAt: NOW.toISOString(),
      bucket: 'day',
      summary: { newUsers: 1, newGroups: 2, newProposals: 3, confirmedPlans: 1, incidences: 0, aiCalls: 1 },
      proposalsByState: { PROPUESTO: 1, CONFIRMADO: 1, EN_RECOORDINACION: 0, CANCELADO: 1 },
      ai: { calls: 1, ok: 1, successRate: 100, byTask: expect.any(Array) },
      timeseries: [
        { start: '2026-09-29', registrations: 1, groupsCreated: 2, proposalsCreated: 1, aiCalls: 0 },
        { start: '2026-09-30', registrations: 0, groupsCreated: 0, proposalsCreated: 2, aiCalls: 1 },
      ],
      popularHours: expect.any(Array),
      topGroups: [
        { id: study, name: 'Estudio', proposals: 2 },
        { id: football, name: 'Fútbol', proposals: 1 },
      ],
    });
    expect(res.body.popularHours[16]).toEqual({ hour: 16, count: 1 });
  });

  it('más de 31 días → por semanas, desde el lunes de la primera semana', async () => {
    const { app, admin } = await adminApp();
    const res = await request(app)
      .get('/api/admin/reports')
      .query({ from: lima(2026, 8, 1).toISOString(), to: lima(2026, 10, 1).toISOString() })
      .set(bearer(admin.token));
    expect(res.body.bucket).toBe('week');
    expect(res.body.timeseries[0].start).toBe('2026-07-27'); // el 1/8/2026 es sábado
    expect(res.body.period).toMatchObject({ fromDate: '2026-08-01', toDate: '2026-09-30' });
  });
});
```

- [ ] **Step 3: Ejecutar y ver que fallan**

Run: `cd backend && npx vitest run test/admin-stats.test.ts`
Expected: FAIL — no existe `src/admin/stats.ts`.

- [ ] **Step 4: Tipos compartidos** — al final de `shared/index.d.ts`, añadir:

```ts

// ---- Estadísticas e informes (calculados solo en el servidor; la app los muestra y exporta) ----

export type ProposalCounts = Record<ProposalState, number>;

export type AiTaskStats = {
  task: AiTask;
  calls: number;
  ok: number;
  successRate: number | null;      // % entero de llamadas con respuesta válida; null si no hubo llamadas
  avgDurationMs: number | null;
};

export type AiUsage = { calls: number; ok: number; successRate: number | null; byTask: AiTaskStats[] };

export type AdminStats = {
  users: { total: number; active: number; suspended: number; admins: number };
  groups: number;
  proposals: ProposalCounts;
  confirmedPlans: number;          // CONFIRMADO o EN_RECOORDINACION
  incidences: number;
  ai: AiUsage;
};

export type StatsBucket = 'day' | 'week';

export type TimeseriesPoint = {
  start: string;                   // "YYYY-MM-DD": inicio del día o del lunes, en la zona del servidor
  registrations: number;
  groupsCreated: number;
  proposalsCreated: number;
  aiCalls: number;
};

export type Timeseries = { from: string; to: string; bucket: StatsBucket; points: TimeseriesPoint[] };

export type HourCount = { hour: number; count: number };  // hour 0–23 en la zona del servidor

export type PopularHours = { from: string | null; to: string | null; hours: HourCount[] };

// [from, to) en ISO; fromDate/toDate = primer y último día incluidos, en la zona del servidor.
export type ReportPeriod = { from: string; to: string; fromDate: string; toDate: string };

export type ReportSummary = {
  newUsers: number;
  newGroups: number;
  newProposals: number;
  confirmedPlans: number;          // planes en pie cuya fecha (scheduledAt) cae en el periodo
  incidences: number;
  aiCalls: number;
};

export type TopGroup = { id: string; name: string; proposals: number };

export type AdminReport = {
  period: ReportPeriod;
  generatedAt: string;
  bucket: StatsBucket;             // day si el periodo dura ≤ 31 días; si no, week
  summary: ReportSummary;
  proposalsByState: ProposalCounts; // de las propuestas creadas en el periodo
  ai: AiUsage;
  timeseries: TimeseriesPoint[];
  popularHours: HourCount[];
  topGroups: TopGroup[];           // hasta 5, por propuestas creadas en el periodo
};
```

- [ ] **Step 5: Cálculos** — `backend/src/admin/stats.ts`:

```ts
import type {
  AdminReport, AdminStats, AiTask, AiTaskStats, AiUsage, HourCount, ProposalCounts, ProposalState, StatsBucket, TimeseriesPoint, TopGroup,
} from '@hueckoapp/shared';

import { AI_TASKS } from '../ai/ai-client';
import type { Db } from '../db/database';

export type DateRange = { from: Date; to: Date };

export const DAY_MS = 86_400_000;
export const MAX_RANGE_DAYS = 366;
// Un informe de hasta un mes va por días; uno más largo, por semanas (D9).
export const DAILY_REPORT_MAX_DAYS = 31;

// Planes «en pie»: confirmados o re-coordinándose (D9).
const LIVE_PLAN = "state IN ('CONFIRMADO', 'EN_RECOORDINACION')";

const pad2 = (n: number) => String(n).padStart(2, '0');

/** «YYYY-MM-DD» de un instante en la zona del servidor (TZ). */
export const localDateKey = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

/** 00:00 (zona del servidor) del día, o del lunes de la semana, que contiene `d`. */
export function bucketStart(d: Date, bucket: StatsBucket): Date {
  const back = bucket === 'week' ? (d.getDay() + 6) % 7 : 0;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - back);
}

// Con componentes locales (no sumando milisegundos): un cambio de horario no descuadra los tramos (D8).
const nextBucket = (start: Date, bucket: StatsBucket) =>
  new Date(start.getFullYear(), start.getMonth(), start.getDate() + (bucket === 'week' ? 7 : 1));

/** Inicio de cada tramo que toca [from, to), en orden y sin huecos (también los vacíos). */
export function bucketKeys({ from, to }: DateRange, bucket: StatsBucket): string[] {
  const keys: string[] = [];
  for (let start = bucketStart(from, bucket); start < to; start = nextBucket(start, bucket)) keys.push(localDateKey(start));
  return keys;
}

const isoRange = ({ from, to }: DateRange) => [from.toISOString(), to.toISOString()] as const;

const count = (db: Db, sql: string, ...params: string[]) => (db.prepare(sql).get(...params) as { n: number }).n;

// Solo tablas con created_at en ISO UTC (texto ordenable); el nombre es fijo, nunca viene de la petición.
type TimedTable = 'users' | 'groups' | 'proposals' | 'ai_calls';

// SQLite solo filtra por rango (usa los índices); el tramo se calcula en JS con la zona del servidor (D8).
function createdAtIn(db: Db, table: TimedTable, range: DateRange): string[] {
  const rows = db.prepare(`SELECT created_at AS at FROM ${table} WHERE created_at >= ? AND created_at < ?`).all(...isoRange(range)) as { at: string }[];
  return rows.map((r) => r.at);
}

function countByBucket(timestamps: readonly string[], bucket: StatsBucket): Map<string, number> {
  const counts = new Map<string, number>();
  for (const at of timestamps) {
    const key = localDateKey(bucketStart(new Date(at), bucket));
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

export function timeseries(db: Db, range: DateRange, bucket: StatsBucket): TimeseriesPoint[] {
  const registrations = countByBucket(createdAtIn(db, 'users', range), bucket);
  const groupsCreated = countByBucket(createdAtIn(db, 'groups', range), bucket);
  const proposalsCreated = countByBucket(createdAtIn(db, 'proposals', range), bucket);
  const aiCalls = countByBucket(createdAtIn(db, 'ai_calls', range), bucket);
  return bucketKeys(range, bucket).map((start) => ({
    start,
    registrations: registrations.get(start) ?? 0,
    groupsCreated: groupsCreated.get(start) ?? 0,
    proposalsCreated: proposalsCreated.get(start) ?? 0,
    aiCalls: aiCalls.get(start) ?? 0,
  }));
}

/** Hora de inicio (0–23, zona del servidor) de los planes en pie; con rango, los que caen en él. */
export function popularHours(db: Db, range: DateRange | null): HourCount[] {
  const where = range ? ' AND scheduled_at >= ? AND scheduled_at < ?' : '';
  const rows = db
    .prepare(`SELECT scheduled_at AS at FROM proposals WHERE ${LIVE_PLAN} AND scheduled_at IS NOT NULL${where}`)
    .all(...(range ? isoRange(range) : [])) as { at: string }[];
  const hours: HourCount[] = Array.from({ length: 24 }, (_, hour) => ({ hour, count: 0 }));
  for (const { at } of rows) hours[new Date(at).getHours()].count += 1;
  return hours;
}

const rate = (ok: number, calls: number) => (calls === 0 ? null : Math.round((ok * 100) / calls));

/** Llamadas a la IA por función (todas, también las no usadas, en el orden de AI_TASKS) y % de éxito. */
export function aiUsage(db: Db, range: DateRange | null): AiUsage {
  const where = range ? ' WHERE created_at >= ? AND created_at < ?' : '';
  const rows = db
    .prepare(`SELECT task, COUNT(*) AS calls, COALESCE(SUM(ok), 0) AS ok, AVG(duration_ms) AS avg_ms FROM ai_calls${where} GROUP BY task`)
    .all(...(range ? isoRange(range) : [])) as { task: AiTask; calls: number; ok: number; avg_ms: number | null }[];
  const byTask: AiTaskStats[] = AI_TASKS.map((task) => {
    const row = rows.find((r) => r.task === task);
    const calls = row?.calls ?? 0;
    const ok = row?.ok ?? 0;
    return { task, calls, ok, successRate: rate(ok, calls), avgDurationMs: row?.avg_ms == null ? null : Math.round(row.avg_ms) };
  });
  const calls = byTask.reduce((sum, t) => sum + t.calls, 0);
  const ok = byTask.reduce((sum, t) => sum + t.ok, 0);
  return { calls, ok, successRate: rate(ok, calls), byTask };
}

function proposalCounts(db: Db, range: DateRange | null): ProposalCounts {
  const where = range ? ' WHERE created_at >= ? AND created_at < ?' : '';
  const rows = db
    .prepare(`SELECT state, COUNT(*) AS n FROM proposals${where} GROUP BY state`)
    .all(...(range ? isoRange(range) : [])) as { state: ProposalState; n: number }[];
  const counts: ProposalCounts = { PROPUESTO: 0, CONFIRMADO: 0, EN_RECOORDINACION: 0, CANCELADO: 0 };
  for (const r of rows) counts[r.state] = r.n;
  return counts;
}

/** Totales de ahora mismo (GET /admin/stats). `admins` cuenta todas las cuentas ADMIN, activas o no. */
export function adminStats(db: Db): AdminStats {
  const users = db
    .prepare(
      `SELECT COUNT(*) AS total, COALESCE(SUM(status = 'ACTIVE'), 0) AS active,
              COALESCE(SUM(status = 'SUSPENDED'), 0) AS suspended, COALESCE(SUM(role = 'ADMIN'), 0) AS admins
       FROM users`,
    )
    .get() as AdminStats['users'];
  return {
    users: { total: users.total, active: users.active, suspended: users.suspended, admins: users.admins },
    groups: count(db, 'SELECT COUNT(*) AS n FROM groups'),
    proposals: proposalCounts(db, null),
    confirmedPlans: count(db, `SELECT COUNT(*) AS n FROM proposals WHERE ${LIVE_PLAN}`),
    incidences: count(db, 'SELECT COUNT(*) AS n FROM incidences'),
    ai: aiUsage(db, null),
  };
}

/** Todas las cifras de un periodo en una respuesta: la pantalla, el PDF y el CSV usan exactamente estos datos. */
export function adminReport(db: Db, range: DateRange, now: Date): AdminReport {
  const bucket: StatsBucket = (range.to.getTime() - range.from.getTime()) / DAY_MS <= DAILY_REPORT_MAX_DAYS ? 'day' : 'week';
  const [from, to] = isoRange(range);
  const ai = aiUsage(db, range);
  const topGroups = (
    db
      .prepare(
        `SELECT g.id, g.name, COUNT(*) AS proposals
         FROM proposals p JOIN groups g ON g.id = p.group_id
         WHERE p.created_at >= ? AND p.created_at < ?
         GROUP BY g.id ORDER BY proposals DESC, g.name LIMIT 5`,
      )
      .all(from, to) as TopGroup[]
  ).map((g) => ({ id: g.id, name: g.name, proposals: g.proposals }));
  return {
    period: { from, to, fromDate: localDateKey(range.from), toDate: localDateKey(new Date(range.to.getTime() - 1)) },
    generatedAt: now.toISOString(),
    bucket,
    summary: {
      newUsers: count(db, 'SELECT COUNT(*) AS n FROM users WHERE created_at >= ? AND created_at < ?', from, to),
      newGroups: count(db, 'SELECT COUNT(*) AS n FROM groups WHERE created_at >= ? AND created_at < ?', from, to),
      newProposals: count(db, 'SELECT COUNT(*) AS n FROM proposals WHERE created_at >= ? AND created_at < ?', from, to),
      confirmedPlans: count(db, `SELECT COUNT(*) AS n FROM proposals WHERE ${LIVE_PLAN} AND scheduled_at >= ? AND scheduled_at < ?`, from, to),
      incidences: count(db, 'SELECT COUNT(*) AS n FROM incidences WHERE created_at >= ? AND created_at < ?', from, to),
      aiCalls: ai.calls,
    },
    proposalsByState: proposalCounts(db, range),
    ai,
    timeseries: timeseries(db, range, bucket),
    popularHours: popularHours(db, range),
    topGroups,
  };
}
```

- [ ] **Step 6: Esquemas de rango** — en `backend/src/admin/admin.schemas.ts`, añadir el import `import { DAY_MS, MAX_RANGE_DAYS, type DateRange } from './stats';` y al final:

```ts

// ---- Rangos de fechas de estadísticas e informes (D9): [from, to), ISO 8601 con zona ----

const instant = z.iso.datetime({ offset: true, error: 'Usa una fecha ISO 8601 con zona (p. ej. 2026-09-01T05:00:00.000Z).' });

function rangeProblem(from: string, to: string): string | null {
  const span = Date.parse(to) - Date.parse(from);
  if (span <= 0) return '«to» debe ser posterior a «from».';
  if (span > MAX_RANGE_DAYS * DAY_MS) return `El periodo no puede superar ${MAX_RANGE_DAYS} días.`;
  return null;
}

const toRange = (from: string, to: string): DateRange => ({ from: new Date(from), to: new Date(to) });

export const rangeQuerySchema = z
  .object({ from: instant, to: instant })
  .superRefine((q, ctx) => {
    const problem = rangeProblem(q.from, q.to);
    if (problem) ctx.addIssue({ code: 'custom', path: ['to'], message: problem });
  })
  .transform((q) => toRange(q.from, q.to));

export const timeseriesQuerySchema = z
  .object({ from: instant, to: instant, bucket: z.enum(['day', 'week'], { error: 'bucket debe ser day o week.' }).default('week') })
  .superRefine((q, ctx) => {
    const problem = rangeProblem(q.from, q.to);
    if (problem) ctx.addIssue({ code: 'custom', path: ['to'], message: problem });
  })
  .transform((q) => ({ range: toRange(q.from, q.to), bucket: q.bucket }));

// popular-hours: sin rango = desde siempre; con rango, `from` y `to` van juntos.
export const optionalRangeQuerySchema = z
  .object({ from: instant.optional(), to: instant.optional() })
  .superRefine((q, ctx) => {
    if ((q.from === undefined) !== (q.to === undefined)) {
      ctx.addIssue({ code: 'custom', path: ['from'], message: 'Envía «from» y «to» juntos, o ninguno.' });
      return;
    }
    const problem = q.from !== undefined && q.to !== undefined ? rangeProblem(q.from, q.to) : null;
    if (problem) ctx.addIssue({ code: 'custom', path: ['to'], message: problem });
  })
  .transform((q): DateRange | null => (q.from !== undefined && q.to !== undefined ? toRange(q.from, q.to) : null));
```

- [ ] **Step 7: Rutas** — en `backend/src/admin/admin.routes.ts`:
  - Imports: `import type { PopularHours, Timeseries } from '@hueckoapp/shared';` (arriba del todo); el de esquemas pasa a `import { cancelProposalSchema, listQuerySchema, optionalRangeQuerySchema, pageQuerySchema, rangeQuerySchema, timeseriesQuerySchema, userRoleSchema, userStatusSchema } from './admin.schemas';`; y `import { adminReport, adminStats, popularHours, timeseries } from './stats';`
  - Al principio del cuerpo, después de `const actor = …`, añadir:

```ts
  // Estadísticas e informes: todo se calcula aquí; la app solo lo muestra y lo exporta.
  router.get('/stats', (_req, res) => {
    res.json(adminStats(db));
  });

  router.get('/stats/timeseries', (req, res) => {
    const { range, bucket } = timeseriesQuerySchema.parse(req.query);
    const body: Timeseries = { from: range.from.toISOString(), to: range.to.toISOString(), bucket, points: timeseries(db, range, bucket) };
    res.json(body);
  });

  router.get('/stats/popular-hours', (req, res) => {
    const range = optionalRangeQuerySchema.parse(req.query);
    const body: PopularHours = {
      from: range ? range.from.toISOString() : null,
      to: range ? range.to.toISOString() : null,
      hours: popularHours(db, range),
    };
    res.json(body);
  });

  router.get('/reports', (req, res) => {
    res.json(adminReport(db, rangeQuerySchema.parse(req.query), now()));
  });
```

- [ ] **Step 8: Contrato** — en `docs/api.md`:
  - Tabla de tipos, al final: `| `AdminStats` / `Timeseries` / `PopularHours` / `AdminReport` | Estadísticas e informe de un periodo (calculados en el servidor) |`
  - En «Administración», justo después de las «Reglas comunes» (antes de `### `GET /admin/users?search=&page=``), añadir:

~~~markdown
### Estadísticas e informes: fechas y zona horaria
- Los periodos van en `?from=&to=`: instantes ISO 8601 **con zona** (`2026-09-01T05:00:00.000Z`), intervalo `[from, to)`, `from < to`, como mucho **366 días**. Si no → `400 VALIDATION_ERROR` con el campo en `details`.
- Los tramos por **día** o **semana (lunes a domingo)** y las **horas** se calculan en la zona del servidor (`TZ`, `America/Lima`). `start` es la fecha `YYYY-MM-DD` del día o del lunes en esa zona. SQLite solo filtra por rango; el agrupado se hace en el servidor con la zona de `TZ` porque el `localtime` de SQLite usa la zona del sistema operativo y no la de `TZ`.
- La app envía el periodo como la medianoche local de su primer día y la del día siguiente al último; por eso conviene que teléfono y servidor estén en la misma zona. El informe devuelve `period.fromDate`/`toDate` ya calculados en el servidor.
- «Planes confirmados» = propuestas `CONFIRMADO` o `EN_RECOORDINACION`; en un periodo cuentan por su fecha (`scheduledAt`), porque no se guarda cuándo se confirmaron.

### `GET /admin/stats`
`200 AdminStats`, totales de ahora mismo:
```json
{ "users": { "total": 57, "active": 55, "suspended": 2, "admins": 1 }, "groups": 12,
  "proposals": { "PROPUESTO": 4, "CONFIRMADO": 9, "EN_RECOORDINACION": 1, "CANCELADO": 3 },
  "confirmedPlans": 10, "incidences": 6,
  "ai": { "calls": 40, "ok": 37, "successRate": 93,
          "byTask": [ { "task": "schedule-ocr", "calls": 20, "ok": 18, "successRate": 90, "avgDurationMs": 2400 }, … ] } }
```
`admins` cuenta todas las cuentas `ADMIN` (también suspendidas). `successRate` = % entero de llamadas con respuesta válida, `null` sin llamadas. `byTask` trae siempre las 4 funciones, en el orden de `AiTask`.

### `GET /admin/stats/timeseries?from=&to=&bucket=week`
`bucket` ∈ `day | week` (por defecto `week`). `200 Timeseries`: `{ from, to, bucket, points: [ { start, registrations, groupsCreated, proposalsCreated, aiCalls } ] }`, un punto por tramo que toca el periodo, **también los vacíos** (el primero puede empezar antes de `from`, en su lunes).

### `GET /admin/stats/popular-hours?from=&to=`
Histograma de la hora de inicio (zona del servidor) de los planes confirmados. `from`/`to` opcionales pero **juntos** («Envía «from» y «to» juntos, o ninguno.»); sin ellos, todos. `200 PopularHours`: `{ from, to, hours: [ { hour: 0, count: 0 }, …, { hour: 23, count: 1 } ] }` (siempre 24).

### `GET /admin/reports?from=&to=`
Todas las cifras del periodo en una sola respuesta, `200 AdminReport`: la pantalla «Informes», el PDF y el CSV salen de estos mismos datos.
- `period`: `{ from, to, fromDate, toDate }` (primer y último día incluidos, en la zona del servidor); `generatedAt`.
- `bucket`: `day` si el periodo dura 31 días o menos; si no, `week`.
- `summary`: `{ newUsers, newGroups, newProposals, confirmedPlans, incidences, aiCalls }` del periodo.
- `proposalsByState` (de las propuestas creadas en el periodo), `ai` (como en `/admin/stats`, del periodo), `timeseries` (como `/admin/stats/timeseries` con ese `bucket`), `popularHours` (24 horas, planes con fecha en el periodo) y `topGroups` (hasta 5 `{ id, name, proposals }`, por propuestas creadas en el periodo; a igual número, por nombre).

~~~

- [ ] **Step 9: Verificar**

Run: `cd backend && npx vitest run test/admin-stats.test.ts`
Expected: PASS.
Run (raíz): `npm run typecheck` y `npm test` → verde.

- [ ] **Step 10: Commit**

```bash
git add shared/index.d.ts backend/src/admin/stats.ts backend/src/admin/admin.schemas.ts backend/src/admin/admin.routes.ts \
  backend/test/admin-fixtures.ts backend/test/admin-stats.test.ts docs/api.md
GIT_AUTHOR_NAME="Aless Bustamante" GIT_AUTHOR_EMAIL="fabrizio.bs9012@gmail.com" \
GIT_COMMITTER_NAME="Aless Bustamante" GIT_COMMITTER_EMAIL="fabrizio.bs9012@gmail.com" \
git commit -m "feat(backend): estadísticas e informes por periodo en la zona horaria del servidor" -m "Co-Authored-By: <modelo que implementa> <noreply@anthropic.com>"
```

---

### Task 6: Mobile — sesión con rol, cierre por suspensión y capa de datos de administración

**Files:**
- Modify: `mobile/src/api/client.ts`, `mobile/src/api/auth.ts`, `mobile/src/context/AuthContext.tsx`
- Create: `mobile/src/api/admin.ts`, `mobile/src/utils/admin.ts`, `mobile/src/testing/adminFixtures.ts`
- Create: `mobile/src/hooks/usePagedList.ts`, `mobile/src/hooks/useAdminLists.ts`, `mobile/src/hooks/useAdminStats.ts`, `mobile/src/hooks/useAdminReport.ts`, `mobile/src/hooks/useAdminUser.ts`, `mobile/src/hooks/useAdminGroup.ts`
- Test: `mobile/src/api/__tests__/client.test.ts` (añadir), `mobile/src/context/__tests__/AuthContext.test.tsx` (añadir), `mobile/src/api/__tests__/admin.test.ts`, `mobile/src/utils/__tests__/admin.test.ts`, `mobile/src/hooks/__tests__/useAdmin.test.ts` (nuevos)

**Interfaces:**
- Consumes: tipos de shared de los Tasks 1–5; `useResource`, `useAction`, `errorMessage`, `ApiError`; `today()` (`utils/clock`); `formatShortDate` (`utils/days`); `showToast`; fixtures `TEST_USER`, `ANA`.
- Produces:
  - `api/client.ts`: `type SessionEndReason = 'UNAUTHORIZED' | 'ACCOUNT_SUSPENDED'`; `setUnauthorizedHandler(fn: ((reason: SessionEndReason, message: string) => void) | null)`.
  - `api/auth.ts`: `meRequest(): Promise<CurrentUser>`.
  - `AuthContext`: `user: CurrentUser | null` (con `role`).
  - `api/admin.ts`: `type DateRange = { from: Date; to: Date }`, `getAdminStats()`, `getTimeseries(range, bucket)`, `getPopularHours(range?)`, `getReport(range)`, `listAdminUsers(search, page)`, `getAdminUser(id)`, `setUserStatus(id, status)`, `setUserRole(id, role)`, `listAdminGroups(search, page)`, `getAdminGroup(id)`, `deleteAdminGroup(id)`, `cancelProposalAsAdmin(id, reason?)`, `listAudit(page)`.
  - `utils/admin.ts`: `PROPOSAL_STATE_ORDER`, `ROLE_LABEL`, `STATUS_LABEL`, `AI_TASK_LABEL`, `AUDIT_ACTION_LABEL`, `canSeeAdmin(user)`, `percentLabel(n | null)`, `countLabel(n, singular, plural)`, `auditAuthor(entry)`, `auditTarget(entry)`, `auditReason(entry)`, `shortDayLabel(key)`, `type RangePreset`, `type FixedPreset`, `RANGE_PRESETS`, `MAX_RANGE_DAYS`, `type RangeResult`, `presetRange(preset, now)`, `customRange(from, to)`, `lastWeeksRange(now, weeks)`, `periodLabel(fromDate, toDate)`.
  - Hooks: `usePagedList<T>(fetchPage)` → `{ items, total, page, pageCount, search, hasPrev, hasNext, applySearch(text), nextPage(), prevPage(), loaded, loading, refreshing, error, failedLoads, reload }`; `useAdminUsers()`, `useAdminGroups()`, `useAdminAudit()`; `STATS_WEEKS = 12`, `useAdminStats()` → `{ stats, weekly, hours, loaded, loading, refreshing, error, failedLoads, reload }`; `useAdminReport(range)` → `{ report, loaded, loading, refreshing, error, failedLoads, reload }`; `useAdminUser(id)` → `{ user, loading, refreshing, error, reload, setStatus, setRole, saving, actionError, clearActionError }`; `useAdminGroup(id)` → `{ group, loading, refreshing, error, reload, remove, removing, removeError, cancelProposal, cancelling, cancelError, clearCancelError }`.
  - `testing/adminFixtures.ts`: `ADMIN_USER`, `page(items, over?)`, `makeUserSummary`, `makeUserDetail`, `makeAdminProposal`, `makeGroupSummary`, `makeGroupDetail`, `makeAiUsage`, `makeHours`, `makeStats`, `makeTimeseries`, `makePopularHours`, `makeReport`, `makeAuditEntry`.

- [ ] **Step 1: Fixtures de test** — `mobile/src/testing/adminFixtures.ts`:

```ts
import type {
  AdminGroupDetail, AdminGroupSummary, AdminProposalSummary, AdminReport, AdminStats, AdminUserDetail, AdminUserSummary, AiUsage,
  AuditEntry, HourCount, Page, PopularHours, Timeseries, User,
} from '@hueckoapp/shared';

import { ANA, TEST_USER } from './fixtures';

// Datos de administración basados en la semilla. Hoy, en los tests, es el martes 29/09/2026 a las 10:00.
export const ADMIN_USER: User = { id: 'u9', name: 'Administración HueckoApp', email: 'admin@test.com' };

export const page = <T>(items: T[], over: Partial<Page<T>> = {}): Page<T> => ({ items, page: 1, pageSize: 20, total: items.length, ...over });

export const makeUserSummary = (over: Partial<AdminUserSummary> = {}): AdminUserSummary => ({
  ...ANA, role: 'USER', status: 'ACTIVE', createdAt: '2026-09-20T15:00:00.000Z', groupCount: 1, ...over,
});

export const makeUserDetail = (over: Partial<AdminUserDetail> = {}): AdminUserDetail => ({
  ...makeUserSummary(),
  groups: [{ id: 'g1', name: 'Proyecto Integrador', role: 'MEMBER' }],
  activity: { proposalsCreated: 1, votes: 2, incidences: 1, timeBlocks: 3, aiCalls: 4 },
  ...over,
});

export const makeAdminProposal = (over: Partial<AdminProposalSummary> = {}): AdminProposalSummary => ({
  id: 'prop_2', title: 'Repaso antes de la entrega', state: 'PROPUESTO', createdBy: ANA, createdAt: '2026-09-29T14:00:00.000Z',
  votingDeadline: '2026-09-30T01:00:00.000Z', scheduledAt: null, scheduledDate: null, voteCount: 1, incidenceCount: 0, ...over,
});

export const makeGroupSummary = (over: Partial<AdminGroupSummary> = {}): AdminGroupSummary => ({
  id: 'g1', name: 'Proyecto Integrador', description: 'Entrega final', memberCount: 2, proposalCount: 1, owner: TEST_USER,
  createdAt: '2026-09-01T15:00:00.000Z', ...over,
});

export const makeGroupDetail = (over: Partial<AdminGroupDetail> = {}): AdminGroupDetail => ({
  ...makeGroupSummary(),
  inviteCode: 'PROY2026',
  availabilityThreshold: 80,
  members: [{ ...TEST_USER, role: 'OWNER', isEssential: false }, { ...ANA, role: 'MEMBER', isEssential: true }],
  proposals: [makeAdminProposal()],
  ...over,
});

export const makeAiUsage = (): AiUsage => ({
  calls: 4,
  ok: 3,
  successRate: 75,
  byTask: [
    { task: 'schedule-ocr', calls: 3, ok: 2, successRate: 67, avgDurationMs: 2100 },
    { task: 'proposal-draft', calls: 1, ok: 1, successRate: 100, avgDurationMs: 900 },
    { task: 'plan-suggestions', calls: 0, ok: 0, successRate: null, avgDurationMs: null },
    { task: 'voting-summary', calls: 0, ok: 0, successRate: null, avgDurationMs: null },
  ],
});

export const makeHours = (counts: Record<number, number> = { 11: 2, 20: 1 }): HourCount[] =>
  Array.from({ length: 24 }, (_, hour) => ({ hour, count: counts[hour] ?? 0 }));

export const makeStats = (over: Partial<AdminStats> = {}): AdminStats => ({
  users: { total: 4, active: 3, suspended: 1, admins: 1 },
  groups: 2,
  proposals: { PROPUESTO: 1, CONFIRMADO: 1, EN_RECOORDINACION: 0, CANCELADO: 1 },
  confirmedPlans: 1,
  incidences: 1,
  ai: makeAiUsage(),
  ...over,
});

export const makeTimeseries = (over: Partial<Timeseries> = {}): Timeseries => ({
  from: '2026-07-13T05:00:00.000Z',
  to: '2026-09-30T05:00:00.000Z',
  bucket: 'week',
  points: [
    { start: '2026-09-21', registrations: 2, groupsCreated: 1, proposalsCreated: 0, aiCalls: 1 },
    { start: '2026-09-28', registrations: 1, groupsCreated: 0, proposalsCreated: 2, aiCalls: 3 },
  ],
  ...over,
});

export const makePopularHours = (counts?: Record<number, number>): PopularHours => ({ from: null, to: null, hours: makeHours(counts) });

export const makeReport = (over: Partial<AdminReport> = {}): AdminReport => ({
  period: { from: '2026-08-31T05:00:00.000Z', to: '2026-09-30T05:00:00.000Z', fromDate: '2026-08-31', toDate: '2026-09-29' },
  generatedAt: '2026-09-29T15:00:00.000Z',
  bucket: 'day',
  summary: { newUsers: 3, newGroups: 1, newProposals: 2, confirmedPlans: 1, incidences: 1, aiCalls: 4 },
  proposalsByState: { PROPUESTO: 1, CONFIRMADO: 1, EN_RECOORDINACION: 0, CANCELADO: 0 },
  ai: makeAiUsage(),
  timeseries: [
    { start: '2026-09-28', registrations: 2, groupsCreated: 1, proposalsCreated: 1, aiCalls: 3 },
    { start: '2026-09-29', registrations: 1, groupsCreated: 0, proposalsCreated: 1, aiCalls: 1 },
  ],
  popularHours: makeHours(),
  topGroups: [{ id: 'g1', name: 'Proyecto Integrador', proposals: 2 }],
  ...over,
});

export const makeAuditEntry = (over: Partial<AuditEntry> = {}): AuditEntry => ({
  id: 'a1', action: 'USER_SUSPENDED', admin: ADMIN_USER, targetType: 'USER', targetId: 'u2',
  details: { name: 'Ana', from: 'ACTIVE', to: 'SUSPENDED' }, createdAt: '2026-09-29T15:00:00.000Z', ...over,
});
```

- [ ] **Step 2: Escribir los tests que fallan**

Al final de `mobile/src/api/__tests__/client.test.ts`:

```ts
describe('fin de sesión por suspensión (D14)', () => {
  it('401 avisa con el motivo UNAUTHORIZED y el mensaje del servidor', async () => {
    setAuthToken('vigente');
    api.defaults.adapter = failWith(401, { error: { code: 'UNAUTHORIZED', message: 'Tu sesión expiró.' } });
    await expect(api.get('/auth/me')).rejects.toBeInstanceOf(ApiError);
    expect(handler).toHaveBeenCalledWith('UNAUTHORIZED', 'Tu sesión expiró.');
  });

  it('403 ACCOUNT_SUSPENDED con el token vigente avisa con su mensaje; otro 403 no cierra sesión', async () => {
    setAuthToken('vigente');
    api.defaults.adapter = failWith(403, { error: { code: 'NOT_A_MEMBER', message: 'No perteneces a este grupo.' } });
    await expect(api.get('/groups/g1')).rejects.toMatchObject({ status: 403, code: 'NOT_A_MEMBER' });
    expect(handler).not.toHaveBeenCalled();
    api.defaults.adapter = failWith(403, { error: { code: 'ACCOUNT_SUSPENDED', message: 'Tu cuenta está suspendida.' } });
    await expect(api.get('/groups')).rejects.toMatchObject({ status: 403, code: 'ACCOUNT_SUSPENDED' });
    expect(handler).toHaveBeenCalledWith('ACCOUNT_SUSPENDED', 'Tu cuenta está suspendida.');
  });

  it('403 ACCOUNT_SUSPENDED sin sesión (el login) no llama al manejador', async () => {
    api.defaults.adapter = failWith(403, { error: { code: 'ACCOUNT_SUSPENDED', message: 'Tu cuenta está suspendida.' } });
    await expect(api.post('/auth/login', {})).rejects.toMatchObject({ code: 'ACCOUNT_SUSPENDED', message: 'Tu cuenta está suspendida.' });
    expect(handler).not.toHaveBeenCalled();
  });
});
```

En `mobile/src/context/__tests__/AuthContext.test.tsx`:
- Imports: añadir `import { AxiosError, type InternalAxiosRequestConfig } from 'axios';`, cambiar `import { ApiError } from '../../api/client';` → `import { api, ApiError } from '../../api/client';` y añadir `import { showToast } from '../../utils/toast';`
- Debajo de `jest.mock('../../api/auth');` añadir `jest.mock('../../utils/toast', () => ({ showToast: jest.fn() }));`
- Al final:

```ts
it('guarda el rol que devuelve el servidor', async () => {
  mocked.loginRequest.mockResolvedValue({ token: 'nuevo', user: { ...ana, role: 'ADMIN' } });
  const { result } = await renderHook(() => useAuth(), { wrapper });
  await waitFor(() => expect(result.current.status).toBe('signedOut'));
  await act(() => result.current.login('ana@correo.com', 'contrasena-segura'));
  expect(result.current.user?.role).toBe('ADMIN');
});

it('al abrir con la cuenta suspendida: borra el token y queda signedOut', async () => {
  await SecureStore.setItemAsync('hueckoapp.token', 'tok');
  mocked.meRequest.mockRejectedValue(new ApiError(403, 'ACCOUNT_SUSPENDED', 'Tu cuenta está suspendida.'));
  const { result } = await renderHook(() => useAuth(), { wrapper });
  await waitFor(() => expect(result.current.status).toBe('signedOut'));
  expect(await SecureStore.getItemAsync('hueckoapp.token')).toBeNull();
});

it('si el servidor responde ACCOUNT_SUSPENDED en plena sesión: avisa con su mensaje y cierra sesión', async () => {
  mocked.loginRequest.mockResolvedValue({ token: 'nuevo', user: ana });
  const { result } = await renderHook(() => useAuth(), { wrapper });
  await waitFor(() => expect(result.current.status).toBe('signedOut'));
  await act(() => result.current.login('ana@correo.com', 'contrasena-segura'));
  expect(result.current.status).toBe('signedIn');

  const original = api.defaults.adapter;
  api.defaults.adapter = (config) =>
    Promise.reject(
      new AxiosError('fallo', undefined, config as InternalAxiosRequestConfig, null, {
        status: 403, statusText: '', headers: {}, config: config as InternalAxiosRequestConfig,
        data: { error: { code: 'ACCOUNT_SUSPENDED', message: 'Tu cuenta está suspendida.' } },
      }),
    );
  try {
    await act(async () => {
      await expect(api.get('/groups')).rejects.toBeInstanceOf(ApiError);
    });
  } finally {
    api.defaults.adapter = original;
  }
  await waitFor(() => expect(result.current.status).toBe('signedOut'));
  expect(showToast).toHaveBeenCalledWith('Tu cuenta está suspendida.');
  expect(await SecureStore.getItemAsync('hueckoapp.token')).toBeNull();
});
```

`mobile/src/api/__tests__/admin.test.ts`:

```ts
import type { AxiosAdapter, InternalAxiosRequestConfig } from 'axios';

import * as admin from '../admin';
import { api } from '../client';

const original = api.defaults.adapter;
let calls: InternalAxiosRequestConfig[] = [];
const recorder: AxiosAdapter = async (config) => {
  calls.push(config);
  return { data: {}, status: 200, statusText: '', headers: {}, config };
};

beforeEach(() => {
  calls = [];
  api.defaults.adapter = recorder;
});
afterAll(() => {
  api.defaults.adapter = original;
});

const range = { from: new Date('2026-09-01T05:00:00.000Z'), to: new Date('2026-10-01T05:00:00.000Z') };
const iso = { from: '2026-09-01T05:00:00.000Z', to: '2026-10-01T05:00:00.000Z' };

// [método, url, llamada, parámetros de la query, cuerpo]
it.each<[string, string, () => Promise<unknown>, unknown, unknown]>([
  ['GET', '/admin/stats', () => admin.getAdminStats(), undefined, undefined],
  ['GET', '/admin/stats/timeseries', () => admin.getTimeseries(range, 'day'), { ...iso, bucket: 'day' }, undefined],
  ['GET', '/admin/stats/popular-hours', () => admin.getPopularHours(), undefined, undefined],
  ['GET', '/admin/stats/popular-hours', () => admin.getPopularHours(range), iso, undefined],
  ['GET', '/admin/reports', () => admin.getReport(range), iso, undefined],
  ['GET', '/admin/users', () => admin.listAdminUsers('ana', 2), { search: 'ana', page: 2 }, undefined],
  ['GET', '/admin/users/u%202', () => admin.getAdminUser('u 2'), undefined, undefined],
  ['PATCH', '/admin/users/u2/status', () => admin.setUserStatus('u2', 'SUSPENDED'), undefined, { status: 'SUSPENDED' }],
  ['PATCH', '/admin/users/u2/role', () => admin.setUserRole('u2', 'ADMIN'), undefined, { role: 'ADMIN' }],
  ['GET', '/admin/groups', () => admin.listAdminGroups('', 1), { search: '', page: 1 }, undefined],
  ['GET', '/admin/groups/g1', () => admin.getAdminGroup('g1'), undefined, undefined],
  ['DELETE', '/admin/groups/g1', () => admin.deleteAdminGroup('g1'), undefined, undefined],
  ['POST', '/admin/proposals/p1/cancel', () => admin.cancelProposalAsAdmin('p1'), undefined, {}],
  ['POST', '/admin/proposals/p1/cancel', () => admin.cancelProposalAsAdmin('p1', 'Spam'), undefined, { reason: 'Spam' }],
  ['GET', '/admin/audit', () => admin.listAudit(3), { page: 3 }, undefined],
])('%s %s', async (method, url, call, params, body) => {
  await call();
  expect(calls).toHaveLength(1);
  expect(calls[0].method?.toUpperCase()).toBe(method);
  expect(calls[0].url).toBe(url);
  expect(calls[0].params).toEqual(params);
  if (body !== undefined) expect(JSON.parse(calls[0].data)).toEqual(body);
});
```

`mobile/src/utils/__tests__/admin.test.ts`:

```ts
import { makeAuditEntry } from '../../testing/adminFixtures';
import {
  auditAuthor, auditReason, auditTarget, canSeeAdmin, countLabel, customRange, lastWeeksRange, percentLabel, periodLabel, presetRange, shortDayLabel,
} from '../admin';

const NOW = new Date(2026, 8, 29, 10, 0); // martes 29/09/2026

it('canSeeAdmin solo con rol ADMIN', () => {
  expect(canSeeAdmin(null)).toBe(false);
  expect(canSeeAdmin({ id: 'u1', name: 'Ana', email: 'a@b.co', role: 'USER' })).toBe(false);
  expect(canSeeAdmin({ id: 'u1', name: 'Ana', email: 'a@b.co', role: 'ADMIN' })).toBe(true);
});

it('etiquetas', () => {
  expect(percentLabel(75)).toBe('75 %');
  expect(percentLabel(null)).toBe('—');
  expect(countLabel(1, 'cuenta', 'cuentas')).toBe('1 cuenta');
  expect(countLabel(0, 'cuenta', 'cuentas')).toBe('0 cuentas');
  expect(shortDayLabel('2026-09-28')).toBe('28/09');
  expect(periodLabel('2026-08-31', '2026-09-29')).toBe('Lun 31/08 – Mar 29/09');
});

it('registro: autor (o la consola), objetivo guardado y motivo', () => {
  expect(auditAuthor(makeAuditEntry())).toBe('Administración HueckoApp');
  expect(auditAuthor(makeAuditEntry({ admin: null }))).toBe('Consola del servidor');
  expect(auditTarget(makeAuditEntry())).toBe('Ana');
  expect(auditTarget(makeAuditEntry({ details: { title: 'Fiesta', reason: 'Spam' } }))).toBe('Fiesta');
  expect(auditTarget(makeAuditEntry({ details: {} }))).toBe('u2');
  expect(auditReason(makeAuditEntry({ details: { title: 'Fiesta', reason: 'Spam' } }))).toBe('Spam');
  expect(auditReason(makeAuditEntry())).toBeNull();
});

it.each([
  ['7d', new Date(2026, 8, 23), new Date(2026, 8, 30)],
  ['30d', new Date(2026, 7, 31), new Date(2026, 8, 30)],
  ['semester', new Date(2026, 6, 1), new Date(2026, 8, 30)],
] as const)('presetRange(%s): hasta el final de hoy', (preset, from, to) => {
  expect(presetRange(preset, NOW)).toEqual({ from, to });
});

it('«Este semestre» en marzo empieza el 1 de enero', () => {
  expect(presetRange('semester', new Date(2026, 2, 15, 9)).from).toEqual(new Date(2026, 0, 1));
});

it('customRange: ambos días incluidos; valida que haya fechas, el orden y el máximo de 366 días', () => {
  expect(customRange(new Date(2026, 8, 10, 18), new Date(2026, 8, 20, 7))).toEqual({
    ok: true, range: { from: new Date(2026, 8, 10), to: new Date(2026, 8, 21) },
  });
  expect(customRange(new Date(2026, 8, 10), new Date(2026, 8, 10))).toEqual({
    ok: true, range: { from: new Date(2026, 8, 10), to: new Date(2026, 8, 11) },
  });
  expect(customRange(null, new Date())).toEqual({ ok: false, error: 'Elige la fecha de inicio y la de fin.' });
  expect(customRange(new Date(2026, 8, 20), new Date(2026, 8, 10))).toEqual({
    ok: false, error: 'La fecha de inicio no puede ser posterior a la de fin.',
  });
  expect(customRange(new Date(2025, 0, 1), new Date(2026, 8, 10))).toEqual({ ok: false, error: 'El periodo no puede superar 366 días.' });
});

it('lastWeeksRange: 12 semanas completas desde el lunes hasta el final de hoy', () => {
  expect(lastWeeksRange(NOW, 12)).toEqual({ from: new Date(2026, 6, 13), to: new Date(2026, 8, 30) });
});
```

`mobile/src/hooks/__tests__/useAdmin.test.ts`:

```ts
import { act, renderHook, waitFor } from '@testing-library/react-native';

import * as adminApi from '../../api/admin';
import { ApiError } from '../../api/client';
import {
  makeAdminProposal, makeAuditEntry, makeGroupDetail, makePopularHours, makeReport, makeStats, makeTimeseries, makeUserDetail,
  makeUserSummary, page,
} from '../../testing/adminFixtures';
import { useAdminGroup } from '../useAdminGroup';
import { useAdminAudit, useAdminUsers } from '../useAdminLists';
import { useAdminReport } from '../useAdminReport';
import { useAdminStats } from '../useAdminStats';
import { useAdminUser } from '../useAdminUser';

jest.mock('../../api/admin');
jest.mock('../../utils/clock', () => ({ today: () => new Date(2026, 8, 29, 10, 0) }));
const admin = adminApi as jest.Mocked<typeof adminApi>;

beforeEach(() => jest.clearAllMocks());

describe('usePagedList (useAdminUsers / useAdminAudit)', () => {
  it('página 1 sin búsqueda; buscar vuelve a la 1 y pasar de página conserva la búsqueda', async () => {
    admin.listAdminUsers.mockResolvedValue(page([makeUserSummary()], { total: 45 }));
    const { result } = await renderHook(() => useAdminUsers());
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(admin.listAdminUsers).toHaveBeenLastCalledWith('', 1);
    expect(result.current).toMatchObject({ page: 1, pageCount: 3, hasPrev: false, hasNext: true, total: 45 });

    await act(async () => result.current.nextPage());
    await waitFor(() => expect(admin.listAdminUsers).toHaveBeenLastCalledWith('', 2));
    await act(async () => result.current.applySearch('  ana '));
    await waitFor(() => expect(admin.listAdminUsers).toHaveBeenLastCalledWith('ana', 1));
    expect(result.current.search).toBe('ana');
    await act(async () => result.current.nextPage());
    await waitFor(() => expect(admin.listAdminUsers).toHaveBeenLastCalledWith('ana', 2));
    expect(result.current.hasPrev).toBe(true);
  });

  it('el registro pide solo la página', async () => {
    admin.listAudit.mockResolvedValue(page([makeAuditEntry()]));
    const { result } = await renderHook(() => useAdminAudit());
    await waitFor(() => expect(result.current.items).toHaveLength(1));
    expect(admin.listAudit).toHaveBeenCalledWith(1);
  });
});

describe('useAdminStats', () => {
  it('totales, las últimas 12 semanas y las horas, en una sola carga', async () => {
    admin.getAdminStats.mockResolvedValue(makeStats());
    admin.getTimeseries.mockResolvedValue(makeTimeseries());
    admin.getPopularHours.mockResolvedValue(makePopularHours());
    const { result } = await renderHook(() => useAdminStats());
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(admin.getTimeseries).toHaveBeenCalledWith({ from: new Date(2026, 6, 13), to: new Date(2026, 8, 30) }, 'week');
    expect(admin.getPopularHours).toHaveBeenCalledWith();
    expect(result.current.stats).toEqual(makeStats());
    expect(result.current.weekly).toEqual(makeTimeseries());
  });

  it('si falla una de las tres, queda el error y no hay datos', async () => {
    admin.getAdminStats.mockResolvedValue(makeStats());
    admin.getTimeseries.mockRejectedValue(new ApiError(403, 'NOT_ADMIN', 'Solo la administración de HueckoApp puede hacer esto.'));
    admin.getPopularHours.mockResolvedValue(makePopularHours());
    const { result } = await renderHook(() => useAdminStats());
    await waitFor(() => expect(result.current.error).toBe('Solo la administración de HueckoApp puede hacer esto.'));
    expect(result.current.stats).toBeUndefined();
  });
});

describe('useAdminReport', () => {
  it('pide el informe del periodo y solo recarga si cambian las fechas', async () => {
    admin.getReport.mockResolvedValue(makeReport());
    const initialProps = { range: { from: new Date(2026, 7, 31), to: new Date(2026, 8, 30) } };
    const { result, rerender } = await renderHook(({ range }) => useAdminReport(range), { initialProps });
    await waitFor(() => expect(result.current.loaded).toBe(true));
    await rerender({ range: { from: new Date(2026, 7, 31), to: new Date(2026, 8, 30) } }); // mismo periodo, objeto nuevo
    expect(admin.getReport).toHaveBeenCalledTimes(1);
    await rerender({ range: { from: new Date(2026, 8, 23), to: new Date(2026, 8, 30) } });
    await waitFor(() => expect(admin.getReport).toHaveBeenCalledTimes(2));
    expect(admin.getReport).toHaveBeenLastCalledWith({ from: new Date(2026, 8, 23), to: new Date(2026, 8, 30) });
  });
});

describe('useAdminUser', () => {
  it('suspender actualiza el detalle; un 409 queda en actionError y el detalle no cambia', async () => {
    admin.getAdminUser.mockResolvedValue(makeUserDetail());
    admin.setUserStatus.mockResolvedValueOnce(makeUserDetail({ status: 'SUSPENDED' }));
    const { result } = await renderHook(() => useAdminUser('u2'));
    await waitFor(() => expect(result.current.user).toBeDefined());
    await act(async () => {
      await result.current.setStatus('SUSPENDED');
    });
    expect(admin.setUserStatus).toHaveBeenCalledWith('u2', 'SUSPENDED');
    expect(result.current.user?.status).toBe('SUSPENDED');

    admin.setUserRole.mockRejectedValueOnce(new ApiError(409, 'LAST_ADMIN', 'Tiene que quedar al menos un administrador activo.'));
    let outcome: unknown;
    await act(async () => {
      outcome = await result.current.setRole('ADMIN');
    });
    expect(outcome).toEqual({ ok: false });
    expect(result.current.actionError).toBe('Tiene que quedar al menos un administrador activo.');
    expect(result.current.user?.role).toBe('USER');
  });
});

describe('useAdminGroup', () => {
  it('cancelar una propuesta la actualiza en el detalle; borrar llama al endpoint', async () => {
    admin.getAdminGroup.mockResolvedValue(makeGroupDetail());
    admin.cancelProposalAsAdmin.mockResolvedValue(makeAdminProposal({ state: 'CANCELADO' }));
    admin.deleteAdminGroup.mockResolvedValue(undefined);
    const { result } = await renderHook(() => useAdminGroup('g1'));
    await waitFor(() => expect(result.current.group).toBeDefined());
    await act(async () => {
      await result.current.cancelProposal('prop_2', 'Spam');
    });
    expect(admin.cancelProposalAsAdmin).toHaveBeenCalledWith('prop_2', 'Spam');
    expect(result.current.group?.proposals[0].state).toBe('CANCELADO');
    let outcome: unknown;
    await act(async () => {
      outcome = await result.current.remove();
    });
    expect(outcome).toEqual({ ok: true, value: undefined });
    expect(admin.deleteAdminGroup).toHaveBeenCalledWith('g1');
  });
});
```

- [ ] **Step 3: Ejecutar y ver que fallan**

Run: `cd mobile && npx jest src/api src/context src/utils/__tests__/admin.test.ts src/hooks/__tests__/useAdmin.test.ts`
Expected: FAIL — no existen `api/admin`, `utils/admin` ni los hooks; el manejador se llama sin argumentos.

- [ ] **Step 4: Cliente HTTP** — en `mobile/src/api/client.ts`:
  - Sustituir `let onUnauthorized: (() => void) | null = null;` por:

```ts
// Por qué se cierra la sesión: token vencido o inválido (401) o cuenta suspendida (403 ACCOUNT_SUSPENDED, D14).
export type SessionEndReason = 'UNAUTHORIZED' | 'ACCOUNT_SUSPENDED';

let onSessionEnd: ((reason: SessionEndReason, message: string) => void) | null = null;
```

  - Sustituir `export const setUnauthorizedHandler = (fn: (() => void) | null) => { onUnauthorized = fn; };` por:

```ts
export const setUnauthorizedHandler = (fn: ((reason: SessionEndReason, message: string) => void) | null) => {
  onSessionEnd = fn;
};
```

  - En el interceptor de respuesta, sustituir desde `const { status, data } = error.response;` hasta el `);` del `throw new ApiError(...)` por:

```ts
    const { status, data } = error.response;
    const code = data?.error?.code ?? 'UNKNOWN';
    const message = data?.error?.message ?? 'Ocurrió un error inesperado.';
    // Solo si la petición salió con el token actual: un 401/403 tardío de una sesión anterior se ignora.
    const sentWithCurrentToken = Boolean(authToken) && error.config?.headers?.Authorization === `Bearer ${authToken}`;
    if (sentWithCurrentToken && status === 401) onSessionEnd?.('UNAUTHORIZED', message);
    if (sentWithCurrentToken && status === 403 && code === 'ACCOUNT_SUSPENDED') onSessionEnd?.('ACCOUNT_SUSPENDED', message);
    throw new ApiError(status, code, message, data?.error?.details ?? null);
```

  En `mobile/src/api/auth.ts`: `import type { AuthResponse, User } from '@hueckoapp/shared';` → `import type { AuthResponse, CurrentUser } from '@hueckoapp/shared';` y `export const meRequest = async () => (await api.get<User>('/auth/me')).data;` → `export const meRequest = async () => (await api.get<CurrentUser>('/auth/me')).data;`

- [ ] **Step 5: `AuthContext`** — en `mobile/src/context/AuthContext.tsx`:
  - `import type { User } from '@hueckoapp/shared';` → `import type { CurrentUser } from '@hueckoapp/shared';`; añadir `import { showToast } from '../utils/toast';`
  - `user: User | null;` → `user: CurrentUser | null;` (en `AuthContextValue`) y `useState<User | null>(null)` → `useState<CurrentUser | null>(null)`.
  - En el `catch` del arranque: `if (e instanceof ApiError && e.status === 401) {` → `if (e instanceof ApiError && (e.status === 401 || e.code === 'ACCOUNT_SUSPENDED')) {` y añadir encima el comentario `// Token vencido o cuenta suspendida: la sesión guardada ya no sirve.`
  - Sustituir el efecto del manejador por:

```ts
  useEffect(() => {
    setUnauthorizedHandler((reason, message) => {
      // Suspendida: se explica por qué se cierra la sesión (con un token vencido basta volver al login).
      if (reason === 'ACCOUNT_SUSPENDED') showToast(message);
      void logout();
    });
    return () => setUnauthorizedHandler(null);
  }, [logout]);
```

- [ ] **Step 6: Endpoints** — `mobile/src/api/admin.ts`:

```ts
import type {
  AdminGroupDetail, AdminGroupSummary, AdminProposalSummary, AdminReport, AdminStats, AdminUserDetail, AdminUserSummary, AuditEntry,
  Page, PopularHours, StatsBucket, Timeseries, UserRole, UserStatus,
} from '@hueckoapp/shared';

import { api } from './client';

// Periodo [from, to) en instantes; el servidor agrupa por días y horas en su zona horaria (docs/api.md).
export type DateRange = { from: Date; to: Date };

const rangeParams = ({ from, to }: DateRange) => ({ from: from.toISOString(), to: to.toISOString() });
const userPath = (id: string) => `/admin/users/${encodeURIComponent(id)}`;
const groupPath = (id: string) => `/admin/groups/${encodeURIComponent(id)}`;

export const getAdminStats = async () => (await api.get<AdminStats>('/admin/stats')).data;

export const getTimeseries = async (range: DateRange, bucket: StatsBucket) =>
  (await api.get<Timeseries>('/admin/stats/timeseries', { params: { ...rangeParams(range), bucket } })).data;

export const getPopularHours = async (range?: DateRange) =>
  (await api.get<PopularHours>('/admin/stats/popular-hours', { params: range ? rangeParams(range) : undefined })).data;

export const getReport = async (range: DateRange) => (await api.get<AdminReport>('/admin/reports', { params: rangeParams(range) })).data;

export const listAdminUsers = async (search: string, page: number) =>
  (await api.get<Page<AdminUserSummary>>('/admin/users', { params: { search, page } })).data;

export const getAdminUser = async (id: string) => (await api.get<AdminUserDetail>(userPath(id))).data;

export const setUserStatus = async (id: string, status: UserStatus) =>
  (await api.patch<AdminUserDetail>(`${userPath(id)}/status`, { status })).data;

export const setUserRole = async (id: string, role: UserRole) => (await api.patch<AdminUserDetail>(`${userPath(id)}/role`, { role })).data;

export const listAdminGroups = async (search: string, page: number) =>
  (await api.get<Page<AdminGroupSummary>>('/admin/groups', { params: { search, page } })).data;

export const getAdminGroup = async (id: string) => (await api.get<AdminGroupDetail>(groupPath(id))).data;

export const deleteAdminGroup = async (id: string): Promise<void> => {
  await api.delete(groupPath(id));
};

// Moderación: el motivo (opcional) queda en el registro de acciones.
export const cancelProposalAsAdmin = async (id: string, reason?: string) =>
  (await api.post<AdminProposalSummary>(`/admin/proposals/${encodeURIComponent(id)}/cancel`, reason ? { reason } : {})).data;

export const listAudit = async (page: number) => (await api.get<Page<AuditEntry>>('/admin/audit', { params: { page } })).data;
```

- [ ] **Step 7: Utilidades** — `mobile/src/utils/admin.ts`:

```ts
import type { AiTask, AuditAction, AuditEntry, CurrentUser, ProposalState, UserRole, UserStatus } from '@hueckoapp/shared';

import type { DateRange } from '../api/admin';
import { formatShortDate } from './days';

// Orden fijo de los estados en gráficos, tablas y CSV.
export const PROPOSAL_STATE_ORDER: readonly ProposalState[] = ['PROPUESTO', 'CONFIRMADO', 'EN_RECOORDINACION', 'CANCELADO'];

export const ROLE_LABEL: Record<UserRole, string> = { USER: 'Usuario', ADMIN: 'Administrador' };

export const STATUS_LABEL: Record<UserStatus, string> = { ACTIVE: 'Activa', SUSPENDED: 'Suspendida' };

export const AI_TASK_LABEL: Record<AiTask, string> = {
  'schedule-ocr': 'Leer horario de una foto',
  'proposal-draft': 'Borrador de propuesta',
  'plan-suggestions': 'Ideas de plan',
  'voting-summary': 'Resumen de votación',
};

export const AUDIT_ACTION_LABEL: Record<AuditAction, string> = {
  USER_SUSPENDED: 'Suspendió una cuenta',
  USER_REACTIVATED: 'Reactivó una cuenta',
  USER_PROMOTED: 'Nombró administrador',
  USER_DEMOTED: 'Quitó el rol de administrador',
  GROUP_DELETED: 'Eliminó un grupo',
  PROPOSAL_CANCELLED: 'Canceló una propuesta',
};

// El menú «Administración» (D12). El servidor vuelve a comprobarlo en cada petición.
export const canSeeAdmin = (user: CurrentUser | null) => user?.role === 'ADMIN';

export const percentLabel = (value: number | null) => (value === null ? '—' : `${value} %`);

export const countLabel = (n: number, singular: string, plural: string) => (n === 1 ? `1 ${singular}` : `${n} ${plural}`);

export const auditAuthor = (entry: AuditEntry) => entry.admin?.name ?? 'Consola del servidor';

// Nombre o título guardado en la anotación: el objetivo puede ya no existir (un grupo borrado).
export function auditTarget(entry: AuditEntry): string {
  const { name, title } = entry.details;
  if (typeof name === 'string') return name;
  if (typeof title === 'string') return title;
  return entry.targetId;
}

export const auditReason = (entry: AuditEntry) => (typeof entry.details.reason === 'string' ? entry.details.reason : null);

/** «2026-09-28» → «28/09» (ejes de los gráficos). */
export const shortDayLabel = (key: string) => `${key.slice(8, 10)}/${key.slice(5, 7)}`;

/** «Lun 31/08 – Mar 29/09» con los días que manda el servidor (ReportPeriod). */
export const periodLabel = (fromDate: string, toDate: string) => `${formatShortDate(fromDate)} – ${formatShortDate(toDate)}`;

// ---- Periodo del informe (hora del teléfono; el servidor valida lo mismo) ----

export type RangePreset = '7d' | '30d' | 'semester' | 'custom';
export type FixedPreset = Exclude<RangePreset, 'custom'>;

export const RANGE_PRESETS: readonly { key: RangePreset; label: string }[] = [
  { key: '7d', label: '7 días' },
  { key: '30d', label: '30 días' },
  { key: 'semester', label: 'Este semestre' },
  { key: 'custom', label: 'Personalizado' },
];

export const MAX_RANGE_DAYS = 366;

export type RangeResult = { ok: true; range: DateRange } | { ok: false; error: string };

const DAY_MS = 86_400_000;
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const plusDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

/**
 * Siempre hasta el final de hoy: «7 días» y «30 días» incluyen hoy; «Este semestre» empieza el 1 de enero o el 1 de julio.
 */
export function presetRange(preset: FixedPreset, now: Date): DateRange {
  const to = plusDays(startOfDay(now), 1);
  if (preset === '7d') return { from: plusDays(to, -7), to };
  if (preset === '30d') return { from: plusDays(to, -30), to };
  return { from: new Date(now.getFullYear(), now.getMonth() < 6 ? 0 : 6, 1), to };
}

/** «Personalizado»: del día `from` al día `to`, ambos incluidos. */
export function customRange(from: Date | null, to: Date | null): RangeResult {
  if (!from || !to) return { ok: false, error: 'Elige la fecha de inicio y la de fin.' };
  const start = startOfDay(from);
  const end = plusDays(startOfDay(to), 1);
  if (start >= end) return { ok: false, error: 'La fecha de inicio no puede ser posterior a la de fin.' };
  if (Math.round((end.getTime() - start.getTime()) / DAY_MS) > MAX_RANGE_DAYS) {
    return { ok: false, error: `El periodo no puede superar ${MAX_RANGE_DAYS} días.` };
  }
  return { ok: true, range: { from: start, to: end } };
}

/** Las últimas `weeks` semanas de lunes a domingo, hasta el final de hoy (gráficos de «Estadísticas»). */
export function lastWeeksRange(now: Date, weeks: number): DateRange {
  const today = startOfDay(now);
  const monday = plusDays(today, -((today.getDay() + 6) % 7));
  return { from: plusDays(monday, -7 * (weeks - 1)), to: plusDays(today, 1) };
}
```

- [ ] **Step 8: Hooks**

`mobile/src/hooks/usePagedList.ts`:

```ts
import type { Page } from '@hueckoapp/shared';
import { useCallback, useState } from 'react';

import { useResource } from './useResource';

export type FetchPage<T> = (search: string, page: number) => Promise<Page<T>>;

// Lista paginada con búsqueda (Usuarios, Grupos, Registro). `fetchPage` debe ser estable (función de módulo).
// Buscar vuelve a la página 1; cambiar de página conserva la búsqueda. Cada cambio es una carga nueva de useResource.
export function usePagedList<T>(fetchPage: FetchPage<T>) {
  const [query, setQuery] = useState({ search: '', page: 1 });
  const load = useCallback(() => fetchPage(query.search, query.page), [fetchPage, query]);
  const { data, loaded, loading, refreshing, error, failedLoads, reload } = useResource(load);
  const pageCount = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  const applySearch = useCallback((text: string) => setQuery({ search: text.trim(), page: 1 }), []);
  const goTo = useCallback((page: number) => setQuery((q) => ({ ...q, page })), []);

  return {
    items: data?.items ?? [],
    total: data?.total ?? 0,
    page: query.page,
    pageCount,
    search: query.search,
    hasPrev: query.page > 1,
    hasNext: query.page < pageCount,
    applySearch,
    nextPage: () => goTo(query.page + 1),
    prevPage: () => goTo(Math.max(1, query.page - 1)),
    loaded, loading, refreshing, error, failedLoads, reload,
  };
}
```

`mobile/src/hooks/useAdminLists.ts`:

```ts
import { listAdminGroups, listAdminUsers, listAudit } from '../api/admin';
import { usePagedList } from './usePagedList';

// El registro no tiene búsqueda: solo páginas.
const fetchAudit = (_search: string, page: number) => listAudit(page);

export const useAdminUsers = () => usePagedList(listAdminUsers);
export const useAdminGroups = () => usePagedList(listAdminGroups);
export const useAdminAudit = () => usePagedList(fetchAudit);
```

`mobile/src/hooks/useAdminStats.ts`:

```ts
import type { AdminStats, PopularHours, Timeseries } from '@hueckoapp/shared';

import { getAdminStats, getPopularHours, getTimeseries } from '../api/admin';
import { lastWeeksRange } from '../utils/admin';
import { today } from '../utils/clock';
import { useResource } from './useResource';

export const STATS_WEEKS = 12;

export type AdminStatsData = { stats: AdminStats; weekly: Timeseries; hours: PopularHours };

// Totales, las últimas 12 semanas y las horas populares en una sola carga (se recargan juntos).
const loadStats = async (): Promise<AdminStatsData> => {
  const [stats, weekly, hours] = await Promise.all([
    getAdminStats(),
    getTimeseries(lastWeeksRange(today(), STATS_WEEKS), 'week'),
    getPopularHours(),
  ]);
  return { stats, weekly, hours };
};

export function useAdminStats() {
  const { data, loaded, loading, refreshing, error, failedLoads, reload } = useResource(loadStats);
  return { stats: data?.stats, weekly: data?.weekly, hours: data?.hours, loaded, loading, refreshing, error, failedLoads, reload };
}
```

`mobile/src/hooks/useAdminReport.ts`:

```ts
import { useCallback } from 'react';

import { getReport, type DateRange } from '../api/admin';
import { useResource } from './useResource';

// Informe del periodo aplicado. Depende de las fechas (no de la identidad del objeto): no recarga por un render.
export function useAdminReport(range: DateRange) {
  const fromMs = range.from.getTime();
  const toMs = range.to.getTime();
  const load = useCallback(() => getReport({ from: new Date(fromMs), to: new Date(toMs) }), [fromMs, toMs]);
  const { data, loaded, loading, refreshing, error, failedLoads, reload } = useResource(load);
  return { report: data, loaded, loading, refreshing, error, failedLoads, reload };
}
```

`mobile/src/hooks/useAdminUser.ts`:

```ts
import type { UserRole, UserStatus } from '@hueckoapp/shared';
import { useCallback } from 'react';

import { getAdminUser, setUserRole, setUserStatus } from '../api/admin';
import { useAction } from './useAction';
import { useResource } from './useResource';

// Detalle de una cuenta y sus dos acciones. No lanzan: devuelven { ok } y dejan el mensaje en actionError.
export function useAdminUser(userId: string) {
  const load = useCallback(() => getAdminUser(userId), [userId]);
  const { data, loading, refreshing, error, reload, mutate } = useResource(load);

  const status = useAction(async (next: UserStatus) => {
    const updated = await setUserStatus(userId, next);
    mutate(() => updated);
    return updated;
  });
  const role = useAction(async (next: UserRole) => {
    const updated = await setUserRole(userId, next);
    mutate(() => updated);
    return updated;
  });

  const { clearError: clearStatusError } = status;
  const { clearError: clearRoleError } = role;
  const clearActionError = useCallback(() => {
    clearStatusError();
    clearRoleError();
  }, [clearStatusError, clearRoleError]);

  return {
    user: data, loading, refreshing, error, reload,
    setStatus: status.run,
    setRole: role.run,
    saving: status.loading || role.loading,
    actionError: status.error ?? role.error,
    clearActionError,
  };
}
```

`mobile/src/hooks/useAdminGroup.ts`:

```ts
import { useCallback } from 'react';

import { cancelProposalAsAdmin, deleteAdminGroup, getAdminGroup } from '../api/admin';
import { useAction } from './useAction';
import { useResource } from './useResource';

// Detalle de un grupo para la administración: borrarlo y cancelar sus propuestas (moderación). No lanzan.
export function useAdminGroup(groupId: string) {
  const load = useCallback(() => getAdminGroup(groupId), [groupId]);
  const { data, loading, refreshing, error, reload, mutate } = useResource(load);

  const removeAction = useAction(() => deleteAdminGroup(groupId));
  const cancelAction = useAction(async (proposalId: string, reason?: string) => {
    const updated = await cancelProposalAsAdmin(proposalId, reason);
    mutate((prev) => prev && { ...prev, proposals: prev.proposals.map((p) => (p.id === updated.id ? updated : p)) });
    return updated;
  });

  return {
    group: data, loading, refreshing, error, reload,
    remove: removeAction.run,
    removing: removeAction.loading,
    removeError: removeAction.error,
    cancelProposal: cancelAction.run,
    cancelling: cancelAction.loading,
    cancelError: cancelAction.error,
    clearCancelError: cancelAction.clearError,
  };
}
```

- [ ] **Step 9: Verificar**

Run: `cd mobile && npx jest src/api src/context src/utils/__tests__/admin.test.ts src/hooks/__tests__/useAdmin.test.ts`
Expected: PASS.
Run (raíz): `npm run typecheck` y `npm test` → verde (los tests de `client.test.ts` que esperaban `toHaveBeenCalledTimes(1)` siguen pasando).

- [ ] **Step 10: Commit**

```bash
git add mobile/src/api/client.ts mobile/src/api/auth.ts mobile/src/api/admin.ts mobile/src/context/AuthContext.tsx \
  mobile/src/utils/admin.ts mobile/src/testing/adminFixtures.ts mobile/src/hooks/usePagedList.ts mobile/src/hooks/useAdminLists.ts \
  mobile/src/hooks/useAdminStats.ts mobile/src/hooks/useAdminReport.ts mobile/src/hooks/useAdminUser.ts mobile/src/hooks/useAdminGroup.ts \
  mobile/src/api/__tests__/client.test.ts mobile/src/api/__tests__/admin.test.ts mobile/src/context/__tests__/AuthContext.test.tsx \
  mobile/src/utils/__tests__/admin.test.ts mobile/src/hooks/__tests__/useAdmin.test.ts
GIT_AUTHOR_NAME="Aless Bustamante" GIT_AUTHOR_EMAIL="fabrizio.bs9012@gmail.com" \
GIT_COMMITTER_NAME="Aless Bustamante" GIT_COMMITTER_EMAIL="fabrizio.bs9012@gmail.com" \
git commit -m "feat(mobile): sesión con rol, cierre por suspensión y datos de administración" -m "Co-Authored-By: <modelo que implementa> <noreply@anthropic.com>"
```

---

### Task 7: Mobile — menú «Administración» con Estadísticas e Informes (gráficos, PDF y CSV)

**Files:**
- Modify: `mobile/package.json`, `package-lock.json` (raíz) y, solo si `npx expo install` lo cambia, `mobile/app.json`
- Modify: `mobile/jest.setup.ts`, `mobile/src/components/index.ts`, `mobile/src/navigation/types.ts`, `mobile/src/navigation/AppDrawer.tsx`
- Create: `mobile/src/components/ChartCard.tsx`, `mobile/src/components/StatTile.tsx`
- Create: `mobile/src/utils/reportExport.ts`, `mobile/src/utils/shareReport.ts`
- Create: `mobile/src/screens/admin/chartData.ts`, `mobile/src/screens/admin/AiUsageCard.tsx`, `mobile/src/screens/admin/AdminScreen.tsx`, `mobile/src/screens/admin/tabs/StatsTab.tsx`, `mobile/src/screens/admin/tabs/ReportsTab.tsx`
- Test: `mobile/src/utils/__tests__/reportExport.test.ts`, `mobile/src/utils/__tests__/shareReport.test.ts`, `mobile/src/screens/admin/__tests__/chartData.test.ts`, `mobile/src/screens/admin/__tests__/StatsTab.test.tsx`, `mobile/src/screens/admin/__tests__/ReportsTab.test.tsx`

**Interfaces:**
- Consumes: `useAdminStats`, `STATS_WEEKS`, `useAdminReport`, `useAction`, `useRefreshErrorToast` (Task 6 y existentes); `utils/admin` (`PROPOSAL_STATE_ORDER`, `AI_TASK_LABEL`, `percentLabel`, `shortDayLabel`, `periodLabel`, `RANGE_PRESETS`, `presetRange`, `customRange`, `canSeeAdmin`); `DateRange`; `STATE_BADGE`; componentes `HueckoCard`, `LoadState`, `ChoiceChip`, `DateTimeField`, `PrimaryButton`, `SecondaryButton`, `ErrorBanner`; `formatDateTime`; fixtures de `testing/adminFixtures.ts`.
- Produces:
  - `components/ChartCard.tsx`: `type ChartPoint = { label: string; value: number }`, `ChartCard({ title, data, kind?: 'bar' | 'line', color?, emptyText?, testID? })`.
  - `components/StatTile.tsx`: `StatTile({ label, value, hint? })` (etiqueta accesible `«<label>: <value>»`).
  - `utils/reportExport.ts`: `csvCell(value)`, `reportCsv(report)`, `escapeHtml(text)`, `reportHtml(report)`, `reportFileName(report, ext)`.
  - `utils/shareReport.ts`: `shareReportPdf(report): Promise<void>`, `shareReportCsv(report): Promise<void>`.
  - `screens/admin/chartData.ts`: `statePoints(counts)`, `hourPoints(hours)`, `seriesPoints(points, pick)`.
  - `screens/admin/AiUsageCard.tsx`: `AiUsageCard({ usage })`, `durationLabel(ms)`.
  - `navigation/types.ts`: `DrawerParamList.Admin`, `AdminTabsParamList = { Stats: undefined; Reports: undefined }` (el Task 8 le añade `Users`, `Groups`, `Audit`).
  - `AdminScreen` (drawer, pestañas), `StatsTab`, `ReportsTab`.

- [ ] **Step 1: Instalar dependencias (dentro de `mobile/`)**

Run: `cd mobile && npx expo install react-native-gifted-charts react-native-svg expo-linear-gradient expo-print expo-sharing expo-file-system`
Expected: `mobile/package.json` gana `react-native-gifted-charts` (^1.4.78), `react-native-svg` (15.15.4), `expo-linear-gradient` (~57.0.2), `expo-print` (~57.0.2), `expo-sharing` (~57.0.22) y `expo-file-system` (~57.0.7); se actualiza el `package-lock.json` de la raíz. Si el comando añade entradas a `plugins` de `app.json`, se dejan tal cual (no se editan a mano).
Run: `cd mobile && npx expo-doctor`
Expected: sin avisos de versiones incompatibles. (Todos están «Included in Expo Go» en SDK 57: https://docs.expo.dev/versions/v57.0.0/sdk/svg/, …/sdk/print/, …/sdk/sharing/, …/sdk/filesystem/.)

- [ ] **Step 2: Mocks de Jest** — al final de `mobile/jest.setup.ts`:

```ts

// Gráficos (react-native-gifted-charts): un View por gráfico con testID `chart-<tipo>` que conserva `data`,
// para que los tests lean los valores que se dibujarían.
jest.mock('react-native-gifted-charts', () => {
  const { createElement } = require('react');
  const { View } = require('react-native');
  const chart = (kind: string) => (props: { data?: unknown[] }) => createElement(View, { testID: `chart-${kind}`, data: props.data });
  return { BarChart: chart('bar'), LineChart: chart('line') };
});

// Informes: PDF, compartir y archivos. Cada test puede cambiar lo que devuelven (jest.mocked(...).mockResolvedValueOnce).
jest.mock('expo-print', () => ({
  printToFileAsync: jest.fn(async () => ({ uri: 'file:///cache/informe.pdf', numberOfPages: 1 })),
}));
jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn(async () => true),
  shareAsync: jest.fn(async () => undefined),
}));
// File en memoria: `__writes` guarda lo escrito por URI (los tests lo leen con require('expo-file-system').__writes).
jest.mock('expo-file-system', () => {
  const mockWrites = new Map<string, string>();
  class MockFile {
    uri: string;
    constructor(...parts: unknown[]) {
      this.uri = `file:///cache/${String(parts[parts.length - 1])}`;
    }
    get exists() {
      return mockWrites.has(this.uri);
    }
    create = jest.fn();
    write = jest.fn((content: string) => {
      mockWrites.set(this.uri, content);
    });
    delete = jest.fn(() => {
      mockWrites.delete(this.uri);
    });
  }
  return { File: MockFile, Paths: { cache: { uri: 'file:///cache/' } }, __writes: mockWrites };
});
```

- [ ] **Step 3: Escribir los tests que fallan**

`mobile/src/utils/__tests__/reportExport.test.ts`:

```ts
import { makeReport } from '../../testing/adminFixtures';
import { csvCell, reportCsv, reportFileName, reportHtml } from '../reportExport';

it.each<[string | number | null, string]>([
  [5, '5'],
  [null, ''],
  ['Ana', 'Ana'],
  ['a;b', '"a;b"'],
  ['dice "hola"', '"dice ""hola"""'],
  ['=1+1', "'=1+1"],
  ['+51 999', "'+51 999"],
  ['-2', "'-2"],
  ['@x', "'@x"],
])('csvCell(%j) → %j', (value, expected) => {
  expect(csvCell(value)).toBe(expected);
});

it('reportCsv: BOM, «;», \\r\\n y los números del servidor, sección por sección', () => {
  const csv = reportCsv(makeReport());
  expect(csv.startsWith('﻿Informe de HueckoApp\r\n')).toBe(true);
  const lines = csv.slice(1).split('\r\n');
  expect(lines).toContain('Desde;2026-08-31;Hasta;2026-09-29');
  expect(lines).toContain('Usuarios nuevos;3');
  expect(lines).toContain('Éxito de la IA (%);75');
  expect(lines).toContain('Evolución por día');
  expect(lines).toContain('2026-09-28;2;1;1;3');
  expect(lines).toContain('En votación;1');
  expect(lines).toContain('Leer horario de una foto;3;2;67;2100');
  expect(lines).toContain('Ideas de plan;0;0;;');
  expect(lines).toContain('11:00;2');
  expect(lines).toContain('Proyecto Integrador;2');
});

it('reportCsv neutraliza fórmulas en lo que escriben los usuarios (nombres de grupo)', () => {
  const csv = reportCsv(makeReport({ topGroups: [{ id: 'g', name: '=HYPERLINK("http://x")', proposals: 1 }] }));
  expect(csv.split('\r\n')).toContain('"\'=HYPERLINK(""http://x"")";1');
});

it('reportHtml: UTF-8, periodo legible y lo escrito por usuarios escapado', () => {
  const html = reportHtml(makeReport({ topGroups: [{ id: 'g', name: '<script>alert(1)</script>', proposals: 1 }] }));
  expect(html).toContain('<meta charset="utf-8" />');
  expect(html).toContain('Del 31/08/2026 al 29/09/2026');
  expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  expect(html).not.toContain('<script>');
  expect(html).toContain('Evolución por día');
  expect(html).toContain('Leer horario de una foto');
});

it('reportFileName usa los días del periodo', () => {
  expect(reportFileName(makeReport(), 'csv')).toBe('informe-hueckoapp_2026-08-31_2026-09-29.csv');
});
```

`mobile/src/utils/__tests__/shareReport.test.ts`:

```ts
import * as FileSystem from 'expo-file-system';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

import { makeReport } from '../../testing/adminFixtures';
import { reportCsv, reportHtml } from '../reportExport';
import { shareReportCsv, shareReportPdf } from '../shareReport';

const writes = () => (FileSystem as unknown as { __writes: Map<string, string> }).__writes;

beforeEach(() => jest.clearAllMocks());

it('PDF: imprime el HTML del informe en el teléfono y lo comparte como PDF', async () => {
  await shareReportPdf(makeReport());
  expect(Print.printToFileAsync).toHaveBeenCalledWith({ html: reportHtml(makeReport()) });
  expect(Sharing.shareAsync).toHaveBeenCalledWith('file:///cache/informe.pdf', {
    mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: 'Compartir informe',
  });
});

it('CSV: lo escribe en la caché y lo comparte como text/csv', async () => {
  await shareReportCsv(makeReport());
  const uri = 'file:///cache/informe-hueckoapp_2026-08-31_2026-09-29.csv';
  expect(writes().get(uri)).toBe(reportCsv(makeReport()));
  expect(Sharing.shareAsync).toHaveBeenCalledWith(uri, {
    mimeType: 'text/csv', UTI: 'public.comma-separated-values-text', dialogTitle: 'Compartir informe',
  });
});

it('sin compartir disponible: error con mensaje propio y no se comparte', async () => {
  jest.mocked(Sharing.isAvailableAsync).mockResolvedValueOnce(false);
  await expect(shareReportPdf(makeReport())).rejects.toMatchObject({
    code: 'SHARING_UNAVAILABLE', message: 'Este dispositivo no permite compartir archivos.',
  });
  expect(Sharing.shareAsync).not.toHaveBeenCalled();
  // Control positivo: con compartir disponible, sí.
  await shareReportPdf(makeReport());
  expect(Sharing.shareAsync).toHaveBeenCalledTimes(1);
});
```

`mobile/src/screens/admin/__tests__/chartData.test.ts`:

```ts
import { makeHours, makeReport } from '../../../testing/adminFixtures';
import { hourPoints, seriesPoints, statePoints } from '../chartData';

it('hourPoints: 24 barras con etiqueta cada 3 horas', () => {
  const points = hourPoints(makeHours());
  expect(points).toHaveLength(24);
  expect(points[0]).toEqual({ label: '0h', value: 0 });
  expect(points[11]).toEqual({ label: '', value: 2 });
  expect(points[12]).toEqual({ label: '12h', value: 0 });
});

it('seriesPoints: como mucho unas 7 etiquetas', () => {
  const twelve = Array.from({ length: 12 }, (_, i) => ({
    start: `2026-07-${String(13 + i).padStart(2, '0')}`, registrations: i, groupsCreated: 0, proposalsCreated: 0, aiCalls: 0,
  }));
  const points = seriesPoints(twelve, (p) => p.registrations);
  expect(points.map((p) => p.value)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  expect(points.filter((p) => p.label !== '')).toHaveLength(6);
  expect(points[0].label).toBe('13/07');
  expect(seriesPoints(makeReport().timeseries, (p) => p.aiCalls)).toEqual([
    { label: '28/09', value: 3 },
    { label: '29/09', value: 1 },
  ]);
});

it('statePoints en el orden fijo de los estados', () => {
  expect(statePoints({ PROPUESTO: 1, CONFIRMADO: 2, EN_RECOORDINACION: 3, CANCELADO: 4 })).toEqual([
    { label: 'En votación', value: 1 },
    { label: 'Confirmado', value: 2 },
    { label: 'Re-coordinando', value: 3 },
    { label: 'Cancelado', value: 4 },
  ]);
});
```

`mobile/src/screens/admin/__tests__/StatsTab.test.tsx`:

```tsx
import { fireEvent, render, screen, within } from '@testing-library/react-native';

import * as adminApi from '../../../api/admin';
import { ApiError } from '../../../api/client';
import { makePopularHours, makeStats, makeTimeseries } from '../../../testing/adminFixtures';
import { StatsTab } from '../tabs/StatsTab';

jest.mock('../../../api/admin');
jest.mock('../../../utils/clock', () => ({ today: () => new Date(2026, 8, 29, 10, 0) }));
jest.mock('../../../utils/toast', () => ({ showToast: jest.fn() }));
const mocked = adminApi as jest.Mocked<typeof adminApi>;

const values = (id: string, kind: 'bar' | 'line' = 'bar') =>
  within(screen.getByTestId(id)).getByTestId(`chart-${kind}`).props.data.map((p: { value: number }) => p.value);

beforeEach(() => {
  jest.clearAllMocks();
  mocked.getAdminStats.mockResolvedValue(makeStats());
  mocked.getTimeseries.mockResolvedValue(makeTimeseries());
  mocked.getPopularHours.mockResolvedValue(makePopularHours());
});

it('muestra las cifras del servidor, los gráficos con sus datos y el uso de la IA', async () => {
  await render(<StatsTab />);
  expect(await screen.findByLabelText('Usuarios: 4')).toBeTruthy();
  expect(screen.getByLabelText('Suspendidas: 1')).toBeTruthy();
  expect(screen.getByLabelText('Planes confirmados: 1')).toBeTruthy();
  expect(screen.getByText('Éxito: 75 %')).toBeTruthy();
  expect(values('chart-states')).toEqual([1, 1, 0, 1]);
  expect(values('chart-registrations', 'line')).toEqual([2, 1]);
  expect(values('chart-proposals')).toEqual([0, 2]);
  expect(values('chart-hours')).toHaveLength(24);
  expect(values('chart-hours')[11]).toBe(2);
  expect(screen.getByText('Leer horario de una foto')).toBeTruthy();
  expect(screen.getByText('3 · 67 % · 2,1 s')).toBeTruthy();
  expect(screen.getAllByText('0 · —')).toHaveLength(2); // ideas y resumen: sin llamadas, sin duración
});

it('sin planes confirmados, el gráfico de horas explica por qué está vacío', async () => {
  mocked.getPopularHours.mockResolvedValue(makePopularHours({}));
  await render(<StatsTab />);
  expect(await screen.findByText('Todavía no hay planes confirmados.')).toBeTruthy();
  expect(within(screen.getByTestId('chart-hours')).queryByTestId('chart-bar')).toBeNull();
  expect(within(screen.getByTestId('chart-states')).getByTestId('chart-bar')).toBeTruthy(); // control positivo
});

it('si la carga falla, muestra el error y Reintentar vuelve a pedir', async () => {
  mocked.getAdminStats.mockRejectedValueOnce(new ApiError(0, 'NETWORK_ERROR', 'No se pudo conectar con el servidor. Revisa tu conexión.'));
  await render(<StatsTab />);
  expect(await screen.findByText('No se pudo conectar con el servidor. Revisa tu conexión.')).toBeTruthy();
  await fireEvent.press(screen.getByText('Reintentar'));
  expect(await screen.findByLabelText('Usuarios: 4')).toBeTruthy();
});
```

`mobile/src/screens/admin/__tests__/ReportsTab.test.tsx`:

```tsx
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';

import * as adminApi from '../../../api/admin';
import { ApiError } from '../../../api/client';
import { makeReport } from '../../../testing/adminFixtures';
import { shareReportCsv, shareReportPdf } from '../../../utils/shareReport';
import { ReportsTab } from '../tabs/ReportsTab';

jest.mock('../../../api/admin');
jest.mock('../../../utils/shareReport');
jest.mock('../../../utils/clock', () => ({ today: () => new Date(2026, 8, 29, 10, 0) }));
jest.mock('../../../utils/toast', () => ({ showToast: jest.fn() }));
const mocked = adminApi as jest.Mocked<typeof adminApi>;

beforeEach(() => {
  jest.clearAllMocks();
  mocked.getReport.mockResolvedValue(makeReport());
});

const pickDate = async (label: string, date: Date) => {
  await fireEvent.press(screen.getByLabelText(label));
  await fireEvent(screen.getByTestId('datetimepicker-date'), 'change', { type: 'set' }, date);
};

it('arranca con los últimos 30 días y muestra el informe del servidor', async () => {
  await render(<ReportsTab />);
  expect(await screen.findByText('Lun 31/08 – Mar 29/09')).toBeTruthy();
  expect(mocked.getReport).toHaveBeenCalledWith({ from: new Date(2026, 7, 31), to: new Date(2026, 8, 30) });
  expect(screen.getByLabelText('Usuarios nuevos: 3')).toBeTruthy();
  const registrations = within(screen.getByTestId('report-registrations')).getByTestId('chart-line');
  expect(registrations.props.data.map((p: { value: number }) => p.value)).toEqual([2, 1]);
  expect(screen.getByText('Registros por día')).toBeTruthy();
  expect(screen.getByText('Proyecto Integrador')).toBeTruthy();
});

it('«7 días» y «Este semestre» piden su periodo al momento', async () => {
  await render(<ReportsTab />);
  await screen.findByText('Lun 31/08 – Mar 29/09');
  await fireEvent.press(screen.getByText('7 días'));
  await waitFor(() => expect(mocked.getReport).toHaveBeenLastCalledWith({ from: new Date(2026, 8, 23), to: new Date(2026, 8, 30) }));
  await fireEvent.press(screen.getByText('Este semestre'));
  await waitFor(() => expect(mocked.getReport).toHaveBeenLastCalledWith({ from: new Date(2026, 6, 1), to: new Date(2026, 8, 30) }));
});

it('«Personalizado» espera a «Aplicar» y valida las fechas antes de pedir nada', async () => {
  await render(<ReportsTab />);
  await screen.findByText('Lun 31/08 – Mar 29/09');
  await fireEvent.press(screen.getByText('Personalizado'));
  await fireEvent.press(screen.getByText('Aplicar'));
  expect(screen.getByText('Elige la fecha de inicio y la de fin.')).toBeTruthy();

  await pickDate('Desde', new Date(2026, 8, 10));
  await pickDate('Hasta', new Date(2026, 8, 5));
  await fireEvent.press(screen.getByText('Aplicar'));
  expect(screen.getByText('La fecha de inicio no puede ser posterior a la de fin.')).toBeTruthy();
  expect(mocked.getReport).toHaveBeenCalledTimes(1);

  // Control positivo: con un fin posterior sí pide el informe (del 10 al 20, ambos incluidos).
  await pickDate('Hasta', new Date(2026, 8, 20));
  await fireEvent.press(screen.getByText('Aplicar'));
  await waitFor(() => expect(mocked.getReport).toHaveBeenLastCalledWith({ from: new Date(2026, 8, 10), to: new Date(2026, 8, 21) }));
  expect(screen.queryByText('La fecha de inicio no puede ser posterior a la de fin.')).toBeNull();
});

it('Exportar PDF y CSV usan el mismo informe que se ve; un fallo se muestra', async () => {
  jest.mocked(shareReportCsv).mockRejectedValueOnce(new ApiError(0, 'SHARING_UNAVAILABLE', 'Este dispositivo no permite compartir archivos.'));
  await render(<ReportsTab />);
  await fireEvent.press(await screen.findByText('Exportar PDF'));
  expect(shareReportPdf).toHaveBeenCalledWith(makeReport());
  await fireEvent.press(screen.getByText('Exportar CSV'));
  expect(shareReportCsv).toHaveBeenCalledWith(makeReport());
  expect(await screen.findByText('Este dispositivo no permite compartir archivos.')).toBeTruthy();
});
```

- [ ] **Step 4: Ejecutar y ver que fallan**

Run: `cd mobile && npx jest src/utils/__tests__/reportExport.test.ts src/utils/__tests__/shareReport.test.ts src/screens/admin`
Expected: FAIL — no existen los módulos.

- [ ] **Step 5: Componentes**

`mobile/src/components/StatTile.tsx`:

```tsx
import { StyleSheet, Text, View } from 'react-native';

import { colors, typography } from '../theme';

type Props = { label: string; value: string | number; hint?: string };

// Cifra grande con su etiqueta (panel de administración). Dos por fila en la rejilla; se lee como «Usuarios: 4».
export function StatTile({ label, value, hint }: Props) {
  return (
    <View style={styles.tile} accessible accessibilityLabel={`${label}: ${value}`}>
      <Text style={[typography.headlineSmall, { color: colors.onSurface }]}>{value}</Text>
      <Text style={[typography.labelMedium, { color: colors.onSurfaceVariant }]}>{label}</Text>
      {hint ? <Text style={[typography.bodySmall, { color: colors.onSurfaceVariant }]}>{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  tile: { flexBasis: '47%', flexGrow: 1, gap: 2, padding: 12, borderRadius: 12, backgroundColor: colors.surfaceContainerLow },
});
```

`mobile/src/components/ChartCard.tsx`:

```tsx
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { BarChart, LineChart } from 'react-native-gifted-charts';

import { colors, typography } from '../theme';
import { HueckoCard } from './HueckoCard';

export type ChartPoint = { label: string; value: number };

type Props = {
  title: string;
  data: readonly ChartPoint[];
  kind?: 'bar' | 'line';
  color?: string;
  emptyText?: string;
  testID?: string;
};

const CHART_HEIGHT = 160;
// Márgenes de la pantalla (16 + 16), relleno de la tarjeta (16 + 16) y el eje Y (~36).
const HORIZONTAL_CHROME = 100;

/**
 * Único punto de contacto con react-native-gifted-charts (D11): las pantallas pasan puntos { label, value }
 * ya calculados por el servidor. El lector de pantalla recibe los mismos datos como texto.
 */
export function ChartCard({ title, data, kind = 'bar', color = colors.primary, emptyText = 'Sin datos en este periodo.', testID }: Props) {
  const { width } = useWindowDimensions();
  const chartWidth = Math.max(160, width - HORIZONTAL_CHROME);
  const empty = data.every((p) => p.value === 0);
  const slot = chartWidth / Math.max(1, data.length);
  const barWidth = Math.max(4, Math.min(28, slot * 0.6));
  const spacing = Math.max(2, slot - barWidth);
  const axisText = { ...typography.labelSmall, color: colors.onSurfaceVariant };
  const points = data.map((p) => ({ value: p.value, label: p.label, frontColor: color }));
  const summary = `${title}. ${data.map((p, i) => `${p.label || i + 1}: ${p.value}`).join(', ')}`;

  return (
    <HueckoCard>
      <View testID={testID} accessible accessibilityLabel={summary} style={styles.body}>
        <Text style={[typography.titleMedium, { color: colors.onSurface }]}>{title}</Text>
        {empty ? (
          <Text style={[typography.bodyMedium, { color: colors.onSurfaceVariant }]}>{emptyText}</Text>
        ) : kind === 'bar' ? (
          <BarChart
            data={points}
            width={chartWidth}
            height={CHART_HEIGHT}
            barWidth={barWidth}
            spacing={spacing}
            initialSpacing={spacing / 2}
            noOfSections={4}
            yAxisThickness={0}
            xAxisThickness={1}
            xAxisColor={colors.outlineVariant}
            yAxisTextStyle={axisText}
            xAxisLabelTextStyle={axisText}
            disableScroll
            isAnimated
          />
        ) : (
          <LineChart
            data={points}
            width={chartWidth}
            height={CHART_HEIGHT}
            color={color}
            dataPointsColor={color}
            thickness={2}
            noOfSections={4}
            yAxisThickness={0}
            xAxisThickness={1}
            xAxisColor={colors.outlineVariant}
            yAxisTextStyle={axisText}
            xAxisLabelTextStyle={axisText}
            adjustToWidth
            disableScroll
            isAnimated
          />
        )}
      </View>
    </HueckoCard>
  );
}

const styles = StyleSheet.create({
  body: { gap: 12 },
});
```

En `mobile/src/components/index.ts`, al final:

```ts
export { ChartCard, type ChartPoint } from './ChartCard';
export { StatTile } from './StatTile';
```

- [ ] **Step 6: Exportar el informe**

`mobile/src/utils/reportExport.ts`:

```ts
import type { AdminReport } from '@hueckoapp/shared';

import { AI_TASK_LABEL, PROPOSAL_STATE_ORDER, percentLabel } from './admin';
import { formatDateTime } from './days';
import { STATE_BADGE } from './proposals';

type Cell = string | number | null;

const pad2 = (n: number) => String(n).padStart(2, '0');
const hourLabel = (hour: number) => `${pad2(hour)}:00`;
// «2026-08-31» → «31/08/2026».
const dmy = (key: string) => key.split('-').reverse().join('/');

export const reportFileName = (report: AdminReport, ext: 'csv' | 'pdf') =>
  `informe-hueckoapp_${report.period.fromDate}_${report.period.toDate}.${ext}`;

// ---- CSV (D13) ----

const FORMULA_START = /^[=+\-@]/;

/** Una celda: apóstrofo delante de lo que Excel tomaría por fórmula y comillas si lleva «;», comillas o saltos de línea. */
export function csvCell(value: Cell): string {
  if (value === null) return '';
  if (typeof value === 'number') return String(value);
  const safe = FORMULA_START.test(value) ? `'${value}` : value;
  return /[;"\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

const csvRow = (cells: readonly Cell[]) => cells.map(csvCell).join(';');

/** CSV para Excel en español: «;» como separador, BOM UTF-8 (tildes) y \r\n. Una sección por bloque del informe. */
export function reportCsv(report: AdminReport): string {
  const { period, summary } = report;
  const rows: Cell[][] = [
    ['Informe de HueckoApp'],
    ['Desde', period.fromDate, 'Hasta', period.toDate],
    ['Generado (UTC)', report.generatedAt],
    [],
    ['Resumen'],
    ['Indicador', 'Valor'],
    ['Usuarios nuevos', summary.newUsers],
    ['Grupos nuevos', summary.newGroups],
    ['Propuestas nuevas', summary.newProposals],
    ['Planes confirmados', summary.confirmedPlans],
    ['Incidencias', summary.incidences],
    ['Llamadas a la IA', summary.aiCalls],
    ['Éxito de la IA (%)', report.ai.successRate],
    [],
    [report.bucket === 'day' ? 'Evolución por día' : 'Evolución por semana'],
    ['Inicio', 'Registros', 'Grupos creados', 'Propuestas creadas', 'Llamadas a la IA'],
    ...report.timeseries.map((p) => [p.start, p.registrations, p.groupsCreated, p.proposalsCreated, p.aiCalls]),
    [],
    ['Propuestas del periodo por estado'],
    ['Estado', 'Cantidad'],
    ...PROPOSAL_STATE_ORDER.map((s) => [STATE_BADGE[s].text, report.proposalsByState[s]]),
    [],
    ['Uso de la IA por función'],
    ['Función', 'Llamadas', 'Correctas', 'Éxito (%)', 'Duración media (ms)'],
    ...report.ai.byTask.map((t) => [AI_TASK_LABEL[t.task], t.calls, t.ok, t.successRate, t.avgDurationMs]),
    [],
    ['Hora de inicio de los planes confirmados'],
    ['Hora', 'Planes'],
    ...report.popularHours.map((h) => [hourLabel(h.hour), h.count]),
    [],
    ['Grupos con más propuestas'],
    ['Grupo', 'Propuestas'],
    ...report.topGroups.map((g) => [g.name, g.proposals]),
  ];
  return `﻿${rows.map(csvRow).join('\r\n')}\r\n`;
}

// ---- HTML → PDF con expo-print (D13) ----

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const escapeHtml = (text: string) => text.replace(/[&<>"']/g, (c) => ESCAPES[c]);

const htmlTable = (headers: readonly string[], rows: readonly Cell[][]) =>
  `<table><thead><tr>${headers.map((h) => `<th>${escapeHtml(h)}</th>`).join('')}</tr></thead><tbody>${rows
    .map((r) => `<tr>${r.map((c) => `<td>${c === null ? '—' : escapeHtml(String(c))}</td>`).join('')}</tr>`)
    .join('')}</tbody></table>`;

// Barras horizontales con CSS (sin imágenes ni SVG): se imprimen igual en Android e iOS.
function htmlBars(rows: readonly { label: string; value: number }[]): string {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return `<table class="bars"><tbody>${rows
    .map(
      (r) =>
        `<tr><td class="label">${escapeHtml(r.label)}</td><td class="bar"><div style="width:${Math.round((r.value * 100) / max)}%"></div></td><td class="num">${r.value}</td></tr>`,
    )
    .join('')}</tbody></table>`;
}

export function reportHtml(report: AdminReport): string {
  const { period, summary } = report;
  const tiles: [string, string | number][] = [
    ['Usuarios nuevos', summary.newUsers],
    ['Grupos nuevos', summary.newGroups],
    ['Propuestas nuevas', summary.newProposals],
    ['Planes confirmados', summary.confirmedPlans],
    ['Incidencias', summary.incidences],
    ['Llamadas a la IA', `${summary.aiCalls} (éxito ${percentLabel(report.ai.successRate)})`],
  ];
  const activeHours = report.popularHours.filter((h) => h.count > 0);
  return `<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Informe de HueckoApp</title>
<style>
  body { font-family: -apple-system, Roboto, 'Segoe UI', sans-serif; color: #1D1B20; margin: 24px; font-size: 12px; }
  h1 { color: #6750A4; font-size: 22px; margin: 0 0 4px; }
  h2 { font-size: 15px; margin: 20px 0 8px; border-bottom: 1px solid #CAC4D0; padding-bottom: 4px; }
  .muted { color: #49454F; }
  .tiles { display: flex; flex-wrap: wrap; gap: 8px; }
  .tile { flex: 1 0 28%; background: #F3EDF7; border-radius: 8px; padding: 8px; }
  .tile b { display: block; font-size: 18px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { text-align: left; padding: 4px 6px; border-bottom: 1px solid #ECE6F0; }
  .bars td.label { width: 30%; } .bars td.num { width: 10%; text-align: right; }
  .bars td.bar div { height: 10px; background: #6750A4; border-radius: 3px; min-width: 1px; }
</style></head><body>
<h1>Informe de HueckoApp</h1>
<p class="muted">Del ${dmy(period.fromDate)} al ${dmy(period.toDate)} · generado el ${escapeHtml(formatDateTime(new Date(report.generatedAt)))}</p>
<h2>Resumen</h2>
<div class="tiles">${tiles.map(([label, value]) => `<div class="tile"><b>${escapeHtml(String(value))}</b>${escapeHtml(label)}</div>`).join('')}</div>
<h2>${report.bucket === 'day' ? 'Evolución por día' : 'Evolución por semana'}</h2>
${htmlTable(
  ['Inicio', 'Registros', 'Grupos creados', 'Propuestas creadas', 'Llamadas a la IA'],
  report.timeseries.map((p) => [dmy(p.start), p.registrations, p.groupsCreated, p.proposalsCreated, p.aiCalls]),
)}
<h2>Propuestas del periodo por estado</h2>
${htmlBars(PROPOSAL_STATE_ORDER.map((s) => ({ label: STATE_BADGE[s].text, value: report.proposalsByState[s] })))}
<h2>Uso de la IA por función</h2>
${htmlTable(
  ['Función', 'Llamadas', 'Correctas', 'Éxito', 'Duración media'],
  report.ai.byTask.map((t) => [AI_TASK_LABEL[t.task], t.calls, t.ok, percentLabel(t.successRate), t.avgDurationMs === null ? null : `${t.avgDurationMs} ms`]),
)}
<h2>Hora de inicio de los planes confirmados</h2>
${activeHours.length > 0 ? htmlBars(activeHours.map((h) => ({ label: hourLabel(h.hour), value: h.count }))) : '<p class="muted">Ningún plan confirmado en este periodo.</p>'}
<h2>Grupos con más propuestas</h2>
${report.topGroups.length > 0 ? htmlTable(['Grupo', 'Propuestas'], report.topGroups.map((g) => [g.name, g.proposals])) : '<p class="muted">Ningún grupo creó propuestas en este periodo.</p>'}
</body></html>`;
}
```

`mobile/src/utils/shareReport.ts`:

```ts
import type { AdminReport } from '@hueckoapp/shared';
import { File, Paths } from 'expo-file-system';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

import { ApiError } from '../api/client';
import { reportCsv, reportFileName, reportHtml } from './reportExport';

// ApiError con código propio (status 0) para que useAction muestre este mensaje (errorMessage solo lee ApiError).
const sharingUnavailable = () => new ApiError(0, 'SHARING_UNAVAILABLE', 'Este dispositivo no permite compartir archivos.');

async function share(uri: string, mimeType: string, UTI: string) {
  if (!(await Sharing.isAvailableAsync())) throw sharingUnavailable();
  await Sharing.shareAsync(uri, { mimeType, UTI, dialogTitle: 'Compartir informe' });
}

/** PDF generado en el teléfono a partir del HTML del informe (expo-print) y compartido (D13). */
export async function shareReportPdf(report: AdminReport): Promise<void> {
  const { uri } = await Print.printToFileAsync({ html: reportHtml(report) });
  await share(uri, 'application/pdf', 'com.adobe.pdf');
}

/** CSV escrito en la caché de la app (expo-file-system) y compartido. Si ya existía, se sobrescribe. */
export async function shareReportCsv(report: AdminReport): Promise<void> {
  const file = new File(Paths.cache, reportFileName(report, 'csv'));
  file.create({ overwrite: true });
  file.write(reportCsv(report));
  await share(file.uri, 'text/csv', 'public.comma-separated-values-text');
}
```

- [ ] **Step 7: Datos de los gráficos y tarjeta de IA**

`mobile/src/screens/admin/chartData.ts`:

```ts
import type { HourCount, ProposalCounts, TimeseriesPoint } from '@hueckoapp/shared';

import type { ChartPoint } from '../../components';
import { PROPOSAL_STATE_ORDER, shortDayLabel } from '../../utils/admin';
import { STATE_BADGE } from '../../utils/proposals';

// Solo da forma a los números del servidor para el gráfico: no calcula nada.
export const statePoints = (counts: ProposalCounts): ChartPoint[] =>
  PROPOSAL_STATE_ORDER.map((s) => ({ label: STATE_BADGE[s].text, value: counts[s] }));

// 24 barras: etiqueta cada 3 horas para que se lean.
export const hourPoints = (hours: readonly HourCount[]): ChartPoint[] =>
  hours.map((h) => ({ label: h.hour % 3 === 0 ? `${h.hour}h` : '', value: h.count }));

// Como mucho unas 7 etiquetas en el eje X; el resto de puntos va sin etiqueta.
export function seriesPoints(points: readonly TimeseriesPoint[], pick: (p: TimeseriesPoint) => number): ChartPoint[] {
  const every = Math.max(1, Math.ceil(points.length / 7));
  return points.map((p, i) => ({ label: i % every === 0 ? shortDayLabel(p.start) : '', value: pick(p) }));
}
```

`mobile/src/screens/admin/AiUsageCard.tsx`:

```tsx
import type { AiUsage } from '@hueckoapp/shared';
import { StyleSheet, Text, View } from 'react-native';

import { HueckoCard } from '../../components';
import { colors, typography } from '../../theme';
import { AI_TASK_LABEL, percentLabel } from '../../utils/admin';

/** «2,1 s» (coma decimal). */
export const durationLabel = (ms: number) => `${(ms / 1000).toFixed(1).replace('.', ',')} s`;

// Llamadas, % de éxito y duración media por función de la IA (Estadísticas e Informes).
export function AiUsageCard({ usage }: { usage: AiUsage }) {
  return (
    <HueckoCard>
      <View style={styles.body}>
        <Text style={[typography.titleMedium, { color: colors.onSurface }]}>Uso de la IA por función</Text>
        <Text style={[typography.bodySmall, { color: colors.onSurfaceVariant }]}>
          {`${usage.calls} llamadas · éxito ${percentLabel(usage.successRate)}`}
        </Text>
        {usage.byTask.map((t) => (
          <View key={t.task} style={styles.row}>
            <Text style={[typography.bodyMedium, styles.flex, { color: colors.onSurface }]}>{AI_TASK_LABEL[t.task]}</Text>
            <Text style={[typography.labelMedium, { color: colors.onSurfaceVariant }]}>
              {`${t.calls} · ${percentLabel(t.successRate)}${t.avgDurationMs === null ? '' : ` · ${durationLabel(t.avgDurationMs)}`}`}
            </Text>
          </View>
        ))}
      </View>
    </HueckoCard>
  );
}

const styles = StyleSheet.create({
  body: { gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  flex: { flex: 1 },
});
```

- [ ] **Step 8: Pestañas**

`mobile/src/screens/admin/tabs/StatsTab.tsx`:

```tsx
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { ChartCard, LoadState, StatTile } from '../../../components';
import { STATS_WEEKS, useAdminStats } from '../../../hooks/useAdminStats';
import { useRefreshErrorToast } from '../../../hooks/useRefreshErrorToast';
import { colors } from '../../../theme';
import { percentLabel } from '../../../utils/admin';
import { AiUsageCard } from '../AiUsageCard';
import { hourPoints, seriesPoints, statePoints } from '../chartData';

// «Estadísticas»: totales de ahora, las últimas 12 semanas y las horas de los planes. Todo viene calculado del servidor.
export function StatsTab() {
  const { stats, weekly, hours, loaded, loading, refreshing, error, failedLoads, reload } = useAdminStats();
  useRefreshErrorToast(error, loaded, failedLoads);

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void reload()} colors={[colors.primary]} />}
    >
      <LoadState loading={loading} error={error} hasData={loaded} onRetry={() => void reload()}>
        {stats && weekly && hours ? (
          <>
            <View style={styles.tiles}>
              <StatTile label="Usuarios" value={stats.users.total} />
              <StatTile label="Cuentas activas" value={stats.users.active} />
              <StatTile label="Suspendidas" value={stats.users.suspended} />
              <StatTile label="Administradores" value={stats.users.admins} />
              <StatTile label="Grupos" value={stats.groups} />
              <StatTile label="Planes confirmados" value={stats.confirmedPlans} />
              <StatTile label="Incidencias" value={stats.incidences} />
              <StatTile label="Llamadas a la IA" value={stats.ai.calls} hint={`Éxito: ${percentLabel(stats.ai.successRate)}`} />
            </View>
            <ChartCard testID="chart-states" title="Propuestas por estado" data={statePoints(stats.proposals)} />
            <ChartCard
              testID="chart-registrations"
              kind="line"
              title={`Registros por semana (últimas ${STATS_WEEKS})`}
              data={seriesPoints(weekly.points, (p) => p.registrations)}
            />
            <ChartCard
              testID="chart-proposals"
              title="Propuestas creadas por semana"
              color={colors.tertiary}
              data={seriesPoints(weekly.points, (p) => p.proposalsCreated)}
            />
            <ChartCard
              testID="chart-hours"
              title="Hora de inicio de los planes confirmados"
              color={colors.secondary}
              emptyText="Todavía no hay planes confirmados."
              data={hourPoints(hours.hours)}
            />
            <AiUsageCard usage={stats.ai} />
          </>
        ) : null}
      </LoadState>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: colors.surface },
  content: { padding: 16, gap: 12 },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
```

`mobile/src/screens/admin/tabs/ReportsTab.tsx`:

```tsx
import type { TopGroup } from '@hueckoapp/shared';
import { useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { DateRange } from '../../../api/admin';
import {
  ChartCard, ChoiceChip, DateTimeField, ErrorBanner, HueckoCard, LoadState, PrimaryButton, SecondaryButton, StatTile,
} from '../../../components';
import { useAction } from '../../../hooks/useAction';
import { useAdminReport } from '../../../hooks/useAdminReport';
import { useRefreshErrorToast } from '../../../hooks/useRefreshErrorToast';
import { colors, typography } from '../../../theme';
import { customRange, percentLabel, periodLabel, presetRange, RANGE_PRESETS, type RangePreset } from '../../../utils/admin';
import { today } from '../../../utils/clock';
import { shareReportCsv, shareReportPdf } from '../../../utils/shareReport';
import { AiUsageCard } from '../AiUsageCard';
import { hourPoints, seriesPoints, statePoints } from '../chartData';

function TopGroupsCard({ groups }: { groups: readonly TopGroup[] }) {
  return (
    <HueckoCard>
      <View style={styles.cardBody}>
        <Text style={[typography.titleMedium, { color: colors.onSurface }]}>Grupos con más propuestas</Text>
        {groups.length === 0 ? (
          <Text style={[typography.bodyMedium, { color: colors.onSurfaceVariant }]}>Ningún grupo creó propuestas en este periodo.</Text>
        ) : (
          groups.map((g) => (
            <View key={g.id} style={styles.row}>
              <Text style={[typography.bodyMedium, styles.flex, { color: colors.onSurface }]}>{g.name}</Text>
              <Text style={[typography.labelMedium, { color: colors.onSurfaceVariant }]}>{g.proposals}</Text>
            </View>
          ))
        )}
      </View>
    </HueckoCard>
  );
}

// «Informes»: el periodo se elige aquí; las cifras, el PDF y el CSV salen del mismo AdminReport del servidor.
export function ReportsTab() {
  const [preset, setPreset] = useState<RangePreset>('30d');
  const [custom, setCustom] = useState<{ from: Date | null; to: Date | null }>({ from: null, to: null });
  const [applied, setApplied] = useState<DateRange>(() => presetRange('30d', today()));
  const [rangeError, setRangeError] = useState<string | null>(null);
  const { report, loaded, loading, refreshing, error, failedLoads, reload } = useAdminReport(applied);
  useRefreshErrorToast(error, loaded, failedLoads);
  const pdf = useAction(shareReportPdf);
  const csv = useAction(shareReportCsv);

  const choose = (next: RangePreset) => {
    setPreset(next);
    setRangeError(null);
    if (next !== 'custom') setApplied(presetRange(next, today())); // «Personalizado» espera a «Aplicar»
  };

  const applyCustom = () => {
    const result = customRange(custom.from, custom.to);
    if (!result.ok) {
      setRangeError(result.error);
      return;
    }
    setRangeError(null);
    setApplied(result.range);
  };

  const byBucket = (day: string, week: string) => (report?.bucket === 'week' ? week : day);
  const exportError = pdf.error ?? csv.error;

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void reload()} colors={[colors.primary]} />}
    >
      <View style={styles.chips}>
        {RANGE_PRESETS.map((p) => (
          <ChoiceChip key={p.key} label={p.label} selected={preset === p.key} onPress={() => choose(p.key)} />
        ))}
      </View>
      {preset === 'custom' ? (
        <View style={styles.custom}>
          <DateTimeField label="Desde" mode="date" value={custom.from} onChange={(from) => setCustom((c) => ({ ...c, from }))} />
          <DateTimeField
            label="Hasta"
            mode="date"
            value={custom.to}
            onChange={(to) => setCustom((c) => ({ ...c, to }))}
            error={rangeError ?? undefined}
          />
          <PrimaryButton title="Aplicar" icon="check" onPress={applyCustom} />
        </View>
      ) : null}
      <LoadState loading={loading} error={error} hasData={loaded} onRetry={() => void reload()}>
        {report ? (
          <>
            <Text accessibilityRole="header" style={[typography.titleLarge, { color: colors.onSurface }]}>
              {periodLabel(report.period.fromDate, report.period.toDate)}
            </Text>
            <View style={styles.tiles}>
              <StatTile label="Usuarios nuevos" value={report.summary.newUsers} />
              <StatTile label="Grupos nuevos" value={report.summary.newGroups} />
              <StatTile label="Propuestas nuevas" value={report.summary.newProposals} />
              <StatTile label="Planes confirmados" value={report.summary.confirmedPlans} />
              <StatTile label="Incidencias" value={report.summary.incidences} />
              <StatTile label="Llamadas a la IA" value={report.summary.aiCalls} hint={`Éxito: ${percentLabel(report.ai.successRate)}`} />
            </View>
            <ChartCard
              testID="report-registrations"
              kind="line"
              title={byBucket('Registros por día', 'Registros por semana')}
              data={seriesPoints(report.timeseries, (p) => p.registrations)}
            />
            <ChartCard
              testID="report-proposals"
              title={byBucket('Propuestas creadas por día', 'Propuestas creadas por semana')}
              color={colors.tertiary}
              data={seriesPoints(report.timeseries, (p) => p.proposalsCreated)}
            />
            <ChartCard testID="report-states" title="Propuestas del periodo por estado" data={statePoints(report.proposalsByState)} />
            <ChartCard
              testID="report-hours"
              title="Hora de inicio de los planes confirmados"
              color={colors.secondary}
              emptyText="Ningún plan confirmado en este periodo."
              data={hourPoints(report.popularHours)}
            />
            <AiUsageCard usage={report.ai} />
            <TopGroupsCard groups={report.topGroups} />
            {exportError ? <ErrorBanner message={exportError} /> : null}
            <View style={styles.actions}>
              <SecondaryButton title="Exportar CSV" icon="grid-on" style={styles.flex} disabled={csv.loading} onPress={() => void csv.run(report)} />
              <PrimaryButton title="Exportar PDF" icon="picture-as-pdf" style={styles.flex} loading={pdf.loading} onPress={() => void pdf.run(report)} />
            </View>
          </>
        ) : null}
      </LoadState>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: colors.surface },
  content: { padding: 16, gap: 12 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  custom: { gap: 12 },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  cardBody: { gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  actions: { flexDirection: 'row', gap: 10 },
  flex: { flex: 1 },
});
```

- [ ] **Step 9: Navegación**

En `mobile/src/navigation/types.ts`:
- `DrawerParamList`: añadir `Admin: undefined;` entre `Groups: undefined;` y `Profile: undefined;`.
- Debajo de `export type GroupTabsParamList = …;` añadir:

```ts

// Pestañas del panel de administración (solo rol ADMIN).
export type AdminTabsParamList = { Stats: undefined; Reports: undefined };
```

`mobile/src/screens/admin/AdminScreen.tsx`:

```tsx
import { createMaterialTopTabNavigator } from '@react-navigation/material-top-tabs';

import type { AdminTabsParamList, DrawerScreen } from '../../navigation/types';
import { colors, typography } from '../../theme';
import { ReportsTab } from './tabs/ReportsTab';
import { StatsTab } from './tabs/StatsTab';

const Tabs = createMaterialTopTabNavigator<AdminTabsParamList>();

// Panel «Administración» (D12): pestañas desplazables, con el mismo estilo que el detalle de un grupo.
// Solo aparece en el drawer con rol ADMIN; el servidor lo vuelve a comprobar en cada petición (403 NOT_ADMIN).
export function AdminScreen(_props: DrawerScreen<'Admin'>) {
  return (
    <Tabs.Navigator
      screenOptions={{
        tabBarScrollEnabled: true,
        tabBarItemStyle: { width: 'auto', minWidth: 110 },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.onSurfaceVariant,
        tabBarIndicatorStyle: { backgroundColor: colors.primary },
        tabBarStyle: { backgroundColor: colors.surface },
        tabBarLabelStyle: { ...typography.labelLarge, textTransform: 'none' },
        sceneStyle: { backgroundColor: colors.surface },
      }}
    >
      <Tabs.Screen name="Stats" component={StatsTab} options={{ title: 'Estadísticas' }} />
      <Tabs.Screen name="Reports" component={ReportsTab} options={{ title: 'Informes' }} />
    </Tabs.Navigator>
  );
}
```

En `mobile/src/navigation/AppDrawer.tsx`:
- Imports: añadir `import { AdminScreen } from '../screens/admin/AdminScreen';` y `import { canSeeAdmin } from '../utils/admin';`
- En `AppDrawer()`, primera línea: `const { user } = useAuth();`
- Entre la `Drawer.Screen` de `Groups` y la de `Profile`:

```tsx
      {canSeeAdmin(user) ? (
        <Drawer.Screen
          name="Admin"
          component={AdminScreen}
          options={{ title: 'Administración', drawerIcon: icon('admin-panel-settings') }}
        />
      ) : null}
```

- [ ] **Step 10: Verificar**

Run: `cd mobile && npx jest src/utils/__tests__/reportExport.test.ts src/utils/__tests__/shareReport.test.ts src/screens/admin`
Expected: PASS.
Run (raíz): `npm run typecheck` y `npm test` → verde.
Prueba manual en Expo Go (backend con `npm run seed -w backend`): entrar con `admin@test.com` → el drawer muestra «Administración»; «Estadísticas» dibuja barras y líneas; «Informes» → «Exportar PDF» abre la hoja de compartir con un PDF legible (tildes bien) y «Exportar CSV» con un `.csv` que Excel abre en columnas. Con `test@test.com` el ítem no aparece.

- [ ] **Step 11: Commit**

```bash
git add mobile/package.json package-lock.json mobile/jest.setup.ts mobile/src/components/ChartCard.tsx mobile/src/components/StatTile.tsx \
  mobile/src/components/index.ts mobile/src/utils/reportExport.ts mobile/src/utils/shareReport.ts \
  mobile/src/screens/admin/chartData.ts mobile/src/screens/admin/AiUsageCard.tsx mobile/src/screens/admin/AdminScreen.tsx \
  mobile/src/screens/admin/tabs/StatsTab.tsx mobile/src/screens/admin/tabs/ReportsTab.tsx \
  mobile/src/navigation/types.ts mobile/src/navigation/AppDrawer.tsx \
  mobile/src/utils/__tests__/reportExport.test.ts mobile/src/utils/__tests__/shareReport.test.ts \
  mobile/src/screens/admin/__tests__/chartData.test.ts mobile/src/screens/admin/__tests__/StatsTab.test.tsx \
  mobile/src/screens/admin/__tests__/ReportsTab.test.tsx
# Solo si `npx expo install` modificó app.json:
git add mobile/app.json
GIT_AUTHOR_NAME="Aless Bustamante" GIT_AUTHOR_EMAIL="fabrizio.bs9012@gmail.com" \
GIT_COMMITTER_NAME="Aless Bustamante" GIT_COMMITTER_EMAIL="fabrizio.bs9012@gmail.com" \
git commit -m "feat(mobile): panel de administración con estadísticas, informes y exportación a PDF y CSV" -m "Co-Authored-By: <modelo que implementa> <noreply@anthropic.com>"
```

---

### Task 8: Mobile — Usuarios, Grupos y Registro; detalles con acciones y moderación; README

**Files:**
- Create: `mobile/src/screens/admin/SearchRow.tsx`, `mobile/src/screens/admin/Pager.tsx`, `mobile/src/screens/admin/tabs/UsersTab.tsx`, `mobile/src/screens/admin/tabs/GroupsTab.tsx`, `mobile/src/screens/admin/tabs/AuditTab.tsx`, `mobile/src/screens/admin/AdminUserDetailScreen.tsx`, `mobile/src/screens/admin/AdminGroupDetailScreen.tsx`, `mobile/src/screens/admin/CancelProposalDialog.tsx`
- Modify (reemplazo completo): `mobile/src/screens/admin/AdminScreen.tsx`
- Modify: `mobile/src/navigation/types.ts`, `mobile/src/navigation/RootNavigator.tsx`, `README.md`
- Test: `mobile/src/screens/admin/__tests__/UsersTab.test.tsx`, `GroupsTab.test.tsx`, `AuditTab.test.tsx`, `AdminUserDetailScreen.test.tsx`, `AdminGroupDetailScreen.test.tsx`

**Interfaces:**
- Consumes: `useAdminUsers`, `useAdminGroups`, `useAdminAudit`, `useAdminUser`, `useAdminGroup` (Task 6); `ActionResult` (`hooks/useAction`); `useRefreshOnFocus`, `useRefreshErrorToast`, `useAuth`; `utils/admin` (`ROLE_LABEL`, `STATUS_LABEL`, `AUDIT_ACTION_LABEL`, `auditAuthor`, `auditTarget`, `auditReason`, `countLabel`); `memberCountLabel` (`utils/groups`), `voteCountLabel` (`utils/proposals`), `formatDateTime`, `formatDateLabel`, `toDateKey` (`utils/days`); componentes existentes y `StatTile` (Task 7); `StatsTab`, `ReportsTab` (Task 7).
- Produces:
  - `navigation/types.ts`: `AdminTabsParamList = { Stats; Reports; Users; Groups; Audit }` (todas `undefined`); `AppStackParamList.AdminUserDetail: { userId: string; name: string }` y `AdminGroupDetail: { groupId: string; name: string }`.
  - `UsersTab({ onOpen: (user: AdminUserSummary) => void })`, `GroupsTab({ onOpen: (group: AdminGroupSummary) => void })`, `AuditTab()`.
  - `Pager({ page, pageCount, hasPrev, hasNext, onPrev, onNext })` (no se pinta con una sola página), `SearchRow({ value, onChangeText, onSearch, placeholder, accessibilityLabel })`.
  - `AdminUserDetailScreen`, `AdminGroupDetailScreen` (pantallas del `AppStack`), `CancelProposalDialog({ proposal, loading, error, onConfirm(reason), onDismiss })`.

- [ ] **Step 1: Escribir los tests que fallan**

`mobile/src/screens/admin/__tests__/UsersTab.test.tsx`:

```tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import * as adminApi from '../../../api/admin';
import { makeUserSummary, page } from '../../../testing/adminFixtures';
import { UsersTab } from '../tabs/UsersTab';

jest.mock('../../../api/admin');
jest.mock('../../../hooks/useRefreshOnFocus', () => ({ useRefreshOnFocus: jest.fn() }));
jest.mock('../../../utils/toast', () => ({ showToast: jest.fn() }));
const mocked = adminApi as jest.Mocked<typeof adminApi>;

beforeEach(() => jest.clearAllMocks());

it('lista las cuentas con sus marcas, busca y abre el detalle', async () => {
  const onOpen = jest.fn();
  mocked.listAdminUsers.mockResolvedValue(
    page([
      makeUserSummary(),
      makeUserSummary({ id: 'u9', name: 'Administración HueckoApp', email: 'admin@test.com', role: 'ADMIN' }),
      makeUserSummary({ id: 'u3', name: 'Carlos', email: 'carlos@test.com', status: 'SUSPENDED' }),
    ]),
  );
  await render(<UsersTab onOpen={onOpen} />);
  expect(await screen.findByText('Ana')).toBeTruthy();
  expect(screen.getByText('3 cuentas')).toBeTruthy();
  expect(screen.getByText('Administrador')).toBeTruthy();
  expect(screen.getByText('Suspendida')).toBeTruthy();
  expect(screen.queryByText('Página 1 de 1')).toBeNull(); // una sola página: sin paginador

  await fireEvent.changeText(screen.getByLabelText('Buscar usuarios'), ' carlos ');
  await fireEvent.press(screen.getByText('Buscar'));
  await waitFor(() => expect(mocked.listAdminUsers).toHaveBeenLastCalledWith('carlos', 1));
  await fireEvent.press(await screen.findByText('Ana'));
  expect(onOpen).toHaveBeenCalledWith(makeUserSummary());
});

it('con varias páginas, «Siguiente» pide la 2; sin resultados lo dice con el texto buscado', async () => {
  mocked.listAdminUsers
    .mockResolvedValueOnce(page([makeUserSummary()], { total: 45 }))
    .mockResolvedValueOnce(page([makeUserSummary({ id: 'u5', name: 'Eva' })], { page: 2, total: 45 }))
    .mockResolvedValueOnce(page([], { total: 0 }));
  await render(<UsersTab onOpen={jest.fn()} />);
  expect(await screen.findByText('Página 1 de 3')).toBeTruthy();
  await fireEvent.press(screen.getByText('Siguiente'));
  expect(await screen.findByText('Eva')).toBeTruthy();
  expect(mocked.listAdminUsers).toHaveBeenLastCalledWith('', 2);
  expect(screen.getByText('Página 2 de 3')).toBeTruthy();
  await fireEvent.changeText(screen.getByLabelText('Buscar usuarios'), 'zzz');
  await fireEvent(screen.getByLabelText('Buscar usuarios'), 'submitEditing');
  expect(await screen.findByText('Ninguna cuenta coincide con «zzz».')).toBeTruthy();
});
```

`mobile/src/screens/admin/__tests__/GroupsTab.test.tsx`:

```tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import * as adminApi from '../../../api/admin';
import { makeGroupSummary, page } from '../../../testing/adminFixtures';
import { GroupsTab } from '../tabs/GroupsTab';

jest.mock('../../../api/admin');
jest.mock('../../../hooks/useRefreshOnFocus', () => ({ useRefreshOnFocus: jest.fn() }));
jest.mock('../../../utils/toast', () => ({ showToast: jest.fn() }));
const mocked = adminApi as jest.Mocked<typeof adminApi>;

beforeEach(() => jest.clearAllMocks());

it('cada grupo con miembros, propuestas y quién lo administra; busca y abre el detalle', async () => {
  const onOpen = jest.fn();
  mocked.listAdminGroups.mockResolvedValue(page([makeGroupSummary(), makeGroupSummary({ id: 'g2', name: 'Sin gente', memberCount: 0, proposalCount: 0, owner: null })]));
  await render(<GroupsTab onOpen={onOpen} />);
  expect(await screen.findByText('Proyecto Integrador')).toBeTruthy();
  expect(screen.getByText('2 miembros · 1 propuesta')).toBeTruthy();
  expect(screen.getByText('Administra: Usuario de Prueba')).toBeTruthy();
  expect(screen.getByText('Sin administrador')).toBeTruthy();
  await fireEvent.changeText(screen.getByLabelText('Buscar grupos'), 'proy');
  await fireEvent.press(screen.getByText('Buscar'));
  await waitFor(() => expect(mocked.listAdminGroups).toHaveBeenLastCalledWith('proy', 1));
  await fireEvent.press(await screen.findByText('Proyecto Integrador'));
  expect(onOpen).toHaveBeenCalledWith(makeGroupSummary());
});
```

`mobile/src/screens/admin/__tests__/AuditTab.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react-native';

import * as adminApi from '../../../api/admin';
import { makeAuditEntry, page } from '../../../testing/adminFixtures';
import { AuditTab } from '../tabs/AuditTab';

jest.mock('../../../api/admin');
jest.mock('../../../hooks/useRefreshOnFocus', () => ({ useRefreshOnFocus: jest.fn() }));
jest.mock('../../../utils/toast', () => ({ showToast: jest.fn() }));
const mocked = adminApi as jest.Mocked<typeof adminApi>;

beforeEach(() => jest.clearAllMocks());

it('cada acción con su objetivo, el motivo, quién y cuándo (hora local)', async () => {
  mocked.listAudit.mockResolvedValue(
    page([
      makeAuditEntry(),
      makeAuditEntry({
        id: 'a2', action: 'PROPOSAL_CANCELLED', admin: null, targetType: 'PROPOSAL', targetId: 'p1', details: { title: 'Fiesta', reason: 'Spam' },
      }),
    ]),
  );
  await render(<AuditTab />);
  expect(await screen.findByText('Suspendió una cuenta')).toBeTruthy();
  expect(screen.getByText('Ana')).toBeTruthy();
  expect(screen.getByText('Administración HueckoApp · Mar 29 sep, 10:00')).toBeTruthy();
  expect(screen.getByText('Canceló una propuesta')).toBeTruthy();
  expect(screen.getByText('Fiesta')).toBeTruthy();
  expect(screen.getByText('Motivo: Spam')).toBeTruthy();
  expect(screen.getByText('Consola del servidor · Mar 29 sep, 10:00')).toBeTruthy();
  expect(mocked.listAudit).toHaveBeenCalledWith(1);
});

it('sin acciones lo dice', async () => {
  mocked.listAudit.mockResolvedValue(page([]));
  await render(<AuditTab />);
  expect(await screen.findByText('Todavía no hay acciones registradas.')).toBeTruthy();
});
```

`mobile/src/screens/admin/__tests__/AdminUserDetailScreen.test.tsx`:

```tsx
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';

import * as adminApi from '../../../api/admin';
import { ApiError } from '../../../api/client';
import { ADMIN_USER, makeUserDetail } from '../../../testing/adminFixtures';
import { TEST_USER } from '../../../testing/fixtures';
import { showToast } from '../../../utils/toast';
import { AdminUserDetailScreen } from '../AdminUserDetailScreen';

jest.mock('../../../api/admin');
jest.mock('../../../utils/toast', () => ({ showToast: jest.fn() }));
const mockUseAuth = jest.fn();
jest.mock('../../../context/AuthContext', () => ({ useAuth: () => mockUseAuth() }));
const mocked = adminApi as jest.Mocked<typeof adminApi>;

const navigation = { setOptions: jest.fn(), goBack: jest.fn() } as any;
const renderScreen = (userId = 'u2') =>
  render(<AdminUserDetailScreen navigation={navigation} route={{ key: 'k', name: 'AdminUserDetail', params: { userId, name: 'Ana' } } as any} />);

beforeEach(() => {
  jest.clearAllMocks();
  mockUseAuth.mockReturnValue({ user: { ...ADMIN_USER, role: 'ADMIN' } });
  mocked.getAdminUser.mockResolvedValue(makeUserDetail());
});

it('muestra la cuenta, su actividad y sus grupos', async () => {
  await renderScreen();
  expect(await screen.findByText('ana@test.com')).toBeTruthy();
  expect(screen.getByText('Usuario')).toBeTruthy();
  expect(screen.getByText('Activa')).toBeTruthy();
  expect(screen.getByLabelText('Votos: 2')).toBeTruthy();
  expect(screen.getByLabelText('Llamadas a la IA: 4')).toBeTruthy();
  expect(screen.getByText('Proyecto Integrador · Miembro')).toBeTruthy();
  expect(navigation.setOptions).toHaveBeenCalledWith({ title: 'Ana' });
});

it('suspender pide confirmación, suspende y avisa', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  mocked.setUserStatus.mockResolvedValue(makeUserDetail({ status: 'SUSPENDED' }));
  await renderScreen();
  await fireEvent.press(await screen.findByText('Suspender cuenta'));
  expect(alert).toHaveBeenCalledWith(
    'Suspender cuenta',
    'Ana no podrá entrar ni usar la app hasta que la reactives. Sus grupos y planes no se borran.',
    expect.any(Array),
  );
  expect(mocked.setUserStatus).not.toHaveBeenCalled();
  const buttons = alert.mock.calls[0][2]!;
  await act(async () => buttons[1].onPress!());
  await waitFor(() => expect(showToast).toHaveBeenCalledWith('Cuenta suspendida.'));
  expect(mocked.setUserStatus).toHaveBeenCalledWith('u2', 'SUSPENDED');
  expect(screen.getByText('Reactivar cuenta')).toBeTruthy();
});

it('un 409 del servidor se muestra y no avisa de éxito', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  mocked.getAdminUser.mockResolvedValue(makeUserDetail({ role: 'ADMIN' }));
  mocked.setUserRole.mockRejectedValue(new ApiError(409, 'LAST_ADMIN', 'Tiene que quedar al menos un administrador activo.'));
  await renderScreen();
  await fireEvent.press(await screen.findByText('Quitar rol de administrador'));
  await act(async () => alert.mock.calls[0][2]![1].onPress!());
  expect(await screen.findByText('Tiene que quedar al menos un administrador activo.')).toBeTruthy();
  expect(showToast).not.toHaveBeenCalled();
});

it('en la propia cuenta no hay botones de estado ni de rol; en la de otra admin, sí', async () => {
  mocked.getAdminUser.mockResolvedValue(makeUserDetail({ ...ADMIN_USER, role: 'ADMIN' }));
  const first = await renderScreen(ADMIN_USER.id);
  expect(await screen.findByText('Es tu cuenta: no puedes suspenderla ni quitarte el rol de administrador.')).toBeTruthy();
  expect(screen.queryByText('Suspender cuenta')).toBeNull();
  expect(screen.queryByText('Quitar rol de administrador')).toBeNull();
  first.unmount();
  // Control positivo: la misma cuenta vista por otra admin sí tiene las acciones.
  mockUseAuth.mockReturnValue({ user: { ...TEST_USER, role: 'ADMIN' } });
  await renderScreen(ADMIN_USER.id);
  expect(await screen.findByText('Quitar rol de administrador')).toBeTruthy();
  expect(screen.getByText('Suspender cuenta')).toBeTruthy();
});
```

`mobile/src/screens/admin/__tests__/AdminGroupDetailScreen.test.tsx`:

```tsx
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';

import * as adminApi from '../../../api/admin';
import { ApiError } from '../../../api/client';
import { makeAdminProposal, makeGroupDetail } from '../../../testing/adminFixtures';
import { showToast } from '../../../utils/toast';
import { AdminGroupDetailScreen } from '../AdminGroupDetailScreen';

jest.mock('../../../api/admin');
jest.mock('../../../utils/toast', () => ({ showToast: jest.fn() }));
const mocked = adminApi as jest.Mocked<typeof adminApi>;

const navigation = { setOptions: jest.fn(), goBack: jest.fn() } as any;
const renderScreen = () =>
  render(
    <AdminGroupDetailScreen navigation={navigation} route={{ key: 'k', name: 'AdminGroupDetail', params: { groupId: 'g1', name: 'Proyecto Integrador' } } as any} />,
  );

beforeEach(() => {
  jest.clearAllMocks();
  mocked.getAdminGroup.mockResolvedValue(makeGroupDetail());
});

it('muestra el grupo, sus miembros y sus propuestas', async () => {
  await renderScreen();
  expect(await screen.findByText('Código PROY2026 · 2 miembros · umbral 80 %')).toBeTruthy();
  expect(screen.getByText('Administra: Usuario de Prueba')).toBeTruthy();
  expect(screen.getByText('Imprescindible')).toBeTruthy();
  expect(screen.getByText('Repaso antes de la entrega')).toBeTruthy();
  expect(screen.getByText('En votación')).toBeTruthy();
  expect(screen.getByText('Ana · 1 voto · 0 incidencias')).toBeTruthy();
});

it('cancelar una propuesta con motivo la marca como cancelada y avisa', async () => {
  mocked.cancelProposalAsAdmin.mockResolvedValue(makeAdminProposal({ state: 'CANCELADO' }));
  await renderScreen();
  await fireEvent.press(await screen.findByText('Cancelar propuesta'));
  expect(screen.getByText('«Repaso antes de la entrega» pasará a «Cancelado» para todo el grupo. Quedará en el registro de acciones.')).toBeTruthy();
  await fireEvent.changeText(screen.getByLabelText('Motivo (opcional)'), '  Spam ');
  await fireEvent.press(screen.getByText('Sí, cancelar'));
  await waitFor(() => expect(showToast).toHaveBeenCalledWith('Propuesta cancelada.'));
  expect(mocked.cancelProposalAsAdmin).toHaveBeenCalledWith('prop_2', 'Spam');
  expect(screen.getByText('Cancelado')).toBeTruthy();
  expect(screen.queryByText('Cancelar propuesta')).toBeNull();
});

it('si cancelar falla, el error se queda en el diálogo y no avisa', async () => {
  mocked.cancelProposalAsAdmin.mockRejectedValue(new ApiError(409, 'INVALID_STATE', 'La propuesta ya está cancelada.'));
  await renderScreen();
  await fireEvent.press(await screen.findByText('Cancelar propuesta'));
  await fireEvent.press(screen.getByText('Sí, cancelar'));
  expect(await screen.findByText('La propuesta ya está cancelada.')).toBeTruthy();
  expect(mocked.cancelProposalAsAdmin).toHaveBeenCalledWith('prop_2', undefined);
  expect(showToast).not.toHaveBeenCalled();
});

it('eliminar pide confirmación, borra, avisa y vuelve atrás', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  mocked.deleteAdminGroup.mockResolvedValue(undefined);
  await renderScreen();
  await fireEvent.press(await screen.findByText('Eliminar grupo'));
  expect(alert).toHaveBeenCalledWith(
    'Eliminar grupo',
    'Se borrará «Proyecto Integrador» con 2 miembros y 1 propuesta. No se puede deshacer.',
    expect.any(Array),
  );
  expect(mocked.deleteAdminGroup).not.toHaveBeenCalled();
  await act(async () => alert.mock.calls[0][2]![1].onPress!());
  await waitFor(() => expect(navigation.goBack).toHaveBeenCalled());
  expect(mocked.deleteAdminGroup).toHaveBeenCalledWith('g1');
  expect(showToast).toHaveBeenCalledWith('Grupo «Proyecto Integrador» eliminado.');
});
```

- [ ] **Step 2: Ejecutar y ver que fallan**

Run: `cd mobile && npx jest src/screens/admin`
Expected: FAIL — no existen las pantallas nuevas (los tests del Task 7 siguen pasando).

- [ ] **Step 3: Piezas comunes**

`mobile/src/screens/admin/SearchRow.tsx`:

```tsx
import { StyleSheet, View } from 'react-native';

import { SecondaryButton, TextField } from '../../components';

type Props = {
  value: string;
  onChangeText: (text: string) => void;
  onSearch: () => void;
  placeholder: string;
  accessibilityLabel: string;
};

// Campo de búsqueda de las listas de administración: busca al pulsar «Buscar» o «Intro» (no en cada letra).
export function SearchRow({ value, onChangeText, onSearch, placeholder, accessibilityLabel }: Props) {
  return (
    <View style={styles.row}>
      <View style={styles.flex}>
        <TextField
          accessibilityLabel={accessibilityLabel}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          leadingIcon="search"
          autoCapitalize="none"
          returnKeyType="search"
          onSubmitEditing={onSearch}
        />
      </View>
      <SecondaryButton title="Buscar" onPress={onSearch} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  flex: { flex: 1 },
});
```

`mobile/src/screens/admin/Pager.tsx`:

```tsx
import { StyleSheet, Text, View } from 'react-native';

import { SecondaryButton } from '../../components';
import { colors, typography } from '../../theme';

type Props = { page: number; pageCount: number; hasPrev: boolean; hasNext: boolean; onPrev: () => void; onNext: () => void };

// «Anterior · Página 2 de 3 · Siguiente». Con una sola página no se pinta.
export function Pager({ page, pageCount, hasPrev, hasNext, onPrev, onNext }: Props) {
  if (pageCount <= 1) return null;
  return (
    <View style={styles.row}>
      <SecondaryButton title="Anterior" icon="chevron-left" disabled={!hasPrev} onPress={onPrev} style={styles.flex} />
      <Text style={[typography.labelLarge, { color: colors.onSurfaceVariant }]}>{`Página ${page} de ${pageCount}`}</Text>
      <SecondaryButton title="Siguiente" icon="chevron-right" disabled={!hasNext} onPress={onNext} style={styles.flex} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  flex: { flex: 1 },
});
```

- [ ] **Step 4: Pestañas de listas**

`mobile/src/screens/admin/tabs/UsersTab.tsx`:

```tsx
import type { AdminUserSummary } from '@hueckoapp/shared';
import { useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Avatar, Badge, EmptyState, HueckoCard, LoadState } from '../../../components';
import { useAdminUsers } from '../../../hooks/useAdminLists';
import { useRefreshErrorToast } from '../../../hooks/useRefreshErrorToast';
import { useRefreshOnFocus } from '../../../hooks/useRefreshOnFocus';
import { categoryColorFor, colors, typography } from '../../../theme';
import { countLabel, ROLE_LABEL, STATUS_LABEL } from '../../../utils/admin';
import { Pager } from '../Pager';
import { SearchRow } from '../SearchRow';

function UserRow({ user, onPress }: { user: AdminUserSummary; onPress: () => void }) {
  return (
    <HueckoCard onPress={onPress}>
      <View style={styles.row}>
        <Avatar name={user.name} color={categoryColorFor(user.name)} size={40} />
        <View style={styles.flex}>
          <Text style={[typography.titleMedium, { color: colors.onSurface }]}>{user.name}</Text>
          <Text style={[typography.bodySmall, { color: colors.onSurfaceVariant }]}>{user.email}</Text>
        </View>
        <View style={styles.badges}>
          {user.role === 'ADMIN' ? (
            <Badge text={ROLE_LABEL.ADMIN} containerColor={colors.primaryContainer} contentColor={colors.onPrimaryContainer} />
          ) : null}
          {user.status === 'SUSPENDED' ? (
            <Badge text={STATUS_LABEL.SUSPENDED} containerColor={colors.errorContainer} contentColor={colors.onErrorContainer} />
          ) : null}
        </View>
      </View>
    </HueckoCard>
  );
}

// «Usuarios»: todas las cuentas, las más nuevas primero; se abre el detalle para suspender o cambiar el rol.
export function UsersTab({ onOpen }: { onOpen: (user: AdminUserSummary) => void }) {
  const list = useAdminUsers();
  useRefreshOnFocus(list.reload); // al volver del detalle, con el estado nuevo
  useRefreshErrorToast(list.error, list.loaded, list.failedLoads);
  const [text, setText] = useState('');

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={list.refreshing} onRefresh={() => void list.reload()} colors={[colors.primary]} />}
    >
      <SearchRow
        value={text}
        onChangeText={setText}
        onSearch={() => list.applySearch(text)}
        placeholder="Nombre o correo"
        accessibilityLabel="Buscar usuarios"
      />
      <LoadState loading={list.loading} error={list.error} hasData={list.loaded} onRetry={() => void list.reload()}>
        {list.items.length === 0 ? (
          <EmptyState
            icon="person-search"
            title="Sin resultados"
            description={list.search ? `Ninguna cuenta coincide con «${list.search}».` : 'Todavía no hay cuentas.'}
          />
        ) : (
          <View style={styles.list}>
            <Text style={[typography.labelMedium, { color: colors.onSurfaceVariant }]}>{countLabel(list.total, 'cuenta', 'cuentas')}</Text>
            {list.items.map((user) => (
              <UserRow key={user.id} user={user} onPress={() => onOpen(user)} />
            ))}
          </View>
        )}
        <Pager page={list.page} pageCount={list.pageCount} hasPrev={list.hasPrev} hasNext={list.hasNext} onPrev={list.prevPage} onNext={list.nextPage} />
      </LoadState>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: colors.surface },
  content: { padding: 16, gap: 12 },
  list: { gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  flex: { flex: 1 },
  badges: { gap: 4, alignItems: 'flex-end' },
});
```

`mobile/src/screens/admin/tabs/GroupsTab.tsx`:

```tsx
import type { AdminGroupSummary } from '@hueckoapp/shared';
import { useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { EmptyState, HueckoCard, LoadState } from '../../../components';
import { useAdminGroups } from '../../../hooks/useAdminLists';
import { useRefreshErrorToast } from '../../../hooks/useRefreshErrorToast';
import { useRefreshOnFocus } from '../../../hooks/useRefreshOnFocus';
import { colors, typography } from '../../../theme';
import { countLabel } from '../../../utils/admin';
import { memberCountLabel } from '../../../utils/groups';
import { Pager } from '../Pager';
import { SearchRow } from '../SearchRow';

function GroupRow({ group, onPress }: { group: AdminGroupSummary; onPress: () => void }) {
  return (
    <HueckoCard onPress={onPress}>
      <View style={styles.body}>
        <Text style={[typography.titleMedium, { color: colors.onSurface }]}>{group.name}</Text>
        <Text style={[typography.bodySmall, { color: colors.onSurfaceVariant }]}>
          {`${memberCountLabel(group.memberCount)} · ${countLabel(group.proposalCount, 'propuesta', 'propuestas')}`}
        </Text>
        <Text style={[typography.labelSmall, { color: colors.onSurfaceVariant }]}>
          {group.owner ? `Administra: ${group.owner.name}` : 'Sin administrador'}
        </Text>
      </View>
    </HueckoCard>
  );
}

// «Grupos»: todos los grupos de la app (sin ser miembro); el detalle permite borrar y moderar propuestas.
export function GroupsTab({ onOpen }: { onOpen: (group: AdminGroupSummary) => void }) {
  const list = useAdminGroups();
  useRefreshOnFocus(list.reload); // al volver de borrar un grupo, ya no aparece
  useRefreshErrorToast(list.error, list.loaded, list.failedLoads);
  const [text, setText] = useState('');

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={list.refreshing} onRefresh={() => void list.reload()} colors={[colors.primary]} />}
    >
      <SearchRow
        value={text}
        onChangeText={setText}
        onSearch={() => list.applySearch(text)}
        placeholder="Nombre o código"
        accessibilityLabel="Buscar grupos"
      />
      <LoadState loading={list.loading} error={list.error} hasData={list.loaded} onRetry={() => void list.reload()}>
        {list.items.length === 0 ? (
          <EmptyState
            icon="group-off"
            title="Sin resultados"
            description={list.search ? `Ningún grupo coincide con «${list.search}».` : 'Todavía no hay grupos.'}
          />
        ) : (
          <View style={styles.list}>
            <Text style={[typography.labelMedium, { color: colors.onSurfaceVariant }]}>{countLabel(list.total, 'grupo', 'grupos')}</Text>
            {list.items.map((group) => (
              <GroupRow key={group.id} group={group} onPress={() => onOpen(group)} />
            ))}
          </View>
        )}
        <Pager page={list.page} pageCount={list.pageCount} hasPrev={list.hasPrev} hasNext={list.hasNext} onPrev={list.prevPage} onNext={list.nextPage} />
      </LoadState>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: colors.surface },
  content: { padding: 16, gap: 12 },
  list: { gap: 8 },
  body: { gap: 4 },
});
```

`mobile/src/screens/admin/tabs/AuditTab.tsx`:

```tsx
import type { AuditEntry } from '@hueckoapp/shared';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { EmptyState, HueckoCard, LoadState } from '../../../components';
import { useAdminAudit } from '../../../hooks/useAdminLists';
import { useRefreshErrorToast } from '../../../hooks/useRefreshErrorToast';
import { useRefreshOnFocus } from '../../../hooks/useRefreshOnFocus';
import { colors, typography } from '../../../theme';
import { AUDIT_ACTION_LABEL, auditAuthor, auditReason, auditTarget } from '../../../utils/admin';
import { formatDateTime } from '../../../utils/days';
import { Pager } from '../Pager';

function AuditRow({ entry }: { entry: AuditEntry }) {
  const reason = auditReason(entry);
  return (
    <HueckoCard>
      <View style={styles.body}>
        <Text style={[typography.titleMedium, { color: colors.onSurface }]}>{AUDIT_ACTION_LABEL[entry.action]}</Text>
        <Text style={[typography.bodyMedium, { color: colors.onSurface }]}>{auditTarget(entry)}</Text>
        {reason ? <Text style={[typography.bodySmall, { color: colors.onSurfaceVariant }]}>{`Motivo: ${reason}`}</Text> : null}
        <Text style={[typography.labelSmall, { color: colors.onSurfaceVariant }]}>
          {`${auditAuthor(entry)} · ${formatDateTime(new Date(entry.createdAt))}`}
        </Text>
      </View>
    </HueckoCard>
  );
}

// «Registro»: cada acción de administración, la más reciente primero (también las hechas desde la consola).
export function AuditTab() {
  const list = useAdminAudit();
  useRefreshOnFocus(list.reload);
  useRefreshErrorToast(list.error, list.loaded, list.failedLoads);

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={list.refreshing} onRefresh={() => void list.reload()} colors={[colors.primary]} />}
    >
      <LoadState loading={list.loading} error={list.error} hasData={list.loaded} onRetry={() => void list.reload()}>
        {list.items.length === 0 ? (
          <EmptyState icon="history" title="Registro vacío" description="Todavía no hay acciones registradas." />
        ) : (
          <View style={styles.list}>
            {list.items.map((entry) => (
              <AuditRow key={entry.id} entry={entry} />
            ))}
          </View>
        )}
        <Pager page={list.page} pageCount={list.pageCount} hasPrev={list.hasPrev} hasNext={list.hasNext} onPrev={list.prevPage} onNext={list.nextPage} />
      </LoadState>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: colors.surface },
  content: { padding: 16, gap: 12 },
  list: { gap: 8 },
  body: { gap: 4 },
});
```

- [ ] **Step 5: Detalle de una cuenta** — `mobile/src/screens/admin/AdminUserDetailScreen.tsx`:

```tsx
import { useEffect } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  Avatar, Badge, ErrorBanner, LoadState, PrimaryButton, SecondaryButton, SectionHeader, StatTile,
} from '../../components';
import { useAuth } from '../../context/AuthContext';
import type { ActionResult } from '../../hooks/useAction';
import { useAdminUser } from '../../hooks/useAdminUser';
import type { AppStackScreen } from '../../navigation/types';
import { categoryColorFor, colors, typography } from '../../theme';
import { ROLE_LABEL, STATUS_LABEL } from '../../utils/admin';
import { formatDateLabel, toDateKey } from '../../utils/days';
import { showToast } from '../../utils/toast';

// Confirmación de las acciones que quitan acceso o dan poder (la reactivación va sin preguntar).
const confirm = (title: string, message: string, label: string, onConfirm: () => void) =>
  Alert.alert(title, message, [
    { text: 'Volver', style: 'cancel' },
    { text: label, style: 'destructive', onPress: onConfirm },
  ]);

export function AdminUserDetailScreen({ navigation, route }: AppStackScreen<'AdminUserDetail'>) {
  const { userId } = route.params;
  const { user: me } = useAuth();
  const { user, loading, error, reload, setStatus, setRole, saving, actionError } = useAdminUser(userId);

  const name = user?.name;
  useEffect(() => {
    if (name) navigation.setOptions({ title: name });
  }, [name, navigation]);

  if (!user) {
    return (
      <View style={styles.centered}>
        <LoadState loading={loading} error={error ?? 'Usuario no encontrado.'} hasData={false} onRetry={() => void reload()}>
          {null}
        </LoadState>
      </View>
    );
  }

  // El servidor también lo impide (409 CANNOT_CHANGE_SELF); aquí ni se ofrece.
  const isMe = me?.id === user.id;
  const run = async (action: Promise<ActionResult<unknown>>, done: string) => {
    if ((await action).ok) showToast(done);
  };

  const suspend = () =>
    confirm('Suspender cuenta', `${user.name} no podrá entrar ni usar la app hasta que la reactives. Sus grupos y planes no se borran.`, 'Suspender', () =>
      void run(setStatus('SUSPENDED'), 'Cuenta suspendida.'),
    );
  const reactivate = () => void run(setStatus('ACTIVE'), 'Cuenta reactivada.');
  const promote = () =>
    confirm('Nombrar administrador', `${user.name} podrá ver las estadísticas, suspender cuentas y borrar grupos.`, 'Nombrar', () =>
      void run(setRole('ADMIN'), `${user.name} ahora es administrador.`),
    );
  const demote = () =>
    confirm('Quitar rol de administrador', `${user.name} dejará de ver «Administración».`, 'Quitar rol', () =>
      void run(setRole('USER'), `${user.name} ya no es administrador.`),
    );

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Avatar name={user.name} color={categoryColorFor(user.name)} size={56} />
        <Text style={[typography.headlineSmall, { color: colors.onSurface }]}>{user.name}</Text>
        <Text style={[typography.bodyMedium, { color: colors.onSurfaceVariant }]}>{user.email}</Text>
        <View style={styles.badges}>
          <Badge text={ROLE_LABEL[user.role]} containerColor={colors.primaryContainer} contentColor={colors.onPrimaryContainer} />
          <Badge
            text={STATUS_LABEL[user.status]}
            containerColor={user.status === 'ACTIVE' ? colors.successContainer : colors.errorContainer}
            contentColor={user.status === 'ACTIVE' ? colors.onSuccessContainer : colors.onErrorContainer}
          />
        </View>
        <Text style={[typography.bodySmall, { color: colors.onSurfaceVariant }]}>
          {`Cuenta creada el ${formatDateLabel(toDateKey(new Date(user.createdAt)))}`}
        </Text>
      </View>

      <SectionHeader title="Actividad" />
      <View style={styles.tiles}>
        <StatTile label="Propuestas creadas" value={user.activity.proposalsCreated} />
        <StatTile label="Votos" value={user.activity.votes} />
        <StatTile label="Incidencias" value={user.activity.incidences} />
        <StatTile label="Bloques de horario" value={user.activity.timeBlocks} />
        <StatTile label="Llamadas a la IA" value={user.activity.aiCalls} />
      </View>

      <SectionHeader title="Grupos" />
      {user.groups.length === 0 ? (
        <Text style={[typography.bodyMedium, { color: colors.onSurfaceVariant }]}>No pertenece a ningún grupo.</Text>
      ) : (
        user.groups.map((g) => (
          <Text key={g.id} style={[typography.bodyMedium, { color: colors.onSurface }]}>
            {`${g.name} · ${g.role === 'OWNER' ? 'Administra el grupo' : 'Miembro'}`}
          </Text>
        ))
      )}

      <SectionHeader title="Acciones" />
      {actionError ? <ErrorBanner message={actionError} /> : null}
      {isMe ? (
        <Text style={[typography.bodyMedium, { color: colors.onSurfaceVariant }]}>
          Es tu cuenta: no puedes suspenderla ni quitarte el rol de administrador.
        </Text>
      ) : (
        <View style={styles.actions}>
          {user.status === 'ACTIVE' ? (
            <SecondaryButton title="Suspender cuenta" icon="block" color={colors.error} disabled={saving} onPress={suspend} />
          ) : (
            <PrimaryButton title="Reactivar cuenta" icon="check-circle" loading={saving} onPress={reactivate} />
          )}
          {user.role === 'USER' ? (
            <SecondaryButton title="Nombrar administrador" icon="admin-panel-settings" disabled={saving} onPress={promote} />
          ) : (
            <SecondaryButton title="Quitar rol de administrador" icon="remove-moderator" disabled={saving} onPress={demote} />
          )}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: colors.surface },
  content: { padding: 16, gap: 12 },
  centered: { flex: 1, justifyContent: 'center', padding: 16, backgroundColor: colors.surface },
  header: { alignItems: 'center', gap: 6 },
  badges: { flexDirection: 'row', gap: 8 },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  actions: { gap: 10 },
});
```

- [ ] **Step 6: Detalle de un grupo y moderación**

`mobile/src/screens/admin/CancelProposalDialog.tsx`:

```tsx
import type { AdminProposalSummary } from '@hueckoapp/shared';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AppDialog, ErrorBanner, TextField } from '../../components';
import { colors, typography } from '../../theme';

type Props = {
  proposal: AdminProposalSummary;
  loading: boolean;
  error: string | null;
  onConfirm: (reason: string) => void;
  onDismiss: () => void;
};

// Moderación (D7, A5): cancelar una propuesta de cualquier grupo exige un motivo (3-200 caracteres) que queda en el registro.
// (Borrador original: el componente implementado desactiva «Sí, cancelar» hasta que el motivo es válido.)
export function CancelProposalDialog({ proposal, loading, error, onConfirm, onDismiss }: Props) {
  const [reason, setReason] = useState('');
  return (
    <AppDialog title="Cancelar propuesta" confirmLabel="Sí, cancelar" onConfirm={() => onConfirm(reason.trim())} onDismiss={onDismiss} loading={loading}>
      <View style={styles.body}>
        <Text style={[typography.bodyMedium, { color: colors.onSurfaceVariant }]}>
          {`«${proposal.title}» pasará a «Cancelado» para todo el grupo. Quedará en el registro de acciones.`}
        </Text>
        <TextField label="Motivo (opcional)" value={reason} onChangeText={setReason} maxLength={200} multiline />
        {error ? <ErrorBanner message={error} /> : null}
      </View>
    </AppDialog>
  );
}

const styles = StyleSheet.create({
  body: { gap: 12 },
});
```

`mobile/src/screens/admin/AdminGroupDetailScreen.tsx`:

```tsx
import type { AdminProposalSummary } from '@hueckoapp/shared';
import { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Avatar, ErrorBanner, HueckoCard, LoadState, ProposalStateBadge, SecondaryButton, SectionHeader } from '../../components';
import { useAdminGroup } from '../../hooks/useAdminGroup';
import type { AppStackScreen } from '../../navigation/types';
import { categoryColorFor, colors, typography } from '../../theme';
import { countLabel } from '../../utils/admin';
import { memberCountLabel } from '../../utils/groups';
import { voteCountLabel } from '../../utils/proposals';
import { showToast } from '../../utils/toast';
import { CancelProposalDialog } from './CancelProposalDialog';

export function AdminGroupDetailScreen({ navigation, route }: AppStackScreen<'AdminGroupDetail'>) {
  const { groupId } = route.params;
  const { group, loading, error, reload, remove, removing, removeError, cancelProposal, cancelling, cancelError, clearCancelError } =
    useAdminGroup(groupId);
  const [target, setTarget] = useState<AdminProposalSummary | null>(null);

  const name = group?.name;
  useEffect(() => {
    if (name) navigation.setOptions({ title: name });
  }, [name, navigation]);

  if (!group) {
    return (
      <View style={styles.centered}>
        <LoadState loading={loading} error={error ?? 'Grupo no encontrado.'} hasData={false} onRetry={() => void reload()}>
          {null}
        </LoadState>
      </View>
    );
  }

  const handleDelete = async () => {
    if (!(await remove()).ok) return;
    showToast(`Grupo «${group.name}» eliminado.`);
    navigation.goBack();
  };
  const confirmDelete = () =>
    Alert.alert(
      'Eliminar grupo',
      `Se borrará «${group.name}» con ${memberCountLabel(group.memberCount)} y ${countLabel(group.proposalCount, 'propuesta', 'propuestas')}. No se puede deshacer.`,
      [
        { text: 'Volver', style: 'cancel' },
        { text: 'Eliminar', style: 'destructive', onPress: () => void handleDelete() },
      ],
    );

  const closeDialog = () => {
    clearCancelError();
    setTarget(null);
  };
  const confirmCancel = async (reason: string) => {
    if (!target) return;
    const result = await cancelProposal(target.id, reason || undefined);
    if (!result.ok) return; // el error se queda en el diálogo
    setTarget(null);
    showToast('Propuesta cancelada.');
  };

  return (
    <>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={[typography.headlineSmall, { color: colors.onSurface }]}>{group.name}</Text>
          {group.description ? <Text style={[typography.bodyMedium, { color: colors.onSurfaceVariant }]}>{group.description}</Text> : null}
          <Text style={[typography.labelMedium, { color: colors.onSurfaceVariant }]}>
            {`Código ${group.inviteCode} · ${memberCountLabel(group.memberCount)} · umbral ${group.availabilityThreshold} %`}
          </Text>
          <Text style={[typography.bodySmall, { color: colors.onSurfaceVariant }]}>
            {group.owner ? `Administra: ${group.owner.name}` : 'Sin administrador'}
          </Text>
        </View>

        <SectionHeader title="Miembros" />
        {group.members.map((m) => (
          <View key={m.id} style={styles.row}>
            <Avatar name={m.name} color={categoryColorFor(m.name)} size={32} />
            <View style={styles.flex}>
              <Text style={[typography.bodyMedium, { color: colors.onSurface }]}>{m.name}</Text>
              <Text style={[typography.bodySmall, { color: colors.onSurfaceVariant }]}>{m.email}</Text>
            </View>
            <Text style={[typography.labelSmall, { color: colors.onSurfaceVariant }]}>
              {m.role === 'OWNER' ? 'Administra' : m.isEssential ? 'Imprescindible' : 'Miembro'}
            </Text>
          </View>
        ))}

        <SectionHeader title="Propuestas" />
        {group.proposals.length === 0 ? (
          <Text style={[typography.bodyMedium, { color: colors.onSurfaceVariant }]}>Este grupo no tiene propuestas.</Text>
        ) : (
          group.proposals.map((p) => (
            <HueckoCard key={p.id}>
              <View style={styles.cardBody}>
                <View style={styles.row}>
                  <Text style={[typography.titleMedium, styles.flex, { color: colors.onSurface }]}>{p.title}</Text>
                  <ProposalStateBadge state={p.state} />
                </View>
                <Text style={[typography.bodySmall, { color: colors.onSurfaceVariant }]}>
                  {`${p.createdBy.name} · ${voteCountLabel(p.voteCount)} · ${countLabel(p.incidenceCount, 'incidencia', 'incidencias')}`}
                </Text>
                {p.state !== 'CANCELADO' ? (
                  <SecondaryButton
                    title="Cancelar propuesta"
                    icon="block"
                    color={colors.error}
                    accessibilityLabel={`Cancelar «${p.title}»`}
                    onPress={() => setTarget(p)}
                  />
                ) : null}
              </View>
            </HueckoCard>
          ))
        )}

        {removeError ? <ErrorBanner message={removeError} /> : null}
        <SecondaryButton title="Eliminar grupo" icon="delete-outline" color={colors.error} disabled={removing} onPress={confirmDelete} />
      </ScrollView>
      {target ? (
        <CancelProposalDialog
          proposal={target}
          loading={cancelling}
          error={cancelError}
          onConfirm={(reason) => void confirmCancel(reason)}
          onDismiss={closeDialog}
        />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: colors.surface },
  content: { padding: 16, gap: 12 },
  centered: { flex: 1, justifyContent: 'center', padding: 16, backgroundColor: colors.surface },
  header: { gap: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  flex: { flex: 1 },
  cardBody: { gap: 8 },
});
```

- [ ] **Step 7: Navegación**

En `mobile/src/navigation/types.ts`:
- `AppStackParamList`: después de `PlanDetail: { proposalId: string };` añadir:

```ts
  // Administración (solo rol ADMIN): detalles que se abren desde las pestañas Usuarios y Grupos.
  AdminUserDetail: { userId: string; name: string };
  AdminGroupDetail: { groupId: string; name: string };
```

- `export type AdminTabsParamList = { Stats: undefined; Reports: undefined };` → `export type AdminTabsParamList = { Stats: undefined; Reports: undefined; Users: undefined; Groups: undefined; Audit: undefined };`

Reemplazar `mobile/src/screens/admin/AdminScreen.tsx` completo:

```tsx
import { createMaterialTopTabNavigator } from '@react-navigation/material-top-tabs';

import type { AdminTabsParamList, DrawerScreen } from '../../navigation/types';
import { colors, typography } from '../../theme';
import { AuditTab } from './tabs/AuditTab';
import { GroupsTab } from './tabs/GroupsTab';
import { ReportsTab } from './tabs/ReportsTab';
import { StatsTab } from './tabs/StatsTab';
import { UsersTab } from './tabs/UsersTab';

const Tabs = createMaterialTopTabNavigator<AdminTabsParamList>();

// Panel «Administración» (D12): cinco pestañas desplazables, con el mismo estilo que el detalle de un grupo.
// Solo aparece en el drawer con rol ADMIN; el servidor lo vuelve a comprobar en cada petición (403 NOT_ADMIN).
export function AdminScreen({ navigation }: DrawerScreen<'Admin'>) {
  return (
    <Tabs.Navigator
      screenOptions={{
        tabBarScrollEnabled: true,
        tabBarItemStyle: { width: 'auto', minWidth: 110 },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.onSurfaceVariant,
        tabBarIndicatorStyle: { backgroundColor: colors.primary },
        tabBarStyle: { backgroundColor: colors.surface },
        tabBarLabelStyle: { ...typography.labelLarge, textTransform: 'none' },
        sceneStyle: { backgroundColor: colors.surface },
      }}
    >
      <Tabs.Screen name="Stats" component={StatsTab} options={{ title: 'Estadísticas' }} />
      <Tabs.Screen name="Reports" component={ReportsTab} options={{ title: 'Informes' }} />
      <Tabs.Screen name="Users" options={{ title: 'Usuarios' }}>
        {() => <UsersTab onOpen={(user) => navigation.navigate('AdminUserDetail', { userId: user.id, name: user.name })} />}
      </Tabs.Screen>
      <Tabs.Screen name="Groups" options={{ title: 'Grupos' }}>
        {() => <GroupsTab onOpen={(group) => navigation.navigate('AdminGroupDetail', { groupId: group.id, name: group.name })} />}
      </Tabs.Screen>
      <Tabs.Screen name="Audit" component={AuditTab} options={{ title: 'Registro' }} />
    </Tabs.Navigator>
  );
}
```

En `mobile/src/navigation/RootNavigator.tsx`:
- Imports: añadir `import { AdminGroupDetailScreen } from '../screens/admin/AdminGroupDetailScreen';` y `import { AdminUserDetailScreen } from '../screens/admin/AdminUserDetailScreen';`
- Después de `<AppStack.Screen name="PlanDetail" … />` añadir:

```tsx
      <AppStack.Screen name="AdminUserDetail" component={AdminUserDetailScreen} options={({ route }) => ({ title: route.params.name })} />
      <AppStack.Screen name="AdminGroupDetail" component={AdminGroupDetailScreen} options={({ route }) => ({ title: route.params.name })} />
```

- [ ] **Step 8: README** — en `README.md`:
  - Fila **Hooks**: `` `useRefreshErrorToast`) `` → `` `useRefreshErrorToast`, `usePagedList`) `` y `` `useAiStatus`) |`` → `` `useAiStatus`, `useAdminStats`, `useAdminReport`, `useAdminUsers`, `useAdminGroups`, `useAdminAudit`, `useAdminUser`, `useAdminGroup`) |``
  - Fila **Seguridad en Android**: `| **Seguridad en Android** | Token JWT en `expo-secure-store`, permisos en tiempo de ejecución, contraseñas con bcrypt y claves de IA solo en el backend |` → `| **Seguridad en Android** | Token JWT en `expo-secure-store`, permisos en tiempo de ejecución, contraseñas con bcrypt y claves de IA solo en el backend. **Autorización por roles** (`USER`/`ADMIN`): el servidor lee rol y estado de la base en cada petición (`requireAuth` y `requireAdmin` en `backend/src/auth/require-auth.ts`), nadie se hace administrador por la API (solo `npm run make-admin`), una cuenta suspendida queda fuera al instante y cada acción de administración queda en un registro |`
  - Fila **Navegación**: `| **Navegación** | `native-stack` (flujos), `drawer` (menú principal) y `material-top-tabs` (pestañas del grupo) |` → `| **Navegación** | `native-stack` (flujos), `drawer` (menú principal; «Administración» solo aparece con rol `ADMIN`) y `material-top-tabs` (pestañas del grupo y del panel de administración) |`
  - Después de la fila **Inteligencia artificial**, añadir: `| **Gráficos e informes** | Panel «Administración» (`mobile/src/screens/admin/`): gráficos con `react-native-gifted-charts` (sobre `react-native-svg`), informe en PDF generado en el teléfono con `expo-print` y CSV escrito con `expo-file-system`, ambos compartidos con `expo-sharing`. Los números los calcula el servidor (`backend/src/admin/stats.ts`), en su zona horaria |`
  - Hoja de ruta: después de `- [x] **Fase 4** — IA: OCR de horarios y ayuda en votaciones` añadir `- [x] **Fase 4.5** — Administración: roles, estadísticas, informes (PDF y CSV), usuarios, grupos, moderación y registro de acciones`

- [ ] **Step 9: Verificar**

Run: `cd mobile && npx jest src/screens/admin`
Expected: PASS.
Run (raíz): `npm run typecheck` y `npm test` → verde.
Run: `cd mobile && npx expo-doctor` → sin avisos.
Prueba manual en Expo Go con la semilla: `admin@test.com` → «Usuarios»: buscar «ana», abrir, «Suspender cuenta» → en otro teléfono/emulador con `ana@test.com` la siguiente acción cierra la sesión con el aviso «Tu cuenta está suspendida…»; «Reactivar cuenta». «Grupos» → «Proyecto Integrador» → «Cancelar propuesta» con motivo → el grupo lo ve «Cancelado»; «Registro» muestra ambas acciones. En la propia cuenta del admin no hay botones.

- [ ] **Step 10: Commit**

```bash
git add mobile/src/screens/admin/SearchRow.tsx mobile/src/screens/admin/Pager.tsx mobile/src/screens/admin/tabs/UsersTab.tsx \
  mobile/src/screens/admin/tabs/GroupsTab.tsx mobile/src/screens/admin/tabs/AuditTab.tsx mobile/src/screens/admin/AdminUserDetailScreen.tsx \
  mobile/src/screens/admin/AdminGroupDetailScreen.tsx mobile/src/screens/admin/CancelProposalDialog.tsx mobile/src/screens/admin/AdminScreen.tsx \
  mobile/src/navigation/types.ts mobile/src/navigation/RootNavigator.tsx \
  mobile/src/screens/admin/__tests__/UsersTab.test.tsx mobile/src/screens/admin/__tests__/GroupsTab.test.tsx \
  mobile/src/screens/admin/__tests__/AuditTab.test.tsx mobile/src/screens/admin/__tests__/AdminUserDetailScreen.test.tsx \
  mobile/src/screens/admin/__tests__/AdminGroupDetailScreen.test.tsx README.md
GIT_AUTHOR_NAME="Aless Bustamante" GIT_AUTHOR_EMAIL="fabrizio.bs9012@gmail.com" \
GIT_COMMITTER_NAME="Aless Bustamante" GIT_COMMITTER_EMAIL="fabrizio.bs9012@gmail.com" \
git commit -m "feat(mobile): usuarios, grupos, moderación y registro de acciones en Administración" -m "Co-Authored-By: <modelo que implementa> <noreply@anthropic.com>"
```

---

## Cobertura del encargo (autorrevisión)

| Requisito | Task |
|---|---|
| Admin de la app con panel dentro de la app; ítem del drawer solo con `ADMIN`; secciones Estadísticas, Informes, Usuarios, Grupos, Registro (React Navigation, `material-top-tabs`) | 7, 8 |
| `users.role` / `users.status` con `CHECK`; `admin_audit_log`; `ai_calls` sin prompt ni respuesta | 1 |
| `askAi` registra cada llamada (éxito o fallo) → IA por función y % de éxito | 2, 5 |
| Primer admin solo por consola (`make-admin` y `--revoke`); semilla `admin@test.com` en el README | 3 |
| `requireAuth` lee de la base en cada petición; suspendido → `403 ACCOUNT_SUSPENDED` en login y con token; la app cierra sesión; `requireAdmin` → `403 NOT_ADMIN`; `/auth/me` con rol | 1, 6 |
| Guardas: ni suspenderse ni quitarse el rol; último admin activo (409); auditoría en la misma transacción | 3 (y 4 para grupos/moderación) |
| `GET /admin/stats`, `/stats/timeseries`, `/stats/popular-hours`, `/reports`; ISO UTC; tramos en la zona del servidor (explicado con SQLite) | 5 |
| `GET/PATCH /admin/users…`, `GET /admin/audit` (paginados, con búsqueda) | 3 |
| `GET/DELETE /admin/groups…` (cascada) y moderación `POST /admin/proposals/:id/cancel` (elegido y justificado, D7) | 4 |
| Gráficos compatibles con Expo Go SDK 57 (verificado, D11); filtro 7 días / 30 días / semestre / personalizado con `DateTimeField`; PDF con `expo-print` + `expo-sharing`; CSV con `expo-file-system`; mocks en `jest.setup.ts` | 7 |
| Hooks por pantalla con el patrón `useResource`/`useAction` | 6 |
| Cifras solo en el servidor | 5 (la app solo usa `chartData.ts` para dar forma) |
| README (sección de administración, temas del curso), `docs/api.md` («Administración» y códigos de error), `shared/index.d.ts` | 1–5, 3, 8 |

Comprobaciones hechas al escribir el plan: sin marcadores pendientes; nombres coherentes entre tasks (`requireAuth(db, secret)`, `AdminActor`, `adminUsers`/`adminGroups`, `aiCallRecorder`, `DateRange` en backend (`stats.ts`) y en mobile (`api/admin.ts`), `usePagedList().applySearch/nextPage/prevPage`, `PROPOSAL_STATE_ORDER`, `ChartPoint`); los tests existentes que cambian están listados en su task (auth, users.repository, database, ai-core, gemini-client, seed, AuthContext, client).

## Riesgos conocidos

- **`requireAuth` hace una consulta por petición.** Es idempotente dentro de una misma petición (`/api/groups/:id/ai/*` atraviesa tres routers montados en `/groups` y solo lee la cuenta una vez). Es una lectura por clave primaria en SQLite: despreciable a esta escala.
- **Etiquetas de los gráficos:** con 24 barras o 12 semanas en pantallas estrechas pueden solaparse; por eso `chartData.ts` deja etiqueta cada 3 horas y como mucho ~7 en las series. Revisar en un teléfono pequeño en la prueba manual.
- **`react-native-gifted-charts` no está en `bundledNativeModules.json`** (es JS puro): `npx expo install` instala la última (1.4.78). Sus dependencias nativas (`react-native-svg`, `expo-linear-gradient`) sí están fijadas por el SDK 57 y vienen en Expo Go.
- **El rol nuevo se ve al volver a la app, al reabrirla o al iniciar sesión.** Si se quita el rol con la app abierta en «Administración», la siguiente petición responde `403 NOT_ADMIN` y la app vuelve a pedir `/auth/me`: desaparecen el ítem del menú y los detalles de administración. El servidor lo protege siempre, pase lo que pase en la app.
- **Prueba en un dispositivo pendiente:** gráficos, `expo-print`, `expo-sharing` y `expo-file-system` solo se prueban con mocks en Jest. Antes de `release/2.0.0` hay que pasar la lista de comprobación manual del README («Prueba manual en un celular»).
