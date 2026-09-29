# Fase 3 — Propuestas, votación, ubicación e Inicio: plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Propuestas de plan de punta a punta (crear con lugar y plazo reales, votar/retirar voto, añadir franjas, confirmar, cancelar, imprevistos y votación exprés), la pantalla de Inicio con datos reales, un selector nativo de fecha/hora y la ubicación del teléfono (`expo-location`) para el lugar de un plan.

**Architecture:** El backend añade una migración (propuestas, franjas, votos, incidencias), reglas puras en `src/proposals/rules.ts` (próxima ocurrencia, ganadora, 3 mejores franjas, criticidad, votación abierta), un repositorio y dos routers (`/groups/:id/proposals` y `/proposals/:id/...`), y un router `/me` con `GET /me/upcoming-plans` y `GET /me/dashboard` (fórmulas del `DashboardViewModel` en `src/dashboard/dashboard.ts`). El reloj del servidor se inyecta (`AppDeps.now`) para probar plazos. La app añade módulos de API tipados, hooks de dominio sobre `useResource`/`useAction` (`useProposals`, `useProposal`, `useDashboard`, `useCurrentLocation`), componentes (`DateTimeField`, `BottomSheet`, `VoteWindowRow`, `ProposalStateBadge`) y las pantallas apiladas `CreateProposal`, `Voting` y `PlanDetail`; la pestaña «Planes» del grupo y el Inicio dejan de ser marcadores.

**Tech Stack:** Express 5, TypeScript, `node:sqlite`, zod 4, Vitest + Supertest · Expo SDK 57, React Navigation 7 (native-stack, drawer, material-top-tabs), axios, `@react-native-community/datetimepicker`, `expo-location`, jest-expo + @testing-library/react-native 14.

**Spec:** `docs/superpowers/specs/2026-09-29-ui-screens-spec.md` (§1.4, §2.3, §2.6 partes de planes y CreatePlanBottomSheet, §2.7 con AddWindowBottomSheet, §2.8, §3, §6 quirks 2, 5, 6, 13, 14, 17, 19, 20, 21, 24, §7) y `docs/superpowers/specs/2026-09-29-domain-logic-spec.md` (§2.2 con los valores esperados de la semilla, §2.4, §3, §5 G1–G9, C1–C5, C10, C11, §6). Contrato: `docs/api.md` («Propuestas y votación») y `shared/index.d.ts`. Plan anterior (lo que ya existe): `docs/superpowers/plans/2026-09-29-fase2-grupos-horarios.md`.

## Global Constraints

- **Rama:** `feature/fase3-propuestas-votacion`, **ya creada desde `develop` por quien coordina**. Ningún task crea ni cambia de rama. Nunca commits en `develop`/`main`.
- Idioma de la UI y de los mensajes de error: español, **con tildes correctas** (UI spec §7). Mayúsculas tipo título solo en los diálogos heredados («Crear Nuevo Grupo»). Comentarios del código en español.
- Días de la semana: entero 1–7 (1 = lunes, 7 = domingo). Etiquetas cortas `Lun, Mar, Mié, Jue, Vie, Sáb, Dom`.
- Hora del día `HH:mm` con la regex `^([01]\d|2[0-3]):[0-5]\d$` en cliente y servidor; `startTime < endTime` estricto.
- **Fechas y horas:** en la API, ISO 8601 en UTC (`toISOString()`); la app las muestra en hora local. `scheduledAt` se calcula en la zona horaria del proceso del servidor (en desarrollo, la del PC). Los tests **no dependen de la zona horaria de la máquina**: construyen fechas con `new Date(año, mes, día, h, m)` y comparan con `.toISOString()`.
- **Reloj:** backend `AppDeps.now?: () => Date` (tests con `makeClock` de `test/helpers.ts`); mobile `today()` de `src/utils/clock.ts` (tests con `jest.mock('…/utils/clock', …)`). Nunca `new Date()` suelto en código que decida plazos.
- IDs: `crypto.randomUUID()`. Errores del backend con `throw new ApiError(status, code, message)` y la forma `{ "error": { "code", "message", "details" } }`.
- `node:sqlite` **no acepta booleanos**: `1`/`0` y se leen con `=== 1`. Varias sentencias juntas: `withTransaction(db, fn)` (`src/db/transaction.ts`), que es **reentrante y sin savepoints**: nunca se atrapa (`try/catch`) un error lanzado por un `withTransaction` anidado para seguir adelante; debe subir y la transacción externa deshace todo.
- Migraciones **solo se añaden al final** de `backend/src/db/migrations.ts` (hoy hay 0 `users`, 1 `time_blocks`, 2 `groups`; esta fase añade la 3).
- Los tests **nunca** dependen de la semilla ni la ejecutan.
- Navegación: React Navigation (no Expo Router). Las pantallas nuevas (`CreateProposal`, `Voting`, `PlanDetail`) se apilan sobre el drawer con cabecera nativa y botón atrás (arregla quirk 24: «no encontrado» siempre tiene cabecera).
- Estado: hooks propios + Context. Se **reutiliza** lo de la Fase 2: `useResource` (expone `loaded`; `mutate` está ligado a su `load` e invalida las recargas en curso), `useAction` (nunca lanza, evita doble envío), `useRefreshOnFocus`, `LoadState`, `colors.disabledContainer`/`colors.disabledContent`. **No** se añade ninguna librería de estado ni de datos.
- Paquetes de `mobile/` con `npx expo install <pkg>` **dentro de `mobile/`**.
- Tests de mobile: `@testing-library/react-native` v14 es **asíncrono** (`await render`, `await fireEvent.press`, `await fireEvent(el, 'change', …)`, `await renderHook`, `await act(async () => …)`). En las fábricas de `jest.mock` solo se referencian variables con prefijo `mock` (o `require` dentro de la fábrica), y siempre **dentro de funciones** que se llaman al renderizar, no al crear el mock.
- **Tests de guardas:** una guarda (p. ej. «no envía si el formulario es inválido») se prueba por un camino **habilitado** (enviar desde el teclado con `submitEditing`, no pulsando un botón deshabilitado) y con un **control positivo** en el mismo archivo (los mismos pasos con datos válidos sí llaman a la API).
- Commits convencionales en español. Identidad (no hay `user.name` configurado) y trailer = **la línea de atribución del modelo que implementa el task** (la suya propia, no una copiada de este plan):
  ```bash
  GIT_AUTHOR_NAME="Aless Bustamante" GIT_AUTHOR_EMAIL="fabrizio.bs9012@gmail.com" \
  GIT_COMMITTER_NAME="Aless Bustamante" GIT_COMMITTER_EMAIL="fabrizio.bs9012@gmail.com" \
  git commit -m "<tipo>(<área>): <mensaje>" -m "Co-Authored-By: <modelo que implementa> <noreply@anthropic.com>"
  ```
- `git add` siempre con rutas explícitas. **Nunca** se añaden `.claude/` ni `.superpowers/` (nada de `git add -A` ni `git add .`).
- Antes de cada commit: `npm run typecheck` y `npm test` desde la raíz, en verde.
- Fuera de alcance (YAGNI): llamados a la votación (G3, ver decisión), notificaciones push, elegir el lugar en un mapa, editar o borrar propuestas, voto exprés por miembro (B20: decide quien creó el plan), `GET /me/proposals` (lo cubre `/me/dashboard`), `?weekOf` en `/availability`, OCR (Fase 4).

### Decisiones tomadas en este plan (la spec o el contrato no lo fijaban)

| # | Decisión | Dónde |
|---|---|---|
| D1 | G7: **un solo** `GET /me/dashboard` (métricas, próximo plan con asistentes, resumen por grupo, votaciones en curso y alerta exprés) + `GET /me/upcoming-plans` (ya estaba en el contrato). No se crea `GET /me/proposals`. El «horario de hoy» lo calcula la app con `/me/time-blocks` (depende de la zona horaria del teléfono). | Task 4 |
| D2 | `matchingHours`, `openVotes` y el resumen por grupo usan la **fórmula exacta de Kotlin** (§2.2): cuentan canceladas, umbral fijo 80, sin deduplicar; `openVotes` cuenta `PROPUESTO` aunque el plazo haya pasado. B16/B18 se dejan documentados, salvo el «—» cuando un grupo no tiene propuesta (B18). | Task 4, 9 |
| D3 | G5: la tarjeta exprés sale con `kind: "RECOORDINACION"` («Votación exprés») si el plan está `EN_RECOORDINACION`, y con `kind: "AVISO"` («Aviso de imprevisto») si está `CONFIRMADO` con incidencias sin resolver. En ambos casos solo quien creó el plan ve Reprogramar/Cancelar/Mantener (B20). Así la semilla (`prop_1` con el imprevisto de Ana) sigue mostrando la alerta. Solo cuentan planes que aún no ocurrieron. | Task 4, 8, 9 |
| D4 | La criticidad de la incidencia semilla se **deriva** (G6): `IMPREVISTO` → `MEDIA` (Kotlin decía `ALTA`). Los porcentajes de `prop_2` en la semilla son los **fijos de Kotlin** (`w_23` = 50 %, B15) para reproducir `matchingHours = 6`. | Task 4 |
| D5 | El % de una franja manual (G2) es el **peor** % de las horas que toca (mismo redondeo que el matcher), sin umbral ni rango 08–20. | Task 1 |
| D6 | Confirmar se permite antes o después del plazo mientras esté `PROPUESTO`; con `windowId` se confirma esa franja aunque no tenga votos. Cancelar vale desde cualquier estado salvo `CANCELADO`. Retirar el voto también exige votación abierta (`409 VOTING_CLOSED`). | Task 2, 3 |
| D7 | La lista de «Planes» del grupo oculta las `CANCELADO` (igual que `proposalsOf` en Kotlin); el servidor las devuelve todas. | Task 7 |
| D8 | `CreateProposal` es una **pantalla apilada** (no una hoja): tiene selector de fecha/hora, ubicación y editor de franjas. «Agregar franja» y «Reportar imprevisto» sí son hojas inferiores (`BottomSheet`). | Task 7, 8 |
| D9 | Quirk 20: la etiqueta de franja se unifica a «Mar · 16:00 - 18:00» en todas las pantallas. Quirk 21: el badge «Confirmado» usa `primary`/`onPrimary` en todas (se ve sobre tarjetas blancas y sobre `primaryContainer`). Quirk 19: «Mis grupos» del Inicio singulariza («1 miembro»). | Task 5, 9 |
| D10 | «Nuevo grupo» del Inicio abre **ahí mismo** el `CreateGroupDialog` (quirk 5) y recarga el Inicio al crear. Las filas de «Mis grupos» del Inicio y la tarjeta del próximo plan son pulsables (a `GroupDetail` y `PlanDetail`). | Task 9 |
| D11 | Toast al retirar el voto: «Tu voto se ha retirado.» (B8). Toasts nuevos: «Propuesta creada.», «Franja horaria agregada.», «Plan confirmado.», «Plan cancelado.», «Imprevisto reportado.», «Votación exprés registrada: <opción>.» (quirk 2: ahora se muestran). | Task 7, 8, 9 |
| D12 | Los votos de alguien que sale del grupo se conservan (el recuento es histórico). | Task 2 |

## Mapa de archivos

**shared/**
| Archivo | Cambio |
|---|---|
| `index.d.ts` | `Proposal` + `scheduledAt`, `createdAt`; tipos nuevos de entrada (`TimeWindowInput`, `ProposalInput`, `IncidenceInput`, `ResolveIncidencesInput`) y del Inicio (`ProposalWithGroup`, `Attendee`, `UpcomingPlan`, `ExpressAlert`, `DashboardGroup`, `DashboardMetrics`, `Dashboard`) |

**backend/**
| Archivo | Responsabilidad |
|---|---|
| `src/db/migrations.ts` | + migración 3 (`proposals`, `proposal_windows`, `votes`, `incidences`) |
| `src/app.ts` | `AppDeps.now`; monta `/groups` (propuestas), `/proposals`, `/me` |
| `src/proposals/rules.ts` | Reglas puras: `nextOccurrence`, `pickWinner`, `bestWindows`, `criticalityFor`, `isVotingOpen` |
| `src/availability/group-availability.ts` | + `windowAvailability` (G2) |
| `src/groups/group-access.ts` | `loadGroupForMember` (404/403), compartido por grupos y propuestas |
| `src/groups/groups.routes.ts` | Usa `loadGroupForMember` |
| `src/proposals/proposals.schemas.ts` | zod de crear, votar, franja, confirmar, incidencia, resolver |
| `src/proposals/proposals.repository.ts` | Acceso a las 4 tablas y lectura de `Proposal` |
| `src/proposals/proposals.routes.ts` | `groupProposalsRouter` y `proposalsRouter` |
| `src/dashboard/dashboard.ts` | Fórmulas del Inicio (puras) y `buildDashboard` |
| `src/me/me.routes.ts` | `GET /me/upcoming-plans`, `GET /me/dashboard` |
| `src/db/seed.ts` | + `prop_1` y `prop_2` |
| `test/helpers.ts` | + `makeClock`, `addWeeklyBlock`, `setupSeedGroup`, `createProposal`; `makeTestApp({ now })` |
| `test/*.test.ts` | `database`, `proposal-rules`, `window-availability`, `proposals`, `proposals-lifecycle`, `dashboard`, `me` |

**mobile/**
| Archivo | Responsabilidad |
|---|---|
| `src/api/proposals.ts`, `src/api/dashboard.ts` | Llamadas tipadas |
| `src/hooks/useProposals.ts`, `useProposal.ts`, `useDashboard.ts`, `useRefreshErrorToast.ts`, `useCurrentLocation.ts` | Hooks de dominio |
| `src/utils/proposals.ts`, `src/utils/location.ts`, `src/utils/dashboard.ts`, `src/utils/days.ts` | Etiquetas, estados, mapas, saludo; `formatDateTime` |
| `src/testing/fixtures.ts` | Datos de prueba de la semilla (solo tests) |
| `src/components/DateTimeField.tsx`, `BottomSheet.tsx`, `VoteWindowRow.tsx`, `ProposalStateBadge.tsx`, `SecondaryButton.tsx` (+`disabled`), `index.ts` | Componentes |
| `src/screens/groups/tabs/PlansTab.tsx`, `GroupDetailScreen.tsx` | Pestaña «Planes» real |
| `src/screens/proposals/CreateProposalScreen.tsx`, `WindowEditor.tsx`, `VotingScreen.tsx`, `AddWindowSheet.tsx`, `PlanDetailScreen.tsx`, `ConfirmPlanDialog.tsx`, `ReportIncidenceSheet.tsx`, `ExpressVoteCard.tsx` | Propuestas |
| `src/screens/dashboard/DashboardScreen.tsx` | Inicio (sustituye a `PlaceholderScreen`, que se borra) |
| `src/screens/schedule/AddScheduleScreen.tsx` | Fecha del puntual con `DateTimeField` |
| `src/navigation/types.ts`, `RootNavigator.tsx`, `AppDrawer.tsx` | Rutas nuevas |
| `app.json`, `package.json`, `jest.setup.ts` | Plugin de `expo-location`, datetimepicker, mocks |

---

### Task 1: Backend — modelo de propuestas y reglas puras

**Files:**
- Modify: `shared/index.d.ts`, `backend/src/db/migrations.ts`, `backend/src/app.ts`, `backend/src/availability/group-availability.ts`, `backend/test/helpers.ts`, `backend/test/database.test.ts`
- Create: `backend/src/proposals/rules.ts`, `backend/test/proposal-rules.test.ts`, `backend/test/window-availability.test.ts`

**Interfaces:**
- Consumes: `Db`, `openDatabase`; `startHour(time)`, `endHour(time)`, `MatcherGroup` (`src/availability/matcher.ts`); `groupAvailability` (misma carpeta); `makeTestApp` (`test/helpers.ts`).
- Produces:
  - `shared`: `Proposal` con `scheduledAt: string | null` y `createdAt: string`; `TimeWindowInput`, `ProposalInput`, `IncidenceInput`, `ResolveIncidencesInput`, `ProposalWithGroup`, `AttendeeStatus`, `Attendee`, `UpcomingPlan`, `ExpressAlert`, `DashboardGroup`, `DashboardMetrics`, `Dashboard` (definiciones exactas en el Step 1).
  - Tablas `proposals`, `proposal_windows`, `votes`, `incidences` (migración 3).
  - `AppDeps.now?: () => Date`.
  - `src/proposals/rules.ts`: `nextOccurrence(dayOfWeek: number, startTime: string, from: Date): Date`; `pickWinner(windows: readonly TimeWindow[]): TimeWindow | null`; `bestWindows(windows: readonly MatchWindow[], count?: number): MatchWindow[]`; `criticalityFor(type: IncidenceType, isEssential: boolean, delayMinutes: number | null): Criticality`; `isVotingOpen(p: Pick<Proposal, 'state' | 'votingDeadline'>, now: Date): boolean`.
  - `windowAvailability(group: MatcherGroup, blocks: readonly TimeBlock[], window: TimeWindowInput): number` en `src/availability/group-availability.ts`.
  - `test/helpers.ts`: `makeTestApp(options?: { authRateLimit?: number; now?: () => Date })`; `makeClock(start: Date): { now: () => Date; set: (date: Date) => void }`.

- [ ] **Step 1: Tipos compartidos** — en `shared/index.d.ts`, reemplazar la definición de `Proposal` (el último bloque del archivo) por:

```ts
export type Proposal = {
  id: string;
  groupId: string;
  title: string;
  location: Location | null;
  createdBy: User;
  votingDeadline: string;          // ISO 8601 (UTC); solo se vota antes de esta hora
  state: ProposalState;
  windows: TimeWindow[];           // ordenadas por día y hora
  myVoteWindowId: string | null;   // ventana que votó el usuario actual
  chosenWindowId: string | null;   // se llena al confirmar
  scheduledAt: string | null;      // ISO: próxima vez que ocurre la franja elegida, calculada al confirmar
  incidences: Incidence[];
  createdAt: string;               // ISO; GET /groups/:id/proposals ordena por aquí (más recientes primero)
};

// Cuerpos de las peticiones de propuestas (docs/api.md, «Propuestas y votación»).
export type TimeWindowInput = { dayOfWeek: number; startTime: string; endTime: string };

export type ProposalInput = {
  title: string;
  location?: Location | null;
  votingDeadline: string;          // ISO 8601 futura
  windows?: TimeWindowInput[];     // vacío u omitido: el servidor propone las 3 mejores franjas
};

export type IncidenceInput = { type: IncidenceType; reason: string; delayMinutes?: number | null };

export type ResolveIncidencesInput =
  | { newState: 'CONFIRMADO' | 'CANCELADO' }
  | { newState: 'PROPUESTO'; votingDeadline: string };

// Propuesta con el nombre de su grupo (Inicio y /me/upcoming-plans).
export type ProposalWithGroup = Proposal & { groupName: string };

export type AttendeeStatus = 'PUNTUAL' | 'RETRASADO' | 'NO_ASISTE';

export type Attendee = { user: User; isEssential: boolean; status: AttendeeStatus; delayMinutes: number | null };

export type UpcomingPlan = ProposalWithGroup & { attendees: Attendee[] };

export type ExpressAlert = {
  proposalId: string;
  planTitle: string;
  groupName: string;
  who: string;                          // nombre de quien reportó la incidencia
  reason: string;
  kind: 'RECOORDINACION' | 'AVISO';     // EN_RECOORDINACION, o CONFIRMADO con incidencias sin resolver
  canResolve: boolean;                  // true si el usuario actual creó el plan
  createdBy: User;
};

export type DashboardGroup = {
  id: string;
  name: string;
  memberCount: number;
  nextWindow: Omit<TimeWindow, 'id' | 'voteCount'> | null;
};

export type DashboardMetrics = { activeGroups: number; openVotes: number; matchingHours: number; totalBlocks: number };

export type Dashboard = {
  metrics: DashboardMetrics;
  nextPlan: UpcomingPlan | null;
  groups: DashboardGroup[];
  pendingVotes: ProposalWithGroup[];
  expressAlert: ExpressAlert | null;
};
```

- [ ] **Step 2: Escribir los tests que fallan**

Añadir al final de `backend/test/database.test.ts`:

```ts
describe('migración de propuestas', () => {
  const setup = () => {
    const db = openDatabase(':memory:');
    db.exec(`
      INSERT INTO users (id, name, email, password_hash) VALUES ('u1', 'Ana', 'ana@correo.com', 'x'), ('u2', 'Beto', 'beto@correo.com', 'x');
      INSERT INTO groups (id, name, invite_code) VALUES ('g1', 'Grupo', 'ABCDEFGH');
      INSERT INTO proposals (id, group_id, title, created_by, voting_deadline, created_at) VALUES
        ('p1', 'g1', 'Plan', 'u1', '2026-10-03T20:00:00.000Z', '2026-09-29T10:00:00.000Z'),
        ('p2', 'g1', 'Otro', 'u1', '2026-10-03T20:00:00.000Z', '2026-09-29T10:00:00.000Z');
      INSERT INTO proposal_windows (id, proposal_id, day_of_week, start_time, end_time, availability_percentage) VALUES
        ('w1', 'p1', 2, '16:00', '18:00', 100),
        ('w2', 'p2', 4, '10:00', '12:00', 100);
    `);
    return db;
  };

  it('un voto por persona y propuesta, y solo a franjas de esa propuesta', () => {
    const db = setup();
    const vote = db.prepare('INSERT INTO votes (proposal_id, user_id, window_id) VALUES (?, ?, ?)');
    expect(() => vote.run('p1', 'u1', 'w1')).not.toThrow();
    expect(() => vote.run('p1', 'u1', 'w1')).toThrow();
    expect(() => vote.run('p1', 'u2', 'w2')).toThrow();
  });

  it('rechaza franjas repetidas, al revés o con día inválido', () => {
    const db = setup();
    const insert = db.prepare(
      'INSERT INTO proposal_windows (id, proposal_id, day_of_week, start_time, end_time, availability_percentage) VALUES (?, ?, ?, ?, ?, ?)',
    );
    expect(() => insert.run('w3', 'p1', 2, '16:00', '18:00', 100)).toThrow();
    expect(() => insert.run('w4', 'p1', 2, '18:00', '16:00', 100)).toThrow();
    expect(() => insert.run('w5', 'p1', 8, '10:00', '11:00', 100)).toThrow();
    expect(() => insert.run('w6', 'p1', 3, '10:00', '11:00', 100)).not.toThrow();
  });

  it('una tardanza exige minutos y el resto no los lleva', () => {
    const db = setup();
    const insert = db.prepare(
      `INSERT INTO incidences (id, proposal_id, user_id, type, reason, delay_minutes, criticality, created_at)
       VALUES (?, 'p1', 'u2', ?, 'Motivo', ?, 'BAJA', '2026-09-29T10:00:00.000Z')`,
    );
    expect(() => insert.run('i1', 'TARDANZA', 20)).not.toThrow();
    expect(() => insert.run('i2', 'TARDANZA', null)).toThrow();
    expect(() => insert.run('i3', 'FALTA', 10)).toThrow();
    expect(() => insert.run('i4', 'FALTA', null)).not.toThrow();
  });

  it('borrar el grupo borra sus propuestas, franjas, votos e incidencias', () => {
    const db = setup();
    db.prepare("INSERT INTO votes (proposal_id, user_id, window_id) VALUES ('p1', 'u1', 'w1')").run();
    db.prepare(
      `INSERT INTO incidences (id, proposal_id, user_id, type, reason, delay_minutes, criticality, created_at)
       VALUES ('i1', 'p1', 'u2', 'FALTA', 'Motivo', NULL, 'MEDIA', '2026-09-29T10:00:00.000Z')`,
    ).run();
    db.prepare("DELETE FROM groups WHERE id = 'g1'").run();
    for (const table of ['proposals', 'proposal_windows', 'votes', 'incidences']) {
      const { n } = db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number };
      expect(n).toBe(0);
    }
  });
});
```

`backend/test/proposal-rules.test.ts`:

```ts
import type { MatchWindow, TimeWindow } from '@hueckoapp/shared';
import { describe, expect, it } from 'vitest';

import { bestWindows, criticalityFor, isVotingOpen, nextOccurrence, pickWinner } from '../src/proposals/rules';

// Martes 29 de septiembre de 2026 a las 10:00, hora local.
const TUESDAY_10 = new Date(2026, 8, 29, 10, 0);

describe('nextOccurrence (C11)', () => {
  it.each([
    [3, '11:00', new Date(2026, 8, 30, 11, 0)], // miércoles: mañana
    [2, '16:00', new Date(2026, 8, 29, 16, 0)], // hoy, más tarde
    [2, '09:00', new Date(2026, 9, 6, 9, 0)], // hoy ya pasó: el martes que viene
    [2, '10:00', new Date(2026, 9, 6, 10, 0)], // justo ahora no cuenta como futuro
    [1, '08:30', new Date(2026, 9, 5, 8, 30)],
    [7, '20:00', new Date(2026, 9, 4, 20, 0)],
  ])('día %i a las %s → %s', (day, time, expected) => {
    expect(nextOccurrence(day, time, TUESDAY_10)).toEqual(expected);
  });
});

const w = (id: string, over: Partial<TimeWindow> = {}): TimeWindow => ({
  id, dayOfWeek: 1, startTime: '10:00', endTime: '12:00', availabilityPercentage: 100, voteCount: 0, ...over,
});

describe('pickWinner (C2)', () => {
  it('gana la más votada', () => {
    expect(pickWinner([w('a', { voteCount: 1 }), w('b', { voteCount: 3, dayOfWeek: 5 })])?.id).toBe('b');
  });

  it('empate de votos: gana la de mayor disponibilidad', () => {
    expect(
      pickWinner([w('a', { voteCount: 2, availabilityPercentage: 67 }), w('b', { voteCount: 2, dayOfWeek: 6 })])?.id,
    ).toBe('b');
  });

  it('empate total: el día y la hora más tempranos', () => {
    const windows = [
      w('a', { voteCount: 1, dayOfWeek: 4 }),
      w('b', { voteCount: 1, dayOfWeek: 2, startTime: '16:00', endTime: '18:00' }),
      w('c', { voteCount: 1, dayOfWeek: 2, startTime: '09:00', endTime: '11:00' }),
    ];
    expect(pickWinner(windows)?.id).toBe('c');
  });

  it('sin votos → null', () => {
    expect(pickWinner([w('a'), w('b')])).toBeNull();
    expect(pickWinner([])).toBeNull();
  });
});

const mw = (dayOfWeek: number, startTime: string, endTime: string, availabilityPercentage = 100): MatchWindow => ({
  dayOfWeek, startTime, endTime, availabilityPercentage, freeMembers: 2,
});

// Semana completa del ejemplo E3 (domain spec §1.2).
const E3 = [
  mw(1, '12:00', '20:00'), mw(2, '08:00', '20:00'), mw(3, '08:00', '14:00'), mw(3, '19:00', '20:00'),
  mw(4, '08:00', '20:00'), mw(5, '08:00', '09:00'), mw(5, '11:00', '20:00'), mw(6, '08:00', '20:00'), mw(7, '08:00', '20:00'),
];

describe('bestWindows (C5)', () => {
  it('E3: las tres franjas de 12 h más tempranas (martes, jueves y sábado)', () => {
    expect(bestWindows(E3)).toEqual([mw(2, '08:00', '20:00'), mw(4, '08:00', '20:00'), mw(6, '08:00', '20:00')]);
  });

  it('el porcentaje manda sobre la duración', () => {
    expect(bestWindows([mw(1, '08:00', '20:00', 80), mw(2, '10:00', '11:00', 100)], 1)).toEqual([mw(2, '10:00', '11:00', 100)]);
  });

  it('con menos de 3 devuelve todas y no cambia la lista recibida', () => {
    const input = [mw(5, '11:00', '20:00'), mw(1, '12:00', '20:00')];
    expect(bestWindows(input)).toEqual([mw(5, '11:00', '20:00'), mw(1, '12:00', '20:00')]);
    expect(input[0]).toEqual(mw(5, '11:00', '20:00'));
  });
});

describe('criticalityFor (G6)', () => {
  it.each([
    ['FALTA', true, null, 'ALTA'],
    ['FALTA', false, null, 'MEDIA'],
    ['IMPREVISTO', true, null, 'MEDIA'],
    ['IMPREVISTO', false, null, 'MEDIA'],
    ['TARDANZA', false, 10, 'BAJA'],
    ['TARDANZA', true, 29, 'BAJA'],
    ['TARDANZA', false, 30, 'MEDIA'],
  ] as const)('%s, imprescindible=%s, %s min → %s', (type, essential, delay, expected) => {
    expect(criticalityFor(type, essential, delay)).toBe(expected);
  });
});

describe('isVotingOpen (C1)', () => {
  const deadline = new Date(2026, 8, 29, 20, 0).toISOString();
  it('abierta si está PROPUESTO y el plazo no pasó', () => {
    expect(isVotingOpen({ state: 'PROPUESTO', votingDeadline: deadline }, TUESDAY_10)).toBe(true);
  });
  it('cerrada al llegar el plazo o si no está PROPUESTO', () => {
    expect(isVotingOpen({ state: 'PROPUESTO', votingDeadline: deadline }, new Date(2026, 8, 29, 20, 0))).toBe(false);
    expect(isVotingOpen({ state: 'CONFIRMADO', votingDeadline: deadline }, TUESDAY_10)).toBe(false);
  });
});
```

`backend/test/window-availability.test.ts`:

```ts
import type { TimeBlock } from '@hueckoapp/shared';
import { describe, expect, it } from 'vitest';

import { windowAvailability } from '../src/availability/group-availability';

const block = (userId: string, dayOfWeek: number, startTime: string, endTime: string, over: Partial<TimeBlock> = {}): TimeBlock => ({
  id: `${userId}-${dayOfWeek}-${startTime}`, userId, label: 'Bloque', type: 'CLASE', startTime, endTime,
  isRecurring: true, dayOfWeek, date: null, ...over,
});

// Grupo de la semilla: yo y Ana, con los bloques de domain spec §3.1.
const group = { memberIds: ['yo', 'ana'], availabilityThreshold: 80 };
const SEED = [
  block('yo', 1, '08:00', '10:00'), block('yo', 3, '14:00', '16:00'),
  block('ana', 1, '08:00', '12:00'), block('ana', 3, '15:00', '19:00'), block('ana', 5, '09:00', '11:00'),
];

describe('windowAvailability (G2)', () => {
  it.each([
    [{ dayOfWeek: 3, startTime: '11:00', endTime: '13:00' }, 100],
    [{ dayOfWeek: 1, startTime: '10:00', endTime: '12:00' }, 50],
    [{ dayOfWeek: 3, startTime: '14:30', endTime: '15:30' }, 0], // toca la hora 14 (50 %) y la 15 (0 %): el peor
    [{ dayOfWeek: 5, startTime: '16:00', endTime: '18:00' }, 100],
    [{ dayOfWeek: 1, startTime: '07:00', endTime: '09:00' }, 0], // fuera de 08–20 también se calcula
    [{ dayOfWeek: 2, startTime: '21:00', endTime: '22:30' }, 100],
  ])('%j → %i %', (window, expected) => {
    expect(windowAvailability(group, SEED, window)).toBe(expected);
  });

  it('ignora bloques LIBRE, puntuales y de quien no es miembro', () => {
    const blocks = [
      block('yo', 2, '10:00', '12:00', { type: 'LIBRE' }),
      block('ana', 2, '10:00', '12:00', { isRecurring: false, dayOfWeek: null, date: '2026-09-29' }),
      block('otro', 2, '10:00', '12:00'),
    ];
    expect(windowAvailability(group, blocks, { dayOfWeek: 2, startTime: '10:00', endTime: '12:00' })).toBe(100);
  });

  it('grupo sin miembros → 0', () => {
    expect(windowAvailability({ memberIds: [], availabilityThreshold: 80 }, SEED, { dayOfWeek: 2, startTime: '10:00', endTime: '11:00' })).toBe(0);
  });
});
```

- [ ] **Step 3: Ejecutar y ver que falla** — `npm test -w backend -- database proposal-rules window-availability` → FAIL (`no such table: proposals`, módulo `rules` inexistente, `windowAvailability` no exportado).

- [ ] **Step 4: Implementar**

`backend/src/db/migrations.ts` — añadir al final del array (después de la migración 2):

```ts
  // 3 — Fase 3: propuestas de plan, sus franjas, votos (uno por persona y propuesta) e incidencias.
  // chosen_window_id no lleva FK para no crear un ciclo proposals ↔ proposal_windows: lo garantiza el código.
  `CREATE TABLE proposals (
     id               TEXT PRIMARY KEY,
     group_id         TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
     title            TEXT NOT NULL,
     location_name    TEXT,
     latitude         REAL CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90),
     longitude        REAL CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180),
     created_by       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     voting_deadline  TEXT NOT NULL,
     state            TEXT NOT NULL DEFAULT 'PROPUESTO'
                      CHECK (state IN ('PROPUESTO', 'CONFIRMADO', 'CANCELADO', 'EN_RECOORDINACION')),
     chosen_window_id TEXT,
     scheduled_at     TEXT,
     created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
     CHECK ((latitude IS NULL) = (longitude IS NULL)),
     CHECK (location_name IS NOT NULL OR latitude IS NULL)
   );
   CREATE INDEX proposals_group_idx ON proposals (group_id, created_at);
   CREATE TABLE proposal_windows (
     id                      TEXT PRIMARY KEY,
     proposal_id             TEXT NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
     day_of_week             INTEGER NOT NULL CHECK (day_of_week BETWEEN 1 AND 7),
     start_time              TEXT NOT NULL,
     end_time                TEXT NOT NULL,
     availability_percentage INTEGER NOT NULL CHECK (availability_percentage BETWEEN 0 AND 100),
     CHECK (start_time < end_time),
     UNIQUE (proposal_id, day_of_week, start_time, end_time),
     UNIQUE (id, proposal_id)
   );
   CREATE TABLE votes (
     proposal_id TEXT NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
     user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     window_id   TEXT NOT NULL,
     created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
     PRIMARY KEY (proposal_id, user_id),
     FOREIGN KEY (window_id, proposal_id) REFERENCES proposal_windows (id, proposal_id) ON DELETE CASCADE
   );
   CREATE INDEX votes_window_idx ON votes (window_id);
   CREATE TABLE incidences (
     id            TEXT PRIMARY KEY,
     proposal_id   TEXT NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
     user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     type          TEXT NOT NULL CHECK (type IN ('FALTA', 'TARDANZA', 'IMPREVISTO')),
     reason        TEXT NOT NULL,
     delay_minutes INTEGER,
     criticality   TEXT NOT NULL CHECK (criticality IN ('BAJA', 'MEDIA', 'ALTA')),
     resolved      INTEGER NOT NULL DEFAULT 0 CHECK (resolved IN (0, 1)),
     created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
     CHECK ((type = 'TARDANZA' AND delay_minutes > 0) OR (type <> 'TARDANZA' AND delay_minutes IS NULL))
   );
   CREATE INDEX incidences_proposal_idx ON incidences (proposal_id);`,
```

`backend/src/proposals/rules.ts`:

```ts
import type { Criticality, IncidenceType, MatchWindow, Proposal, TimeWindow } from '@hueckoapp/shared';

// Reglas puras de las propuestas (domain spec §5). Sin base de datos: se prueban aparte.

/** Día ISO (1 = lunes … 7 = domingo) de una fecha en hora local. */
const isoDayOf = (date: Date) => ((date.getDay() + 6) % 7) + 1;

/**
 * C11: la próxima vez (estrictamente posterior a `from`) que ocurre `dayOfWeek` a las `startTime`, en hora local
 * del servidor. Si hoy es ese día y la hora aún no llegó, es hoy; si ya pasó, la semana siguiente.
 */
export function nextOccurrence(dayOfWeek: number, startTime: string, from: Date): Date {
  const [hours, minutes] = startTime.split(':').map(Number);
  for (let offset = 0; offset <= 7; offset++) {
    const candidate = new Date(from.getFullYear(), from.getMonth(), from.getDate() + offset, hours, minutes);
    if (isoDayOf(candidate) === dayOfWeek && candidate.getTime() > from.getTime()) return candidate;
  }
  throw new Error(`Día de la semana inválido: ${dayOfWeek}`);
}

/**
 * C2: «gana la más votada». Empates: mayor % de disponibilidad, después el día y la hora más tempranos.
 * null si nadie votó.
 */
export function pickWinner(windows: readonly TimeWindow[]): TimeWindow | null {
  const voted = windows.filter((w) => w.voteCount > 0);
  if (voted.length === 0) return null;
  return [...voted].sort(
    (a, b) =>
      b.voteCount - a.voteCount ||
      b.availabilityPercentage - a.availabilityPercentage ||
      a.dayOfWeek - b.dayOfWeek ||
      a.startTime.localeCompare(b.startTime),
  )[0];
}

const wholeHours = (w: MatchWindow) => Number(w.endTime.slice(0, 2)) - Number(w.startTime.slice(0, 2));

/** C5: «las 3 mejores franjas» = mayor %, después mayor duración, después día y hora más tempranos. */
export function bestWindows(windows: readonly MatchWindow[], count = 3): MatchWindow[] {
  return [...windows]
    .sort(
      (a, b) =>
        b.availabilityPercentage - a.availabilityPercentage ||
        wholeHours(b) - wholeHours(a) ||
        a.dayOfWeek - b.dayOfWeek ||
        a.startTime.localeCompare(b.startTime),
    )
    .slice(0, count);
}

/** G6: la criticidad la decide el servidor. */
export function criticalityFor(type: IncidenceType, isEssential: boolean, delayMinutes: number | null): Criticality {
  if (type === 'FALTA') return isEssential ? 'ALTA' : 'MEDIA';
  if (type === 'IMPREVISTO') return 'MEDIA';
  return (delayMinutes ?? 0) >= 30 ? 'MEDIA' : 'BAJA';
}

/** C1: se vota solo con la propuesta en PROPUESTO y antes de su plazo. */
export const isVotingOpen = (p: Pick<Proposal, 'state' | 'votingDeadline'>, now: Date) =>
  p.state === 'PROPUESTO' && new Date(p.votingDeadline).getTime() > now.getTime();
```

`backend/src/availability/group-availability.ts` — reemplazar el archivo completo:

```ts
import type { MatchWindow, TimeBlock, TimeWindowInput } from '@hueckoapp/shared';

import { endHour, startHour, weeklyWindows, type MatcherGroup } from './matcher';

// Reglas añadidas sobre el matcher de Kotlin (domain spec G13 y B14), documentadas en docs/api.md:
// - solo cuentan los bloques recurrentes: la vista es semanal y un puntual tiene fecha, no día fijo;
// - un bloque LIBRE no ocupa: marca tiempo libre.
const busyBlocks = (blocks: readonly TimeBlock[]) => blocks.filter((b) => b.isRecurring && b.type !== 'LIBRE');

export function groupAvailability(group: MatcherGroup, blocks: readonly TimeBlock[]): MatchWindow[] {
  return weeklyWindows(group, busyBlocks(blocks));
}

/**
 * G2: % de disponibilidad de una franja cualquiera (p. ej. añadida a mano a una propuesta).
 * Recorre cada hora que toca la franja con el mismo redondeo que el matcher (inicio truncado, fin hacia arriba)
 * y devuelve el PEOR %. No aplica el umbral del grupo ni el rango 08–20.
 */
export function windowAvailability(group: MatcherGroup, blocks: readonly TimeBlock[], window: TimeWindowInput): number {
  const size = group.memberIds.length;
  if (size === 0) return 0;
  const members = new Set(group.memberIds);
  const relevant = busyBlocks(blocks).filter((b) => members.has(b.userId) && b.dayOfWeek === window.dayOfWeek);
  let worst = 100;
  for (let hour = startHour(window.startTime); hour < endHour(window.endTime); hour++) {
    const busy = new Set(relevant.filter((b) => hour >= startHour(b.startTime) && hour < endHour(b.endTime)).map((b) => b.userId));
    worst = Math.min(worst, Math.round(((size - busy.size) * 100) / size));
  }
  return worst;
}
```

`backend/src/app.ts` — en `AppDeps`, después de `authRateLimit?: number;` añadir:

```ts
  // Reloj de la app (plazos de votación, scheduledAt). Los tests lo fijan; por defecto, la hora real.
  now?: () => Date;
```

`backend/test/helpers.ts` — reemplazar `makeTestApp` por:

```ts
export function makeTestApp(options?: { authRateLimit?: number; now?: () => Date }): { app: Express; db: Db } {
  const db = openDatabase(':memory:');
  const app = createApp({
    db,
    jwtSecret: TEST_SECRET,
    jwtExpiresIn: '1h',
    authRateLimit: options?.authRateLimit ?? 10_000,
    now: options?.now,
  });
  return { app, db };
}

// Reloj que el test mueve a mano: makeTestApp({ now: clock.now }) y después clock.set(...).
export function makeClock(start: Date) {
  let current = start;
  return {
    now: () => current,
    set: (date: Date) => {
      current = date;
    },
  };
}
```

- [ ] **Step 5: Ejecutar y ver que pasa** — `npm test -w backend` → PASS (todos, incluidos los de fases anteriores). `npm run typecheck` → sin errores (el cambio de `Proposal` en `shared` no rompe nada: todavía nadie lo construye).

- [ ] **Step 6: Commit** — `git add shared/index.d.ts backend/src/db/migrations.ts backend/src/app.ts backend/src/availability/group-availability.ts backend/src/proposals/rules.ts backend/test/helpers.ts backend/test/database.test.ts backend/test/proposal-rules.test.ts backend/test/window-availability.test.ts` → `feat(backend): modelo de propuestas (migración 3) y reglas puras de votación`

---

### Task 2: Backend — crear, listar, ver y votar propuestas; añadir franjas

**Files:**
- Create: `backend/src/groups/group-access.ts`, `backend/src/proposals/proposals.schemas.ts`, `backend/src/proposals/proposals.repository.ts`, `backend/src/proposals/proposals.routes.ts`, `backend/test/proposals.test.ts`
- Modify: `backend/src/groups/groups.routes.ts`, `backend/src/app.ts`, `backend/test/helpers.ts`, `docs/api.md`

**Interfaces:**
- Consumes: todo lo de Task 1; `groupsRepository(db)` (`findById`, `isMember`); `timeBlocksRepository(db).listRecurringByUsers`; `TIME_REGEX` (`src/schedule/time-blocks.schemas.ts`); `getUserId`, `requireAuth`, `ApiError`.
- Produces:
  - `loadGroupForMember(groups: ReturnType<typeof groupsRepository>, groupId: string, userId: string): { group: Group; me: GroupMember }` (404 `GROUP_NOT_FOUND`, 403 `NOT_A_MEMBER`).
  - `src/proposals/proposals.schemas.ts`: `timeWindowInputSchema`, `futureDeadline(now: Date)`, `createProposalSchema(now: Date)`, `voteSchema`.
  - `proposalsRepository(db)` → `{ findById(id, viewerId): Proposal | undefined; listByGroup(groupId, viewerId): Proposal[]; create(input: NewProposal): string; addWindow(proposalId, w: NewWindow): string; vote(proposalId, userId, windowId): void; unvote(proposalId, userId): void }` con `NewWindow = { dayOfWeek; startTime; endTime; availabilityPercentage }` y `NewProposal = { groupId; createdBy; title; location: Location | null; votingDeadline; windows: NewWindow[]; createdAt }` (Task 3 y 4 añaden métodos).
  - `groupProposalsRouter(deps)` montado en `/api/groups` (`GET/POST /:id/proposals`); `proposalsRouter(deps)` montado en `/api/proposals` (`GET /:id`, `PUT/DELETE /:id/vote`, `POST /:id/windows`); `proposalsContext(deps)` interno.
  - `test/helpers.ts`: `addWeeklyBlock(app, token, dayOfWeek, startTime, endTime): Promise<void>`; `setupSeedGroup(app): Promise<{ yo; ana; group: Group }>` (yo = «Usuario de Prueba» OWNER, ana = «Ana» MEMBER, con los 5 bloques de la semilla); `createProposal(app, token, groupId, body: Partial<ProposalInput> & { votingDeadline: string }): Promise<Proposal>`.

- [ ] **Step 1: Escribir los tests que fallan**

Añadir a `backend/test/helpers.ts` (y en su cabecera cambiar el import de tipos a `import type { Group, Proposal, ProposalInput, User } from '@hueckoapp/shared';`):

```ts
export async function addWeeklyBlock(app: Express, token: string, dayOfWeek: number, startTime: string, endTime: string): Promise<void> {
  const res = await request(app)
    .post('/api/me/time-blocks')
    .set(bearer(token))
    .send({ label: 'Bloque', type: 'CLASE', startTime, endTime, isRecurring: true, dayOfWeek, date: null });
  if (res.status !== 201) throw new Error(`crear bloque falló: ${res.status} ${JSON.stringify(res.body)}`);
}

// Escenario de la semilla (domain spec §3.1) montado por la API: «Usuario de Prueba» (OWNER) y Ana
// en un grupo, cada uno con sus bloques. Con él, el cruce del grupo es exactamente el ejemplo E3.
export async function setupSeedGroup(app: Express) {
  const yo = await registerUser(app, { name: 'Usuario de Prueba' });
  const ana = await registerUser(app, { name: 'Ana' });
  const group = await createGroup(app, yo.token);
  await joinGroup(app, ana.token, group.inviteCode);
  await addWeeklyBlock(app, yo.token, 1, '08:00', '10:00');
  await addWeeklyBlock(app, yo.token, 3, '14:00', '16:00');
  await addWeeklyBlock(app, ana.token, 1, '08:00', '12:00');
  await addWeeklyBlock(app, ana.token, 3, '15:00', '19:00');
  await addWeeklyBlock(app, ana.token, 5, '09:00', '11:00');
  return { yo, ana, group };
}

export async function createProposal(
  app: Express,
  token: string,
  groupId: string,
  body: Partial<ProposalInput> & { votingDeadline: string },
): Promise<Proposal> {
  const res = await request(app).post(`/api/groups/${groupId}/proposals`).set(bearer(token)).send({ title: 'Plan', ...body });
  if (res.status !== 201) throw new Error(`crear propuesta falló: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body;
}
```

`backend/test/proposals.test.ts`:

```ts
import type { Group, Proposal, User } from '@hueckoapp/shared';
import type { Express } from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';

import { bearer, createProposal, makeClock, makeTestApp, registerUser, setupSeedGroup } from './helpers';

// Martes 29/09/2026 a las 10:00 (hora local); la votación cierra el sábado 3/10 a las 20:00.
const NOW = new Date(2026, 8, 29, 10, 0);
const DEADLINE = new Date(2026, 9, 3, 20, 0).toISOString();
const AFTER_DEADLINE = new Date(2026, 9, 3, 20, 1);

let app: Express;
let clock: ReturnType<typeof makeClock>;
let yo: { token: string; user: User };
let ana: { token: string; user: User };
let group: Group;

beforeEach(async () => {
  clock = makeClock(NOW);
  ({ app } = makeTestApp({ now: clock.now }));
  ({ yo, ana, group } = await setupSeedGroup(app));
});

const post = (body: object, token = yo.token, groupId = group.id) =>
  request(app).post(`/api/groups/${groupId}/proposals`).set(bearer(token)).send({ title: 'Repaso', votingDeadline: DEADLINE, ...body });

// Propuesta de la semilla prop_2: martes 16–18, jueves 10–12 y viernes 16–18.
const prop2 = () =>
  createProposal(app, ana.token, group.id, {
    title: 'Repaso antes de la entrega',
    votingDeadline: DEADLINE,
    windows: [
      { dayOfWeek: 2, startTime: '16:00', endTime: '18:00' },
      { dayOfWeek: 4, startTime: '10:00', endTime: '12:00' },
      { dayOfWeek: 5, startTime: '16:00', endTime: '18:00' },
    ],
  });
const windowOf = (p: Proposal, dayOfWeek: number) => p.windows.find((w) => w.dayOfWeek === dayOfWeek)!;
const counts = (p: Proposal) => p.windows.map((w) => w.voteCount);

describe('POST /api/groups/:id/proposals', () => {
  it('con franjas: 201, PROPUESTO, % calculado por el servidor y franjas por día y hora', async () => {
    const res = await post({
      title: '  Repaso antes de la entrega ',
      location: { name: '  Google Meet ' },
      windows: [
        { dayOfWeek: 5, startTime: '16:00', endTime: '18:00' },
        { dayOfWeek: 2, startTime: '16:00', endTime: '18:00' },
        { dayOfWeek: 1, startTime: '10:00', endTime: '12:00' },
      ],
    });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      id: expect.any(String),
      groupId: group.id,
      title: 'Repaso antes de la entrega',
      location: { name: 'Google Meet', latitude: null, longitude: null },
      createdBy: yo.user,
      votingDeadline: DEADLINE,
      state: 'PROPUESTO',
      windows: [
        { id: expect.any(String), dayOfWeek: 1, startTime: '10:00', endTime: '12:00', availabilityPercentage: 50, voteCount: 0 },
        { id: expect.any(String), dayOfWeek: 2, startTime: '16:00', endTime: '18:00', availabilityPercentage: 100, voteCount: 0 },
        { id: expect.any(String), dayOfWeek: 5, startTime: '16:00', endTime: '18:00', availabilityPercentage: 100, voteCount: 0 },
      ],
      myVoteWindowId: null,
      chosenWindowId: null,
      scheduledAt: null,
      incidences: [],
      createdAt: NOW.toISOString(),
    });
  });

  it('sin franjas: propone las 3 mejores del cruce del grupo (C5)', async () => {
    const res = await post({});
    expect(res.status).toBe(201);
    expect(res.body.windows.map((w: Proposal['windows'][number]) => [w.dayOfWeek, w.startTime, w.endTime, w.availabilityPercentage])).toEqual([
      [2, '08:00', '20:00', 100],
      [4, '08:00', '20:00', 100],
      [6, '08:00', '20:00', 100],
    ]);
  });

  it('guarda el lugar con coordenadas y normaliza el plazo a UTC', async () => {
    const res = await post({
      location: { name: 'Biblioteca', latitude: -12.07, longitude: -77.08 },
      votingDeadline: '2026-10-03T20:00:00-05:00',
    });
    expect(res.status).toBe(201);
    expect(res.body.location).toEqual({ name: 'Biblioteca', latitude: -12.07, longitude: -77.08 });
    expect(res.body.votingDeadline).toBe('2026-10-04T01:00:00.000Z');
  });

  it.each([
    [{ title: '   ' }, ['title'], 'El título no puede estar vacío.'],
    [{ votingDeadline: 'mañana' }, ['votingDeadline'], 'Fecha límite inválida (ISO 8601)'],
    [{ votingDeadline: new Date(2026, 8, 29, 9, 0).toISOString() }, ['votingDeadline'], 'La fecha límite debe ser futura'],
    [{ windows: [{ dayOfWeek: 2, startTime: '18:00', endTime: '16:00' }] }, ['windows', 0, 'endTime'], 'La hora de fin debe ser posterior a la de inicio'],
    [{ windows: [{ dayOfWeek: 2, startTime: '9:00', endTime: '11:00' }] }, ['windows', 0, 'startTime'], 'Formato HH:mm'],
    [{ windows: [{ dayOfWeek: 8, startTime: '09:00', endTime: '11:00' }] }, ['windows', 0, 'dayOfWeek'], 'Día inválido'],
    [
      { windows: [{ dayOfWeek: 2, startTime: '09:00', endTime: '11:00' }, { dayOfWeek: 2, startTime: '09:00', endTime: '11:00' }] },
      ['windows'],
      'Hay franjas repetidas',
    ],
    [{ location: { name: 'Biblioteca', latitude: 10 } }, ['location', 'latitude'], 'Envía latitud y longitud juntas'],
    [{ location: { name: '  ' } }, ['location', 'name'], 'El lugar necesita un nombre'],
  ])('valida %j → 400 en %j', async (body, path, message) => {
    const res = await post(body);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details).toContainEqual(expect.objectContaining({ path, message }));
  });

  it('403 si no soy miembro; 404 si el grupo no existe', async () => {
    const otra = await registerUser(app);
    expect((await post({}, otra.token)).body.error.code).toBe('NOT_A_MEMBER');
    expect((await post({}, yo.token, 'no-existe')).status).toBe(404);
  });
});

describe('GET /api/groups/:id/proposals', () => {
  it('las más recientes primero (C10)', async () => {
    const primera = await createProposal(app, yo.token, group.id, { title: 'Primera', votingDeadline: DEADLINE });
    clock.set(new Date(2026, 8, 29, 10, 5));
    const segunda = await createProposal(app, ana.token, group.id, { title: 'Segunda', votingDeadline: DEADLINE });
    const res = await request(app).get(`/api/groups/${group.id}/proposals`).set(bearer(yo.token));
    expect(res.status).toBe(200);
    expect(res.body.map((p: Proposal) => p.id)).toEqual([segunda.id, primera.id]);
  });

  it('a igual createdAt, la última creada va primero', async () => {
    const a = await createProposal(app, yo.token, group.id, { title: 'A', votingDeadline: DEADLINE });
    const b = await createProposal(app, yo.token, group.id, { title: 'B', votingDeadline: DEADLINE });
    const res = await request(app).get(`/api/groups/${group.id}/proposals`).set(bearer(yo.token));
    expect(res.body.map((p: Proposal) => p.id)).toEqual([b.id, a.id]);
  });

  it('403 a quien no es miembro', async () => {
    const otra = await registerUser(app);
    expect((await request(app).get(`/api/groups/${group.id}/proposals`).set(bearer(otra.token))).status).toBe(403);
  });
});

describe('GET /api/proposals/:id', () => {
  it('200 a un miembro, 403 a quien no lo es, 404 si no existe', async () => {
    const p = await prop2();
    expect((await request(app).get(`/api/proposals/${p.id}`).set(bearer(yo.token))).body).toEqual(p);
    const otra = await registerUser(app);
    const ajena = await request(app).get(`/api/proposals/${p.id}`).set(bearer(otra.token));
    expect([ajena.status, ajena.body.error.code]).toEqual([403, 'NOT_A_MEMBER']);
    const nada = await request(app).get('/api/proposals/no-existe').set(bearer(yo.token));
    expect([nada.status, nada.body.error.code]).toEqual([404, 'PROPOSAL_NOT_FOUND']);
  });
});

describe('PUT/DELETE /api/proposals/:id/vote', () => {
  const vote = (id: string, windowId: string, token: string) =>
    request(app).put(`/api/proposals/${id}/vote`).set(bearer(token)).send({ windowId });
  const unvote = (id: string, token: string) => request(app).delete(`/api/proposals/${id}/vote`).set(bearer(token));

  it('votar, mover el voto y repetir la misma franja sin cambios (G1)', async () => {
    const p = await prop2();
    const martes = windowOf(p, 2).id;
    const jueves = windowOf(p, 4).id;

    const deAna = await vote(p.id, martes, ana.token);
    expect(deAna.status).toBe(200);
    expect(deAna.body.myVoteWindowId).toBe(martes);
    expect(counts(deAna.body)).toEqual([1, 0, 0]);

    await vote(p.id, jueves, yo.token);
    const movido = await vote(p.id, martes, yo.token);
    expect(movido.body.myVoteWindowId).toBe(martes);
    expect(counts(movido.body)).toEqual([2, 0, 0]);

    const repetido = await vote(p.id, martes, yo.token);
    expect(repetido.status).toBe(200);
    expect(counts(repetido.body)).toEqual([2, 0, 0]);
  });

  it('DELETE retira mi voto y no falla si no había', async () => {
    const p = await prop2();
    await vote(p.id, windowOf(p, 2).id, yo.token);
    const res = await unvote(p.id, yo.token);
    expect(res.status).toBe(200);
    expect(res.body.myVoteWindowId).toBeNull();
    expect(counts(res.body)).toEqual([0, 0, 0]);
    expect((await unvote(p.id, yo.token)).status).toBe(200);
  });

  it('409 VOTING_CLOSED al pasar el plazo (C1), también para retirar', async () => {
    const p = await prop2();
    await vote(p.id, windowOf(p, 2).id, yo.token);
    clock.set(AFTER_DEADLINE);
    const res = await vote(p.id, windowOf(p, 4).id, yo.token);
    expect([res.status, res.body.error.code, res.body.error.message]).toEqual([409, 'VOTING_CLOSED', 'La votación ya cerró.']);
    expect((await unvote(p.id, yo.token)).body.error.code).toBe('VOTING_CLOSED');
  });

  it('404 WINDOW_NOT_FOUND con una franja de otra propuesta; 400 sin windowId', async () => {
    const p = await prop2();
    const otra = await createProposal(app, yo.token, group.id, { votingDeadline: DEADLINE });
    const res = await vote(p.id, otra.windows[0].id, yo.token);
    expect([res.status, res.body.error.code]).toEqual([404, 'WINDOW_NOT_FOUND']);
    const sinId = await request(app).put(`/api/proposals/${p.id}/vote`).set(bearer(yo.token)).send({});
    expect(sinId.status).toBe(400);
  });

  it('403 a quien no es miembro', async () => {
    const p = await prop2();
    const otra = await registerUser(app);
    expect((await vote(p.id, windowOf(p, 2).id, otra.token)).status).toBe(403);
  });
});

describe('POST /api/proposals/:id/windows (G2)', () => {
  const addWindow = (id: string, body: object, token = ana.token) =>
    request(app).post(`/api/proposals/${id}/windows`).set(bearer(token)).send(body);

  it('201 con el % del servidor, ordenada por día y hora', async () => {
    const p = await prop2();
    const res = await addWindow(p.id, { dayOfWeek: 3, startTime: '14:30', endTime: '15:30' });
    expect(res.status).toBe(201);
    expect(res.body.windows.map((w: Proposal['windows'][number]) => [w.dayOfWeek, w.startTime, w.availabilityPercentage])).toEqual([
      [2, '16:00', 100],
      [3, '14:30', 0],
      [4, '10:00', 100],
      [5, '16:00', 100],
    ]);
  });

  it('409 WINDOW_EXISTS si ya está; 400 si el fin no es posterior; 409 si la votación cerró', async () => {
    const p = await prop2();
    const repetida = await addWindow(p.id, { dayOfWeek: 2, startTime: '16:00', endTime: '18:00' });
    expect([repetida.status, repetida.body.error.code, repetida.body.error.message]).toEqual([409, 'WINDOW_EXISTS', 'Esa franja ya está propuesta.']);
    const alReves = await addWindow(p.id, { dayOfWeek: 2, startTime: '18:00', endTime: '17:00' });
    expect(alReves.body.error.details).toContainEqual(expect.objectContaining({ path: ['endTime'] }));
    clock.set(AFTER_DEADLINE);
    expect((await addWindow(p.id, { dayOfWeek: 6, startTime: '10:00', endTime: '11:00' })).body.error.code).toBe('VOTING_CLOSED');
  });
});
```

- [ ] **Step 2: Ejecutar y ver que falla** — `npm test -w backend -- proposals` → FAIL (rutas 404, helpers sin rutas).

- [ ] **Step 3: Implementar**

`backend/src/groups/group-access.ts`:

```ts
import type { Group, GroupMember } from '@hueckoapp/shared';

import { ApiError } from '../middleware/errors';
import type { groupsRepository } from './groups.repository';

type GroupsRepository = ReturnType<typeof groupsRepository>;

// 404 si el grupo no existe; 403 si existe pero no soy miembro (igual en todas las rutas del grupo y sus propuestas).
export function loadGroupForMember(groups: GroupsRepository, groupId: string, userId: string): { group: Group; me: GroupMember } {
  const group = groups.findById(groupId);
  if (!group) throw new ApiError(404, 'GROUP_NOT_FOUND', 'Grupo no encontrado.');
  const me = group.members.find((m) => m.id === userId);
  if (!me) throw new ApiError(403, 'NOT_A_MEMBER', 'No perteneces a este grupo.');
  return { group, me };
}
```

`backend/src/groups/groups.routes.ts` — sustituir la función local `loadForMember` (el bloque `const loadForMember = (groupId: string, userId: string) => { … };`) por:

```ts
  const loadForMember = (groupId: string, userId: string) => loadGroupForMember(groups, groupId, userId);
```
y añadir `import { loadGroupForMember } from './group-access';`. Quitar `ApiError` del import solo si deja de usarse (sigue usándose en `/join` y `loadForOwner`, así que se queda).

`backend/src/proposals/proposals.schemas.ts`:

```ts
import { z } from 'zod';

import { TIME_REGEX } from '../schedule/time-blocks.schemas';

const time = z.string({ error: 'Formato HH:mm' }).regex(TIME_REGEX, 'Formato HH:mm');

// Franja de una propuesta: mismas reglas de hora que los bloques de horario.
export const timeWindowInputSchema = z
  .object({
    dayOfWeek: z.number({ error: 'Día inválido' }).int('Día inválido').min(1, 'Día inválido').max(7, 'Día inválido'),
    startTime: time,
    endTime: time,
  })
  .superRefine((w, ctx) => {
    if (TIME_REGEX.test(w.startTime) && TIME_REGEX.test(w.endTime) && w.endTime <= w.startTime) {
      ctx.addIssue({ code: 'custom', path: ['endTime'], message: 'La hora de fin debe ser posterior a la de inicio' });
    }
  });

// Fecha y hora ISO 8601 (con Z u offset) posterior a `now` (C1). Depende del reloj: se construye en cada petición.
export const futureDeadline = (now: Date) =>
  z
    .iso.datetime({ offset: true, error: 'Fecha límite inválida (ISO 8601)' })
    .refine((value) => new Date(value).getTime() > now.getTime(), 'La fecha límite debe ser futura');

const locationSchema = z
  .object({
    name: z.string({ error: 'El lugar necesita un nombre' }).trim().min(1, 'El lugar necesita un nombre').max(100, 'Máximo 100 caracteres'),
    latitude: z.number({ error: 'Latitud inválida' }).min(-90, 'Latitud inválida').max(90, 'Latitud inválida').nullable().default(null),
    longitude: z.number({ error: 'Longitud inválida' }).min(-180, 'Longitud inválida').max(180, 'Longitud inválida').nullable().default(null),
  })
  .refine((l) => (l.latitude === null) === (l.longitude === null), { path: ['latitude'], message: 'Envía latitud y longitud juntas' });

const windowKey = (w: { dayOfWeek: number; startTime: string; endTime: string }) => `${w.dayOfWeek}|${w.startTime}|${w.endTime}`;

export const createProposalSchema = (now: Date) =>
  z.object({
    title: z
      .string({ error: 'El título no puede estar vacío.' })
      .trim()
      .min(1, 'El título no puede estar vacío.')
      .max(80, 'Máximo 80 caracteres'),
    location: locationSchema.nullish().transform((l) => l ?? null),
    votingDeadline: futureDeadline(now),
    windows: z
      .array(timeWindowInputSchema, { error: 'Envía una lista de franjas' })
      .max(10, 'Máximo 10 franjas')
      .refine((ws) => new Set(ws.map(windowKey)).size === ws.length, 'Hay franjas repetidas')
      .default([]),
  });

export const voteSchema = z.object({
  windowId: z.string({ error: 'Elige una franja' }).min(1, 'Elige una franja'),
});
```

`backend/src/proposals/proposals.repository.ts`:

```ts
import { randomUUID } from 'node:crypto';

import type { Criticality, Incidence, IncidenceType, Location, Proposal, ProposalState, TimeWindow } from '@hueckoapp/shared';

import type { Db } from '../db/database';
import { withTransaction } from '../db/transaction';

type ProposalRow = {
  id: string;
  group_id: string;
  group_name: string;
  title: string;
  location_name: string | null;
  latitude: number | null;
  longitude: number | null;
  created_by: string;
  creator_name: string;
  creator_email: string;
  voting_deadline: string;
  state: ProposalState;
  chosen_window_id: string | null;
  scheduled_at: string | null;
  created_at: string;
};
type WindowRow = { id: string; day_of_week: number; start_time: string; end_time: string; availability_percentage: number; vote_count: number };
type IncidenceRow = {
  id: string;
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

export type NewWindow = { dayOfWeek: number; startTime: string; endTime: string; availabilityPercentage: number };
export type NewProposal = {
  groupId: string;
  createdBy: string;
  title: string;
  location: Location | null;
  votingDeadline: string;
  windows: NewWindow[];
  createdAt: string;
};

// Una fila de proposals con el nombre del grupo y los datos de quien la creó.
const SELECT_PROPOSAL = `
  SELECT p.*, g.name AS group_name, u.name AS creator_name, u.email AS creator_email
  FROM proposals p
  JOIN groups g ON g.id = p.group_id
  JOIN users u ON u.id = p.created_by`;

export function proposalsRepository(db: Db) {
  const windowsOf = (proposalId: string): TimeWindow[] =>
    (
      db
        .prepare(
          `SELECT w.id, w.day_of_week, w.start_time, w.end_time, w.availability_percentage,
                  (SELECT COUNT(*) FROM votes v WHERE v.window_id = w.id) AS vote_count
           FROM proposal_windows w WHERE w.proposal_id = ?
           ORDER BY w.day_of_week, w.start_time, w.end_time`,
        )
        .all(proposalId) as WindowRow[]
    ).map((r) => ({
      id: r.id,
      dayOfWeek: r.day_of_week,
      startTime: r.start_time,
      endTime: r.end_time,
      availabilityPercentage: r.availability_percentage,
      voteCount: r.vote_count,
    }));

  const incidencesOf = (proposalId: string): Incidence[] =>
    (
      db
        .prepare(
          `SELECT i.*, u.name AS user_name, u.email AS user_email
           FROM incidences i JOIN users u ON u.id = i.user_id
           WHERE i.proposal_id = ? ORDER BY i.created_at, i.rowid`,
        )
        .all(proposalId) as IncidenceRow[]
    ).map((r) => ({
      id: r.id,
      user: { id: r.user_id, name: r.user_name, email: r.user_email },
      type: r.type,
      reason: r.reason,
      delayMinutes: r.delay_minutes,
      criticality: r.criticality,
      resolved: r.resolved === 1,
      createdAt: r.created_at,
    }));

  const myVote = (proposalId: string, viewerId: string): string | null => {
    const row = db.prepare('SELECT window_id FROM votes WHERE proposal_id = ? AND user_id = ?').get(proposalId, viewerId) as
      | { window_id: string }
      | undefined;
    return row?.window_id ?? null;
  };

  // `viewerId` decide myVoteWindowId: la misma propuesta se ve distinta según quién pregunta.
  const toProposal = (row: ProposalRow, viewerId: string): Proposal => ({
    id: row.id,
    groupId: row.group_id,
    title: row.title,
    location: row.location_name === null ? null : { name: row.location_name, latitude: row.latitude, longitude: row.longitude },
    createdBy: { id: row.created_by, name: row.creator_name, email: row.creator_email },
    votingDeadline: row.voting_deadline,
    state: row.state,
    windows: windowsOf(row.id),
    myVoteWindowId: myVote(row.id, viewerId),
    chosenWindowId: row.chosen_window_id,
    scheduledAt: row.scheduled_at,
    incidences: incidencesOf(row.id),
    createdAt: row.created_at,
  });

  const insertWindow = (proposalId: string, w: NewWindow): string => {
    const id = randomUUID();
    db.prepare(
      'INSERT INTO proposal_windows (id, proposal_id, day_of_week, start_time, end_time, availability_percentage) VALUES (?, ?, ?, ?, ?, ?)',
    ).run(id, proposalId, w.dayOfWeek, w.startTime, w.endTime, w.availabilityPercentage);
    return id;
  };

  return {
    findById(id: string, viewerId: string): Proposal | undefined {
      const row = db.prepare(`${SELECT_PROPOSAL} WHERE p.id = ?`).get(id) as ProposalRow | undefined;
      return row && toProposal(row, viewerId);
    },

    // Las más recientes primero (C10); a igual createdAt, la última insertada.
    listByGroup(groupId: string, viewerId: string): Proposal[] {
      const rows = db.prepare(`${SELECT_PROPOSAL} WHERE p.group_id = ? ORDER BY p.created_at DESC, p.rowid DESC`).all(groupId) as ProposalRow[];
      return rows.map((r) => toProposal(r, viewerId));
    },

    // La propuesta y sus franjas, todo o nada.
    create(input: NewProposal): string {
      const id = randomUUID();
      withTransaction(db, () => {
        db.prepare(
          `INSERT INTO proposals (id, group_id, title, location_name, latitude, longitude, created_by, voting_deadline, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          id, input.groupId, input.title, input.location?.name ?? null, input.location?.latitude ?? null,
          input.location?.longitude ?? null, input.createdBy, input.votingDeadline, input.createdAt,
        );
        for (const w of input.windows) insertWindow(id, w);
      });
      return id;
    },

    addWindow: insertWindow,

    // Un voto por persona y propuesta: votar otra franja lo mueve; la misma, no cambia nada (G1).
    vote(proposalId: string, userId: string, windowId: string): void {
      db.prepare(
        `INSERT INTO votes (proposal_id, user_id, window_id) VALUES (?, ?, ?)
         ON CONFLICT (proposal_id, user_id) DO UPDATE SET window_id = excluded.window_id`,
      ).run(proposalId, userId, windowId);
    },

    unvote(proposalId: string, userId: string): void {
      db.prepare('DELETE FROM votes WHERE proposal_id = ? AND user_id = ?').run(proposalId, userId);
    },
  };
}

```

> Task 3 y Task 4 añaden métodos dentro del objeto que devuelve `proposalsRepository` (después de `unvote`), reutilizando `toProposal`, `SELECT_PROPOSAL` e `insertWindow`.

`backend/src/proposals/proposals.routes.ts`:

```ts
import type { Group, Proposal, TimeWindowInput } from '@hueckoapp/shared';
import { Router } from 'express';

import type { AppDeps } from '../app';
import { getUserId } from '../auth/require-auth';
import { groupAvailability, windowAvailability } from '../availability/group-availability';
import { loadGroupForMember } from '../groups/group-access';
import { groupsRepository } from '../groups/groups.repository';
import { ApiError } from '../middleware/errors';
import { timeBlocksRepository } from '../schedule/time-blocks.repository';
import { proposalsRepository } from './proposals.repository';
import { createProposalSchema, timeWindowInputSchema, voteSchema } from './proposals.schemas';
import { bestWindows, isVotingOpen } from './rules';

const systemClock = () => new Date();

// Repositorios, reloj y comprobaciones de acceso que comparten los dos routers.
function proposalsContext({ db, now = systemClock }: AppDeps) {
  const groups = groupsRepository(db);
  const proposals = proposalsRepository(db);
  const blocks = timeBlocksRepository(db);

  // 404 si la propuesta no existe; 403 si no soy miembro de su grupo.
  const loadForMember = (proposalId: string, userId: string) => {
    const proposal = proposals.findById(proposalId, userId);
    if (!proposal) throw new ApiError(404, 'PROPOSAL_NOT_FOUND', 'Propuesta no encontrada.');
    const { group, me } = loadGroupForMember(groups, proposal.groupId, userId);
    return { proposal, group, me };
  };

  // Datos del cruce del grupo con sus horarios actuales.
  const matcherInput = (group: Group) => {
    const memberIds = group.members.map((m) => m.id);
    return { matcherGroup: { memberIds, availabilityThreshold: group.availabilityThreshold }, groupBlocks: blocks.listRecurringByUsers(memberIds) };
  };

  const assertVotingOpen = (proposal: Proposal) => {
    if (!isVotingOpen(proposal, now())) throw new ApiError(409, 'VOTING_CLOSED', 'La votación ya cerró.');
  };

  return { groups, proposals, now, loadForMember, matcherInput, assertVotingOpen };
}

// Montado en /api/groups detrás de requireAuth (junto a groupsRouter).
export function groupProposalsRouter(deps: AppDeps) {
  const router = Router();
  const ctx = proposalsContext(deps);

  router.get('/:id/proposals', (req, res) => {
    const userId = getUserId(res);
    const { group } = loadGroupForMember(ctx.groups, req.params.id, userId);
    res.json(ctx.proposals.listByGroup(group.id, userId));
  });

  router.post('/:id/proposals', (req, res) => {
    const userId = getUserId(res);
    const { group } = loadGroupForMember(ctx.groups, req.params.id, userId);
    const now = ctx.now();
    const input = createProposalSchema(now).parse(req.body);
    const { matcherGroup, groupBlocks } = ctx.matcherInput(group);
    // Con franjas: el % lo calcula el servidor (G2). Sin franjas: las 3 mejores del cruce del grupo (C5).
    const windows =
      input.windows.length > 0
        ? input.windows.map((w) => ({ ...w, availabilityPercentage: windowAvailability(matcherGroup, groupBlocks, w) }))
        : bestWindows(groupAvailability(matcherGroup, groupBlocks)).map(({ dayOfWeek, startTime, endTime, availabilityPercentage }) => ({
            dayOfWeek, startTime, endTime, availabilityPercentage,
          }));
    const id = ctx.proposals.create({
      groupId: group.id,
      createdBy: userId,
      title: input.title,
      location: input.location,
      votingDeadline: new Date(input.votingDeadline).toISOString(),
      windows,
      createdAt: now.toISOString(),
    });
    res.status(201).json(ctx.proposals.findById(id, userId));
  });

  return router;
}

// Montado en /api/proposals detrás de requireAuth.
export function proposalsRouter(deps: AppDeps) {
  const router = Router();
  const ctx = proposalsContext(deps);

  router.get('/:id', (req, res) => {
    res.json(ctx.loadForMember(req.params.id, getUserId(res)).proposal);
  });

  router.put('/:id/vote', (req, res) => {
    const userId = getUserId(res);
    const { proposal } = ctx.loadForMember(req.params.id, userId);
    const { windowId } = voteSchema.parse(req.body);
    ctx.assertVotingOpen(proposal);
    if (!proposal.windows.some((w) => w.id === windowId)) {
      throw new ApiError(404, 'WINDOW_NOT_FOUND', 'Esa franja no existe en esta propuesta.');
    }
    ctx.proposals.vote(proposal.id, userId, windowId);
    res.json(ctx.proposals.findById(proposal.id, userId));
  });

  router.delete('/:id/vote', (req, res) => {
    const userId = getUserId(res);
    const { proposal } = ctx.loadForMember(req.params.id, userId);
    ctx.assertVotingOpen(proposal);
    ctx.proposals.unvote(proposal.id, userId);
    res.json(ctx.proposals.findById(proposal.id, userId));
  });

  router.post('/:id/windows', (req, res) => {
    const userId = getUserId(res);
    const { proposal, group } = ctx.loadForMember(req.params.id, userId);
    const input: TimeWindowInput = timeWindowInputSchema.parse(req.body);
    ctx.assertVotingOpen(proposal);
    const exists = proposal.windows.some(
      (w) => w.dayOfWeek === input.dayOfWeek && w.startTime === input.startTime && w.endTime === input.endTime,
    );
    if (exists) throw new ApiError(409, 'WINDOW_EXISTS', 'Esa franja ya está propuesta.');
    const { matcherGroup, groupBlocks } = ctx.matcherInput(group);
    ctx.proposals.addWindow(proposal.id, { ...input, availabilityPercentage: windowAvailability(matcherGroup, groupBlocks, input) });
    res.status(201).json(ctx.proposals.findById(proposal.id, userId));
  });

  return router;
}
```

> Task 3 añade más rutas dentro de `proposalsRouter`, justo antes de `return router;`.

`backend/src/app.ts` — añadir `import { groupProposalsRouter, proposalsRouter } from './proposals/proposals.routes';` y, debajo de la línea que monta `/groups`:

```ts
  // groupsRouter no tiene /:id/proposals: esas peticiones pasan de largo y las atiende este router.
  api.use('/groups', requireAuth(deps.jwtSecret), groupProposalsRouter(deps));
  api.use('/proposals', requireAuth(deps.jwtSecret), proposalsRouter(deps));
```

- [ ] **Step 4: Ejecutar y ver que pasa** — `npm test -w backend` → PASS (incluidos `groups.test.ts` tras el cambio a `loadGroupForMember`). `npm run typecheck` → sin errores.

- [ ] **Step 5: Actualizar el contrato** — en `docs/api.md`, reemplazar desde `### \`GET /groups/:id/proposals\`` hasta justo antes de `### \`POST /proposals/:id/confirm\`` por:

````md
### `GET /groups/:id/proposals`
`200 Proposal[]` del grupo, **las más recientes primero** (`createdAt` descendente). Devuelve todas, también las `CANCELADO` (la app las oculta). `403 NOT_A_MEMBER` · `404 GROUP_NOT_FOUND`.

### `POST /groups/:id/proposals`
```json
{
  "title": "Estudiar para el parcial",
  "location": { "name": "Biblioteca", "latitude": -12.07, "longitude": -77.08 },
  "votingDeadline": "2026-10-03T23:59:00.000Z",
  "windows": [ { "dayOfWeek": 5, "startTime": "16:00", "endTime": "18:00" } ]
}
```
Cuerpo = `ProposalInput` de `shared`. Reglas:
- `title` obligatorio, 1–80 caracteres tras `trim` («El título no puede estar vacío.»).
- `location` opcional (`null` u omitido = sin lugar). `name` 1–100 tras `trim`; `latitude` (−90…90) y `longitude` (−180…180) van **juntas** o ambas `null`/omitidas.
- `votingDeadline` ISO 8601 (con `Z` u offset) **posterior al momento de crear** («La fecha límite debe ser futura»). Se guarda y se devuelve en UTC.
- `windows` opcional, hasta 10 y sin repetir; cada una `{ dayOfWeek 1–7, startTime, endTime }` en `HH:mm` con `startTime < endTime` (`TimeWindowInput`). El `availabilityPercentage` lo calcula el servidor (ver `POST /proposals/:id/windows`).
- Si `windows` viene vacío u omitido, el servidor propone **las 3 mejores franjas** de `/availability`: mayor `availabilityPercentage`, luego mayor duración, luego día y hora más tempranos. Si el grupo no tiene ninguna franja, la propuesta nace sin franjas.
- Nace `PROPUESTO`, con `createdAt` = ahora, sin votos ni incidencias.

`201 Proposal` · `400 VALIDATION_ERROR` · `403 NOT_A_MEMBER` · `404 GROUP_NOT_FOUND`

### `GET /proposals/:id`
`200 Proposal`. `windows` van por día y hora; `myVoteWindowId` es la franja que votó quien pregunta.
`404 PROPOSAL_NOT_FOUND` · `403 NOT_A_MEMBER` si no soy miembro de su grupo. (Igual en todas las rutas `/proposals/:id/...`.)

### `PUT /proposals/:id/vote`
`{ "windowId": "..." }`. Un voto por persona y propuesta: votar otra franja **mueve** el voto; votar la misma otra vez **no cambia nada** (idempotente). El «tocar otra vez retira el voto» de la app Kotlin se hace desde la app con `DELETE`.
`200 Proposal` · `409 VOTING_CLOSED` «La votación ya cerró.» si el estado no es `PROPUESTO` o ya llegó el `votingDeadline` · `404 WINDOW_NOT_FOUND` si la franja no es de esta propuesta.

### `DELETE /proposals/:id/vote`
Retira mi voto (si no había, no pasa nada). `200 Proposal` · `409 VOTING_CLOSED` con las mismas reglas que votar.

### `POST /proposals/:id/windows`
Añadir una franja a una propuesta en votación. Cualquier miembro. `{ "dayOfWeek": 5, "startTime": "18:00", "endTime": "19:30" }` (`TimeWindowInput`, mismas reglas de formato y orden).
El servidor calcula su `availabilityPercentage` con los horarios **actuales** del grupo: para cada hora que toca la franja (mismo redondeo que `/availability`: inicio truncado, fin hacia arriba) calcula el % de miembros libres y se queda con el **peor**. No se aplica el umbral del grupo ni el rango 08–20. Los porcentajes no se recalculan después.
`201 Proposal` · `409 WINDOW_EXISTS` «Esa franja ya está propuesta.» · `409 VOTING_CLOSED`

````

- [ ] **Step 6: Commit** — `git add backend/src/groups/group-access.ts backend/src/groups/groups.routes.ts backend/src/proposals backend/src/app.ts backend/test/helpers.ts backend/test/proposals.test.ts docs/api.md` → `feat(backend): propuestas con franjas calculadas, voto idempotente y franjas añadidas`

---

### Task 3: Backend — confirmar, cancelar, imprevistos y votación exprés

**Files:**
- Modify: `backend/src/proposals/proposals.schemas.ts`, `backend/src/proposals/proposals.repository.ts`, `backend/src/proposals/proposals.routes.ts`, `docs/api.md`
- Create: `backend/test/proposals-lifecycle.test.ts`

**Interfaces:**
- Consumes: `proposalsRouter`/`proposalsContext` y `proposalsRepository` (Task 2); `pickWinner`, `nextOccurrence`, `criticalityFor` (Task 1); `futureDeadline(now)` (Task 2); helpers `setupSeedGroup`, `createProposal`, `makeClock`.
- Produces:
  - Schemas: `INCIDENCE_TYPES`, `incidenceInputSchema`, `confirmSchema`, `resolveIncidencesSchema(now: Date)`.
  - Repositorio (métodos nuevos): `confirm(id, windowId, scheduledAt: string): void`; `setState(id, state: ProposalState): void`; `reportIncidence(proposalId, input: NewIncidence, escalate: boolean): void` con `NewIncidence = { userId; type: IncidenceType; reason; delayMinutes: number | null; criticality: Criticality; createdAt }`; `resolveIncidences(id, newState: 'CONFIRMADO' | 'CANCELADO' | 'PROPUESTO', votingDeadline: string | null): void`. Task 4 (semilla) usa `confirm` y `reportIncidence`.
  - Endpoints: `POST /api/proposals/:id/confirm`, `/cancel`, `/incidences`, `/incidences/resolve`. Códigos nuevos: `403 NOT_CREATOR`, `409 INVALID_STATE`, `409 NO_VOTES`.

- [ ] **Step 1: Escribir los tests que fallan** — `backend/test/proposals-lifecycle.test.ts`:

```ts
import type { Group, Proposal, User } from '@hueckoapp/shared';
import type { Express } from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';

import { bearer, createProposal, makeClock, makeTestApp, registerUser, setupSeedGroup } from './helpers';

// Martes 29/09/2026 a las 10:00 (hora local).
const NOW = new Date(2026, 8, 29, 10, 0);
const DEADLINE = new Date(2026, 9, 3, 20, 0).toISOString();
const NEW_DEADLINE = new Date(2026, 9, 10, 20, 0).toISOString();

let app: Express;
let clock: ReturnType<typeof makeClock>;
let yo: { token: string; user: User };
let ana: { token: string; user: User };
let group: Group;

beforeEach(async () => {
  clock = makeClock(NOW);
  ({ app } = makeTestApp({ now: clock.now }));
  ({ yo, ana, group } = await setupSeedGroup(app));
});

const postTo = (path: string, token: string, body: object = {}) =>
  request(app).post(`/api/proposals/${path}`).set(bearer(token)).send(body);
const windowOf = (p: Proposal, dayOfWeek: number) => p.windows.find((w) => w.dayOfWeek === dayOfWeek)!;
const vote = (p: Proposal, dayOfWeek: number, token: string) =>
  request(app).put(`/api/proposals/${p.id}/vote`).set(bearer(token)).send({ windowId: windowOf(p, dayOfWeek).id });

// Martes 16–18, jueves 10–12 y viernes 16–18 (las de prop_2), creada por yo para poder confirmarla.
const threeWindows = () =>
  createProposal(app, yo.token, group.id, {
    title: 'Repaso antes de la entrega',
    votingDeadline: DEADLINE,
    windows: [
      { dayOfWeek: 2, startTime: '16:00', endTime: '18:00' },
      { dayOfWeek: 4, startTime: '10:00', endTime: '12:00' },
      { dayOfWeek: 5, startTime: '16:00', endTime: '18:00' },
    ],
  });

// prop_1 de la semilla: miércoles 11–13, votada por los dos y confirmada por yo.
async function confirmedPlan(): Promise<Proposal> {
  const p = await createProposal(app, yo.token, group.id, {
    title: 'Reunión de avance del proyecto',
    votingDeadline: DEADLINE,
    windows: [{ dayOfWeek: 3, startTime: '11:00', endTime: '13:00' }],
  });
  await vote(p, 3, yo.token);
  await vote(p, 3, ana.token);
  const res = await postTo(`${p.id}/confirm`, yo.token);
  if (res.status !== 200) throw new Error(`confirmar falló: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body;
}

describe('POST /api/proposals/:id/confirm (C2, C11)', () => {
  it('sin windowId gana la más votada y scheduledAt es su próxima ocurrencia', async () => {
    const p = await threeWindows();
    await vote(p, 4, yo.token);
    await vote(p, 4, ana.token);
    const res = await postTo(`${p.id}/confirm`, yo.token);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      state: 'CONFIRMADO',
      chosenWindowId: windowOf(p, 4).id,
      scheduledAt: new Date(2026, 9, 1, 10, 0).toISOString(),
    });
  });

  it('empate de votos: gana la de mayor disponibilidad', async () => {
    const p = await createProposal(app, yo.token, group.id, {
      votingDeadline: DEADLINE,
      windows: [
        { dayOfWeek: 1, startTime: '10:00', endTime: '12:00' }, // 50 %
        { dayOfWeek: 5, startTime: '16:00', endTime: '18:00' }, // 100 %
      ],
    });
    await vote(p, 1, ana.token);
    await vote(p, 5, yo.token);
    const res = await postTo(`${p.id}/confirm`, yo.token);
    expect(res.body.chosenWindowId).toBe(windowOf(p, 5).id);
    expect(res.body.scheduledAt).toBe(new Date(2026, 9, 2, 16, 0).toISOString());
  });

  it('con windowId confirma esa franja aunque no tenga votos (hoy mismo si aún no llegó la hora)', async () => {
    const p = await threeWindows();
    const res = await postTo(`${p.id}/confirm`, yo.token, { windowId: windowOf(p, 2).id });
    expect(res.body).toMatchObject({
      state: 'CONFIRMADO',
      chosenWindowId: windowOf(p, 2).id,
      scheduledAt: new Date(2026, 8, 29, 16, 0).toISOString(),
    });
  });

  it('409 NO_VOTES sin votos ni windowId; 404 WINDOW_NOT_FOUND con una franja ajena', async () => {
    const p = await threeWindows();
    const sinVotos = await postTo(`${p.id}/confirm`, yo.token);
    expect([sinVotos.status, sinVotos.body.error.code]).toEqual([409, 'NO_VOTES']);
    const ajena = await postTo(`${p.id}/confirm`, yo.token, { windowId: 'no-existe' });
    expect([ajena.status, ajena.body.error.code]).toEqual([404, 'WINDOW_NOT_FOUND']);
  });

  it('solo quien la creó: 403 NOT_CREATOR', async () => {
    const p = await threeWindows();
    await vote(p, 2, ana.token);
    const res = await postTo(`${p.id}/confirm`, ana.token);
    expect([res.status, res.body.error.code, res.body.error.message]).toEqual([
      403, 'NOT_CREATOR', 'Solo quien propuso el plan puede hacer esto.',
    ]);
  });

  it('confirmada ya no admite votos (C1) ni otra confirmación', async () => {
    const p = await confirmedPlan();
    expect((await vote(p, 3, ana.token)).body.error.code).toBe('VOTING_CLOSED');
    expect((await postTo(`${p.id}/confirm`, yo.token)).body.error.code).toBe('INVALID_STATE');
  });

  it('se puede confirmar después del plazo', async () => {
    const p = await threeWindows();
    await vote(p, 4, ana.token);
    clock.set(new Date(2026, 9, 3, 20, 1));
    const res = await postTo(`${p.id}/confirm`, yo.token);
    expect(res.status).toBe(200);
    expect(res.body.scheduledAt).toBe(new Date(2026, 9, 8, 10, 0).toISOString());
  });
});

describe('POST /api/proposals/:id/cancel (C3)', () => {
  it('quien la creó la cancela desde cualquier estado salvo CANCELADO', async () => {
    const p = await confirmedPlan();
    const res = await postTo(`${p.id}/cancel`, yo.token);
    expect([res.status, res.body.state]).toEqual([200, 'CANCELADO']);
    expect((await postTo(`${p.id}/cancel`, yo.token)).body.error.code).toBe('INVALID_STATE');
  });

  it('403 NOT_CREATOR si no la creé', async () => {
    const p = await threeWindows();
    expect((await postTo(`${p.id}/cancel`, ana.token)).body.error.code).toBe('NOT_CREATOR');
  });
});

describe('POST /api/proposals/:id/incidences (C4, G6)', () => {
  const report = (p: Proposal, token: string, body: object) => postTo(`${p.id}/incidences`, token, body);

  it('solo en planes confirmados: 409 INVALID_STATE en PROPUESTO', async () => {
    const p = await threeWindows();
    const res = await report(p, ana.token, { type: 'FALTA', reason: 'Enferma' });
    expect([res.status, res.body.error.code, res.body.error.message]).toEqual([
      409, 'INVALID_STATE', 'Solo se pueden reportar imprevistos de un plan confirmado.',
    ]);
  });

  it('IMPREVISTO de Ana: MEDIA, sin resolver, y el plan sigue CONFIRMADO', async () => {
    const p = await confirmedPlan();
    const res = await report(p, ana.token, { type: 'IMPREVISTO', reason: '  Cruce con un examen de laboratorio a última hora. ' });
    expect(res.status).toBe(201);
    expect(res.body.state).toBe('CONFIRMADO');
    expect(res.body.incidences).toEqual([
      {
        id: expect.any(String),
        user: ana.user,
        type: 'IMPREVISTO',
        reason: 'Cruce con un examen de laboratorio a última hora.',
        delayMinutes: null,
        criticality: 'MEDIA',
        resolved: false,
        createdAt: NOW.toISOString(),
      },
    ]);
  });

  it.each([
    [20, 'BAJA'],
    [45, 'MEDIA'],
  ])('TARDANZA de %i min → %s', async (delayMinutes, criticality) => {
    const p = await confirmedPlan();
    const res = await report(p, ana.token, { type: 'TARDANZA', reason: 'Tráfico', delayMinutes });
    expect(res.body.incidences[0]).toMatchObject({ delayMinutes, criticality });
    expect(res.body.state).toBe('CONFIRMADO');
  });

  it('FALTA de un imprescindible → ALTA y el plan pasa a EN_RECOORDINACION', async () => {
    const p = await confirmedPlan();
    await request(app).patch(`/api/groups/${group.id}/members/${ana.user.id}`).set(bearer(yo.token)).send({ isEssential: true });
    const res = await report(p, ana.token, { type: 'FALTA', reason: 'Estoy enferma' });
    expect(res.body.state).toBe('EN_RECOORDINACION');
    expect(res.body.incidences[0].criticality).toBe('ALTA');
    // En EN_RECOORDINACION se siguen aceptando reportes.
    expect((await report(p, yo.token, { type: 'TARDANZA', reason: 'Tráfico', delayMinutes: 10 })).status).toBe(201);
  });

  it('FALTA de alguien no imprescindible → MEDIA y sigue CONFIRMADO', async () => {
    const p = await confirmedPlan();
    const res = await report(p, ana.token, { type: 'FALTA', reason: 'Viaje' });
    expect(res.body.state).toBe('CONFIRMADO');
    expect(res.body.incidences[0].criticality).toBe('MEDIA');
  });

  it.each([
    [{ type: 'TARDANZA', reason: 'Tráfico' }, 'delayMinutes', 'Indica cuántos minutos llegarás tarde'],
    [{ type: 'FALTA', reason: 'Enfermo', delayMinutes: 10 }, 'delayMinutes', 'Solo una tardanza lleva minutos de retraso'],
    [{ type: 'TARDANZA', reason: 'Tráfico', delayMinutes: 0 }, 'delayMinutes', 'Los minutos deben ser mayores que 0'],
    [{ type: 'FALTA', reason: '   ' }, 'reason', 'Cuéntale al grupo qué pasó'],
    [{ type: 'OTRO', reason: 'x' }, 'type', 'Tipo de imprevisto inválido'],
  ])('valida %j → 400 en %s', async (body, field, message) => {
    const p = await confirmedPlan();
    const res = await report(p, ana.token, body);
    expect(res.status).toBe(400);
    expect(res.body.error.details).toContainEqual(expect.objectContaining({ path: [field], message }));
  });

  it('403 a quien no es miembro', async () => {
    const p = await confirmedPlan();
    const otra = await registerUser(app);
    expect((await report(p, otra.token, { type: 'FALTA', reason: 'x' })).status).toBe(403);
  });
});

describe('POST /api/proposals/:id/incidences/resolve (G4)', () => {
  const resolve = (p: Proposal, token: string, body: object) => postTo(`${p.id}/incidences/resolve`, token, body);
  const withIncidence = async () => {
    const p = await confirmedPlan();
    await postTo(`${p.id}/incidences`, ana.token, { type: 'IMPREVISTO', reason: 'Examen' });
    return p;
  };

  it('Mantener: incidencias resueltas; sigue CONFIRMADO con su franja y su fecha', async () => {
    const p = await withIncidence();
    const res = await resolve(p, yo.token, { newState: 'CONFIRMADO' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ state: 'CONFIRMADO', chosenWindowId: p.chosenWindowId, scheduledAt: p.scheduledAt });
    expect(res.body.incidences.map((i: { resolved: boolean }) => i.resolved)).toEqual([true]);
  });

  it('Cancelar: CANCELADO', async () => {
    const p = await withIncidence();
    expect((await resolve(p, yo.token, { newState: 'CANCELADO' })).body.state).toBe('CANCELADO');
  });

  it('Reprogramar: PROPUESTO sin votos ni franja elegida, con plazo nuevo, y se vuelve a votar', async () => {
    const p = await withIncidence();
    const res = await resolve(p, yo.token, { newState: 'PROPUESTO', votingDeadline: NEW_DEADLINE });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      state: 'PROPUESTO', chosenWindowId: null, scheduledAt: null, votingDeadline: NEW_DEADLINE, myVoteWindowId: null,
    });
    expect(res.body.windows.map((w: { voteCount: number }) => w.voteCount)).toEqual([0]);
    expect(res.body.incidences.every((i: { resolved: boolean }) => i.resolved)).toBe(true);
    expect((await vote(res.body, 3, ana.token)).status).toBe(200);
  });

  it('Reprogramar exige un plazo nuevo y futuro', async () => {
    const p = await withIncidence();
    const sinPlazo = await resolve(p, yo.token, { newState: 'PROPUESTO' });
    expect(sinPlazo.body.error.details).toContainEqual(
      expect.objectContaining({ path: ['votingDeadline'], message: 'Para reprogramar indica una nueva fecha límite' }),
    );
    const pasado = await resolve(p, yo.token, { newState: 'PROPUESTO', votingDeadline: new Date(2026, 8, 28).toISOString() });
    expect(pasado.body.error.details).toContainEqual(
      expect.objectContaining({ path: ['votingDeadline'], message: 'La fecha límite debe ser futura' }),
    );
  });

  it('de EN_RECOORDINACION a CONFIRMADO', async () => {
    const p = await confirmedPlan();
    await request(app).patch(`/api/groups/${group.id}/members/${ana.user.id}`).set(bearer(yo.token)).send({ isEssential: true });
    await postTo(`${p.id}/incidences`, ana.token, { type: 'FALTA', reason: 'Enferma' });
    const res = await resolve(p, yo.token, { newState: 'CONFIRMADO' });
    expect(res.body.state).toBe('CONFIRMADO');
  });

  it('403 si no la creé; 400 con un estado inválido; 409 si no está confirmada', async () => {
    const p = await withIncidence();
    expect((await resolve(p, ana.token, { newState: 'CANCELADO' })).body.error.code).toBe('NOT_CREATOR');
    const invalido = await resolve(p, yo.token, { newState: 'EN_RECOORDINACION' });
    expect(invalido.body.error.details).toContainEqual(
      expect.objectContaining({ path: ['newState'], message: 'Estado inválido: CONFIRMADO, CANCELADO o PROPUESTO' }),
    );
    const enVotacion = await threeWindows();
    expect((await resolve(enVotacion, yo.token, { newState: 'CANCELADO' })).body.error.code).toBe('INVALID_STATE');
  });
});
```

- [ ] **Step 2: Ejecutar y ver que falla** — `npm test -w backend -- proposals-lifecycle` → FAIL (rutas 404).

- [ ] **Step 3: Implementar**

`backend/src/proposals/proposals.schemas.ts` — añadir al final:

```ts
export const INCIDENCE_TYPES = ['FALTA', 'TARDANZA', 'IMPREVISTO'] as const;

// C4: una tardanza lleva minutos (1–600); el resto no.
export const incidenceInputSchema = z
  .object({
    type: z.enum(INCIDENCE_TYPES, { error: 'Tipo de imprevisto inválido' }),
    reason: z.string({ error: 'Cuéntale al grupo qué pasó' }).trim().min(1, 'Cuéntale al grupo qué pasó').max(200, 'Máximo 200 caracteres'),
    delayMinutes: z
      .number({ error: 'Minutos inválidos' })
      .int('Minutos inválidos')
      .min(1, 'Los minutos deben ser mayores que 0')
      .max(600, 'Máximo 600 minutos')
      .nullish(),
  })
  .superRefine((incidence, ctx) => {
    if (incidence.type === 'TARDANZA' && incidence.delayMinutes == null) {
      ctx.addIssue({ code: 'custom', path: ['delayMinutes'], message: 'Indica cuántos minutos llegarás tarde' });
    }
    if (incidence.type !== 'TARDANZA' && incidence.delayMinutes != null) {
      ctx.addIssue({ code: 'custom', path: ['delayMinutes'], message: 'Solo una tardanza lleva minutos de retraso' });
    }
  })
  .transform((incidence) => ({ ...incidence, delayMinutes: incidence.delayMinutes ?? null }));

export const confirmSchema = z.object({
  windowId: z.string({ error: 'Franja inválida' }).min(1, 'Franja inválida').optional(),
});

// G4: reprogramar (PROPUESTO) exige un plazo nuevo y futuro; con los otros dos estados se ignora.
export const resolveIncidencesSchema = (now: Date) =>
  z
    .object({
      newState: z.enum(['CONFIRMADO', 'CANCELADO', 'PROPUESTO'], { error: 'Estado inválido: CONFIRMADO, CANCELADO o PROPUESTO' }),
      votingDeadline: futureDeadline(now).optional(),
    })
    .superRefine((body, ctx) => {
      if (body.newState === 'PROPUESTO' && body.votingDeadline === undefined) {
        ctx.addIssue({ code: 'custom', path: ['votingDeadline'], message: 'Para reprogramar indica una nueva fecha límite' });
      }
    });
```

`backend/src/proposals/proposals.repository.ts` — añadir el tipo exportado debajo de `NewProposal`:

```ts
export type NewIncidence = {
  userId: string;
  type: IncidenceType;
  reason: string;
  delayMinutes: number | null;
  criticality: Criticality;
  createdAt: string;
};
```

y, dentro del objeto que devuelve `proposalsRepository`, después de `unvote`:

```ts
    confirm(id: string, windowId: string, scheduledAt: string): void {
      db.prepare("UPDATE proposals SET state = 'CONFIRMADO', chosen_window_id = ?, scheduled_at = ? WHERE id = ?").run(
        windowId, scheduledAt, id,
      );
    },

    setState(id: string, state: ProposalState): void {
      db.prepare('UPDATE proposals SET state = ? WHERE id = ?').run(state, id);
    },

    // La incidencia y, si falta un imprescindible, el paso a EN_RECOORDINACION: todo o nada.
    reportIncidence(proposalId: string, input: NewIncidence, escalate: boolean): void {
      withTransaction(db, () => {
        db.prepare(
          `INSERT INTO incidences (id, proposal_id, user_id, type, reason, delay_minutes, criticality, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(randomUUID(), proposalId, input.userId, input.type, input.reason, input.delayMinutes, input.criticality, input.createdAt);
        if (escalate) db.prepare("UPDATE proposals SET state = 'EN_RECOORDINACION' WHERE id = ?").run(proposalId);
      });
    },

    // Votación exprés (G4): todas las incidencias quedan resueltas; reprogramar abre una votación nueva.
    resolveIncidences(id: string, newState: 'CONFIRMADO' | 'CANCELADO' | 'PROPUESTO', votingDeadline: string | null): void {
      withTransaction(db, () => {
        db.prepare('UPDATE incidences SET resolved = 1 WHERE proposal_id = ?').run(id);
        if (newState === 'PROPUESTO') {
          db.prepare('DELETE FROM votes WHERE proposal_id = ?').run(id);
          db.prepare(
            "UPDATE proposals SET state = 'PROPUESTO', chosen_window_id = NULL, scheduled_at = NULL, voting_deadline = ? WHERE id = ?",
          ).run(votingDeadline, id);
        } else {
          db.prepare('UPDATE proposals SET state = ? WHERE id = ?').run(newState, id);
        }
      });
    },
```

`backend/src/proposals/proposals.routes.ts` — ampliar los imports:

```ts
import { confirmSchema, createProposalSchema, incidenceInputSchema, resolveIncidencesSchema, timeWindowInputSchema, voteSchema } from './proposals.schemas';
import { bestWindows, criticalityFor, isVotingOpen, nextOccurrence, pickWinner } from './rules';
```

y, dentro de `proposalsRouter`, justo antes de `return router;`:

```ts
  // Solo quien creó la propuesta decide sobre ella (C2, C3, G4).
  const loadForCreator = (proposalId: string, userId: string) => {
    const loaded = ctx.loadForMember(proposalId, userId);
    if (loaded.proposal.createdBy.id !== userId) {
      throw new ApiError(403, 'NOT_CREATOR', 'Solo quien propuso el plan puede hacer esto.');
    }
    return loaded;
  };
  const invalidState = () => new ApiError(409, 'INVALID_STATE', 'El plan no admite esta acción en su estado actual.');
  const isActivePlan = (p: Proposal) => p.state === 'CONFIRMADO' || p.state === 'EN_RECOORDINACION';

  router.post('/:id/confirm', (req, res) => {
    const userId = getUserId(res);
    const { proposal } = loadForCreator(req.params.id, userId);
    const { windowId } = confirmSchema.parse(req.body ?? {});
    if (proposal.state !== 'PROPUESTO') throw invalidState();
    const chosen = windowId !== undefined ? proposal.windows.find((w) => w.id === windowId) : pickWinner(proposal.windows);
    if (!chosen && windowId !== undefined) throw new ApiError(404, 'WINDOW_NOT_FOUND', 'Esa franja no existe en esta propuesta.');
    if (!chosen) throw new ApiError(409, 'NO_VOTES', 'Nadie ha votado todavía: elige la franja para confirmar.');
    ctx.proposals.confirm(proposal.id, chosen.id, nextOccurrence(chosen.dayOfWeek, chosen.startTime, ctx.now()).toISOString());
    res.json(ctx.proposals.findById(proposal.id, userId));
  });

  router.post('/:id/cancel', (req, res) => {
    const userId = getUserId(res);
    const { proposal } = loadForCreator(req.params.id, userId);
    if (proposal.state === 'CANCELADO') throw invalidState();
    ctx.proposals.setState(proposal.id, 'CANCELADO');
    res.json(ctx.proposals.findById(proposal.id, userId));
  });

  router.post('/:id/incidences', (req, res) => {
    const userId = getUserId(res);
    const { proposal, me } = ctx.loadForMember(req.params.id, userId);
    const input = incidenceInputSchema.parse(req.body);
    if (!isActivePlan(proposal)) {
      throw new ApiError(409, 'INVALID_STATE', 'Solo se pueden reportar imprevistos de un plan confirmado.');
    }
    // Contrato + G5: si falta un imprescindible, el plan confirmado pasa a re-coordinarse.
    const escalate = input.type === 'FALTA' && me.isEssential && proposal.state === 'CONFIRMADO';
    ctx.proposals.reportIncidence(
      proposal.id,
      { userId, ...input, criticality: criticalityFor(input.type, me.isEssential, input.delayMinutes), createdAt: ctx.now().toISOString() },
      escalate,
    );
    res.status(201).json(ctx.proposals.findById(proposal.id, userId));
  });

  router.post('/:id/incidences/resolve', (req, res) => {
    const userId = getUserId(res);
    const { proposal } = loadForCreator(req.params.id, userId);
    const input = resolveIncidencesSchema(ctx.now()).parse(req.body);
    if (!isActivePlan(proposal)) throw invalidState();
    const deadline = input.newState === 'PROPUESTO' && input.votingDeadline ? new Date(input.votingDeadline).toISOString() : null;
    ctx.proposals.resolveIncidences(proposal.id, input.newState, deadline);
    res.json(ctx.proposals.findById(proposal.id, userId));
  });
```

- [ ] **Step 4: Ejecutar y ver que pasa** — `npm test -w backend` → PASS. `npm run typecheck` → sin errores.

- [ ] **Step 5: Actualizar el contrato** — en `docs/api.md`:

1. Reemplazar desde `### \`POST /proposals/:id/confirm\`` hasta justo antes de `## Inteligencia artificial` por:

````md
### `POST /proposals/:id/confirm`
Solo quien la creó (`403 NOT_CREATOR` «Solo quien propuso el plan puede hacer esto.») y solo si está `PROPUESTO` (`409 INVALID_STATE`); se puede confirmar antes o después del plazo. `{ "windowId": "..." }` es opcional:
- con `windowId`: se confirma esa franja, tenga votos o no (`404 WINDOW_NOT_FOUND` si no es de la propuesta);
- sin `windowId`: gana la más votada; si empatan, la de mayor `availabilityPercentage`; si siguen empatadas, la de día y hora más tempranos. Si nadie votó → `409 NO_VOTES`.

Pasa a `CONFIRMADO` con `chosenWindowId` y `scheduledAt` = **la próxima vez que ocurre esa franja** (su día de la semana y hora de inicio) desde el momento de confirmar: si hoy es ese día y la hora aún no llegó, es hoy; si ya pasó, la semana siguiente. Se calcula en la zona horaria del servidor (en desarrollo, la del PC). Desde ese momento no se puede votar. `200 Proposal`

### `POST /proposals/:id/cancel`
Solo quien la creó. Desde cualquier estado salvo `CANCELADO` (`409 INVALID_STATE`). Pasa a `CANCELADO`. `200 Proposal`

### `POST /proposals/:id/incidences`
Reportar un imprevisto sobre un plan `CONFIRMADO` o `EN_RECOORDINACION` (si no, `409 INVALID_STATE` «Solo se pueden reportar imprevistos de un plan confirmado.»). Cualquier miembro.
```json
{ "type": "TARDANZA", "reason": "Tráfico", "delayMinutes": 20 }
```
Cuerpo = `IncidenceInput`. Reglas:
- `type` ∈ `FALTA | TARDANZA | IMPREVISTO`; `reason` obligatorio, 1–200 caracteres tras `trim`.
- `delayMinutes`: entero 1–600, **obligatorio** si `TARDANZA`; `null` u omitido en los demás.
- `criticality` la pone el servidor: `FALTA` de un imprescindible → `ALTA`; cualquier otra `FALTA` o un `IMPREVISTO` → `MEDIA`; `TARDANZA` → `BAJA`, o `MEDIA` si `delayMinutes ≥ 30`.
- Si quien reporta es imprescindible (`isEssential`) y el tipo es `FALTA`, un plan `CONFIRMADO` pasa a `EN_RECOORDINACION`.

`201 Proposal`

### `POST /proposals/:id/incidences/resolve`
La «votación exprés». Solo quien la creó, y solo con el plan `CONFIRMADO` o `EN_RECOORDINACION` (`409 INVALID_STATE`). Cuerpo = `ResolveIncidencesInput`:
- `{ "newState": "CONFIRMADO" }` — mantener el plan;
- `{ "newState": "CANCELADO" }` — cancelarlo;
- `{ "newState": "PROPUESTO", "votingDeadline": "2026-10-10T20:00:00.000Z" }` — reprogramar: `votingDeadline` obligatorio y futuro.

Siempre: **todas** las incidencias quedan `resolved: true`. Con `PROPUESTO` además se borran todos los votos, `chosenWindowId` y `scheduledAt` vuelven a `null` y empieza una votación nueva hasta el plazo enviado; las franjas se conservan. `200 Proposal`

**Cuándo muestra la app la alerta exprés:** con el plan `EN_RECOORDINACION` («Votación exprés»: falta un imprescindible) o `CONFIRMADO` con incidencias sin resolver («Aviso de imprevisto»). En los dos casos solo quien creó el plan ve Reprogramar / Cancelar / Mantener.

````

2. En la tabla de errores, cambiar la fila del `409` por: `| 409 | Conflicto de reglas: email ya registrado, ya es miembro, votación cerrada (\`VOTING_CLOSED\`), nadie votó (\`NO_VOTES\`), el estado del plan no lo permite (\`INVALID_STATE\`), franja repetida (\`WINDOW_EXISTS\`) |`.

3. Al final de «Cambios respecto a la app Kotlin», añadir:

```md
- **Voto:** votar dos veces la misma franja ya no retira el voto en el servidor (`PUT /vote` es idempotente); la app lo retira con `DELETE` cuando se toca la franja ya votada, así que el gesto es el mismo.
- **Plazo real:** `votingDeadline` es una fecha ISO (antes, texto libre) y cierra la votación.
- **Sin «llamados a la votación»:** en Kotlin eran un marcador local sin efecto; no hay endpoint y la app quita el botón «Votación» y la sección «Llamadas a la votación» del grupo.
- **Votación exprés:** solo quien creó el plan la decide (antes, el primero que pulsaba) y reprogramar pide una nueva fecha límite.
- **Criticidad** calculada por el servidor según el tipo, si es imprescindible y los minutos de retraso.
- **Plan confirmado con fecha:** `scheduledAt`; el «próximo plan» usa la franja elegida, no la primera.
```

- [ ] **Step 6: Commit** — `git add backend/src/proposals backend/test/proposals-lifecycle.test.ts docs/api.md` → `feat(backend): confirmar con desempate, cancelar, imprevistos y votación exprés`

---

### Task 4: Backend — Inicio (`/me/dashboard`, `/me/upcoming-plans`) y semilla de propuestas

**Files:**
- Create: `backend/src/dashboard/dashboard.ts`, `backend/src/me/me.routes.ts`, `backend/test/dashboard.test.ts`, `backend/test/me.test.ts`
- Modify: `backend/src/proposals/proposals.repository.ts`, `backend/src/app.ts`, `backend/src/db/seed.ts`, `docs/api.md`, `README.md`

**Interfaces:**
- Consumes: `proposalsRepository` (Task 2–3: `create`, `findById`, `vote`, `confirm`, `reportIncidence`); `groupsRepository(db).listForUser/findById`; `timeBlocksRepository(db).listByUser`; `nextOccurrence`, `criticalityFor`; helpers de test.
- Produces:
  - Repositorio: `listForUser(userId: string): ProposalWithGroup[]` (todas las de mis grupos, de la más antigua a la más reciente).
  - `src/dashboard/dashboard.ts`: `HIGH_MATCH_THRESHOLD = 80`; `matchingHours(proposals: readonly Proposal[]): number`; `attendeesOf(members: readonly GroupMember[], incidences: readonly Incidence[]): Attendee[]`; `upcomingPlans<P extends Proposal>(proposals: readonly P[], now: Date): P[]`; `groupSummaries(groups: readonly GroupSummary[], proposals: readonly ProposalWithGroup[]): DashboardGroup[]`; `expressAlertFor(proposals: readonly ProposalWithGroup[], userId: string, now: Date): ExpressAlert | null`; `buildDashboard(input: { userId: string; now: Date; groups: GroupSummary[]; proposals: ProposalWithGroup[]; totalBlocks: number; membersOf: (groupId: string) => GroupMember[] }): Dashboard`.
  - `meRouter(deps)` montado en `/api/me`: `GET /upcoming-plans` → `ProposalWithGroup[]`; `GET /dashboard` → `Dashboard`.
  - Semilla con `prop_1` y `prop_2` (títulos «Reunión de avance del proyecto» y «Repaso antes de la entrega»).

- [ ] **Step 1: Escribir los tests que fallan**

`backend/test/dashboard.test.ts` (fórmulas de `DashboardViewModel.kt` con los datos literales de la semilla, domain spec §2.2):

```ts
import type { GroupMember, GroupSummary, Incidence, ProposalWithGroup, TimeWindow, User } from '@hueckoapp/shared';
import { describe, expect, it } from 'vitest';

import { buildDashboard, matchingHours, upcomingPlans } from '../src/dashboard/dashboard';

const NOW = new Date(2026, 8, 29, 10, 0); // martes
const test: User = { id: 'u-test', name: 'Usuario de Prueba', email: 'test@test.com' };
const ana: User = { id: 'u-ana', name: 'Ana', email: 'ana@test.com' };
const members: GroupMember[] = [
  { ...test, role: 'OWNER', isEssential: false },
  { ...ana, role: 'MEMBER', isEssential: false },
];
const groups: GroupSummary[] = [{ id: 'g1', name: 'Proyecto Integrador', description: '', memberCount: 2, availabilityThreshold: 80 }];

const win = (id: string, dayOfWeek: number, startTime: string, endTime: string, availabilityPercentage: number, voteCount: number): TimeWindow => ({
  id, dayOfWeek, startTime, endTime, availabilityPercentage, voteCount,
});
const incidence = (over: Partial<Incidence> = {}): Incidence => ({
  id: 'inc_1', user: ana, type: 'IMPREVISTO', reason: 'Cruce con un examen de laboratorio a última hora.',
  delayMinutes: null, criticality: 'MEDIA', resolved: false, createdAt: NOW.toISOString(), ...over,
});

// prop_1 y prop_2 con los porcentajes fijos de la semilla Kotlin (w_23 = 50 %, B15).
const prop1 = (over: Partial<ProposalWithGroup> = {}): ProposalWithGroup => ({
  id: 'prop_1', groupId: 'g1', groupName: 'Proyecto Integrador', title: 'Reunión de avance del proyecto',
  location: { name: 'Biblioteca central', latitude: null, longitude: null }, createdBy: test,
  votingDeadline: new Date(2026, 8, 28, 10, 0).toISOString(), state: 'CONFIRMADO',
  windows: [win('w_1', 3, '11:00', '13:00', 100, 2)], myVoteWindowId: 'w_1', chosenWindowId: 'w_1',
  scheduledAt: new Date(2026, 8, 30, 11, 0).toISOString(), incidences: [incidence()],
  createdAt: new Date(2026, 8, 27, 10, 0).toISOString(), ...over,
});
const prop2 = (over: Partial<ProposalWithGroup> = {}): ProposalWithGroup => ({
  id: 'prop_2', groupId: 'g1', groupName: 'Proyecto Integrador', title: 'Repaso antes de la entrega',
  location: { name: 'Google Meet', latitude: null, longitude: null }, createdBy: ana,
  votingDeadline: new Date(2026, 8, 29, 20, 0).toISOString(), state: 'PROPUESTO',
  windows: [win('w_21', 2, '16:00', '18:00', 100, 1), win('w_22', 4, '10:00', '12:00', 100, 0), win('w_23', 5, '16:00', '18:00', 50, 0)],
  myVoteWindowId: null, chosenWindowId: null, scheduledAt: null, incidences: [],
  createdAt: new Date(2026, 8, 29, 9, 0).toISOString(), ...over,
});

const build = (proposals: ProposalWithGroup[], userId = test.id) =>
  buildDashboard({ userId, now: NOW, groups, proposals, totalBlocks: 2, membersOf: () => members });

describe('buildDashboard con la semilla (domain spec §2.2)', () => {
  it('valores esperados', () => {
    const d = build([prop1(), prop2()]);
    expect(d.metrics).toEqual({ activeGroups: 1, openVotes: 1, matchingHours: 6, totalBlocks: 2 });
    expect(d.nextPlan?.id).toBe('prop_1');
    expect(d.nextPlan?.groupName).toBe('Proyecto Integrador');
    expect(d.nextPlan?.attendees).toEqual([
      { user: test, isEssential: false, status: 'PUNTUAL', delayMinutes: null },
      { user: ana, isEssential: false, status: 'NO_ASISTE', delayMinutes: null },
    ]);
    expect(d.groups).toEqual([
      { id: 'g1', name: 'Proyecto Integrador', memberCount: 2, nextWindow: { dayOfWeek: 3, startTime: '11:00', endTime: '13:00', availabilityPercentage: 100 } },
    ]);
    expect(d.pendingVotes.map((p) => p.id)).toEqual(['prop_2']);
    expect(d.expressAlert).toEqual({
      proposalId: 'prop_1', planTitle: 'Reunión de avance del proyecto', groupName: 'Proyecto Integrador',
      who: 'Ana', reason: 'Cruce con un examen de laboratorio a última hora.', kind: 'AVISO', canResolve: true, createdBy: test,
    });
  });

  it('tras REPROGRAMAR: 2 votaciones abiertas, sin próximo plan ni alerta', () => {
    const reprogramada = prop1({
      state: 'PROPUESTO', chosenWindowId: null, scheduledAt: null, myVoteWindowId: null,
      windows: [win('w_1', 3, '11:00', '13:00', 100, 0)], incidences: [incidence({ resolved: true })],
      votingDeadline: new Date(2026, 9, 5, 20, 0).toISOString(),
    });
    const d = build([reprogramada, prop2()]);
    expect(d.metrics.openVotes).toBe(2);
    expect(d.nextPlan).toBeNull();
    expect(d.expressAlert).toBeNull();
    // Las que cierran antes, primero: prop_2 cierra hoy.
    expect(d.pendingVotes.map((p) => p.id)).toEqual(['prop_2', 'prop_1']);
  });

  it('tras CANCELAR: sin próximo plan ni alerta; el grupo pasa a w_21; las horas siguen en 6 (cuentan canceladas)', () => {
    const d = build([prop1({ state: 'CANCELADO', incidences: [incidence({ resolved: true })] }), prop2()]);
    expect(d.nextPlan).toBeNull();
    expect(d.expressAlert).toBeNull();
    expect(d.groups[0].nextWindow).toEqual({ dayOfWeek: 2, startTime: '16:00', endTime: '18:00', availabilityPercentage: 100 });
    expect(d.metrics.matchingHours).toBe(6);
  });

  it('tras MANTENER: Ana vuelve a PUNTUAL y no hay alerta', () => {
    const d = build([prop1({ incidences: [incidence({ resolved: true })] }), prop2()]);
    expect(d.expressAlert).toBeNull();
    expect(d.nextPlan?.attendees.map((a) => a.status)).toEqual(['PUNTUAL', 'PUNTUAL']);
  });
});

describe('alerta exprés (G5)', () => {
  it('EN_RECOORDINACION tiene prioridad y usa la incidencia ALTA; canResolve solo para quien la creó', () => {
    const aviso = prop1();
    const recoordinacion = prop1({
      id: 'prop_3', title: 'Presentación', state: 'EN_RECOORDINACION',
      incidences: [
        incidence({ id: 'i1', type: 'TARDANZA', delayMinutes: 10, criticality: 'BAJA', reason: 'Tráfico' }),
        incidence({ id: 'i2', type: 'FALTA', criticality: 'ALTA', reason: 'Enferma' }),
      ],
    });
    const d = build([aviso, recoordinacion], ana.id);
    expect(d.expressAlert).toMatchObject({ proposalId: 'prop_3', kind: 'RECOORDINACION', who: 'Ana', reason: 'Enferma', canResolve: false });
  });

  it('un plan que ya ocurrió no es el próximo ni dispara la alerta', () => {
    const pasado = prop1({ scheduledAt: new Date(2026, 8, 28, 11, 0).toISOString() });
    const d = build([pasado]);
    expect(d.nextPlan).toBeNull();
    expect(d.expressAlert).toBeNull();
  });

  it('una tardanza sin resolver deja al asistente como RETRASADO con sus minutos', () => {
    const d = build([prop1({ incidences: [incidence({ type: 'TARDANZA', delayMinutes: 15, criticality: 'BAJA' })] })]);
    expect(d.nextPlan?.attendees[1]).toEqual({ user: ana, isEssential: false, status: 'RETRASADO', delayMinutes: 15 });
  });
});

describe('matchingHours y upcomingPlans', () => {
  it('suma horas enteras (trunca minutos) de las franjas con ≥ 80 %', () => {
    const p = prop2({ windows: [win('a', 1, '10:30', '12:15', 90, 0), win('b', 1, '13:00', '13:45', 100, 0), win('c', 2, '08:00', '20:00', 79, 0)] });
    expect(matchingHours([p])).toBe(2);
  });

  it('solo confirmados futuros, del más próximo al más lejano', () => {
    const lejano = prop1({ id: 'lejano', scheduledAt: new Date(2026, 9, 6, 9, 0).toISOString() });
    const cercano = prop1({ id: 'cercano', scheduledAt: new Date(2026, 8, 29, 16, 0).toISOString() });
    const pasado = prop1({ id: 'pasado', scheduledAt: new Date(2026, 8, 29, 9, 0).toISOString() });
    expect(upcomingPlans([lejano, pasado, prop2(), cercano], NOW).map((p) => p.id)).toEqual(['cercano', 'lejano']);
  });
});
```

`backend/test/me.test.ts`:

```ts
import type { Dashboard, Group, Proposal, User } from '@hueckoapp/shared';
import type { Express } from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';

import { bearer, createProposal, makeClock, makeTestApp, registerUser, setupSeedGroup } from './helpers';

const NOW = new Date(2026, 8, 29, 10, 0);
const DEADLINE = new Date(2026, 9, 3, 20, 0).toISOString();

let app: Express;
let clock: ReturnType<typeof makeClock>;
let yo: { token: string; user: User };
let ana: { token: string; user: User };
let group: Group;

beforeEach(async () => {
  clock = makeClock(NOW);
  ({ app } = makeTestApp({ now: clock.now }));
  ({ yo, ana, group } = await setupSeedGroup(app));
});

const get = (path: string, token: string) => request(app).get(`/api/me/${path}`).set(bearer(token));
const vote = (p: Proposal, dayOfWeek: number, token: string) =>
  request(app).put(`/api/proposals/${p.id}/vote`).set(bearer(token)).send({ windowId: p.windows.find((w) => w.dayOfWeek === dayOfWeek)!.id });

// La semilla montada por la API: prop_1 confirmada con el imprevisto de Ana y prop_2 en votación con el voto de Ana.
async function seedProposals() {
  const prop1 = await createProposal(app, yo.token, group.id, {
    title: 'Reunión de avance del proyecto',
    location: { name: 'Biblioteca central', latitude: null, longitude: null },
    votingDeadline: DEADLINE,
    windows: [{ dayOfWeek: 3, startTime: '11:00', endTime: '13:00' }],
  });
  await vote(prop1, 3, yo.token);
  await vote(prop1, 3, ana.token);
  await request(app).post(`/api/proposals/${prop1.id}/confirm`).set(bearer(yo.token)).send({});
  await request(app)
    .post(`/api/proposals/${prop1.id}/incidences`)
    .set(bearer(ana.token))
    .send({ type: 'IMPREVISTO', reason: 'Cruce con un examen de laboratorio a última hora.' });
  clock.set(new Date(2026, 8, 29, 10, 1));
  const prop2 = await createProposal(app, ana.token, group.id, {
    title: 'Repaso antes de la entrega',
    location: { name: 'Google Meet', latitude: null, longitude: null },
    votingDeadline: DEADLINE,
    windows: [
      { dayOfWeek: 2, startTime: '16:00', endTime: '18:00' },
      { dayOfWeek: 4, startTime: '10:00', endTime: '12:00' },
      { dayOfWeek: 5, startTime: '16:00', endTime: '18:00' },
    ],
  });
  await vote(prop2, 2, ana.token);
  return { prop1, prop2 };
}

describe('GET /api/me/dashboard', () => {
  it('sin grupos: todo a cero', async () => {
    const nueva = await registerUser(app);
    const res = await get('dashboard', nueva.token);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      metrics: { activeGroups: 0, openVotes: 0, matchingHours: 0, totalBlocks: 0 },
      nextPlan: null,
      groups: [],
      pendingVotes: [],
      expressAlert: null,
    });
  });

  it('de punta a punta con la semilla montada por la API', async () => {
    const { prop1, prop2 } = await seedProposals();
    const d: Dashboard = (await get('dashboard', yo.token)).body;
    // 8 y no 6: aquí el servidor calcula w_23 (viernes 16–18) al 100 %, no el 50 % fijo de Kotlin (B15).
    expect(d.metrics).toEqual({ activeGroups: 1, openVotes: 1, matchingHours: 8, totalBlocks: 2 });
    expect(d.nextPlan).toMatchObject({ id: prop1.id, groupName: 'Proyecto Integrador', scheduledAt: new Date(2026, 8, 30, 11, 0).toISOString() });
    expect(d.nextPlan!.attendees.map((a) => [a.user.name, a.status])).toEqual([
      ['Usuario de Prueba', 'PUNTUAL'],
      ['Ana', 'NO_ASISTE'],
    ]);
    expect(d.groups).toEqual([
      { id: group.id, name: 'Proyecto Integrador', memberCount: 2, nextWindow: { dayOfWeek: 3, startTime: '11:00', endTime: '13:00', availabilityPercentage: 100 } },
    ]);
    expect(d.pendingVotes).toEqual([expect.objectContaining({ id: prop2.id, groupName: 'Proyecto Integrador', myVoteWindowId: null })]);
    expect(d.expressAlert).toMatchObject({ proposalId: prop1.id, kind: 'AVISO', who: 'Ana', canResolve: true });

    const deAna: Dashboard = (await get('dashboard', ana.token)).body;
    expect(deAna.expressAlert?.canResolve).toBe(false);
    expect(deAna.metrics.totalBlocks).toBe(3);
  });

  it('401 sin token', async () => {
    expect((await request(app).get('/api/me/dashboard')).status).toBe(401);
  });
});

describe('GET /api/me/upcoming-plans (C11)', () => {
  it('mis planes confirmados futuros con el nombre del grupo; al cancelar desaparece', async () => {
    const { prop1 } = await seedProposals();
    const res = await get('upcoming-plans', yo.token);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([expect.objectContaining({ id: prop1.id, groupName: 'Proyecto Integrador', state: 'CONFIRMADO' })]);
    await request(app).post(`/api/proposals/${prop1.id}/cancel`).set(bearer(yo.token)).send({});
    expect((await get('upcoming-plans', yo.token)).body).toEqual([]);
  });

  it('no incluye planes de grupos ajenos', async () => {
    await seedProposals();
    const otra = await registerUser(app);
    expect((await get('upcoming-plans', otra.token)).body).toEqual([]);
  });
});
```

- [ ] **Step 2: Ejecutar y ver que falla** — `npm test -w backend -- dashboard me` → FAIL (módulo `dashboard` inexistente, rutas 404).

- [ ] **Step 3: Implementar**

`backend/src/proposals/proposals.repository.ts` — añadir `ProposalWithGroup` al import de tipos de `@hueckoapp/shared` y, dentro del objeto devuelto, después de `resolveIncidences`:

```ts
    // Todas las propuestas de mis grupos, de la más antigua a la más reciente (Inicio y /me/upcoming-plans).
    listForUser(userId: string): ProposalWithGroup[] {
      const rows = db
        .prepare(`${SELECT_PROPOSAL} JOIN group_members m ON m.group_id = p.group_id AND m.user_id = ? ORDER BY p.created_at, p.rowid`)
        .all(userId) as ProposalRow[];
      return rows.map((r) => ({ ...toProposal(r, userId), groupName: r.group_name }));
    },
```

`backend/src/dashboard/dashboard.ts`:

```ts
import type {
  Attendee,
  AttendeeStatus,
  Dashboard,
  DashboardGroup,
  ExpressAlert,
  GroupMember,
  GroupSummary,
  Incidence,
  IncidenceType,
  Proposal,
  ProposalWithGroup,
} from '@hueckoapp/shared';

// Fórmulas de DashboardViewModel.kt (domain spec §2.2), calculadas en el servidor (G7). Funciones puras.

/** «Horas coincidentes» usa este umbral fijo (HIGH_MATCH_THRESHOLD en Kotlin), no el del grupo. */
export const HIGH_MATCH_THRESHOLD = 80;

const wholeHour = (time: string) => Number(time.slice(0, 2));

/** Σ de horas enteras (se truncan los minutos) de las franjas con ≥ 80 %, en todas las propuestas y estados, sin deduplicar. */
export function matchingHours(proposals: readonly Proposal[]): number {
  return proposals
    .flatMap((p) => p.windows)
    .filter((w) => w.availabilityPercentage >= HIGH_MATCH_THRESHOLD)
    .reduce((sum, w) => sum + Math.max(0, wholeHour(w.endTime) - wholeHour(w.startTime)), 0);
}

const STATUS_BY_TYPE: Record<IncidenceType, AttendeeStatus> = { TARDANZA: 'RETRASADO', FALTA: 'NO_ASISTE', IMPREVISTO: 'NO_ASISTE' };

/** Un asistente por miembro; su estado sale de su primera incidencia sin resolver. */
export function attendeesOf(members: readonly GroupMember[], incidences: readonly Incidence[]): Attendee[] {
  return members.map((m) => {
    const open = incidences.find((i) => !i.resolved && i.user.id === m.id);
    return {
      user: { id: m.id, name: m.name, email: m.email },
      isEssential: m.isEssential,
      status: open ? STATUS_BY_TYPE[open.type] : 'PUNTUAL',
      delayMinutes: open?.delayMinutes ?? null,
    };
  });
}

const isFuture = (iso: string, now: Date) => new Date(iso).getTime() > now.getTime();

/** C11: planes confirmados cuyo scheduledAt aún no llegó, del más próximo al más lejano. */
export function upcomingPlans<P extends Proposal>(proposals: readonly P[], now: Date): P[] {
  return proposals
    .filter((p) => p.state === 'CONFIRMADO' && p.scheduledAt !== null && isFuture(p.scheduledAt, now))
    .sort((a, b) => a.scheduledAt!.localeCompare(b.scheduledAt!));
}

/** Resumen por grupo: la franja elegida (o la primera) de su propuesta no cancelada más antigua que tenga franjas. */
export function groupSummaries(groups: readonly GroupSummary[], proposals: readonly ProposalWithGroup[]): DashboardGroup[] {
  return groups.map((g) => {
    const p = proposals.find((x) => x.groupId === g.id && x.state !== 'CANCELADO' && x.windows.length > 0);
    const w = p ? (p.windows.find((x) => x.id === p.chosenWindowId) ?? p.windows[0]) : undefined;
    return {
      id: g.id,
      name: g.name,
      memberCount: g.memberCount,
      nextWindow: w ? { dayOfWeek: w.dayOfWeek, startTime: w.startTime, endTime: w.endTime, availabilityPercentage: w.availabilityPercentage } : null,
    };
  });
}

/**
 * G5: de los planes que aún no ocurrieron, el primero EN_RECOORDINACION («Votación exprés») o, si no hay,
 * el primero CONFIRMADO con incidencias sin resolver (aviso). Se muestra su incidencia ALTA o, si no, la más antigua.
 */
export function expressAlertFor(proposals: readonly ProposalWithGroup[], userId: string, now: Date): ExpressAlert | null {
  const candidates = proposals.filter(
    (p) =>
      (p.state === 'EN_RECOORDINACION' || p.state === 'CONFIRMADO') &&
      (p.scheduledAt === null || isFuture(p.scheduledAt, now)) &&
      p.incidences.some((i) => !i.resolved),
  );
  const p = candidates.find((x) => x.state === 'EN_RECOORDINACION') ?? candidates[0];
  if (!p) return null;
  const pending = p.incidences.filter((i) => !i.resolved);
  const shown = pending.find((i) => i.criticality === 'ALTA') ?? pending[0];
  return {
    proposalId: p.id,
    planTitle: p.title,
    groupName: p.groupName,
    who: shown.user.name,
    reason: shown.reason,
    kind: p.state === 'EN_RECOORDINACION' ? 'RECOORDINACION' : 'AVISO',
    canResolve: p.createdBy.id === userId,
    createdBy: p.createdBy,
  };
}

export function buildDashboard(input: {
  userId: string;
  now: Date;
  groups: GroupSummary[];
  proposals: ProposalWithGroup[];
  totalBlocks: number;
  membersOf: (groupId: string) => GroupMember[];
}): Dashboard {
  const { userId, now, groups, proposals } = input;
  const open = proposals.filter((p) => p.state === 'PROPUESTO');
  const next = upcomingPlans(proposals, now)[0];
  return {
    metrics: { activeGroups: groups.length, openVotes: open.length, matchingHours: matchingHours(proposals), totalBlocks: input.totalBlocks },
    nextPlan: next ? { ...next, attendees: attendeesOf(input.membersOf(next.groupId), next.incidences) } : null,
    groups: groupSummaries(groups, proposals),
    pendingVotes: [...open].sort((a, b) => a.votingDeadline.localeCompare(b.votingDeadline)),
    expressAlert: expressAlertFor(proposals, userId, now),
  };
}
```

`backend/src/me/me.routes.ts`:

```ts
import { Router } from 'express';

import type { AppDeps } from '../app';
import { getUserId } from '../auth/require-auth';
import { buildDashboard, upcomingPlans } from '../dashboard/dashboard';
import { groupsRepository } from '../groups/groups.repository';
import { proposalsRepository } from '../proposals/proposals.repository';
import { timeBlocksRepository } from '../schedule/time-blocks.repository';

// Montado en /api/me detrás de requireAuth (/me/time-blocks tiene su propio router).
export function meRouter({ db, now = () => new Date() }: AppDeps) {
  const router = Router();
  const groups = groupsRepository(db);
  const proposals = proposalsRepository(db);
  const blocks = timeBlocksRepository(db);

  router.get('/upcoming-plans', (_req, res) => {
    const userId = getUserId(res);
    res.json(upcomingPlans(proposals.listForUser(userId), now()));
  });

  router.get('/dashboard', (_req, res) => {
    const userId = getUserId(res);
    res.json(
      buildDashboard({
        userId,
        now: now(),
        groups: groups.listForUser(userId),
        proposals: proposals.listForUser(userId),
        totalBlocks: blocks.listByUser(userId).length,
        membersOf: (groupId) => groups.findById(groupId)?.members ?? [],
      }),
    );
  });

  return router;
}
```

`backend/src/app.ts` — añadir `import { meRouter } from './me/me.routes';` y, justo debajo de la línea que monta `/me/time-blocks`:

```ts
  api.use('/me', requireAuth(deps.jwtSecret), meRouter(deps));
```

`backend/src/db/seed.ts`:
1. Cambiar el comentario de cabecera por `// Semilla de desarrollo (domain spec §3.2): usuarios, grupos, bloques y dos propuestas de ejemplo.` (se quita «Las propuestas de la semilla llegan en la Fase 3.»).
2. Añadir los imports:

```ts
import { proposalsRepository } from '../proposals/proposals.repository';
import { criticalityFor, nextOccurrence } from '../proposals/rules';
```

3. Añadir, antes de `function seed(`:

```ts
const HOUR = 3_600_000;

// prop_1 (confirmada, con el imprevisto de Ana → aviso en Inicio) y prop_2 (en votación, con el voto de Ana).
// Los porcentajes son los fijos de la semilla Kotlin (w_23 figura con 50 % aunque el cruce dé 100 %, B15),
// para que Inicio muestre los valores de domain spec §2.2 («Horas coincidentes» = 6).
function seedProposals(db: Db, ids: Record<UserKey, string>, seedTime: Date): number {
  const { id: groupId } = db.prepare("SELECT id FROM groups WHERE invite_code = 'PROY2026'").get() as { id: string };
  const proposals = proposalsRepository(db);
  const exists = (title: string) => db.prepare('SELECT 1 FROM proposals WHERE group_id = ? AND title = ?').get(groupId, title) !== undefined;
  const ago = (hours: number) => new Date(seedTime.getTime() - hours * HOUR).toISOString();
  let created = 0;

  if (!exists('Reunión de avance del proyecto')) {
    const id = proposals.create({
      groupId,
      createdBy: ids.test,
      title: 'Reunión de avance del proyecto',
      location: { name: 'Biblioteca central', latitude: null, longitude: null },
      votingDeadline: ago(24),
      windows: [{ dayOfWeek: 3, startTime: '11:00', endTime: '13:00', availabilityPercentage: 100 }],
      createdAt: ago(48),
    });
    const [w1] = proposals.findById(id, ids.test)!.windows;
    proposals.vote(id, ids.test, w1.id);
    proposals.vote(id, ids.ana, w1.id);
    proposals.confirm(id, w1.id, nextOccurrence(w1.dayOfWeek, w1.startTime, seedTime).toISOString());
    proposals.reportIncidence(
      id,
      {
        userId: ids.ana,
        type: 'IMPREVISTO',
        reason: 'Cruce con un examen de laboratorio a última hora.',
        delayMinutes: null,
        criticality: criticalityFor('IMPREVISTO', false, null),
        createdAt: seedTime.toISOString(),
      },
      false,
    );
    created++;
  }

  if (!exists('Repaso antes de la entrega')) {
    // «Cierra hoy a las 20:00»; si ya pasó, mañana a esta hora.
    const today20 = new Date(seedTime.getFullYear(), seedTime.getMonth(), seedTime.getDate(), 20, 0);
    const deadline = today20.getTime() > seedTime.getTime() ? today20 : new Date(seedTime.getTime() + 24 * HOUR);
    const id = proposals.create({
      groupId,
      createdBy: ids.ana,
      title: 'Repaso antes de la entrega',
      location: { name: 'Google Meet', latitude: null, longitude: null },
      votingDeadline: deadline.toISOString(),
      windows: [
        { dayOfWeek: 2, startTime: '16:00', endTime: '18:00', availabilityPercentage: 100 },
        { dayOfWeek: 4, startTime: '10:00', endTime: '12:00', availabilityPercentage: 100 },
        { dayOfWeek: 5, startTime: '16:00', endTime: '18:00', availabilityPercentage: 50 },
      ],
      createdAt: ago(1),
    });
    const w21 = proposals.findById(id, ids.ana)!.windows.find((w) => w.dayOfWeek === 2)!;
    proposals.vote(id, ids.ana, w21.id);
    created++;
  }

  return created;
}
```

4. En `seed(db, passwordHash)`: cambiar `const created = { users: 0, groups: 0, blocks: 0 };` por `const created = { users: 0, groups: 0, blocks: 0, proposals: 0 };` y, justo antes de `return created;`, añadir `created.proposals = seedProposals(db, ids, new Date());` (corre dentro del `withTransaction` de `main`; `proposals.create` y `reportIncidence` abren transacciones anidadas, que son reentrantes).
5. En `main()`, cambiar el primer `console.log` por:

```ts
    console.log(
      `Semilla aplicada en ${env.DATABASE_PATH}: ${created.users} usuarios, ${created.groups} grupos, ${created.blocks} bloques y ${created.proposals} propuestas nuevas.`,
    );
```

- [ ] **Step 4: Ejecutar y ver que pasa** — `npm test -w backend` → PASS. `npm run typecheck` → sin errores.

- [ ] **Step 5: Verificación manual de la semilla** (requiere `backend/.env` con `JWT_SECRET`, como indica el README). Desde la raíz, en Git Bash:

```bash
rm -f backend/data/hueckoapp.db*
npm run seed -w backend     # «… 3 usuarios, 2 grupos, 5 bloques y 2 propuestas nuevas.»
npm run seed -w backend     # segunda vez: «… 0 usuarios, 0 grupos, 0 bloques y 0 propuestas nuevas.»
npm run backend &
sleep 3
TOKEN=$(curl -s -X POST localhost:3000/api/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"test@test.com","password":"password123"}' | node -pe 'JSON.parse(require("fs").readFileSync(0)).token')
curl -s localhost:3000/api/me/dashboard -H "Authorization: Bearer $TOKEN" \
  | node -pe 'const d = JSON.parse(require("fs").readFileSync(0)); JSON.stringify([d.metrics, d.nextPlan && d.nextPlan.title, d.expressAlert && d.expressAlert.kind])'
# → [{"activeGroups":1,"openVotes":1,"matchingHours":6,"totalBlocks":2},"Reunión de avance del proyecto","AVISO"]
kill %1
```

- [ ] **Step 6: Actualizar el contrato y el README**

`docs/api.md`:
1. Reemplazar la sección `### \`GET /me/upcoming-plans\`` (título y su línea) por:

```md
### `GET /me/upcoming-plans`
`200 ProposalWithGroup[]`: propuestas `CONFIRMADO` de todos mis grupos cuyo `scheduledAt` todavía no llegó, de la más próxima a la más lejana. Cada una lleva `groupName`.

### `GET /me/dashboard`
Todo lo que necesita «Inicio» en una sola llamada: `200 Dashboard`.
- `metrics.activeGroups`: grupos de los que soy miembro.
- `metrics.openVotes`: propuestas `PROPUESTO` de mis grupos (aunque su plazo haya pasado: siguen pendientes de hora hasta que alguien las confirme).
- `metrics.matchingHours`: suma, sobre **todas** las franjas de **todas** las propuestas de mis grupos (cualquier estado, también canceladas) con `availabilityPercentage ≥ 80` (fijo, no el umbral del grupo), de `hora(endTime) − hora(startTime)` en horas enteras (se truncan los minutos), sin deduplicar solapes. Es la fórmula de la app Kotlin.
- `metrics.totalBlocks`: mis bloques de horario (recurrentes y puntuales).
- `nextPlan`: el primero de `/me/upcoming-plans` con `attendees`, uno por miembro del grupo; su estado sale de su primera incidencia sin resolver: `TARDANZA` → `RETRASADO`, `FALTA`/`IMPREVISTO` → `NO_ASISTE`, ninguna → `PUNTUAL`. `null` si no hay.
- `groups`: uno por grupo (en el orden de `GET /groups`), con `nextWindow` = la franja elegida (o la primera) de su propuesta no cancelada más antigua que tenga franjas; `null` si no hay.
- `pendingVotes`: propuestas `PROPUESTO` de mis grupos con `groupName`, las que cierran antes primero.
- `expressAlert`: de los planes que aún no ocurrieron, el primero `EN_RECOORDINACION` (`kind: "RECOORDINACION"`) o, si no hay, el primero `CONFIRMADO` con incidencias sin resolver (`kind: "AVISO"`). `who` y `reason` salen de su incidencia sin resolver más crítica (`ALTA` primero; si no, la más antigua). `canResolve` es `true` si soy quien creó el plan. `null` si no hay.

El «horario de hoy» no viene aquí: depende de la zona horaria del teléfono, así que la app lo calcula con `GET /me/time-blocks`.
```

2. En la tabla «Resumen de las entidades», añadir después de la fila de `Location`:

```md
| `ProposalWithGroup` | `Proposal` + `groupName` |
| `UpcomingPlan` / `Attendee` | Próximo plan con la asistencia prevista de cada miembro |
| `Dashboard` | Resumen de «Inicio» (`GET /me/dashboard`) |
```

`README.md` — en la tabla de cuentas demo, reemplazar las filas de `test@test.com` y `ana@test.com` por:

```md
| `test@test.com` | `password123` | Administra «Proyecto Integrador» (código `PROY2026`) junto con Ana. Clases el lunes 08–10 y el miércoles 14–16. Creó «Reunión de avance del proyecto» (confirmada, con un imprevisto de Ana: sale el aviso en Inicio) |
| `ana@test.com` | `password123` | Miembro de «Proyecto Integrador». Bloques el lunes, el miércoles y el viernes. Propuso «Repaso antes de la entrega» (en votación, con su voto) |
```

- [ ] **Step 7: Commit** — `git add backend/src/dashboard backend/src/me backend/src/proposals/proposals.repository.ts backend/src/app.ts backend/src/db/seed.ts backend/test/dashboard.test.ts backend/test/me.test.ts docs/api.md README.md` → `feat(backend): resumen de inicio, próximos planes y propuestas en la semilla`

---

### Task 5: Mobile — capa de datos de propuestas e Inicio

**Files:**
- Create: `mobile/src/api/proposals.ts`, `mobile/src/api/dashboard.ts`, `mobile/src/hooks/useProposals.ts`, `mobile/src/hooks/useProposal.ts`, `mobile/src/hooks/useDashboard.ts`, `mobile/src/hooks/useRefreshErrorToast.ts`, `mobile/src/utils/proposals.ts`, `mobile/src/testing/fixtures.ts`, `mobile/src/hooks/__tests__/useProposals.test.ts`, `mobile/src/hooks/__tests__/useDashboard.test.ts`, `mobile/src/hooks/__tests__/useRefreshErrorToast.test.ts`, `mobile/src/utils/__tests__/proposals.test.ts`
- Modify: `mobile/src/utils/days.ts`, `mobile/src/utils/__tests__/days.test.ts`, `mobile/src/api/__tests__/endpoints.test.ts`

**Interfaces:**
- Consumes: `api`, `errorMessage` (`src/api/client.ts`); `listTimeBlocks` (`src/api/schedule.ts`); `useResource` (`data`, `loaded`, `loading`, `refreshing`, `error`, `reload`, `mutate`); `showToast`; `dayShort`, `formatDateLabel`, `toDateKey` (`src/utils/days.ts`); `colors`; tipos de `shared` (Task 1).
- Produces:
  - `src/api/proposals.ts`: `listGroupProposals(groupId): Promise<Proposal[]>`; `createProposal(groupId, input: ProposalInput): Promise<Proposal>`; `getProposal(id)`; `voteWindow(id, windowId)`; `removeVote(id)`; `addWindow(id, input: TimeWindowInput)`; `confirmProposal(id, windowId?: string)`; `cancelProposal(id)`; `reportIncidence(id, input: IncidenceInput)`; `resolveIncidences(id, input: ResolveIncidencesInput)` — todas `Promise<Proposal>` salvo la lista.
  - `src/api/dashboard.ts`: `getDashboard(): Promise<Dashboard>`.
  - `useProposals(groupId)` → `{ proposals: Proposal[]; loaded; loading; refreshing; error; reload }`.
  - `type VoteOutcome = 'voted' | 'unvoted'`; `useProposal(proposalId)` → `{ proposal: Proposal | undefined; loading; refreshing; error; reload; toggleVote(windowId): Promise<VoteOutcome>; addWindow(input): Promise<Proposal>; confirm(windowId?): Promise<Proposal>; cancel(): Promise<Proposal>; reportIncidence(input): Promise<Proposal>; resolve(input): Promise<Proposal> }` (las acciones lanzan si fallan).
  - `useDashboard()` → `{ dashboard: Dashboard | undefined; blocks: TimeBlock[]; loaded; loading; refreshing; error; reload; toggleVote(proposalId, windowId): Promise<VoteOutcome> }`.
  - `useRefreshErrorToast(error: string | null, hasData: boolean): void`.
  - `src/utils/days.ts`: `formatDateTime(date: Date): string` («Vie 2 oct, 20:00»).
  - `src/utils/proposals.ts`: `STATE_BADGE`, `INCIDENCE_LABEL`, `CRITICALITY_BADGE`, `windowLabel(w)`, `voteCountLabel(n)`, `availabilityLabel(pct)`, `isVotingOpen(p, now)`, `deadlineLabel(iso, now)`, `scheduleLabel(p)`, `openIncidence(p)`.
  - `src/testing/fixtures.ts`: `TEST_USER`, `ANA`, `makeWindow`, `makeProposal`, `makeConfirmed`, `makeDashboard` (solo para tests).

- [ ] **Step 1: Escribir los tests que fallan**

`mobile/src/testing/fixtures.ts` (datos de la semilla para los tests; no lo importa la app):

```ts
import type { Dashboard, Proposal, TimeWindow, User } from '@hueckoapp/shared';

// Datos de prueba basados en la semilla (domain spec §3). Hoy, en los tests, es el martes 29/09/2026 a las 10:00.
export const TEST_USER: User = { id: 'u1', name: 'Usuario de Prueba', email: 'test@test.com' };
export const ANA: User = { id: 'u2', name: 'Ana', email: 'ana@test.com' };

export const makeWindow = (over: Partial<TimeWindow> = {}): TimeWindow => ({
  id: 'w_21', dayOfWeek: 2, startTime: '16:00', endTime: '18:00', availabilityPercentage: 100, voteCount: 0, ...over,
});

// prop_2: en votación, creada por Ana, cierra hoy a las 20:00; Ana votó el martes.
export const makeProposal = (over: Partial<Proposal> = {}): Proposal => ({
  id: 'prop_2',
  groupId: 'g1',
  title: 'Repaso antes de la entrega',
  location: { name: 'Google Meet', latitude: null, longitude: null },
  createdBy: ANA,
  votingDeadline: new Date(2026, 8, 29, 20, 0).toISOString(),
  state: 'PROPUESTO',
  windows: [
    makeWindow({ voteCount: 1 }),
    makeWindow({ id: 'w_22', dayOfWeek: 4, startTime: '10:00', endTime: '12:00' }),
    makeWindow({ id: 'w_23', dayOfWeek: 5, availabilityPercentage: 50 }),
  ],
  myVoteWindowId: null,
  chosenWindowId: null,
  scheduledAt: null,
  incidences: [],
  createdAt: new Date(2026, 8, 29, 9, 0).toISOString(),
  ...over,
});

// prop_1: confirmada por Usuario de Prueba para el miércoles 30 a las 11:00, con el imprevisto de Ana sin resolver.
export const makeConfirmed = (over: Partial<Proposal> = {}): Proposal =>
  makeProposal({
    id: 'prop_1',
    title: 'Reunión de avance del proyecto',
    location: { name: 'Biblioteca central', latitude: null, longitude: null },
    createdBy: TEST_USER,
    votingDeadline: new Date(2026, 8, 28, 10, 0).toISOString(),
    state: 'CONFIRMADO',
    windows: [makeWindow({ id: 'w_1', dayOfWeek: 3, startTime: '11:00', endTime: '13:00', voteCount: 2 })],
    myVoteWindowId: 'w_1',
    chosenWindowId: 'w_1',
    scheduledAt: new Date(2026, 8, 30, 11, 0).toISOString(),
    incidences: [
      {
        id: 'inc_1', user: ANA, type: 'IMPREVISTO', reason: 'Cruce con un examen de laboratorio a última hora.',
        delayMinutes: null, criticality: 'MEDIA', resolved: false, createdAt: new Date(2026, 8, 29, 9, 0).toISOString(),
      },
    ],
    createdAt: new Date(2026, 8, 27, 10, 0).toISOString(),
    ...over,
  });

// GET /me/dashboard con la semilla, visto por Usuario de Prueba (domain spec §2.2).
export const makeDashboard = (over: Partial<Dashboard> = {}): Dashboard => ({
  metrics: { activeGroups: 1, openVotes: 1, matchingHours: 6, totalBlocks: 2 },
  nextPlan: {
    ...makeConfirmed(),
    groupName: 'Proyecto Integrador',
    attendees: [
      { user: TEST_USER, isEssential: false, status: 'PUNTUAL', delayMinutes: null },
      { user: ANA, isEssential: false, status: 'NO_ASISTE', delayMinutes: null },
    ],
  },
  groups: [
    { id: 'g1', name: 'Proyecto Integrador', memberCount: 2, nextWindow: { dayOfWeek: 3, startTime: '11:00', endTime: '13:00', availabilityPercentage: 100 } },
  ],
  pendingVotes: [{ ...makeProposal(), groupName: 'Proyecto Integrador' }],
  expressAlert: {
    proposalId: 'prop_1', planTitle: 'Reunión de avance del proyecto', groupName: 'Proyecto Integrador', who: 'Ana',
    reason: 'Cruce con un examen de laboratorio a última hora.', kind: 'AVISO', canResolve: true, createdBy: TEST_USER,
  },
  ...over,
});
```

`mobile/src/utils/__tests__/proposals.test.ts`:

```ts
import { makeConfirmed, makeProposal, makeWindow } from '../../testing/fixtures';
import {
  availabilityLabel, deadlineLabel, isVotingOpen, openIncidence, scheduleLabel, STATE_BADGE, voteCountLabel, windowLabel,
} from '../proposals';

const NOW = new Date(2026, 8, 29, 10, 0);

it('etiquetas de franja, votos y disponibilidad (quirk 20: siempre con « · »)', () => {
  expect(windowLabel(makeWindow())).toBe('Mar · 16:00 - 18:00');
  expect(voteCountLabel(0)).toBe('0 votos');
  expect(voteCountLabel(1)).toBe('1 voto');
  expect(voteCountLabel(2)).toBe('2 votos');
  expect(availabilityLabel(67)).toBe('67% del grupo disponible');
});

it('estados con tildes y «Confirmado» en primary (quirk 21)', () => {
  expect(STATE_BADGE.PROPUESTO.text).toBe('En votación');
  expect(STATE_BADGE.EN_RECOORDINACION.text).toBe('Re-coordinando');
  expect(STATE_BADGE.CANCELADO.text).toBe('Cancelado');
  expect(STATE_BADGE.CONFIRMADO).toEqual({ text: 'Confirmado', container: '#6750A4', content: '#FFFFFF' });
});

it('isVotingOpen (C1): PROPUESTO y antes del plazo', () => {
  expect(isVotingOpen(makeProposal(), NOW)).toBe(true);
  expect(isVotingOpen(makeProposal(), new Date(2026, 8, 29, 20, 0))).toBe(false);
  expect(isVotingOpen(makeConfirmed(), NOW)).toBe(false);
});

it('deadlineLabel: «Cierra» si es futuro, «Cerró» si pasó', () => {
  const iso = new Date(2026, 8, 29, 20, 0).toISOString();
  expect(deadlineLabel(iso, NOW)).toBe('Cierra: Mar 29 sep, 20:00');
  expect(deadlineLabel(iso, new Date(2026, 8, 30))).toBe('Cerró: Mar 29 sep, 20:00');
});

it('scheduleLabel: fecha y franja elegida de un plan confirmado; null si no lo está', () => {
  expect(scheduleLabel(makeConfirmed())).toBe('Mié 30 sep · 11:00 - 13:00');
  expect(scheduleLabel(makeProposal())).toBeNull();
});

it('openIncidence: la ALTA sin resolver o, si no, la primera sin resolver', () => {
  const base = makeConfirmed().incidences[0];
  expect(openIncidence(makeConfirmed())?.id).toBe('inc_1');
  const alta = { ...base, id: 'alta', criticality: 'ALTA' as const };
  expect(openIncidence(makeConfirmed({ incidences: [base, alta] }))?.id).toBe('alta');
  expect(openIncidence(makeConfirmed({ incidences: [{ ...base, resolved: true }] }))).toBeNull();
});
```

Añadir a `mobile/src/utils/__tests__/days.test.ts` (y `formatDateTime` al import de `'../days'`):

```ts
it('formatDateTime: «Vie 2 oct, 20:05» en hora local', () => {
  expect(formatDateTime(new Date(2026, 9, 2, 20, 5))).toBe('Vie 2 oct, 20:05');
});
```

Añadir a `mobile/src/api/__tests__/endpoints.test.ts`: los imports `import * as dashboard from '../dashboard';` e `import * as proposals from '../proposals';`, estas constantes antes del `it.each`:

```ts
const proposalInput = { title: 'Repaso', votingDeadline: '2026-10-03T01:00:00.000Z', windows: [] };
const windowInput = { dayOfWeek: 5, startTime: '18:00', endTime: '19:30' };
const incidenceInput = { type: 'TARDANZA' as const, reason: 'Tráfico', delayMinutes: 20 };
```

y estas filas al final del array del `it.each` (antes de `])('%s %s'`):

```ts
  ['GET', '/groups/g1/proposals', () => proposals.listGroupProposals('g1'), undefined],
  ['POST', '/groups/g1/proposals', () => proposals.createProposal('g1', proposalInput), proposalInput],
  ['GET', '/proposals/p1', () => proposals.getProposal('p1'), undefined],
  ['PUT', '/proposals/p1/vote', () => proposals.voteWindow('p1', 'w1'), { windowId: 'w1' }],
  ['DELETE', '/proposals/p1/vote', () => proposals.removeVote('p1'), undefined],
  ['POST', '/proposals/p1/windows', () => proposals.addWindow('p1', windowInput), windowInput],
  ['POST', '/proposals/p1/confirm', () => proposals.confirmProposal('p1'), {}],
  ['POST', '/proposals/p1/confirm', () => proposals.confirmProposal('p1', 'w1'), { windowId: 'w1' }],
  ['POST', '/proposals/p1/cancel', () => proposals.cancelProposal('p1'), undefined],
  ['POST', '/proposals/p1/incidences', () => proposals.reportIncidence('p1', incidenceInput), incidenceInput],
  ['POST', '/proposals/p1/incidences/resolve', () => proposals.resolveIncidences('p1', { newState: 'CANCELADO' }), { newState: 'CANCELADO' }],
  ['GET', '/me/dashboard', () => dashboard.getDashboard(), undefined],
```

`mobile/src/hooks/__tests__/useProposals.test.ts`:

```ts
import { act, renderHook, waitFor } from '@testing-library/react-native';

import { ApiError } from '../../api/client';
import * as proposalsApi from '../../api/proposals';
import { makeConfirmed, makeProposal, makeWindow } from '../../testing/fixtures';
import { useProposal } from '../useProposal';
import { useProposals } from '../useProposals';

jest.mock('../../api/proposals');
const mocked = proposalsApi as jest.Mocked<typeof proposalsApi>;

beforeEach(() => jest.clearAllMocks());

describe('useProposals', () => {
  it('carga las propuestas del grupo y recarga si cambia el grupo', async () => {
    mocked.listGroupProposals.mockImplementation(async (groupId) => [makeProposal({ groupId })]);
    const { result, rerender } = await renderHook(({ id }: { id: string }) => useProposals(id), { initialProps: { id: 'g1' } });
    await waitFor(() => expect(result.current.proposals[0]?.groupId).toBe('g1'));
    await rerender({ id: 'g2' });
    await waitFor(() => expect(result.current.proposals[0]?.groupId).toBe('g2'));
    expect(mocked.listGroupProposals).toHaveBeenCalledWith('g2');
  });
});

describe('useProposal', () => {
  const load = async (initial = makeProposal()) => {
    mocked.getProposal.mockResolvedValue(initial);
    const hook = await renderHook(() => useProposal('prop_2'));
    await waitFor(() => expect(hook.result.current.proposal).toBeDefined());
    return hook;
  };

  it('toggleVote sobre otra franja vota con PUT y devuelve «voted»', async () => {
    const votada = makeProposal({ myVoteWindowId: 'w_22', windows: [makeWindow({ voteCount: 1 }), makeWindow({ id: 'w_22', dayOfWeek: 4, voteCount: 1 })] });
    mocked.voteWindow.mockResolvedValue(votada);
    const { result } = await load();
    let outcome: string | undefined;
    await act(async () => {
      outcome = await result.current.toggleVote('w_22');
    });
    expect(outcome).toBe('voted');
    expect(mocked.voteWindow).toHaveBeenCalledWith('prop_2', 'w_22');
    expect(result.current.proposal).toEqual(votada);
  });

  it('toggleVote sobre mi franja retira el voto con DELETE y devuelve «unvoted» (G1)', async () => {
    mocked.removeVote.mockResolvedValue(makeProposal());
    const { result } = await load(makeProposal({ myVoteWindowId: 'w_21' }));
    let outcome: string | undefined;
    await act(async () => {
      outcome = await result.current.toggleVote('w_21');
    });
    expect(outcome).toBe('unvoted');
    expect(mocked.removeVote).toHaveBeenCalledWith('prop_2');
    expect(mocked.voteWindow).not.toHaveBeenCalled();
    expect(result.current.proposal?.myVoteWindowId).toBeNull();
  });

  it('confirm, cancel, addWindow, reportIncidence y resolve reemplazan la propuesta con la respuesta', async () => {
    const confirmed = makeConfirmed({ id: 'prop_2' });
    mocked.confirmProposal.mockResolvedValue(confirmed);
    mocked.cancelProposal.mockResolvedValue(makeProposal({ state: 'CANCELADO' }));
    mocked.addWindow.mockResolvedValue(makeProposal({ title: 'Con franja nueva' }));
    mocked.reportIncidence.mockResolvedValue(makeProposal({ title: 'Con imprevisto' }));
    mocked.resolveIncidences.mockResolvedValue(makeProposal({ title: 'Resuelta' }));
    const { result } = await load();

    await act(async () => void (await result.current.confirm('w_22')));
    expect(mocked.confirmProposal).toHaveBeenCalledWith('prop_2', 'w_22');
    expect(result.current.proposal).toEqual(confirmed);

    await act(async () => void (await result.current.cancel()));
    expect(result.current.proposal?.state).toBe('CANCELADO');

    await act(async () => void (await result.current.addWindow({ dayOfWeek: 5, startTime: '18:00', endTime: '19:00' })));
    expect(mocked.addWindow).toHaveBeenCalledWith('prop_2', { dayOfWeek: 5, startTime: '18:00', endTime: '19:00' });
    expect(result.current.proposal?.title).toBe('Con franja nueva');

    await act(async () => void (await result.current.reportIncidence({ type: 'FALTA', reason: 'Enfermo' })));
    expect(result.current.proposal?.title).toBe('Con imprevisto');

    await act(async () => void (await result.current.resolve({ newState: 'CONFIRMADO' })));
    expect(mocked.resolveIncidences).toHaveBeenCalledWith('prop_2', { newState: 'CONFIRMADO' });
    expect(result.current.proposal?.title).toBe('Resuelta');
  });

  it('si la acción falla, propaga el error y la propuesta no cambia', async () => {
    mocked.voteWindow.mockRejectedValue(new ApiError(409, 'VOTING_CLOSED', 'La votación ya cerró.'));
    const { result } = await load();
    await act(async () => {
      await expect(result.current.toggleVote('w_22')).rejects.toMatchObject({ code: 'VOTING_CLOSED' });
    });
    expect(result.current.proposal).toEqual(makeProposal());
  });
});
```

`mobile/src/hooks/__tests__/useDashboard.test.ts`:

```ts
import type { TimeBlock } from '@hueckoapp/shared';
import { act, renderHook, waitFor } from '@testing-library/react-native';

import { ApiError } from '../../api/client';
import * as dashboardApi from '../../api/dashboard';
import * as proposalsApi from '../../api/proposals';
import * as scheduleApi from '../../api/schedule';
import { makeDashboard, makeProposal } from '../../testing/fixtures';
import { useDashboard } from '../useDashboard';

jest.mock('../../api/dashboard');
jest.mock('../../api/proposals');
jest.mock('../../api/schedule');
const dashboard = dashboardApi as jest.Mocked<typeof dashboardApi>;
const proposals = proposalsApi as jest.Mocked<typeof proposalsApi>;
const schedule = scheduleApi as jest.Mocked<typeof scheduleApi>;

const block: TimeBlock = {
  id: 'b1', userId: 'u1', label: 'Clase de Android', type: 'CLASE', startTime: '08:00', endTime: '10:00',
  isRecurring: true, dayOfWeek: 1, date: null,
};

beforeEach(() => {
  jest.clearAllMocks();
  dashboard.getDashboard.mockResolvedValue(makeDashboard());
  schedule.listTimeBlocks.mockResolvedValue([block]);
});

const load = async () => {
  const hook = await renderHook(() => useDashboard());
  await waitFor(() => expect(hook.result.current.loaded).toBe(true));
  return hook;
};

it('carga el resumen y mis bloques en una sola carga', async () => {
  const { result } = await load();
  expect(result.current.dashboard).toEqual(makeDashboard());
  expect(result.current.blocks).toEqual([block]);
});

it('toggleVote vota y actualiza solo esa votación, conservando el nombre del grupo', async () => {
  proposals.voteWindow.mockResolvedValue(makeProposal({ myVoteWindowId: 'w_22' }));
  const { result } = await load();
  let outcome: string | undefined;
  await act(async () => {
    outcome = await result.current.toggleVote('prop_2', 'w_22');
  });
  expect(outcome).toBe('voted');
  expect(proposals.voteWindow).toHaveBeenCalledWith('prop_2', 'w_22');
  expect(result.current.dashboard?.pendingVotes[0]).toMatchObject({ id: 'prop_2', myVoteWindowId: 'w_22', groupName: 'Proyecto Integrador' });
});

it('toggleVote sobre mi franja retira el voto', async () => {
  dashboard.getDashboard.mockResolvedValue(
    makeDashboard({ pendingVotes: [{ ...makeProposal({ myVoteWindowId: 'w_21' }), groupName: 'Proyecto Integrador' }] }),
  );
  proposals.removeVote.mockResolvedValue(makeProposal());
  const { result } = await load();
  let outcome: string | undefined;
  await act(async () => {
    outcome = await result.current.toggleVote('prop_2', 'w_21');
  });
  expect(outcome).toBe('unvoted');
  expect(proposals.removeVote).toHaveBeenCalledWith('prop_2');
  expect(result.current.dashboard?.pendingVotes[0].myVoteWindowId).toBeNull();
});

it('si falla una de las dos cargas queda el error', async () => {
  dashboard.getDashboard.mockRejectedValue(new ApiError(0, 'NETWORK_ERROR', 'No se pudo conectar con el servidor. Revisa tu conexión.'));
  const { result } = await renderHook(() => useDashboard());
  await waitFor(() => expect(result.current.error).toBe('No se pudo conectar con el servidor. Revisa tu conexión.'));
  expect(result.current.loaded).toBe(false);
});
```

`mobile/src/hooks/__tests__/useRefreshErrorToast.test.ts`:

```ts
import { renderHook } from '@testing-library/react-native';

import { showToast } from '../../utils/toast';
import { useRefreshErrorToast } from '../useRefreshErrorToast';

jest.mock('../../utils/toast', () => ({ showToast: jest.fn() }));

type Props = { error: string | null; hasData: boolean };

it('solo avisa si falla una recarga con datos en pantalla, una vez por error', async () => {
  const { rerender } = await renderHook(({ error, hasData }: Props) => useRefreshErrorToast(error, hasData), {
    initialProps: { error: null, hasData: false } as Props,
  });
  // Primera carga fallida: la muestra LoadState con «Reintentar», no un toast.
  await rerender({ error: 'Sin conexión', hasData: false });
  expect(showToast).not.toHaveBeenCalled();

  await rerender({ error: null, hasData: true });
  await rerender({ error: 'Sin conexión', hasData: true });
  expect(showToast).toHaveBeenCalledWith('Sin conexión');

  await rerender({ error: 'Sin conexión', hasData: true });
  expect(showToast).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2: Ejecutar y ver que falla** — `npm test -w mobile -- endpoints proposals useDashboard useRefreshErrorToast days` → FAIL (módulos inexistentes).

- [ ] **Step 3: Implementar la API y las utilidades**

`mobile/src/api/proposals.ts`:

```ts
import type { IncidenceInput, Proposal, ProposalInput, ResolveIncidencesInput, TimeWindowInput } from '@hueckoapp/shared';

import { api } from './client';

export type { IncidenceInput, ProposalInput, ResolveIncidencesInput, TimeWindowInput };

const groupProposalsPath = (groupId: string) => `/groups/${encodeURIComponent(groupId)}/proposals`;
const proposalPath = (id: string) => `/proposals/${encodeURIComponent(id)}`;

export const listGroupProposals = async (groupId: string) => (await api.get<Proposal[]>(groupProposalsPath(groupId))).data;

export const createProposal = async (groupId: string, input: ProposalInput) =>
  (await api.post<Proposal>(groupProposalsPath(groupId), input)).data;

export const getProposal = async (id: string) => (await api.get<Proposal>(proposalPath(id))).data;

export const voteWindow = async (id: string, windowId: string) =>
  (await api.put<Proposal>(`${proposalPath(id)}/vote`, { windowId })).data;

export const removeVote = async (id: string) => (await api.delete<Proposal>(`${proposalPath(id)}/vote`)).data;

export const addWindow = async (id: string, input: TimeWindowInput) =>
  (await api.post<Proposal>(`${proposalPath(id)}/windows`, input)).data;

// Sin windowId el servidor elige la más votada (C2).
export const confirmProposal = async (id: string, windowId?: string) =>
  (await api.post<Proposal>(`${proposalPath(id)}/confirm`, windowId ? { windowId } : {})).data;

export const cancelProposal = async (id: string) => (await api.post<Proposal>(`${proposalPath(id)}/cancel`)).data;

export const reportIncidence = async (id: string, input: IncidenceInput) =>
  (await api.post<Proposal>(`${proposalPath(id)}/incidences`, input)).data;

export const resolveIncidences = async (id: string, input: ResolveIncidencesInput) =>
  (await api.post<Proposal>(`${proposalPath(id)}/incidences/resolve`, input)).data;
```

`mobile/src/api/dashboard.ts`:

```ts
import type { Dashboard } from '@hueckoapp/shared';

import { api } from './client';

export const getDashboard = async () => (await api.get<Dashboard>('/me/dashboard')).data;
```

`mobile/src/utils/days.ts` — añadir al final:

```ts
/** «Vie 2 oct, 20:00» en hora local (plazos de votación). */
export const formatDateTime = (date: Date) =>
  `${formatDateLabel(toDateKey(date))}, ${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
```

`mobile/src/utils/proposals.ts`:

```ts
import type { Criticality, Incidence, IncidenceType, Proposal, ProposalState, TimeWindow } from '@hueckoapp/shared';

import { colors } from '../theme';
import { dayShort, formatDateLabel, formatDateTime, toDateKey } from './days';

type BadgeStyle = { text: string; container: string; content: string };

// Estados (UI spec §2.6/§2.7, con tildes). Quirk 21: «Confirmado» siempre en primary, que se ve sobre
// tarjetas blancas y sobre primaryContainer.
export const STATE_BADGE: Record<ProposalState, BadgeStyle> = {
  PROPUESTO: { text: 'En votación', container: colors.secondaryContainer, content: colors.onSecondaryContainer },
  CONFIRMADO: { text: 'Confirmado', container: colors.primary, content: colors.onPrimary },
  EN_RECOORDINACION: { text: 'Re-coordinando', container: colors.tertiaryContainer, content: colors.onTertiaryContainer },
  CANCELADO: { text: 'Cancelado', container: colors.errorContainer, content: colors.onErrorContainer },
};

// Cómo se lee una incidencia de otra persona.
export const INCIDENCE_LABEL: Record<IncidenceType, string> = {
  FALTA: 'No podrá ir',
  TARDANZA: 'Llegará tarde',
  IMPREVISTO: 'Imprevisto',
};

export const CRITICALITY_BADGE: Record<Criticality, BadgeStyle> = {
  ALTA: { text: 'Crítica', container: colors.errorContainer, content: colors.onErrorContainer },
  MEDIA: { text: 'Media', container: colors.warningContainer, content: colors.onWarningContainer },
  BAJA: { text: 'Baja', container: colors.surfaceContainerHigh, content: colors.onSurfaceVariant },
};

type WindowLike = Pick<TimeWindow, 'dayOfWeek' | 'startTime' | 'endTime'>;

/** «Mar · 16:00 - 18:00» en todas las pantallas (quirk 20: un solo formato). */
export const windowLabel = (w: WindowLike) => `${dayShort(w.dayOfWeek)} · ${w.startTime} - ${w.endTime}`;

export const voteCountLabel = (n: number) => (n === 1 ? '1 voto' : `${n} votos`);

export const availabilityLabel = (percentage: number) => `${percentage}% del grupo disponible`;

/** C1: se vota con la propuesta en PROPUESTO y antes de su plazo (misma regla que el servidor). */
export const isVotingOpen = (p: Pick<Proposal, 'state' | 'votingDeadline'>, now: Date) =>
  p.state === 'PROPUESTO' && new Date(p.votingDeadline).getTime() > now.getTime();

/** «Cierra: Vie 2 oct, 20:00», o «Cerró: …» si el plazo ya pasó. */
export const deadlineLabel = (iso: string, now: Date) => {
  const date = new Date(iso);
  return `${date.getTime() > now.getTime() ? 'Cierra' : 'Cerró'}: ${formatDateTime(date)}`;
};

/** Fecha del plan confirmado: «Mié 30 sep · 11:00 - 13:00». null si aún no tiene fecha. */
export function scheduleLabel(p: Pick<Proposal, 'scheduledAt' | 'chosenWindowId' | 'windows'>): string | null {
  const chosen = p.windows.find((w) => w.id === p.chosenWindowId);
  if (!p.scheduledAt || !chosen) return null;
  return `${formatDateLabel(toDateKey(new Date(p.scheduledAt)))} · ${chosen.startTime} - ${chosen.endTime}`;
}

/** La incidencia sin resolver que se muestra en la alerta: la ALTA o, si no hay, la más antigua. */
export function openIncidence(p: Pick<Proposal, 'incidences'>): Incidence | null {
  const pending = p.incidences.filter((i) => !i.resolved);
  return pending.find((i) => i.criticality === 'ALTA') ?? pending[0] ?? null;
}
```

- [ ] **Step 4: Implementar los hooks**

`mobile/src/hooks/useProposals.ts`:

```ts
import type { Proposal } from '@hueckoapp/shared';
import { useCallback } from 'react';

import { listGroupProposals } from '../api/proposals';
import { useResource } from './useResource';

const NO_PROPOSALS: Proposal[] = [];

// Propuestas de un grupo, las más recientes primero (el orden lo da el servidor, C10).
export function useProposals(groupId: string) {
  const load = useCallback(() => listGroupProposals(groupId), [groupId]);
  const { data, loaded, loading, refreshing, error, reload } = useResource(load);
  return { proposals: data ?? NO_PROPOSALS, loaded, loading, refreshing, error, reload };
}
```

`mobile/src/hooks/useProposal.ts`:

```ts
import type { IncidenceInput, Proposal, ResolveIncidencesInput, TimeWindowInput } from '@hueckoapp/shared';
import { useCallback } from 'react';

import {
  addWindow as postWindow,
  cancelProposal,
  confirmProposal,
  getProposal,
  removeVote,
  reportIncidence as postIncidence,
  resolveIncidences,
  voteWindow,
} from '../api/proposals';
import { useResource } from './useResource';

export type VoteOutcome = 'voted' | 'unvoted';

// Una propuesta y todo lo que se puede hacer con ella. Cada acción reemplaza la propuesta con la que
// devuelve el servidor (una sola fuente de verdad: B7) y LANZA si falla; la pantalla decide cómo avisar.
export function useProposal(proposalId: string) {
  const load = useCallback(() => getProposal(proposalId), [proposalId]);
  const { data, loading, refreshing, error, reload, mutate } = useResource(load);

  const apply = useCallback(
    (proposal: Proposal) => {
      mutate(() => proposal);
      return proposal;
    },
    [mutate],
  );

  // G1: tocar la franja que ya voté retira el voto (DELETE); cualquier otra lo pone o lo mueve (PUT).
  const myVote = data?.myVoteWindowId ?? null;
  const toggleVote = useCallback(
    async (windowId: string): Promise<VoteOutcome> => {
      const withdraw = myVote === windowId;
      apply(withdraw ? await removeVote(proposalId) : await voteWindow(proposalId, windowId));
      return withdraw ? 'unvoted' : 'voted';
    },
    [myVote, proposalId, apply],
  );

  const addWindow = useCallback(async (input: TimeWindowInput) => apply(await postWindow(proposalId, input)), [proposalId, apply]);
  const confirm = useCallback(async (windowId?: string) => apply(await confirmProposal(proposalId, windowId)), [proposalId, apply]);
  const cancel = useCallback(async () => apply(await cancelProposal(proposalId)), [proposalId, apply]);
  const reportIncidence = useCallback(
    async (input: IncidenceInput) => apply(await postIncidence(proposalId, input)),
    [proposalId, apply],
  );
  const resolve = useCallback(
    async (input: ResolveIncidencesInput) => apply(await resolveIncidences(proposalId, input)),
    [proposalId, apply],
  );

  return { proposal: data, loading, refreshing, error, reload, toggleVote, addWindow, confirm, cancel, reportIncidence, resolve };
}
```

`mobile/src/hooks/useDashboard.ts`:

```ts
import type { Dashboard, TimeBlock } from '@hueckoapp/shared';
import { useCallback } from 'react';

import { getDashboard } from '../api/dashboard';
import { removeVote, voteWindow } from '../api/proposals';
import { listTimeBlocks } from '../api/schedule';
import type { VoteOutcome } from './useProposal';
import { useResource } from './useResource';

export type DashboardData = { dashboard: Dashboard; blocks: TimeBlock[] };

const NO_BLOCKS: TimeBlock[] = [];

// El resumen del servidor y mis bloques (el «horario de hoy» depende de la zona horaria del teléfono)
// en una sola carga: se recargan juntos y un error de cualquiera de los dos es el error de Inicio.
const loadDashboard = async (): Promise<DashboardData> => {
  const [dashboard, blocks] = await Promise.all([getDashboard(), listTimeBlocks()]);
  return { dashboard, blocks };
};

export function useDashboard() {
  const { data, loaded, loading, refreshing, error, reload, mutate } = useResource(loadDashboard);

  // Votar desde «Votaciones en curso»: misma alternancia que en Votar (G1). Lanza si falla.
  const pendingVotes = data?.dashboard.pendingVotes;
  const toggleVote = useCallback(
    async (proposalId: string, windowId: string): Promise<VoteOutcome> => {
      const current = pendingVotes?.find((p) => p.id === proposalId);
      const withdraw = current?.myVoteWindowId === windowId;
      const updated = withdraw ? await removeVote(proposalId) : await voteWindow(proposalId, windowId);
      mutate(
        (prev) =>
          prev && {
            ...prev,
            dashboard: {
              ...prev.dashboard,
              pendingVotes: prev.dashboard.pendingVotes.map((p) => (p.id === updated.id ? { ...updated, groupName: p.groupName } : p)),
            },
          },
      );
      return withdraw ? 'unvoted' : 'voted';
    },
    [pendingVotes, mutate],
  );

  return { dashboard: data?.dashboard, blocks: data?.blocks ?? NO_BLOCKS, loaded, loading, refreshing, error, reload, toggleVote };
}
```

`mobile/src/hooks/useRefreshErrorToast.ts`:

```ts
import { useEffect } from 'react';

import { showToast } from '../utils/toast';

// Si una RECARGA falla con datos ya en pantalla, se avisa con un toast y el contenido se queda como estaba.
// (Si falla la primera carga, LoadState ya muestra el error con «Reintentar».)
export function useRefreshErrorToast(error: string | null, hasData: boolean) {
  useEffect(() => {
    if (error && hasData) showToast(error);
  }, [error, hasData]);
}
```

- [ ] **Step 5: Ejecutar y ver que pasa** — `npm test -w mobile` → PASS (incluidos los de fases anteriores). `npm run typecheck` → sin errores.

- [ ] **Step 6: Commit** — `git add mobile/src/api/proposals.ts mobile/src/api/dashboard.ts mobile/src/api/__tests__/endpoints.test.ts mobile/src/hooks mobile/src/utils/days.ts mobile/src/utils/proposals.ts mobile/src/utils/__tests__/days.test.ts mobile/src/utils/__tests__/proposals.test.ts mobile/src/testing/fixtures.ts` → `feat(mobile): API de propuestas e inicio con hooks useProposal, useProposals y useDashboard`

---

### Task 6: Mobile — selector nativo de fecha/hora y ubicación del teléfono

**Files:**
- Modify: `mobile/package.json`, `package-lock.json` (con `npx expo install`), `mobile/app.json`, `mobile/jest.setup.ts`, `mobile/src/components/index.ts`, `mobile/src/screens/schedule/AddScheduleScreen.tsx`, `mobile/src/screens/schedule/__tests__/AddScheduleScreen.test.tsx`, `mobile/src/utils/days.ts`, `mobile/src/utils/__tests__/days.test.ts`
- Create: `mobile/src/components/DateTimeField.tsx`, `mobile/src/hooks/useCurrentLocation.ts`, `mobile/src/utils/location.ts`, `mobile/src/components/__tests__/DateTimeField.test.tsx`, `mobile/src/hooks/__tests__/useCurrentLocation.test.ts`, `mobile/src/utils/__tests__/location.test.ts`

**Interfaces:**
- Consumes: `today()` (`src/utils/clock.ts`); `formatDateLabel`, `formatDateTime`, `toDateKey`, `parseDateKey` (`src/utils/days.ts`); `showToast`; tipo `Location` de `shared`.
- Produces:
  - `DateTimeField` (exportado en `src/components`): props `{ label: string; value: Date | null; onChange: (value: Date) => void; mode?: 'date' | 'datetime'; minimumDate?: Date; placeholder?: string; error?: string; helperText?: string }`. Se pulsa por `accessibilityLabel = label`. En los tests, el selector nativo mockeado aparece con `testID` `datetimepicker-date` / `datetimepicker-time` y se maneja con `await fireEvent(el, 'change', { type: 'set' }, fecha)` (o `{ type: 'dismissed' }`).
  - `useCurrentLocation()` → `{ locate(): Promise<Location | null>; locating: boolean; error: string | null; clearError(): void }` y `LOCATION_MESSAGES`.
  - `src/utils/location.ts`: `formatPlaceName(address: PlaceAddress): string | null`; `coordinatesLabel(latitude, longitude): string`; `mapsUrl(place: { name: string; latitude: number; longitude: number }, os?: string): string`; `openInMaps(place): Promise<void>`.
  - Mocks globales en `jest.setup.ts` para `@react-native-community/datetimepicker` y `expo-location`.

- [ ] **Step 1: Instalar y configurar** (dentro de `mobile/`):

```bash
cd mobile
npx expo install @react-native-community/datetimepicker
npx expo install expo-location   # ya está en package.json (~57.0.x): solo confirma la versión del SDK
```

En `mobile/app.json`, reemplazar el array `plugins` por (si `expo install` añadió `"@react-native-community/datetimepicker"`, se deja también):

```json
    "plugins": [
      "expo-secure-store",
      [
        "expo-location",
        {
          "locationWhenInUsePermission": "HueckoApp usa tu ubicación para proponer dónde se reúne tu grupo."
        }
      ]
    ]
```

(En Android el plugin añade `ACCESS_COARSE_LOCATION` y `ACCESS_FINE_LOCATION`; el diálogo de permiso lo traduce el sistema. El texto se usa en iOS.)

Añadir al final de `mobile/jest.setup.ts`:

```ts
// Selector nativo de fecha/hora: un View con testID `datetimepicker-<modo>` que conserva sus props,
// para que los tests disparen `onChange` con fireEvent(el, 'change', { type: 'set' }, fecha).
jest.mock('@react-native-community/datetimepicker', () => {
  const { createElement } = require('react');
  const { View } = require('react-native');
  const MockDateTimePicker = (props: { mode?: string }) =>
    createElement(View, { ...props, testID: `datetimepicker-${props.mode ?? 'date'}` });
  return { __esModule: true, default: MockDateTimePicker };
});
// Ubicación: cada test fija lo que devuelve (jest.mocked(ExpoLocation).….mockResolvedValue(...)).
jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: jest.fn(),
  hasServicesEnabledAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn(),
  reverseGeocodeAsync: jest.fn(),
  Accuracy: { Balanced: 3 },
}));
```

- [ ] **Step 2: Escribir los tests que fallan**

`mobile/src/components/__tests__/DateTimeField.test.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react-native';

import { DateTimeField } from '../DateTimeField';

jest.mock('../../utils/clock', () => ({ today: () => new Date(2026, 8, 29, 10, 0) }));

it('sin valor muestra el texto de ayuda y no abre el selector hasta pulsar', async () => {
  await render(<DateTimeField label="Fecha límite de votación" value={null} onChange={jest.fn()} placeholder="Elige fecha y hora" />);
  expect(screen.getByText('Elige fecha y hora')).toBeTruthy();
  expect(screen.queryByTestId('datetimepicker-date')).toBeNull();
});

it('fecha y hora: pide la fecha, después la hora, y devuelve ambas juntas', async () => {
  const onChange = jest.fn();
  const min = new Date(2026, 8, 29, 10, 0);
  await render(<DateTimeField label="Fecha límite de votación" value={null} onChange={onChange} minimumDate={min} />);
  await fireEvent.press(screen.getByLabelText('Fecha límite de votación'));
  const datePicker = screen.getByTestId('datetimepicker-date');
  expect(datePicker.props.minimumDate).toEqual(min);
  await fireEvent(datePicker, 'change', { type: 'set' }, new Date(2026, 9, 2, 0, 0));
  expect(onChange).not.toHaveBeenCalled();
  await fireEvent(screen.getByTestId('datetimepicker-time'), 'change', { type: 'set' }, new Date(2026, 8, 29, 20, 30));
  expect(onChange).toHaveBeenCalledWith(new Date(2026, 9, 2, 20, 30));
  expect(screen.queryByTestId('datetimepicker-time')).toBeNull();
});

it('solo fecha: devuelve la medianoche del día elegido', async () => {
  const onChange = jest.fn();
  await render(<DateTimeField label="Fecha" mode="date" value={new Date(2026, 8, 29)} onChange={onChange} />);
  expect(screen.getByText('Mar 29 sep')).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('Fecha'));
  await fireEvent(screen.getByTestId('datetimepicker-date'), 'change', { type: 'set' }, new Date(2026, 9, 2, 15, 45));
  expect(onChange).toHaveBeenCalledWith(new Date(2026, 9, 2));
  expect(screen.queryByTestId('datetimepicker-time')).toBeNull();
});

it('cerrar el selector sin elegir no cambia nada', async () => {
  const onChange = jest.fn();
  await render(<DateTimeField label="Fecha límite de votación" value={null} onChange={onChange} />);
  await fireEvent.press(screen.getByLabelText('Fecha límite de votación'));
  await fireEvent(screen.getByTestId('datetimepicker-date'), 'change', { type: 'dismissed' });
  expect(onChange).not.toHaveBeenCalled();
  expect(screen.queryByTestId('datetimepicker-date')).toBeNull();
});

it('muestra el valor con fecha y hora, y el error', async () => {
  await render(
    <DateTimeField label="Fecha límite de votación" value={new Date(2026, 9, 2, 20, 0)} onChange={jest.fn()} error="La fecha límite debe ser futura" />,
  );
  expect(screen.getByText('Vie 2 oct, 20:00')).toBeTruthy();
  expect(screen.getByText('La fecha límite debe ser futura')).toBeTruthy();
});
```

`mobile/src/utils/__tests__/location.test.ts`:

```ts
import { Linking } from 'react-native';

import { showToast } from '../toast';
import { coordinatesLabel, formatPlaceName, mapsUrl, openInMaps } from '../location';

jest.mock('../toast', () => ({ showToast: jest.fn() }));

it('formatPlaceName: nombre del sitio (o calle y número) y el distrito o la ciudad, sin repetir', () => {
  expect(formatPlaceName({ name: 'Biblioteca Central', district: 'San Miguel', city: 'Lima' })).toBe('Biblioteca Central, San Miguel');
  expect(formatPlaceName({ name: null, street: 'Av. Universitaria', streetNumber: '1801', district: null, city: 'Lima' })).toBe(
    'Av. Universitaria 1801, Lima',
  );
  expect(formatPlaceName({ name: 'Lima', city: 'Lima' })).toBe('Lima');
  expect(formatPlaceName({ name: null, street: null, city: null })).toBeNull();
});

it('coordinatesLabel con 5 decimales', () => {
  expect(coordinatesLabel(-12.0701, -77.0801)).toBe('Ubicación (-12.07010, -77.08010)');
});

it('mapsUrl: geo: en Android y Google Maps en el resto', () => {
  const place = { name: 'Biblioteca central', latitude: -12.07, longitude: -77.08 };
  expect(mapsUrl(place, 'android')).toBe('geo:-12.07,-77.08?q=-12.07,-77.08(Biblioteca%20central)');
  expect(mapsUrl(place, 'ios')).toBe('https://maps.google.com/?q=-12.07,-77.08');
});

it('openInMaps abre la URL y avisa si no hay app de mapas', async () => {
  const place = { name: 'Biblioteca central', latitude: -12.07, longitude: -77.08 };
  const open = jest.spyOn(Linking, 'openURL').mockResolvedValueOnce(true).mockRejectedValueOnce(new Error('sin app'));
  await openInMaps(place);
  expect(open).toHaveBeenCalledWith(mapsUrl(place));
  expect(showToast).not.toHaveBeenCalled();
  await openInMaps(place);
  expect(showToast).toHaveBeenCalledWith('No se pudo abrir el mapa.');
});
```

`mobile/src/hooks/__tests__/useCurrentLocation.test.ts`:

```ts
import { act, renderHook } from '@testing-library/react-native';
import * as ExpoLocation from 'expo-location';

import { LOCATION_MESSAGES, useCurrentLocation } from '../useCurrentLocation';

// expo-location está mockeado en jest.setup.ts; aquí se fija qué devuelve cada función.
const mocked = jest.mocked(ExpoLocation);

beforeEach(() => {
  jest.clearAllMocks();
  mocked.requestForegroundPermissionsAsync.mockResolvedValue({ granted: true } as any);
  mocked.hasServicesEnabledAsync.mockResolvedValue(true);
  mocked.getCurrentPositionAsync.mockResolvedValue({ coords: { latitude: -12.0701, longitude: -77.0801 } } as any);
  mocked.reverseGeocodeAsync.mockResolvedValue([{ name: 'Biblioteca Central', district: 'San Miguel', city: 'Lima' } as any]);
});

const locate = async () => {
  const { result } = await renderHook(() => useCurrentLocation());
  let found: Awaited<ReturnType<typeof result.current.locate>> = null;
  await act(async () => {
    found = await result.current.locate();
  });
  return { result, found };
};

it('con permiso devuelve un nombre legible y las coordenadas', async () => {
  const { result, found } = await locate();
  expect(found).toEqual({ name: 'Biblioteca Central, San Miguel', latitude: -12.0701, longitude: -77.0801 });
  expect(mocked.getCurrentPositionAsync).toHaveBeenCalledWith({ accuracy: ExpoLocation.Accuracy.Balanced });
  expect(mocked.reverseGeocodeAsync).toHaveBeenCalledWith({ latitude: -12.0701, longitude: -77.0801 });
  expect(result.current.error).toBeNull();
  expect(result.current.locating).toBe(false);
});

it('permiso denegado: null, mensaje y no lee la posición', async () => {
  mocked.requestForegroundPermissionsAsync.mockResolvedValue({ granted: false } as any);
  const { result, found } = await locate();
  expect(found).toBeNull();
  expect(result.current.error).toBe(LOCATION_MESSAGES.denied);
  expect(result.current.error).toBe('Sin permiso de ubicación. Escribe el lugar a mano o actívalo en los ajustes del teléfono.');
  expect(mocked.getCurrentPositionAsync).not.toHaveBeenCalled();
});

it('ubicación del teléfono apagada', async () => {
  mocked.hasServicesEnabledAsync.mockResolvedValue(false);
  const { result, found } = await locate();
  expect(found).toBeNull();
  expect(result.current.error).toBe('La ubicación del teléfono está desactivada. Actívala o escribe el lugar a mano.');
});

it('posición no disponible', async () => {
  mocked.getCurrentPositionAsync.mockRejectedValue(new Error('timeout'));
  const { result, found } = await locate();
  expect(found).toBeNull();
  expect(result.current.error).toBe('No se pudo obtener tu ubicación. Inténtalo de nuevo o escribe el lugar a mano.');
});

it('sin dirección conocida, o si el geocodificador falla, usa las coordenadas como nombre', async () => {
  mocked.reverseGeocodeAsync.mockResolvedValueOnce([]);
  expect((await locate()).found).toEqual({ name: 'Ubicación (-12.07010, -77.08010)', latitude: -12.0701, longitude: -77.0801 });
  mocked.reverseGeocodeAsync.mockRejectedValueOnce(new Error('sin red'));
  expect((await locate()).found?.name).toBe('Ubicación (-12.07010, -77.08010)');
});

it('locating mientras busca; una segunda llamada en curso no repite el permiso', async () => {
  let grant!: (value: unknown) => void;
  mocked.requestForegroundPermissionsAsync.mockReturnValue(new Promise((resolve) => (grant = resolve)) as any);
  const { result } = await renderHook(() => useCurrentLocation());
  let first!: Promise<unknown>;
  let second: unknown;
  await act(async () => {
    first = result.current.locate();
    second = await result.current.locate();
  });
  expect(result.current.locating).toBe(true);
  expect(second).toBeNull();
  await act(async () => {
    grant({ granted: true });
    await first;
  });
  expect(mocked.requestForegroundPermissionsAsync).toHaveBeenCalledTimes(1);
  expect(result.current.locating).toBe(false);
});
```

En `mobile/src/screens/schedule/__tests__/AddScheduleScreen.test.tsx`, reemplazar el test `'un bloque puntual lleva fecha (no día) y tipo PUNTUAL por defecto'` por:

```tsx
it('un bloque puntual lleva fecha (no día), elegida con el selector nativo, y tipo PUNTUAL por defecto', async () => {
  mocked.createTimeBlock.mockResolvedValue({} as any);
  await renderScreen();
  await fireEvent.changeText(screen.getByLabelText('Nombre del bloque'), 'Dentista');
  await fireEvent.press(screen.getByText('Puntual (Única vez)'));
  expect(screen.queryByText('Día de la semana')).toBeNull();
  expect(screen.getByText('Mar 29 sep')).toBeTruthy(); // hoy, por defecto
  await fireEvent.press(screen.getByLabelText('Fecha'));
  expect(screen.getByTestId('datetimepicker-date').props.minimumDate).toEqual(new Date(2026, 8, 29));
  await fireEvent(screen.getByTestId('datetimepicker-date'), 'change', { type: 'set' }, new Date(2026, 9, 2));
  expect(screen.getByText('Vie 2 oct')).toBeTruthy();
  await fireEvent.press(screen.getByText('Guardar bloque'));

  await waitFor(() => expect(mocked.createTimeBlock).toHaveBeenCalled());
  expect(mocked.createTimeBlock).toHaveBeenCalledWith({
    label: 'Dentista', type: 'PUNTUAL', startTime: '08:00', endTime: '09:00',
    isRecurring: false, dayOfWeek: null, date: '2026-10-02',
  });
});
```

En `mobile/src/utils/__tests__/days.test.ts`, borrar el test `'upcomingDates empieza hoy'` y quitar `upcomingDates` del import.

- [ ] **Step 3: Ejecutar y ver que falla** — `npm test -w mobile -- DateTimeField location useCurrentLocation AddSchedule` → FAIL (módulos inexistentes; AddSchedule aún con chips).

- [ ] **Step 4: Implementar**

`mobile/src/components/DateTimeField.tsx`:

```tsx
import { MaterialIcons } from '@expo/vector-icons';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radius, typography } from '../theme';
import { today } from '../utils/clock';
import { formatDateLabel, formatDateTime, toDateKey } from '../utils/days';

type Props = {
  label: string;
  value: Date | null;
  onChange: (value: Date) => void;
  /** 'datetime' pide la fecha y después la hora (en Android son dos diálogos nativos seguidos). */
  mode?: 'date' | 'datetime';
  minimumDate?: Date;
  placeholder?: string;
  error?: string;
  helperText?: string;
};

type Step = 'date' | 'time' | null;

// Campo que abre el selector nativo de fecha/hora (@react-native-community/datetimepicker).
// Sustituye al texto libre de Kotlin para el plazo de votación (UI spec §6 quirk 14) y a los chips de fecha de «Nuevo bloque».
export function DateTimeField({ label, value, onChange, mode = 'datetime', minimumDate, placeholder = 'Elegir', error, helperText }: Props) {
  const [step, setStep] = useState<Step>(null);
  const [pickedDay, setPickedDay] = useState<Date | null>(null);
  const initial = value ?? minimumDate ?? today();

  const close = () => {
    setStep(null);
    setPickedDay(null);
  };

  const handleChange = (event: DateTimePickerEvent, selected?: Date) => {
    if (event.type !== 'set' || !selected) {
      close();
      return;
    }
    if (step === 'date') {
      const day = new Date(selected.getFullYear(), selected.getMonth(), selected.getDate());
      if (mode === 'date') {
        close();
        onChange(day);
        return;
      }
      setPickedDay(day);
      setStep('time');
      return;
    }
    const day = pickedDay ?? initial;
    close();
    onChange(new Date(day.getFullYear(), day.getMonth(), day.getDate(), selected.getHours(), selected.getMinutes()));
  };

  const text = value ? (mode === 'date' ? formatDateLabel(toDateKey(value)) : formatDateTime(value)) : placeholder;

  return (
    <View>
      <Text style={[typography.labelMedium, { color: colors.onSurfaceVariant }]}>{label}</Text>
      <View style={{ height: 6 }} />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={() => setStep('date')}
        style={[styles.field, { borderColor: error ? colors.error : colors.outlineVariant, borderWidth: error ? 2 : 1 }]}
      >
        <MaterialIcons name={mode === 'date' ? 'event' : 'schedule'} size={20} color={colors.onSurfaceVariant} />
        <Text style={[typography.bodyLarge, styles.value, { color: value ? colors.onSurface : colors.outline }]}>{text}</Text>
      </Pressable>
      {error ? (
        <Text accessibilityLiveRegion="polite" style={[typography.bodySmall, styles.hint, { color: colors.error }]}>
          {error}
        </Text>
      ) : helperText ? (
        <Text style={[typography.bodySmall, styles.hint, { color: colors.onSurfaceVariant }]}>{helperText}</Text>
      ) : null}
      {step ? (
        <DateTimePicker
          value={initial}
          mode={step}
          is24Hour
          display="default"
          minimumDate={step === 'date' ? minimumDate : undefined}
          onChange={handleChange}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 56, borderRadius: radius.xxl, paddingHorizontal: 12 },
  value: { flex: 1 },
  hint: { marginTop: 4 },
});
```

En `mobile/src/components/index.ts` añadir `export { DateTimeField } from './DateTimeField';`.

`mobile/src/utils/location.ts`:

```ts
import { Linking, Platform } from 'react-native';

import { showToast } from './toast';

// Campos de LocationGeocodedAddress (expo-location) que sirven para nombrar un sitio.
export type PlaceAddress = {
  name?: string | null;
  street?: string | null;
  streetNumber?: string | null;
  district?: string | null;
  city?: string | null;
  region?: string | null;
};

/** «Biblioteca Central, San Miguel» o «Av. Universitaria 1801, Lima». null si la dirección no trae nada útil. */
export function formatPlaceName(address: PlaceAddress): string | null {
  const street = address.street ? [address.street, address.streetNumber].filter(Boolean).join(' ') : null;
  const first = address.name || street;
  const second = address.district || address.city || address.region;
  const parts = [first, second].filter((part): part is string => !!part && part.trim().length > 0);
  const unique = parts.filter((part, index) => parts.indexOf(part) === index);
  return unique.length > 0 ? unique.join(', ') : null;
}

export const coordinatesLabel = (latitude: number, longitude: number) =>
  `Ubicación (${latitude.toFixed(5)}, ${longitude.toFixed(5)})`;

type MappablePlace = { name: string; latitude: number; longitude: number };

/** En Android, un intent `geo:` (abre la app de mapas que haya); en el resto, Google Maps en la web. */
export function mapsUrl(place: MappablePlace, os: string = Platform.OS): string {
  const coords = `${place.latitude},${place.longitude}`;
  if (os === 'android') return `geo:${coords}?q=${coords}(${encodeURIComponent(place.name)})`;
  return `https://maps.google.com/?q=${coords}`;
}

export async function openInMaps(place: MappablePlace): Promise<void> {
  try {
    await Linking.openURL(mapsUrl(place));
  } catch {
    showToast('No se pudo abrir el mapa.');
  }
}
```

`mobile/src/hooks/useCurrentLocation.ts`:

```ts
import type { Location } from '@hueckoapp/shared';
import * as ExpoLocation from 'expo-location';
import { useCallback, useEffect, useRef, useState } from 'react';

import { coordinatesLabel, formatPlaceName } from '../utils/location';

export const LOCATION_MESSAGES = {
  denied: 'Sin permiso de ubicación. Escribe el lugar a mano o actívalo en los ajustes del teléfono.',
  servicesOff: 'La ubicación del teléfono está desactivada. Actívala o escribe el lugar a mano.',
  unavailable: 'No se pudo obtener tu ubicación. Inténtalo de nuevo o escribe el lugar a mano.',
} as const;

// «Usar mi ubicación actual» (tema del curso: localización en Android). Pide el permiso de ubicación en primer
// plano, lee la posición y la traduce a un nombre legible con la geocodificación inversa del sistema.
// Nunca lanza: si algo falla devuelve null y deja el motivo en `error`.
export function useCurrentLocation() {
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const locate = useCallback(async (): Promise<Location | null> => {
    if (busy.current) return null;
    busy.current = true;
    setLocating(true);
    setError(null);
    const fail = (message: string) => {
      if (mounted.current) setError(message);
      return null;
    };
    try {
      const { granted } = await ExpoLocation.requestForegroundPermissionsAsync();
      if (!granted) return fail(LOCATION_MESSAGES.denied);
      if (!(await ExpoLocation.hasServicesEnabledAsync())) return fail(LOCATION_MESSAGES.servicesOff);

      const position = await ExpoLocation.getCurrentPositionAsync({ accuracy: ExpoLocation.Accuracy.Balanced }).catch(() => null);
      if (!position) return fail(LOCATION_MESSAGES.unavailable);
      const { latitude, longitude } = position.coords;

      // Si el geocodificador falla o no conoce el sitio, el nombre son las coordenadas.
      let name: string | null = null;
      try {
        const [address] = await ExpoLocation.reverseGeocodeAsync({ latitude, longitude });
        name = address ? formatPlaceName(address) : null;
      } catch {
        name = null;
      }
      return { name: name ?? coordinatesLabel(latitude, longitude), latitude, longitude };
    } catch {
      return fail(LOCATION_MESSAGES.unavailable);
    } finally {
      busy.current = false;
      if (mounted.current) setLocating(false);
    }
  }, []);

  const clearError = useCallback(() => setError(null), []);

  return { locate, locating, error, clearError };
}
```

`mobile/src/screens/schedule/AddScheduleScreen.tsx` — la fecha del puntual pasa al selector nativo:
1. Imports: quitar `useMemo` de `react`; en `../../components` añadir `DateTimeField`; en `../../utils/days` dejar `import { dayLong, dayShort, parseDateKey, toDateKey, WEEK_DAYS } from '../../utils/days';`.
2. Borrar la constante `PUNCTUAL_DAYS_AHEAD` y la línea `const dates = useMemo(...)`. Sustituir `const [date, setDate] = useState(dates[0]);` por:

```tsx
  const [date, setDate] = useState(() => toDateKey(now));
  // Un puntual no puede caer antes de hoy.
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
```

3. Reemplazar el bloque `) : ( <View style={styles.section}> <FieldLabel>Fecha</FieldLabel> <ScrollView …> … </ScrollView> </View> )}` por:

```tsx
        ) : (
          <DateTimeField
            label="Fecha"
            mode="date"
            value={parseDateKey(date)}
            minimumDate={startOfToday}
            onChange={(value) => setDate(toDateKey(value))}
          />
        )}
```

`mobile/src/utils/days.ts` — borrar `upcomingDates` (ya nadie lo usa). `formatDateLabel` se queda (lo usan otros).

- [ ] **Step 5: Ejecutar y ver que pasa** — `npm test -w mobile` → PASS. `npm run typecheck` → sin errores.

- [ ] **Step 6: Commit** — `git add mobile/package.json package-lock.json mobile/app.json mobile/jest.setup.ts mobile/src/components/DateTimeField.tsx mobile/src/components/index.ts mobile/src/components/__tests__/DateTimeField.test.tsx mobile/src/hooks/useCurrentLocation.ts mobile/src/hooks/__tests__/useCurrentLocation.test.ts mobile/src/utils/location.ts mobile/src/utils/__tests__/location.test.ts mobile/src/utils/days.ts mobile/src/utils/__tests__/days.test.ts mobile/src/screens/schedule` → `feat(mobile): selector nativo de fecha y hora y ubicación actual con expo-location`

---

### Task 7: Mobile — pestaña «Planes» y «Nueva propuesta»

**Files:**
- Modify: `mobile/src/navigation/types.ts`, `mobile/src/navigation/RootNavigator.tsx`, `mobile/src/components/SecondaryButton.tsx`, `mobile/src/components/index.ts`, `mobile/src/components/__tests__/components.test.tsx`, `mobile/src/screens/groups/tabs/PlansTab.tsx`, `mobile/src/screens/groups/GroupDetailScreen.tsx`, `mobile/src/screens/groups/__tests__/GroupDetailScreen.test.tsx`
- Create: `mobile/src/components/ProposalStateBadge.tsx`, `mobile/src/screens/proposals/WindowEditor.tsx`, `mobile/src/screens/proposals/CreateProposalScreen.tsx`, `mobile/src/screens/groups/__tests__/PlansTab.test.tsx`, `mobile/src/screens/proposals/__tests__/CreateProposalScreen.test.tsx`

**Interfaces:**
- Consumes: `createProposal` (Task 5); `useProposals`, `useRefreshErrorToast` (Task 5); `useCurrentLocation`, `DateTimeField` (Task 6); `STATE_BADGE`, `windowLabel`, `deadlineLabel`, `scheduleLabel`, `isVotingOpen` (Task 5); `useAction`, `useRefreshOnFocus`, `DaySelector`, `TextField`, `ChoiceChip`, `PrimaryButton`, `ErrorBanner`, `HueckoCard`, `LoadState`; `startTimeHint`, `endTimeHint`, `isValidRange` (`src/utils/time.ts`); fixtures.
- Produces:
  - `AppStackParamList` + `CreateProposal: { groupId: string; groupName: string }`, `Voting: { proposalId: string }`, `PlanDetail: { proposalId: string }` (Task 8 registra las dos últimas en el stack).
  - `SecondaryButton` con `disabled?: boolean`.
  - `ProposalStateBadge({ state }: { state: ProposalState })` (exportado en `src/components`).
  - `WindowEditor` (`src/screens/proposals/WindowEditor.tsx`): props `{ submitLabel: string; onSubmit: (window: TimeWindowInput) => void; existing?: readonly TimeWindowInput[]; loading?: boolean; variant?: 'primary' | 'secondary' }`; `DUPLICATE_WINDOW = 'Esa franja ya está en la lista.'`. Campos con etiqueta «Hora de inicio (HH:mm)» y «Hora de fin (HH:mm)»; valores iniciales lunes 09:00–11:00. Task 8 lo reutiliza en «Agregar franja horaria».
  - `PlansTab({ groupId, groupName })`; `CreateProposalScreen` (ruta `CreateProposal`).

- [ ] **Step 1: Escribir los tests que fallan**

En `mobile/src/components/__tests__/components.test.tsx`, añadir `ProposalStateBadge` y `SecondaryButton` al import de `'..'` y al final:

```tsx
describe('SecondaryButton', () => {
  it('responde si está habilitado y no si está deshabilitado', async () => {
    const onPress = jest.fn();
    await render(<SecondaryButton title="Añadir franja" onPress={onPress} />);
    await fireEvent.press(screen.getByText('Añadir franja'));
    expect(onPress).toHaveBeenCalledTimes(1);
    await render(<SecondaryButton title="Añadir otra" onPress={onPress} disabled />);
    await fireEvent.press(screen.getByText('Añadir otra'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});

describe('ProposalStateBadge', () => {
  it('pinta el estado con tildes', async () => {
    await render(<ProposalStateBadge state="PROPUESTO" />);
    expect(screen.getByText('En votación')).toBeTruthy();
  });
});
```

`mobile/src/screens/groups/__tests__/PlansTab.test.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react-native';

import * as proposalsApi from '../../../api/proposals';
import { makeConfirmed, makeProposal } from '../../../testing/fixtures';
import { PlansTab } from '../tabs/PlansTab';

jest.mock('../../../api/proposals');
jest.mock('../../../hooks/useRefreshOnFocus', () => ({ useRefreshOnFocus: jest.fn() }));
jest.mock('../../../utils/toast', () => ({ showToast: jest.fn() }));
jest.mock('../../../utils/clock', () => ({ today: () => new Date(2026, 8, 29, 10, 0) }));
const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({ navigate: mockNavigate }),
}));

const mocked = proposalsApi as jest.Mocked<typeof proposalsApi>;

beforeEach(() => jest.clearAllMocks());

it('lista las propuestas no canceladas con su estado, su plazo o su fecha, y navega', async () => {
  mocked.listGroupProposals.mockResolvedValue([
    makeProposal(),
    makeConfirmed(),
    makeProposal({ id: 'p3', title: 'Plan cancelado', state: 'CANCELADO' }),
  ]);
  await render(<PlansTab groupId="g1" groupName="Proyecto Integrador" />);

  expect(await screen.findByText('Repaso antes de la entrega')).toBeTruthy();
  expect(screen.getByText('Google Meet')).toBeTruthy();
  expect(screen.getByText('En votación')).toBeTruthy();
  expect(screen.getByText('Cierra: Mar 29 sep, 20:00')).toBeTruthy();
  expect(screen.getByText('Reunión de avance del proyecto')).toBeTruthy();
  expect(screen.getByText('Confirmado')).toBeTruthy();
  expect(screen.getByText('Mié 30 sep · 11:00 - 13:00')).toBeTruthy();
  expect(screen.queryByText('Plan cancelado')).toBeNull();
  // G3: sin botón «Votación» ni «Llamadas a la votación».
  expect(screen.queryByText('Votación')).toBeNull();
  expect(screen.queryByText('Llamadas a la votación')).toBeNull();

  await fireEvent.press(screen.getAllByText('Ver detalles')[1]);
  expect(mockNavigate).toHaveBeenCalledWith('PlanDetail', { proposalId: 'prop_1' });
  // «Votar» solo aparece en la que sigue abierta.
  expect(screen.getAllByText('Votar')).toHaveLength(1);
  await fireEvent.press(screen.getByText('Votar'));
  expect(mockNavigate).toHaveBeenCalledWith('Voting', { proposalId: 'prop_2' });
  await fireEvent.press(screen.getByText('Crear propuesta'));
  expect(mockNavigate).toHaveBeenCalledWith('CreateProposal', { groupId: 'g1', groupName: 'Proyecto Integrador' });
});

it('sin propuestas muestra el texto vacío (con tildes)', async () => {
  mocked.listGroupProposals.mockResolvedValue([]);
  await render(<PlansTab groupId="g1" groupName="Proyecto Integrador" />);
  expect(await screen.findByText('Nadie ha propuesto un plan todavía.')).toBeTruthy();
});
```

En `mobile/src/screens/groups/__tests__/GroupDetailScreen.test.tsx`, añadir junto a los otros mocks (la pestaña «Planes» ya no es un marcador y cargaría de la API):

```tsx
jest.mock('../../../hooks/useProposals', () => ({
  useProposals: () => ({ proposals: [], loaded: true, loading: false, refreshing: false, error: null, reload: jest.fn() }),
}));
```

`mobile/src/screens/proposals/__tests__/CreateProposalScreen.test.tsx`:

```tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { ApiError } from '../../../api/client';
import * as proposalsApi from '../../../api/proposals';
import { makeProposal } from '../../../testing/fixtures';
import { showToast } from '../../../utils/toast';
import { CreateProposalScreen } from '../CreateProposalScreen';

jest.mock('../../../api/proposals');
jest.mock('../../../utils/toast', () => ({ showToast: jest.fn() }));
jest.mock('../../../utils/clock', () => ({ today: () => new Date(2026, 8, 29, 10, 0) }));
const mockLocate = jest.fn();
jest.mock('../../../hooks/useCurrentLocation', () => ({
  useCurrentLocation: () => ({ locate: mockLocate, locating: false, error: null, clearError: () => {} }),
}));

const mocked = proposalsApi as jest.Mocked<typeof proposalsApi>;
const navigation = { goBack: jest.fn() } as any;
const route = { key: 'k', name: 'CreateProposal', params: { groupId: 'g1', groupName: 'Proyecto Integrador' } } as any;
const renderScreen = () => render(<CreateProposalScreen navigation={navigation} route={route} />);

// Elige fecha y hora en los dos pasos del selector nativo (mockeado en jest.setup.ts).
const pickDeadline = async (date: Date) => {
  await fireEvent.press(screen.getByLabelText('Fecha límite de votación'));
  await fireEvent(screen.getByTestId('datetimepicker-date'), 'change', { type: 'set' }, date);
  await fireEvent(screen.getByTestId('datetimepicker-time'), 'change', { type: 'set' }, date);
};

beforeEach(() => {
  jest.clearAllMocks();
  mocked.createProposal.mockResolvedValue(makeProposal());
});

it('crea con «las 3 mejores» por defecto, con el título recortado, y vuelve atrás', async () => {
  await renderScreen();
  expect(screen.getByText('Para «Proyecto Integrador»')).toBeTruthy();
  await fireEvent.changeText(screen.getByLabelText('Título del plan'), '  Repaso antes de la entrega ');
  await fireEvent.changeText(screen.getByLabelText('Lugar (opcional)'), 'Google Meet');
  await pickDeadline(new Date(2026, 9, 2, 20, 0));
  expect(screen.getByText('Vie 2 oct, 20:00')).toBeTruthy();
  await fireEvent.press(screen.getByText('Crear propuesta'));

  await waitFor(() => expect(navigation.goBack).toHaveBeenCalled());
  expect(mocked.createProposal).toHaveBeenCalledWith('g1', {
    title: 'Repaso antes de la entrega',
    location: { name: 'Google Meet', latitude: null, longitude: null },
    votingDeadline: new Date(2026, 9, 2, 20, 0).toISOString(),
    windows: [],
  });
  expect(showToast).toHaveBeenCalledWith('Propuesta creada.');
});

it('«Usar mi ubicación actual» rellena el lugar con coordenadas', async () => {
  mockLocate.mockResolvedValue({ name: 'Biblioteca Central, San Miguel', latitude: -12.07, longitude: -77.08 });
  await renderScreen();
  await fireEvent.changeText(screen.getByLabelText('Título del plan'), 'Estudiar');
  await pickDeadline(new Date(2026, 9, 2, 20, 0));
  await fireEvent.press(screen.getByText('Usar mi ubicación actual'));
  await waitFor(() => expect(screen.getByLabelText('Lugar (opcional)').props.value).toBe('Biblioteca Central, San Miguel'));
  expect(screen.getByText('Con coordenadas: se podrá abrir en el mapa.')).toBeTruthy();
  await fireEvent.press(screen.getByText('Crear propuesta'));
  await waitFor(() => expect(mocked.createProposal).toHaveBeenCalledTimes(1));
  expect(mocked.createProposal.mock.calls[0][1].location).toEqual({ name: 'Biblioteca Central, San Miguel', latitude: -12.07, longitude: -77.08 });
});

it('escribir el lugar a mano descarta las coordenadas', async () => {
  mockLocate.mockResolvedValue({ name: 'Biblioteca Central, San Miguel', latitude: -12.07, longitude: -77.08 });
  await renderScreen();
  await fireEvent.changeText(screen.getByLabelText('Título del plan'), 'Estudiar');
  await pickDeadline(new Date(2026, 9, 2, 20, 0));
  await fireEvent.press(screen.getByText('Usar mi ubicación actual'));
  await waitFor(() => expect(screen.getByLabelText('Lugar (opcional)').props.value).toBe('Biblioteca Central, San Miguel'));
  await fireEvent.changeText(screen.getByLabelText('Lugar (opcional)'), 'Biblioteca Central');
  await fireEvent.press(screen.getByText('Crear propuesta'));
  await waitFor(() => expect(mocked.createProposal).toHaveBeenCalledTimes(1));
  expect(mocked.createProposal.mock.calls[0][1].location).toEqual({ name: 'Biblioteca Central', latitude: null, longitude: null });
});

it('guarda: con el plazo en el pasado no envía desde el teclado; control positivo con un plazo futuro', async () => {
  await renderScreen();
  await fireEvent.changeText(screen.getByLabelText('Título del plan'), 'Estudiar');
  await pickDeadline(new Date(2026, 8, 29, 9, 0));
  expect(screen.getByText('La fecha límite debe ser futura')).toBeTruthy();
  await fireEvent(screen.getByLabelText('Título del plan'), 'submitEditing');
  expect(mocked.createProposal).not.toHaveBeenCalled();

  await pickDeadline(new Date(2026, 9, 2, 20, 0));
  await fireEvent(screen.getByLabelText('Título del plan'), 'submitEditing');
  await waitFor(() => expect(mocked.createProposal).toHaveBeenCalledTimes(1));
});

it('franjas elegidas a mano: valida las horas, no las repite y las envía', async () => {
  await renderScreen();
  await fireEvent.changeText(screen.getByLabelText('Título del plan'), 'Estudiar');
  await pickDeadline(new Date(2026, 9, 2, 20, 0));
  await fireEvent.press(screen.getByText('Elegir yo las franjas'));
  // Guarda: sin ninguna franja no se envía.
  await fireEvent(screen.getByLabelText('Título del plan'), 'submitEditing');
  expect(mocked.createProposal).not.toHaveBeenCalled();

  await fireEvent.changeText(screen.getByLabelText('Hora de fin (HH:mm)'), '08:00');
  expect(screen.getByText('Debe ser posterior')).toBeTruthy();
  await fireEvent(screen.getByLabelText('Hora de fin (HH:mm)'), 'submitEditing');
  expect(screen.queryByText('Lun · 09:00 - 08:00')).toBeNull();

  await fireEvent.changeText(screen.getByLabelText('Hora de fin (HH:mm)'), '11:00');
  await fireEvent.press(screen.getByText('Añadir franja'));
  expect(screen.getByText('Lun · 09:00 - 11:00')).toBeTruthy();
  expect(screen.getByText('Esa franja ya está en la lista.')).toBeTruthy();
  await fireEvent.press(screen.getByText('Vie'));
  await fireEvent.press(screen.getByText('Añadir franja'));
  expect(screen.getByText('Vie · 09:00 - 11:00')).toBeTruthy();

  await fireEvent.press(screen.getByText('Crear propuesta'));
  await waitFor(() => expect(mocked.createProposal).toHaveBeenCalledTimes(1));
  expect(mocked.createProposal.mock.calls[0][1].windows).toEqual([
    { dayOfWeek: 1, startTime: '09:00', endTime: '11:00' },
    { dayOfWeek: 5, startTime: '09:00', endTime: '11:00' },
  ]);
});

it('muestra el error del servidor y se queda en la pantalla', async () => {
  mocked.createProposal.mockRejectedValue(new ApiError(403, 'NOT_A_MEMBER', 'No perteneces a este grupo.'));
  await renderScreen();
  await fireEvent.changeText(screen.getByLabelText('Título del plan'), 'Estudiar');
  await pickDeadline(new Date(2026, 9, 2, 20, 0));
  await fireEvent.press(screen.getByText('Crear propuesta'));
  expect(await screen.findByText('No perteneces a este grupo.')).toBeTruthy();
  expect(navigation.goBack).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Ejecutar y ver que falla** — `npm test -w mobile -- components PlansTab GroupDetail CreateProposal` → FAIL (módulos y props inexistentes).

- [ ] **Step 3: Componentes**

`mobile/src/components/SecondaryButton.tsx` — reemplazar completo:

```tsx
import { MaterialIcons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, radius, typography } from '../theme';
import type { IconName } from './icons';

type Props = {
  title: string;
  onPress: () => void;
  icon?: IconName;
  style?: StyleProp<ViewStyle>;
  color?: string;
  disabled?: boolean;
};

export function SecondaryButton({ title, onPress, icon, style, color, disabled = false }: Props) {
  const tint = disabled ? colors.disabledContent : (color ?? colors.primary);
  const border = disabled ? colors.disabledContainer : (color ?? colors.outline);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[styles.button, { borderColor: border }, style]}
    >
      <View style={styles.row}>
        {icon ? (
          <>
            <MaterialIcons name={icon} size={18} color={tint} />
            <View style={{ width: 8 }} />
          </>
        ) : null}
        <Text numberOfLines={1} style={[typography.labelMedium, { color: tint }]}>
          {title}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    height: 48,
    borderRadius: radius.xxl,
    borderWidth: 1,
    backgroundColor: colors.surfaceContainerLowest,
    paddingHorizontal: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
});
```

`mobile/src/components/ProposalStateBadge.tsx`:

```tsx
import type { ProposalState } from '@hueckoapp/shared';

import { STATE_BADGE } from '../utils/proposals';
import { Badge } from './Badge';

export function ProposalStateBadge({ state }: { state: ProposalState }) {
  const badge = STATE_BADGE[state];
  return <Badge text={badge.text} containerColor={badge.container} contentColor={badge.content} />;
}
```

En `mobile/src/components/index.ts` añadir `export { ProposalStateBadge } from './ProposalStateBadge';`.

- [ ] **Step 4: Navegación** — `mobile/src/navigation/types.ts`, en `AppStackParamList` debajo de `GroupDetail`:

```ts
  CreateProposal: { groupId: string; groupName: string };
  Voting: { proposalId: string };
  PlanDetail: { proposalId: string };
```

`mobile/src/navigation/RootNavigator.tsx` — importar `import { CreateProposalScreen } from '../screens/proposals/CreateProposalScreen';` y registrar debajo de `GroupDetail`:

```tsx
      <AppStack.Screen name="CreateProposal" component={CreateProposalScreen} options={{ title: 'Nueva propuesta' }} />
```

- [ ] **Step 5: Editor de franjas** — `mobile/src/screens/proposals/WindowEditor.tsx`:

```tsx
import type { TimeWindowInput } from '@hueckoapp/shared';
import { useRef, useState } from 'react';
import { StyleSheet, Text, View, type TextInput } from 'react-native';

import { DaySelector, PrimaryButton, SecondaryButton, TextField } from '../../components';
import { colors, typography } from '../../theme';
import { endTimeHint, isValidRange, startTimeHint } from '../../utils/time';

type Props = {
  submitLabel: string;
  onSubmit: (window: TimeWindowInput) => void;
  /** Franjas que ya están: no se deja repetir una idéntica (el servidor respondería 409). */
  existing?: readonly TimeWindowInput[];
  loading?: boolean;
  variant?: 'primary' | 'secondary';
};

export const DUPLICATE_WINDOW = 'Esa franja ya está en la lista.';

// Día + hora de inicio y fin, con la misma validación que «Nuevo bloque» (arregla UI spec §6 quirk 13).
// Valores iniciales de AddWindowBottomSheet (UI spec §2.7): lunes, 09:00–11:00.
export function WindowEditor({ submitLabel, onSubmit, existing = [], loading = false, variant = 'primary' }: Props) {
  const [dayOfWeek, setDayOfWeek] = useState(1);
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('11:00');
  const endRef = useRef<TextInput>(null);

  const startHint = startTimeHint(startTime);
  const endHint = endTimeHint(startTime, endTime);
  const duplicate = existing.some((w) => w.dayOfWeek === dayOfWeek && w.startTime === startTime && w.endTime === endTime);
  const valid = isValidRange(startTime, endTime) && !duplicate;

  const submit = () => {
    if (!valid || loading) return;
    onSubmit({ dayOfWeek, startTime, endTime });
  };

  return (
    <View style={styles.editor}>
      <DaySelector selected={dayOfWeek} onSelect={setDayOfWeek} captionFor={() => ''} />
      <View style={styles.row}>
        <View style={styles.flex}>
          <TextField
            label="Hora de inicio (HH:mm)"
            value={startTime}
            onChangeText={setStartTime}
            placeholder="09:00"
            keyboardType="numbers-and-punctuation"
            maxLength={5}
            returnKeyType="next"
            onSubmitEditing={() => endRef.current?.focus()}
            error={startHint.error ? startHint.text : undefined}
          />
        </View>
        <View style={styles.flex}>
          <TextField
            label="Hora de fin (HH:mm)"
            inputRef={endRef}
            value={endTime}
            onChangeText={setEndTime}
            placeholder="11:00"
            keyboardType="numbers-and-punctuation"
            maxLength={5}
            returnKeyType="done"
            onSubmitEditing={submit}
            error={endHint.error ? endHint.text : undefined}
          />
        </View>
      </View>
      {duplicate ? <Text style={[typography.bodySmall, { color: colors.error }]}>{DUPLICATE_WINDOW}</Text> : null}
      {variant === 'primary' ? (
        <PrimaryButton title={submitLabel} onPress={submit} disabled={!valid} loading={loading} />
      ) : (
        <SecondaryButton title={submitLabel} icon="add" onPress={submit} disabled={!valid || loading} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  editor: { gap: 12 },
  row: { flexDirection: 'row', gap: 10 },
  flex: { flex: 1 },
});
```

- [ ] **Step 6: Pestaña «Planes»** — `mobile/src/screens/groups/tabs/PlansTab.tsx` (reemplazar completo; UI spec §2.6 puntos 3 y 5, sin el botón «Votación» ni «Llamadas a la votación», G3):

```tsx
import type { Proposal } from '@hueckoapp/shared';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { HueckoCard, LoadState, ProposalStateBadge, SecondaryButton } from '../../../components';
import { useProposals } from '../../../hooks/useProposals';
import { useRefreshErrorToast } from '../../../hooks/useRefreshErrorToast';
import { useRefreshOnFocus } from '../../../hooks/useRefreshOnFocus';
import type { AppStackParamList } from '../../../navigation/types';
import { colors, typography } from '../../../theme';
import { today } from '../../../utils/clock';
import { deadlineLabel, isVotingOpen, scheduleLabel } from '../../../utils/proposals';

type Props = { groupId: string; groupName: string };

function TextButton({ title, onPress }: { title: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.textButton}>
      <Text style={[typography.labelLarge, { color: colors.primary }]}>{title}</Text>
    </Pressable>
  );
}

type CardProps = { proposal: Proposal; now: Date; onDetails: () => void; onVote?: () => void };

// PlanCard (UI spec §2.6): título, lugar, plazo (o fecha si está confirmado) y estado.
function PlanCard({ proposal, now, onDetails, onVote }: CardProps) {
  const when = scheduleLabel(proposal) ?? deadlineLabel(proposal.votingDeadline, now);
  return (
    <HueckoCard>
      <View style={styles.cardRow}>
        <View style={styles.flex}>
          <Text style={[typography.titleMedium, { color: colors.onSurface }]}>{proposal.title}</Text>
          {proposal.location ? <Text style={[typography.bodySmall, styles.location]}>{proposal.location.name}</Text> : null}
          <Text style={[typography.bodySmall, styles.when]}>{when}</Text>
        </View>
        <ProposalStateBadge state={proposal.state} />
      </View>
      <View style={styles.cardActions}>
        <TextButton title="Ver detalles" onPress={onDetails} />
        {onVote ? <TextButton title="Votar" onPress={onVote} /> : null}
      </View>
    </HueckoCard>
  );
}

// «Planes» del grupo: las propuestas que no están canceladas (D7, igual que proposalsOf en Kotlin).
export function PlansTab({ groupId, groupName }: Props) {
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const { proposals, loaded, loading, refreshing, error, reload } = useProposals(groupId);
  // Al volver de «Nueva propuesta», «Votar» o «Detalle del plan» se recarga la lista.
  useRefreshOnFocus(reload);
  useRefreshErrorToast(error, loaded);
  const now = today();
  const visible = proposals.filter((p) => p.state !== 'CANCELADO');

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void reload()} colors={[colors.primary]} />}
    >
      <SecondaryButton title="Crear propuesta" icon="add" onPress={() => navigation.navigate('CreateProposal', { groupId, groupName })} />
      <Text style={[typography.titleMedium, { color: colors.onSurface }]}>Planes propuestos</Text>
      <LoadState loading={loading} error={error} hasData={loaded} onRetry={() => void reload()}>
        {visible.length === 0 ? (
          <Text style={[typography.bodyMedium, { color: colors.onSurfaceVariant }]}>Nadie ha propuesto un plan todavía.</Text>
        ) : (
          visible.map((proposal) => (
            <PlanCard
              key={proposal.id}
              proposal={proposal}
              now={now}
              onDetails={() => navigation.navigate('PlanDetail', { proposalId: proposal.id })}
              onVote={isVotingOpen(proposal, now) ? () => navigation.navigate('Voting', { proposalId: proposal.id }) : undefined}
            />
          ))
        )}
      </LoadState>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: { flex: 1, backgroundColor: colors.surface },
  content: { padding: 16, gap: 16 },
  cardRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  location: { color: colors.onSurfaceVariant, marginTop: 2 },
  when: { color: colors.onSurfaceVariant, marginTop: 4 },
  cardActions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  textButton: { minHeight: 40, justifyContent: 'center', paddingRight: 12 },
});
```

`mobile/src/screens/groups/GroupDetailScreen.tsx` — cambiar `{() => <PlansTab groupId={group.id} />}` por `{() => <PlansTab groupId={group.id} groupName={group.name} />}`.

- [ ] **Step 7: «Nueva propuesta»** — `mobile/src/screens/proposals/CreateProposalScreen.tsx` (UI spec §2.6 CreatePlanBottomSheet como pantalla apilada, D8; copy con tildes, §7; plazo con selector nativo, quirk 14; lugar con `expo-location`):

```tsx
import { MaterialIcons } from '@expo/vector-icons';
import type { TimeWindowInput } from '@hueckoapp/shared';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { createProposal } from '../../api/proposals';
import { ChoiceChip, DateTimeField, ErrorBanner, PrimaryButton, SecondaryButton, TextField } from '../../components';
import { useAction } from '../../hooks/useAction';
import { useCurrentLocation } from '../../hooks/useCurrentLocation';
import type { AppStackScreen } from '../../navigation/types';
import { colors, typography } from '../../theme';
import { today } from '../../utils/clock';
import { windowLabel } from '../../utils/proposals';
import { showToast } from '../../utils/toast';
import { WindowEditor } from './WindowEditor';

type Coords = { latitude: number; longitude: number };

function FieldLabel({ children }: { children: string }) {
  return <Text style={[typography.labelMedium, { color: colors.onSurfaceVariant }]}>{children}</Text>;
}

export function CreateProposalScreen({ navigation, route }: AppStackScreen<'CreateProposal'>) {
  const { groupId, groupName } = route.params;
  const [now] = useState(today);
  const [title, setTitle] = useState('');
  const [placeName, setPlaceName] = useState('');
  const [coords, setCoords] = useState<Coords | null>(null);
  const [deadline, setDeadline] = useState<Date | null>(null);
  const [auto, setAuto] = useState(true);
  const [windows, setWindows] = useState<TimeWindowInput[]>([]);
  const location = useCurrentLocation();
  const save = useAction(createProposal);

  const deadlineError = deadline && deadline.getTime() <= now.getTime() ? 'La fecha límite debe ser futura' : undefined;
  const formValid = title.trim().length > 0 && deadline !== null && !deadlineError && (auto || windows.length > 0);

  // Escribir el lugar a mano descarta las coordenadas de «Usar mi ubicación actual».
  const changePlace = (text: string) => {
    setPlaceName(text);
    setCoords(null);
    location.clearError();
  };

  const fillWithMyLocation = async () => {
    const found = await location.locate();
    if (!found) return;
    setPlaceName(found.name);
    setCoords(found.latitude !== null && found.longitude !== null ? { latitude: found.latitude, longitude: found.longitude } : null);
  };

  const submit = async () => {
    if (!formValid || !deadline) return;
    const name = placeName.trim();
    const result = await save.run(groupId, {
      title: title.trim(),
      location: name ? { name, latitude: coords?.latitude ?? null, longitude: coords?.longitude ?? null } : null,
      votingDeadline: deadline.toISOString(),
      windows: auto ? [] : windows,
    });
    if (result.ok) {
      showToast('Propuesta creada.');
      navigation.goBack();
    }
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={[typography.bodyMedium, { color: colors.onSurfaceVariant }]}>{`Para «${groupName}»`}</Text>

        <TextField
          label="Título del plan"
          value={title}
          onChangeText={setTitle}
          placeholder="Repaso antes de la entrega"
          maxLength={80}
          autoCapitalize="sentences"
          returnKeyType="done"
          onSubmitEditing={() => void submit()}
        />

        <View style={styles.section}>
          <TextField
            label="Lugar (opcional)"
            value={placeName}
            onChangeText={changePlace}
            placeholder="Biblioteca central"
            leadingIcon="place"
            maxLength={100}
            autoCapitalize="sentences"
            helperText={coords ? 'Con coordenadas: se podrá abrir en el mapa.' : undefined}
          />
          <SecondaryButton
            title={location.locating ? 'Buscando tu ubicación…' : 'Usar mi ubicación actual'}
            icon="my-location"
            disabled={location.locating}
            onPress={() => void fillWithMyLocation()}
          />
          {location.error ? <ErrorBanner message={location.error} /> : null}
        </View>

        <DateTimeField
          label="Fecha límite de votación"
          value={deadline}
          onChange={setDeadline}
          minimumDate={now}
          placeholder="Elige fecha y hora"
          error={deadlineError}
          helperText="Después de esta hora ya no se puede votar."
        />

        <View style={styles.section}>
          <FieldLabel>Franjas horarias</FieldLabel>
          <View style={styles.options}>
            <ChoiceChip label="Que Huecko proponga las 3 mejores" selected={auto} onPress={() => setAuto(true)} />
            <ChoiceChip label="Elegir yo las franjas" selected={!auto} onPress={() => setAuto(false)} />
          </View>
          {auto ? (
            <Text style={[typography.bodySmall, { color: colors.onSurfaceVariant }]}>
              Huecko elegirá las 3 franjas en las que más gente del grupo está libre.
            </Text>
          ) : (
            <>
              {windows.map((w) => (
                <View key={`${w.dayOfWeek}-${w.startTime}-${w.endTime}`} style={styles.windowRow}>
                  <Text style={[typography.titleSmall, styles.flex, { color: colors.onSurface }]}>{windowLabel(w)}</Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Quitar ${windowLabel(w)}`}
                    onPress={() => setWindows((prev) => prev.filter((x) => x !== w))}
                    style={styles.iconButton}
                  >
                    <MaterialIcons name="close" size={20} color={colors.onSurfaceVariant} />
                  </Pressable>
                </View>
              ))}
              <WindowEditor
                variant="secondary"
                submitLabel="Añadir franja"
                existing={windows}
                onSubmit={(w) => setWindows((prev) => [...prev, w])}
              />
            </>
          )}
        </View>

        {save.error ? <ErrorBanner message={save.error} /> : null}
        <PrimaryButton
          title="Crear propuesta"
          loadingTitle="Creando…"
          loading={save.loading}
          disabled={!formValid}
          onPress={() => void submit()}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: { flex: 1, backgroundColor: colors.surface },
  content: { paddingHorizontal: 16, paddingVertical: 20, gap: 20 },
  section: { gap: 8 },
  options: { gap: 8 },
  windowRow: { flexDirection: 'row', alignItems: 'center', paddingLeft: 14, borderRadius: 12, backgroundColor: colors.surfaceContainer },
  iconButton: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
});
```

- [ ] **Step 8: Ejecutar y ver que pasa** — `npm test -w mobile` → PASS. `npm run typecheck` → sin errores.

- [ ] **Step 9: Commit** — `git add mobile/src/components mobile/src/navigation mobile/src/screens/groups mobile/src/screens/proposals` → `feat(mobile): pestaña de planes del grupo y nueva propuesta con plazo, lugar y franjas`

---

### Task 8: Mobile — «Votar» y «Detalle del plan» (confirmar, cancelar, imprevistos, votación exprés, mapa)

**Files:**
- Create: `mobile/src/components/BottomSheet.tsx`, `mobile/src/components/VoteWindowRow.tsx`, `mobile/src/screens/proposals/ProposalHeader.tsx`, `mobile/src/screens/proposals/VotingScreen.tsx`, `mobile/src/screens/proposals/AddWindowSheet.tsx`, `mobile/src/screens/proposals/PlanDetailScreen.tsx`, `mobile/src/screens/proposals/ConfirmPlanDialog.tsx`, `mobile/src/screens/proposals/ReportIncidenceSheet.tsx`, `mobile/src/screens/proposals/ExpressVoteCard.tsx`, `mobile/src/screens/proposals/__tests__/VotingScreen.test.tsx`, `mobile/src/screens/proposals/__tests__/PlanDetailScreen.test.tsx`, `mobile/src/screens/proposals/__tests__/ExpressVoteCard.test.tsx`
- Modify: `mobile/src/components/index.ts`, `mobile/src/navigation/RootNavigator.tsx`

**Interfaces:**
- Consumes: `useProposal` + `VoteOutcome` (Task 5); `WindowEditor`, `ProposalStateBadge`, `SecondaryButton` con `disabled`, rutas `Voting`/`PlanDetail` (Task 7); `DateTimeField`, `openInMaps` (Task 6); `STATE_BADGE`, `INCIDENCE_LABEL`, `CRITICALITY_BADGE`, `windowLabel`, `voteCountLabel`, `availabilityLabel`, `deadlineLabel`, `scheduleLabel`, `isVotingOpen`, `openIncidence` (Task 5); `AppDialog`, `ChoiceChip`, `Badge`, `HueckoCard`, `LoadState`, `SectionHeader`, `ErrorBanner`, `PrimaryButton`, `TextField`; `useAuth`, `useAction`, `useRefreshOnFocus`, `useRefreshErrorToast`, `errorMessage`, `showToast`, `today`.
- Produces:
  - `BottomSheet` props `{ title: string; subtitle?: string; onDismiss: () => void; dismissable?: boolean; children: ReactNode }`.
  - `VoteWindowRow` props `{ window: TimeWindow; voted: boolean; onPress?: () => void; disabled?: boolean; countStyle?: 'pill' | 'plain'; chosen?: boolean }` (icono de mi voto con `accessibilityLabel` «Tu voto»; badge «Elegida»).
  - `ExpressVoteCard` props `{ kind: 'RECOORDINACION' | 'AVISO'; who: string; reason: string; planTitle: string; canResolve: boolean; creatorName: string; onResolve: (input: ResolveIncidencesInput) => Promise<unknown>; onResolved?: () => void }` — Task 9 la usa en Inicio.
  - Pantallas `VotingScreen` (ruta `Voting`, título «Votar») y `PlanDetailScreen` (ruta `PlanDetail`, título «Detalle del plan»).

- [ ] **Step 1: Escribir los tests que fallan**

`mobile/src/screens/proposals/__tests__/ExpressVoteCard.test.tsx`:

```tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { ApiError } from '../../../api/client';
import { showToast } from '../../../utils/toast';
import { ExpressVoteCard } from '../ExpressVoteCard';

jest.mock('../../../utils/toast', () => ({ showToast: jest.fn() }));
jest.mock('../../../utils/clock', () => ({ today: () => new Date(2026, 8, 29, 10, 0) }));

const base = {
  kind: 'AVISO' as const,
  who: 'Ana',
  reason: 'Cruce con un examen de laboratorio a última hora.',
  planTitle: 'Reunión de avance del proyecto',
  canResolve: true,
  creatorName: 'Usuario de Prueba',
};

beforeEach(() => jest.clearAllMocks());

it('aviso: título y texto; «Mantener» resuelve con CONFIRMADO y avisa', async () => {
  const onResolve = jest.fn().mockResolvedValue(undefined);
  const onResolved = jest.fn();
  await render(<ExpressVoteCard {...base} onResolve={onResolve} onResolved={onResolved} />);
  expect(screen.getByText('Aviso de imprevisto')).toBeTruthy();
  expect(screen.getByText('Ana reportó un imprevisto en «Reunión de avance del proyecto»')).toBeTruthy();
  expect(screen.getByText('Cruce con un examen de laboratorio a última hora.')).toBeTruthy();
  await fireEvent.press(screen.getByText('Mantener'));
  await waitFor(() => expect(onResolved).toHaveBeenCalled());
  expect(onResolve).toHaveBeenCalledWith({ newState: 'CONFIRMADO' });
  expect(showToast).toHaveBeenCalledWith('Votación exprés registrada: mantener.');
});

it('«Cancelar» resuelve con CANCELADO', async () => {
  const onResolve = jest.fn().mockResolvedValue(undefined);
  await render(<ExpressVoteCard {...base} onResolve={onResolve} />);
  await fireEvent.press(screen.getByText('Cancelar'));
  await waitFor(() => expect(onResolve).toHaveBeenCalledWith({ newState: 'CANCELADO' }));
  expect(showToast).toHaveBeenCalledWith('Votación exprés registrada: cancelar.');
});

it('«Reprogramar» pide una nueva fecha límite futura antes de enviar (G4)', async () => {
  const onResolve = jest.fn().mockResolvedValue(undefined);
  await render(<ExpressVoteCard {...base} onResolve={onResolve} />);
  await fireEvent.press(screen.getByText('Reprogramar'));
  expect(screen.getByText('Reprogramar plan')).toBeTruthy();
  expect(screen.getByLabelText('Abrir nueva votación').props.accessibilityState.disabled).toBe(true);

  const pick = async (date: Date) => {
    await fireEvent.press(screen.getByLabelText('Nueva fecha límite de votación'));
    await fireEvent(screen.getByTestId('datetimepicker-date'), 'change', { type: 'set' }, date);
    await fireEvent(screen.getByTestId('datetimepicker-time'), 'change', { type: 'set' }, date);
  };
  await pick(new Date(2026, 8, 29, 9, 0));
  expect(screen.getByText('La fecha límite debe ser futura')).toBeTruthy();
  expect(screen.getByLabelText('Abrir nueva votación').props.accessibilityState.disabled).toBe(true);

  await pick(new Date(2026, 9, 5, 20, 0));
  await fireEvent.press(screen.getByText('Abrir nueva votación'));
  await waitFor(() =>
    expect(onResolve).toHaveBeenCalledWith({ newState: 'PROPUESTO', votingDeadline: new Date(2026, 9, 5, 20, 0).toISOString() }),
  );
  expect(showToast).toHaveBeenCalledWith('Votación exprés registrada: reprogramar.');
});

it('re-coordinación: «Votación exprés» y «no podrá asistir»', async () => {
  await render(<ExpressVoteCard {...base} kind="RECOORDINACION" onResolve={jest.fn()} />);
  expect(screen.getByText('Votación exprés')).toBeTruthy();
  expect(screen.getByText('Ana no podrá asistir a «Reunión de avance del proyecto»')).toBeTruthy();
});

it('si no soy quien creó el plan no hay botones (B20)', async () => {
  await render(<ExpressVoteCard {...base} canResolve={false} onResolve={jest.fn()} />);
  expect(screen.queryByText('Mantener')).toBeNull();
  expect(screen.getByText('Solo Usuario de Prueba puede decidir qué hacer con el plan.')).toBeTruthy();
});

it('si falla, muestra el error y deja volver a elegir', async () => {
  const onResolve = jest.fn().mockRejectedValue(new ApiError(409, 'INVALID_STATE', 'El plan no admite esta acción en su estado actual.'));
  await render(<ExpressVoteCard {...base} onResolve={onResolve} />);
  await fireEvent.press(screen.getByText('Mantener'));
  expect(await screen.findByText('El plan no admite esta acción en su estado actual.')).toBeTruthy();
  expect(showToast).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByText('Mantener'));
  expect(onResolve).toHaveBeenCalledTimes(2);
});
```

`mobile/src/screens/proposals/__tests__/VotingScreen.test.tsx`:

```tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import * as proposalsApi from '../../../api/proposals';
import { makeProposal, makeWindow } from '../../../testing/fixtures';
import { showToast } from '../../../utils/toast';
import { VotingScreen } from '../VotingScreen';

jest.mock('../../../api/proposals');
jest.mock('../../../hooks/useRefreshOnFocus', () => ({ useRefreshOnFocus: jest.fn() }));
jest.mock('../../../utils/toast', () => ({ showToast: jest.fn() }));
jest.mock('../../../utils/clock', () => ({ today: () => new Date(2026, 8, 29, 10, 0) }));

const mocked = proposalsApi as jest.Mocked<typeof proposalsApi>;
const route = { key: 'k', name: 'Voting', params: { proposalId: 'prop_2' } } as any;
const renderScreen = () => render(<VotingScreen navigation={{} as any} route={route} />);

beforeEach(() => jest.clearAllMocks());

it('muestra la propuesta, sus franjas y los recuentos (UI spec §2.7, con tildes)', async () => {
  mocked.getProposal.mockResolvedValue(makeProposal());
  await renderScreen();
  expect(await screen.findByText('Repaso antes de la entrega')).toBeTruthy();
  expect(screen.getByText('Google Meet')).toBeTruthy();
  expect(screen.getByText('Cierra: Mar 29 sep, 20:00')).toBeTruthy();
  expect(screen.getByText('En votación')).toBeTruthy();
  expect(screen.getByText('Elige una franja horaria')).toBeTruthy();
  expect(screen.getByText('Selecciona la opción que más te convenga. Un voto por persona.')).toBeTruthy();
  expect(screen.getByText('Mar · 16:00 - 18:00')).toBeTruthy();
  expect(screen.getByText('1 voto')).toBeTruthy();
  expect(screen.getAllByText('0 votos')).toHaveLength(2);
  expect(screen.getByText('50% del grupo disponible')).toBeTruthy();
});

it('votar una franja usa PUT; tocar la mía retira el voto con DELETE (G1, B8)', async () => {
  mocked.getProposal.mockResolvedValue(makeProposal());
  mocked.voteWindow.mockResolvedValue(
    makeProposal({
      myVoteWindowId: 'w_22',
      windows: [makeWindow({ voteCount: 1 }), makeWindow({ id: 'w_22', dayOfWeek: 4, startTime: '10:00', endTime: '12:00', voteCount: 1 })],
    }),
  );
  mocked.removeVote.mockResolvedValue(makeProposal());
  await renderScreen();

  await fireEvent.press(await screen.findByText('Jue · 10:00 - 12:00'));
  await waitFor(() => expect(showToast).toHaveBeenCalledWith('Tu voto ha sido registrado.'));
  expect(mocked.voteWindow).toHaveBeenCalledWith('prop_2', 'w_22');
  expect(screen.getByLabelText('Tu voto')).toBeTruthy();

  await fireEvent.press(screen.getByText('Jue · 10:00 - 12:00'));
  await waitFor(() => expect(showToast).toHaveBeenCalledWith('Tu voto se ha retirado.'));
  expect(mocked.removeVote).toHaveBeenCalledWith('prop_2');
  expect(screen.queryByLabelText('Tu voto')).toBeNull();
});

it('votación cerrada: aviso y sin votar ni agregar franjas (C1)', async () => {
  mocked.getProposal.mockResolvedValue(makeProposal({ votingDeadline: new Date(2026, 8, 29, 9, 0).toISOString() }));
  await renderScreen();
  expect(await screen.findByText('Cerró: Mar 29 sep, 09:00')).toBeTruthy();
  expect(screen.getByText('La votación está cerrada.')).toBeTruthy();
  await fireEvent.press(screen.getByText('Jue · 10:00 - 12:00'));
  expect(mocked.voteWindow).not.toHaveBeenCalled();
  expect(screen.queryByText('Agregar franja horaria')).toBeNull();
});

it('agregar franja: valida HH:mm y el orden (quirk 13) y la envía', async () => {
  mocked.getProposal.mockResolvedValue(makeProposal());
  mocked.addWindow.mockResolvedValue(
    makeProposal({
      windows: [...makeProposal().windows, makeWindow({ id: 'w_new', dayOfWeek: 5, startTime: '18:00', endTime: '19:30' })],
    }),
  );
  await renderScreen();
  await fireEvent.press(await screen.findByText('Agregar franja horaria'));
  expect(screen.getByText('Selecciona el día y la franja horaria que propones.')).toBeTruthy();

  await fireEvent.changeText(screen.getByLabelText('Hora de inicio (HH:mm)'), '9:00');
  expect(screen.getByText('Formato HH:mm')).toBeTruthy();
  // Guarda: enviar desde el teclado con una hora inválida no llama a la API.
  await fireEvent(screen.getByLabelText('Hora de fin (HH:mm)'), 'submitEditing');
  expect(mocked.addWindow).not.toHaveBeenCalled();

  await fireEvent.changeText(screen.getByLabelText('Hora de inicio (HH:mm)'), '18:00');
  await fireEvent.changeText(screen.getByLabelText('Hora de fin (HH:mm)'), '17:00');
  expect(screen.getByText('Debe ser posterior')).toBeTruthy();
  await fireEvent.changeText(screen.getByLabelText('Hora de fin (HH:mm)'), '19:30');
  await fireEvent.press(screen.getByText('Vie'));
  // Control positivo: con datos válidos, el mismo envío por teclado sí llama a la API.
  await fireEvent(screen.getByLabelText('Hora de fin (HH:mm)'), 'submitEditing');

  await waitFor(() => expect(showToast).toHaveBeenCalledWith('Franja horaria agregada.'));
  expect(mocked.addWindow).toHaveBeenCalledWith('prop_2', { dayOfWeek: 5, startTime: '18:00', endTime: '19:30' });
  expect(screen.getByText('Vie · 18:00 - 19:30')).toBeTruthy();
  expect(screen.queryByText('Selecciona el día y la franja horaria que propones.')).toBeNull();
});
```

`mobile/src/screens/proposals/__tests__/PlanDetailScreen.test.tsx`:

```tsx
import type { User } from '@hueckoapp/shared';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Alert, Linking } from 'react-native';

import * as proposalsApi from '../../../api/proposals';
import { makeConfirmed, makeProposal, TEST_USER } from '../../../testing/fixtures';
import { showToast } from '../../../utils/toast';
import { PlanDetailScreen } from '../PlanDetailScreen';

jest.mock('../../../api/proposals');
jest.mock('../../../hooks/useRefreshOnFocus', () => ({ useRefreshOnFocus: jest.fn() }));
jest.mock('../../../utils/toast', () => ({ showToast: jest.fn() }));
jest.mock('../../../utils/clock', () => ({ today: () => new Date(2026, 8, 29, 10, 0) }));
const mockAuthUser: { current: User } = { current: { id: 'u1', name: 'Usuario de Prueba', email: 'test@test.com' } };
jest.mock('../../../context/AuthContext', () => ({ useAuth: () => ({ user: mockAuthUser.current }) }));

const mocked = proposalsApi as jest.Mocked<typeof proposalsApi>;
const navigation = { navigate: jest.fn() } as any;
const renderScreen = (proposalId = 'prop_1') =>
  render(<PlanDetailScreen navigation={navigation} route={{ key: 'k', name: 'PlanDetail', params: { proposalId } } as any} />);

beforeEach(() => jest.clearAllMocks());

it('plan confirmado: datos, franja elegida, imprevistos y «Abrir en el mapa»', async () => {
  const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
  mocked.getProposal.mockResolvedValue(makeConfirmed({ location: { name: 'Biblioteca central', latitude: -12.07, longitude: -77.08 } }));
  await renderScreen();
  expect(await screen.findByText('Reunión de avance del proyecto')).toBeTruthy();
  expect(screen.getByText('Biblioteca central')).toBeTruthy();
  expect(screen.getByText('Creado por: Usuario de Prueba')).toBeTruthy();
  expect(screen.getByText('Fecha: Mié 30 sep · 11:00 - 13:00')).toBeTruthy();
  expect(screen.getByText('Confirmado')).toBeTruthy();
  expect(screen.getByText('Franjas horarias')).toBeTruthy();
  expect(screen.getByText('Mié · 11:00 - 13:00')).toBeTruthy();
  expect(screen.getByText('Elegida')).toBeTruthy();
  expect(screen.getByText('Ana · Imprevisto')).toBeTruthy();
  expect(screen.getByText('Media')).toBeTruthy();
  expect(screen.queryByText('Ir a votar')).toBeNull();

  await fireEvent.press(screen.getByText('Abrir en el mapa'));
  expect(open).toHaveBeenCalledWith('https://maps.google.com/?q=-12.07,-77.08');
});

it('sin coordenadas no ofrece el mapa', async () => {
  mocked.getProposal.mockResolvedValue(makeConfirmed());
  await renderScreen();
  expect(await screen.findByText('Biblioteca central')).toBeTruthy();
  expect(screen.queryByText('Abrir en el mapa')).toBeNull();
});

it('en votación: «Ir a votar» navega y quien la creó confirma eligiendo la franja (C2)', async () => {
  mocked.getProposal.mockResolvedValue(makeProposal({ createdBy: TEST_USER }));
  mocked.confirmProposal.mockResolvedValue(makeConfirmed({ id: 'prop_2' }));
  await renderScreen('prop_2');
  await fireEvent.press(await screen.findByText('Ir a votar'));
  expect(navigation.navigate).toHaveBeenCalledWith('Voting', { proposalId: 'prop_2' });

  await fireEvent.press(screen.getByText('Confirmar plan'));
  expect(screen.getByText('La más votada')).toBeTruthy();
  await fireEvent.press(screen.getByText('Jue · 10:00 - 12:00 · 0 votos'));
  await fireEvent.press(screen.getByText('Confirmar'));
  await waitFor(() => expect(showToast).toHaveBeenCalledWith('Plan confirmado.'));
  expect(mocked.confirmProposal).toHaveBeenCalledWith('prop_2', 'w_22');
  expect(screen.getByText('Confirmado')).toBeTruthy();
});

it('confirmar sin elegir franja deja que gane la más votada', async () => {
  mocked.getProposal.mockResolvedValue(makeProposal({ createdBy: TEST_USER }));
  mocked.confirmProposal.mockResolvedValue(makeConfirmed({ id: 'prop_2' }));
  await renderScreen('prop_2');
  await fireEvent.press(await screen.findByText('Confirmar plan'));
  await fireEvent.press(screen.getByText('Confirmar'));
  await waitFor(() => expect(mocked.confirmProposal).toHaveBeenCalledWith('prop_2', undefined));
});

it('quien no creó el plan no ve «Confirmar plan» ni «Cancelar plan»', async () => {
  mocked.getProposal.mockResolvedValue(makeProposal());
  await renderScreen('prop_2');
  expect(await screen.findByText('Repaso antes de la entrega')).toBeTruthy();
  expect(screen.queryByText('Confirmar plan')).toBeNull();
  expect(screen.queryByText('Cancelar plan')).toBeNull();
});

it('cancelar pide confirmación y avisa', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  mocked.getProposal.mockResolvedValue(makeProposal({ createdBy: TEST_USER }));
  mocked.cancelProposal.mockResolvedValue(makeProposal({ createdBy: TEST_USER, state: 'CANCELADO' }));
  await renderScreen('prop_2');
  await fireEvent.press(await screen.findByText('Cancelar plan'));
  expect(alert).toHaveBeenCalledWith(
    'Cancelar plan',
    '¿Seguro que quieres cancelar «Repaso antes de la entrega»? El grupo dejará de verlo como pendiente.',
    expect.any(Array),
  );
  const buttons = alert.mock.calls[0][2]!;
  await act(async () => buttons[1].onPress!());
  await waitFor(() => expect(showToast).toHaveBeenCalledWith('Plan cancelado.'));
  expect(mocked.cancelProposal).toHaveBeenCalledWith('prop_2');
  expect(screen.getByText('Cancelado')).toBeTruthy();
});

it('reportar una tardanza exige los minutos (guarda por el teclado y control positivo)', async () => {
  mocked.getProposal.mockResolvedValue(makeConfirmed());
  mocked.reportIncidence.mockResolvedValue(makeConfirmed());
  await renderScreen();
  await fireEvent.press(await screen.findByText('Reportar imprevisto'));
  await fireEvent.press(screen.getByText('Llegaré tarde'));
  await fireEvent.changeText(screen.getByLabelText('¿Qué pasó?'), 'Tráfico');
  await fireEvent(screen.getByLabelText('Minutos de retraso'), 'submitEditing');
  expect(mocked.reportIncidence).not.toHaveBeenCalled();

  await fireEvent.changeText(screen.getByLabelText('Minutos de retraso'), '20');
  await fireEvent(screen.getByLabelText('Minutos de retraso'), 'submitEditing');
  await waitFor(() => expect(showToast).toHaveBeenCalledWith('Imprevisto reportado.'));
  expect(mocked.reportIncidence).toHaveBeenCalledWith('prop_1', { type: 'TARDANZA', reason: 'Tráfico', delayMinutes: 20 });
});

it('quien creó el plan resuelve el aviso desde el detalle', async () => {
  const confirmed = makeConfirmed();
  mocked.getProposal.mockResolvedValue(confirmed);
  mocked.resolveIncidences.mockResolvedValue(makeConfirmed({ incidences: [{ ...confirmed.incidences[0], resolved: true }] }));
  await renderScreen();
  expect(await screen.findByText('Aviso de imprevisto')).toBeTruthy();
  await fireEvent.press(screen.getByText('Mantener'));
  await waitFor(() => expect(screen.queryByText('Aviso de imprevisto')).toBeNull());
  expect(mocked.resolveIncidences).toHaveBeenCalledWith('prop_1', { newState: 'CONFIRMADO' });
  expect(screen.getByText('Resuelto')).toBeTruthy();
});
```

- [ ] **Step 2: Ejecutar y ver que falla** — `npm test -w mobile -- proposals` → FAIL (módulos inexistentes).

- [ ] **Step 3: Componentes compartidos**

`mobile/src/components/BottomSheet.tsx`:

```tsx
import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { colors, typography } from '../theme';

type Props = { title: string; subtitle?: string; onDismiss: () => void; dismissable?: boolean; children: ReactNode };

// ModalBottomSheet M3 (UI spec §2.6/§2.7): esquinas superiores de 28, asa y fondo oscurecido.
// Tocar fuera o Atrás la cierra, salvo mientras se envía (`dismissable = false`).
export function BottomSheet({ title, subtitle, onDismiss, dismissable = true, children }: Props) {
  const dismiss = () => {
    if (dismissable) onDismiss();
  };
  return (
    <Modal transparent visible animationType="slide" onRequestClose={dismiss}>
      <KeyboardAvoidingView style={styles.backdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable accessibilityLabel="Cerrar" style={StyleSheet.absoluteFill} onPress={dismiss} />
        <View style={styles.sheet} accessibilityViewIsModal>
          <View style={styles.handle} />
          <Text style={[typography.titleMedium, { color: colors.onSurface }]}>{title}</Text>
          {subtitle ? <Text style={[typography.bodySmall, styles.subtitle]}>{subtitle}</Text> : null}
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.body}>
            {children}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(29,27,32,0.32)' },
  sheet: {
    maxHeight: '90%',
    backgroundColor: colors.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 32,
  },
  handle: { alignSelf: 'center', width: 32, height: 4, borderRadius: 2, backgroundColor: colors.onSurfaceVariant, opacity: 0.4, marginBottom: 16 },
  subtitle: { color: colors.onSurfaceVariant, marginTop: 4 },
  body: { gap: 12, paddingTop: 16 },
});
```

`mobile/src/components/VoteWindowRow.tsx`:

```tsx
import { MaterialIcons } from '@expo/vector-icons';
import type { TimeWindow } from '@hueckoapp/shared';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radius, typography } from '../theme';
import { availabilityLabel, voteCountLabel, windowLabel } from '../utils/proposals';
import { Badge } from './Badge';

type Props = {
  window: TimeWindow;
  voted: boolean;
  /** Sin onPress la fila es de solo lectura (Detalle del plan). */
  onPress?: () => void;
  disabled?: boolean;
  /** Recuento en cápsula (Votar, Detalle) o como texto (Inicio), UI spec §2.3 y §2.7. */
  countStyle?: 'pill' | 'plain';
  /** Franja elegida al confirmar. */
  chosen?: boolean;
};

// Fila de franja unificada (UI spec §3.10): check si es mi voto, franja, % del grupo y recuento.
export function VoteWindowRow({ window, voted, onPress, disabled = false, countStyle = 'pill', chosen = false }: Props) {
  const count = voteCountLabel(window.voteCount);
  const hasVotes = window.voteCount > 0;
  const content = (
    <View style={styles.row}>
      <View style={styles.check}>
        {voted ? <MaterialIcons name="check" size={20} color={colors.primary} accessibilityLabel="Tu voto" /> : null}
      </View>
      <View style={styles.texts}>
        <Text style={[typography.titleSmall, { color: colors.onSurface }]}>{windowLabel(window)}</Text>
        <Text style={[typography.bodySmall, { color: colors.onSurfaceVariant }]}>{availabilityLabel(window.availabilityPercentage)}</Text>
      </View>
      {chosen ? <Badge text="Elegida" containerColor={colors.primary} contentColor={colors.onPrimary} /> : null}
      {countStyle === 'pill' ? (
        <View style={[styles.pill, { backgroundColor: hasVotes ? colors.primaryContainer : colors.surfaceContainerLow }]}>
          <Text style={[typography.labelMedium, { color: hasVotes ? colors.onPrimaryContainer : colors.onSurfaceVariant }]}>{count}</Text>
        </View>
      ) : (
        <Text style={[typography.labelMedium, { color: colors.onSurfaceVariant }]}>{count}</Text>
      )}
    </View>
  );
  const frame = [styles.frame, voted ? styles.voted : styles.notVoted];
  if (!onPress) return <View style={frame}>{content}</View>;
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected: voted, disabled }} disabled={disabled} onPress={onPress} style={frame}>
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  frame: { borderRadius: radius.xxl, paddingHorizontal: 14, paddingVertical: 12 },
  voted: { backgroundColor: colors.primaryContainer, borderWidth: 2, borderColor: colors.primary },
  notVoted: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.outlineVariant },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  check: { width: 20, height: 20 },
  texts: { flex: 1 },
  pill: { borderRadius: radius.xxl, paddingHorizontal: 10, paddingVertical: 4 },
});
```

En `mobile/src/components/index.ts` añadir `export { BottomSheet } from './BottomSheet';` y `export { VoteWindowRow } from './VoteWindowRow';`.

- [ ] **Step 4: Tarjetas y hojas de propuestas**

`mobile/src/screens/proposals/ProposalHeader.tsx` (ProposalHeader de Votar, UI spec §2.7, y PlanInfoCard del detalle, §2.8, con `details`):

```tsx
import { MaterialIcons } from '@expo/vector-icons';
import type { Proposal } from '@hueckoapp/shared';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { HueckoCard, ProposalStateBadge } from '../../components';
import { colors, typography } from '../../theme';
import { openInMaps } from '../../utils/location';
import { deadlineLabel, scheduleLabel } from '../../utils/proposals';

type Props = { proposal: Proposal; now: Date; /** Detalle del plan: quién lo creó y «Abrir en el mapa». */ details?: boolean };

export function ProposalHeader({ proposal, now, details = false }: Props) {
  const place = proposal.location;
  const mappable =
    place && place.latitude !== null && place.longitude !== null
      ? { name: place.name, latitude: place.latitude, longitude: place.longitude }
      : null;
  const schedule = scheduleLabel(proposal);

  return (
    <HueckoCard containerColor={colors.primaryContainer} borderColor={colors.primaryContainer}>
      <Text style={[typography.headlineSmall, styles.text]}>{proposal.title}</Text>
      {place ? (
        <View style={styles.place}>
          <MaterialIcons name="place" size={16} color={colors.onPrimaryContainer} />
          <Text style={[typography.bodyMedium, styles.text, styles.flex]}>{place.name}</Text>
        </View>
      ) : null}
      {details && mappable ? (
        <Pressable accessibilityRole="button" onPress={() => void openInMaps(mappable)} style={styles.mapButton}>
          <MaterialIcons name="map" size={18} color={colors.primary} />
          <Text style={[typography.labelLarge, { color: colors.primary }]}>Abrir en el mapa</Text>
        </Pressable>
      ) : null}
      {details ? <Text style={[typography.bodySmall, styles.text, styles.line]}>{`Creado por: ${proposal.createdBy.name}`}</Text> : null}
      <Text style={[typography.bodySmall, styles.text, styles.line]}>{deadlineLabel(proposal.votingDeadline, now)}</Text>
      {schedule ? <Text style={[typography.bodySmall, styles.text, styles.line]}>{`Fecha: ${schedule}`}</Text> : null}
      <View style={styles.badge}>
        <ProposalStateBadge state={proposal.state} />
      </View>
    </HueckoCard>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  text: { color: colors.onPrimaryContainer },
  place: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  mapButton: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 40, marginTop: 4 },
  line: { marginTop: 4 },
  badge: { marginTop: 12 },
});
```

`mobile/src/screens/proposals/AddWindowSheet.tsx`:

```tsx
import type { TimeWindowInput } from '@hueckoapp/shared';

import { BottomSheet, ErrorBanner } from '../../components';
import { useAction } from '../../hooks/useAction';
import { WindowEditor } from './WindowEditor';

type Props = {
  existing: readonly TimeWindowInput[];
  onAdd: (window: TimeWindowInput) => Promise<unknown>;
  onDone: () => void;
  onDismiss: () => void;
};

// AddWindowBottomSheet (UI spec §2.7) con validación de formato y orden (quirk 13). El % lo calcula el servidor (G2).
export function AddWindowSheet({ existing, onAdd, onDone, onDismiss }: Props) {
  const action = useAction(onAdd);
  const submit = async (window: TimeWindowInput) => {
    const result = await action.run(window);
    if (result.ok) onDone();
  };
  return (
    <BottomSheet
      title="Agregar franja horaria"
      subtitle="Selecciona el día y la franja horaria que propones."
      onDismiss={onDismiss}
      dismissable={!action.loading}
    >
      <WindowEditor submitLabel="Agregar" existing={existing} loading={action.loading} onSubmit={(w) => void submit(w)} />
      {action.error ? <ErrorBanner message={action.error} /> : null}
    </BottomSheet>
  );
}
```

`mobile/src/screens/proposals/ConfirmPlanDialog.tsx`:

```tsx
import type { TimeWindow } from '@hueckoapp/shared';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AppDialog, ChoiceChip, ErrorBanner } from '../../components';
import { useAction } from '../../hooks/useAction';
import { colors, typography } from '../../theme';
import { voteCountLabel, windowLabel } from '../../utils/proposals';

const MOST_VOTED = 'MOST_VOTED';

type Props = {
  windows: TimeWindow[];
  onConfirm: (windowId?: string) => Promise<unknown>;
  onDone: () => void;
  onDismiss: () => void;
};

// C2: quien creó el plan elige la franja o deja «La más votada» (el servidor desempata).
// Sin votos hay que elegir una franja: el servidor respondería 409 NO_VOTES.
export function ConfirmPlanDialog({ windows, onConfirm, onDone, onDismiss }: Props) {
  const anyVotes = windows.some((w) => w.voteCount > 0);
  const [choice, setChoice] = useState<string | null>(anyVotes ? MOST_VOTED : null);
  const action = useAction(onConfirm);

  const confirm = async () => {
    if (!choice) return;
    const result = await action.run(choice === MOST_VOTED ? undefined : choice);
    if (result.ok) onDone();
  };

  return (
    <AppDialog
      title="Confirmar plan"
      confirmLabel="Confirmar"
      onConfirm={() => void confirm()}
      onDismiss={onDismiss}
      confirmDisabled={!choice}
      loading={action.loading}
    >
      <Text style={[typography.bodyMedium, { color: colors.onSurfaceVariant }]}>
        Elige la franja del plan. Con «La más votada» gana la que tenga más votos.
      </Text>
      <View style={styles.options}>
        {anyVotes ? <ChoiceChip label="La más votada" selected={choice === MOST_VOTED} onPress={() => setChoice(MOST_VOTED)} /> : null}
        {windows.map((w) => (
          <ChoiceChip
            key={w.id}
            label={`${windowLabel(w)} · ${voteCountLabel(w.voteCount)}`}
            selected={choice === w.id}
            onPress={() => setChoice(w.id)}
          />
        ))}
      </View>
      {action.error ? (
        <View style={styles.error}>
          <ErrorBanner message={action.error} />
        </View>
      ) : null}
    </AppDialog>
  );
}

const styles = StyleSheet.create({
  options: { gap: 8, marginTop: 16 },
  error: { marginTop: 12 },
});
```

`mobile/src/screens/proposals/ReportIncidenceSheet.tsx`:

```tsx
import type { IncidenceInput, IncidenceType } from '@hueckoapp/shared';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { BottomSheet, ChoiceChip, ErrorBanner, PrimaryButton, TextField } from '../../components';
import { useAction } from '../../hooks/useAction';

// Cómo lo dice quien reporta (en primera persona).
const TYPE_OPTIONS: { value: IncidenceType; label: string }[] = [
  { value: 'FALTA', label: 'No podré ir' },
  { value: 'TARDANZA', label: 'Llegaré tarde' },
  { value: 'IMPREVISTO', label: 'Otro imprevisto' },
];

type Props = { onReport: (input: IncidenceInput) => Promise<unknown>; onDone: () => void; onDismiss: () => void };

// C4: motivo obligatorio; una tardanza lleva minutos (1–600). La criticidad la pone el servidor (G6).
export function ReportIncidenceSheet({ onReport, onDone, onDismiss }: Props) {
  const [type, setType] = useState<IncidenceType>('FALTA');
  const [reason, setReason] = useState('');
  const [minutes, setMinutes] = useState('');
  const action = useAction(onReport);

  const delay = Number(minutes);
  const minutesValid = minutes.length > 0 && delay >= 1 && delay <= 600;
  const valid = reason.trim().length > 0 && (type !== 'TARDANZA' || minutesValid);

  const submit = async () => {
    if (!valid || action.loading) return;
    const result = await action.run({ type, reason: reason.trim(), delayMinutes: type === 'TARDANZA' ? delay : null });
    if (result.ok) onDone();
  };

  return (
    <BottomSheet
      title="Reportar un imprevisto"
      subtitle="Avisa al grupo si no podrás ir o llegarás tarde."
      onDismiss={onDismiss}
      dismissable={!action.loading}
    >
      <View style={styles.options}>
        {TYPE_OPTIONS.map((option) => (
          <ChoiceChip key={option.value} label={option.label} selected={type === option.value} onPress={() => setType(option.value)} />
        ))}
      </View>
      <TextField
        label="¿Qué pasó?"
        value={reason}
        onChangeText={setReason}
        placeholder="Cuéntale al grupo qué pasó"
        maxLength={200}
        autoCapitalize="sentences"
        returnKeyType="done"
        onSubmitEditing={() => void submit()}
      />
      {type === 'TARDANZA' ? (
        <TextField
          label="Minutos de retraso"
          value={minutes}
          onChangeText={(text) => setMinutes(text.replace(/\D/g, ''))}
          placeholder="20"
          keyboardType="number-pad"
          maxLength={3}
          returnKeyType="done"
          onSubmitEditing={() => void submit()}
          helperText="Entre 1 y 600 minutos."
        />
      ) : null}
      {action.error ? <ErrorBanner message={action.error} /> : null}
      <PrimaryButton title="Reportar" loadingTitle="Enviando…" loading={action.loading} disabled={!valid} onPress={() => void submit()} />
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
```

`mobile/src/screens/proposals/ExpressVoteCard.tsx` (UI spec §2.3 punto 2; G4, G5; B20):

```tsx
import type { ResolveIncidencesInput } from '@hueckoapp/shared';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppDialog, DateTimeField, ErrorBanner } from '../../components';
import { useAction } from '../../hooks/useAction';
import { colors, radius, typography } from '../../theme';
import { today } from '../../utils/clock';
import { showToast } from '../../utils/toast';

type Choice = { state: 'PROPUESTO' | 'CANCELADO' | 'CONFIRMADO'; label: string };
const REPROGRAM: Choice = { state: 'PROPUESTO', label: 'Reprogramar' };
const CHOICES: Choice[] = [REPROGRAM, { state: 'CANCELADO', label: 'Cancelar' }, { state: 'CONFIRMADO', label: 'Mantener' }];

type Props = {
  kind: 'RECOORDINACION' | 'AVISO';
  who: string;
  reason: string;
  planTitle: string;
  canResolve: boolean;
  creatorName: string;
  onResolve: (input: ResolveIncidencesInput) => Promise<unknown>;
  onResolved?: () => void;
};

function ReprogramDialog({ loading, error, onConfirm, onDismiss }: {
  loading: boolean;
  error: string | null;
  onConfirm: (deadline: Date) => void;
  onDismiss: () => void;
}) {
  const [now] = useState(today);
  const [deadline, setDeadline] = useState<Date | null>(null);
  const future = deadline !== null && deadline.getTime() > now.getTime();
  return (
    <AppDialog
      title="Reprogramar plan"
      confirmLabel="Abrir nueva votación"
      onConfirm={() => {
        if (deadline && future) onConfirm(deadline);
      }}
      onDismiss={onDismiss}
      confirmDisabled={!future}
      loading={loading}
    >
      <Text style={[typography.bodyMedium, { color: colors.onSurfaceVariant }]}>
        Se borrarán los votos y el grupo volverá a votar las franjas hasta la nueva fecha límite.
      </Text>
      <View style={{ height: 16 }} />
      <DateTimeField
        label="Nueva fecha límite de votación"
        value={deadline}
        onChange={setDeadline}
        minimumDate={now}
        placeholder="Elige fecha y hora"
        error={deadline && !future ? 'La fecha límite debe ser futura' : undefined}
      />
      {error ? (
        <View style={{ marginTop: 12 }}>
          <ErrorBanner message={error} />
        </View>
      ) : null}
    </AppDialog>
  );
}

// G5: «Votación exprés» si el plan se re-coordina (falta un imprescindible); «Aviso de imprevisto» si sigue confirmado
// con incidencias abiertas. Solo quien creó el plan decide (B20); reprogramar pide un plazo nuevo (G4).
export function ExpressVoteCard({ kind, who, reason, planTitle, canResolve, creatorName, onResolve, onResolved }: Props) {
  const [pending, setPending] = useState<Choice['state'] | null>(null);
  const [reprogramming, setReprogramming] = useState(false);
  const action = useAction(onResolve);

  const run = async (choice: Choice, input: ResolveIncidencesInput) => {
    setPending(choice.state);
    const result = await action.run(input);
    setPending(null);
    if (!result.ok) return;
    setReprogramming(false);
    showToast(`Votación exprés registrada: ${choice.label.toLowerCase()}.`);
    onResolved?.();
  };

  const choose = (choice: Choice) => {
    if (action.loading) return;
    if (choice.state === 'PROPUESTO') setReprogramming(true);
    else void run(choice, { newState: choice.state });
  };

  const title = kind === 'RECOORDINACION' ? 'Votación exprés' : 'Aviso de imprevisto';
  const headline = kind === 'RECOORDINACION' ? `${who} no podrá asistir a «${planTitle}»` : `${who} reportó un imprevisto en «${planTitle}»`;

  return (
    <View style={styles.card}>
      <Text style={[typography.labelMedium, styles.warning]}>{title}</Text>
      <Text style={[typography.titleMedium, styles.headline]}>{headline}</Text>
      <Text style={[typography.bodySmall, styles.warning, styles.reason]}>{reason}</Text>
      {canResolve ? (
        <View style={styles.buttons}>
          {CHOICES.map((choice) => {
            const selected = pending === choice.state;
            return (
              <Pressable
                key={choice.state}
                accessibilityRole="button"
                accessibilityState={{ selected, disabled: action.loading }}
                disabled={action.loading}
                onPress={() => choose(choice)}
                style={[styles.choice, selected ? styles.choiceSelected : styles.choiceIdle]}
              >
                <Text style={[typography.labelMedium, { color: selected ? colors.onPrimary : colors.onSurface }]}>{choice.label}</Text>
              </Pressable>
            );
          })}
        </View>
      ) : (
        <Text style={[typography.bodySmall, styles.warning, styles.onlyCreator]}>{`Solo ${creatorName} puede decidir qué hacer con el plan.`}</Text>
      )}
      {action.error && !reprogramming ? (
        <View style={styles.error}>
          <ErrorBanner message={action.error} />
        </View>
      ) : null}
      {reprogramming ? (
        <ReprogramDialog
          loading={action.loading}
          error={action.error}
          onConfirm={(deadline) => void run(REPROGRAM, { newState: 'PROPUESTO', votingDeadline: deadline.toISOString() })}
          onDismiss={() => setReprogramming(false)}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.card,
    backgroundColor: colors.warningContainer,
    borderWidth: 1,
    borderColor: colors.warning + '59', // warning al 35 %
    padding: 18,
  },
  warning: { color: colors.onWarningContainer },
  headline: { color: colors.onSurface, marginTop: 8 },
  reason: { marginTop: 4 },
  buttons: { flexDirection: 'row', gap: 8, marginTop: 16 },
  choice: { flex: 1, height: 48, borderRadius: radius.xxl, alignItems: 'center', justifyContent: 'center' },
  choiceIdle: { backgroundColor: colors.surfaceContainerLowest, borderWidth: 1, borderColor: colors.outlineVariant },
  choiceSelected: { backgroundColor: colors.primary },
  onlyCreator: { marginTop: 16 },
  error: { marginTop: 12 },
});
```

- [ ] **Step 5: Pantallas**

`mobile/src/screens/proposals/VotingScreen.tsx` (UI spec §2.7; C1 cerrada → sin votar ni agregar; G1/B8 toasts):

```tsx
import { MaterialIcons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { errorMessage } from '../../api/client';
import { HueckoCard, LoadState, SectionHeader, VoteWindowRow } from '../../components';
import { useProposal } from '../../hooks/useProposal';
import { useRefreshErrorToast } from '../../hooks/useRefreshErrorToast';
import { useRefreshOnFocus } from '../../hooks/useRefreshOnFocus';
import type { AppStackScreen } from '../../navigation/types';
import { colors, radius, typography } from '../../theme';
import { today } from '../../utils/clock';
import { isVotingOpen } from '../../utils/proposals';
import { showToast } from '../../utils/toast';
import { AddWindowSheet } from './AddWindowSheet';
import { ProposalHeader } from './ProposalHeader';

export function VotingScreen({ route }: AppStackScreen<'Voting'>) {
  const { proposalId } = route.params;
  const { proposal, loading, refreshing, error, reload, toggleVote, addWindow } = useProposal(proposalId);
  useRefreshOnFocus(reload);
  useRefreshErrorToast(error, proposal !== undefined);
  const [voting, setVoting] = useState(false);
  const [adding, setAdding] = useState(false);

  if (!proposal) {
    return (
      <View style={styles.centered}>
        <LoadState loading={loading} error={error ?? 'Propuesta no encontrada'} hasData={false} onRetry={() => void reload()}>
          {null}
        </LoadState>
      </View>
    );
  }

  const now = today();
  const open = isVotingOpen(proposal, now);

  // Un voto por persona: tocar otra franja lo mueve; tocar la mía lo retira (G1).
  const vote = async (windowId: string) => {
    if (voting) return;
    setVoting(true);
    try {
      const outcome = await toggleVote(windowId);
      showToast(outcome === 'voted' ? 'Tu voto ha sido registrado.' : 'Tu voto se ha retirado.');
    } catch (e) {
      showToast(errorMessage(e));
    } finally {
      setVoting(false);
    }
  };

  return (
    <>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void reload()} colors={[colors.primary]} />}
      >
        <ProposalHeader proposal={proposal} now={now} />
        <SectionHeader title="Elige una franja horaria" subtitle="Selecciona la opción que más te convenga. Un voto por persona." />
        {!open ? (
          <HueckoCard containerColor={colors.surfaceContainer} borderColor={colors.surfaceContainer} padding={16}>
            <Text style={[typography.bodyMedium, { color: colors.onSurfaceVariant }]}>La votación está cerrada.</Text>
          </HueckoCard>
        ) : null}
        {proposal.windows.length === 0 ? (
          <HueckoCard>
            <Text style={[typography.bodyMedium, { color: colors.onSurfaceVariant }]}>No hay franjas disponibles. Agrega una manualmente.</Text>
          </HueckoCard>
        ) : (
          <View style={styles.windows}>
            {proposal.windows.map((w) => (
              <VoteWindowRow
                key={w.id}
                window={w}
                voted={proposal.myVoteWindowId === w.id}
                chosen={proposal.chosenWindowId === w.id}
                onPress={open ? () => void vote(w.id) : undefined}
                disabled={voting}
              />
            ))}
          </View>
        )}
        {open ? (
          <Pressable accessibilityRole="button" onPress={() => setAdding(true)} style={styles.addButton}>
            <MaterialIcons name="add" size={20} color={colors.primary} />
            <Text style={[typography.titleSmall, { color: colors.primary }]}>Agregar franja horaria</Text>
          </Pressable>
        ) : null}
      </ScrollView>
      {adding ? (
        <AddWindowSheet
          existing={proposal.windows}
          onAdd={addWindow}
          onDone={() => {
            setAdding(false);
            showToast('Franja horaria agregada.');
          }}
          onDismiss={() => setAdding(false)}
        />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: colors.surface },
  content: { paddingHorizontal: 16, paddingVertical: 20, gap: 20 },
  centered: { flex: 1, justifyContent: 'center', padding: 16, backgroundColor: colors.surface },
  windows: { gap: 8 },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 16,
    borderRadius: radius.xxl,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    backgroundColor: colors.surfaceContainerLowest,
  },
});
```

`mobile/src/screens/proposals/PlanDetailScreen.tsx` (UI spec §2.8 + acciones de quien creó el plan, C2/C3; imprevistos C4; alerta exprés G5; mapa):

```tsx
import type { Incidence } from '@hueckoapp/shared';
import { useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { errorMessage } from '../../api/client';
import { Badge, HueckoCard, LoadState, PrimaryButton, SecondaryButton, VoteWindowRow } from '../../components';
import { useAuth } from '../../context/AuthContext';
import { useProposal } from '../../hooks/useProposal';
import { useRefreshErrorToast } from '../../hooks/useRefreshErrorToast';
import { useRefreshOnFocus } from '../../hooks/useRefreshOnFocus';
import type { AppStackScreen } from '../../navigation/types';
import { colors, radius, typography } from '../../theme';
import { today } from '../../utils/clock';
import { CRITICALITY_BADGE, INCIDENCE_LABEL, isVotingOpen, openIncidence } from '../../utils/proposals';
import { showToast } from '../../utils/toast';
import { ConfirmPlanDialog } from './ConfirmPlanDialog';
import { ExpressVoteCard } from './ExpressVoteCard';
import { ProposalHeader } from './ProposalHeader';
import { ReportIncidenceSheet } from './ReportIncidenceSheet';

function IncidenceRow({ incidence }: { incidence: Incidence }) {
  const badge = CRITICALITY_BADGE[incidence.criticality];
  const delay = incidence.delayMinutes !== null ? ` (${incidence.delayMinutes} min)` : '';
  return (
    <HueckoCard padding={14}>
      <View style={styles.incidenceHeader}>
        <Text style={[typography.titleSmall, styles.flex, { color: colors.onSurface }]}>
          {`${incidence.user.name} · ${INCIDENCE_LABEL[incidence.type]}${delay}`}
        </Text>
        {incidence.resolved ? (
          <Badge text="Resuelto" containerColor={colors.successContainer} contentColor={colors.onSuccessContainer} />
        ) : (
          <Badge text={badge.text} containerColor={badge.container} contentColor={badge.content} />
        )}
      </View>
      <Text style={[typography.bodySmall, styles.reason]}>{incidence.reason}</Text>
    </HueckoCard>
  );
}

export function PlanDetailScreen({ navigation, route }: AppStackScreen<'PlanDetail'>) {
  const { proposalId } = route.params;
  const { user } = useAuth();
  const { proposal, loading, refreshing, error, reload, confirm, cancel, reportIncidence, resolve } = useProposal(proposalId);
  useRefreshOnFocus(reload);
  useRefreshErrorToast(error, proposal !== undefined);
  const [sheet, setSheet] = useState<'confirm' | 'incidence' | null>(null);

  if (!proposal) {
    return (
      <View style={styles.centered}>
        <LoadState loading={loading} error={error ?? 'Plan no encontrado'} hasData={false} onRetry={() => void reload()}>
          {null}
        </LoadState>
      </View>
    );
  }

  const now = today();
  const isCreator = proposal.createdBy.id === user?.id;
  const active = proposal.state === 'CONFIRMADO' || proposal.state === 'EN_RECOORDINACION';
  const alertIncidence = active ? openIncidence(proposal) : null;

  const doCancel = async () => {
    try {
      await cancel();
      showToast('Plan cancelado.');
    } catch (e) {
      showToast(errorMessage(e));
    }
  };

  const confirmCancel = () =>
    Alert.alert('Cancelar plan', `¿Seguro que quieres cancelar «${proposal.title}»? El grupo dejará de verlo como pendiente.`, [
      { text: 'Volver', style: 'cancel' },
      { text: 'Cancelar plan', style: 'destructive', onPress: () => void doCancel() },
    ]);

  return (
    <>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void reload()} colors={[colors.primary]} />}
      >
        <ProposalHeader proposal={proposal} now={now} details />

        {alertIncidence ? (
          <ExpressVoteCard
            kind={proposal.state === 'EN_RECOORDINACION' ? 'RECOORDINACION' : 'AVISO'}
            who={alertIncidence.user.name}
            reason={alertIncidence.reason}
            planTitle={proposal.title}
            canResolve={isCreator}
            creatorName={proposal.createdBy.name}
            onResolve={resolve}
          />
        ) : null}

        <Text style={[typography.titleMedium, { color: colors.onSurface }]}>Franjas horarias</Text>
        {proposal.windows.length === 0 ? (
          <Text style={[typography.bodyMedium, { color: colors.onSurfaceVariant }]}>Aún no hay franjas propuestas para este plan.</Text>
        ) : (
          <View style={styles.list}>
            {proposal.windows.map((w) => (
              <VoteWindowRow key={w.id} window={w} voted={proposal.myVoteWindowId === w.id} chosen={proposal.chosenWindowId === w.id} />
            ))}
          </View>
        )}

        {isVotingOpen(proposal, now) ? (
          <Pressable accessibilityRole="button" onPress={() => navigation.navigate('Voting', { proposalId })} style={styles.goVote}>
            <Text style={[typography.titleSmall, { color: colors.onPrimary }]}>Ir a votar</Text>
          </Pressable>
        ) : null}

        {active || proposal.incidences.length > 0 ? (
          <View style={styles.list}>
            <Text style={[typography.titleMedium, { color: colors.onSurface }]}>Imprevistos</Text>
            {proposal.incidences.length === 0 ? (
              <Text style={[typography.bodyMedium, { color: colors.onSurfaceVariant }]}>Nadie ha reportado imprevistos.</Text>
            ) : (
              proposal.incidences.map((i) => <IncidenceRow key={i.id} incidence={i} />)
            )}
            {active ? <SecondaryButton title="Reportar imprevisto" icon="report-problem" onPress={() => setSheet('incidence')} /> : null}
          </View>
        ) : null}

        {isCreator && proposal.state !== 'CANCELADO' ? (
          <View style={styles.list}>
            {proposal.state === 'PROPUESTO' ? (
              <PrimaryButton title="Confirmar plan" icon="event-available" onPress={() => setSheet('confirm')} />
            ) : null}
            <SecondaryButton title="Cancelar plan" icon="event-busy" color={colors.error} onPress={confirmCancel} />
          </View>
        ) : null}
      </ScrollView>

      {sheet === 'confirm' ? (
        <ConfirmPlanDialog
          windows={proposal.windows}
          onConfirm={confirm}
          onDone={() => {
            setSheet(null);
            showToast('Plan confirmado.');
          }}
          onDismiss={() => setSheet(null)}
        />
      ) : null}
      {sheet === 'incidence' ? (
        <ReportIncidenceSheet
          onReport={reportIncidence}
          onDone={() => {
            setSheet(null);
            showToast('Imprevisto reportado.');
          }}
          onDismiss={() => setSheet(null)}
        />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: { flex: 1, backgroundColor: colors.surface },
  content: { paddingHorizontal: 16, paddingVertical: 20, gap: 20 },
  centered: { flex: 1, justifyContent: 'center', padding: 16, backgroundColor: colors.surface },
  list: { gap: 8 },
  goVote: { borderRadius: radius.xxl, backgroundColor: colors.primary, padding: 16 },
  incidenceHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  reason: { color: colors.onSurfaceVariant, marginTop: 4 },
});
```

`mobile/src/navigation/RootNavigator.tsx` — importar `VotingScreen` y `PlanDetailScreen` de `../screens/proposals/…` y registrar debajo de `CreateProposal`:

```tsx
      <AppStack.Screen name="Voting" component={VotingScreen} options={{ title: 'Votar' }} />
      <AppStack.Screen name="PlanDetail" component={PlanDetailScreen} options={{ title: 'Detalle del plan' }} />
```

- [ ] **Step 6: Ejecutar y ver que pasa** — `npm test -w mobile` → PASS. `npm run typecheck` → sin errores.

- [ ] **Step 7: Commit** — `git add mobile/src/components mobile/src/navigation/RootNavigator.tsx mobile/src/screens/proposals` → `feat(mobile): votar con alternancia, detalle del plan con confirmación, imprevistos, votación exprés y mapa`

---

### Task 9: Mobile — Inicio real y cierre de la fase

**Files:**
- Create: `mobile/src/utils/dashboard.ts`, `mobile/src/utils/__tests__/dashboard.test.ts`, `mobile/src/screens/dashboard/DashboardScreen.tsx`, `mobile/src/screens/dashboard/__tests__/DashboardScreen.test.tsx`
- Modify: `mobile/src/navigation/AppDrawer.tsx`, `README.md`
- Delete: `mobile/src/screens/PlaceholderScreen.tsx` (ya nadie lo usa)

**Interfaces:**
- Consumes: `useDashboard` + `VoteOutcome` (Task 5); `ExpressVoteCard` (Task 8); `VoteWindowRow` (Task 8); `resolveIncidences` (Task 5); `createGroup` (`src/api/groups.ts`) y `CreateGroupDialog` (`src/screens/groups/GroupDialogs.tsx`, props `{ submit: (value: string) => Promise<Group>; onDone: (group: Group) => void; onDismiss: () => void }`); `blocksForDay`, `isoDayOf`, `dayShort` (`src/utils/days.ts`); `memberCountLabel` (`src/utils/groups.ts`); `deadlineLabel`, `scheduleLabel`, `isVotingOpen`; `useRefreshOnFocus`, `useRefreshErrorToast`, `useAuth`, `today`, `showToast`, `errorMessage`; componentes existentes.
- Produces:
  - `src/utils/dashboard.ts`: `greeting(date): string`; `longDate(date): string`; `greetingLine(date, name: string | undefined): string`; `attendanceLabel(attendees: readonly Attendee[]): string`; `groupSlotLabel(g: DashboardGroup): string`; `groupMatchLabel(g: DashboardGroup): string`; `weekBlocksLabel(n: number): string`; `BLOCK_BADGE: Record<BlockType, { text; container; content }>`.
  - `DashboardScreen` (pantalla del drawer `Dashboard`).

- [ ] **Step 1: Escribir los tests que fallan**

`mobile/src/utils/__tests__/dashboard.test.ts`:

```ts
import { makeDashboard } from '../../testing/fixtures';
import { attendanceLabel, greeting, greetingLine, groupMatchLabel, groupSlotLabel, longDate, weekBlocksLabel } from '../dashboard';

it.each([
  [0, 'Buenos días'],
  [11, 'Buenos días'],
  [12, 'Buenas tardes'],
  [18, 'Buenas tardes'],
  [19, 'Buenas noches'],
  [23, 'Buenas noches'],
])('greeting a las %i → %s', (hour, expected) => {
  expect(greeting(new Date(2026, 8, 29, hour, 30))).toBe(expected);
});

it('longDate y greetingLine (primera palabra del nombre; sin nombre, solo el saludo)', () => {
  const tuesday = new Date(2026, 8, 29, 10, 0);
  expect(longDate(tuesday)).toBe('Martes, 29 de septiembre');
  expect(greetingLine(tuesday, 'Usuario de Prueba')).toBe('Buenos días, Usuario');
  expect(greetingLine(tuesday, 'Ana Pérez')).toBe('Buenos días, Ana');
  expect(greetingLine(tuesday, undefined)).toBe('Buenos días');
});

it('attendanceLabel cuenta a quien no falta', () => {
  expect(attendanceLabel(makeDashboard().nextPlan!.attendees)).toBe('1 de 2 asistirán');
});

it('resumen del grupo: singulariza (quirk 19) y «—» sin propuesta (B18)', () => {
  const [g] = makeDashboard().groups;
  expect(groupSlotLabel(g)).toBe('2 miembros · Mié 11:00 - 13:00');
  expect(groupMatchLabel(g)).toBe('100%');
  const solo = { ...g, memberCount: 1, nextWindow: null };
  expect(groupSlotLabel(solo)).toBe('1 miembro · Sin propuesta aún');
  expect(groupMatchLabel(solo)).toBe('—');
});

it('weekBlocksLabel', () => {
  expect(weekBlocksLabel(1)).toBe('Tienes 1 bloque en la semana.');
  expect(weekBlocksLabel(2)).toBe('Tienes 2 bloques en la semana.');
});
```

`mobile/src/screens/dashboard/__tests__/DashboardScreen.test.tsx`:

```tsx
import type { Group, TimeBlock } from '@hueckoapp/shared';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { ApiError } from '../../../api/client';
import * as dashboardApi from '../../../api/dashboard';
import * as groupsApi from '../../../api/groups';
import * as proposalsApi from '../../../api/proposals';
import * as scheduleApi from '../../../api/schedule';
import { makeDashboard, makeProposal } from '../../../testing/fixtures';
import { showToast } from '../../../utils/toast';
import { DashboardScreen } from '../DashboardScreen';

jest.mock('../../../api/dashboard');
jest.mock('../../../api/groups');
jest.mock('../../../api/proposals');
jest.mock('../../../api/schedule');
jest.mock('../../../hooks/useRefreshOnFocus', () => ({ useRefreshOnFocus: jest.fn() }));
jest.mock('../../../utils/toast', () => ({ showToast: jest.fn() }));
// Hoy es martes 29 de septiembre de 2026 a las 10:00.
jest.mock('../../../utils/clock', () => ({ today: () => new Date(2026, 8, 29, 10, 0) }));
jest.mock('../../../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1', name: 'Usuario de Prueba', email: 'test@test.com' } }),
}));

const dashboard = dashboardApi as jest.Mocked<typeof dashboardApi>;
const groups = groupsApi as jest.Mocked<typeof groupsApi>;
const proposals = proposalsApi as jest.Mocked<typeof proposalsApi>;
const schedule = scheduleApi as jest.Mocked<typeof scheduleApi>;
const navigation = { navigate: jest.fn() } as any;

const block = (over: Partial<TimeBlock>): TimeBlock => ({
  id: 'b', userId: 'u1', label: 'Bloque', type: 'CLASE', startTime: '08:00', endTime: '10:00',
  isRecurring: true, dayOfWeek: 1, date: null, ...over,
});
// Bloques de la semilla: lunes y miércoles (hoy, martes, no hay nada).
const SEED_BLOCKS = [
  block({ id: 'b1', label: 'Clase de Android', dayOfWeek: 1 }),
  block({ id: 'b2', label: 'Trabajo Part-time', dayOfWeek: 3, startTime: '14:00', endTime: '16:00' }),
];
const renderScreen = () => render(<DashboardScreen navigation={navigation} route={{} as any} />);

beforeEach(() => {
  jest.clearAllMocks();
  dashboard.getDashboard.mockResolvedValue(makeDashboard());
  schedule.listTimeBlocks.mockResolvedValue(SEED_BLOCKS);
});

it('pinta los valores de la semilla (domain spec §2.2, UI spec §2.3)', async () => {
  await renderScreen();
  expect(await screen.findByText('Buenos días, Usuario')).toBeTruthy();
  expect(screen.getByText('Martes, 29 de septiembre')).toBeTruthy();
  expect(screen.getByText('Esto es lo que pasa hoy en tus grupos y horarios.')).toBeTruthy();
  // Alerta (G5, aviso): quien creó el plan puede decidir.
  expect(await screen.findByText('Aviso de imprevisto')).toBeTruthy();
  expect(screen.getByText('Ana reportó un imprevisto en «Reunión de avance del proyecto»')).toBeTruthy();
  expect(screen.getByText('Mantener')).toBeTruthy();
  // Métricas.
  expect(screen.getByText('Grupos activos')).toBeTruthy();
  expect(screen.getByText('Votaciones abiertas')).toBeTruthy();
  expect(screen.getByText('6 h')).toBeTruthy();
  expect(screen.getByText('Donde coincide el 80% o más')).toBeTruthy();
  expect(screen.getByText('Bloques registrados')).toBeTruthy();
  // Próximo plan confirmado (franja elegida y fecha, C2/C11).
  expect(screen.getByText('Mié 30 sep · 11:00 - 13:00')).toBeTruthy();
  expect(screen.getByText('Biblioteca central')).toBeTruthy();
  expect(screen.getByText('1 de 2 asistirán')).toBeTruthy();
  // Horario de hoy: martes sin bloques.
  expect(screen.getByText('Nada en la agenda para hoy (Mar)')).toBeTruthy();
  expect(screen.getByText('Tienes 2 bloques en la semana.')).toBeTruthy();
  // Mis grupos.
  expect(screen.getByText('2 miembros · Mié 11:00 - 13:00')).toBeTruthy();
  expect(screen.getByText('100%')).toBeTruthy();
  // Votaciones en curso.
  expect(screen.getByText('Repaso antes de la entrega')).toBeTruthy();
  expect(screen.getByText('Cierra: Mar 29 sep, 20:00')).toBeTruthy();
  expect(screen.getByText('Mar · 16:00 - 18:00')).toBeTruthy();
  expect(screen.getByText('1 voto')).toBeTruthy();
});

it('horario de hoy con sus bloques y la etiqueta de cada tipo', async () => {
  schedule.listTimeBlocks.mockResolvedValue([
    block({ id: 't1', label: 'Tutoría', dayOfWeek: 2, startTime: '11:00', endTime: '12:00' }),
    block({ id: 't2', label: 'Hueco libre', type: 'LIBRE', dayOfWeek: 2, startTime: '15:00', endTime: '16:00' }),
  ]);
  await renderScreen();
  expect(await screen.findByText('Tutoría')).toBeTruthy();
  expect(screen.getByText('11:00 - 12:00')).toBeTruthy();
  expect(screen.getByText('Ocupado')).toBeTruthy();
  expect(screen.getByText('Libre')).toBeTruthy();
});

it('sin datos muestra los estados vacíos', async () => {
  dashboard.getDashboard.mockResolvedValue(
    makeDashboard({
      metrics: { activeGroups: 0, openVotes: 0, matchingHours: 0, totalBlocks: 0 },
      nextPlan: null,
      groups: [],
      pendingVotes: [],
      expressAlert: null,
    }),
  );
  schedule.listTimeBlocks.mockResolvedValue([]);
  await renderScreen();
  expect(await screen.findByText('Sin planes confirmados')).toBeTruthy();
  expect(screen.getByText('Todavía no perteneces a ningún grupo.')).toBeTruthy();
  expect(screen.getByText('No hay votaciones activas')).toBeTruthy();
  expect(screen.getByText('0 h')).toBeTruthy();
  expect(screen.queryByText('Aviso de imprevisto')).toBeNull();
  await fireEvent.press(screen.getByText('Ir a mis grupos'));
  expect(navigation.navigate).toHaveBeenCalledWith('Groups');
});

it('votar desde «Votaciones en curso» usa la misma alternancia que Votar (G1)', async () => {
  proposals.voteWindow.mockResolvedValue(makeProposal({ myVoteWindowId: 'w_22' }));
  await renderScreen();
  await fireEvent.press(await screen.findByText('Jue · 10:00 - 12:00'));
  await waitFor(() => expect(showToast).toHaveBeenCalledWith('Tu voto ha sido registrado.'));
  expect(proposals.voteWindow).toHaveBeenCalledWith('prop_2', 'w_22');
  expect(screen.getByLabelText('Tu voto')).toBeTruthy();
});

it('«Nuevo grupo» abre ahí mismo el diálogo de crear grupo y recarga Inicio (quirk 5)', async () => {
  const created: Group = {
    id: 'g2', name: 'Estudio', description: '', memberCount: 1, availabilityThreshold: 80, inviteCode: 'ABCDEFGH', members: [],
  };
  groups.createGroup.mockResolvedValue(created);
  await renderScreen();
  await fireEvent.press(await screen.findByText('Nuevo grupo'));
  expect(screen.getByText('Crear Nuevo Grupo')).toBeTruthy();
  await fireEvent.changeText(screen.getByLabelText('Nombre del grupo'), '  Estudio ');
  await fireEvent.press(screen.getByText('Crear'));
  await waitFor(() => expect(showToast).toHaveBeenCalledWith('Grupo «Estudio» creado.'));
  expect(groups.createGroup).toHaveBeenCalledWith({ name: 'Estudio' });
  expect(navigation.navigate).not.toHaveBeenCalled();
  await waitFor(() => expect(dashboard.getDashboard).toHaveBeenCalledTimes(2));
  expect(screen.queryByText('Crear Nuevo Grupo')).toBeNull();
});

it('las tarjetas y accesos navegan a Grupos, Horario, el plan y el grupo', async () => {
  await renderScreen();
  await fireEvent.press(await screen.findByText('Grupos activos'));
  expect(navigation.navigate).toHaveBeenLastCalledWith('Groups');
  await fireEvent.press(screen.getByText('Horas coincidentes'));
  expect(navigation.navigate).toHaveBeenLastCalledWith('Schedule');
  await fireEvent.press(screen.getByText('Ver todo'));
  expect(navigation.navigate).toHaveBeenLastCalledWith('Schedule');
  await fireEvent.press(screen.getByText('Gestionar'));
  expect(navigation.navigate).toHaveBeenLastCalledWith('Groups');
  await fireEvent.press(screen.getByText('Editar horario'));
  expect(navigation.navigate).toHaveBeenLastCalledWith('Schedule');
  await fireEvent.press(screen.getByText('1 de 2 asistirán'));
  expect(navigation.navigate).toHaveBeenLastCalledWith('PlanDetail', { proposalId: 'prop_1' });
  await fireEvent.press(screen.getByText('2 miembros · Mié 11:00 - 13:00'));
  expect(navigation.navigate).toHaveBeenLastCalledWith('GroupDetail', { groupId: 'g1', name: 'Proyecto Integrador' });
});

it('«Mantener» en la alerta resuelve y recarga Inicio', async () => {
  proposals.resolveIncidences.mockResolvedValue(makeProposal());
  await renderScreen();
  await fireEvent.press(await screen.findByText('Mantener'));
  await waitFor(() => expect(dashboard.getDashboard).toHaveBeenCalledTimes(2));
  expect(proposals.resolveIncidences).toHaveBeenCalledWith('prop_1', { newState: 'CONFIRMADO' });
  expect(showToast).toHaveBeenCalledWith('Votación exprés registrada: mantener.');
});

it('si la primera carga falla muestra el error con «Reintentar»', async () => {
  dashboard.getDashboard.mockRejectedValueOnce(new ApiError(0, 'NETWORK_ERROR', 'No se pudo conectar con el servidor. Revisa tu conexión.'));
  await renderScreen();
  expect(await screen.findByText('No se pudo conectar con el servidor. Revisa tu conexión.')).toBeTruthy();
  await fireEvent.press(screen.getByText('Reintentar'));
  expect(await screen.findByText('6 h')).toBeTruthy();
});
```

- [ ] **Step 2: Ejecutar y ver que falla** — `npm test -w mobile -- dashboard Dashboard` → FAIL (módulos inexistentes).

- [ ] **Step 3: Utilidades** — `mobile/src/utils/dashboard.ts`:

```ts
import type { Attendee, BlockType, DashboardGroup } from '@hueckoapp/shared';

import { colors } from '../theme';
import { dayShort } from './days';
import { memberCountLabel } from './groups';

const DAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/** Hora 0–11 «Buenos días», 12–18 «Buenas tardes», 19–23 «Buenas noches» (domain spec §2.2). */
export function greeting(date: Date): string {
  const hour = date.getHours();
  if (hour < 12) return 'Buenos días';
  if (hour < 19) return 'Buenas tardes';
  return 'Buenas noches';
}

/** «Martes, 29 de septiembre». */
export const longDate = (date: Date) => `${DAYS[date.getDay()]}, ${date.getDate()} de ${MONTHS[date.getMonth()]}`;

/** «Buenos días, Usuario»: la primera palabra del nombre; sin nombre, solo el saludo. */
export function greetingLine(date: Date, name: string | undefined): string {
  const first = (name ?? '').trim().split(/\s+/)[0];
  return first ? `${greeting(date)}, ${first}` : greeting(date);
}

/** «1 de 2 asistirán»: cuentan todos menos quien no podrá ir. */
export const attendanceLabel = (attendees: readonly Attendee[]) =>
  `${attendees.filter((a) => a.status !== 'NO_ASISTE').length} de ${attendees.length} asistirán`;

/** «2 miembros · Mié 11:00 - 13:00» o «… · Sin propuesta aún» (quirk 19: singulariza). */
export const groupSlotLabel = (g: DashboardGroup) =>
  `${memberCountLabel(g.memberCount)} · ${
    g.nextWindow ? `${dayShort(g.nextWindow.dayOfWeek)} ${g.nextWindow.startTime} - ${g.nextWindow.endTime}` : 'Sin propuesta aún'
  }`;

/** «100%», o «—» si el grupo no tiene propuesta (B18: el umbral no es una coincidencia real). */
export const groupMatchLabel = (g: DashboardGroup) => (g.nextWindow ? `${g.nextWindow.availabilityPercentage}%` : '—');

export const weekBlocksLabel = (n: number) => `Tienes ${n} ${n === 1 ? 'bloque' : 'bloques'} en la semana.`;

type BadgeStyle = { text: string; container: string; content: string };
const BUSY: BadgeStyle = { text: 'Ocupado', container: colors.surfaceContainerHigh, content: colors.onSurfaceVariant };

// Etiqueta de cada bloque en «Mi horario de hoy» (UI spec §2.3 punto 5).
export const BLOCK_BADGE: Record<BlockType, BadgeStyle> = {
  LIBRE: { text: 'Libre', container: colors.successContainer, content: colors.onSuccessContainer },
  PUNTUAL: { text: 'Puntual', container: colors.secondaryContainer, content: colors.onSecondaryContainer },
  CLASE: BUSY,
  TRABAJO: BUSY,
};
```

- [ ] **Step 4: Pantalla** — `mobile/src/screens/dashboard/DashboardScreen.tsx` (UI spec §2.3 en el orden de sus ítems; «Nuevo grupo» abre el diálogo, quirk 5; recarga al volver y toast si falla una recarga):

```tsx
import { MaterialIcons } from '@expo/vector-icons';
import type { Group, ProposalWithGroup, UpcomingPlan } from '@hueckoapp/shared';
import { useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { errorMessage } from '../../api/client';
import { createGroup } from '../../api/groups';
import { resolveIncidences } from '../../api/proposals';
import {
  Avatar, Badge, EmptyState, HueckoCard, LoadState, PrimaryButton, SecondaryButton, SectionHeader, VoteWindowRow, type IconName,
} from '../../components';
import { useAuth } from '../../context/AuthContext';
import { useDashboard } from '../../hooks/useDashboard';
import { useRefreshErrorToast } from '../../hooks/useRefreshErrorToast';
import { useRefreshOnFocus } from '../../hooks/useRefreshOnFocus';
import type { DrawerScreen } from '../../navigation/types';
import { categoryColor, colors, typography } from '../../theme';
import { today } from '../../utils/clock';
import { attendanceLabel, BLOCK_BADGE, greetingLine, groupMatchLabel, groupSlotLabel, longDate, weekBlocksLabel } from '../../utils/dashboard';
import { blocksForDay, dayShort, isoDayOf } from '../../utils/days';
import { deadlineLabel, isVotingOpen, scheduleLabel } from '../../utils/proposals';
import { showToast } from '../../utils/toast';
import { CreateGroupDialog } from '../groups/GroupDialogs';
import { ExpressVoteCard } from '../proposals/ExpressVoteCard';

type MetricProps = { icon: IconName; value: string; label: string; caption: string; onPress: () => void };

function MetricCard({ icon, value, label, caption, onPress }: MetricProps) {
  return (
    <HueckoCard onPress={onPress} padding={16} style={styles.flex}>
      <MaterialIcons name={icon} size={20} color={colors.primary} />
      <Text style={[typography.displaySmall, styles.metricValue]}>{value}</Text>
      <Text style={[typography.titleSmall, { color: colors.onSurface }]}>{label}</Text>
      <Text style={[typography.bodySmall, styles.caption]}>{caption}</Text>
    </HueckoCard>
  );
}

function UpcomingPlanCard({ plan, meId, onPress }: { plan: UpcomingPlan; meId: string | undefined; onPress: () => void }) {
  return (
    <HueckoCard containerColor={colors.primaryContainer} borderColor={colors.primaryContainer} onPress={onPress}>
      <Text style={[typography.labelMedium, styles.onContainer]}>{scheduleLabel(plan) ?? ''}</Text>
      <Text style={[typography.headlineSmall, styles.onContainer, styles.planTitle]}>{plan.title}</Text>
      <View style={[styles.iconLine, styles.planPlace]}>
        <MaterialIcons name="place" size={16} color={colors.onPrimaryContainer} />
        <Text style={[typography.bodyMedium, styles.onContainer]}>{plan.location?.name ?? 'Lugar por definir'}</Text>
      </View>
      <View style={[styles.iconLine, styles.planAttendance]}>
        <MaterialIcons name="groups" size={16} color={colors.onPrimaryContainer} />
        <Text style={[typography.bodyMedium, styles.onContainer]}>{attendanceLabel(plan.attendees)}</Text>
      </View>
      <View style={styles.avatars}>
        {plan.attendees.slice(0, 6).map((a, i) => (
          <Avatar key={a.user.id} name={a.user.id === meId ? 'Tú' : a.user.name} color={categoryColor(i)} />
        ))}
      </View>
    </HueckoCard>
  );
}

function PendingVoteCard({ proposal, now, disabled, onVote }: {
  proposal: ProposalWithGroup;
  now: Date;
  disabled: boolean;
  onVote: (windowId: string) => void;
}) {
  const open = isVotingOpen(proposal, now);
  return (
    <HueckoCard>
      <Text style={[typography.labelMedium, { color: colors.primary }]}>{proposal.groupName || 'Grupo'}</Text>
      <Text style={[typography.titleLarge, styles.pendingTitle]}>{proposal.title}</Text>
      <Text style={[typography.bodySmall, styles.caption]}>{deadlineLabel(proposal.votingDeadline, now)}</Text>
      <View style={styles.pendingWindows}>
        {proposal.windows.map((w) => (
          <VoteWindowRow
            key={w.id}
            window={w}
            voted={proposal.myVoteWindowId === w.id}
            countStyle="plain"
            onPress={open ? () => onVote(w.id) : undefined}
            disabled={disabled}
          />
        ))}
      </View>
    </HueckoCard>
  );
}

export function DashboardScreen({ navigation }: DrawerScreen<'Dashboard'>) {
  const { user } = useAuth();
  const { dashboard, loaded, loading, refreshing, error, reload, toggleVote, blocks } = useDashboard();
  const [now, setNow] = useState(today);
  // Al volver a Inicio se recarga todo y se actualiza «hoy» (saludo, horario del día y plazos).
  const refresh = useCallback(async () => {
    setNow(today());
    await reload();
  }, [reload]);
  useRefreshOnFocus(refresh);
  useRefreshErrorToast(error, loaded);
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [voting, setVoting] = useState(false);

  const goGroups = () => navigation.navigate('Groups');
  const goSchedule = () => navigation.navigate('Schedule');

  const vote = async (proposalId: string, windowId: string) => {
    if (voting) return;
    setVoting(true);
    try {
      const outcome = await toggleVote(proposalId, windowId);
      showToast(outcome === 'voted' ? 'Tu voto ha sido registrado.' : 'Tu voto se ha retirado.');
    } catch (e) {
      showToast(errorMessage(e));
    } finally {
      setVoting(false);
    }
  };

  const onGroupCreated = (group: Group) => {
    setCreatingGroup(false);
    showToast(`Grupo «${group.name}» creado.`);
    void reload();
  };

  const isoToday = isoDayOf(now);
  const todayBlocks = blocksForDay(blocks, isoToday, now);

  return (
    <>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} colors={[colors.primary]} />}
      >
        <View>
          <Text style={[typography.bodySmall, styles.caption]}>{longDate(now)}</Text>
          <Text style={[typography.headlineLarge, styles.greeting]}>{greetingLine(now, user?.name)}</Text>
          <Text style={[typography.bodyMedium, styles.subtitle]}>Esto es lo que pasa hoy en tus grupos y horarios.</Text>
        </View>

        <LoadState loading={loading} error={error} hasData={loaded} onRetry={() => void reload()}>
          {dashboard ? (
            <>
              {dashboard.expressAlert ? (
                <ExpressVoteCard
                  kind={dashboard.expressAlert.kind}
                  who={dashboard.expressAlert.who}
                  reason={dashboard.expressAlert.reason}
                  planTitle={dashboard.expressAlert.planTitle}
                  canResolve={dashboard.expressAlert.canResolve}
                  creatorName={dashboard.expressAlert.createdBy.name}
                  onResolve={(input) => resolveIncidences(dashboard.expressAlert!.proposalId, input)}
                  onResolved={() => void reload()}
                />
              ) : null}

              <View style={styles.grid}>
                <View style={styles.gridRow}>
                  <MetricCard icon="groups" value={String(dashboard.metrics.activeGroups)} label="Grupos activos" caption="Con disponibilidad sincronizada" onPress={goGroups} />
                  <MetricCard icon="how-to-vote" value={String(dashboard.metrics.openVotes)} label="Votaciones abiertas" caption="Planes pendientes de hora" onPress={goGroups} />
                </View>
                <View style={styles.gridRow}>
                  <MetricCard icon="schedule" value={`${dashboard.metrics.matchingHours} h`} label="Horas coincidentes" caption="Donde coincide el 80% o más" onPress={goSchedule} />
                  <MetricCard icon="calendar-month" value={String(dashboard.metrics.totalBlocks)} label="Mi horario" caption="Bloques registrados" onPress={goSchedule} />
                </View>
              </View>

              <View style={styles.section}>
                <SectionHeader title="Próximo plan confirmado" />
                {dashboard.nextPlan ? (
                  <UpcomingPlanCard
                    plan={dashboard.nextPlan}
                    meId={user?.id}
                    onPress={() => navigation.navigate('PlanDetail', { proposalId: dashboard.nextPlan!.id })}
                  />
                ) : (
                  <EmptyState
                    title="Sin planes confirmados"
                    description="Propón un plan en tus grupos y Huecko sugerirá los mejores horarios."
                    icon="event-busy"
                    actionLabel="Ir a mis grupos"
                    onAction={goGroups}
                  />
                )}
              </View>

              <HueckoCard>
                <SectionHeader title="Mi horario de hoy" actionLabel="Ver todo" onAction={goSchedule} />
                <View style={styles.cardGap} />
                {todayBlocks.length === 0 ? (
                  <View style={styles.freeDay}>
                    <MaterialIcons name="event-available" size={22} color={colors.primary} />
                    <View style={styles.flex}>
                      <Text style={[typography.titleSmall, { color: colors.onSurface }]}>{`Nada en la agenda para hoy (${dayShort(isoToday)})`}</Text>
                      <Text style={[typography.bodySmall, styles.caption]}>{weekBlocksLabel(dashboard.metrics.totalBlocks)}</Text>
                    </View>
                  </View>
                ) : (
                  <View style={styles.todayList}>
                    {todayBlocks.map((b, i) => {
                      const badge = BLOCK_BADGE[b.type];
                      return (
                        <View key={b.id} style={styles.blockRow}>
                          <View style={[styles.dot, { backgroundColor: categoryColor(i) }]} />
                          <View style={styles.flex}>
                            <Text style={[typography.titleSmall, { color: colors.onSurface }]}>{b.label}</Text>
                            <Text style={[typography.bodySmall, styles.caption]}>{`${b.startTime} - ${b.endTime}`}</Text>
                          </View>
                          <Badge text={badge.text} containerColor={badge.container} contentColor={badge.content} />
                        </View>
                      );
                    })}
                  </View>
                )}
              </HueckoCard>

              <HueckoCard>
                <SectionHeader title="Mis grupos" actionLabel="Gestionar" onAction={goGroups} />
                <View style={styles.cardGap} />
                {dashboard.groups.length === 0 ? (
                  <Text style={[typography.bodyMedium, styles.caption]}>Todavía no perteneces a ningún grupo.</Text>
                ) : (
                  <View style={styles.groupList}>
                    {dashboard.groups.map((g, i) => (
                      <Pressable
                        key={g.id}
                        accessibilityRole="button"
                        onPress={() => navigation.navigate('GroupDetail', { groupId: g.id, name: g.name })}
                        style={styles.groupRow}
                      >
                        <Avatar name={g.name} color={categoryColor(i)} size={40} />
                        <View style={styles.flex}>
                          <Text style={[typography.titleSmall, { color: colors.onSurface }]}>{g.name}</Text>
                          <Text style={[typography.bodySmall, styles.caption]}>{groupSlotLabel(g)}</Text>
                        </View>
                        <Badge text={groupMatchLabel(g)} containerColor={colors.primaryContainer} contentColor={colors.onPrimaryContainer} />
                      </Pressable>
                    ))}
                  </View>
                )}
              </HueckoCard>

              <SectionHeader title="Votaciones en curso" subtitle="Opciones generadas a partir de la disponibilidad del grupo." />
              {dashboard.pendingVotes.length === 0 ? (
                <EmptyState
                  title="No hay votaciones activas"
                  description="Cuando alguien proponga un plan podrás elegir aquí tu franja preferida."
                  icon="how-to-vote"
                  actionLabel="Ver grupos"
                  onAction={goGroups}
                />
              ) : (
                dashboard.pendingVotes.map((p) => (
                  <PendingVoteCard key={p.id} proposal={p} now={now} disabled={voting} onVote={(windowId) => void vote(p.id, windowId)} />
                ))
              )}

              <View style={styles.quickActions}>
                <SecondaryButton title="Nuevo grupo" icon="group-add" style={styles.flex} onPress={() => setCreatingGroup(true)} />
                <PrimaryButton title="Editar horario" icon="edit-calendar" style={styles.flex} onPress={goSchedule} />
              </View>
            </>
          ) : null}
        </LoadState>
      </ScrollView>
      {creatingGroup ? (
        <CreateGroupDialog
          submit={(name) => createGroup({ name: name.trim() })}
          onDone={onGroupCreated}
          onDismiss={() => setCreatingGroup(false)}
        />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: { flex: 1, backgroundColor: colors.surface },
  content: { paddingHorizontal: 16, paddingVertical: 20, gap: 24 },
  caption: { color: colors.onSurfaceVariant },
  greeting: { color: colors.onSurface, marginTop: 4 },
  subtitle: { color: colors.onSurfaceVariant, marginTop: 6 },
  grid: { gap: 12 },
  gridRow: { flexDirection: 'row', gap: 12 },
  metricValue: { color: colors.onSurface, marginTop: 12 },
  section: { gap: 12 },
  onContainer: { color: colors.onPrimaryContainer },
  planTitle: { marginTop: 6 },
  iconLine: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  planPlace: { marginTop: 12 },
  planAttendance: { marginTop: 4 },
  avatars: { flexDirection: 'row', gap: 6, marginTop: 16 },
  cardGap: { height: 14 },
  freeDay: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  todayList: { gap: 10 },
  blockRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  groupList: { gap: 14 },
  groupRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  pendingTitle: { color: colors.onSurface, marginTop: 4, marginBottom: 2 },
  pendingWindows: { gap: 8, marginTop: 16 },
  quickActions: { flexDirection: 'row', gap: 10 },
});
```

- [ ] **Step 5: Navegación** — en `mobile/src/navigation/AppDrawer.tsx`: quitar el import de `PlaceholderScreen`, añadir `import { DashboardScreen } from '../screens/dashboard/DashboardScreen';` y reemplazar el `Drawer.Screen` de `Dashboard` (el que renderiza `PlaceholderScreen` como hijo) por:

```tsx
      <Drawer.Screen name="Dashboard" component={DashboardScreen} options={{ title: 'Inicio', drawerIcon: icon('dashboard') }} />
```

Borrar el marcador, que ya nadie usa: `git rm mobile/src/screens/PlaceholderScreen.tsx`.

- [ ] **Step 6: Ejecutar y ver que pasa** — `npm test -w mobile` → PASS. `npm run typecheck` → sin errores.

- [ ] **Step 7: Verificación final de la fase**
  - `npm test` (raíz: backend + mobile) → verde.
  - `npm run typecheck` → verde.
  - `cd mobile && OUT="$(mktemp -d)" && npx expo export --platform android --output-dir "$OUT" && rm -rf "$OUT"` → empaqueta sin errores (confirma que `@react-native-community/datetimepicker` y `expo-location` resuelven).
  - `cd mobile && npx expo-doctor` → sin problemas (incluye la comprobación de versiones de las dos dependencias nuevas y del plugin de `app.json`).
  - Prueba manual (emulador o Expo Go; la ubicación en el emulador se fija en «Extended controls → Location»): `rm -f backend/data/hueckoapp.db*`, `npm run seed -w backend`, `npm run backend`, `npm run mobile`; entrar con `test@test.com` / `password123`. Inicio: «Buenos días/tardes/noches, Usuario», «Aviso de imprevisto» de Ana con los tres botones, «6 h», «Reunión de avance del proyecto» en el próximo plan con «1 de 2 asistirán», «Repaso antes de la entrega» en «Votaciones en curso»; votar el jueves y volver a tocarlo (toasts «Tu voto ha sido registrado.» / «Tu voto se ha retirado.»). «Nuevo grupo» abre el diálogo ahí mismo. Grupos → «Proyecto Integrador» → «Planes»: sin «Votación» ni llamados; «Crear propuesta» → título, «Usar mi ubicación actual» (acepta el permiso; con el permiso denegado sale el mensaje y se puede escribir el lugar), plazo con el selector nativo (fecha y luego hora) → «Propuesta creada.» y aparece arriba de la lista. «Votar» → «Agregar franja horaria» con «9:00» muestra «Formato HH:mm». «Ver detalles» de la reunión → «Abrir en el mapa» solo si tiene coordenadas; «Mantener» en el aviso lo quita. Nuevo bloque puntual → «Fecha» abre el selector nativo.

- [ ] **Step 8: README** — en la hoja de ruta marcar `- [x] **Fase 3** — Propuestas, votación y ubicación`. En «Temas del curso y dónde se aplican»:
  - fila **Hooks**: «`useState`/`useEffect`, `AuthContext` y hooks propios en `mobile/src/hooks/`: genéricos (`useResource`, `useAction`, `useRefreshOnFocus`, `useRefreshErrorToast`) y de dominio (`useSchedule`, `useGroups`, `useGroup`, `useAvailability`, `useProposals`, `useProposal`, `useDashboard`, `useCurrentLocation`)»;
  - fila **Localización**: «`expo-location` en `mobile/src/hooks/useCurrentLocation.ts`: permiso de ubicación en primer plano (texto del permiso en el plugin de `app.json`), posición actual y geocodificación inversa para el lugar de un plan; «Abrir en el mapa» con `Linking` (`geo:` en Android)».

- [ ] **Step 9: Commit** — `git add mobile/src/utils/dashboard.ts mobile/src/utils/__tests__/dashboard.test.ts mobile/src/screens/dashboard mobile/src/navigation/AppDrawer.tsx README.md` (el borrado de `PlaceholderScreen.tsx` ya quedó preparado con `git rm`) → `feat(mobile): inicio con métricas, próximo plan, votaciones en curso y alerta exprés`

---

## Cobertura de la spec (autorrevisión)

| Requisito | Task |
|---|---|
| Domain §2.2 fórmulas del Inicio y valores esperados de la semilla (incl. tras Reprogramar/Cancelar/Mantener) | 4 (`dashboard.test.ts`), 9 (`DashboardScreen.test.tsx`) |
| Domain §2.4 regla de voto excluyente con alternancia · crear propuesta · añadir franja | 2 (servidor), 5 (`useProposal.toggleVote`), 7, 8 |
| Domain §3.2 semilla `prop_1`/`prop_2` normalizada | 4 |
| G1 `PUT /vote` idempotente + `DELETE` desde la app | 2, 5, 8, 9 |
| G2 `POST /proposals/:id/windows` con % del servidor y `409` | 1 (`windowAvailability`), 2, 8 |
| G3 sin llamados a la votación (UI y contrato) | 3 (api.md), 7 (PlansTab + test) |
| G4 resolver con `PROPUESTO` (borra votos, plazo nuevo) | 3, 8 (`ExpressVoteCard`) |
| G5 alerta exprés (`RECOORDINACION` / `AVISO`) | 3 (api.md), 4, 8, 9 |
| G6 criticidad en el servidor | 1, 3 |
| G7 `GET /me/dashboard` (+ `/me/upcoming-plans`) | 4, 5, 9 |
| G8 recuento y mi voto · G9 textos de estado | 2, 5 (`STATE_BADGE`), 8 |
| C1 plazo ISO futuro y `409 VOTING_CLOSED` | 1, 2, 3, 7 (validación en cliente), 8 |
| C2 confirmar con desempate y `409 NO_VOTES` | 1 (`pickWinner`), 3, 8 (`ConfirmPlanDialog`) |
| C3 cancelar · C4 incidencias | 3, 8 |
| C5 «3 mejores franjas» | 1 (`bestWindows`), 2, 7 (opción por defecto) |
| C10 `createdAt` y orden | 1, 2 |
| C11 `scheduledAt` y `/me/upcoming-plans` ordenado | 1 (`nextOccurrence`), 3, 4 |
| B7 una sola fuente de verdad · B8 toast al retirar · B11 votar solo abierto · B15 porcentajes semilla · B16/B18 (D2) · B17 franja elegida · B19/B20 · B23 «El título no puede estar vacío.» · B24 | 5, 8, 2, 4, 4/9, 4, 4/8, 2, 1/8 |
| UI §1.4 transiciones: GroupDetail → PlanDetail/Voting, PlanDetail → Voting, Inicio → Grupos/Horario | 7, 8, 9 |
| UI §2.3 Inicio completo · §2.6 planes y CreatePlanBottomSheet · §2.7 Votar y AddWindowBottomSheet · §2.8 Detalle · §3 componentes (`VoteWindowRow` unificado, `BottomSheet`) | 9, 7, 8, 8, 8 |
| Quirks 2 (toasts visibles), 5 (Nuevo grupo abre diálogo), 6 (llamados fuera), 13 (validar franja), 14 (selector de fecha), 17 (alternancia), 19 (singular), 20 (etiqueta de franja), 21 (badge Confirmado), 24 (no encontrado con cabecera) | 7/8/9, 9, 7, 7/8, 6/7, 5/8, 9, 5, 5, 7/8 |
| UI §7 tildes corregidas (copia exacta en tests) | 7, 8, 9 |
| Selector nativo `DateTimeField` en propuesta, reprogramar y «Nuevo bloque» | 6, 7, 8 |
| Localización: plugin + permiso, `useCurrentLocation`, «Usar mi ubicación actual», «Abrir en el mapa» | 6, 7, 8 |
| Recarga al volver (GroupDetail/Planes, Votar, Detalle, Inicio) y toast si falla una recarga | 5 (`useRefreshErrorToast`), 7, 8, 9 |
| `docs/api.md`, `shared/index.d.ts`, README (roadmap, cuentas demo, temas del curso) | 1–4, 9 |
