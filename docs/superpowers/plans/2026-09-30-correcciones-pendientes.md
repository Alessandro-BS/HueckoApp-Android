# Correcciones pendientes (tras la Fase 4): plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Siete correcciones antes del despliegue: ninguna propuesta queda sin nadie que la gestione (`canManage`), los votos de quien sale del grupo no cuentan, la semilla siempre tiene fechas de «ahora», Inicio resume cada grupo con su propuesta más reciente, el listado de propuestas deja de hacer N+1 consultas, el backend funciona detrás de un proxy con límites separados para login y registro, y las fotos HEIC del iPhone se suben convertidas a JPG.

**Architecture:** Todo lo que depende de «quién pregunta» y de «quién sigue en el grupo» se calcula en un único sitio: `hydrate()` de `proposalsRepository`, que carga franjas (con votos solo de miembros actuales), incidencias, mi voto y los miembros de los grupos con un número fijo de consultas (`json_each`) y rellena `canManage` con la función pura `canManageProposal()` (`src/proposals/permissions.ts`). Rutas, Inicio y el resumen con IA consumen ese `Proposal` sin lógica propia. La semilla pasa a `src/db/demo-data.ts` (probada con una base en memoria) y `seed.ts` queda como CLI. `createApp` aplica `trust proxy` y dos limitadores de `/auth`. En la app, `PlanDetailScreen` usa `proposal.canManage` y `pickScheduleImage` pide la representación compatible (JPEG) y deduce el tipo real del archivo subido.

**Tech Stack:** Express 5, TypeScript 7, zod 4.6, `node:sqlite` (JSON1: `json_each`), `express-rate-limit` 8.7, Vitest + Supertest · Expo SDK 57, `expo-image-picker` 57.0.20, React Navigation 7, jest-expo + @testing-library/react-native 14.

**Spec:** no hay spec aparte: los requisitos son las 7 correcciones del encargo (resumidas en «Decisiones»). Contrato: `docs/api.md` y `shared/index.d.ts`. Contexto: `docs/superpowers/specs/2026-09-29-domain-logic-spec.md` (§3.2 semilla, C6 relevo del OWNER, G4/G5 votación exprés) y el plan anterior `docs/superpowers/plans/2026-09-29-fase4-ia.md`.

## Global Constraints

- **Rama:** `feature/correcciones-pendientes`, **ya creada y activa**. Ningún task crea ni cambia de rama. Nunca commits en `develop`/`main`.
- **Sin migraciones nuevas ni dependencias nuevas.** El esquema actual basta (`group_members.joined_at` + `rowid` para la antigüedad). No se instala `expo-image-manipulator` ni nada más.
- Errores del backend con `throw new ApiError(status, code, message)`; forma `{ "error": { "code", "message", "details" } }`. Validación de entradas y entorno con zod.
- `docs/api.md` y `shared/index.d.ts` se actualizan **en el mismo task** que cambia el contrato (Tasks 2, 3 y 5).
- Reloj: backend `deps.now()` (tests con `makeTestApp({ now: () => NOW })` o `makeClock`); `NOW` = martes 29/09/2026 10:00 hora local. La semilla recibe `now` como parámetro.
- `app.ts` no importa `config/env.ts` (los tests crean la app sin `.env`); la configuración entra por `AppDeps` desde `index.ts`.
- Comentarios del código y todo texto visible en **español con tildes correctas**.
- Tests de mobile: RNTL v14 es **asíncrono** (`await render`, `await fireEvent.press`, `await act(async () => …)`). En fábricas de `jest.mock` solo variables con prefijo `mock`. Una guarda se prueba con **control positivo** en el mismo test.
- Verificación antes de cada commit, desde la raíz: `npm run typecheck` y `TZ=America/Lima npm test` en verde.
- Commits convencionales en español. Identidad (no hay `user.name` configurado) y trailer = **la línea de atribución del modelo que implementa el task** (la suya propia):
  ```bash
  GIT_AUTHOR_NAME="Aless Bustamante" GIT_AUTHOR_EMAIL="fabrizio.bs9012@gmail.com" \
  GIT_COMMITTER_NAME="Aless Bustamante" GIT_COMMITTER_EMAIL="fabrizio.bs9012@gmail.com" \
  git commit -m "<tipo>(<área>): <mensaje>" -m "Co-Authored-By: <modelo que implementa> <noreply@anthropic.com>"
  ```
- `git add` siempre con rutas explícitas. **Nunca** se añaden `.claude/` ni `.superpowers/` (nada de `git add -A` ni `git add .`).
- Fuera de alcance (YAGNI): rol de administrador de la app (solo se deja el punto de extensión `canManageProposal`), borrar votos de quien sale, incidencias de ex-miembros, `?weekOf=` en disponibilidad, subir HEIC al servidor.

### Decisiones tomadas en este plan

| # | Decisión | Dónde |
|---|---|---|
| D1 | **Quién gestiona** (confirmar, cancelar, reprogramar, resolver) una propuesta: (1) quien la creó mientras sea miembro; (2) si no, el `OWNER` del grupo; (3) si no hubiera `OWNER`, el miembro más antiguo; (4) si el grupo no tiene miembros, nadie (el grupo ya no existe). Una sola función `canManageProposal({ viewerId, creatorId, members })`; el futuro rol de administrador se añade ahí. | Task 3 |
| D2 | **«Creador del grupo» = el `OWNER` actual.** La tabla `groups` no guarda quién la creó: el creador nace `OWNER`, el rol no se puede cambiar por la API y, si el `OWNER` sale, `leave()` (C6) lo pasa a quien lleva más tiempo. Por eso «el creador del grupo si sigue; si no, el más antiguo» es exactamente «el `OWNER` actual», sin migración. El paso (3) es defensivo (datos rotos). | Task 3 |
| D3 | **Antigüedad** = `group_members.joined_at` (ISO, puesto por SQLite al insertar) y, si empata, `rowid` — el mismo orden que ya usan `MEMBER_ORDER` y `leave()`. Salir borra la fila: quien vuelve a unirse cuenta desde su nueva fecha. | Task 3 |
| D4 | Nuevo código `403 NOT_MANAGER` «Solo quien organiza el plan puede hacer esto.» sustituye a `NOT_CREATOR` (la app no depende del código). `ExpressAlert.canResolve` = `canManage`. La tarjeta exprés sin permiso dice «Solo quien organiza el plan puede decidir qué hacer con él.» (ya no nombra al creador, que puede haberse ido). | Task 3 |
| D5 | **Votos de ex-miembros:** se filtran en la única consulta que calcula `voteCount` (`JOIN group_members` por el grupo de la propuesta). Así «la más votada» (`pickWinner`), Inicio y el resumen con IA quedan corregidos sin tocar su código. Los votos no se borran: si la persona vuelve, cuentan otra vez. `myVoteWindowId` no cambia (quien pregunta siempre es miembro). | Task 2 |
| D6 | **Resumen de grupo en Inicio** (`groupSummaries`, única lista de grupos que mira propuestas; `GET /groups` no las usa): la franja elegida (o la primera) de la propuesta **más reciente** no `CANCELADO` con franjas. «Más reciente» = mayor `createdAt`; a igual `createdAt`, la insertada después (`created_at DESC, rowid DESC`, el orden de `GET /groups/:id/proposals`). Antes tomaba la más antigua (`find` sobre `listForUser`, que ordena `created_at, rowid` ascendente); ahora `findLast`. | Task 2 |
| D7 | **N+1:** `hydrate()` hace 1 consulta de filas + 4 fijas (franjas con votos, incidencias, mi voto, miembros de los grupos) con los ids en un solo parámetro JSON (`IN (SELECT value FROM json_each(?))`). `findById`, `listByGroup` y `listForUser` pasan por ahí. Con 0 filas, solo 1 consulta. | Task 1, 3 |
| D8 | **Semilla:** los datos pasan a `src/db/demo-data.ts` → `seedDemoData(db, passwordHash, now)`. Usuarios, grupos y bloques se crean si faltan; los miembros de la semilla que salieron vuelven a entrar (como `MEMBER` si el grupo ya tiene `OWNER`); las **dos propuestas de ejemplo se borran y se recrean** en cada ejecución con fechas relativas a `now`: la confirmada, dentro de **2 días a las 11:00**; la votación abierta cierra **mañana a las 20:00**. Las propuestas creadas desde la app no se tocan. Se mantienen correos, contraseña `password123` y códigos `PROY2026` / `HUECKO123`. | Task 4 |
| D9 | **Proxy:** `TRUST_PROXY` (zod) acepta `false` (por defecto), `true` o un entero ≥ 0 de saltos, sin distinguir mayúsculas; se aplica con `app.set('trust proxy', …)`. Se recomienda el número (con `true` cualquiera falsea su IP; `index.ts` lo avisa). | Task 5 |
| D10 | **Límites de `/auth`:** dos limitadores por IP con contadores separados: `LOGIN_RATE_LIMIT` (20 cada 15 min) y `REGISTER_RATE_LIMIT` (10 cada 15 min). `AppDeps.authRateLimit` desaparece (sustituido por `loginRateLimit` y `registerRateLimit`). | Task 5 |
| D11 | **HEIC:** verificado en `node_modules/expo-image-picker@57.0.20`. iOS galería (PHPicker): con el modo nativo por defecto (`.current`) una foto HEIC se copia tal cual (`.heic`); con `preferredAssetRepresentationMode: Compatible` el sistema entrega JPEG y, con `quality: 0.7`, el módulo lo recomprime a `.jpg`. iOS cámara ya devuelve JPG. Android con `quality < 1` recomprime a `.jpeg` pero `mimeType` sigue diciendo el tipo original (`image/heic`): por eso el tipo real sale **primero de la extensión de `uri`**, luego de `mimeType`, luego de `fileName`. Un nombre con extensión que no cuadra (`IMG_0001.HEIC`) se sube como `horario.jpg`. La validación previa (tipo y 5 MB) se mantiene. | Task 6 |

## Mapa de archivos

**shared/**
| Archivo | Cambio |
|---|---|
| `index.d.ts` | `Proposal.canManage: boolean` (Task 3); comentarios de `TimeWindow.voteCount` (Task 2) y `ExpressAlert.canResolve` (Task 3) |

**backend/**
| Archivo | Responsabilidad |
|---|---|
| `src/proposals/proposals.repository.ts` | `hydrate()` en lote (Task 1); votos solo de miembros (Task 2); `canManage` (Task 3) |
| `src/proposals/permissions.ts` (nuevo) | `canManageProposal`, `proposalManagerId`, `ManagerCandidate`, `ManageCheck` |
| `src/proposals/proposals.routes.ts` | `loadForManager` → `403 NOT_MANAGER` |
| `src/dashboard/dashboard.ts`, `src/me/me.routes.ts` | Grupo con la propuesta más reciente (Task 2); `canResolve = canManage`, sin `userId` (Task 3) |
| `src/db/demo-data.ts` (nuevo), `src/db/seed.ts` | Datos de ejemplo con fechas relativas / CLI |
| `src/config/trust-proxy.ts` (nuevo), `src/config/env.ts`, `.env.example` | `TRUST_PROXY`, `LOGIN_RATE_LIMIT`, `REGISTER_RATE_LIMIT` |
| `src/app.ts`, `src/auth/auth.routes.ts`, `src/index.ts` | `trust proxy` y limitadores separados |
| `test/helpers.ts` | `makeTestApp({ loginRateLimit, registerRateLimit, trustProxy, … })` |
| `test/proposals-batch.test.ts`, `test/member-votes.test.ts`, `test/proposal-permissions.test.ts`, `test/seed.test.ts`, `test/trust-proxy.test.ts` (nuevos) | Tests |
| `test/dashboard.test.ts`, `test/me.test.ts`, `test/proposals.test.ts`, `test/proposals-lifecycle.test.ts`, `test/auth.test.ts` | Ajustes de expectativas |

**mobile/**
| Archivo | Responsabilidad |
|---|---|
| `src/screens/proposals/PlanDetailScreen.tsx`, `ExpressVoteCard.tsx`, `src/screens/dashboard/DashboardScreen.tsx` | Botones de gestión con `canManage` |
| `src/testing/fixtures.ts` | `canManage` en `makeProposal` |
| `src/utils/scheduleImage.ts`, `jest.setup.ts` | Fotos HEIC convertidas a JPG |
| Tests: `PlanDetailScreen.test.tsx`, `ExpressVoteCard.test.tsx`, `src/utils/__tests__/scheduleImage.test.ts` | |

**docs/** `api.md` (Tasks 2, 3, 5, 6) · `README.md` (Tasks 4, 5)

---

### Task 1: Backend — propuestas cargadas en lote (sin N+1)

**Files:**
- Create: `backend/test/proposals-batch.test.ts`
- Modify: `backend/src/proposals/proposals.repository.ts`

**Interfaces:**
- Consumes: `proposalsRepository(db)` (`create`, `findById`, `vote`, `confirm`, `reportIncidence`, `listByGroup`, `listForUser`); helpers `makeTestApp`, `setupSeedGroup`, `bearer`, `NOW`, `DEADLINE`; `Db` (`src/db/database.ts`).
- Produces (interno del repositorio, lo reutilizan los Tasks 2 y 3):
  - `const IN_PROPOSAL_IDS = 'IN (SELECT value FROM json_each(?))'` (el `?` recibe `JSON.stringify(ids)`).
  - `function groupBy<R, T>(rows: readonly R[], keyOf: (row: R) => string, map: (row: R) => T): Map<string, T[]>`.
  - `hydrate(rows: readonly ProposalRow[], viewerId: string): Proposal[]` dentro de `proposalsRepository`.
  - La API pública del repositorio **no cambia** y las respuestas son idénticas byte a byte (lo prueban los tests existentes sin tocarlos).

- [ ] **Step 1: Escribir el test que falla** — `backend/test/proposals-batch.test.ts`:

```ts
import type { Proposal } from '@hueckoapp/shared';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

import type { Db } from '../src/db/database';
import { proposalsRepository } from '../src/proposals/proposals.repository';
import { bearer, DEADLINE, makeTestApp, NOW, setupSeedGroup } from './helpers';

const MINUTE = 60_000;

// Grupo de la semilla con `count` propuestas creadas directamente en el repositorio (rápido): cada una con 2 franjas
// (martes y jueves), el voto de los dos miembros y, una de cada tres, confirmada con una tardanza de Ana.
async function groupWithProposals(count: number) {
  const { app, db } = makeTestApp({ now: () => NOW });
  const seed = await setupSeedGroup(app);
  const repo = proposalsRepository(db);
  const yoId = seed.yo.user.id;
  const anaId = seed.ana.user.id;
  for (let i = 0; i < count; i++) {
    const id = repo.create({
      groupId: seed.group.id,
      createdBy: i % 2 === 0 ? yoId : anaId,
      title: `Plan ${i}`,
      location: i % 2 === 0 ? { name: `Lugar ${i}`, latitude: -12.07, longitude: -77.08 } : null,
      votingDeadline: DEADLINE,
      windows: [
        { dayOfWeek: 4, startTime: '10:00', endTime: '12:00', availabilityPercentage: 50 },
        { dayOfWeek: 2, startTime: '16:00', endTime: '18:00', availabilityPercentage: 100 },
      ],
      createdAt: new Date(NOW.getTime() - (count - i) * MINUTE).toISOString(),
    });
    const [martes, jueves] = repo.findById(id, yoId)!.windows;
    repo.vote(id, yoId, martes.id, NOW.toISOString());
    repo.vote(id, anaId, (i % 2 === 0 ? martes : jueves).id, NOW.toISOString());
    if (i % 3 === 0) {
      repo.confirm(id, martes.id, NOW.toISOString(), '2026-09-29');
      repo.reportIncidence(
        id,
        { userId: anaId, type: 'TARDANZA', reason: `Tráfico ${i}`, delayMinutes: 10, criticality: 'BAJA', createdAt: NOW.toISOString() },
        false,
      );
    }
  }
  return { app, db, repo, ...seed };
}

// Cuántas sentencias SQL prepara `fn` (toda consulta del repositorio pasa por db.prepare).
function countQueries(db: Db, fn: () => unknown): number {
  const spy = vi.spyOn(db, 'prepare');
  try {
    fn();
    return spy.mock.calls.length;
  } finally {
    spy.mockRestore();
  }
}

describe('carga en lote de propuestas (sin N+1)', () => {
  it('listByGroup y listForUser usan las mismas consultas con 1 que con 25 propuestas', async () => {
    const one = await groupWithProposals(1);
    const many = await groupWithProposals(25);
    const listOne = countQueries(one.db, () => one.repo.listByGroup(one.group.id, one.yo.user.id));
    const listMany = countQueries(many.db, () => many.repo.listByGroup(many.group.id, many.yo.user.id));
    expect(listMany).toBe(listOne);
    expect(listMany).toBeLessThanOrEqual(5);
    const mineOne = countQueries(one.db, () => one.repo.listForUser(one.yo.user.id));
    const mineMany = countQueries(many.db, () => many.repo.listForUser(many.yo.user.id));
    expect(mineMany).toBe(mineOne);
    expect(mineMany).toBeLessThanOrEqual(5);
  });

  it('sin propuestas hace una sola consulta', async () => {
    const empty = await groupWithProposals(0);
    let result: Proposal[] = [];
    expect(countQueries(empty.db, () => (result = empty.repo.listByGroup(empty.group.id, empty.yo.user.id)))).toBe(1);
    expect(result).toEqual([]);
  });

  it('con 25 propuestas cada una trae sus franjas, votos, incidencias y el voto de quien pregunta', async () => {
    const { app, yo, ana, group } = await groupWithProposals(25);
    const res = await request(app).get(`/api/groups/${group.id}/proposals`).set(bearer(yo.token));
    expect(res.status).toBe(200);
    const list: Proposal[] = res.body;
    expect(list.map((p) => p.title)).toEqual(Array.from({ length: 25 }, (_, k) => `Plan ${24 - k}`));
    for (const p of list) {
      const i = Number(p.title.slice(5));
      const [martes, jueves] = p.windows;
      expect([martes.dayOfWeek, jueves.dayOfWeek]).toEqual([2, 4]);
      expect([martes.voteCount, jueves.voteCount]).toEqual(i % 2 === 0 ? [2, 0] : [1, 1]);
      expect(p.myVoteWindowId).toBe(martes.id);
      expect(p.createdBy.id).toBe(i % 2 === 0 ? yo.user.id : ana.user.id);
      expect(p.location).toEqual(i % 2 === 0 ? { name: `Lugar ${i}`, latitude: -12.07, longitude: -77.08 } : null);
      expect(p.state).toBe(i % 3 === 0 ? 'CONFIRMADO' : 'PROPUESTO');
      expect(p.incidences.map((x) => x.reason)).toEqual(i % 3 === 0 ? [`Tráfico ${i}`] : []);
      // El detalle de cada una es el mismo objeto que en la lista.
      expect((await request(app).get(`/api/proposals/${p.id}`).set(bearer(yo.token))).body).toEqual(p);
    }
    // Cada persona ve su propio voto.
    const deAna: Proposal[] = (await request(app).get(`/api/groups/${group.id}/proposals`).set(bearer(ana.token))).body;
    for (const p of deAna) {
      expect(p.myVoteWindowId).toBe(p.windows[Number(p.title.slice(5)) % 2 === 0 ? 0 : 1].id);
    }
  });
});
```

- [ ] **Step 2: Ejecutar y ver que falla** — `TZ=America/Lima npx vitest run test/proposals-batch.test.ts` (dentro de `backend/`) → FAIL en el primer test: con 25 propuestas se preparan 76 consultas (3 por propuesta + 1) frente a 4.

- [ ] **Step 3: Implementar la carga en lote** — en `backend/src/proposals/proposals.repository.ts`:

1. Sustituir los tipos `WindowRow` e `IncidenceRow` (líneas 26–38) por:

```ts
type WindowRow = {
  id: string;
  proposal_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  availability_percentage: number;
  vote_count: number;
};
type IncidenceRow = {
  id: string;
  proposal_id: string;
  user_id: string;
  user_name: string;
  user_email: string;
  type: IncidenceType;
  reason: string;
  delay_minutes: number | null;
  criticality: Criticality;
  resolved: number;
  created_at: string;
};
type MyVoteRow = { proposal_id: string; window_id: string };
```

2. Justo después de la constante `SELECT_PROPOSAL` (antes de `export function proposalsRepository`), añadir:

```ts
// Los ids de las propuestas van en UN parámetro JSON (json_each): la misma sentencia sirve para 1 o para 500
// propuestas y no choca con el límite de parámetros de SQLite. Uso: `WHERE x.proposal_id ${IN_PROPOSAL_IDS}`.
const IN_PROPOSAL_IDS = 'IN (SELECT value FROM json_each(?))';

/** Agrupa filas por clave conservando su orden (el ORDER BY de la consulta). */
function groupBy<R, T>(rows: readonly R[], keyOf: (row: R) => string, map: (row: R) => T): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const row of rows) {
    const key = keyOf(row);
    const list = out.get(key);
    if (list) list.push(map(row));
    else out.set(key, [map(row)]);
  }
  return out;
}

const toWindow = (r: WindowRow): TimeWindow => ({
  id: r.id,
  dayOfWeek: r.day_of_week,
  startTime: r.start_time,
  endTime: r.end_time,
  availabilityPercentage: r.availability_percentage,
  voteCount: r.vote_count,
});

const toIncidence = (r: IncidenceRow): Incidence => ({
  id: r.id,
  user: { id: r.user_id, name: r.user_name, email: r.user_email },
  type: r.type,
  reason: r.reason,
  delayMinutes: r.delay_minutes,
  criticality: r.criticality,
  resolved: r.resolved === 1,
  createdAt: r.created_at,
});
```

3. Dentro de `proposalsRepository`, sustituir `windowsOf`, `incidencesOf`, `myVote` y `toProposal` (líneas 69–131) por:

```ts
  /**
   * Completa las filas con sus franjas (y votos), incidencias y el voto de `viewerId` con un número FIJO de consultas,
   * sin importar cuántas propuestas haya (antes eran 3 por propuesta: N+1). `viewerId` decide myVoteWindowId:
   * la misma propuesta se ve distinta según quién pregunta. Mismo orden y mismas claves que antes.
   */
  const hydrate = (rows: readonly ProposalRow[], viewerId: string): Proposal[] => {
    if (rows.length === 0) return [];
    const ids = JSON.stringify(rows.map((r) => r.id));
    const windows = groupBy(
      db
        .prepare(
          `SELECT w.id, w.proposal_id, w.day_of_week, w.start_time, w.end_time, w.availability_percentage,
                  COUNT(v.user_id) AS vote_count
           FROM proposal_windows w
           LEFT JOIN votes v ON v.window_id = w.id
           WHERE w.proposal_id ${IN_PROPOSAL_IDS}
           GROUP BY w.id
           ORDER BY w.day_of_week, w.start_time, w.end_time`,
        )
        .all(ids) as WindowRow[],
      (r) => r.proposal_id,
      toWindow,
    );
    const incidences = groupBy(
      db
        .prepare(
          `SELECT i.*, u.name AS user_name, u.email AS user_email
           FROM incidences i JOIN users u ON u.id = i.user_id
           WHERE i.proposal_id ${IN_PROPOSAL_IDS}
           ORDER BY i.created_at, i.rowid`,
        )
        .all(ids) as IncidenceRow[],
      (r) => r.proposal_id,
      toIncidence,
    );
    const myVotes = new Map(
      (db.prepare(`SELECT proposal_id, window_id FROM votes WHERE user_id = ? AND proposal_id ${IN_PROPOSAL_IDS}`).all(viewerId, ids) as MyVoteRow[]).map(
        (r) => [r.proposal_id, r.window_id] as const,
      ),
    );
    return rows.map((row) => ({
      id: row.id,
      groupId: row.group_id,
      title: row.title,
      location: row.location_name === null ? null : { name: row.location_name, latitude: row.latitude, longitude: row.longitude },
      createdBy: { id: row.created_by, name: row.creator_name, email: row.creator_email },
      votingDeadline: row.voting_deadline,
      state: row.state,
      windows: windows.get(row.id) ?? [],
      myVoteWindowId: myVotes.get(row.id) ?? null,
      chosenWindowId: row.chosen_window_id,
      scheduledAt: row.scheduled_at,
      scheduledDate: row.scheduled_date,
      incidences: incidences.get(row.id) ?? [],
      createdAt: row.created_at,
    }));
  };
```

4. En el objeto devuelto, sustituir `findById`, `listByGroup` y `listForUser` por:

```ts
    findById(id: string, viewerId: string): Proposal | undefined {
      const row = db.prepare(`${SELECT_PROPOSAL} WHERE p.id = ?`).get(id) as ProposalRow | undefined;
      return row ? hydrate([row], viewerId)[0] : undefined;
    },

    // Las más recientes primero (C10); a igual createdAt, la última insertada.
    listByGroup(groupId: string, viewerId: string): Proposal[] {
      const rows = db.prepare(`${SELECT_PROPOSAL} WHERE p.group_id = ? ORDER BY p.created_at DESC, p.rowid DESC`).all(groupId) as ProposalRow[];
      return hydrate(rows, viewerId);
    },
```

```ts
    // Todas las propuestas de mis grupos, de la más antigua a la más reciente (created_at, rowid): Inicio y /me/upcoming-plans.
    listForUser(userId: string): ProposalWithGroup[] {
      const rows = db
        .prepare(`${SELECT_PROPOSAL} JOIN group_members m ON m.group_id = p.group_id AND m.user_id = ? ORDER BY p.created_at, p.rowid`)
        .all(userId) as ProposalRow[];
      return hydrate(rows, userId).map((p, i) => ({ ...p, groupName: rows[i].group_name }));
    },
```

Los demás métodos (`create`, `addWindow`, `vote`, `unvote`, `confirm`, `setState`, `reportIncidence`, `resolveIncidences`) no se tocan.

- [ ] **Step 4: Ejecutar y ver que pasa** — `TZ=America/Lima npm test -w backend` → PASS, **incluidos todos los tests existentes sin modificarlos** (prueban que las respuestas son idénticas). `npm run typecheck` → sin errores.

- [ ] **Step 5: Commit** — `git add backend/src/proposals/proposals.repository.ts backend/test/proposals-batch.test.ts` → `perf(backend): carga en lote de franjas, votos e incidencias al listar propuestas`

---

### Task 2: Backend — votos de quien sale del grupo y resumen de grupo con la propuesta más reciente

**Files:**
- Create: `backend/test/member-votes.test.ts`
- Modify: `backend/src/proposals/proposals.repository.ts`, `backend/src/dashboard/dashboard.ts`, `backend/test/dashboard.test.ts`, `backend/test/me.test.ts`, `shared/index.d.ts`, `docs/api.md`

**Interfaces:**
- Consumes: `hydrate()` e `IN_PROPOSAL_IDS` (Task 1); `summaryData(p, group, now)` (`src/ai/voting-summary.ts`); helpers `makeTestApp`, `setupSeedGroup`, `registerUser`, `joinGroup`, `createProposal`, `voteFor`, `windowOf`, `bearer`, `NOW`, `DEADLINE`.
- Produces:
  - `TimeWindow.voteCount` = votos de **miembros actuales** del grupo de la propuesta (mismo tipo `number`).
  - `groupSummaries(groups: readonly GroupSummary[], proposals: readonly ProposalWithGroup[]): DashboardGroup[]` — misma firma; ahora usa la propuesta más reciente. Precondición documentada: `proposals` en el orden de `listForUser` (más antigua → más reciente).

- [ ] **Step 1: Escribir los tests que fallan**

`backend/test/member-votes.test.ts`:

```ts
import type { Dashboard, Group, Proposal, User } from '@hueckoapp/shared';
import type { Express } from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';

import { summaryData } from '../src/ai/voting-summary';
import type { Db } from '../src/db/database';
import { bearer, createProposal, DEADLINE, joinGroup, makeTestApp, NOW, registerUser, setupSeedGroup, voteFor, windowOf } from './helpers';

let app: Express;
let db: Db;
let yo: { token: string; user: User };
let ana: { token: string; user: User };
let carlos: { token: string; user: User };
let group: Group;

beforeEach(async () => {
  ({ app, db } = makeTestApp({ now: () => NOW }));
  ({ yo, ana, group } = await setupSeedGroup(app));
  carlos = await registerUser(app, { name: 'Carlos' });
  await joinGroup(app, carlos.token, group.inviteCode);
});

const leave = async (token: string) =>
  expect((await request(app).delete(`/api/groups/${group.id}/members/me`).set(bearer(token))).status).toBe(204);
const getProposal = async (id: string, token = yo.token): Promise<Proposal> =>
  (await request(app).get(`/api/proposals/${id}`).set(bearer(token))).body;
const votesInDb = (proposalId: string) =>
  (db.prepare('SELECT COUNT(*) AS n FROM votes WHERE proposal_id = ?').get(proposalId) as { n: number }).n;

// Martes 16–18 y jueves 10–12: yo vota el martes; Ana y Carlos, el jueves.
async function votedPlan() {
  const p = await createProposal(app, yo.token, group.id, {
    votingDeadline: DEADLINE,
    windows: [
      { dayOfWeek: 2, startTime: '16:00', endTime: '18:00' },
      { dayOfWeek: 4, startTime: '10:00', endTime: '12:00' },
    ],
  });
  await voteFor(app, p.id, windowOf(p, 2).id, yo.token);
  await voteFor(app, p.id, windowOf(p, 4).id, ana.token);
  await voteFor(app, p.id, windowOf(p, 4).id, carlos.token);
  return p;
}

describe('votos de quien sale del grupo (D5)', () => {
  it('dejan de contar pero no se borran, y vuelven a contar si la persona vuelve', async () => {
    const p = await votedPlan();
    expect((await getProposal(p.id)).windows.map((w) => w.voteCount)).toEqual([1, 2]);
    await leave(carlos.token);
    expect((await getProposal(p.id)).windows.map((w) => w.voteCount)).toEqual([1, 1]);
    expect(votesInDb(p.id)).toBe(3);
    await joinGroup(app, carlos.token, group.inviteCode);
    const back = await getProposal(p.id, carlos.token);
    expect(back.windows.map((w) => w.voteCount)).toEqual([1, 2]);
    expect(back.myVoteWindowId).toBe(windowOf(p, 4).id);
  });

  it('«la más votada» al confirmar solo cuenta a los miembros actuales', async () => {
    const p = await votedPlan();
    await leave(ana.token);
    await leave(carlos.token);
    const res = await request(app).post(`/api/proposals/${p.id}/confirm`).set(bearer(yo.token)).send({});
    expect(res.status).toBe(200);
    expect(res.body.chosenWindowId).toBe(windowOf(p, 2).id);
  });

  it('si solo votó alguien que se fue, confirmar sin franja → 409 NO_VOTES', async () => {
    const p = await createProposal(app, yo.token, group.id, { votingDeadline: DEADLINE, windows: [{ dayOfWeek: 2, startTime: '16:00', endTime: '18:00' }] });
    await voteFor(app, p.id, windowOf(p, 2).id, carlos.token);
    await leave(carlos.token);
    const res = await request(app).post(`/api/proposals/${p.id}/confirm`).set(bearer(yo.token)).send({});
    expect([res.status, res.body.error.code]).toEqual([409, 'NO_VOTES']);
  });

  it('Inicio y los datos del resumen con IA tampoco los cuentan', async () => {
    const p = await votedPlan();
    await leave(carlos.token);
    const d: Dashboard = (await request(app).get('/api/me/dashboard').set(bearer(yo.token))).body;
    expect(d.pendingVotes.find((x) => x.id === p.id)!.windows.map((w) => w.voteCount)).toEqual([1, 1]);
    const current: Group = (await request(app).get(`/api/groups/${group.id}`).set(bearer(yo.token))).body;
    const data = summaryData(await getProposal(p.id), current, NOW);
    expect([data.integrantes, data.votosEmitidos, data.franjas.map((f) => f.votos)]).toEqual([2, 2, [1, 1]]);
  });
});
```

`backend/test/dashboard.test.ts`:

1. En el test `'valores esperados'`, sustituir la expectativa de `d.groups` por:

```ts
    // D6: el grupo muestra su propuesta más reciente (prop_2, creada después), no la más antigua.
    expect(d.groups).toEqual([
      { id: 'g1', name: 'Proyecto Integrador', memberCount: 2, nextWindow: { dayOfWeek: 2, startTime: '16:00', endTime: '18:00', availabilityPercentage: 100 } },
    ]);
```

2. Renombrar el test `'tras CANCELAR: sin próximo plan ni alerta; el grupo pasa a w_21; las horas bajan a 4 (las canceladas no cuentan)'` a `'tras CANCELAR: sin próximo plan ni alerta; el grupo sigue en w_21 (la más reciente); las horas bajan a 4 (las canceladas no cuentan)'` (el cuerpo no cambia).

3. Añadir al final del archivo:

```ts
describe('resumen por grupo (D6: la propuesta más reciente)', () => {
  it('si la más reciente está cancelada, usa la anterior', () => {
    const d = build([prop1(), prop2({ state: 'CANCELADO' })]);
    expect(d.groups[0].nextWindow).toEqual({ dayOfWeek: 3, startTime: '11:00', endTime: '13:00', availabilityPercentage: 100 });
  });

  it('de la más reciente toma la franja elegida si está confirmada', () => {
    const newer = prop1({
      id: 'prop_9',
      createdAt: new Date(2026, 8, 29, 9, 30).toISOString(),
      windows: [win('w_91', 1, '12:00', '14:00', 100, 0), win('w_92', 4, '10:00', '12:00', 80, 2)],
      chosenWindowId: 'w_92',
    });
    const d = build([prop1(), prop2(), newer]);
    expect(d.groups[0].nextWindow).toEqual({ dayOfWeek: 4, startTime: '10:00', endTime: '12:00', availabilityPercentage: 80 });
  });

  it('sin propuestas con franjas, nextWindow es null', () => {
    expect(build([prop2({ windows: [] })]).groups[0].nextWindow).toBeNull();
  });
});
```

`backend/test/me.test.ts`:

1. En `'de punta a punta con la semilla montada por la API'`, sustituir la expectativa de `d.groups` por:

```ts
    // D6: la propuesta más reciente del grupo es prop2 (martes 16–18, 100 %).
    expect(d.groups).toEqual([
      { id: group.id, name: 'Proyecto Integrador', memberCount: 2, nextWindow: { dayOfWeek: 2, startTime: '16:00', endTime: '18:00', availabilityPercentage: 100 } },
    ]);
```

2. Añadir dentro de `describe('GET /api/me/dashboard', …)`:

```ts
  it('el resumen del grupo sigue a la propuesta más reciente; si se cancela, vuelve a la anterior', async () => {
    const { prop2 } = await seedProposals();
    expect(((await get('dashboard', yo.token)).body as Dashboard).groups[0].nextWindow).toMatchObject({ dayOfWeek: 2, startTime: '16:00' });
    expect((await request(app).post(`/api/proposals/${prop2.id}/cancel`).set(bearer(ana.token))).status).toBe(200);
    // prop1 está confirmada: se muestra su franja elegida (miércoles 11–13).
    expect(((await get('dashboard', yo.token)).body as Dashboard).groups[0].nextWindow).toEqual({
      dayOfWeek: 3, startTime: '11:00', endTime: '13:00', availabilityPercentage: 100,
    });
  });
```

- [ ] **Step 2: Ejecutar y ver que fallan** — `TZ=America/Lima npx vitest run test/member-votes.test.ts test/dashboard.test.ts test/me.test.ts` (en `backend/`) → FAIL: `voteCount` sigue en `[1, 2]` tras salir Carlos; `nextWindow` sigue siendo el miércoles 11–13.

- [ ] **Step 3: Implementar**

`backend/src/proposals/proposals.repository.ts` — en `hydrate()`, sustituir la consulta de franjas por:

```ts
    // voteCount solo cuenta a quienes SIGUEN en el grupo de la propuesta (D5): el voto de quien sale no se borra,
    // pero no suma; si vuelve a unirse, cuenta otra vez. De aquí salen pickWinner, Inicio y el resumen con IA.
    const windows = groupBy(
      db
        .prepare(
          `SELECT w.id, w.proposal_id, w.day_of_week, w.start_time, w.end_time, w.availability_percentage,
                  COUNT(m.user_id) AS vote_count
           FROM proposal_windows w
           JOIN proposals p ON p.id = w.proposal_id
           LEFT JOIN votes v ON v.window_id = w.id
           LEFT JOIN group_members m ON m.group_id = p.group_id AND m.user_id = v.user_id
           WHERE w.proposal_id ${IN_PROPOSAL_IDS}
           GROUP BY w.id
           ORDER BY w.day_of_week, w.start_time, w.end_time`,
        )
        .all(ids) as WindowRow[],
      (r) => r.proposal_id,
      toWindow,
    );
```

`backend/src/dashboard/dashboard.ts` — sustituir `groupSummaries` (comentario incluido) por:

```ts
/**
 * Resumen por grupo (D6): la franja elegida (o la primera) de su propuesta MÁS RECIENTE que no esté cancelada y tenga
 * franjas. «Más reciente» = mayor createdAt y, a igual createdAt, la insertada después: el orden de GET /groups/:id/proposals.
 * `proposals` llega de listForUser, de la más antigua a la más reciente (created_at, rowid): basta buscar desde el final.
 */
export function groupSummaries(groups: readonly GroupSummary[], proposals: readonly ProposalWithGroup[]): DashboardGroup[] {
  return groups.map((g) => {
    const p = proposals.findLast((x) => x.groupId === g.id && x.state !== 'CANCELADO' && x.windows.length > 0);
    const w = p ? (p.windows.find((x) => x.id === p.chosenWindowId) ?? p.windows[0]) : undefined;
    return {
      id: g.id,
      name: g.name,
      memberCount: g.memberCount,
      nextWindow: w ? { dayOfWeek: w.dayOfWeek, startTime: w.startTime, endTime: w.endTime, availabilityPercentage: w.availabilityPercentage } : null,
    };
  });
}
```

- [ ] **Step 4: Contrato**

`shared/index.d.ts` — en `TimeWindow`, cambiar la línea `voteCount: number;` por:

```ts
  voteCount: number;               // solo votos de quienes siguen en el grupo (los de quien salió se conservan, pero no cuentan)
```

`docs/api.md`:

1. Después de la línea `` `404 PROPOSAL_NOT_FOUND` · `403 NOT_A_MEMBER` si no soy miembro de su grupo. (Igual en todas las rutas `/proposals/:id/...`.) `` (sección `GET /proposals/:id`), añadir un párrafo:

```markdown

**Votos de quien ya no está:** `voteCount` solo cuenta los votos de quienes **siguen** en el grupo. Si alguien sale, su voto no se borra, pero deja de contar en `voteCount`, en «la más votada» al confirmar, en `GET /me/dashboard` y en el resumen con IA; si vuelve a unirse, cuenta otra vez.
```

2. En `DELETE /groups/:id/members/me`, al final de la línea `Salir del grupo. \`204\`. … Si no queda nadie, el grupo se borra.` añadir: ` Sus votos se conservan, pero no cuentan mientras no vuelva (ver \`GET /proposals/:id\`).`

3. En `GET /me/dashboard`, sustituir la viñeta de `groups` por:

```markdown
- `groups`: uno por grupo (en el orden de `GET /groups`), con `nextWindow` = la franja elegida (o, si no hay, la primera) de su propuesta **más reciente** que no esté `CANCELADO` y tenga franjas. «Más reciente» = mayor `createdAt`; a igual `createdAt`, la creada después (el orden de `GET /groups/:id/proposals`). `null` si no hay ninguna.
```

- [ ] **Step 5: Ejecutar y ver que pasa** — `TZ=America/Lima npm test -w backend` → PASS (también `proposals-batch.test.ts`: todos siguen siendo miembros). `npm run typecheck` → sin errores.

- [ ] **Step 6: Commit** — `git add backend/src/proposals/proposals.repository.ts backend/src/dashboard/dashboard.ts backend/test/member-votes.test.ts backend/test/dashboard.test.ts backend/test/me.test.ts shared/index.d.ts docs/api.md` → `fix(backend): los votos de quien sale del grupo no cuentan y cada grupo se resume con su propuesta más reciente`

---

### Task 3: Quién gestiona un plan (`canManage`) — backend, contrato y app

**Files:**
- Create: `backend/src/proposals/permissions.ts`, `backend/test/proposal-permissions.test.ts`
- Modify: `backend/src/proposals/proposals.repository.ts`, `backend/src/proposals/proposals.routes.ts`, `backend/src/dashboard/dashboard.ts`, `backend/src/me/me.routes.ts`, `backend/test/proposals.test.ts`, `backend/test/proposals-lifecycle.test.ts`, `backend/test/dashboard.test.ts`, `shared/index.d.ts`, `docs/api.md`, `mobile/src/testing/fixtures.ts`, `mobile/src/screens/proposals/PlanDetailScreen.tsx`, `mobile/src/screens/proposals/ExpressVoteCard.tsx`, `mobile/src/screens/dashboard/DashboardScreen.tsx`, `mobile/src/screens/proposals/__tests__/PlanDetailScreen.test.tsx`, `mobile/src/screens/proposals/__tests__/ExpressVoteCard.test.tsx`

**Interfaces:**
- Consumes: `hydrate()`, `groupBy`, `IN_PROPOSAL_IDS` (Tasks 1–2); `GroupMember` (`shared`); `loadForMember` de `proposalsContext`; helpers `makeTestApp`, `registerUser`, `createGroup`, `joinGroup`, `createProposal`, `voteFor`, `windowOf`, `bearer`, `NOW`, `DEADLINE`.
- Produces:
  - `shared`: `Proposal.canManage: boolean` (para el usuario que pregunta; también en `ProposalWithGroup` y `UpcomingPlan`).
  - `src/proposals/permissions.ts`: `type ManagerCandidate = Pick<GroupMember, 'id' | 'role'>`; `type ManageCheck = { viewerId: string; creatorId: string; members: readonly ManagerCandidate[] }`; `proposalManagerId(creatorId: string, members: readonly ManagerCandidate[]): string | null`; `canManageProposal(check: ManageCheck): boolean`.
  - Rutas `confirm`, `cancel`, `incidences/resolve`: `403 NOT_MANAGER` «Solo quien organiza el plan puede hacer esto.»
  - `src/dashboard/dashboard.ts`: `expressAlertFor(proposals: readonly ProposalWithGroup[], now: Date): ExpressAlert | null` (sin `userId`; `canResolve = p.canManage`); `buildDashboard(input: { now; groups; proposals; totalBlocks; membersOf })` (sin `userId`).
  - mobile: `ExpressVoteCard` pierde la prop `creatorName`; `makeProposal()` rellena `canManage = (createdBy ?? ANA).id === TEST_USER.id` salvo que se pase.

- [ ] **Step 1: Escribir los tests del backend que fallan** — `backend/test/proposal-permissions.test.ts`:

```ts
import type { Dashboard, Group, Proposal, User } from '@hueckoapp/shared';
import type { Express } from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';

import type { Db } from '../src/db/database';
import { canManageProposal, proposalManagerId } from '../src/proposals/permissions';
import { bearer, createGroup, createProposal, DEADLINE, joinGroup, makeTestApp, NOW, registerUser, voteFor, windowOf } from './helpers';

describe('canManageProposal (D1)', () => {
  const owner = { id: 'o', role: 'OWNER' as const };
  const ana = { id: 'a', role: 'MEMBER' as const };
  const carlos = { id: 'c', role: 'MEMBER' as const };

  it('quien la creó, mientras sea miembro', () => {
    expect(proposalManagerId('a', [owner, ana, carlos])).toBe('a');
    expect(canManageProposal({ viewerId: 'a', creatorId: 'a', members: [owner, ana, carlos] })).toBe(true);
    expect(canManageProposal({ viewerId: 'o', creatorId: 'a', members: [owner, ana, carlos] })).toBe(false);
  });

  it('si quien la creó se fue, el OWNER (aunque no sea el primero de la lista)', () => {
    expect(proposalManagerId('x', [ana, owner, carlos])).toBe('o');
  });

  it('sin OWNER (dato roto), quien lleva más tiempo: el primero en orden de llegada', () => {
    expect(proposalManagerId('x', [carlos, ana])).toBe('c');
  });

  it('sin miembros, nadie', () => {
    expect(proposalManagerId('x', [])).toBeNull();
    expect(canManageProposal({ viewerId: 'x', creatorId: 'x', members: [] })).toBe(false);
  });
});

describe('canManage en la API', () => {
  let app: Express;
  let db: Db;
  let yo: { token: string; user: User };
  let ana: { token: string; user: User };
  let carlos: { token: string; user: User };
  let group: Group;

  beforeEach(async () => {
    ({ app, db } = makeTestApp({ now: () => NOW }));
    yo = await registerUser(app, { name: 'Usuario de Prueba' });
    ana = await registerUser(app, { name: 'Ana' });
    carlos = await registerUser(app, { name: 'Carlos' });
    group = await createGroup(app, yo.token); // yo = OWNER
    await joinGroup(app, ana.token, group.inviteCode);
    await joinGroup(app, carlos.token, group.inviteCode);
  });

  const leave = (token: string) => request(app).delete(`/api/groups/${group.id}/members/me`).set(bearer(token));
  const canManage = async (proposalId: string, token: string): Promise<boolean> =>
    (await request(app).get(`/api/proposals/${proposalId}`).set(bearer(token))).body.canManage;
  const planBy = (token: string) =>
    createProposal(app, token, group.id, { votingDeadline: DEADLINE, windows: [{ dayOfWeek: 2, startTime: '16:00', endTime: '18:00' }] });
  const post = (path: string, token: string, body: object = {}) =>
    request(app).post(`/api/proposals/${path}`).set(bearer(token)).send(body);

  it('quien la creó la gestiona; el OWNER y los demás no (403 NOT_MANAGER)', async () => {
    const p = await planBy(ana.token);
    expect(p.canManage).toBe(true);
    expect([await canManage(p.id, yo.token), await canManage(p.id, carlos.token)]).toEqual([false, false]);
    const res = await post(`${p.id}/cancel`, yo.token);
    expect([res.status, res.body.error.code, res.body.error.message]).toEqual([403, 'NOT_MANAGER', 'Solo quien organiza el plan puede hacer esto.']);
  });

  it('la lista del grupo trae canManage de cada propuesta para quien pregunta', async () => {
    const deAna = await planBy(ana.token);
    const deYo = await planBy(yo.token);
    const list: Proposal[] = (await request(app).get(`/api/groups/${group.id}/proposals`).set(bearer(ana.token))).body;
    expect(list.map((p) => [p.id, p.canManage])).toEqual([[deYo.id, false], [deAna.id, true]]);
  });

  it('si quien la creó se va, la gestiona el OWNER: confirma, resuelve y cancela', async () => {
    const p = await planBy(ana.token);
    await voteFor(app, p.id, windowOf(p, 2).id, carlos.token);
    expect((await leave(ana.token)).status).toBe(204);
    expect([await canManage(p.id, yo.token), await canManage(p.id, carlos.token)]).toEqual([true, false]);
    expect((await post(`${p.id}/confirm`, carlos.token)).status).toBe(403);
    expect((await post(`${p.id}/confirm`, yo.token)).body.state).toBe('CONFIRMADO');
    await post(`${p.id}/incidences`, carlos.token, { type: 'IMPREVISTO', reason: 'Examen' });
    expect((await post(`${p.id}/incidences/resolve`, yo.token, { newState: 'CONFIRMADO' })).status).toBe(200);
    expect((await post(`${p.id}/cancel`, yo.token)).body.state).toBe('CANCELADO');
  });

  it('si se van quien la creó y el OWNER, la gestiona quien lleva más tiempo (nunca queda huérfana)', async () => {
    const dani = await registerUser(app, { name: 'Dani' });
    await joinGroup(app, dani.token, group.inviteCode);
    const p = await planBy(ana.token);
    // Dani figura como más antiguo que Carlos aunque se unió después: manda joined_at (D3).
    db.prepare('UPDATE group_members SET joined_at = ? WHERE user_id = ?').run('2000-01-01T00:00:00.000Z', dani.user.id);
    await leave(ana.token);
    await leave(yo.token); // C6: el rol OWNER pasa a Dani
    expect([await canManage(p.id, dani.token), await canManage(p.id, carlos.token)]).toEqual([true, false]);
    expect((await post(`${p.id}/cancel`, dani.token)).status).toBe(200);
  });

  it('sin OWNER en la base (dato roto), gestiona el miembro más antiguo', async () => {
    const p = await planBy(ana.token);
    await leave(ana.token);
    db.prepare("UPDATE group_members SET role = 'MEMBER' WHERE group_id = ?").run(group.id);
    // yo entró primero (creó el grupo); Carlos, después.
    expect([await canManage(p.id, yo.token), await canManage(p.id, carlos.token)]).toEqual([true, false]);
  });

  it('si quien la creó vuelve al grupo, vuelve a gestionarla', async () => {
    const p = await planBy(ana.token);
    await leave(ana.token);
    expect(await canManage(p.id, yo.token)).toBe(true);
    await joinGroup(app, ana.token, group.inviteCode);
    expect([await canManage(p.id, ana.token), await canManage(p.id, yo.token)]).toEqual([true, false]);
  });

  it('la alerta de Inicio usa la misma regla (canResolve)', async () => {
    const p = await planBy(ana.token);
    await voteFor(app, p.id, windowOf(p, 2).id, ana.token);
    await post(`${p.id}/confirm`, ana.token); // martes 16:00 de hoy: aún no ocurrió
    await post(`${p.id}/incidences`, carlos.token, { type: 'IMPREVISTO', reason: 'Examen' });
    const alertOf = async (token: string) => ((await request(app).get('/api/me/dashboard').set(bearer(token))).body as Dashboard).expressAlert;
    expect([(await alertOf(ana.token))?.canResolve, (await alertOf(yo.token))?.canResolve]).toEqual([true, false]);
    await leave(ana.token);
    expect((await alertOf(yo.token))?.canResolve).toBe(true);
  });
});
```

Ajustes de tests existentes (siguen describiendo lo mismo con el contrato nuevo):
- `backend/test/proposals.test.ts`, test `'con franjas: 201, …'`: en el `toEqual`, añadir `canManage: true,` justo después de `myVoteWindowId: null,`.
- `backend/test/proposals-lifecycle.test.ts`:
  - Test `'solo quien la creó: 403 NOT_CREATOR'` → renombrar a `'solo quien la gestiona: 403 NOT_MANAGER'` y cambiar la expectativa a `[403, 'NOT_MANAGER', 'Solo quien organiza el plan puede hacer esto.']`.
  - Test `'403 NOT_CREATOR si no la creé'` → renombrar a `'403 NOT_MANAGER si no la gestiono'` y `.toBe('NOT_MANAGER')`.
  - Test `'403 si no la creé; 400 con un estado inválido; 409 si no está confirmada'`: `.toBe('NOT_CREATOR')` → `.toBe('NOT_MANAGER')`.
- `backend/test/dashboard.test.ts`:
  - Fixture `prop1`: en la línea `windows: [win('w_1', 3, '11:00', '13:00', 100, 2)], myVoteWindowId: 'w_1', chosenWindowId: 'w_1',` añadir `canManage: true,` después de `myVoteWindowId: 'w_1',`.
  - Fixture `prop2`: en la línea `myVoteWindowId: null, chosenWindowId: null, scheduledAt: null, scheduledDate: null, incidences: [],` añadir `canManage: false,` después de `myVoteWindowId: null,` (quien mira es «Usuario de Prueba» y prop_2 es de Ana).
  - Sustituir el helper `build` por:

```ts
const build = (proposals: ProposalWithGroup[]) =>
  buildDashboard({ now: NOW, groups, proposals, totalBlocks: 2, membersOf: () => members });
```

  - Sustituir el test `'EN_RECOORDINACION tiene prioridad y usa la incidencia ALTA; canResolve solo para quien la creó'` por:

```ts
  it('EN_RECOORDINACION tiene prioridad y usa la incidencia ALTA; canResolve es el canManage del plan', () => {
    const aviso = prop1();
    const recoordinacion = prop1({
      id: 'prop_3', title: 'Presentación', state: 'EN_RECOORDINACION', canManage: false,
      incidences: [
        incidence({ id: 'i1', type: 'TARDANZA', delayMinutes: 10, criticality: 'BAJA', reason: 'Tráfico' }),
        incidence({ id: 'i2', type: 'FALTA', criticality: 'ALTA', reason: 'Enferma' }),
      ],
    });
    expect(build([aviso, recoordinacion]).expressAlert).toMatchObject({ proposalId: 'prop_3', kind: 'RECOORDINACION', who: 'Ana', reason: 'Enferma', canResolve: false });
    // Control positivo: el mismo plan, gestionable por quien pregunta (p. ej. el OWNER si quien lo creó se fue).
    expect(build([aviso, { ...recoordinacion, canManage: true }]).expressAlert?.canResolve).toBe(true);
  });
```

- [ ] **Step 2: Ejecutar y ver que fallan** — `TZ=America/Lima npm test -w backend` → FAIL: no existe `src/proposals/permissions.ts`; `canManage` es `undefined`; el código sigue siendo `NOT_CREATOR`.

- [ ] **Step 3: Implementar el backend**

`backend/src/proposals/permissions.ts`:

```ts
import type { GroupMember } from '@hueckoapp/shared';

// Lo mínimo de un miembro para decidir quién gestiona. `members` va SIEMPRE en orden de llegada al grupo
// (joined_at y, si empatan, rowid), como lo devuelven groupsRepository y proposalsRepository.
export type ManagerCandidate = Pick<GroupMember, 'id' | 'role'>;

export type ManageCheck = { viewerId: string; creatorId: string; members: readonly ManagerCandidate[] };

/**
 * Quién gestiona (confirma, cancela, reprograma, resuelve) una propuesta, para que ninguna quede huérfana (D1–D3):
 * 1. quien la creó, mientras siga en el grupo;
 * 2. si no, el OWNER: es quien creó el grupo y, si también se fue, C6 ya le pasó el rol a quien lleva más tiempo;
 * 3. si no hubiera OWNER (no debería pasar), quien lleva más tiempo en el grupo.
 * null solo si el grupo no tiene miembros (entonces ya se borró).
 */
export function proposalManagerId(creatorId: string, members: readonly ManagerCandidate[]): string | null {
  if (members.some((m) => m.id === creatorId)) return creatorId;
  return (members.find((m) => m.role === 'OWNER') ?? members[0])?.id ?? null;
}

/**
 * Punto único de la regla: lo usan el repositorio (campo canManage) y, a través de él, las rutas e Inicio.
 * El futuro rol de administrador de la app se añade aquí (p. ej. `viewerIsAdmin` en ManageCheck).
 */
export function canManageProposal({ viewerId, creatorId, members }: ManageCheck): boolean {
  return proposalManagerId(creatorId, members) === viewerId;
}
```

`backend/src/proposals/proposals.repository.ts`:
1. Imports: añadir `GroupMember` al `import type { … } from '@hueckoapp/shared'` y `import { canManageProposal, type ManagerCandidate } from './permissions';` después de `import { withTransaction } from '../db/transaction';`.
2. Junto a `MyVoteRow`, añadir: `type MemberRow = { group_id: string; id: string; role: GroupMember['role'] };`
3. En `hydrate()`, después de `myVotes`, añadir:

```ts
    // Miembros actuales de los grupos de estas propuestas, en orden de llegada (D3): deciden canManage.
    const members = groupBy(
      db
        .prepare(
          `SELECT m.group_id, m.user_id AS id, m.role
           FROM group_members m
           WHERE m.group_id IN (SELECT p.group_id FROM proposals p WHERE p.id ${IN_PROPOSAL_IDS})
           ORDER BY m.joined_at, m.rowid`,
        )
        .all(ids) as MemberRow[],
      (r) => r.group_id,
      (r): ManagerCandidate => ({ id: r.id, role: r.role }),
    );
```

4. En el objeto que devuelve `rows.map(...)`, justo después de `myVoteWindowId: myVotes.get(row.id) ?? null,`, añadir:

```ts
      canManage: canManageProposal({ viewerId, creatorId: row.created_by, members: members.get(row.group_id) ?? [] }),
```

`backend/src/proposals/proposals.routes.ts` — sustituir el bloque `loadForCreator` (comentario incluido) por:

```ts
  // Solo quien gestiona la propuesta decide sobre ella (canManageProposal: su creador; si se fue, el OWNER; si no, el más antiguo).
  const loadForManager = (proposalId: string, userId: string) => {
    const loaded = ctx.loadForMember(proposalId, userId);
    if (!loaded.proposal.canManage) {
      throw new ApiError(403, 'NOT_MANAGER', 'Solo quien organiza el plan puede hacer esto.');
    }
    return loaded;
  };
```

y cambiar las tres llamadas `loadForCreator(req.params.id, userId)` (en `/confirm`, `/cancel` e `/incidences/resolve`) por `loadForManager(req.params.id, userId)`.

`backend/src/dashboard/dashboard.ts`:
1. Sustituir la firma y el `canResolve` de `expressAlertFor`:

```ts
export function expressAlertFor(proposals: readonly ProposalWithGroup[], now: Date): ExpressAlert | null {
```

```ts
    canResolve: p.canManage,
```

2. En `buildDashboard`, quitar `userId: string;` del tipo del parámetro, cambiar `const { userId, now, groups, proposals } = input;` por `const { now, groups, proposals } = input;` y `expressAlert: expressAlertFor(proposals, userId, now),` por `expressAlert: expressAlertFor(proposals, now),`.

`backend/src/me/me.routes.ts` — en la llamada a `buildDashboard({ … })`, borrar la línea `userId,`.

- [ ] **Step 4: Contrato**

`shared/index.d.ts`:
- En `Proposal`, después de `myVoteWindowId: string | null;   // ventana que votó el usuario actual`, añadir:

```ts
  canManage: boolean;              // true si el usuario actual puede confirmar, cancelar, reprogramar o resolver (docs/api.md, «Quién gestiona un plan»)
```

- En `ExpressAlert`, cambiar el comentario de `canResolve` por `// = canManage del plan para el usuario actual`.

`docs/api.md`:
1. En `GET /proposals/:id`, sustituir `` `200 Proposal`. `windows` van por día y hora; `myVoteWindowId` es la franja que votó quien pregunta. `` por `` `200 Proposal`. `windows` van por día y hora; `myVoteWindowId` es la franja que votó quien pregunta y `canManage` dice si quien pregunta puede gestionarla (ver «Quién gestiona un plan»). ``
2. Insertar justo antes de `### \`PUT /proposals/:id/vote\``:

```markdown
### Quién gestiona un plan
Confirmar, cancelar, reprogramar y resolver imprevistos lo decide **una sola persona**, y ningún plan se queda sin ella:
1. quien creó la propuesta, mientras siga en el grupo (si sale y vuelve, la recupera);
2. si se fue, el `OWNER` del grupo (quien lo creó; si también se fue, el rol ya pasó a quien lleva más tiempo, ver `DELETE /groups/:id/members/me`);
3. si no hubiera `OWNER`, quien lleva más tiempo en el grupo (fecha de entrada más antigua; quien sale y vuelve cuenta desde su nueva entrada).

Cada `Proposal` trae `canManage` calculado para quien pregunta: la app muestra los botones con él (no comparando ids). Si lo intenta alguien que no gestiona el plan: `403 NOT_MANAGER` «Solo quien organiza el plan puede hacer esto.»

```

3. En `POST /proposals/:id/confirm`: `` Solo quien la creó (`403 NOT_CREATOR` «Solo quien propuso el plan puede hacer esto.») y solo si `` → `` Solo quien gestiona el plan (`403 NOT_MANAGER`, ver «Quién gestiona un plan») y solo si ``.
4. En `POST /proposals/:id/cancel`: `Solo quien la creó. Desde cualquier` → `` Solo quien gestiona el plan (`403 NOT_MANAGER`). Desde cualquier ``.
5. En `POST /proposals/:id/incidences/resolve`: `La «votación exprés». Solo quien la creó, y solo con` → `` La «votación exprés». Solo quien gestiona el plan (`403 NOT_MANAGER`), y solo con ``.
6. `En los dos casos solo quien creó el plan ve Reprogramar / Cancelar / Mantener.` → `` En los dos casos solo quien gestiona el plan (`canManage`) ve Reprogramar / Cancelar / Mantener. ``
7. En `GET /me/dashboard`: `` `canResolve` es `true` si soy quien creó el plan. `` → `` `canResolve` es el `canManage` del plan para mí. ``
8. En `DELETE /groups/:id/members/me`, al final de la línea añadir: ` Sus propuestas siguen en el grupo y pasa a gestionarlas el \`OWNER\` (ver «Quién gestiona un plan»).`
9. En `POST /proposals/:id/ai/summary`: `con una recomendación para quien lo creó` → `con una recomendación para quien lo gestiona`.
10. En «Cambios respecto a la app Kotlin»: `- **Votación exprés:** solo quien creó el plan la decide (antes, el primero que pulsaba) y reprogramar pide una nueva fecha límite.` → `` - **Votación exprés:** la decide solo quien gestiona el plan —quien lo creó o, si se fue del grupo, el `OWNER`— (antes, el primero que pulsaba) y reprogramar pide una nueva fecha límite. ``

- [ ] **Step 5: Ejecutar el backend** — `TZ=America/Lima npm test -w backend` → PASS (`proposals-batch.test.ts` sigue ≤ 5 consultas: ahora son 5). `npm run typecheck -w backend` → sin errores (`npm run typecheck -w mobile` aún falla: fixtures sin `canManage`; se arregla en el Step 7).

- [ ] **Step 6: Escribir los tests de mobile que fallan**

`mobile/src/screens/proposals/__tests__/PlanDetailScreen.test.tsx` — añadir al final:

```tsx
it('los botones de gestión siguen a canManage, no a quién creó el plan (D1)', async () => {
  // Ana creó el plan y se fue del grupo: lo gestiona el usuario actual (OWNER).
  mocked.getProposal.mockResolvedValue(makeProposal({ canManage: true }));
  const first = await renderScreen('prop_2');
  expect(await screen.findByText('Confirmar plan')).toBeTruthy();
  expect(screen.getByText('Cancelar plan')).toBeTruthy();
  await first.unmount();

  // Lo creó el usuario actual, pero el servidor dice que no lo gestiona.
  mocked.getProposal.mockResolvedValue(makeProposal({ createdBy: TEST_USER, canManage: false }));
  await renderScreen('prop_2');
  expect(await screen.findByText('Repaso antes de la entrega')).toBeTruthy();
  expect(screen.queryByText('Confirmar plan')).toBeNull();
  expect(screen.queryByText('Cancelar plan')).toBeNull();
});

it('aviso de imprevisto sin permiso de gestión: sin botones y con el texto genérico', async () => {
  mocked.getProposal.mockResolvedValue(makeConfirmed({ canManage: false }));
  await renderScreen();
  expect(await screen.findByText('Aviso de imprevisto')).toBeTruthy();
  expect(screen.queryByText('Mantener')).toBeNull();
  expect(screen.getByText('Solo quien organiza el plan puede decidir qué hacer con él.')).toBeTruthy();
});
```

`mobile/src/screens/proposals/__tests__/ExpressVoteCard.test.tsx`:
- En `base`, borrar la línea `creatorName: 'Usuario de Prueba',`.
- Sustituir el test `'si no soy quien creó el plan no hay botones (B20)'` por:

```tsx
it('sin permiso de gestión no hay botones (B20)', async () => {
  await render(<ExpressVoteCard {...base} canResolve={false} onResolve={jest.fn()} />);
  expect(screen.queryByText('Mantener')).toBeNull();
  expect(screen.getByText('Solo quien organiza el plan puede decidir qué hacer con él.')).toBeTruthy();
});
```

- [ ] **Step 7: Implementar mobile**

`mobile/src/testing/fixtures.ts` — en `makeProposal`, después de `myVoteWindowId: null,`, añadir:

```ts
  // Por defecto gestiona quien creó el plan (en los tests, el usuario actual es TEST_USER); se puede forzar con `canManage`.
  canManage: (over.createdBy ?? ANA).id === TEST_USER.id,
```

(`makeConfirmed` pasa `createdBy: TEST_USER` a `makeProposal`, así que queda en `true` salvo que se pase `canManage: false`.)

`mobile/src/screens/proposals/PlanDetailScreen.tsx`:
- Borrar `import { useAuth } from '../../context/AuthContext';` y la línea `const { user } = useAuth();`.
- Sustituir `const isCreator = proposal.createdBy.id === user?.id;` por:

```ts
  // Quién gestiona lo decide el servidor (canManage: el creador o, si se fue, el OWNER); la app no compara ids.
  const canManage = proposal.canManage;
```

- En `<ExpressVoteCard …>`: `canResolve={isCreator}` → `canResolve={canManage}` y borrar la línea `creatorName={proposal.createdBy.name}`.
- `{isCreator && proposal.state !== 'CANCELADO' ? (` → `{canManage && proposal.state !== 'CANCELADO' ? (`.

`mobile/src/screens/proposals/ExpressVoteCard.tsx`:
- En `Props`, borrar `creatorName: string;`; en la firma, `({ kind, who, reason, planTitle, canResolve, creatorName, onResolve, onResolved }: Props)` → `({ kind, who, reason, planTitle, canResolve, onResolve, onResolved }: Props)`.
- Cambiar el comentario `// con incidencias abiertas. Solo quien creó el plan decide (B20); reprogramar pide un plazo nuevo (G4).` por `// con incidencias abiertas. Solo quien gestiona el plan decide (B20, canManage); reprogramar pide un plazo nuevo (G4).`
- Sustituir el texto `` {`Solo ${creatorName} puede decidir qué hacer con el plan.`} `` por `{'Solo quien organiza el plan puede decidir qué hacer con él.'}`.

`mobile/src/screens/dashboard/DashboardScreen.tsx` — en `<ExpressVoteCard …>`, borrar la línea `creatorName={dashboard.expressAlert.createdBy.name}`.

- [ ] **Step 8: Ejecutar y ver que pasa** — `npm run typecheck` y `TZ=America/Lima npm test` desde la raíz → verde.

- [ ] **Step 9: Commit** — `git add backend/src/proposals/permissions.ts backend/src/proposals/proposals.repository.ts backend/src/proposals/proposals.routes.ts backend/src/dashboard/dashboard.ts backend/src/me/me.routes.ts backend/test/proposal-permissions.test.ts backend/test/proposals.test.ts backend/test/proposals-lifecycle.test.ts backend/test/dashboard.test.ts shared/index.d.ts docs/api.md mobile/src/testing/fixtures.ts mobile/src/screens/proposals/PlanDetailScreen.tsx mobile/src/screens/proposals/ExpressVoteCard.tsx mobile/src/screens/dashboard/DashboardScreen.tsx mobile/src/screens/proposals/__tests__/PlanDetailScreen.test.tsx mobile/src/screens/proposals/__tests__/ExpressVoteCard.test.tsx` → `fix: canManage decide quién gestiona un plan para que ninguna propuesta quede huérfana`

---

### Task 4: Backend — semilla con fechas relativas al día en que se ejecuta

**Files:**
- Create: `backend/src/db/demo-data.ts`, `backend/test/seed.test.ts`
- Modify: `backend/src/db/seed.ts`, `README.md`

**Interfaces:**
- Consumes: `proposalsRepository(db)` (`create`, `findById`, `vote`, `confirm`, `reportIncidence`, `listForUser`); `groupsRepository(db)` (`listForUser`, `findById`, `leave`); `scheduleFor`, `criticalityFor` (`src/proposals/rules.ts`); `withTransaction`; `buildDashboard` sin `userId` (Task 3); `openDatabase`; `NOW` (`test/helpers.ts`).
- Produces:
  - `src/db/demo-data.ts`: `DEMO_PASSWORD = 'password123'`; `DEMO_PROPOSAL_TITLES = ['Reunión de avance del proyecto', 'Repaso antes de la entrega'] as const`; `type SeedCounts = { users: number; groups: number; blocks: number; proposals: number }`; `seedDemoData(db: Db, passwordHash: string, now: Date): SeedCounts` (transaccional; no importa `config/env`).
  - `src/db/seed.ts`: solo la CLI (`npm run seed -w backend`).

- [ ] **Step 1: Escribir el test que falla** — `backend/test/seed.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { buildDashboard } from '../src/dashboard/dashboard';
import { openDatabase, type Db } from '../src/db/database';
import { seedDemoData } from '../src/db/demo-data';
import { groupsRepository } from '../src/groups/groups.repository';
import { proposalsRepository } from '../src/proposals/proposals.repository';
import { NOW } from './helpers';

const DAY = 86_400_000;
// La semilla solo guarda el hash: los tests no necesitan bcrypt.
const HASH = 'hash-de-prueba';
const TABLES = ['users', 'groups', 'group_members', 'time_blocks', 'proposals', 'proposal_windows', 'votes', 'incidences'];

const count = (db: Db, table: string) => (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;
const snapshot = (db: Db) => Object.fromEntries(TABLES.map((t) => [t, count(db, t)]));
const userId = (db: Db, email: string) => (db.prepare('SELECT id FROM users WHERE email = ?').get(email) as { id: string }).id;
const column = (db: Db, sql: string) => (db.prepare(sql).all() as { v: string }[]).map((r) => r.v);

// Lo que ve test@test.com en Inicio con la base sembrada.
function dashboardOf(db: Db, now: Date) {
  const id = userId(db, 'test@test.com');
  const groups = groupsRepository(db);
  return buildDashboard({
    now,
    groups: groups.listForUser(id),
    proposals: proposalsRepository(db).listForUser(id),
    totalBlocks: 2,
    membersOf: (groupId) => groups.findById(groupId)?.members ?? [],
  });
}

describe('semilla de datos de ejemplo (D8)', () => {
  it('crea las cuentas, los códigos y las dos propuestas con fechas relativas a hoy', () => {
    const db = openDatabase(':memory:');
    expect(seedDemoData(db, HASH, NOW)).toEqual({ users: 3, groups: 2, blocks: 5, proposals: 2 });
    expect(column(db, 'SELECT email AS v FROM users ORDER BY email')).toEqual(['ana@test.com', 'carlos@test.com', 'test@test.com']);
    expect(column(db, 'SELECT invite_code AS v FROM groups ORDER BY invite_code')).toEqual(['HUECKO123', 'PROY2026']);

    const d = dashboardOf(db, NOW);
    // NOW = martes 29/09 10:00 → el plan confirmado es dentro de 2 días, el jueves 1/10 a las 11:00.
    expect(d.nextPlan).toMatchObject({
      title: 'Reunión de avance del proyecto',
      scheduledAt: new Date(2026, 9, 1, 11, 0).toISOString(),
      scheduledDate: '2026-10-01',
    });
    expect(d.expressAlert).toMatchObject({ kind: 'AVISO', who: 'Ana', canResolve: true });
    // La votación abierta cierra mañana a las 20:00.
    expect(d.pendingVotes.map((p) => [p.title, p.votingDeadline])).toEqual([
      ['Repaso antes de la entrega', new Date(2026, 8, 30, 20, 0).toISOString()],
    ]);
  });

  it('repetirla días después no duplica nada y renueva las fechas', () => {
    const db = openDatabase(':memory:');
    seedDemoData(db, HASH, NOW);
    const before = snapshot(db);
    const later = new Date(NOW.getTime() + 10 * DAY); // viernes 9/10 10:00
    expect(seedDemoData(db, HASH, later)).toEqual({ users: 0, groups: 0, blocks: 0, proposals: 2 });
    expect(snapshot(db)).toEqual(before);
    const d = dashboardOf(db, later);
    expect(d.nextPlan?.scheduledAt).toBe(new Date(2026, 9, 11, 11, 0).toISOString());
    expect(d.pendingVotes.map((p) => p.votingDeadline)).toEqual([new Date(2026, 9, 10, 20, 0).toISOString()]);
  });

  it('no toca las propuestas creadas desde la app y devuelve al grupo a quien se había ido', () => {
    const db = openDatabase(':memory:');
    seedDemoData(db, HASH, NOW);
    const groupId = (db.prepare("SELECT id FROM groups WHERE invite_code = 'PROY2026'").get() as { id: string }).id;
    const anaId = userId(db, 'ana@test.com');
    const mine = proposalsRepository(db).create({
      groupId,
      createdBy: anaId,
      title: 'Plan propio',
      location: null,
      votingDeadline: new Date(NOW.getTime() + DAY).toISOString(),
      windows: [{ dayOfWeek: 2, startTime: '16:00', endTime: '18:00', availabilityPercentage: 100 }],
      createdAt: NOW.toISOString(),
    });
    groupsRepository(db).leave(groupId, anaId);

    seedDemoData(db, HASH, NOW);
    expect(proposalsRepository(db).findById(mine, anaId)?.title).toBe('Plan propio');
    expect(count(db, 'proposals')).toBe(3);
    expect(groupsRepository(db).findById(groupId)!.members.map((m) => [m.name, m.role])).toEqual([
      ['Usuario de Prueba', 'OWNER'],
      ['Ana', 'MEMBER'],
    ]);
  });
});
```

- [ ] **Step 2: Ejecutar y ver que falla** — `TZ=America/Lima npx vitest run test/seed.test.ts` (en `backend/`) → FAIL: no existe `src/db/demo-data.ts`.

- [ ] **Step 3: Implementar** — `backend/src/db/demo-data.ts`:

```ts
// Datos de ejemplo (domain spec §3.2): usuarios, grupos, bloques y dos propuestas con fechas RELATIVAS a `now`,
// para que la demo siempre tenga un plan confirmado en los próximos días y una votación abierta (D8).
// Idempotente: repetirlo no duplica nada y renueva las dos propuestas de ejemplo. No lee el entorno (lo prueban los tests).
import { randomUUID } from 'node:crypto';

import type { BlockType } from '@hueckoapp/shared';

import { proposalsRepository } from '../proposals/proposals.repository';
import { criticalityFor, scheduleFor } from '../proposals/rules';
import type { Db } from './database';
import { withTransaction } from './transaction';

export const DEMO_PASSWORD = 'password123';
export const DEMO_PROPOSAL_TITLES = ['Reunión de avance del proyecto', 'Repaso antes de la entrega'] as const;

export type SeedCounts = { users: number; groups: number; blocks: number; proposals: number };

const USERS = [
  { key: 'test', name: 'Usuario de Prueba', email: 'test@test.com' },
  { key: 'ana', name: 'Ana', email: 'ana@test.com' },
  { key: 'carlos', name: 'Carlos', email: 'carlos@test.com' },
] as const;
type UserKey = (typeof USERS)[number]['key'];

const GROUPS: { name: string; inviteCode: string; members: { user: UserKey; role: 'OWNER' | 'MEMBER' }[] }[] = [
  {
    name: 'Proyecto Integrador',
    inviteCode: 'PROY2026',
    members: [{ user: 'test', role: 'OWNER' }, { user: 'ana', role: 'MEMBER' }],
  },
  // Solo Carlos: así test@test.com puede probar «Unirme» con HUECKO123 (y una segunda vez da 409).
  { name: 'Amigos de la Uni', inviteCode: 'HUECKO123', members: [{ user: 'carlos', role: 'OWNER' }] },
];

const BLOCKS: { user: UserKey; label: string; type: BlockType; dayOfWeek: number; startTime: string; endTime: string }[] = [
  { user: 'test', label: 'Clase de Android', type: 'CLASE', dayOfWeek: 1, startTime: '08:00', endTime: '10:00' },
  { user: 'test', label: 'Trabajo Part-time', type: 'CLASE', dayOfWeek: 3, startTime: '14:00', endTime: '16:00' },
  { user: 'ana', label: 'Clase de Redes', type: 'CLASE', dayOfWeek: 1, startTime: '08:00', endTime: '12:00' },
  { user: 'ana', label: 'Turno de tarde', type: 'CLASE', dayOfWeek: 3, startTime: '15:00', endTime: '19:00' },
  { user: 'ana', label: 'Laboratorio', type: 'CLASE', dayOfWeek: 5, startTime: '09:00', endTime: '11:00' },
];

const HOUR = 3_600_000;

/** Día ISO (1 = lunes … 7 = domingo) de una fecha en hora local. */
const isoDayOf = (date: Date) => ((date.getDay() + 6) % 7) + 1;

// Los porcentajes son los fijos de la semilla Kotlin (el viernes figura con 50 % aunque el cruce dé 100 %, B15).
function seedProposals(db: Db, ids: Record<UserKey, string>, now: Date): number {
  const { id: groupId } = db.prepare("SELECT id FROM groups WHERE invite_code = 'PROY2026'").get() as { id: string };
  const proposals = proposalsRepository(db);
  const ago = (hours: number) => new Date(now.getTime() - hours * HOUR).toISOString();
  const [meetingTitle, reviewTitle] = DEMO_PROPOSAL_TITLES;

  // Se renuevan en cada ejecución: se borran las de la semilla anterior (sus franjas, votos e incidencias caen por
  // ON DELETE CASCADE) y se crean otra vez con fechas de hoy. Las propuestas creadas desde la app no se tocan.
  const remove = db.prepare('DELETE FROM proposals WHERE group_id = ? AND title = ? AND created_by = ?');
  remove.run(groupId, meetingTitle, ids.test);
  remove.run(groupId, reviewTitle, ids.ana);

  // «Reunión de avance del proyecto»: confirmada para dentro de 2 días a las 11:00, votada por los dos y con el
  // imprevisto de Ana sin resolver (aviso en Inicio).
  const inTwoDays = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 2);
  const meetingId = proposals.create({
    groupId,
    createdBy: ids.test,
    title: meetingTitle,
    location: { name: 'Biblioteca central', latitude: null, longitude: null },
    votingDeadline: ago(24),
    windows: [{ dayOfWeek: isoDayOf(inTwoDays), startTime: '11:00', endTime: '13:00', availabilityPercentage: 100 }],
    createdAt: ago(48),
  });
  const [meetingWindow] = proposals.findById(meetingId, ids.test)!.windows;
  proposals.vote(meetingId, ids.test, meetingWindow.id, ago(30));
  proposals.vote(meetingId, ids.ana, meetingWindow.id, ago(30));
  const { scheduledAt, scheduledDate } = scheduleFor(meetingWindow.dayOfWeek, meetingWindow.startTime, now);
  proposals.confirm(meetingId, meetingWindow.id, scheduledAt, scheduledDate);
  proposals.reportIncidence(
    meetingId,
    {
      userId: ids.ana,
      type: 'IMPREVISTO',
      reason: 'Cruce con un examen de laboratorio a última hora.',
      delayMinutes: null,
      criticality: criticalityFor('IMPREVISTO', false, null),
      createdAt: ago(2),
    },
    false,
  );

  // «Repaso antes de la entrega»: en votación hasta mañana a las 20:00 (siempre en el futuro), con el voto de Ana.
  const reviewId = proposals.create({
    groupId,
    createdBy: ids.ana,
    title: reviewTitle,
    location: { name: 'Google Meet', latitude: null, longitude: null },
    votingDeadline: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 20, 0).toISOString(),
    windows: [
      { dayOfWeek: 2, startTime: '16:00', endTime: '18:00', availabilityPercentage: 100 },
      { dayOfWeek: 4, startTime: '10:00', endTime: '12:00', availabilityPercentage: 100 },
      { dayOfWeek: 5, startTime: '16:00', endTime: '18:00', availabilityPercentage: 50 },
    ],
    createdAt: ago(1),
  });
  const tuesday = proposals.findById(reviewId, ids.ana)!.windows.find((w) => w.dayOfWeek === 2)!;
  proposals.vote(reviewId, ids.ana, tuesday.id, now.toISOString());

  return DEMO_PROPOSAL_TITLES.length;
}

export function seedDemoData(db: Db, passwordHash: string, now: Date): SeedCounts {
  return withTransaction(db, () => {
    const created: SeedCounts = { users: 0, groups: 0, blocks: 0, proposals: 0 };
    const ids = {} as Record<UserKey, string>;

    for (const u of USERS) {
      const found = db.prepare('SELECT id FROM users WHERE email = ?').get(u.email) as { id: string } | undefined;
      if (found) {
        ids[u.key] = found.id;
        continue;
      }
      ids[u.key] = randomUUID();
      db.prepare('INSERT INTO users (id, name, email, password_hash) VALUES (?, ?, ?, ?)').run(ids[u.key], u.name, u.email, passwordHash);
      created.users++;
    }

    for (const g of GROUPS) {
      let group = db.prepare('SELECT id FROM groups WHERE invite_code = ?').get(g.inviteCode) as { id: string } | undefined;
      if (!group) {
        group = { id: randomUUID() };
        db.prepare("INSERT INTO groups (id, name, description, invite_code, availability_threshold) VALUES (?, ?, '', ?, 80)").run(
          group.id, g.name, g.inviteCode,
        );
        created.groups++;
      }
      // Quien salió del grupo desde la app vuelve a entrar; como MEMBER si el grupo ya tiene OWNER (nunca dos).
      for (const m of g.members) {
        db.prepare(
          `INSERT OR IGNORE INTO group_members (group_id, user_id, role)
           VALUES (?, ?, CASE WHEN EXISTS (SELECT 1 FROM group_members WHERE group_id = ? AND role = 'OWNER') THEN 'MEMBER' ELSE ? END)`,
        ).run(group.id, ids[m.user], group.id, m.role);
      }
    }

    for (const b of BLOCKS) {
      const exists = db
        .prepare('SELECT 1 FROM time_blocks WHERE user_id = ? AND label = ? AND day_of_week = ? AND start_time = ?')
        .get(ids[b.user], b.label, b.dayOfWeek, b.startTime);
      if (exists) continue;
      db.prepare(
        `INSERT INTO time_blocks (id, user_id, label, type, start_time, end_time, is_recurring, day_of_week, date)
         VALUES (?, ?, ?, ?, ?, ?, 1, ?, NULL)`,
      ).run(randomUUID(), ids[b.user], b.label, b.type, b.startTime, b.endTime, b.dayOfWeek);
      created.blocks++;
    }

    created.proposals = seedProposals(db, ids, now);
    return created;
  });
}
```

`backend/src/db/seed.ts` — sustituir el archivo completo por:

```ts
// Semilla de desarrollo: npm run seed -w backend. Los datos viven en demo-data.ts (también lo usan los tests).
// Se puede repetir: no duplica nada y renueva los dos planes de ejemplo con fechas de hoy. Nunca en producción.
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

import { hashPassword } from '../auth/passwords';
import { env } from '../config/env';
import { openDatabase } from './database';
import { DEMO_PASSWORD, seedDemoData } from './demo-data';

async function main() {
  if (env.NODE_ENV === 'production') throw new Error('La semilla es solo para desarrollo.');
  const passwordHash = await hashPassword(DEMO_PASSWORD);
  mkdirSync(dirname(env.DATABASE_PATH), { recursive: true });
  const db = openDatabase(env.DATABASE_PATH);
  try {
    const created = seedDemoData(db, passwordHash, new Date());
    console.log(
      `Semilla aplicada en ${env.DATABASE_PATH}: ${created.users} usuarios, ${created.groups} grupos y ${created.blocks} bloques nuevos; ${created.proposals} planes de ejemplo renovados con fechas de hoy.`,
    );
    console.log(`Cuentas demo: test@test.com, ana@test.com y carlos@test.com — contraseña «${DEMO_PASSWORD}».`);
  } finally {
    db.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
```

(Comprobar antes con `grep -rn "db/seed" backend/src backend/test` que nada importaba `DEMO_PASSWORD` desde `seed.ts`; si algo lo hace, cambiar el import a `./demo-data`.)

`README.md` («2b. Datos de ejemplo»):
- `npm run seed -w backend   # usuarios, grupos y horarios de prueba; se puede repetir sin duplicar nada` → `npm run seed -w backend   # usuarios, grupos, horarios y dos planes con fechas de hoy; se puede repetir sin duplicar nada (renueva los planes)`
- Fila de `test@test.com`: `(confirmada, con un imprevisto de Ana: sale el aviso en Inicio)` → `(confirmada para dentro de 2 días a las 11:00, con un imprevisto de Ana: sale el aviso en Inicio)`.
- Fila de `ana@test.com`: `(en votación, con su voto)` → `(en votación hasta mañana a las 20:00, con su voto)`.

- [ ] **Step 4: Ejecutar y ver que pasa** — `TZ=America/Lima npm test -w backend` → PASS. `npm run typecheck` → sin errores. Prueba manual: `npm run seed -w backend` dos veces seguidas → la segunda dice `0 usuarios, 0 grupos y 0 bloques nuevos; 2 planes de ejemplo renovados…`.

- [ ] **Step 5: Commit** — `git add backend/src/db/demo-data.ts backend/src/db/seed.ts backend/test/seed.test.ts README.md` → `fix(backend): semilla con fechas relativas al día en que se ejecuta`

---

### Task 5: Backend — listo para desplegar detrás de un proxy (`TRUST_PROXY` y límites de login y registro)

**Files:**
- Create: `backend/src/config/trust-proxy.ts`, `backend/test/trust-proxy.test.ts`
- Modify: `backend/src/config/env.ts`, `backend/src/app.ts`, `backend/src/auth/auth.routes.ts`, `backend/src/index.ts`, `backend/.env.example`, `backend/test/helpers.ts`, `backend/test/auth.test.ts`, `docs/api.md`, `README.md`

**Interfaces:**
- Consumes: `AppDeps`, `createApp` (`src/app.ts`); `ApiError`; `makeTestApp`.
- Produces:
  - `src/config/trust-proxy.ts`: `type TrustProxy = boolean | number`; `trustProxySchema` (zod: `string | undefined` → `TrustProxy`).
  - `env`: `TRUST_PROXY: TrustProxy` (defecto `false`), `LOGIN_RATE_LIMIT` (20), `REGISTER_RATE_LIMIT` (10).
  - `AppDeps`: `trustProxy?: TrustProxy`, `loginRateLimit?: number`, `registerRateLimit?: number` (se quita `authRateLimit`).
  - `src/auth/auth.routes.ts`: `LOGIN_RATE_LIMIT_DEFAULT = 20`, `REGISTER_RATE_LIMIT_DEFAULT = 10`.
  - `test/helpers.ts`: `makeTestApp(options?: { loginRateLimit?: number; registerRateLimit?: number; trustProxy?: TrustProxy; now?: () => Date; ai?: AiClient; aiRateLimit?: number })`.

- [ ] **Step 1: Escribir los tests que fallan**

`backend/test/trust-proxy.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { trustProxySchema } from '../src/config/trust-proxy';

describe('TRUST_PROXY (D9)', () => {
  it.each([
    [undefined, false],
    ['', false],
    ['false', false],
    ['FALSE', false],
    ['true', true],
    ['0', 0],
    ['1', 1],
    [' 2 ', 2],
  ])('%j → %j', (input, expected) => {
    expect(trustProxySchema.parse(input)).toBe(expected);
  });

  it.each(['yes', '-1', '1.5', 'loopback'])('%j no es válido', (input) => {
    expect(trustProxySchema.safeParse(input).success).toBe(false);
  });
});
```

`backend/test/auth.test.ts` — añadir `vi` al import de vitest (`import { beforeEach, describe, expect, it, vi } from 'vitest';`) y sustituir el `describe('límite de intentos en /api/auth', …)` completo por:

```ts
describe('límites de intentos en /api/auth (D10)', () => {
  const login = (target: Express, ip?: string) => {
    const req = request(target).post('/api/auth/login');
    if (ip) req.set('X-Forwarded-For', ip);
    return req.send({ email: 'ana@correo.com', password: 'contrasena-segura' });
  };
  const register = (target: Express, n: number) =>
    request(target).post('/api/auth/register').send({ name: `Persona ${n}`, email: `persona${n}@correo.com`, password: 'contrasena-segura' });

  it('el tercer login con límite 2 responde 429 TOO_MANY_REQUESTS', async () => {
    const limited = makeTestApp({ loginRateLimit: 2 }).app;
    await login(limited);
    await login(limited);
    const res = await login(limited);
    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe('TOO_MANY_REQUESTS');
    expect(res.body.error.message).toBe('Demasiados intentos. Espera unos minutos.');
  });

  it('login y registro tienen contadores separados', async () => {
    const limited = makeTestApp({ loginRateLimit: 1, registerRateLimit: 1 }).app;
    expect((await login(limited)).status).toBe(401);
    expect((await login(limited)).status).toBe(429);
    // Agotar el login no bloquea el registro…
    expect((await register(limited, 1)).status).toBe(201);
    // …y el registro tiene su propio tope.
    expect((await register(limited, 2)).status).toBe(429);
  });

  it('con trust proxy = 1, cada IP de X-Forwarded-For tiene su propio contador', async () => {
    const limited = makeTestApp({ loginRateLimit: 1, trustProxy: 1 }).app;
    expect((await login(limited, '203.0.113.1')).status).toBe(401);
    expect((await login(limited, '203.0.113.1')).status).toBe(429);
    expect((await login(limited, '203.0.113.2')).status).toBe(401);
  });

  it('sin trust proxy (por defecto) X-Forwarded-For se ignora: todo cuenta como la misma IP', async () => {
    // express-rate-limit avisa por consola de la cabecera inesperada (ERR_ERL_UNEXPECTED_X_FORWARDED_FOR): se silencia.
    const quietError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const quietWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const limited = makeTestApp({ loginRateLimit: 1 }).app;
      expect((await login(limited, '203.0.113.1')).status).toBe(401);
      expect((await login(limited, '203.0.113.2')).status).toBe(429);
    } finally {
      quietError.mockRestore();
      quietWarn.mockRestore();
    }
  });
});
```

- [ ] **Step 2: Ejecutar y ver que fallan** — `TZ=America/Lima npx vitest run test/trust-proxy.test.ts test/auth.test.ts` (en `backend/`) → FAIL: no existe `src/config/trust-proxy.ts`; `makeTestApp` no conoce `loginRateLimit` (error de tipos en `npm run typecheck`) y el registro comparte contador con el login.

- [ ] **Step 3: Implementar**

`backend/src/config/trust-proxy.ts`:

```ts
import { z } from 'zod';

// Valor de app.set('trust proxy'): false = ningún proxy delante (por defecto), número = cuántos saltos de proxy
// se confían (1 en un PaaS típico), true = todos (no recomendado: cualquiera inventaría su IP con X-Forwarded-For).
export type TrustProxy = boolean | number;

export const trustProxySchema = z
  .string()
  .trim()
  .toLowerCase()
  .default('false')
  .transform((value, ctx): TrustProxy => {
    if (value === '' || value === 'false') return false;
    if (value === 'true') return true;
    if (/^\d+$/.test(value)) return Number(value);
    ctx.addIssue({ code: 'custom', message: 'TRUST_PROXY debe ser false, true o el número de proxies delante del servidor (p. ej. 1)' });
    return z.NEVER;
  });
```

`backend/src/config/env.ts` — importar `import { trustProxySchema } from './trust-proxy';` (después del import de `ai-client`) y añadir al final de `envSchema`:

```ts
  // Despliegue (ver .env.example): proxies delante del servidor y límites por IP de /auth.
  TRUST_PROXY: trustProxySchema,
  LOGIN_RATE_LIMIT: z.coerce.number().int().positive().default(20),
  REGISTER_RATE_LIMIT: z.coerce.number().int().positive().default(10),
```

`backend/src/auth/auth.routes.ts` — sustituir desde `export function authRouter(` hasta el cierre de `router.post('/login', …)` (el cuerpo de `/register` y `/login` no cambia salvo el limitador) por:

```ts
export const LOGIN_RATE_LIMIT_DEFAULT = 20;
export const REGISTER_RATE_LIMIT_DEFAULT = 10;

// Frena la fuerza bruta por IP cada 15 minutos. La IP es req.ip: detrás de un proxy depende de TRUST_PROXY (D9).
function authLimiter(limit: number) {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_req, _res, next) => next(new ApiError(429, 'TOO_MANY_REQUESTS', 'Demasiados intentos. Espera unos minutos.')),
  });
}

export function authRouter({
  db,
  jwtSecret,
  jwtExpiresIn,
  loginRateLimit = LOGIN_RATE_LIMIT_DEFAULT,
  registerRateLimit = REGISTER_RATE_LIMIT_DEFAULT,
}: AppDeps) {
  const router = Router();
  const users = usersRepository(db);
  // Contadores separados (D10): crear cuentas no gasta los intentos de entrar, ni al revés.
  const loginLimiter = authLimiter(loginRateLimit);
  const registerLimiter = authLimiter(registerRateLimit);

  router.post('/register', registerLimiter, async (req, res) => {
    const { name, email, password } = registerSchema.parse(req.body);
    if (users.findByEmail(email)) {
      throw new ApiError(409, 'EMAIL_TAKEN', 'Ya existe una cuenta con ese correo.');
    }
    const user = users.create({ name, email, passwordHash: await hashPassword(password) });
    const body: AuthResponse = { token: signToken(user.id, jwtSecret, jwtExpiresIn), user };
    res.status(201).json(body);
  });

  router.post('/login', loginLimiter, async (req, res) => {
    const { email, password } = loginSchema.parse(req.body);
    const found = users.findByEmail(email);
    const ok = await verifyPassword(password, found?.passwordHash ?? DUMMY_HASH);
    if (!found || !ok) {
      throw new ApiError(401, 'INVALID_CREDENTIALS', 'Correo o contraseña incorrectos.');
    }
    const { passwordHash: _omit, ...user } = found;
    const body: AuthResponse = { token: signToken(user.id, jwtSecret, jwtExpiresIn), user };
    res.json(body);
  });
```

`backend/src/app.ts`:
- Añadir `import type { TrustProxy } from './config/trust-proxy';` junto a los demás imports locales.
- En `AppDeps`, sustituir las dos líneas de `authRateLimit` (comentario incluido) por:

```ts
  // Proxies delante del servidor (app.set('trust proxy')): false si se omite. Ver TRUST_PROXY en .env.example.
  trustProxy?: TrustProxy;
  // Intentos por IP cada 15 min en /auth/login (20) y /auth/register (10) si se omiten; las pruebas los cambian.
  loginRateLimit?: number;
  registerRateLimit?: number;
```

- Justo después de `const app = express();`, añadir:

```ts
  // Con un proxy delante, req.ip (y por tanto los límites por IP) sale de X-Forwarded-For solo si se confía en él.
  app.set('trust proxy', appDeps.trustProxy ?? false);
```

`backend/src/index.ts` — sustituir la llamada `createApp({ … }).listen(…)` por:

```ts
if (env.TRUST_PROXY === true) {
  console.warn('TRUST_PROXY=true confía en cualquier X-Forwarded-For: usa el número de proxies (p. ej. TRUST_PROXY=1).');
}

createApp({
  db,
  jwtSecret: env.JWT_SECRET,
  jwtExpiresIn: env.JWT_EXPIRES_IN,
  trustProxy: env.TRUST_PROXY,
  loginRateLimit: env.LOGIN_RATE_LIMIT,
  registerRateLimit: env.REGISTER_RATE_LIMIT,
  ai,
  aiRateLimit: env.AI_RATE_LIMIT,
}).listen(env.PORT, () => {
  console.log(`HueckoApp API escuchando en http://localhost:${env.PORT}/api`);
});
```

`backend/test/helpers.ts` — añadir `import type { TrustProxy } from '../src/config/trust-proxy';` y sustituir `makeTestApp` por:

```ts
export function makeTestApp(options?: {
  loginRateLimit?: number;
  registerRateLimit?: number;
  trustProxy?: TrustProxy;
  now?: () => Date;
  ai?: AiClient;
  aiRateLimit?: number;
}): { app: Express; db: Db } {
  const db = openDatabase(':memory:');
  const app = createApp({
    db,
    jwtSecret: TEST_SECRET,
    jwtExpiresIn: '1h',
    loginRateLimit: options?.loginRateLimit ?? 10_000,
    registerRateLimit: options?.registerRateLimit ?? 10_000,
    trustProxy: options?.trustProxy,
    now: options?.now,
    // Sin `ai`, createApp usa el cliente de demostración (como un servidor sin GEMINI_API_KEY).
    ai: options?.ai,
    aiRateLimit: options?.aiRateLimit ?? 10_000,
  });
  return { app, db };
}
```

`backend/.env.example` — añadir al final:

```bash

# Intentos por IP cada 15 minutos en /auth/login y /auth/register (contadores separados).
LOGIN_RATE_LIMIT=20
REGISTER_RATE_LIMIT=10

# Proxies delante del servidor (Render, Railway, Fly.io, nginx…). Sin esto, detrás de un proxy todas las peticiones
# parecen venir de la IP del proxy y el límite de intentos bloquearía a todos a la vez.
#   false = ninguno (desarrollo local; por defecto) · 1 = un proxy (lo normal en un PaaS) · 2, 3… = varios.
#   true = confiar en todos: NO recomendado (cualquiera podría inventar su IP con X-Forwarded-For y saltarse el límite).
TRUST_PROXY=false
```

`docs/api.md`:
1. Fila `429` de la tabla de errores → `` | 429 | `TOO_MANY_REQUESTS`: demasiados intentos por IP cada 15 min en `/auth/login` (20) o en `/auth/register` (10), con contadores separados, o demasiadas llamadas a la IA (20 cada 15 min por usuario) | ``
2. Después de la tabla de errores (antes del `---` que precede a `## Tipos`), añadir:

```markdown

### Límites e IP del cliente
Los límites de `/auth` son **por IP**, con contadores separados para login (`LOGIN_RATE_LIMIT`, 20) y registro (`REGISTER_RATE_LIMIT`, 10) cada 15 min. Si el backend está detrás de un proxy (Render, Railway, nginx…), `TRUST_PROXY` debe decir cuántos hay (normalmente `1`) para que la IP salga de `X-Forwarded-For`; con `false` (por defecto) esa cabecera se ignora.
```

`README.md` — justo después del bloque `> **Zona horaria:** …`, añadir:

```markdown
> **Despliegue detrás de un proxy:** en Render, Railway o detrás de nginx pon `TRUST_PROXY=1` (el número de proxies) en el `.env` del servidor; si no, todas las peticiones parecen venir de la misma IP y el límite de intentos de login (`LOGIN_RATE_LIMIT`) y de registro (`REGISTER_RATE_LIMIT`) bloquearía a todos a la vez.
```

- [ ] **Step 4: Ejecutar y ver que pasa** — `TZ=America/Lima npm test -w backend` → PASS. `npm run typecheck` → sin errores (`grep -rn "authRateLimit" backend` → sin resultados).

- [ ] **Step 5: Commit** — `git add backend/src/config/trust-proxy.ts backend/src/config/env.ts backend/src/app.ts backend/src/auth/auth.routes.ts backend/src/index.ts backend/.env.example backend/test/helpers.ts backend/test/auth.test.ts backend/test/trust-proxy.test.ts docs/api.md README.md` → `feat(backend): TRUST_PROXY y límites separados para login y registro`

---

### Task 6: Mobile — fotos HEIC del iPhone convertidas a JPG antes de subirlas, y cierre

**Files:**
- Modify: `mobile/src/utils/scheduleImage.ts`, `mobile/src/utils/__tests__/scheduleImage.test.ts`, `mobile/jest.setup.ts`, `docs/api.md`

**Interfaces:**
- Consumes: `expo-image-picker` 57.0.20 (`launchCameraAsync`, `launchImageLibraryAsync`, `requestCameraPermissionsAsync`, `UIImagePickerPreferredAssetRepresentationMode`, tipos `ImagePickerOptions` y `ImagePickerAsset`); `OcrImage` (`src/api/ai.ts`).
- Produces: `pickScheduleImage(source: ImageSource): Promise<PickImageResult>` — misma firma; ahora el tipo informado es el del archivo subido y el nombre lleva su extensión real. `OCR_IMAGE_TYPES`, `OCR_MAX_BYTES`, `IMAGE_MESSAGES` sin cambios.

- [ ] **Step 1: Mock del selector** — en `mobile/jest.setup.ts`, sustituir el `jest.mock('expo-image-picker', …)` por:

```ts
jest.mock('expo-image-picker', () => ({
  requestCameraPermissionsAsync: jest.fn(),
  launchCameraAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
  // Enum real del módulo (ImagePicker.types.d.ts): lo usa scheduleImage.ts para pedir JPEG en vez de HEIC.
  UIImagePickerPreferredAssetRepresentationMode: { Automatic: 'automatic', Compatible: 'compatible', Current: 'current' },
}));
```

- [ ] **Step 2: Escribir los tests que fallan** — en `mobile/src/utils/__tests__/scheduleImage.test.ts`:

1. Añadir después de `const picked = …`:

```ts
const OPTIONS = { mediaTypes: ['images'], quality: 0.7, preferredAssetRepresentationMode: 'compatible' };
```

2. En el test `'galería: …'`, cambiar `expect(picker.launchImageLibraryAsync).toHaveBeenCalledWith({ mediaTypes: ['images'], quality: 0.7 });` por `expect(picker.launchImageLibraryAsync).toHaveBeenCalledWith(OPTIONS);` y el título por `'galería: sin pedir permiso (selector del sistema), solo imágenes, comprimidas y en JPEG si eran HEIC'`.
3. En el test `'cámara: pide permiso y abre la cámara'`, añadir al final: `expect(picker.launchCameraAsync).toHaveBeenCalledWith(OPTIONS);`
4. En el `it.each` de `'rechaza antes de subir: %j'`, cambiar el caso `[{ mimeType: 'image/heic' }, IMAGE_MESSAGES.unsupported]` por:

```ts
  // El sistema no pudo convertirla (el archivo sigue siendo .heic): se rechaza antes de subir.
  [{ mimeType: 'image/heic', fileName: 'IMG_0001.HEIC', uri: 'file:///cache/IMG_0001.heic' }, IMAGE_MESSAGES.unsupported],
```

5. Añadir al final:

```ts
it.each([
  ['Android: recomprimida a .jpeg aunque mimeType diga heic', { mimeType: 'image/heic', fileName: 'IMG_0001.HEIC', uri: 'file:///data/cache/ImagePicker/1b2c.jpeg' }],
  ['iOS: la galería la entrega en JPG con el nombre original', { mimeType: 'image/jpeg', fileName: 'IMG_0001.HEIC', uri: 'file:///tmp/ImagePicker/abc.jpg' }],
])('foto HEIC convertida (%s) → se sube como JPG con nombre .jpg', async (_caso, over) => {
  picker.launchImageLibraryAsync.mockResolvedValue(picked(over));
  await expect(pickScheduleImage('gallery')).resolves.toEqual({
    kind: 'picked', image: { uri: over.uri, mimeType: 'image/jpeg', fileName: 'horario.jpg' },
  });
});
```

- [ ] **Step 3: Ejecutar y ver que fallan** — `cd mobile && npx jest src/utils/__tests__/scheduleImage.test.ts` → FAIL: las opciones no llevan `preferredAssetRepresentationMode` y el caso Android se rechaza como HEIC.

- [ ] **Step 4: Implementar** — en `mobile/src/utils/scheduleImage.ts`, sustituir desde `const EXTENSION` hasta el final del archivo por:

```ts
const EXTENSION: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const TYPE_BY_EXTENSION: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };

// Las fotos del iPhone son HEIC y el servidor solo acepta JPG, PNG o WEBP: se piden ya convertidas (D11, verificado en
// expo-image-picker 57.0.20: ios/MediaHandler.swift, ios/ImageUtils.swift, android/.../MediaHandler.kt).
// - iOS, galería: «Compatible» hace que el sistema entregue la versión más compatible (JPEG) en vez del HEIC original
//   (con el modo por defecto se copia el .heic tal cual) y, con quality < 1, el módulo la recomprime a .jpg.
// - iOS, cámara: ya devuelve JPG.
// - Android: con quality < 1 recomprime a .jpeg, pero `mimeType` sigue diciendo el tipo del original (p. ej. image/heic);
//   por eso el tipo real sale primero de la extensión de `uri`, que es el archivo que se sube.
const PICKER_OPTIONS: ImagePicker.ImagePickerOptions = {
  mediaTypes: ['images'],
  quality: 0.7,
  preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
};

/** Tipo según la extensión de un nombre o una uri (sin «?…» ni «#…»); undefined si no tiene o no es JPG/PNG/WEBP. */
function typeOfName(name: string | null | undefined): string | undefined {
  const extension = name?.split(/[?#]/)[0].match(/\.([a-z0-9]+)$/i)?.[1].toLowerCase();
  return extension ? TYPE_BY_EXTENSION[extension] : undefined;
}

// Manda el archivo que de verdad se sube (su uri); después, lo que dijo el selector; después, el nombre; JPG si no hay pista.
const realType = (asset: ImagePicker.ImagePickerAsset): string =>
  typeOfName(asset.uri) ?? asset.mimeType ?? typeOfName(asset.fileName) ?? 'image/jpeg';

// El nombre original puede conservar la extensión de antes de convertir (IMG_0001.HEIC): si no cuadra con el tipo real,
// se sube como «horario.<ext>». Un nombre sin extensión se deja tal cual.
function uploadName(fileName: string | null | undefined, mimeType: string): string {
  if (!fileName) return `horario.${EXTENSION[mimeType]}`;
  const hasExtension = /\.[a-z0-9]+$/i.test(fileName);
  return hasExtension && typeOfName(fileName) !== mimeType ? `horario.${EXTENSION[mimeType]}` : fileName;
}

/**
 * Foto del horario (tema del curso: cámara y permisos). La cámara pide permiso; la galería usa el selector del
 * sistema, que no lo necesita (D11 de la Fase 4). Nunca lanza.
 */
export async function pickScheduleImage(source: ImageSource): Promise<PickImageResult> {
  try {
    if (source === 'camera') {
      const { granted, canAskAgain } = await ImagePicker.requestCameraPermissionsAsync();
      if (!granted) return { kind: 'error', message: IMAGE_MESSAGES.cameraDenied, canOpenSettings: canAskAgain === false };
    }
    const result =
      source === 'camera' ? await ImagePicker.launchCameraAsync(PICKER_OPTIONS) : await ImagePicker.launchImageLibraryAsync(PICKER_OPTIONS);
    const asset = result.canceled ? undefined : result.assets[0];
    if (!asset) return { kind: 'canceled' };

    const mimeType = realType(asset);
    if (!OCR_IMAGE_TYPES.includes(mimeType)) return { kind: 'error', message: IMAGE_MESSAGES.unsupported, canOpenSettings: false };
    if (asset.fileSize !== undefined && asset.fileSize > OCR_MAX_BYTES) {
      return { kind: 'error', message: IMAGE_MESSAGES.tooLarge, canOpenSettings: false };
    }
    return { kind: 'picked', image: { uri: asset.uri, mimeType, fileName: uploadName(asset.fileName, mimeType) } };
  } catch {
    return { kind: 'error', message: IMAGE_MESSAGES.failed, canOpenSettings: false };
  }
}
```

(Se elimina `guessMimeType`, sustituida por `typeOfName` + `realType`.)

`docs/api.md` — en `POST /ai/schedule-ocr`, añadir una viñeta al final de «Reglas»:

```markdown
- La app pide al selector de fotos la versión JPG de las fotos HEIC del iPhone y comprueba tipo y tamaño antes de subir: el servidor nunca recibe HEIC (si llegara, `400 INVALID_IMAGE`).
```

- [ ] **Step 5: Ejecutar y ver que pasa** — `cd mobile && npx jest src/utils/__tests__/scheduleImage.test.ts src/screens/schedule` → PASS (los casos existentes de extensión y `fileSize` siguen igual).

- [ ] **Step 6: Verificación final**
  - `npm run typecheck` y `TZ=America/Lima npm test` desde la raíz → verde.
  - `cd mobile && npx expo-doctor` → sin problemas.
  - Prueba manual: `rm -f backend/data/hueckoapp.db*`, `npm run seed -w backend` (dos veces), `npm run backend`, `npm run mobile`.
    - Inicio con `test@test.com`: próximo plan «Reunión de avance del proyecto» dentro de 2 días a las 11:00, aviso del imprevisto de Ana con botones; la tarjeta del grupo muestra «Mar 16:00 - 18:00» (la propuesta más reciente).
    - Con `ana@test.com`: salir de «Proyecto Integrador» → con `test@test.com`, el voto de Ana ya no suma en «Repaso antes de la entrega» y en su detalle aparecen «Confirmar plan» / «Cancelar plan» (ahora lo gestiona el OWNER). Volver a unirse con `PROY2026` → el voto cuenta otra vez y los botones vuelven a Ana.
    - En un iPhone (development build o Expo Go): «Mi horario» → «Escanear» → «Galería» → una foto HEIC normal de la cámara → llega a «Revisar escaneo» sin el error «Esa imagen no sirve…».
  - Backend con `TRUST_PROXY=1` y una petición con `X-Forwarded-For` (curl a `/api/auth/login`) → sin avisos de `express-rate-limit` en la consola.

- [ ] **Step 7: Commit** — `git add mobile/src/utils/scheduleImage.ts mobile/src/utils/__tests__/scheduleImage.test.ts mobile/jest.setup.ts docs/api.md` → `fix(mobile): las fotos HEIC del iPhone se suben convertidas a JPG`

---

## Cobertura del encargo (autorrevisión)

| Requisito | Task |
|---|---|
| 1. Propuestas huérfanas: gestiona el creador si sigue; si no, el creador del grupo (OWNER); si no, el miembro más antiguo; nunca sin gestor; una función `canManageProposal` extensible | 3 (D1–D3, tests de las 4 ramas + vuelta al grupo + dato roto) |
| 1. `canManage: boolean` en toda respuesta de propuesta; la app lo usa en vez de comparar ids | 3 (`hydrate`, `shared`, `docs/api.md`, `PlanDetailScreen`, `ExpressAlert.canResolve`) |
| 1. Fechas de ingreso: verificado `group_members.joined_at` + `rowid` (no hace falta migración) | 3 (D3) |
| 2. Votos de ex-miembros no cuentan (voteCount, más votada, Inicio, entrada del resumen con IA); no se borran; vuelven a contar al volver | 2 (D5, `member-votes.test.ts`) |
| 3. Semilla con fechas relativas; plan confirmado en los próximos días; votaciones con plazo futuro; re-ejecución sin duplicados; mismas cuentas y códigos | 4 (D8, `seed.test.ts`) |
| 4. Resumen de grupos con la propuesta más reciente; consulta localizada (`groupSummaries` sobre `listForUser`); definición `created_at DESC, rowid DESC` | 2 (D6) |
| 5. N+1: número constante de consultas; respuestas idénticas (tests existentes) + test de conteo y de 25 propuestas | 1 (D7), 3 (+1 consulta de miembros, sigue constante) |
| 6. `TRUST_PROXY` (zod, false/true/saltos, por defecto false) con `app.set('trust proxy')`; limitadores separados de login y registro configurables; `docs/api.md` y `.env.example` | 5 (D9, D10) |
| 7. HEIC: el selector devuelve JPEG (opción verificada en los tipos y el código nativo de SDK 57); validación previa intacta; tests | 6 (D11) |
| `docs/api.md` y `shared/index.d.ts` en el mismo task que cambia el contrato | 2, 3, 5 (y nota en 6) |
