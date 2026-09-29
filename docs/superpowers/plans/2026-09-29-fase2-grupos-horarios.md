# Fase 2 — Grupos, horarios y cruce de disponibilidad: plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** «Mi horario» (bloques recurrentes y puntuales), grupos (crear, unirse con código, miembros, imprescindibles, salir) y el cruce de disponibilidad del grupo («Huecos») de punta a punta: backend con SQLite y app con hooks propios y pantallas fieles a la UI spec.

**Architecture:** El backend añade dos migraciones (bloques; grupos + miembros), un router por recurso montado detrás de `requireAuth`, y porta `AvailabilityMatcher.kt` como función pura en su propio módulo (`src/availability/matcher.ts`), con una capa fina (`groupAvailability`) que aplica las reglas nuevas (solo recurrentes, `LIBRE` no ocupa). La app consume la API con módulos tipados (`src/api/schedule.ts`, `src/api/groups.ts`) a través de dos hooks genéricos (`useResource` para leer, `useAction` para escribir) y hooks de dominio (`useSchedule`, `useGroups`, `useGroup`, `useAvailability`); sin librería de estado nueva. `GroupDetail` y `AddSchedule` se apilan sobre el drawer con cabecera nativa; el detalle usa `material-top-tabs` (Planes, Huecos, Miembros).

**Tech Stack:** Express 5, TypeScript, `node:sqlite`, zod 4, Vitest + Supertest, tsx · Expo SDK 57, React Navigation 7 (native-stack, drawer, material-top-tabs + react-native-pager-view), axios, expo-clipboard, jest-expo + @testing-library/react-native 14.

**Spec:** `docs/superpowers/specs/2026-09-29-ui-screens-spec.md` (§1, §2.4, §2.5, §2.6 miembros, §2.9, §2.10, §3–§7) y `docs/superpowers/specs/2026-09-29-domain-logic-spec.md` (§1 con los ejemplos E1–E6, §2.3, §2.5, §3.2, §5 G10–G13 y C5–C7, §6). Contrato: `docs/api.md` y `shared/index.d.ts`. Plan anterior (lo que ya existe): `docs/superpowers/plans/2026-09-29-fase1-auth-navegacion.md`.

## Global Constraints

- **Rama:** trabajar en `feature/fase2-grupos-horarios`, creada desde `develop` (`git switch -c feature/fase2-grupos-horarios develop`). Nunca commits en `develop`/`main`.
- Idioma de la UI y de los mensajes de error: español, **con tildes correctas** (se corrigen las faltas del original, UI spec §7). Las mayúsculas tipo título de los diálogos se conservan: «Crear Nuevo Grupo», «Unirse a un Grupo», «Código de Invitación».
- Días de la semana: entero 1–7 (1 = lunes, 7 = domingo). Etiquetas cortas `Lun, Mar, Mié, Jue, Vie, Sáb, Dom`; largas `Lunes, Martes, Miércoles, Jueves, Viernes, Sábado, Domingo`.
- Hora del día `HH:mm` con la regex `^([01]\d|2[0-3]):[0-5]\d$` (00:00–23:59, dos dígitos) en cliente y servidor; `startTime < endTime` estricto. Fecha sola `YYYY-MM-DD`.
- IDs: `crypto.randomUUID()`. Forma de error del backend: `{ "error": { "code", "message", "details" } }` (`backend/src/middleware/errors.ts`). Errores de negocio con `throw new ApiError(status, code, message)`.
- `node:sqlite` **no acepta booleanos** como parámetro: se guardan como `1`/`0` y se leen con `=== 1`. Varias sentencias en una transacción: `db.exec('BEGIN')` … `COMMIT`/`ROLLBACK`.
- Migraciones **solo se añaden al final** de `backend/src/db/migrations.ts`; nunca se edita una publicada (la 0 es `users`).
- Los tests **nunca** dependen de la semilla ni la ejecutan; cada test crea sus datos con `makeTestApp()`/`registerUser()`.
- Navegación: React Navigation (no Expo Router). El drawer mantiene Inicio, Horario, Grupos, Perfil. Las pantallas apiladas (`AddSchedule`, `GroupDetail`) usan la cabecera nativa del stack con botón atrás.
- Estado: hooks propios + Context existente. **No** se añade ninguna librería de estado ni de datos (nada de Zustand, Redux, TanStack Query).
- Paquetes de `mobile/` con `npx expo install <pkg>` ejecutado **dentro de `mobile/`**. Paquetes de `backend/` con `npm install <pkg> -w backend` desde la raíz.
- Tests de mobile: `@testing-library/react-native` v14 es **asíncrono**: `await render(...)`, `await fireEvent.press(...)`, `await renderHook(...)`, `await act(async () => ...)`. En las fábricas de `jest.mock` solo se pueden referenciar variables con prefijo `mock` (o globales como `Date`).
- Commits convencionales en español. Identidad (no hay `user.name` configurado) y trailer exacto:
  ```bash
  GIT_AUTHOR_NAME="Aless Bustamante" GIT_AUTHOR_EMAIL="fabrizio.bs9012@gmail.com" \
  GIT_COMMITTER_NAME="Aless Bustamante" GIT_COMMITTER_EMAIL="fabrizio.bs9012@gmail.com" \
  git commit -m "<tipo>(<área>): <mensaje>" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
  ```
- `git add` siempre con rutas explícitas. **Nunca** se añaden `.claude/` ni `.superpowers/` de la raíz (nada de `git add -A` ni `git add .`).
- Antes de cada commit: `npm run typecheck` y `npm test` desde la raíz, en verde.
- Fuera de alcance (YAGNI): `trust proxy`, `PATCH /groups/:id` desde la app, `?weekOf` en `/availability`, OCR (Fase 4), propuestas (Fase 3).

## Mapa de archivos

**shared/**
| Archivo | Cambio |
|---|---|
| `index.d.ts` | Añade `TimeBlockInput` (cuerpo de `POST /me/time-blocks`) |

**backend/**
| Archivo | Responsabilidad |
|---|---|
| `src/db/migrations.ts` | + migración 1 (`time_blocks`) y 2 (`groups`, `group_members`) |
| `src/schedule/time-blocks.schemas.ts` | zod de un bloque y del bulk |
| `src/schedule/time-blocks.repository.ts` | Acceso a `time_blocks` |
| `src/schedule/time-blocks.routes.ts` | Router `/me/time-blocks` |
| `src/groups/invite-code.ts` | Generar y normalizar códigos de invitación |
| `src/groups/groups.schemas.ts` | zod de crear/editar/unirse/miembro |
| `src/groups/groups.repository.ts` | Acceso a `groups` y `group_members` (incl. salir con promoción) |
| `src/groups/groups.routes.ts` | Router `/groups` (+ `/:id/availability`) |
| `src/availability/matcher.ts` | Puerto exacto de `AvailabilityMatcher.kt` (función pura) |
| `src/availability/group-availability.ts` | Reglas nuevas sobre el matcher (G13/B14) |
| `src/db/seed.ts` | Semilla de desarrollo (`npm run seed -w backend`) |
| `src/app.ts` | Monta los routers nuevos |
| `package.json` | Script `seed` |
| `test/helpers.ts` | + `bearer`, `createGroup`, `joinGroup` |
| `test/database.test.ts` | + tests de las migraciones nuevas |
| `test/time-blocks.test.ts`, `test/groups.test.ts`, `test/groups.repository.test.ts`, `test/matcher.test.ts`, `test/availability.test.ts` | Tests |

**mobile/**
| Archivo | Responsabilidad |
|---|---|
| `src/api/schedule.ts`, `src/api/groups.ts` | Llamadas tipadas a la API |
| `src/hooks/useResource.ts` | Hook genérico de lectura (carga, recarga, error, respuestas viejas) |
| `src/hooks/useAction.ts` | Hook genérico de escritura (loading, error, evita doble envío) |
| `src/hooks/useRefreshOnFocus.ts` | Recarga al volver a una pantalla |
| `src/hooks/useSchedule.ts`, `useGroups.ts`, `useGroup.ts`, `useAvailability.ts` | Hooks de dominio |
| `src/utils/clock.ts`, `time.ts`, `days.ts`, `groups.ts` | Reloj sustituible, validación de horas, fechas de la semana, formato de grupos |
| `src/components/TextField.tsx` | `label` opcional, `helperText`, `maxLength`, `accessibilityLabel` (modificado) |
| `src/components/ChoiceChip.tsx`, `DaySelector.tsx`, `TimeBlockItem.tsx`, `AppDialog.tsx` | Componentes nuevos |
| `src/screens/schedule/MyScheduleScreen.tsx`, `AddScheduleScreen.tsx` | Horario |
| `src/screens/groups/GroupListScreen.tsx`, `GroupDialogs.tsx`, `GroupDetailScreen.tsx`, `InviteCodeCard.tsx`, `tabs/PlansTab.tsx`, `tabs/AvailabilityTab.tsx`, `tabs/MembersTab.tsx` | Grupos |
| `src/navigation/types.ts`, `RootNavigator.tsx`, `AppDrawer.tsx` | Rutas nuevas (modificados) |
| `jest.setup.ts` | + mock de `expo-clipboard` |
| `**/__tests__/*` | Tests |

---

### Task 1: Backend — «Mi horario» (`/me/time-blocks`)

**Files:**
- Modify: `shared/index.d.ts`, `backend/src/db/migrations.ts`, `backend/src/app.ts`, `backend/test/helpers.ts`, `backend/test/database.test.ts`, `docs/api.md`
- Create: `backend/src/schedule/time-blocks.schemas.ts`, `backend/src/schedule/time-blocks.repository.ts`, `backend/src/schedule/time-blocks.routes.ts`, `backend/test/time-blocks.test.ts`

**Interfaces:**
- Consumes: `Db`, `openDatabase` (`src/db/database.ts`); `AppDeps`, `createApp` (`src/app.ts`); `requireAuth(secret)`, `getUserId(res)` (`src/auth/require-auth.ts`); `ApiError`; `makeTestApp()`, `registerUser(app, overrides?)` (`test/helpers.ts`).
- Produces:
  - `shared`: `type TimeBlockInput = Omit<TimeBlock, 'id' | 'userId'>`.
  - `TIME_REGEX`, `BLOCK_TYPES`, `timeBlockInputSchema`, `bulkTimeBlocksSchema` (`src/schedule/time-blocks.schemas.ts`).
  - `timeBlocksRepository(db)` → `{ listByUser(userId): TimeBlock[]; create(userId, input: TimeBlockInput): TimeBlock; createMany(userId, inputs: TimeBlockInput[]): TimeBlock[]; delete(userId, id): boolean; listRecurringByUsers(userIds: readonly string[]): TimeBlock[] }` (Task 3 usa el último).
  - `timeBlocksRouter(deps: AppDeps): Router`, montado en `/api/me/time-blocks`.
  - `bearer(token: string): { Authorization: string }` en `test/helpers.ts`.
  - Endpoints: `GET/POST /api/me/time-blocks`, `POST /api/me/time-blocks/bulk`, `DELETE /api/me/time-blocks/:id`.

- [ ] **Step 1: Tipo compartido** — en `shared/index.d.ts`, justo después de la definición de `TimeBlock`, añadir:

```ts
// Cuerpo de POST /me/time-blocks (y de cada elemento de /bulk): el servidor pone id y userId.
export type TimeBlockInput = Omit<TimeBlock, 'id' | 'userId'>;
```

- [ ] **Step 2: Escribir los tests que fallan**

Añadir a `backend/test/helpers.ts` (debajo de `TEST_SECRET`):
```ts
export const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
```

Añadir al final de `backend/test/database.test.ts`:
```ts
describe('migración de time_blocks', () => {
  const setup = () => {
    const db = openDatabase(':memory:');
    db.prepare("INSERT INTO users (id, name, email, password_hash) VALUES ('u1', 'Ana', 'ana@correo.com', 'x')").run();
    const insert = db.prepare(
      `INSERT INTO time_blocks (id, user_id, label, type, start_time, end_time, is_recurring, day_of_week, date)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    return { db, insert };
  };

  it('exige día en los recurrentes y fecha en los puntuales', () => {
    const { insert } = setup();
    expect(() => insert.run('b1', 'u1', 'Clase', 'CLASE', '08:00', '10:00', 1, 1, null)).not.toThrow();
    expect(() => insert.run('b2', 'u1', 'Dentista', 'PUNTUAL', '15:00', '16:00', 0, null, '2026-10-02')).not.toThrow();
    expect(() => insert.run('b3', 'u1', 'Sin día', 'CLASE', '08:00', '10:00', 1, null, null)).toThrow();
    expect(() => insert.run('b4', 'u1', 'Tipo raro', 'OTRO', '08:00', '10:00', 1, 1, null)).toThrow();
    expect(() => insert.run('b5', 'u1', 'Al revés', 'CLASE', '10:00', '08:00', 1, 1, null)).toThrow();
  });

  it('borrar un usuario borra sus bloques', () => {
    const { db, insert } = setup();
    insert.run('b1', 'u1', 'Clase', 'CLASE', '08:00', '10:00', 1, 1, null);
    db.prepare("DELETE FROM users WHERE id = 'u1'").run();
    const { n } = db.prepare('SELECT COUNT(*) AS n FROM time_blocks').get() as { n: number };
    expect(n).toBe(0);
  });
});
```

`backend/test/time-blocks.test.ts`:
```ts
import type { TimeBlockInput, User } from '@hueckoapp/shared';
import type { Express } from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';

import { bearer, makeTestApp, registerUser } from './helpers';

const recurrente: TimeBlockInput = {
  label: 'Clase de Android', type: 'CLASE', startTime: '08:00', endTime: '10:00',
  isRecurring: true, dayOfWeek: 1, date: null,
};
const puntual: TimeBlockInput = {
  label: 'Dentista', type: 'PUNTUAL', startTime: '15:00', endTime: '16:00',
  isRecurring: false, dayOfWeek: null, date: '2026-10-02',
};

let app: Express;
let token: string;
let me: User;

beforeEach(async () => {
  ({ app } = makeTestApp());
  ({ token, user: me } = await registerUser(app));
});

const post = (body: unknown, t = token) => request(app).post('/api/me/time-blocks').set(bearer(t)).send(body as object);
const list = (t = token) => request(app).get('/api/me/time-blocks').set(bearer(t));

describe('POST /api/me/time-blocks', () => {
  it('crea un bloque recurrente con el userId del token', async () => {
    const res = await post(recurrente);
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ ...recurrente, id: expect.any(String), userId: me.id });
  });

  it('crea un bloque puntual con fecha', async () => {
    const res = await post(puntual);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ isRecurring: false, dayOfWeek: null, date: '2026-10-02', type: 'PUNTUAL' });
  });

  it('acepta omitir el campo que no aplica (date en recurrentes, dayOfWeek en puntuales)', async () => {
    const { date: _d, ...sinFecha } = recurrente;
    const { dayOfWeek: _w, ...sinDia } = puntual;
    expect((await post(sinFecha)).body.date).toBeNull();
    expect((await post(sinDia)).body.dayOfWeek).toBeNull();
  });

  it('ignora un userId enviado en el cuerpo y recorta el nombre', async () => {
    const res = await post({ ...recurrente, label: '  Clase de Android  ', userId: 'otro' });
    expect(res.status).toBe(201);
    expect(res.body.userId).toBe(me.id);
    expect(res.body.label).toBe('Clase de Android');
  });

  it.each([
    [{ ...recurrente, startTime: '8:00' }, 'startTime', 'Formato HH:mm'],
    [{ ...recurrente, endTime: '24:00' }, 'endTime', 'Formato HH:mm'],
    [{ ...recurrente, startTime: '10:00', endTime: '10:00' }, 'endTime', 'La hora de fin debe ser posterior a la de inicio'],
    [{ ...recurrente, dayOfWeek: null }, 'dayOfWeek', 'El día es requerido en un bloque recurrente'],
    [{ ...recurrente, dayOfWeek: 8 }, 'dayOfWeek', 'Día inválido'],
    [{ ...recurrente, date: '2026-10-02' }, 'date', 'Un bloque recurrente no lleva fecha'],
    [{ ...puntual, date: null }, 'date', 'La fecha es requerida en un bloque puntual'],
    [{ ...puntual, date: '2026-02-30' }, 'date', 'Fecha inválida (YYYY-MM-DD)'],
    [{ ...puntual, dayOfWeek: 5 }, 'dayOfWeek', 'Un bloque puntual no lleva día de la semana'],
    [{ ...recurrente, type: 'OTRO' }, 'type', 'Tipo de bloque inválido'],
    [{ ...recurrente, label: '   ' }, 'label', 'El nombre es requerido'],
  ])('valida %j → 400 en %s', async (body, field, message) => {
    const res = await post(body);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details).toContainEqual(expect.objectContaining({ path: [field], message }));
  });

  it('sin token → 401', async () => {
    const res = await request(app).post('/api/me/time-blocks').send(recurrente);
    expect(res.status).toBe(401);
  });
});

describe('GET /api/me/time-blocks', () => {
  it('devuelve solo mis bloques: recurrentes por día y hora, después los puntuales', async () => {
    await post(puntual);
    await post({ ...recurrente, label: 'Taller', dayOfWeek: 3, startTime: '09:00', endTime: '11:00' });
    await post(recurrente);
    const otra = await registerUser(app);
    await post({ ...recurrente, label: 'De otra persona' }, otra.token);

    const res = await list();
    expect(res.status).toBe(200);
    expect(res.body.map((b: { label: string }) => b.label)).toEqual(['Clase de Android', 'Taller', 'Dentista']);
  });
});

describe('POST /api/me/time-blocks/bulk', () => {
  it('crea todos los bloques de una vez', async () => {
    const res = await request(app).post('/api/me/time-blocks/bulk').set(bearer(token)).send({ blocks: [recurrente, puntual] });
    expect(res.status).toBe(201);
    expect(res.body).toHaveLength(2);
    expect((await list()).body).toHaveLength(2);
  });

  it('si uno es inválido no guarda ninguno', async () => {
    const res = await request(app)
      .post('/api/me/time-blocks/bulk')
      .set(bearer(token))
      .send({ blocks: [recurrente, { ...recurrente, endTime: '07:00' }] });
    expect(res.status).toBe(400);
    expect(res.body.error.details).toContainEqual(expect.objectContaining({ path: ['blocks', 1, 'endTime'] }));
    expect((await list()).body).toEqual([]);
  });

  it('rechaza una lista vacía', async () => {
    const res = await request(app).post('/api/me/time-blocks/bulk').set(bearer(token)).send({ blocks: [] });
    expect(res.status).toBe(400);
    expect(res.body.error.details).toContainEqual(expect.objectContaining({ message: 'Envía al menos un bloque' }));
  });
});

describe('DELETE /api/me/time-blocks/:id', () => {
  it('borra mi bloque → 204', async () => {
    const { body: block } = await post(recurrente);
    const res = await request(app).delete(`/api/me/time-blocks/${block.id}`).set(bearer(token));
    expect(res.status).toBe(204);
    expect((await list()).body).toEqual([]);
  });

  it('el bloque de otra persona → 404 TIME_BLOCK_NOT_FOUND y no se borra', async () => {
    const otra = await registerUser(app);
    const { body: block } = await post(recurrente, otra.token);
    const res = await request(app).delete(`/api/me/time-blocks/${block.id}`).set(bearer(token));
    expect(res.status).toBe(404);
    expect(res.body.error).toMatchObject({ code: 'TIME_BLOCK_NOT_FOUND', message: 'Bloque no encontrado.' });
    expect((await list(otra.token)).body).toHaveLength(1);
  });
});
```

- [ ] **Step 3: Ejecutar y ver que falla** — `npm test -w backend -- time-blocks database` → FAIL (`no such table: time_blocks`, rutas 404).

- [ ] **Step 4: Implementar**

`backend/src/db/migrations.ts` — añadir **al final del array** (tras la migración de `users`):
```ts
  // 1 — Fase 2: bloques de horario. Recurrente = día de la semana; puntual = fecha concreta.
  `CREATE TABLE time_blocks (
     id           TEXT PRIMARY KEY,
     user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     label        TEXT NOT NULL,
     type         TEXT NOT NULL CHECK (type IN ('CLASE', 'TRABAJO', 'LIBRE', 'PUNTUAL')),
     start_time   TEXT NOT NULL,
     end_time     TEXT NOT NULL,
     is_recurring INTEGER NOT NULL CHECK (is_recurring IN (0, 1)),
     day_of_week  INTEGER CHECK (day_of_week BETWEEN 1 AND 7),
     date         TEXT,
     created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
     CHECK (start_time < end_time),
     CHECK ((is_recurring = 1 AND day_of_week IS NOT NULL AND date IS NULL)
         OR (is_recurring = 0 AND day_of_week IS NULL AND date IS NOT NULL))
   );
   CREATE INDEX time_blocks_user_idx ON time_blocks (user_id);`,
```

`backend/src/schedule/time-blocks.schemas.ts`:
```ts
import { z } from 'zod';

export const BLOCK_TYPES = ['CLASE', 'TRABAJO', 'LIBRE', 'PUNTUAL'] as const;

// "HH:mm" de 00:00 a 23:59 con dos dígitos (misma regla que AddScheduleScreen.kt y la app).
export const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

// "2026-02-30" pasa la regex pero no existe: se comprueba que la fecha sea real.
const isRealDate = (value: string) => {
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
};

const time = z.string({ error: 'Formato HH:mm' }).regex(TIME_REGEX, 'Formato HH:mm');

export const timeBlockInputSchema = z
  .object({
    label: z
      .string({ error: 'El nombre es requerido' })
      .trim()
      .min(1, 'El nombre es requerido')
      .max(80, 'Máximo 80 caracteres'),
    type: z.enum(BLOCK_TYPES, { error: 'Tipo de bloque inválido' }),
    startTime: time,
    endTime: time,
    isRecurring: z.boolean({ error: 'Indica si el bloque es recurrente' }),
    dayOfWeek: z
      .number({ error: 'Día inválido' })
      .int('Día inválido')
      .min(1, 'Día inválido')
      .max(7, 'Día inválido')
      .nullish(),
    date: z
      .string({ error: 'Fecha inválida (YYYY-MM-DD)' })
      .regex(DATE_REGEX, 'Fecha inválida (YYYY-MM-DD)')
      .refine(isRealDate, 'Fecha inválida (YYYY-MM-DD)')
      .nullish(),
  })
  .superRefine((block, ctx) => {
    // Solo se compara el orden si ambas horas tienen buen formato (si no, ya hay un error en el campo).
    if (TIME_REGEX.test(block.startTime) && TIME_REGEX.test(block.endTime) && block.endTime <= block.startTime) {
      ctx.addIssue({ code: 'custom', path: ['endTime'], message: 'La hora de fin debe ser posterior a la de inicio' });
    }
    if (block.isRecurring) {
      if (block.dayOfWeek == null) {
        ctx.addIssue({ code: 'custom', path: ['dayOfWeek'], message: 'El día es requerido en un bloque recurrente' });
      }
      if (block.date != null) {
        ctx.addIssue({ code: 'custom', path: ['date'], message: 'Un bloque recurrente no lleva fecha' });
      }
    } else {
      if (block.date == null) {
        ctx.addIssue({ code: 'custom', path: ['date'], message: 'La fecha es requerida en un bloque puntual' });
      }
      if (block.dayOfWeek != null) {
        ctx.addIssue({ code: 'custom', path: ['dayOfWeek'], message: 'Un bloque puntual no lleva día de la semana' });
      }
    }
  })
  // Lo omitido se guarda como null, igual que en el contrato.
  .transform((block) => ({ ...block, dayOfWeek: block.dayOfWeek ?? null, date: block.date ?? null }));

export const bulkTimeBlocksSchema = z.object({
  blocks: z
    .array(timeBlockInputSchema, { error: 'Envía una lista de bloques' })
    .min(1, 'Envía al menos un bloque')
    .max(100, 'Máximo 100 bloques'),
});
```

`backend/src/schedule/time-blocks.repository.ts`:
```ts
import { randomUUID } from 'node:crypto';

import type { BlockType, TimeBlock, TimeBlockInput } from '@hueckoapp/shared';

import type { Db } from '../db/database';

type TimeBlockRow = {
  id: string;
  user_id: string;
  label: string;
  type: BlockType;
  start_time: string;
  end_time: string;
  is_recurring: number;
  day_of_week: number | null;
  date: string | null;
};

const toTimeBlock = (row: TimeBlockRow): TimeBlock => ({
  id: row.id,
  userId: row.user_id,
  label: row.label,
  type: row.type,
  startTime: row.start_time,
  endTime: row.end_time,
  isRecurring: row.is_recurring === 1,
  dayOfWeek: row.day_of_week,
  date: row.date,
});

// Recurrentes primero (por día y hora); después los puntuales (por fecha y hora).
const ORDER = 'ORDER BY is_recurring DESC, day_of_week, date, start_time, rowid';

export function timeBlocksRepository(db: Db) {
  const insert = (userId: string, input: TimeBlockInput): TimeBlock => {
    const id = randomUUID();
    db.prepare(
      `INSERT INTO time_blocks (id, user_id, label, type, start_time, end_time, is_recurring, day_of_week, date)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id, userId, input.label, input.type, input.startTime, input.endTime,
      input.isRecurring ? 1 : 0, input.dayOfWeek, input.date,
    );
    return { id, userId, ...input };
  };

  return {
    listByUser(userId: string): TimeBlock[] {
      const rows = db.prepare(`SELECT * FROM time_blocks WHERE user_id = ? ${ORDER}`).all(userId) as TimeBlockRow[];
      return rows.map(toTimeBlock);
    },

    create: insert,

    // Todo o nada: si falla uno, no queda ninguno guardado.
    createMany(userId: string, inputs: TimeBlockInput[]): TimeBlock[] {
      db.exec('BEGIN');
      try {
        const created = inputs.map((input) => insert(userId, input));
        db.exec('COMMIT');
        return created;
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },

    // false si no existe o es de otra persona.
    delete(userId: string, id: string): boolean {
      const { changes } = db.prepare('DELETE FROM time_blocks WHERE id = ? AND user_id = ?').run(id, userId);
      return Number(changes) > 0;
    },

    // Bloques recurrentes de varias personas (para el cruce de un grupo). json_each evita armar "IN (?, ?, …)".
    listRecurringByUsers(userIds: readonly string[]): TimeBlock[] {
      const rows = db
        .prepare(`SELECT * FROM time_blocks WHERE is_recurring = 1 AND user_id IN (SELECT value FROM json_each(?)) ${ORDER}`)
        .all(JSON.stringify(userIds)) as TimeBlockRow[];
      return rows.map(toTimeBlock);
    },
  };
}
```

`backend/src/schedule/time-blocks.routes.ts`:
```ts
import { Router } from 'express';

import type { AppDeps } from '../app';
import { getUserId } from '../auth/require-auth';
import { ApiError } from '../middleware/errors';
import { timeBlocksRepository } from './time-blocks.repository';
import { bulkTimeBlocksSchema, timeBlockInputSchema } from './time-blocks.schemas';

// Se monta detrás de requireAuth: el dueño de cada bloque sale siempre del token.
export function timeBlocksRouter({ db }: AppDeps) {
  const router = Router();
  const blocks = timeBlocksRepository(db);

  router.get('/', (_req, res) => {
    res.json(blocks.listByUser(getUserId(res)));
  });

  router.post('/', (req, res) => {
    const input = timeBlockInputSchema.parse(req.body);
    res.status(201).json(blocks.create(getUserId(res), input));
  });

  router.post('/bulk', (req, res) => {
    const { blocks: inputs } = bulkTimeBlocksSchema.parse(req.body);
    res.status(201).json(blocks.createMany(getUserId(res), inputs));
  });

  router.delete('/:id', (req, res) => {
    if (!blocks.delete(getUserId(res), req.params.id)) {
      throw new ApiError(404, 'TIME_BLOCK_NOT_FOUND', 'Bloque no encontrado.');
    }
    res.status(204).end();
  });

  return router;
}
```

`backend/src/app.ts` — añadir los imports y montar el router tras `/auth`:
```ts
import { requireAuth } from './auth/require-auth';
import { timeBlocksRouter } from './schedule/time-blocks.routes';
// …
  api.use('/auth', authRouter(deps));
  api.use('/me/time-blocks', requireAuth(deps.jwtSecret), timeBlocksRouter(deps));
```

- [ ] **Step 5: Ejecutar y ver que pasa** — `npm test -w backend` → PASS (todos, incluidos los de Fase 1). `npm run typecheck -w backend` → sin errores.

- [ ] **Step 6: Actualizar el contrato** — en `docs/api.md`, reemplazar desde `### \`GET /me/time-blocks\`` hasta justo antes de `### \`GET /me/upcoming-plans\`` por:

````md
### `GET /me/time-blocks`
`200 TimeBlock[]`, solo los del usuario autenticado. Orden: recurrentes por día y hora de inicio; después los puntuales por fecha y hora.

### `POST /me/time-blocks`
```json
{ "label": "Clase de Android", "type": "CLASE", "startTime": "08:00", "endTime": "10:00",
  "isRecurring": true, "dayOfWeek": 1, "date": null }
```
Cuerpo = `TimeBlockInput` de `shared`. Reglas:
- `label` obligatorio, 1–80 caracteres tras `trim`.
- `type` ∈ `CLASE | TRABAJO | LIBRE | PUNTUAL`.
- `startTime` y `endTime` en `HH:mm` de 00:00 a 23:59 con dos dígitos (`8:00` y `24:00` no valen); `startTime < endTime`.
- Recurrente (`isRecurring: true`): `dayOfWeek` 1–7 obligatorio; `date` `null` u omitido.
- Puntual (`isRecurring: false`): `date` `YYYY-MM-DD` real obligatorio; `dayOfWeek` `null` u omitido.
- `userId` lo pone el servidor desde el token (si viene en el cuerpo, se ignora).

`201 TimeBlock` · `400 VALIDATION_ERROR` (`details[].path` indica el campo)

### `POST /me/time-blocks/bulk`
`{ "blocks": [ ...mismo cuerpo que arriba... ] }` → `201 TimeBlock[]`. Entre 1 y 100 bloques. **Todo o nada:** si uno es inválido responde `400` (con `path` tipo `["blocks", 1, "endTime"]`) y no se guarda ninguno. Lo usa la pantalla de revisión del OCR.

### `DELETE /me/time-blocks/:id`
`204` · `404 TIME_BLOCK_NOT_FOUND` si el bloque no existe o no es del usuario.
````

- [ ] **Step 7: Commit** — `git add shared/index.d.ts backend/src/db/migrations.ts backend/src/schedule backend/src/app.ts backend/test/helpers.ts backend/test/database.test.ts backend/test/time-blocks.test.ts docs/api.md` → `feat(backend): mi horario con bloques recurrentes y puntuales (/me/time-blocks)`

---

### Task 2: Backend — grupos, código de invitación y miembros

**Files:**
- Modify: `backend/src/db/migrations.ts`, `backend/src/app.ts`, `backend/test/helpers.ts`, `backend/test/database.test.ts`, `docs/api.md`
- Create: `backend/src/groups/invite-code.ts`, `backend/src/groups/groups.schemas.ts`, `backend/src/groups/groups.repository.ts`, `backend/src/groups/groups.routes.ts`, `backend/test/groups.repository.test.ts`, `backend/test/groups.test.ts`

**Interfaces:**
- Consumes: `bearer`, `makeTestApp`, `registerUser` (Task 1 / Fase 1); `requireAuth`, `getUserId`, `ApiError`, `usersRepository`.
- Produces:
  - `INVITE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'`, `INVITE_CODE_LENGTH = 8`, `generateInviteCode(bytes?: (n: number) => Uint8Array): string`, `normalizeInviteCode(code: string): string`.
  - `groupsRepository(db, generateCode = generateInviteCode)` → `{ findById(groupId): Group | undefined; listForUser(userId): GroupSummary[]; findIdByInviteCode(code): string | undefined; isMember(groupId, userId): boolean; create(ownerId, input: { name: string; description: string; availabilityThreshold: number }): Group; addMember(groupId, userId): void; update(groupId, patch: { name?: string; description?: string; availabilityThreshold?: number }): void; setEssential(groupId, userId, isEssential: boolean): void; leave(groupId, userId): void }`.
  - `groupsRouter(deps: AppDeps): Router` montado en `/api/groups`, con el helper interno `loadForMember(groupId, userId): { group: Group; me: GroupMember }` (Task 3 añade `/:id/availability` en este mismo router).
  - `test/helpers.ts`: `createGroup(app, token, body?): Promise<Group>` y `joinGroup(app, token, inviteCode): Promise<Group>`.
  - Códigos de error: `404 GROUP_NOT_FOUND`, `403 NOT_A_MEMBER`, `403 NOT_OWNER`, `404 INVALID_INVITE_CODE`, `409 ALREADY_MEMBER`, `404 MEMBER_NOT_FOUND`.

- [ ] **Step 1: Escribir los tests que fallan**

Añadir a `backend/test/helpers.ts` (y `Group` al import de tipos: `import type { Group, User } from '@hueckoapp/shared';`):
```ts
export async function createGroup(
  app: Express,
  token: string,
  body: Partial<{ name: string; description: string; availabilityThreshold: number }> = {},
): Promise<Group> {
  const res = await request(app).post('/api/groups').set(bearer(token)).send({ name: 'Proyecto Integrador', ...body });
  if (res.status !== 201) throw new Error(`crear grupo falló: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body;
}

export async function joinGroup(app: Express, token: string, inviteCode: string): Promise<Group> {
  const res = await request(app).post('/api/groups/join').set(bearer(token)).send({ inviteCode });
  if (res.status !== 200) throw new Error(`unirse falló: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body;
}
```

Añadir al final de `backend/test/database.test.ts`:
```ts
describe('migración de grupos', () => {
  it('borrar un grupo borra sus miembros y el código de invitación es único', () => {
    const db = openDatabase(':memory:');
    db.prepare("INSERT INTO users (id, name, email, password_hash) VALUES ('u1', 'Ana', 'ana@correo.com', 'x')").run();
    const insertGroup = db.prepare("INSERT INTO groups (id, name, invite_code) VALUES (?, 'Grupo', ?)");
    insertGroup.run('g1', 'PROY2026');
    expect(() => insertGroup.run('g2', 'PROY2026')).toThrow();
    db.prepare("INSERT INTO group_members (group_id, user_id, role) VALUES ('g1', 'u1', 'OWNER')").run();
    expect(() => db.prepare("INSERT INTO group_members (group_id, user_id, role) VALUES ('g1', 'u1', 'MEMBER')").run()).toThrow();
    db.prepare("DELETE FROM groups WHERE id = 'g1'").run();
    const { n } = db.prepare('SELECT COUNT(*) AS n FROM group_members').get() as { n: number };
    expect(n).toBe(0);
  });
});
```

`backend/test/groups.repository.test.ts`:
```ts
import { describe, expect, it } from 'vitest';

import { openDatabase } from '../src/db/database';
import { generateInviteCode, normalizeInviteCode } from '../src/groups/invite-code';
import { groupsRepository } from '../src/groups/groups.repository';
import { usersRepository } from '../src/users/users.repository';

const input = { name: 'Grupo', description: '', availabilityThreshold: 80 };

const setup = (generateCode: () => string) => {
  const db = openDatabase(':memory:');
  const owner = usersRepository(db).create({ name: 'Ana', email: 'ana@correo.com', passwordHash: 'x' });
  return { repo: groupsRepository(db, generateCode), owner };
};

describe('generateInviteCode', () => {
  it('toma 8 símbolos del alfabeto sin ambiguos (módulo 32)', () => {
    expect(generateInviteCode(() => Uint8Array.from([0, 1, 2, 3, 4, 5, 6, 7]))).toBe('ABCDEFGH');
    expect(generateInviteCode(() => Uint8Array.from([31, 32, 63, 255, 8, 13, 23, 24]))).toBe('9A99JPZ2');
  });

  it('con bytes aleatorios reales nunca produce 0, O, 1 ni I', () => {
    for (let i = 0; i < 200; i++) expect(generateInviteCode()).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
  });

  it('normaliza con trim y mayúsculas (G10)', () => {
    expect(normalizeInviteCode('  proy2026 ')).toBe('PROY2026');
  });
});

describe('groupsRepository.create — código único', () => {
  it('reintenta si el código generado ya existe', () => {
    const codes = ['AAAAAAAA', 'AAAAAAAA', 'BBBBBBBB'];
    const { repo, owner } = setup(() => codes.shift()!);
    expect(repo.create(owner.id, input).inviteCode).toBe('AAAAAAAA');
    expect(repo.create(owner.id, input).inviteCode).toBe('BBBBBBBB');
  });

  it('se rinde tras 5 colisiones seguidas', () => {
    const { repo, owner } = setup(() => 'AAAAAAAA');
    repo.create(owner.id, input);
    expect(() => repo.create(owner.id, input)).toThrow('No se pudo generar un código de invitación único');
  });
});
```

`backend/test/groups.test.ts`:
```ts
import type { Group } from '@hueckoapp/shared';
import type { Express } from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';

import type { Db } from '../src/db/database';
import { bearer, createGroup, joinGroup, makeTestApp, registerUser } from './helpers';

let app: Express;
let db: Db;
beforeEach(() => {
  ({ app, db } = makeTestApp());
});

const get = (path: string, token: string) => request(app).get(`/api${path}`).set(bearer(token));

describe('POST /api/groups', () => {
  it('crea el grupo con código generado y el creador como OWNER', async () => {
    const { token, user } = await registerUser(app);
    const res = await request(app).post('/api/groups').set(bearer(token)).send({ name: '  Proyecto Integrador ' });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      id: expect.any(String),
      name: 'Proyecto Integrador',
      description: '',
      availabilityThreshold: 80,
      memberCount: 1,
      inviteCode: expect.stringMatching(/^[A-HJ-NP-Z2-9]{8}$/),
      members: [{ ...user, role: 'OWNER', isEssential: false }],
    });
  });

  it.each([
    [{ name: '   ' }, 'name', 'El nombre es requerido'],
    [{ name: 'G', availabilityThreshold: 101 }, 'availabilityThreshold', 'El umbral va de 0 a 100'],
    [{ name: 'G', availabilityThreshold: 50.5 }, 'availabilityThreshold', 'El umbral debe ser un entero'],
    [{ name: 'G', description: 'x'.repeat(201) }, 'description', 'Máximo 200 caracteres'],
  ])('valida %j → 400 en %s', async (body, field, message) => {
    const { token } = await registerUser(app);
    const res = await request(app).post('/api/groups').set(bearer(token)).send(body);
    expect(res.status).toBe(400);
    expect(res.body.error.details).toContainEqual(expect.objectContaining({ path: [field], message }));
  });

  it('sin token → 401', async () => {
    expect((await request(app).post('/api/groups').send({ name: 'G' })).status).toBe(401);
  });
});

describe('GET /api/groups', () => {
  it('lista solo mis grupos con su número de miembros', async () => {
    const yo = await registerUser(app);
    const ana = await registerUser(app);
    const mio = await createGroup(app, yo.token, { name: 'Mío' });
    await createGroup(app, ana.token, { name: 'De Ana' });
    await joinGroup(app, ana.token, mio.inviteCode);

    const res = await get('/groups', yo.token);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([
      { id: mio.id, name: 'Mío', description: '', memberCount: 2, availabilityThreshold: 80 },
    ]);
  });
});

describe('POST /api/groups/join', () => {
  it('normaliza el código (trim + mayúsculas) y entra como MEMBER', async () => {
    const yo = await registerUser(app);
    const ana = await registerUser(app);
    const group = await createGroup(app, yo.token);
    const res = await request(app)
      .post('/api/groups/join')
      .set(bearer(ana.token))
      .send({ inviteCode: `  ${group.inviteCode.toLowerCase()} ` });
    expect(res.status).toBe(200);
    expect(res.body.memberCount).toBe(2);
    expect(res.body.members[1]).toEqual({ ...ana.user, role: 'MEMBER', isEssential: false });
  });

  it('dos veces → 409 ALREADY_MEMBER', async () => {
    const yo = await registerUser(app);
    const group = await createGroup(app, yo.token);
    const res = await request(app).post('/api/groups/join').set(bearer(yo.token)).send({ inviteCode: group.inviteCode });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatchObject({ code: 'ALREADY_MEMBER', message: 'Ya perteneces a este grupo.' });
  });

  it('código inexistente → 404 INVALID_INVITE_CODE', async () => {
    const yo = await registerUser(app);
    const res = await request(app).post('/api/groups/join').set(bearer(yo.token)).send({ inviteCode: 'NOEXISTE' });
    expect(res.status).toBe(404);
    expect(res.body.error).toMatchObject({ code: 'INVALID_INVITE_CODE', message: 'Código de invitación inválido.' });
  });

  it('código vacío → 400', async () => {
    const yo = await registerUser(app);
    const res = await request(app).post('/api/groups/join').set(bearer(yo.token)).send({ inviteCode: '  ' });
    expect(res.status).toBe(400);
    expect(res.body.error.details).toContainEqual(expect.objectContaining({ message: 'El código es requerido' }));
  });
});

describe('GET /api/groups/:id', () => {
  it('un miembro ve el grupo con todos sus miembros', async () => {
    const yo = await registerUser(app);
    const group = await createGroup(app, yo.token);
    const res = await get(`/groups/${group.id}`, yo.token);
    expect(res.status).toBe(200);
    expect(res.body).toEqual(group);
  });

  it('quien no es miembro → 403 NOT_A_MEMBER; un id inexistente → 404 GROUP_NOT_FOUND', async () => {
    const yo = await registerUser(app);
    const otra = await registerUser(app);
    const group = await createGroup(app, yo.token);
    const forbidden = await get(`/groups/${group.id}`, otra.token);
    expect(forbidden.status).toBe(403);
    expect(forbidden.body.error).toMatchObject({ code: 'NOT_A_MEMBER', message: 'No perteneces a este grupo.' });
    const missing = await get('/groups/no-existe', yo.token);
    expect(missing.status).toBe(404);
    expect(missing.body.error).toMatchObject({ code: 'GROUP_NOT_FOUND', message: 'Grupo no encontrado.' });
  });
});

describe('PATCH /api/groups/:id', () => {
  it('el OWNER cambia nombre, descripción y umbral', async () => {
    const yo = await registerUser(app);
    const group = await createGroup(app, yo.token);
    const res = await request(app)
      .patch(`/api/groups/${group.id}`)
      .set(bearer(yo.token))
      .send({ name: 'Nuevo', description: 'Grupo del curso', availabilityThreshold: 60 });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ name: 'Nuevo', description: 'Grupo del curso', availabilityThreshold: 60 });
  });

  it('un MEMBER → 403 NOT_OWNER', async () => {
    const yo = await registerUser(app);
    const ana = await registerUser(app);
    const group = await createGroup(app, yo.token);
    await joinGroup(app, ana.token, group.inviteCode);
    const res = await request(app).patch(`/api/groups/${group.id}`).set(bearer(ana.token)).send({ name: 'X' });
    expect(res.status).toBe(403);
    expect(res.body.error).toMatchObject({ code: 'NOT_OWNER', message: 'Solo el administrador del grupo puede hacer esto.' });
  });

  it.each([
    [{}, 'Envía al menos un campo'],
    [{ availabilityThreshold: -1 }, 'El umbral va de 0 a 100'],
    [{ name: '' }, 'El nombre es requerido'],
  ])('valida %j → 400', async (body, message) => {
    const yo = await registerUser(app);
    const group = await createGroup(app, yo.token);
    const res = await request(app).patch(`/api/groups/${group.id}`).set(bearer(yo.token)).send(body);
    expect(res.status).toBe(400);
    expect(res.body.error.details).toContainEqual(expect.objectContaining({ message }));
  });
});

describe('PATCH /api/groups/:id/members/:userId', () => {
  it('el OWNER marca a alguien como imprescindible', async () => {
    const yo = await registerUser(app);
    const ana = await registerUser(app);
    const group = await createGroup(app, yo.token);
    await joinGroup(app, ana.token, group.inviteCode);
    const res = await request(app)
      .patch(`/api/groups/${group.id}/members/${ana.user.id}`)
      .set(bearer(yo.token))
      .send({ isEssential: true });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ...ana.user, role: 'MEMBER', isEssential: true });
    const after = await get(`/groups/${group.id}`, ana.token);
    expect(after.body.members[1].isEssential).toBe(true);
  });

  it('un MEMBER → 403; alguien de fuera → 404 MEMBER_NOT_FOUND; cuerpo inválido → 400', async () => {
    const yo = await registerUser(app);
    const ana = await registerUser(app);
    const fuera = await registerUser(app);
    const group = await createGroup(app, yo.token);
    await joinGroup(app, ana.token, group.inviteCode);
    const path = (userId: string) => `/api/groups/${group.id}/members/${userId}`;

    expect((await request(app).patch(path(yo.user.id)).set(bearer(ana.token)).send({ isEssential: true })).status).toBe(403);

    const missing = await request(app).patch(path(fuera.user.id)).set(bearer(yo.token)).send({ isEssential: true });
    expect(missing.status).toBe(404);
    expect(missing.body.error).toMatchObject({ code: 'MEMBER_NOT_FOUND', message: 'Esa persona no pertenece al grupo.' });

    const invalid = await request(app).patch(path(ana.user.id)).set(bearer(yo.token)).send({ isEssential: 'sí' });
    expect(invalid.status).toBe(400);
  });
});

describe('DELETE /api/groups/:id/members/me', () => {
  it('un MEMBER sale y el grupo sigue con el OWNER', async () => {
    const yo = await registerUser(app);
    const ana = await registerUser(app);
    const group = await createGroup(app, yo.token);
    await joinGroup(app, ana.token, group.inviteCode);
    const res = await request(app).delete(`/api/groups/${group.id}/members/me`).set(bearer(ana.token));
    expect(res.status).toBe(204);
    expect((await get('/groups', ana.token)).body).toEqual([]);
    expect((await get(`/groups/${group.id}`, yo.token)).body.memberCount).toBe(1);
  });

  it('si sale el último OWNER, pasa a OWNER quien lleva más tiempo en el grupo', async () => {
    const yo = await registerUser(app);
    const b = await registerUser(app);
    const c = await registerUser(app);
    const group = await createGroup(app, yo.token);
    await joinGroup(app, b.token, group.inviteCode);
    await joinGroup(app, c.token, group.inviteCode);
    // C figura como más antiguo que B aunque se unió después: manda joined_at.
    db.prepare('UPDATE group_members SET joined_at = ? WHERE user_id = ?').run('2000-01-01T00:00:00.000Z', c.user.id);

    expect((await request(app).delete(`/api/groups/${group.id}/members/me`).set(bearer(yo.token))).status).toBe(204);

    const after: Group = (await get(`/groups/${group.id}`, b.token)).body;
    expect(after.members).toEqual([
      expect.objectContaining({ id: c.user.id, role: 'OWNER' }),
      expect.objectContaining({ id: b.user.id, role: 'MEMBER' }),
    ]);
  });

  it('si sale la última persona, el grupo se borra', async () => {
    const yo = await registerUser(app);
    const group = await createGroup(app, yo.token);
    expect((await request(app).delete(`/api/groups/${group.id}/members/me`).set(bearer(yo.token))).status).toBe(204);
    const { n } = db.prepare('SELECT COUNT(*) AS n FROM groups').get() as { n: number };
    expect(n).toBe(0);
    expect((await get(`/groups/${group.id}`, yo.token)).status).toBe(404);
  });

  it('quien no es miembro → 403', async () => {
    const yo = await registerUser(app);
    const otra = await registerUser(app);
    const group = await createGroup(app, yo.token);
    expect((await request(app).delete(`/api/groups/${group.id}/members/me`).set(bearer(otra.token))).status).toBe(403);
  });
});
```

- [ ] **Step 2: Ejecutar y ver que falla** — `npm test -w backend -- groups database` → FAIL (módulos y tablas inexistentes).

- [ ] **Step 3: Implementar**

`backend/src/db/migrations.ts` — añadir **al final del array**:
```ts
  // 2 — Fase 2: grupos y sus miembros. GROUPS es palabra clave "fallback" de SQLite: vale como nombre de tabla.
  `CREATE TABLE groups (
     id                     TEXT PRIMARY KEY,
     name                   TEXT NOT NULL,
     description            TEXT NOT NULL DEFAULT '',
     invite_code            TEXT NOT NULL UNIQUE,
     availability_threshold INTEGER NOT NULL DEFAULT 80 CHECK (availability_threshold BETWEEN 0 AND 100),
     created_at             TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
   );
   CREATE TABLE group_members (
     group_id     TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
     user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     role         TEXT NOT NULL CHECK (role IN ('OWNER', 'MEMBER')),
     is_essential INTEGER NOT NULL DEFAULT 0 CHECK (is_essential IN (0, 1)),
     joined_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
     PRIMARY KEY (group_id, user_id)
   );
   CREATE INDEX group_members_user_idx ON group_members (user_id);`,
```

`backend/src/groups/invite-code.ts`:
```ts
import { randomBytes } from 'node:crypto';

// 32 símbolos: A–Z sin I ni O, y 2–9 (sin 0 ni 1), para que no se confundan al dictarlos (domain spec G11).
export const INVITE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const INVITE_CODE_LENGTH = 8;

// 256 es múltiplo de 32: cada byte elige un símbolo sin sesgo.
export function generateInviteCode(bytes: (n: number) => Uint8Array = randomBytes): string {
  return Array.from(bytes(INVITE_CODE_LENGTH), (b) => INVITE_ALPHABET[b % INVITE_ALPHABET.length]).join('');
}

// Igual que Kotlin (domain spec G10): lo que el usuario teclee se compara en mayúsculas y sin espacios.
export const normalizeInviteCode = (code: string) => code.trim().toUpperCase();
```

`backend/src/groups/groups.schemas.ts`:
```ts
import { z } from 'zod';

import { normalizeInviteCode } from './invite-code';

const name = z.string({ error: 'El nombre es requerido' }).trim().min(1, 'El nombre es requerido').max(60, 'Máximo 60 caracteres');
const description = z.string({ error: 'La descripción debe ser texto' }).trim().max(200, 'Máximo 200 caracteres');
const threshold = z
  .number({ error: 'El umbral debe ser un número' })
  .int('El umbral debe ser un entero')
  .min(0, 'El umbral va de 0 a 100')
  .max(100, 'El umbral va de 0 a 100');

export const createGroupSchema = z.object({
  name,
  description: description.default(''),
  availabilityThreshold: threshold.default(80),
});

export const updateGroupSchema = z
  .object({ name: name.optional(), description: description.optional(), availabilityThreshold: threshold.optional() })
  .refine(
    (patch) => patch.name !== undefined || patch.description !== undefined || patch.availabilityThreshold !== undefined,
    'Envía al menos un campo',
  );

// Máximo 32 para aceptar también los códigos de la semilla (PROY2026, HUECKO123), que no siguen el formato nuevo.
export const joinGroupSchema = z.object({
  inviteCode: z
    .string({ error: 'El código es requerido' })
    .trim()
    .min(1, 'El código es requerido')
    .max(32, 'Código de invitación inválido.')
    .transform(normalizeInviteCode),
});

export const updateMemberSchema = z.object({
  isEssential: z.boolean({ error: 'isEssential debe ser true o false' }),
});
```

`backend/src/groups/groups.repository.ts`:
```ts
import { randomUUID } from 'node:crypto';

import type { Group, GroupMember, GroupSummary } from '@hueckoapp/shared';

import type { Db } from '../db/database';
import { generateInviteCode } from './invite-code';

type GroupRow = { id: string; name: string; description: string; invite_code: string; availability_threshold: number };
type SummaryRow = Omit<GroupRow, 'invite_code'> & { member_count: number };
type MemberRow = { id: string; name: string; email: string; role: GroupMember['role']; is_essential: number };

const toMember = (row: MemberRow): GroupMember => ({
  id: row.id,
  name: row.name,
  email: row.email,
  role: row.role,
  isEssential: row.is_essential === 1,
});

const MAX_CODE_ATTEMPTS = 5;

// Los miembros siempre en orden de llegada (joined_at y, si empatan, orden de inserción).
const MEMBER_ORDER = 'ORDER BY m.joined_at, m.rowid';

export function groupsRepository(db: Db, generateCode: () => string = generateInviteCode) {
  const membersOf = (groupId: string): GroupMember[] =>
    (
      db
        .prepare(
          `SELECT u.id, u.name, u.email, m.role, m.is_essential
           FROM group_members m JOIN users u ON u.id = m.user_id
           WHERE m.group_id = ? ${MEMBER_ORDER}`,
        )
        .all(groupId) as MemberRow[]
    ).map(toMember);

  const findById = (groupId: string): Group | undefined => {
    const row = db
      .prepare('SELECT id, name, description, invite_code, availability_threshold FROM groups WHERE id = ?')
      .get(groupId) as GroupRow | undefined;
    if (!row) return undefined;
    const members = membersOf(groupId);
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      availabilityThreshold: row.availability_threshold,
      memberCount: members.length,
      inviteCode: row.invite_code,
      members,
    };
  };

  const codeExists = (code: string) => db.prepare('SELECT 1 FROM groups WHERE invite_code = ?').get(code) !== undefined;

  // Varias sentencias que deben aplicarse juntas.
  const transaction = <T>(fn: () => T): T => {
    db.exec('BEGIN');
    try {
      const result = fn();
      db.exec('COMMIT');
      return result;
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  };

  return {
    findById,

    listForUser(userId: string): GroupSummary[] {
      const rows = db
        .prepare(
          `SELECT g.id, g.name, g.description, g.availability_threshold,
                  (SELECT COUNT(*) FROM group_members c WHERE c.group_id = g.id) AS member_count
           FROM group_members m JOIN groups g ON g.id = m.group_id
           WHERE m.user_id = ? ${MEMBER_ORDER}`,
        )
        .all(userId) as SummaryRow[];
      return rows.map((r) => ({
        id: r.id,
        name: r.name,
        description: r.description,
        memberCount: r.member_count,
        availabilityThreshold: r.availability_threshold,
      }));
    },

    findIdByInviteCode(code: string): string | undefined {
      const row = db.prepare('SELECT id FROM groups WHERE invite_code = ?').get(code) as { id: string } | undefined;
      return row?.id;
    },

    isMember(groupId: string, userId: string): boolean {
      return db.prepare('SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?').get(groupId, userId) !== undefined;
    },

    // Código único: se reintenta si ya existe (G11). node:sqlite es síncrono, así que entre la
    // comprobación y el INSERT no puede colarse otra petición.
    create(ownerId: string, input: { name: string; description: string; availabilityThreshold: number }): Group {
      let code = generateCode();
      for (let attempt = 1; codeExists(code); attempt++) {
        if (attempt >= MAX_CODE_ATTEMPTS) throw new Error('No se pudo generar un código de invitación único');
        code = generateCode();
      }
      const id = randomUUID();
      transaction(() => {
        db.prepare('INSERT INTO groups (id, name, description, invite_code, availability_threshold) VALUES (?, ?, ?, ?, ?)').run(
          id, input.name, input.description, code, input.availabilityThreshold,
        );
        db.prepare("INSERT INTO group_members (group_id, user_id, role) VALUES (?, ?, 'OWNER')").run(id, ownerId);
      });
      return findById(id)!;
    },

    addMember(groupId: string, userId: string): void {
      db.prepare("INSERT INTO group_members (group_id, user_id, role) VALUES (?, ?, 'MEMBER')").run(groupId, userId);
    },

    update(groupId: string, patch: { name?: string; description?: string; availabilityThreshold?: number }): void {
      db.prepare(
        `UPDATE groups SET
           name = COALESCE(?, name),
           description = COALESCE(?, description),
           availability_threshold = COALESCE(?, availability_threshold)
         WHERE id = ?`,
      ).run(patch.name ?? null, patch.description ?? null, patch.availabilityThreshold ?? null, groupId);
    },

    setEssential(groupId: string, userId: string, isEssential: boolean): void {
      db.prepare('UPDATE group_members SET is_essential = ? WHERE group_id = ? AND user_id = ?').run(
        isEssential ? 1 : 0, groupId, userId,
      );
    },

    // Salir del grupo. Si no queda nadie, el grupo se borra; si se fue el último OWNER,
    // pasa a serlo quien lleva más tiempo (domain spec C6).
    leave(groupId: string, userId: string): void {
      transaction(() => {
        db.prepare('DELETE FROM group_members WHERE group_id = ? AND user_id = ?').run(groupId, userId);
        const { remaining, owners } = db
          .prepare(
            `SELECT COUNT(*) AS remaining, COALESCE(SUM(role = 'OWNER'), 0) AS owners
             FROM group_members WHERE group_id = ?`,
          )
          .get(groupId) as { remaining: number; owners: number };
        if (remaining === 0) {
          db.prepare('DELETE FROM groups WHERE id = ?').run(groupId);
        } else if (owners === 0) {
          db.prepare(
            `UPDATE group_members SET role = 'OWNER'
             WHERE group_id = ? AND user_id = (
               SELECT user_id FROM group_members WHERE group_id = ? ORDER BY joined_at, rowid LIMIT 1
             )`,
          ).run(groupId, groupId);
        }
      });
    },
  };
}
```

`backend/src/groups/groups.routes.ts`:
```ts
import type { GroupMember } from '@hueckoapp/shared';
import { Router } from 'express';

import type { AppDeps } from '../app';
import { getUserId } from '../auth/require-auth';
import { ApiError } from '../middleware/errors';
import { groupsRepository } from './groups.repository';
import { createGroupSchema, joinGroupSchema, updateGroupSchema, updateMemberSchema } from './groups.schemas';

// Se monta detrás de requireAuth.
export function groupsRouter({ db }: AppDeps) {
  const router = Router();
  const groups = groupsRepository(db);

  // 404 si el grupo no existe; 403 si existe pero no soy miembro.
  const loadForMember = (groupId: string, userId: string) => {
    const group = groups.findById(groupId);
    if (!group) throw new ApiError(404, 'GROUP_NOT_FOUND', 'Grupo no encontrado.');
    const me = group.members.find((m) => m.id === userId);
    if (!me) throw new ApiError(403, 'NOT_A_MEMBER', 'No perteneces a este grupo.');
    return { group, me };
  };

  const loadForOwner = (groupId: string, userId: string) => {
    const loaded = loadForMember(groupId, userId);
    if (loaded.me.role !== 'OWNER') {
      throw new ApiError(403, 'NOT_OWNER', 'Solo el administrador del grupo puede hacer esto.');
    }
    return loaded;
  };

  router.get('/', (_req, res) => {
    res.json(groups.listForUser(getUserId(res)));
  });

  router.post('/', (req, res) => {
    const input = createGroupSchema.parse(req.body);
    res.status(201).json(groups.create(getUserId(res), input));
  });

  router.post('/join', (req, res) => {
    const { inviteCode } = joinGroupSchema.parse(req.body);
    const userId = getUserId(res);
    const groupId = groups.findIdByInviteCode(inviteCode);
    if (!groupId) throw new ApiError(404, 'INVALID_INVITE_CODE', 'Código de invitación inválido.');
    if (groups.isMember(groupId, userId)) throw new ApiError(409, 'ALREADY_MEMBER', 'Ya perteneces a este grupo.');
    groups.addMember(groupId, userId);
    res.json(groups.findById(groupId));
  });

  router.get('/:id', (req, res) => {
    res.json(loadForMember(req.params.id, getUserId(res)).group);
  });

  // Permisos antes que validación: a quien no es OWNER no le importa por qué el cuerpo es inválido.
  router.patch('/:id', (req, res) => {
    const { group } = loadForOwner(req.params.id, getUserId(res));
    groups.update(group.id, updateGroupSchema.parse(req.body));
    res.json(groups.findById(group.id));
  });

  router.patch('/:id/members/:userId', (req, res) => {
    const { group } = loadForOwner(req.params.id, getUserId(res));
    const { isEssential } = updateMemberSchema.parse(req.body);
    const { userId } = req.params;
    if (!group.members.some((m) => m.id === userId)) {
      throw new ApiError(404, 'MEMBER_NOT_FOUND', 'Esa persona no pertenece al grupo.');
    }
    groups.setEssential(group.id, userId, isEssential);
    const member: GroupMember = groups.findById(group.id)!.members.find((m) => m.id === userId)!;
    res.json(member);
  });

  router.delete('/:id/members/me', (req, res) => {
    const userId = getUserId(res);
    const { group } = loadForMember(req.params.id, userId);
    groups.leave(group.id, userId);
    res.status(204).end();
  });

  return router;
}
```

`backend/src/app.ts` — import `import { groupsRouter } from './groups/groups.routes';` y, tras la línea de `/me/time-blocks`:
```ts
  api.use('/groups', requireAuth(deps.jwtSecret), groupsRouter(deps));
```

- [ ] **Step 4: Ejecutar y ver que pasa** — `npm test -w backend` → PASS. `npm run typecheck -w backend` → sin errores.

- [ ] **Step 5: Actualizar el contrato** — en `docs/api.md`, reemplazar desde `### \`GET /groups\`` hasta justo antes de `### \`GET /groups/:id/availability\`` por:

````md
### `GET /groups`
`200 GroupSummary[]`: grupos de los que soy miembro, en el orden en que me uní.

### `POST /groups`
```json
{ "name": "Proyecto Integrador", "description": "", "availabilityThreshold": 80 }
```
`name` obligatorio (1–60 tras `trim`); `description` opcional (≤ 200, por defecto `""`); `availabilityThreshold` entero 0–100 (por defecto 80).
El servidor genera el `inviteCode`: **8 caracteres** de `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (sin `0/O/1/I`), único. Los códigos de la semilla (`PROY2026`, `HUECKO123`) no siguen ese formato y siguen siendo válidos. El creador queda como `OWNER`. `201 Group`

### `POST /groups/join`
`{ "inviteCode": "PROY2026" }` → `200 Group`. El código se normaliza con `trim` y mayúsculas (`" proy2026 "` sirve).
`404 INVALID_INVITE_CODE` «Código de invitación inválido.» · `409 ALREADY_MEMBER` «Ya perteneces a este grupo.» · `400` si viene vacío.

### `GET /groups/:id`
`200 Group` con la lista completa de miembros, en orden de llegada.
`404 GROUP_NOT_FOUND` si no existe · `403 NOT_A_MEMBER` si existe pero no soy miembro. (Igual en todas las rutas `/groups/:id/...`.)

### `PATCH /groups/:id`
Solo el `OWNER` (`403 NOT_OWNER`). Campos opcionales con las mismas reglas que al crear: `name`, `description`, `availabilityThreshold`; hay que enviar al menos uno. `200 Group`

### `PATCH /groups/:id/members/:userId`
Solo el `OWNER`. `{ "isEssential": true }` → `200 GroupMember` · `404 MEMBER_NOT_FOUND` si esa persona no está en el grupo. El `OWNER` puede marcarse a sí mismo.

### `DELETE /groups/:id/members/me`
Salir del grupo. `204`. Si sale el último `OWNER` y quedan miembros, pasa a `OWNER` quien lleva más tiempo en el grupo. Si no queda nadie, el grupo se borra.
````

- [ ] **Step 6: Commit** — `git add backend/src/db/migrations.ts backend/src/groups backend/src/app.ts backend/test/helpers.ts backend/test/database.test.ts backend/test/groups.test.ts backend/test/groups.repository.test.ts docs/api.md` → `feat(backend): grupos con código de invitación, miembros imprescindibles y salida con traspaso`

---

### Task 3: Backend — `AvailabilityMatcher` y `GET /groups/:id/availability`

**Files:**
- Create: `backend/src/availability/matcher.ts`, `backend/src/availability/group-availability.ts`, `backend/test/matcher.test.ts`, `backend/test/availability.test.ts`
- Modify: `backend/src/groups/groups.routes.ts`, `docs/api.md`

**Interfaces:**
- Consumes: `timeBlocksRepository(db).listRecurringByUsers(userIds)` (Task 1); `groupsRouter` y su `loadForMember` (Task 2); `bearer`, `createGroup`, `joinGroup`, `registerUser` (helpers).
- Produces:
  - `matcher.ts`: `AGENDA_FIRST_HOUR = 8`, `AGENDA_LAST_HOUR = 19`, `WEEK = [1..7]`, `type MatcherGroup = { memberIds: readonly string[]; availabilityThreshold: number }`, `type MatcherBlock = { userId: string; dayOfWeek: number | null; startTime: string; endTime: string }`, `startHour(time): number`, `endHour(time): number`, `windowsFor(group, blocks, day): MatchWindow[]`, `weeklyWindows(group, blocks): MatchWindow[]`. Fase 3 lo reutiliza para proponer franjas.
  - `group-availability.ts`: `groupAvailability(group: MatcherGroup, blocks: readonly TimeBlock[]): MatchWindow[]`.
  - Endpoint `GET /api/groups/:id/availability` → `200 MatchWindow[]`.

- [ ] **Step 1: Escribir los tests que fallan**

`backend/test/matcher.test.ts` (ejemplos E1–E6 de domain spec §1.2 al pie de la letra):
```ts
import type { MatchWindow, TimeBlock } from '@hueckoapp/shared';
import { describe, expect, it } from 'vitest';

import { groupAvailability } from '../src/availability/group-availability';
import { endHour, startHour, weeklyWindows, windowsFor, type MatcherBlock } from '../src/availability/matcher';

const b = (userId: string, dayOfWeek: number | null, startTime: string, endTime: string): MatcherBlock => ({
  userId, dayOfWeek, startTime, endTime,
});
const hh = (h: number) => `${String(h).padStart(2, '0')}:00`;
const w = (dayOfWeek: number, start: number, end: number, availabilityPercentage: number, freeMembers: number): MatchWindow => ({
  dayOfWeek, startTime: hh(start), endTime: hh(end), availabilityPercentage, freeMembers,
});

// Semilla g1: bloques propios (reasignados a mock_123) + ocupación de Ana (user_2).
const seedGroup = { memberIds: ['mock_123', 'user_2'], availabilityThreshold: 80 };
const seedBlocks = [
  b('mock_123', 1, '08:00', '10:00'),
  b('mock_123', 3, '14:00', '16:00'),
  b('user_2', 1, '08:00', '12:00'),
  b('user_2', 3, '15:00', '19:00'),
  b('user_2', 5, '09:00', '11:00'),
];
const ABC = { memberIds: ['A', 'B', 'C'] };
const ABCDE = { memberIds: ['A', 'B', 'C', 'D', 'E'], availabilityThreshold: 80 };

describe('startHour / endHour (TimeBlock.kt)', () => {
  it('el inicio trunca los minutos y el fin redondea hacia arriba', () => {
    expect(startHour('10:30')).toBe(10);
    expect(endHour('10:30')).toBe(11);
    expect(endHour('11:00')).toBe(11);
  });

  it('las partes no numéricas valen 0', () => {
    expect(startHour('ab:cd')).toBe(0);
    expect(endHour('ab:cd')).toBe(0);
    expect(endHour('10:xx')).toBe(10);
  });
});

describe('windowsFor — ejemplos de la spec', () => {
  it('E1: semilla g1, lunes → 12:00–20:00', () => {
    expect(windowsFor(seedGroup, seedBlocks, 1)).toEqual([w(1, 12, 20, 100, 2)]);
  });

  it('E2: semilla g1, miércoles → 08–14 y 19–20', () => {
    expect(windowsFor(seedGroup, seedBlocks, 3)).toEqual([w(3, 8, 14, 100, 2), w(3, 19, 20, 100, 2)]);
  });

  it('E3: semilla g1, semana completa (9 ventanas en orden de día y hora)', () => {
    expect(weeklyWindows(seedGroup, seedBlocks)).toEqual([
      w(1, 12, 20, 100, 2),
      w(2, 8, 20, 100, 2),
      w(3, 8, 14, 100, 2),
      w(3, 19, 20, 100, 2),
      w(4, 8, 20, 100, 2),
      w(5, 8, 9, 100, 2),
      w(5, 11, 20, 100, 2),
      w(6, 8, 20, 100, 2),
      w(7, 8, 20, 100, 2),
    ]);
  });

  it('E4: al fusionar se queda con el peor % y el menor nº de libres', () => {
    const blocks = [b('A', 1, '09:00', '10:00'), b('B', 1, '11:30', '12:00')];
    expect(windowsFor({ ...ABC, availabilityThreshold: 60 }, blocks, 1)).toEqual([w(1, 8, 20, 67, 2)]);
  });

  it('E5: el umbral corta; minutos sueltos ocupan la hora; puntuales, no miembros y otros días se ignoran', () => {
    const blocks = [
      b('A', 2, '10:00', '10:30'),
      b('B', 2, '13:30', '14:00'),
      b('B', null, '08:00', '20:00'),
      b('Z', 2, '08:00', '20:00'),
      b('C', 3, '08:00', '20:00'),
    ];
    expect(windowsFor({ ...ABC, availabilityThreshold: 80 }, blocks, 2)).toEqual([
      w(2, 8, 10, 100, 3),
      w(2, 11, 13, 100, 3),
      w(2, 14, 20, 100, 3),
    ]);
  });
});

describe('windowsFor — casos límite (E6)', () => {
  it('a) grupo vacío → []', () => {
    expect(windowsFor({ memberIds: [], availabilityThreshold: 0 }, [b('A', 1, '08:00', '20:00')], 1)).toEqual([]);
  });

  it('b) umbral inclusivo y bloque recortado al rango 08–20', () => {
    expect(windowsFor(ABCDE, [b('A', 4, '07:00', '21:00')], 4)).toEqual([w(4, 8, 20, 80, 4)]);
  });

  it('c) una hora por debajo del umbral parte la ventana', () => {
    const blocks = [b('A', 4, '07:00', '21:00'), b('B', 4, '12:00', '13:00')];
    expect(windowsFor(ABCDE, blocks, 4)).toEqual([w(4, 8, 12, 80, 4), w(4, 13, 20, 80, 4)]);
  });

  it('d) umbral 0 con todos ocupados → una ventana al 0 %', () => {
    const blocks = [b('A', 5, '08:00', '20:00'), b('B', 5, '08:00', '20:00')];
    expect(windowsFor({ memberIds: ['A', 'B'], availabilityThreshold: 0 }, blocks, 5)).toEqual([w(5, 8, 20, 0, 0)]);
  });

  it('e) umbral 101 → siempre []', () => {
    expect(windowsFor({ ...seedGroup, availabilityThreshold: 101 }, [], 2)).toEqual([]);
  });

  it('f) fin anterior al inicio → el bloque no ocupa nada', () => {
    const group = { memberIds: ['A', 'B'], availabilityThreshold: 80 };
    expect(windowsFor(group, [b('A', 1, '18:00', '08:00')], 1)).toEqual([w(1, 8, 20, 100, 2)]);
  });

  it('g) dos bloques solapados de la misma persona cuentan una vez por hora', () => {
    const group = { memberIds: ['A', 'B'], availabilityThreshold: 50 };
    const blocks = [b('A', 1, '08:00', '10:00'), b('A', 1, '09:00', '11:00')];
    expect(windowsFor(group, blocks, 1)).toEqual([w(1, 8, 20, 50, 1)]);
  });

  it('redondeo Math.round de Java: 1/8 = 12,5 → 13', () => {
    const ids = ['m1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7', 'm8'];
    const blocks = ids.slice(1).map((id) => b(id, 1, '08:00', '20:00'));
    expect(windowsFor({ memberIds: ids, availabilityThreshold: 13 }, blocks, 1)).toEqual([w(1, 8, 20, 13, 1)]);
    expect(windowsFor({ memberIds: ids, availabilityThreshold: 14 }, blocks, 1)).toEqual([]);
  });

  it('el matcher portado cuenta LIBRE como ocupado (por eso groupAvailability lo filtra antes)', () => {
    const libre: TimeBlock = {
      id: 'x', userId: 'A', label: 'Libre', type: 'LIBRE', startTime: '08:00', endTime: '20:00',
      isRecurring: true, dayOfWeek: 1, date: null,
    };
    expect(windowsFor({ memberIds: ['A', 'B'], availabilityThreshold: 80 }, [libre], 1)).toEqual([]);
  });
});

describe('groupAvailability — reglas nuevas (G13/B14)', () => {
  const tb = (over: Partial<TimeBlock>): TimeBlock => ({
    id: 'x', userId: 'A', label: 'x', type: 'CLASE', startTime: '08:00', endTime: '20:00',
    isRecurring: true, dayOfWeek: 1, date: null, ...over,
  });

  it('ignora bloques LIBRE y puntuales; cruza el resto', () => {
    const blocks = [
      tb({ userId: 'A', type: 'LIBRE', dayOfWeek: 1 }),
      tb({ userId: 'A', type: 'PUNTUAL', isRecurring: false, dayOfWeek: null, date: '2026-09-28' }),
      tb({ userId: 'B', type: 'TRABAJO', dayOfWeek: 2 }),
    ];
    expect(groupAvailability({ memberIds: ['A', 'B'], availabilityThreshold: 80 }, blocks)).toEqual([
      w(1, 8, 20, 100, 2),
      w(3, 8, 20, 100, 2),
      w(4, 8, 20, 100, 2),
      w(5, 8, 20, 100, 2),
      w(6, 8, 20, 100, 2),
      w(7, 8, 20, 100, 2),
    ]);
  });
});
```

`backend/test/availability.test.ts`:
```ts
import type { TimeBlockInput } from '@hueckoapp/shared';
import type { Express } from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';

import { bearer, createGroup, joinGroup, makeTestApp, registerUser } from './helpers';

let app: Express;
beforeEach(() => {
  ({ app } = makeTestApp());
});

async function addBlock(token: string, block: Partial<TimeBlockInput>) {
  const body: TimeBlockInput = {
    label: 'Bloque', type: 'CLASE', startTime: '08:00', endTime: '10:00',
    isRecurring: true, dayOfWeek: 1, date: null, ...block,
  };
  const res = await request(app).post('/api/me/time-blocks').set(bearer(token)).send(body);
  if (res.status !== 201) throw new Error(`bloque falló: ${res.status} ${JSON.stringify(res.body)}`);
}

const availability = (groupId: string, token: string) =>
  request(app).get(`/api/groups/${groupId}/availability`).set(bearer(token));

const full = (dayOfWeek: number, startTime = '08:00', endTime = '20:00', availabilityPercentage = 100, freeMembers = 2) => ({
  dayOfWeek, startTime, endTime, availabilityPercentage, freeMembers,
});

describe('GET /api/groups/:id/availability', () => {
  it('cruza los horarios recurrentes de los miembros (E3 de la spec con usuarios reales)', async () => {
    const yo = await registerUser(app);
    const ana = await registerUser(app);
    const group = await createGroup(app, yo.token);
    await joinGroup(app, ana.token, group.inviteCode);
    await addBlock(yo.token, { dayOfWeek: 1, startTime: '08:00', endTime: '10:00' });
    await addBlock(yo.token, { dayOfWeek: 3, startTime: '14:00', endTime: '16:00' });
    await addBlock(ana.token, { dayOfWeek: 1, startTime: '08:00', endTime: '12:00' });
    await addBlock(ana.token, { dayOfWeek: 3, startTime: '15:00', endTime: '19:00' });
    await addBlock(ana.token, { dayOfWeek: 5, startTime: '09:00', endTime: '11:00' });

    const res = await availability(group.id, yo.token);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([
      full(1, '12:00'),
      full(2),
      full(3, '08:00', '14:00'),
      full(3, '19:00'),
      full(4),
      full(5, '08:00', '09:00'),
      full(5, '11:00'),
      full(6),
      full(7),
    ]);
  });

  it('no cuentan los bloques LIBRE, los puntuales ni los de quien no es miembro', async () => {
    const yo = await registerUser(app);
    const ana = await registerUser(app);
    const fuera = await registerUser(app);
    const group = await createGroup(app, yo.token);
    await joinGroup(app, ana.token, group.inviteCode);
    await addBlock(ana.token, { type: 'LIBRE', dayOfWeek: 2, startTime: '08:00', endTime: '20:00' });
    await addBlock(ana.token, {
      type: 'PUNTUAL', isRecurring: false, dayOfWeek: null, date: '2026-10-06', startTime: '08:00', endTime: '20:00',
    });
    await addBlock(fuera.token, { dayOfWeek: 2, startTime: '08:00', endTime: '20:00' });

    const res = await availability(group.id, yo.token);
    expect(res.body).toEqual([1, 2, 3, 4, 5, 6, 7].map((d) => full(d)));
  });

  it('usa el umbral del grupo', async () => {
    const yo = await registerUser(app);
    const ana = await registerUser(app);
    const group = await createGroup(app, yo.token, { availabilityThreshold: 50 });
    await joinGroup(app, ana.token, group.inviteCode);
    await addBlock(yo.token, { dayOfWeek: 1, startTime: '08:00', endTime: '20:00' });

    const res = await availability(group.id, yo.token);
    expect(res.body[0]).toEqual(full(1, '08:00', '20:00', 50, 1));
  });

  it('quien no es miembro → 403', async () => {
    const yo = await registerUser(app);
    const otra = await registerUser(app);
    const group = await createGroup(app, yo.token);
    expect((await availability(group.id, otra.token)).status).toBe(403);
  });
});
```

- [ ] **Step 2: Ejecutar y ver que falla** — `npm test -w backend -- matcher availability` → FAIL (módulos inexistentes; ruta 404).

- [ ] **Step 3: Implementar**

`backend/src/availability/matcher.ts`:
```ts
import type { MatchWindow } from '@hueckoapp/shared';

// Puerto EXACTO de AvailabilityMatcher.kt (legacy-android). Función pura, sin base de datos.
// Reglas y ejemplos: docs/superpowers/specs/2026-09-29-domain-logic-spec.md §1.
// No añadir reglas aquí: las nuevas van en group-availability.ts.

/** La hora h representa la franja [h:00, h+1:00). La agenda va de 08:00 a 20:00. */
export const AGENDA_FIRST_HOUR = 8;
export const AGENDA_LAST_HOUR = 19;
export const WEEK = [1, 2, 3, 4, 5, 6, 7] as const;

export type MatcherGroup = { memberIds: readonly string[]; availabilityThreshold: number };
export type MatcherBlock = { userId: string; dayOfWeek: number | null; startTime: string; endTime: string };

// Igual que String.toIntOrNull() de Kotlin: dígitos con signo opcional; si no, null.
const toIntOrNull = (s: string | undefined): number | null => (s !== undefined && /^[+-]?\d+$/.test(s) ? Number(s) : null);

/** TimeBlock.startHour: hora de inicio truncando minutos ("10:30" → 10). Lo no numérico vale 0. */
export function startHour(time: string): number {
  const colon = time.indexOf(':');
  return toIntOrNull(colon === -1 ? time : time.slice(0, colon)) ?? 0;
}

/** TimeBlock.endHour: hora de fin redondeada hacia arriba ("10:30" → 11, "11:00" → 11). */
export function endHour(time: string): number {
  const [hourPart, minutePart] = time.split(':');
  const hour = toIntOrNull(hourPart) ?? 0;
  const minutes = toIntOrNull(minutePart) ?? 0;
  return minutes > 0 ? hour + 1 : hour;
}

type HourWindow = { startHour: number; endHour: number; availabilityPercentage: number; freeMembers: number };

const pad2 = (n: number) => String(n).padStart(2, '0');

/**
 * Franjas del día `day` (1–7) en las que al menos el umbral del grupo está libre.
 * Una franja se describe por su hora MENOS disponible (mínimo), no por la media.
 */
export function windowsFor(group: MatcherGroup, blocks: readonly MatcherBlock[], day: number): MatchWindow[] {
  const size = group.memberIds.length;
  if (size === 0) return [];

  const members = new Set(group.memberIds);
  const relevant = blocks.filter((b) => members.has(b.userId) && b.dayOfWeek === day);
  const windows: HourWindow[] = [];

  for (let hour = AGENDA_FIRST_HOUR; hour <= AGENDA_LAST_HOUR; hour++) {
    const busy = new Set(
      relevant.filter((b) => hour >= startHour(b.startTime) && hour < endHour(b.endTime)).map((b) => b.userId),
    );
    const free = size - busy.size;
    // Math.round de Java (floor(x + 0.5)); idéntico al de JS para valores ≥ 0.
    const percentage = Math.round((free * 100) / size);
    if (percentage < group.availabilityThreshold) continue;

    const last = windows.at(-1);
    if (last && last.endHour === hour) {
      last.endHour = hour + 1;
      last.availabilityPercentage = Math.min(last.availabilityPercentage, percentage);
      last.freeMembers = Math.min(last.freeMembers, free);
    } else {
      windows.push({ startHour: hour, endHour: hour + 1, availabilityPercentage: percentage, freeMembers: free });
    }
  }

  return windows.map((w) => ({
    dayOfWeek: day,
    startTime: `${pad2(w.startHour)}:00`,
    endTime: `${pad2(w.endHour)}:00`,
    availabilityPercentage: w.availabilityPercentage,
    freeMembers: w.freeMembers,
  }));
}

/** Lunes a domingo concatenados: el resultado queda ordenado por día y hora (allWindowsFor en Kotlin). */
export function weeklyWindows(group: MatcherGroup, blocks: readonly MatcherBlock[]): MatchWindow[] {
  return WEEK.flatMap((day) => windowsFor(group, blocks, day));
}
```

`backend/src/availability/group-availability.ts`:
```ts
import type { MatchWindow, TimeBlock } from '@hueckoapp/shared';

import { weeklyWindows, type MatcherGroup } from './matcher';

// Reglas añadidas sobre el matcher de Kotlin (domain spec G13 y B14), documentadas en docs/api.md:
// - solo cuentan los bloques recurrentes: la vista es semanal y un puntual tiene fecha, no día fijo;
// - un bloque LIBRE no ocupa: marca tiempo libre.
export function groupAvailability(group: MatcherGroup, blocks: readonly TimeBlock[]): MatchWindow[] {
  const busy = blocks.filter((b) => b.isRecurring && b.type !== 'LIBRE');
  return weeklyWindows(group, busy);
}
```

`backend/src/groups/groups.routes.ts` — imports:
```ts
import type { GroupMember, MatchWindow } from '@hueckoapp/shared';
import { groupAvailability } from '../availability/group-availability';
import { timeBlocksRepository } from '../schedule/time-blocks.repository';
```
Dentro de `groupsRouter`, junto a `const groups = …`: `const blocks = timeBlocksRepository(db);` y, antes de `return router;`:
```ts
  router.get('/:id/availability', (req, res) => {
    const { group } = loadForMember(req.params.id, getUserId(res));
    const memberIds = group.members.map((m) => m.id);
    const windows: MatchWindow[] = groupAvailability(
      { memberIds, availabilityThreshold: group.availabilityThreshold },
      blocks.listRecurringByUsers(memberIds),
    );
    res.json(windows);
  });
```

- [ ] **Step 4: Ejecutar y ver que pasa** — `npm test -w backend` → PASS. `npm run typecheck -w backend` → sin errores.

- [ ] **Step 5: Actualizar el contrato** — en `docs/api.md`, reemplazar la sección `### \`GET /groups/:id/availability\`` (título y sus dos líneas) por:

````md
### `GET /groups/:id/availability`
Cruce de horarios de todos los miembros, calculado en el servidor con el umbral del grupo (mismo algoritmo que `AvailabilityMatcher.kt`).
`200 MatchWindow[]`, ordenadas por día (lunes a domingo) y hora · `403 NOT_A_MEMBER` · `404 GROUP_NOT_FOUND`.

Reglas:
- La agenda va de **08:00 a 20:00** en horas enteras; cada hora `h` es la franja `[h:00, h+1:00)`.
- Un bloque ocupa **entera** cualquier hora que toque: el inicio trunca minutos (`10:30` → 10) y el fin redondea hacia arriba (`10:30` → 11).
- Por hora: `libres = miembros − personas ocupadas` (una persona cuenta una vez aunque tenga bloques solapados); `% = round(libres × 100 / miembros)`.
- Una hora vale si `% ≥ availabilityThreshold` (inclusivo). Las horas válidas seguidas se fusionan en una franja, que muestra el **peor** `%` y el **menor** `freeMembers` de sus horas.
- Solo cuentan los bloques **recurrentes**; los puntuales no entran en esta vista semanal (un filtro `?weekOf=YYYY-MM-DD` queda pendiente).
- Los bloques de tipo **`LIBRE` no ocupan**.
- Grupo sin miembros → `[]`.
````

Y al final de «Cambios respecto a la app Kotlin» añadir:
```md
- **Código de invitación:** 8 caracteres sin símbolos ambiguos, generado y garantizado único por el servidor (antes: 3 letras del nombre + 3 cifras, podía repetirse). Se acepta en minúsculas y con espacios.
- **Cruce de agendas:** los bloques `LIBRE` ya no cuentan como ocupados.
```

- [ ] **Step 6: Commit** — `git add backend/src/availability backend/src/groups/groups.routes.ts backend/test/matcher.test.ts backend/test/availability.test.ts docs/api.md` → `feat(backend): cruce de disponibilidad del grupo (puerto de AvailabilityMatcher)`

---

### Task 4: Backend — semilla de desarrollo

**Files:**
- Create: `backend/src/db/seed.ts`
- Modify: `backend/package.json`, `README.md`

**Interfaces:**
- Consumes: `openDatabase` (Fase 1), `hashPassword` (Fase 1), `env` (`src/config/env.ts`), tablas de Tasks 1–2.
- Produces: script `npm run seed -w backend` (idempotente); cuentas demo `test@test.com`, `ana@test.com`, `carlos@test.com` con contraseña `password123`; grupos «Proyecto Integrador» (`PROY2026`) y «Amigos de la Uni» (`HUECKO123`).

> La semilla **no** tiene test automático: por regla (Global Constraints) nunca se ejecuta en los tests. Se verifica a mano en el Step 3, incluido que el cruce de la semilla dé exactamente el ejemplo E3 de la spec.

- [ ] **Step 1: Implementar** — `backend/src/db/seed.ts`:
```ts
// Semilla de desarrollo (domain spec §3.2): usuarios, grupos y bloques de ejemplo.
// Uso: npm run seed -w backend. Idempotente: repetirla no duplica nada.
// Nunca se ejecuta en los tests ni en producción. Las propuestas de la semilla llegan en la Fase 3.
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

import type { BlockType } from '@hueckoapp/shared';

import { hashPassword } from '../auth/passwords';
import { env } from '../config/env';
import { openDatabase, type Db } from './database';

export const DEMO_PASSWORD = 'password123';

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

function seed(db: Db, passwordHash: string) {
  const created = { users: 0, groups: 0, blocks: 0 };
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
    if (db.prepare('SELECT 1 FROM groups WHERE invite_code = ?').get(g.inviteCode)) continue;
    const id = randomUUID();
    db.prepare("INSERT INTO groups (id, name, description, invite_code, availability_threshold) VALUES (?, ?, '', ?, 80)").run(
      id, g.name, g.inviteCode,
    );
    for (const m of g.members) {
      db.prepare('INSERT INTO group_members (group_id, user_id, role) VALUES (?, ?, ?)').run(id, ids[m.user], m.role);
    }
    created.groups++;
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

  return created;
}

async function main() {
  if (env.NODE_ENV === 'production') throw new Error('La semilla es solo para desarrollo.');
  const passwordHash = await hashPassword(DEMO_PASSWORD);
  mkdirSync(dirname(env.DATABASE_PATH), { recursive: true });
  const db = openDatabase(env.DATABASE_PATH);
  db.exec('BEGIN');
  try {
    const created = seed(db, passwordHash);
    db.exec('COMMIT');
    console.log(
      `Semilla aplicada en ${env.DATABASE_PATH}: ${created.users} usuarios, ${created.groups} grupos y ${created.blocks} bloques nuevos.`,
    );
    console.log(`Cuentas demo: test@test.com, ana@test.com y carlos@test.com — contraseña «${DEMO_PASSWORD}».`);
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  } finally {
    db.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
```

`backend/package.json`, en `scripts` (conservar los existentes): `"seed": "tsx src/db/seed.ts"`.

- [ ] **Step 2: Typecheck** — `npm run typecheck -w backend` → sin errores. `npm test -w backend` → PASS (sin cambios: la semilla no se importa en ningún test).

- [ ] **Step 3: Verificación manual** (requiere `backend/.env` con `JWT_SECRET`, como indica el README). Desde la raíz, en Git Bash:
```bash
DATABASE_PATH=./data/seed-check.db npm run seed -w backend
```
Expected: «Semilla aplicada en ./data/seed-check.db: 3 usuarios, 2 grupos y 5 bloques nuevos.». Repetir el mismo comando → «0 usuarios, 0 grupos y 0 bloques nuevos.». Contar filas:
```bash
node -e "const {DatabaseSync}=require('node:sqlite');const db=new DatabaseSync('backend/data/seed-check.db');for(const t of ['users','groups','group_members','time_blocks'])console.log(t,db.prepare('SELECT COUNT(*) AS n FROM '+t).get().n)"
```
Expected: `users 3`, `groups 2`, `group_members 3`, `time_blocks 5`. Luego, con el servidor sobre esa base (`DATABASE_PATH=./data/seed-check.db PORT=3100 npm run backend` en otra terminal):
```bash
node -e "
const base='http://localhost:3100/api';
(async()=>{
  const login=await (await fetch(base+'/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'test@test.com',password:'password123'})})).json();
  const h={Authorization:'Bearer '+login.token};
  const groups=await (await fetch(base+'/groups',{headers:h})).json();
  const g=groups.find(x=>x.name==='Proyecto Integrador');
  console.log(JSON.stringify(await (await fetch(base+'/groups/'+g.id+'/availability',{headers:h})).json()));
})();"
```
Expected: las 9 ventanas de la tabla E3 (LUN 12–20, MAR 8–20, MIÉ 8–14, MIÉ 19–20, JUE 8–20, VIE 8–9, VIE 11–20, SÁB 8–20, DOM 8–20; todas 100 % y `freeMembers` 2). Detener el servidor y borrar `rm -f backend/data/seed-check.db*`.

- [ ] **Step 4: README** — en «Cómo levantar el proyecto», después del bloque «2. Backend», añadir:

````md
### 2b. Datos de ejemplo (opcional)
```bash
npm run seed -w backend   # usuarios, grupos y horarios de prueba; se puede repetir sin duplicar nada
```

| Correo | Contraseña | Qué tiene |
|---|---|---|
| `test@test.com` | `password123` | Administra «Proyecto Integrador» (código `PROY2026`) junto con Ana. Clases el lunes 08–10 y el miércoles 14–16 |
| `ana@test.com` | `password123` | Miembro de «Proyecto Integrador». Bloques el lunes, el miércoles y el viernes |
| `carlos@test.com` | `password123` | Único miembro de «Amigos de la Uni»: prueba «Unirme» con el código `HUECKO123` |
````
y cambiar la nota «Primer usuario» por: «> **Primer usuario:** créalo desde la pantalla de registro («Regístrate») o carga los datos de ejemplo del paso 2b.»

- [ ] **Step 5: Commit** — `git add backend/src/db/seed.ts backend/package.json README.md` → `feat(backend): semilla de desarrollo con usuarios, grupos y horarios demo`

---

### Task 5: Mobile — capa de datos (API tipada y hooks)

**Files:**
- Create: `mobile/src/api/schedule.ts`, `mobile/src/api/groups.ts`, `mobile/src/hooks/useResource.ts`, `mobile/src/hooks/useAction.ts`, `mobile/src/hooks/useRefreshOnFocus.ts`, `mobile/src/hooks/useSchedule.ts`, `mobile/src/hooks/useGroups.ts`, `mobile/src/hooks/useGroup.ts`, `mobile/src/hooks/useAvailability.ts`
- Test: `mobile/src/api/__tests__/endpoints.test.ts`, `mobile/src/hooks/__tests__/useResource.test.ts`, `mobile/src/hooks/__tests__/useAction.test.ts`, `mobile/src/hooks/__tests__/useRefreshOnFocus.test.ts`, `mobile/src/hooks/__tests__/useSchedule.test.ts`, `mobile/src/hooks/__tests__/useGroups.test.ts`

**Interfaces:**
- Consumes: `api`, `ApiError`, `errorMessage` (`src/api/client.ts`); tipos de `@hueckoapp/shared` (incl. `TimeBlockInput` de Task 1); endpoints de Tasks 1–3.
- Produces:
  - `src/api/schedule.ts`: `listTimeBlocks(): Promise<TimeBlock[]>`, `createTimeBlock(input: TimeBlockInput): Promise<TimeBlock>`, `deleteTimeBlock(id: string): Promise<void>`.
  - `src/api/groups.ts`: `type CreateGroupInput = { name: string; description?: string; availabilityThreshold?: number }`; `listGroups(): Promise<GroupSummary[]>`, `getGroup(id): Promise<Group>`, `createGroup(input): Promise<Group>`, `joinGroup(inviteCode): Promise<Group>` (normaliza trim + mayúsculas), `setMemberEssential(groupId, userId, isEssential): Promise<GroupMember>`, `leaveGroup(groupId): Promise<void>`, `getAvailability(groupId): Promise<MatchWindow[]>`.
  - `useResource<T>(load: () => Promise<T>): Resource<T>` con `type Resource<T> = { data: T | undefined; error: string | null; loading: boolean; refreshing: boolean; reload(): Promise<void>; mutate(update: (prev: T | undefined) => T | undefined): void }`. `load` debe ser estable; `reload` y `mutate` son estables.
  - `useAction<A extends unknown[], R>(fn: (...args: A) => Promise<R>): { run(...args: A): Promise<ActionResult<R>>; loading: boolean; error: string | null; clearError(): void }`, `type ActionResult<R> = { ok: true; value: R } | { ok: false }`.
  - `useRefreshOnFocus(refresh: () => unknown): void` — no recarga en el primer foco.
  - `useSchedule(): { blocks: TimeBlock[]; loading; refreshing; error; reload; removeBlock(id: string): Promise<void> }` (`removeBlock` lanza si falla).
  - `useGroups(): { groups: GroupSummary[]; loading; refreshing; error; reload; create(name: string): Promise<Group>; join(inviteCode: string): Promise<Group> }` (lanzan si fallan).
  - `useGroup(groupId): { group: Group | undefined; loading; refreshing; error; reload; setEssential(userId, isEssential): Promise<void>; leave(): Promise<void> }`.
  - `useAvailability(groupId): { windows: MatchWindow[]; loading; refreshing; error; reload }`.

- [ ] **Step 1: Escribir los tests que fallan**

`mobile/src/api/__tests__/endpoints.test.ts`:
```ts
import type { TimeBlockInput } from '@hueckoapp/shared';
import type { AxiosAdapter, InternalAxiosRequestConfig } from 'axios';

import { api } from '../client';
import * as groups from '../groups';
import * as schedule from '../schedule';

const original = api.defaults.adapter;
let calls: InternalAxiosRequestConfig[] = [];

// Adaptador falso que responde 200 y guarda la petición para inspeccionarla.
const recorder: AxiosAdapter = async (config) => {
  calls.push(config);
  return { data: [], status: 200, statusText: '', headers: {}, config };
};

beforeEach(() => {
  calls = [];
  api.defaults.adapter = recorder;
});
afterAll(() => {
  api.defaults.adapter = original;
});

const block: TimeBlockInput = {
  label: 'Clase', type: 'CLASE', startTime: '08:00', endTime: '10:00', isRecurring: true, dayOfWeek: 1, date: null,
};

it.each<[string, () => Promise<unknown>, string, string, unknown]>([
  ['listTimeBlocks', () => schedule.listTimeBlocks(), 'get', '/me/time-blocks', undefined],
  ['createTimeBlock', () => schedule.createTimeBlock(block), 'post', '/me/time-blocks', block],
  ['deleteTimeBlock', () => schedule.deleteTimeBlock('b 1'), 'delete', '/me/time-blocks/b%201', undefined],
  ['listGroups', () => groups.listGroups(), 'get', '/groups', undefined],
  ['getGroup', () => groups.getGroup('g1'), 'get', '/groups/g1', undefined],
  ['createGroup', () => groups.createGroup({ name: 'Estudio' }), 'post', '/groups', { name: 'Estudio' }],
  ['joinGroup', () => groups.joinGroup(' proy2026 '), 'post', '/groups/join', { inviteCode: 'PROY2026' }],
  ['setMemberEssential', () => groups.setMemberEssential('g1', 'u2', true), 'patch', '/groups/g1/members/u2', { isEssential: true }],
  ['leaveGroup', () => groups.leaveGroup('g1'), 'delete', '/groups/g1/members/me', undefined],
  ['getAvailability', () => groups.getAvailability('g1'), 'get', '/groups/g1/availability', undefined],
])('%s → %s %s', async (_name, call, method, url, body) => {
  await call();
  expect(calls).toHaveLength(1);
  expect(calls[0].method).toBe(method);
  expect(calls[0].url).toBe(url);
  if (body !== undefined) expect(JSON.parse(calls[0].data)).toEqual(body);
});
```

`mobile/src/hooks/__tests__/useResource.test.ts`:
```ts
import { act, renderHook, waitFor } from '@testing-library/react-native';

import { ApiError } from '../../api/client';
import { useResource } from '../useResource';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

it('carga al montar: loading hasta que llegan los datos', async () => {
  const d = deferred<string[]>();
  const load = jest.fn(() => d.promise);
  const { result } = await renderHook(() => useResource(load));
  expect(result.current.loading).toBe(true);
  expect(result.current.data).toBeUndefined();

  await act(async () => d.resolve(['a']));
  expect(result.current.loading).toBe(false);
  expect(result.current.data).toEqual(['a']);
  expect(result.current.error).toBeNull();
  expect(load).toHaveBeenCalledTimes(1);
});

it('si falla deja el mensaje de error listo para mostrar', async () => {
  const load = jest.fn().mockRejectedValue(new ApiError(500, 'INTERNAL_ERROR', 'Error inesperado del servidor'));
  const { result } = await renderHook(() => useResource(load));
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.error).toBe('Error inesperado del servidor');
  expect(result.current.data).toBeUndefined();
});

it('reload con datos en pantalla usa refreshing (no loading) y limpia el error al acertar', async () => {
  const d = deferred<string[]>();
  const load = jest
    .fn<Promise<string[]>, []>()
    .mockResolvedValueOnce(['a'])
    .mockReturnValueOnce(d.promise);
  const { result } = await renderHook(() => useResource(load));
  await waitFor(() => expect(result.current.data).toEqual(['a']));

  let pending!: Promise<void>;
  await act(async () => {
    pending = result.current.reload();
  });
  expect(result.current.refreshing).toBe(true);
  expect(result.current.loading).toBe(false);
  expect(result.current.data).toEqual(['a']);

  await act(async () => {
    d.resolve(['b']);
    await pending;
  });
  expect(result.current.refreshing).toBe(false);
  expect(result.current.data).toEqual(['b']);
});

it('descarta una respuesta vieja que llega después de una más nueva', async () => {
  const first = deferred<string>();
  const second = deferred<string>();
  const load = jest.fn<Promise<string>, []>().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
  const { result } = await renderHook(() => useResource(load));

  await act(async () => {
    void result.current.reload();
  });
  await act(async () => second.resolve('nuevo'));
  await act(async () => first.resolve('viejo'));
  expect(result.current.data).toBe('nuevo');
});

it('mutate cambia los datos sin ir al servidor', async () => {
  const load = jest.fn().mockResolvedValue([1, 2]);
  const { result } = await renderHook(() => useResource<number[]>(load));
  await waitFor(() => expect(result.current.data).toEqual([1, 2]));
  await act(async () => result.current.mutate((prev) => prev?.filter((n) => n !== 1)));
  expect(result.current.data).toEqual([2]);
  expect(load).toHaveBeenCalledTimes(1);
});

it('vuelve a cargar si cambia la función load', async () => {
  const loadA = jest.fn().mockResolvedValue('A');
  const loadB = jest.fn().mockResolvedValue('B');
  const { result, rerender } = await renderHook(({ load }) => useResource(load), { initialProps: { load: loadA } });
  await waitFor(() => expect(result.current.data).toBe('A'));
  await rerender({ load: loadB });
  await waitFor(() => expect(result.current.data).toBe('B'));
});
```

`mobile/src/hooks/__tests__/useAction.test.ts`:
```ts
import { act, renderHook } from '@testing-library/react-native';

import { ApiError } from '../../api/client';
import { useAction, type ActionResult } from '../useAction';

it('devuelve { ok: true, value } y marca loading mientras corre', async () => {
  let resolve!: (value: string) => void;
  const fn = jest.fn((_name: string) => new Promise<string>((r) => (resolve = r)));
  const { result } = await renderHook(() => useAction(fn));

  let pending!: Promise<ActionResult<string>>;
  await act(async () => {
    pending = result.current.run('Estudio');
  });
  expect(result.current.loading).toBe(true);
  expect(fn).toHaveBeenCalledWith('Estudio');

  await act(async () => resolve('hecho'));
  await expect(pending).resolves.toEqual({ ok: true, value: 'hecho' });
  expect(result.current.loading).toBe(false);
  expect(result.current.error).toBeNull();
});

it('si falla guarda el mensaje, devuelve { ok: false } y clearError lo borra', async () => {
  const fn = jest.fn<Promise<void>, []>().mockRejectedValue(new ApiError(409, 'ALREADY_MEMBER', 'Ya perteneces a este grupo.'));
  const { result } = await renderHook(() => useAction(fn));

  let res: ActionResult<void> | undefined;
  await act(async () => {
    res = await result.current.run();
  });
  expect(res).toEqual({ ok: false });
  expect(result.current.error).toBe('Ya perteneces a este grupo.');

  await act(async () => result.current.clearError());
  expect(result.current.error).toBeNull();
});

it('ignora un segundo envío mientras el primero sigue en curso', async () => {
  let resolve!: () => void;
  const fn = jest.fn(() => new Promise<void>((r) => (resolve = r)));
  const { result } = await renderHook(() => useAction(fn));

  let first!: Promise<ActionResult<void>>;
  let second!: Promise<ActionResult<void>>;
  await act(async () => {
    first = result.current.run();
    second = result.current.run();
  });
  await expect(second).resolves.toEqual({ ok: false });
  await act(async () => resolve());
  await expect(first).resolves.toEqual({ ok: true, value: undefined });
  expect(fn).toHaveBeenCalledTimes(1);
});
```

`mobile/src/hooks/__tests__/useRefreshOnFocus.test.ts`:
```ts
import { renderHook } from '@testing-library/react-native';

import { useRefreshOnFocus } from '../useRefreshOnFocus';

// Se captura el efecto que el hook registra para simular "la pantalla gana el foco".
const mockFocusEffects: Array<() => void> = [];
jest.mock('@react-navigation/native', () => ({
  useFocusEffect: (effect: () => void) => {
    mockFocusEffects.push(effect);
  },
}));

it('no recarga en el primer foco (ya cargó al montar) y sí al volver a la pantalla', async () => {
  const refresh = jest.fn();
  await renderHook(() => useRefreshOnFocus(refresh));
  mockFocusEffects.at(-1)!();
  expect(refresh).not.toHaveBeenCalled();
  mockFocusEffects.at(-1)!();
  expect(refresh).toHaveBeenCalledTimes(1);
});
```

`mobile/src/hooks/__tests__/useSchedule.test.ts`:
```ts
import type { TimeBlock } from '@hueckoapp/shared';
import { act, renderHook, waitFor } from '@testing-library/react-native';

import { ApiError } from '../../api/client';
import * as scheduleApi from '../../api/schedule';
import { useSchedule } from '../useSchedule';

jest.mock('../../api/schedule');
const mocked = scheduleApi as jest.Mocked<typeof scheduleApi>;

const block = (over: Partial<TimeBlock>): TimeBlock => ({
  id: 'b1', userId: 'u1', label: 'Clase', type: 'CLASE', startTime: '08:00', endTime: '10:00',
  isRecurring: true, dayOfWeek: 1, date: null, ...over,
});

beforeEach(() => jest.clearAllMocks());

it('carga mis bloques', async () => {
  mocked.listTimeBlocks.mockResolvedValue([block({ id: 'b1' })]);
  const { result } = await renderHook(() => useSchedule());
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.blocks).toEqual([block({ id: 'b1' })]);
});

it('removeBlock borra en el servidor y lo quita de la lista', async () => {
  mocked.listTimeBlocks.mockResolvedValue([block({ id: 'b1' }), block({ id: 'b2' })]);
  mocked.deleteTimeBlock.mockResolvedValue();
  const { result } = await renderHook(() => useSchedule());
  await waitFor(() => expect(result.current.blocks).toHaveLength(2));

  await act(async () => result.current.removeBlock('b1'));
  expect(mocked.deleteTimeBlock).toHaveBeenCalledWith('b1');
  expect(result.current.blocks.map((b) => b.id)).toEqual(['b2']);
});

it('si el borrado falla, lanza y no toca la lista', async () => {
  mocked.listTimeBlocks.mockResolvedValue([block({ id: 'b1' })]);
  mocked.deleteTimeBlock.mockRejectedValue(new ApiError(404, 'TIME_BLOCK_NOT_FOUND', 'Bloque no encontrado.'));
  const { result } = await renderHook(() => useSchedule());
  await waitFor(() => expect(result.current.blocks).toHaveLength(1));

  await act(async () => {
    await expect(result.current.removeBlock('b1')).rejects.toMatchObject({ code: 'TIME_BLOCK_NOT_FOUND' });
  });
  expect(result.current.blocks).toHaveLength(1);
});
```

`mobile/src/hooks/__tests__/useGroups.test.ts`:
```ts
import type { Group, GroupMember, GroupSummary } from '@hueckoapp/shared';
import { act, renderHook, waitFor } from '@testing-library/react-native';

import { ApiError } from '../../api/client';
import * as groupsApi from '../../api/groups';
import { useAvailability } from '../useAvailability';
import { useGroup } from '../useGroup';
import { useGroups } from '../useGroups';

jest.mock('../../api/groups');
const mocked = groupsApi as jest.Mocked<typeof groupsApi>;

const owner: GroupMember = { id: 'u1', name: 'Usuario de Prueba', email: 'test@test.com', role: 'OWNER', isEssential: false };
const ana: GroupMember = { id: 'u2', name: 'Ana', email: 'ana@test.com', role: 'MEMBER', isEssential: false };
const summary: GroupSummary = { id: 'g1', name: 'Proyecto Integrador', description: '', memberCount: 2, availabilityThreshold: 80 };
const group = (over: Partial<Group> = {}): Group => ({ ...summary, inviteCode: 'PROY2026', members: [owner, ana], ...over });

beforeEach(() => jest.clearAllMocks());

describe('useGroups', () => {
  it('carga mis grupos', async () => {
    mocked.listGroups.mockResolvedValue([summary]);
    const { result } = await renderHook(() => useGroups());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.groups).toEqual([summary]);
  });

  it('create recorta el nombre, crea y añade el resumen a la lista', async () => {
    mocked.listGroups.mockResolvedValue([]);
    mocked.createGroup.mockResolvedValue(group({ id: 'g2', name: 'Estudio', memberCount: 1, members: [owner] }));
    const { result } = await renderHook(() => useGroups());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.create('  Estudio  ');
    });
    expect(mocked.createGroup).toHaveBeenCalledWith({ name: 'Estudio' });
    expect(result.current.groups).toEqual([
      { id: 'g2', name: 'Estudio', description: '', memberCount: 1, availabilityThreshold: 80 },
    ]);
  });

  it('join añade el grupo; si falla, propaga el ApiError', async () => {
    mocked.listGroups.mockResolvedValue([]);
    mocked.joinGroup
      .mockResolvedValueOnce(group())
      .mockRejectedValueOnce(new ApiError(409, 'ALREADY_MEMBER', 'Ya perteneces a este grupo.'));
    const { result } = await renderHook(() => useGroups());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.join('PROY2026');
    });
    expect(result.current.groups).toEqual([summary]);

    await act(async () => {
      await expect(result.current.join('PROY2026')).rejects.toMatchObject({ code: 'ALREADY_MEMBER' });
    });
    expect(result.current.groups).toEqual([summary]);
  });
});

describe('useGroup', () => {
  it('setEssential actualiza solo a ese miembro', async () => {
    mocked.getGroup.mockResolvedValue(group());
    mocked.setMemberEssential.mockResolvedValue({ ...ana, isEssential: true });
    const { result } = await renderHook(() => useGroup('g1'));
    await waitFor(() => expect(result.current.group).toBeDefined());

    await act(async () => result.current.setEssential('u2', true));
    expect(mocked.setMemberEssential).toHaveBeenCalledWith('g1', 'u2', true);
    expect(result.current.group!.members).toEqual([owner, { ...ana, isEssential: true }]);
  });

  it('leave llama a la API con el id del grupo', async () => {
    mocked.getGroup.mockResolvedValue(group());
    mocked.leaveGroup.mockResolvedValue();
    const { result } = await renderHook(() => useGroup('g1'));
    await act(async () => result.current.leave());
    expect(mocked.leaveGroup).toHaveBeenCalledWith('g1');
  });

  it('vuelve a cargar si cambia el id', async () => {
    mocked.getGroup.mockImplementation(async (id) => group({ id }));
    const { result, rerender } = await renderHook(({ id }) => useGroup(id), { initialProps: { id: 'g1' } });
    await waitFor(() => expect(result.current.group?.id).toBe('g1'));
    await rerender({ id: 'g2' });
    await waitFor(() => expect(result.current.group?.id).toBe('g2'));
  });
});

describe('useAvailability', () => {
  it('carga las franjas del grupo', async () => {
    const windows = [{ dayOfWeek: 1, startTime: '12:00', endTime: '20:00', availabilityPercentage: 100, freeMembers: 2 }];
    mocked.getAvailability.mockResolvedValue(windows);
    const { result } = await renderHook(() => useAvailability('g1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(mocked.getAvailability).toHaveBeenCalledWith('g1');
    expect(result.current.windows).toEqual(windows);
  });
});
```

- [ ] **Step 2: Ejecutar y ver que falla** — `npm test -w mobile -- endpoints hooks` → FAIL (módulos inexistentes).

- [ ] **Step 3: Implementar la API**

`mobile/src/api/schedule.ts`:
```ts
import type { TimeBlock, TimeBlockInput } from '@hueckoapp/shared';

import { api } from './client';

export type { TimeBlockInput };

export const listTimeBlocks = async () => (await api.get<TimeBlock[]>('/me/time-blocks')).data;

export const createTimeBlock = async (input: TimeBlockInput) =>
  (await api.post<TimeBlock>('/me/time-blocks', input)).data;

export const deleteTimeBlock = async (id: string): Promise<void> => {
  await api.delete(`/me/time-blocks/${encodeURIComponent(id)}`);
};
```

`mobile/src/api/groups.ts`:
```ts
import type { Group, GroupMember, GroupSummary, MatchWindow } from '@hueckoapp/shared';

import { api } from './client';

export type CreateGroupInput = { name: string; description?: string; availabilityThreshold?: number };

const groupPath = (id: string) => `/groups/${encodeURIComponent(id)}`;

export const listGroups = async () => (await api.get<GroupSummary[]>('/groups')).data;

export const getGroup = async (id: string) => (await api.get<Group>(groupPath(id))).data;

export const createGroup = async (input: CreateGroupInput) => (await api.post<Group>('/groups', input)).data;

// El servidor también normaliza (G10); aquí se hace para enviar ya el código limpio.
export const joinGroup = async (inviteCode: string) =>
  (await api.post<Group>('/groups/join', { inviteCode: inviteCode.trim().toUpperCase() })).data;

export const setMemberEssential = async (groupId: string, userId: string, isEssential: boolean) =>
  (await api.patch<GroupMember>(`${groupPath(groupId)}/members/${encodeURIComponent(userId)}`, { isEssential })).data;

export const leaveGroup = async (groupId: string): Promise<void> => {
  await api.delete(`${groupPath(groupId)}/members/me`);
};

export const getAvailability = async (groupId: string) =>
  (await api.get<MatchWindow[]>(`${groupPath(groupId)}/availability`)).data;
```

- [ ] **Step 4: Implementar los hooks**

`mobile/src/hooks/useResource.ts`:
```ts
import { useCallback, useEffect, useRef, useState } from 'react';

import { errorMessage } from '../api/client';

export type Resource<T> = {
  data: T | undefined;
  /** Mensaje listo para mostrar si la última carga falló; null si fue bien. */
  error: string | null;
  /** Primera carga, todavía sin datos. */
  loading: boolean;
  /** Recarga con datos ya en pantalla (deslizar para actualizar, volver a la pantalla). */
  refreshing: boolean;
  reload: () => Promise<void>;
  /** Cambia los datos en memoria sin ir al servidor (tras crear o borrar algo). */
  mutate: (update: (prev: T | undefined) => T | undefined) => void;
};

// Hook genérico para LEER del servidor. Carga al montar y cada vez que cambia `load`,
// distingue la primera carga de una recarga y descarta respuestas que llegan tarde.
// `load` debe ser estable (función de módulo o useCallback); si no, recargaría en cada render.
export function useResource<T>(load: () => Promise<T>): Resource<T> {
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const loadRef = useRef(load);
  const hasData = useRef(false);
  const lastRequest = useRef(0);

  const reload = useCallback(async () => {
    const request = ++lastRequest.current;
    if (hasData.current) setRefreshing(true);
    else setLoading(true);
    try {
      const result = await loadRef.current();
      if (request !== lastRequest.current) return; // llegó tarde: ya hay una petición más nueva
      hasData.current = true;
      setData(result);
      setError(null);
    } catch (e) {
      if (request !== lastRequest.current) return;
      setError(errorMessage(e));
    } finally {
      if (request === lastRequest.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    loadRef.current = load;
    void reload();
  }, [load, reload]);

  // Al desmontar, cualquier respuesta pendiente se ignora.
  useEffect(
    () => () => {
      lastRequest.current += 1;
    },
    [],
  );

  const mutate = useCallback((update: (prev: T | undefined) => T | undefined) => {
    setData((prev) => update(prev));
  }, []);

  return { data, error, loading, refreshing, reload, mutate };
}
```

`mobile/src/hooks/useAction.ts`:
```ts
import { useCallback, useEffect, useRef, useState } from 'react';

import { errorMessage } from '../api/client';

export type ActionResult<R> = { ok: true; value: R } | { ok: false };

// Hook genérico para ESCRIBIR (crear, unirse, guardar…): expone loading y el mensaje de error,
// y evita el doble envío. Nunca lanza: devuelve { ok: false } si falló o si ya había uno en curso.
export function useAction<A extends unknown[], R>(fn: (...args: A) => Promise<R>) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fnRef = useRef(fn);
  const busy = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    fnRef.current = fn;
  }, [fn]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const run = useCallback(async (...args: A): Promise<ActionResult<R>> => {
    if (busy.current) return { ok: false };
    busy.current = true;
    setLoading(true);
    setError(null);
    try {
      return { ok: true, value: await fnRef.current(...args) };
    } catch (e) {
      if (mounted.current) setError(errorMessage(e));
      return { ok: false };
    } finally {
      busy.current = false;
      if (mounted.current) setLoading(false);
    }
  }, []);

  const clearError = useCallback(() => setError(null), []);

  return { run, loading, error, clearError };
}
```

`mobile/src/hooks/useRefreshOnFocus.ts`:
```ts
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useRef } from 'react';

// Recarga cuando el usuario vuelve a la pantalla (p. ej. tras guardar un bloque o salir de un grupo).
// El primer foco se salta: los datos se acaban de cargar al montar.
export function useRefreshOnFocus(refresh: () => unknown) {
  const firstFocus = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (firstFocus.current) {
        firstFocus.current = false;
        return;
      }
      void refresh();
    }, [refresh]),
  );
}
```

`mobile/src/hooks/useSchedule.ts`:
```ts
import type { TimeBlock } from '@hueckoapp/shared';
import { useCallback } from 'react';

import { deleteTimeBlock, listTimeBlocks } from '../api/schedule';
import { useResource } from './useResource';

const NO_BLOCKS: TimeBlock[] = [];

// Mi horario: la lista de bloques y cómo borrarlos. Crear se hace en AddSchedule con useAction.
export function useSchedule() {
  const { data, loading, refreshing, error, reload, mutate } = useResource(listTimeBlocks);

  // Lanza si falla: la pantalla decide cómo avisar.
  const removeBlock = useCallback(
    async (id: string) => {
      await deleteTimeBlock(id);
      mutate((prev) => prev?.filter((b) => b.id !== id));
    },
    [mutate],
  );

  return { blocks: data ?? NO_BLOCKS, loading, refreshing, error, reload, removeBlock };
}
```

`mobile/src/hooks/useGroups.ts`:
```ts
import type { Group, GroupSummary } from '@hueckoapp/shared';
import { useCallback } from 'react';

import { createGroup, joinGroup, listGroups } from '../api/groups';
import { useResource } from './useResource';

const NO_GROUPS: GroupSummary[] = [];

const toSummary = (g: Group): GroupSummary => ({
  id: g.id,
  name: g.name,
  description: g.description,
  memberCount: g.memberCount,
  availabilityThreshold: g.availabilityThreshold,
});

// Mis grupos: la lista, crear y unirse. create/join lanzan si fallan (los diálogos usan useAction).
export function useGroups() {
  const { data, loading, refreshing, error, reload, mutate } = useResource(listGroups);

  const create = useCallback(
    async (name: string) => {
      const group = await createGroup({ name: name.trim() });
      mutate((prev) => [...(prev ?? []), toSummary(group)]);
      return group;
    },
    [mutate],
  );

  const join = useCallback(
    async (inviteCode: string) => {
      const group = await joinGroup(inviteCode);
      mutate((prev) => [...(prev ?? []).filter((g) => g.id !== group.id), toSummary(group)]);
      return group;
    },
    [mutate],
  );

  return { groups: data ?? NO_GROUPS, loading, refreshing, error, reload, create, join };
}
```

`mobile/src/hooks/useGroup.ts`:
```ts
import { useCallback } from 'react';

import { getGroup, leaveGroup, setMemberEssential } from '../api/groups';
import { useResource } from './useResource';

// Detalle de un grupo con sus miembros.
export function useGroup(groupId: string) {
  const load = useCallback(() => getGroup(groupId), [groupId]);
  const { data, loading, refreshing, error, reload, mutate } = useResource(load);

  // Lanza si falla.
  const setEssential = useCallback(
    async (userId: string, isEssential: boolean) => {
      const member = await setMemberEssential(groupId, userId, isEssential);
      mutate((prev) => prev && { ...prev, members: prev.members.map((m) => (m.id === member.id ? member : m)) });
    },
    [groupId, mutate],
  );

  const leave = useCallback(() => leaveGroup(groupId), [groupId]);

  return { group: data, loading, refreshing, error, reload, setEssential, leave };
}
```

`mobile/src/hooks/useAvailability.ts`:
```ts
import type { MatchWindow } from '@hueckoapp/shared';
import { useCallback } from 'react';

import { getAvailability } from '../api/groups';
import { useResource } from './useResource';

const NO_WINDOWS: MatchWindow[] = [];

// Huecos en común del grupo (calculados en el servidor).
export function useAvailability(groupId: string) {
  const load = useCallback(() => getAvailability(groupId), [groupId]);
  const { data, loading, refreshing, error, reload } = useResource(load);
  return { windows: data ?? NO_WINDOWS, loading, refreshing, error, reload };
}
```

- [ ] **Step 5: Ejecutar y ver que pasa** — `npm test -w mobile` → PASS (incluidos los de Fase 1). `npm run typecheck -w mobile` → sin errores.

- [ ] **Step 6: Commit** — `git add mobile/src/api/schedule.ts mobile/src/api/groups.ts mobile/src/api/__tests__/endpoints.test.ts mobile/src/hooks` → `feat(mobile): API de horario y grupos con hooks propios (useResource, useAction y de dominio)`

---

### Task 6: Mobile — «Mi horario» y «Nuevo bloque»

**Files:**
- Create: `mobile/src/utils/clock.ts`, `mobile/src/utils/time.ts`, `mobile/src/utils/days.ts`, `mobile/src/components/ChoiceChip.tsx`, `mobile/src/components/DaySelector.tsx`, `mobile/src/components/TimeBlockItem.tsx`, `mobile/src/screens/schedule/MyScheduleScreen.tsx`, `mobile/src/screens/schedule/AddScheduleScreen.tsx`
- Modify: `mobile/src/components/TextField.tsx`, `mobile/src/components/index.ts`, `mobile/src/navigation/types.ts`, `mobile/src/navigation/RootNavigator.tsx`, `mobile/src/navigation/AppDrawer.tsx`, `mobile/src/components/__tests__/components.test.tsx`
- Test: `mobile/src/utils/__tests__/time.test.ts`, `mobile/src/utils/__tests__/days.test.ts`, `mobile/src/screens/schedule/__tests__/MyScheduleScreen.test.tsx`, `mobile/src/screens/schedule/__tests__/AddScheduleScreen.test.tsx`

**Interfaces:**
- Consumes: `useSchedule`, `useAction`, `useRefreshOnFocus` (Task 5); `createTimeBlock` (Task 5); componentes y tema de Fase 1; `showToast`, `errorMessage`.
- Produces:
  - `utils/clock.ts`: `today(): Date` (los tests lo sustituyen con `jest.mock`).
  - `utils/time.ts`: `TIME_REGEX`, `isValidTime(v)`, `toMinutes(v)`, `type FieldHint = { text: string; error: boolean }`, `startTimeHint(start): FieldHint`, `endTimeHint(start, end): FieldHint`, `isValidRange(start, end): boolean`.
  - `utils/days.ts`: `DAY_SHORT`, `DAY_LONG`, `WEEK_DAYS`, `dayShort(iso)`, `dayLong(iso)`, `isoDayOf(date)`, `toDateKey(date)`, `parseDateKey(key)`, `weekDates(today): string[]`, `upcomingDates(today, count): string[]`, `formatDateLabel(key): string` («Vie 2 oct»), `blocksForDay(blocks, iso, today): TimeBlock[]`.
  - Componentes: `ChoiceChip({ label, selected, onPress, caption?, variant?: 'label' | 'title', accessibilityLabel?, style? })`, `DaySelector({ selected, onSelect, captionFor })`, `TimeBlockItem({ block, onDelete? })`; `TextField` acepta además `label?` (opcional), `accessibilityLabel?`, `helperText?`, `maxLength?`.
  - Navegación: `AppStackParamList.AddSchedule: { initialDay?: number } | undefined`; tipos `AppStackScreen<K>` y `DrawerScreen<K>` (Task 7 los reutiliza).

- [ ] **Step 1: Escribir los tests que fallan**

`mobile/src/utils/__tests__/time.test.ts`:
```ts
import { endTimeHint, isValidRange, isValidTime, startTimeHint, toMinutes } from '../time';

describe('horas HH:mm', () => {
  it.each([
    ['00:00', true], ['23:59', true], ['08:30', true],
    ['8:00', false], ['24:00', false], ['12:60', false], ['', false], ['ab:cd', false],
  ])('isValidTime(%j) → %s', (v, ok) => expect(isValidTime(v)).toBe(ok));

  it('toMinutes', () => expect(toMinutes('10:30')).toBe(630));

  it('pista de inicio', () => {
    expect(startTimeHint('08:00')).toEqual({ text: 'Inicio', error: false });
    expect(startTimeHint('8:00')).toEqual({ text: 'Formato HH:mm', error: true });
  });

  it('pista de fin: formato, orden o todo bien', () => {
    expect(endTimeHint('08:00', '9')).toEqual({ text: 'Formato HH:mm', error: true });
    expect(endTimeHint('10:00', '10:00')).toEqual({ text: 'Debe ser posterior', error: true });
    expect(endTimeHint('10:00', '09:59')).toEqual({ text: 'Debe ser posterior', error: true });
    expect(endTimeHint('08:00', '10:00')).toEqual({ text: 'Fin', error: false });
    expect(endTimeHint('8:00', '10:00')).toEqual({ text: 'Fin', error: false }); // el error va en el inicio
  });

  it('isValidRange exige ambas válidas y fin estrictamente posterior', () => {
    expect(isValidRange('08:00', '09:00')).toBe(true);
    expect(isValidRange('09:00', '09:00')).toBe(false);
    expect(isValidRange('8:00', '09:00')).toBe(false);
  });
});
```

`mobile/src/utils/__tests__/days.test.ts`:
```ts
import type { TimeBlock } from '@hueckoapp/shared';

import { blocksForDay, dayShort, formatDateLabel, isoDayOf, toDateKey, upcomingDates, weekDates } from '../days';

const TUESDAY = new Date(2026, 8, 29, 10, 0); // martes 29 de septiembre de 2026

const b = (over: Partial<TimeBlock>): TimeBlock => ({
  id: 'x', userId: 'u', label: 'x', type: 'CLASE', startTime: '08:00', endTime: '09:00',
  isRecurring: true, dayOfWeek: 1, date: null, ...over,
});

describe('fechas de la semana', () => {
  it('isoDayOf: lunes = 1 … domingo = 7', () => {
    expect(isoDayOf(new Date(2026, 8, 28))).toBe(1);
    expect(isoDayOf(TUESDAY)).toBe(2);
    expect(isoDayOf(new Date(2026, 9, 4))).toBe(7);
  });

  it('toDateKey usa la fecha local', () => {
    expect(toDateKey(new Date(2026, 0, 5, 23, 30))).toBe('2026-01-05');
  });

  it('weekDates: de lunes a domingo, también cruzando de año', () => {
    const week = ['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04'];
    expect(weekDates(TUESDAY)).toEqual(week);
    expect(weekDates(new Date(2026, 9, 4))).toEqual(week);
    expect(weekDates(new Date(2026, 11, 31))).toEqual([
      '2026-12-28', '2026-12-29', '2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02', '2027-01-03',
    ]);
  });

  it('upcomingDates empieza hoy', () => {
    expect(upcomingDates(TUESDAY, 3)).toEqual(['2026-09-29', '2026-09-30', '2026-10-01']);
  });

  it('formatDateLabel y dayShort', () => {
    expect(formatDateLabel('2026-10-02')).toBe('Vie 2 oct');
    expect(dayShort(3)).toBe('Mié');
  });
});

describe('blocksForDay', () => {
  it('junta los recurrentes del día y los puntuales de esta semana, ordenados por hora', () => {
    const blocks = [
      b({ id: 'r10', dayOfWeek: 1, startTime: '10:00' }),
      b({ id: 'r08', dayOfWeek: 1, startTime: '08:00' }),
      b({ id: 'p09', isRecurring: false, type: 'PUNTUAL', dayOfWeek: null, date: '2026-09-28', startTime: '09:00' }),
      b({ id: 'pOtraSemana', isRecurring: false, type: 'PUNTUAL', dayOfWeek: null, date: '2026-10-05', startTime: '07:00' }),
      b({ id: 'rMartes', dayOfWeek: 2 }),
    ];
    expect(blocksForDay(blocks, 1, TUESDAY).map((x) => x.id)).toEqual(['r08', 'p09', 'r10']);
  });
});
```

Añadir a `mobile/src/components/__tests__/components.test.tsx`:
```tsx
describe('TextField con pista', () => {
  it('muestra helperText sin error; el error la reemplaza; sin label usa accessibilityLabel', async () => {
    const { rerender } = await render(
      <TextField accessibilityLabel="Hora de inicio" value="08:00" onChangeText={() => {}} helperText="Inicio" />,
    );
    expect(screen.getByText('Inicio')).toBeTruthy();
    expect(screen.getByLabelText('Hora de inicio')).toBeTruthy();
    await rerender(
      <TextField accessibilityLabel="Hora de inicio" value="8:00" onChangeText={() => {}} helperText="Inicio" error="Formato HH:mm" />,
    );
    expect(screen.queryByText('Inicio')).toBeNull();
    expect(screen.getByText('Formato HH:mm')).toBeTruthy();
  });
});
```

`mobile/src/screens/schedule/__tests__/MyScheduleScreen.test.tsx`:
```tsx
import type { TimeBlock } from '@hueckoapp/shared';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';

import { ApiError } from '../../../api/client';
import * as scheduleApi from '../../../api/schedule';
import { showToast } from '../../../utils/toast';
import { MyScheduleScreen } from '../MyScheduleScreen';

jest.mock('../../../api/schedule');
jest.mock('../../../utils/toast', () => ({ showToast: jest.fn() }));
jest.mock('../../../hooks/useRefreshOnFocus', () => ({ useRefreshOnFocus: jest.fn() }));
// Hoy es martes 29 de septiembre de 2026.
jest.mock('../../../utils/clock', () => ({ today: () => new Date(2026, 8, 29, 10, 0) }));

const mocked = scheduleApi as jest.Mocked<typeof scheduleApi>;
const navigation = { navigate: jest.fn() } as any;
const block = (over: Partial<TimeBlock>): TimeBlock => ({
  id: 'b', userId: 'u1', label: 'Bloque', type: 'CLASE', startTime: '08:00', endTime: '10:00',
  isRecurring: true, dayOfWeek: 1, date: null, ...over,
});
const renderScreen = () => render(<MyScheduleScreen navigation={navigation} route={{} as any} />);

beforeEach(() => jest.clearAllMocks());

it('sin bloques muestra el estado vacío y su acción abre el formulario en el día de hoy', async () => {
  mocked.listTimeBlocks.mockResolvedValue([]);
  await renderScreen();
  expect(await screen.findByText('Aún no tienes horarios registrados')).toBeTruthy();
  await fireEvent.press(screen.getByText('Añadir mi primer bloque'));
  expect(navigation.navigate).toHaveBeenCalledWith('AddSchedule', { initialDay: 2 });
});

it('arranca en hoy (martes) y muestra un puntual de esta semana en su día', async () => {
  mocked.listTimeBlocks.mockResolvedValue([
    block({ id: 'b1', label: 'Clase de Android', dayOfWeek: 1 }),
    block({ id: 'b2', label: 'Tutoría', dayOfWeek: 2, startTime: '11:00', endTime: '12:00' }),
    block({
      id: 'b3', label: 'Dentista', type: 'PUNTUAL', isRecurring: false, dayOfWeek: null,
      date: '2026-10-02', startTime: '15:00', endTime: '16:00',
    }),
  ]);
  await renderScreen();
  expect(await screen.findByText('Tutoría')).toBeTruthy();
  expect(screen.queryByText('Clase de Android')).toBeNull();

  await fireEvent.press(screen.getByText('Vie'));
  expect(screen.getByText('Dentista')).toBeTruthy();
  expect(screen.getByText('Vie 2 oct · 15:00 - 16:00')).toBeTruthy();
  expect(screen.getByText('Puntual')).toBeTruthy();

  await fireEvent.press(screen.getByText('Jue'));
  expect(screen.getByText('Sin bloques el Jue')).toBeTruthy();
});

it('pide confirmación antes de borrar y solo borra al confirmar', async () => {
  mocked.listTimeBlocks.mockResolvedValue([block({ id: 'b2', label: 'Tutoría', dayOfWeek: 2 })]);
  mocked.deleteTimeBlock.mockResolvedValue();
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  await renderScreen();

  await fireEvent.press(await screen.findByLabelText('Eliminar Tutoría'));
  expect(alert).toHaveBeenCalledWith(
    'Eliminar bloque',
    '¿Seguro que quieres eliminar «Tutoría» de tu horario?',
    expect.any(Array),
  );
  expect(mocked.deleteTimeBlock).not.toHaveBeenCalled();

  const buttons = alert.mock.calls[0][2]!;
  await act(async () => buttons.find((b) => b.text === 'Eliminar')!.onPress!());
  await waitFor(() => expect(screen.queryByText('Tutoría')).toBeNull());
  expect(mocked.deleteTimeBlock).toHaveBeenCalledWith('b2');
  expect(showToast).toHaveBeenCalledWith('Bloque eliminado.');
});

it('"Escanear" avisa que llega en la Fase 4', async () => {
  mocked.listTimeBlocks.mockResolvedValue([]);
  await renderScreen();
  await fireEvent.press(screen.getByText('Escanear'));
  expect(showToast).toHaveBeenCalledWith('Disponible en la Fase 4');
});

it('si falla la carga muestra el error y permite reintentar', async () => {
  mocked.listTimeBlocks
    .mockRejectedValueOnce(new ApiError(0, 'NETWORK_ERROR', 'No se pudo conectar con el servidor. Revisa tu conexión.'))
    .mockResolvedValueOnce([]);
  await renderScreen();
  expect(await screen.findByText('No se pudo conectar con el servidor. Revisa tu conexión.')).toBeTruthy();
  await fireEvent.press(screen.getByText('Reintentar'));
  expect(await screen.findByText('Aún no tienes horarios registrados')).toBeTruthy();
});
```

`mobile/src/screens/schedule/__tests__/AddScheduleScreen.test.tsx`:
```tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { ApiError } from '../../../api/client';
import * as scheduleApi from '../../../api/schedule';
import { showToast } from '../../../utils/toast';
import { AddScheduleScreen } from '../AddScheduleScreen';

jest.mock('../../../api/schedule');
jest.mock('../../../utils/toast', () => ({ showToast: jest.fn() }));
jest.mock('../../../utils/clock', () => ({ today: () => new Date(2026, 8, 29, 10, 0) }));

const mocked = scheduleApi as jest.Mocked<typeof scheduleApi>;
const navigation = { goBack: jest.fn() } as any;
const renderScreen = (params?: { initialDay?: number }) =>
  render(<AddScheduleScreen navigation={navigation} route={{ key: 'AddSchedule', name: 'AddSchedule', params } as any} />);

beforeEach(() => jest.clearAllMocks());

it('empieza con 08:00–09:00 y muestra las pistas de cada hora', async () => {
  await renderScreen();
  expect(screen.getByLabelText('Hora de inicio').props.value).toBe('08:00');
  expect(screen.getByLabelText('Hora de fin').props.value).toBe('09:00');
  expect(screen.getByText('Inicio')).toBeTruthy();
  expect(screen.getByText('Fin')).toBeTruthy();
});

it('valida formato y orden de las horas y no guarda si no son válidas', async () => {
  await renderScreen();
  await fireEvent.changeText(screen.getByLabelText('Nombre del bloque'), 'Cálculo');
  await fireEvent.changeText(screen.getByLabelText('Hora de inicio'), '8:00');
  expect(screen.getByText('Formato HH:mm')).toBeTruthy();
  await fireEvent.changeText(screen.getByLabelText('Hora de inicio'), '10:00');
  await fireEvent.changeText(screen.getByLabelText('Hora de fin'), '09:30');
  expect(screen.getByText('Debe ser posterior')).toBeTruthy();
  await fireEvent.press(screen.getByText('Guardar bloque'));
  expect(mocked.createTimeBlock).not.toHaveBeenCalled();
});

it('sin nombre no guarda (sin mensaje, como en Kotlin)', async () => {
  await renderScreen();
  await fireEvent.press(screen.getByText('Guardar bloque'));
  expect(mocked.createTimeBlock).not.toHaveBeenCalled();
});

it('guarda un bloque recurrente del día recibido, con el tipo elegido, y vuelve atrás', async () => {
  mocked.createTimeBlock.mockResolvedValue({} as any);
  await renderScreen({ initialDay: 3 });
  await fireEvent.changeText(screen.getByLabelText('Nombre del bloque'), '  Clase de Cálculo ');
  await fireEvent.changeText(screen.getByLabelText('Hora de fin'), '10:00');
  await fireEvent.press(screen.getByText('Trabajo'));
  await fireEvent.press(screen.getByText('Guardar bloque'));

  await waitFor(() => expect(navigation.goBack).toHaveBeenCalled());
  expect(mocked.createTimeBlock).toHaveBeenCalledWith({
    label: 'Clase de Cálculo', type: 'TRABAJO', startTime: '08:00', endTime: '10:00',
    isRecurring: true, dayOfWeek: 3, date: null,
  });
  expect(showToast).toHaveBeenCalledWith('Bloque guardado.');
});

it('un bloque puntual lleva fecha (no día) y tipo PUNTUAL por defecto', async () => {
  mocked.createTimeBlock.mockResolvedValue({} as any);
  await renderScreen();
  await fireEvent.changeText(screen.getByLabelText('Nombre del bloque'), 'Dentista');
  await fireEvent.press(screen.getByText('Puntual (Única vez)'));
  expect(screen.queryByText('Día de la semana')).toBeNull();
  await fireEvent.press(screen.getByText('Vie 2 oct'));
  await fireEvent.press(screen.getByText('Guardar bloque'));

  await waitFor(() => expect(mocked.createTimeBlock).toHaveBeenCalled());
  expect(mocked.createTimeBlock).toHaveBeenCalledWith({
    label: 'Dentista', type: 'PUNTUAL', startTime: '08:00', endTime: '09:00',
    isRecurring: false, dayOfWeek: null, date: '2026-10-02',
  });
});

it('muestra el error del servidor y se queda en la pantalla', async () => {
  mocked.createTimeBlock.mockRejectedValue(
    new ApiError(400, 'VALIDATION_ERROR', 'Datos inválidos', [{ message: 'Máximo 80 caracteres' }]),
  );
  await renderScreen();
  await fireEvent.changeText(screen.getByLabelText('Nombre del bloque'), 'Clase');
  await fireEvent.press(screen.getByText('Guardar bloque'));
  expect(await screen.findByText('Máximo 80 caracteres')).toBeTruthy();
  expect(navigation.goBack).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Ejecutar y ver que falla** — `npm test -w mobile -- utils components schedule` → FAIL.

- [ ] **Step 3: Implementar utilidades**

`mobile/src/utils/clock.ts`:
```ts
// Único punto para "ahora": los tests lo sustituyen con jest.mock para fijar el día.
export const today = () => new Date();
```

`mobile/src/utils/time.ts`:
```ts
// Misma regla que AddScheduleScreen.kt y que el backend: "HH:mm" de 00:00 a 23:59, con dos dígitos.
export const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

export const isValidTime = (value: string) => TIME_REGEX.test(value);

export const toMinutes = (value: string) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5));

export type FieldHint = { text: string; error: boolean };

// Texto bajo cada campo (UI spec §2.10): siempre visible, en rojo si hay error.
export const startTimeHint = (start: string): FieldHint =>
  isValidTime(start) ? { text: 'Inicio', error: false } : { text: 'Formato HH:mm', error: true };

export function endTimeHint(start: string, end: string): FieldHint {
  if (!isValidTime(end)) return { text: 'Formato HH:mm', error: true };
  if (isValidTime(start) && toMinutes(end) <= toMinutes(start)) return { text: 'Debe ser posterior', error: true };
  return { text: 'Fin', error: false };
}

export const isValidRange = (start: string, end: string) =>
  isValidTime(start) && isValidTime(end) && toMinutes(end) > toMinutes(start);
```

`mobile/src/utils/days.ts`:
```ts
import type { TimeBlock } from '@hueckoapp/shared';

export const DAY_SHORT = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'] as const;
export const DAY_LONG = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'] as const;
const MONTH_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'] as const;
export const WEEK_DAYS = [1, 2, 3, 4, 5, 6, 7] as const;

export const dayShort = (iso: number) => DAY_SHORT[iso - 1];
export const dayLong = (iso: number) => DAY_LONG[iso - 1];

/** Día ISO de una fecha local: 1 = lunes … 7 = domingo (getDay() da 0 = domingo). */
export const isoDayOf = (date: Date) => ((date.getDay() + 6) % 7) + 1;

const pad2 = (n: number) => String(n).padStart(2, '0');

/** "YYYY-MM-DD" en hora local (no UTC: a las 23:00 en Lima sigue siendo hoy). */
export const toDateKey = (date: Date) => `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;

/** Medianoche local de "YYYY-MM-DD". */
export const parseDateKey = (key: string) => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
};

const addDays = (date: Date, days: number) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);

/** Las 7 fechas (lunes a domingo) de la semana que contiene `today`. */
export const weekDates = (today: Date) => WEEK_DAYS.map((iso) => toDateKey(addDays(today, iso - isoDayOf(today))));

/** `count` fechas seguidas empezando hoy (para elegir el día de un bloque puntual). */
export const upcomingDates = (today: Date, count: number) =>
  Array.from({ length: count }, (_, i) => toDateKey(addDays(today, i)));

/** "Vie 2 oct" */
export const formatDateLabel = (key: string) => {
  const date = parseDateKey(key);
  return `${dayShort(isoDayOf(date))} ${date.getDate()} ${MONTH_SHORT[date.getMonth()]}`;
};

/**
 * Bloques del día `iso` en la semana actual: los recurrentes de ese día y los puntuales cuya
 * fecha cae en ese día de esta semana (arregla UI spec §6 quirk 10). Ordenados por hora.
 */
export function blocksForDay(blocks: readonly TimeBlock[], iso: number, today: Date): TimeBlock[] {
  const date = weekDates(today)[iso - 1];
  return blocks
    .filter((b) => (b.isRecurring ? b.dayOfWeek === iso : b.date === date))
    .sort((a, b) => (a.startTime < b.startTime ? -1 : a.startTime > b.startTime ? 1 : 0));
}
```

- [ ] **Step 4: Implementar componentes**

`mobile/src/components/TextField.tsx` — reemplazar completo:
```tsx
import { MaterialIcons } from '@expo/vector-icons';
import { useState, type Ref } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';

import { colors, radius, typography } from '../theme';
import type { IconName } from './icons';

type Props = {
  /** Etiqueta encima del campo. Si se omite, pasar accessibilityLabel. */
  label?: string;
  accessibilityLabel?: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  leadingIcon?: IconName;
  error?: string;
  /** Texto de ayuda bajo el campo cuando no hay error. */
  helperText?: string;
  secureToggle?: boolean;
  keyboardType?: TextInputProps['keyboardType'];
  autoCapitalize?: TextInputProps['autoCapitalize'];
  autoComplete?: TextInputProps['autoComplete'];
  textContentType?: TextInputProps['textContentType'];
  returnKeyType?: TextInputProps['returnKeyType'];
  onSubmitEditing?: TextInputProps['onSubmitEditing'];
  maxLength?: number;
  inputRef?: Ref<TextInput>;
  testID?: string;
};

export function TextField({
  label,
  accessibilityLabel,
  value,
  onChangeText,
  placeholder,
  leadingIcon,
  error,
  helperText,
  secureToggle = false,
  keyboardType,
  autoCapitalize,
  autoComplete,
  textContentType,
  returnKeyType,
  onSubmitEditing,
  maxLength,
  inputRef,
  testID,
}: Props) {
  const [focused, setFocused] = useState(false);
  const [hidden, setHidden] = useState(true);
  const borderColor = error ? colors.error : focused ? colors.primary : colors.outlineVariant;
  const borderWidth = error || focused ? 2 : 1;

  return (
    <View>
      {label ? (
        <>
          <Text style={[typography.labelMedium, { color: colors.onSurfaceVariant }]}>{label}</Text>
          <View style={{ height: 6 }} />
        </>
      ) : null}
      <View style={[styles.container, { borderColor, borderWidth }]}>
        {leadingIcon ? <MaterialIcons name={leadingIcon} size={20} color={colors.onSurfaceVariant} style={styles.leading} /> : null}
        <TextInput
          ref={inputRef}
          testID={testID}
          accessibilityLabel={accessibilityLabel ?? label}
          style={[typography.bodyLarge, styles.input, { color: colors.onSurface }]}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.outline}
          selectionColor={colors.primary}
          secureTextEntry={secureToggle && hidden}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          autoComplete={autoComplete}
          textContentType={textContentType}
          returnKeyType={returnKeyType}
          onSubmitEditing={onSubmitEditing}
          maxLength={maxLength}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
        />
        {secureToggle ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={hidden ? 'Mostrar contraseña' : 'Ocultar contraseña'}
            onPress={() => setHidden((h) => !h)}
            style={styles.toggle}
          >
            <MaterialIcons name={hidden ? 'visibility' : 'visibility-off'} size={20} color={colors.onSurfaceVariant} />
          </Pressable>
        ) : null}
      </View>
      {error ? (
        <Text accessibilityLiveRegion="polite" style={[typography.bodySmall, styles.hint, { color: colors.error }]}>
          {error}
        </Text>
      ) : helperText ? (
        <Text style={[typography.bodySmall, styles.hint, { color: colors.onSurfaceVariant }]}>{helperText}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flexDirection: 'row', alignItems: 'center', minHeight: 56, borderRadius: radius.xxl, paddingHorizontal: 12 },
  leading: { marginRight: 10 },
  input: { flex: 1, paddingVertical: 0 },
  toggle: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', marginRight: -12 },
  hint: { marginTop: 4 },
});
```

`mobile/src/components/ChoiceChip.tsx`:
```tsx
import { Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';

import { colors, radius, typography } from '../theme';

type Props = {
  label: string;
  selected: boolean;
  onPress: () => void;
  /** Segunda línea (p. ej. nº de bloques del día). */
  caption?: string;
  /** 'title' para chips de día (titleSmall); 'label' para opciones (labelMedium). */
  variant?: 'label' | 'title';
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
};

// Botón de elección: relleno primary si está elegido, surfaceContainer si no (UI spec §2.10 y §3.8).
export function ChoiceChip({ label, selected, onPress, caption, variant = 'label', accessibilityLabel, style }: Props) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={[styles.chip, { backgroundColor: selected ? colors.primary : colors.surfaceContainer }, style]}
    >
      <Text
        numberOfLines={1}
        style={[variant === 'title' ? typography.titleSmall : typography.labelMedium, { color: selected ? colors.onPrimary : colors.onSurface }]}
      >
        {label}
      </Text>
      {caption !== undefined ? (
        <Text numberOfLines={1} style={[typography.bodySmall, { color: selected ? colors.onPrimary : colors.onSurfaceVariant }]}>
          {caption}
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    minHeight: 48,
    borderRadius: radius.xxl,
    paddingHorizontal: 14,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
```

`mobile/src/components/DaySelector.tsx`:
```tsx
import { ScrollView, StyleSheet } from 'react-native';

import { dayLong, dayShort, WEEK_DAYS } from '../utils/days';
import { ChoiceChip } from './ChoiceChip';

type Props = { selected: number; onSelect: (iso: number) => void; captionFor: (iso: number) => string };

// HueckoDaySelector (UI spec §3.8): 7 chips Lun…Dom con una segunda línea por día.
export function DaySelector({ selected, onSelect, captionFor }: Props) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      {WEEK_DAYS.map((iso) => (
        <ChoiceChip
          key={iso}
          variant="title"
          label={dayShort(iso)}
          caption={captionFor(iso)}
          accessibilityLabel={`${dayLong(iso)}, ${captionFor(iso)}`}
          selected={iso === selected}
          onPress={() => onSelect(iso)}
          style={styles.chip}
        />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { gap: 8 },
  chip: { minWidth: 64, minHeight: 56, paddingHorizontal: 10 },
});
```

`mobile/src/components/TimeBlockItem.tsx`:
```tsx
import { MaterialIcons } from '@expo/vector-icons';
import type { TimeBlock } from '@hueckoapp/shared';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { categoryColorFor, colors, radius, typography } from '../theme';
import { dayShort, formatDateLabel } from '../utils/days';
import { Badge } from './Badge';

type Props = { block: TimeBlock; onDelete?: () => void };

// TimeBlockItem (UI spec §2.9). Un puntual muestra su fecha («Vie 2 oct») en vez de «Puntual».
export function TimeBlockItem({ block, onDelete }: Props) {
  const when =
    block.isRecurring && block.dayOfWeek ? dayShort(block.dayOfWeek) : block.date ? formatDateLabel(block.date) : 'Puntual';
  const isPunctual = !block.isRecurring || block.type === 'PUNTUAL';

  return (
    <View style={styles.item}>
      <View style={[styles.accent, { backgroundColor: categoryColorFor(block.id) }]} />
      <View style={styles.texts}>
        <Text style={[typography.titleMedium, { color: colors.onSurface }]}>{block.label}</Text>
        <Text style={[typography.bodySmall, styles.subtitle]}>{`${when} · ${block.startTime} - ${block.endTime}`}</Text>
      </View>
      {isPunctual ? <Badge text="Puntual" containerColor={colors.secondaryContainer} contentColor={colors.onSecondaryContainer} /> : null}
      {block.type === 'LIBRE' ? <Badge text="Libre" containerColor={colors.successContainer} contentColor={colors.onSuccessContainer} /> : null}
      {onDelete ? (
        <Pressable accessibilityRole="button" accessibilityLabel={`Eliminar ${block.label}`} onPress={onDelete} style={styles.delete}>
          <MaterialIcons name="delete-outline" size={22} color={colors.error} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    backgroundColor: colors.surfaceContainerLowest,
  },
  accent: { width: 4, height: 40, borderRadius: radius.sm },
  texts: { flex: 1 },
  subtitle: { color: colors.onSurfaceVariant, marginTop: 2 },
  delete: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
});
```

`mobile/src/components/index.ts` — añadir:
```ts
export { ChoiceChip } from './ChoiceChip';
export { DaySelector } from './DaySelector';
export { TimeBlockItem } from './TimeBlockItem';
```

- [ ] **Step 5: Navegación** — `mobile/src/navigation/types.ts` (reemplazar completo):
```ts
import type { DrawerScreenProps } from '@react-navigation/drawer';
import type { CompositeScreenProps, NavigatorScreenParams } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

export type AuthStackParamList = { Login: undefined; Register: undefined };

export type DrawerParamList = {
  Dashboard: undefined;
  Schedule: undefined;
  Groups: undefined;
  Profile: undefined;
};

// Pantallas que se apilan sobre el drawer (sin menú, con cabecera nativa y botón atrás).
export type AppStackParamList = {
  Main: NavigatorScreenParams<DrawerParamList>;
  AddSchedule: { initialDay?: number } | undefined;
};

export type AppStackScreen<K extends keyof AppStackParamList> = NativeStackScreenProps<AppStackParamList, K>;

// Pantallas del drawer que también abren pantallas apiladas (p. ej. Horario → Nuevo bloque).
export type DrawerScreen<K extends keyof DrawerParamList> = CompositeScreenProps<
  DrawerScreenProps<DrawerParamList, K>,
  NativeStackScreenProps<AppStackParamList>
>;

declare global {
  namespace ReactNavigation {
    interface RootParamList extends AppStackParamList, AuthStackParamList {}
  }
}
```

`mobile/src/navigation/RootNavigator.tsx` — añadir `import { AddScheduleScreen } from '../screens/schedule/AddScheduleScreen';` y reemplazar el stack de la sesión iniciada por:
```tsx
  return (
    <AppStack.Navigator
      screenOptions={{
        contentStyle: { backgroundColor: colors.surface },
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.onSurface,
        headerShadowVisible: false,
      }}
    >
      <AppStack.Screen name="Main" component={AppDrawer} options={{ headerShown: false }} />
      <AppStack.Screen name="AddSchedule" component={AddScheduleScreen} options={{ title: 'Nuevo bloque' }} />
    </AppStack.Navigator>
  );
```

`mobile/src/navigation/AppDrawer.tsx` — importar `import { MyScheduleScreen } from '../screens/schedule/MyScheduleScreen';` y reemplazar la pantalla `Schedule` por:
```tsx
      <Drawer.Screen name="Schedule" component={MyScheduleScreen} options={{ title: 'Horario', drawerIcon: icon('calendar-month') }} />
```

- [ ] **Step 6: Implementar «Mi horario»** — `mobile/src/screens/schedule/MyScheduleScreen.tsx` (UI spec §2.9 con las correcciones de los quirks 10, 15 y 18):
```tsx
import type { TimeBlock } from '@hueckoapp/shared';
import { useState } from 'react';
import { ActivityIndicator, Alert, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { errorMessage } from '../../api/client';
import { DaySelector, EmptyState, ErrorBanner, PrimaryButton, SecondaryButton, TimeBlockItem } from '../../components';
import { useRefreshOnFocus } from '../../hooks/useRefreshOnFocus';
import { useSchedule } from '../../hooks/useSchedule';
import type { DrawerScreen } from '../../navigation/types';
import { colors, typography } from '../../theme';
import { today } from '../../utils/clock';
import { blocksForDay, dayShort, isoDayOf } from '../../utils/days';
import { showToast } from '../../utils/toast';

export function MyScheduleScreen({ navigation }: DrawerScreen<'Schedule'>) {
  const { blocks, loading, refreshing, error, reload, removeBlock } = useSchedule();
  useRefreshOnFocus(reload);
  const now = today();
  // Arranca en el día de hoy, no en lunes (UI spec §6, quirk 18).
  const [selectedDay, setSelectedDay] = useState(() => isoDayOf(today()));
  const dayBlocks = blocksForDay(blocks, selectedDay, now);

  const addBlock = () => navigation.navigate('AddSchedule', { initialDay: selectedDay });

  const deleteBlock = async (block: TimeBlock) => {
    try {
      await removeBlock(block.id);
      showToast('Bloque eliminado.');
    } catch (e) {
      showToast(errorMessage(e));
    }
  };

  // En Kotlin se borraba sin preguntar (quirk 15).
  const confirmDelete = (block: TimeBlock) =>
    Alert.alert('Eliminar bloque', `¿Seguro que quieres eliminar «${block.label}» de tu horario?`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Eliminar', style: 'destructive', onPress: () => void deleteBlock(block) },
    ]);

  const captionFor = (iso: number) => {
    const count = blocksForDay(blocks, iso, now).length;
    return count === 0 ? 'libre' : String(count);
  };

  const renderContent = () => {
    if (loading) return <ActivityIndicator color={colors.primary} style={styles.spinner} />;
    if (error && blocks.length === 0) {
      return (
        <View style={styles.errorBox}>
          <ErrorBanner message={error} />
          <SecondaryButton title="Reintentar" icon="refresh" onPress={() => void reload()} />
        </View>
      );
    }
    if (blocks.length === 0) {
      return (
        <EmptyState
          title="Aún no tienes horarios registrados"
          description="Añade tus clases, trabajo o actividades para que tus grupos encuentren los mejores huecos."
          icon="calendar-today"
          actionLabel="Añadir mi primer bloque"
          onAction={addBlock}
        />
      );
    }
    return (
      <>
        <DaySelector selected={selectedDay} onSelect={setSelectedDay} captionFor={captionFor} />
        {dayBlocks.length === 0 ? (
          <EmptyState
            title={`Sin bloques el ${dayShort(selectedDay)}`}
            description="Todo el día cuenta como libre para tus grupos."
            icon="event-available"
            actionLabel="Añadir un bloque"
            onAction={addBlock}
          />
        ) : (
          dayBlocks.map((block) => <TimeBlockItem key={block.id} block={block} onDelete={() => confirmDelete(block)} />)
        )}
      </>
    );
  };

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void reload()} colors={[colors.primary]} />}
    >
      <View>
        <Text style={[typography.headlineLarge, { color: colors.onSurface }]}>Mi horario</Text>
        <Text style={[typography.bodyMedium, styles.subtitle]}>
          Registra tus clases y turnos. Lo que no esté aquí cuenta como hueco libre para tus grupos.
        </Text>
        <View style={styles.actions}>
          <SecondaryButton title="Escanear" icon="document-scanner" style={styles.flex} onPress={() => showToast('Disponible en la Fase 4')} />
          <PrimaryButton title="Añadir bloque" icon="add" style={styles.flex} onPress={addBlock} />
        </View>
      </View>
      {renderContent()}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: { flex: 1, backgroundColor: colors.surface },
  content: { paddingHorizontal: 16, paddingVertical: 20, gap: 20 },
  subtitle: { color: colors.onSurfaceVariant, marginTop: 6 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  spinner: { marginTop: 32 },
  errorBox: { gap: 12 },
});
```

- [ ] **Step 7: Implementar «Nuevo bloque»** — `mobile/src/screens/schedule/AddScheduleScreen.tsx` (UI spec §2.10; G12 selector de tipo; quirk 11: el formulario vive en la pantalla, así que cada visita empieza con los valores por defecto y tras guardar se vuelve atrás). Cambios deliberados respecto a Kotlin: el título lo pone la cabecera nativa («Nuevo bloque»); la elección recurrente/puntual se etiqueta «Repetición» y «Tipo de bloque» pasa a ser el selector de `BlockType`; un puntual elige su fecha entre los próximos 14 días.
```tsx
import type { BlockType } from '@hueckoapp/shared';
import { useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View, type TextInput } from 'react-native';

import { createTimeBlock } from '../../api/schedule';
import { ChoiceChip, ErrorBanner, PrimaryButton, TextField } from '../../components';
import { useAction } from '../../hooks/useAction';
import type { AppStackScreen } from '../../navigation/types';
import { colors, typography } from '../../theme';
import { today } from '../../utils/clock';
import { dayLong, dayShort, formatDateLabel, upcomingDates, WEEK_DAYS } from '../../utils/days';
import { endTimeHint, isValidRange, startTimeHint } from '../../utils/time';
import { showToast } from '../../utils/toast';

const BLOCK_TYPES: { value: BlockType; label: string }[] = [
  { value: 'CLASE', label: 'Clase' },
  { value: 'TRABAJO', label: 'Trabajo' },
  { value: 'LIBRE', label: 'Libre' },
  { value: 'PUNTUAL', label: 'Puntual' },
];
const PUNCTUAL_DAYS_AHEAD = 14;

function FieldLabel({ children }: { children: string }) {
  return <Text style={[typography.labelMedium, { color: colors.onSurfaceVariant }]}>{children}</Text>;
}

export function AddScheduleScreen({ navigation, route }: AppStackScreen<'AddSchedule'>) {
  const [now] = useState(today);
  const dates = useMemo(() => upcomingDates(now, PUNCTUAL_DAYS_AHEAD), [now]);
  const [label, setLabel] = useState('');
  const [isRecurring, setIsRecurring] = useState(true);
  const [dayOfWeek, setDayOfWeek] = useState(route.params?.initialDay ?? 1);
  const [date, setDate] = useState(dates[0]);
  const [type, setType] = useState<BlockType>('CLASE');
  const [startTime, setStartTime] = useState('08:00');
  const [endTime, setEndTime] = useState('09:00');
  const endRef = useRef<TextInput>(null);
  const save = useAction(createTimeBlock);

  const startHint = startTimeHint(startTime);
  const endHint = endTimeHint(startTime, endTime);
  // El nombre vacío solo deshabilita el botón, sin mensaje (como en Kotlin).
  const formValid = label.trim().length > 0 && isValidRange(startTime, endTime);

  // G12: por defecto CLASE si es recurrente y PUNTUAL si es de una sola vez.
  const chooseRecurring = (value: boolean) => {
    setIsRecurring(value);
    setType(value ? 'CLASE' : 'PUNTUAL');
  };

  const submit = async () => {
    if (!formValid) return;
    const result = await save.run({
      label: label.trim(),
      type,
      startTime,
      endTime,
      isRecurring,
      dayOfWeek: isRecurring ? dayOfWeek : null,
      date: isRecurring ? null : date,
    });
    if (result.ok) {
      showToast('Bloque guardado.');
      navigation.goBack();
    }
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <TextField
          label="Nombre del bloque"
          value={label}
          onChangeText={setLabel}
          placeholder="Clase de Cálculo"
          maxLength={80}
          autoCapitalize="sentences"
          returnKeyType="next"
        />

        <View style={styles.section}>
          <FieldLabel>Repetición</FieldLabel>
          <View style={styles.row}>
            <ChoiceChip label="Recurrente" selected={isRecurring} onPress={() => chooseRecurring(true)} style={styles.flex} />
            <ChoiceChip label="Puntual (Única vez)" selected={!isRecurring} onPress={() => chooseRecurring(false)} style={styles.flex} />
          </View>
        </View>

        {isRecurring ? (
          <View style={styles.section}>
            <FieldLabel>Día de la semana</FieldLabel>
            <View style={styles.wrap}>
              {WEEK_DAYS.map((iso) => (
                <ChoiceChip
                  key={iso}
                  variant="title"
                  label={dayShort(iso)}
                  accessibilityLabel={dayLong(iso)}
                  selected={dayOfWeek === iso}
                  onPress={() => setDayOfWeek(iso)}
                  style={styles.dayChip}
                />
              ))}
            </View>
          </View>
        ) : (
          <View style={styles.section}>
            <FieldLabel>Fecha</FieldLabel>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
              {dates.map((key) => (
                <ChoiceChip key={key} label={formatDateLabel(key)} selected={date === key} onPress={() => setDate(key)} />
              ))}
            </ScrollView>
          </View>
        )}

        <View style={styles.section}>
          <FieldLabel>Tipo de bloque</FieldLabel>
          <View style={styles.wrap}>
            {BLOCK_TYPES.map((option) => (
              <ChoiceChip key={option.value} label={option.label} selected={type === option.value} onPress={() => setType(option.value)} />
            ))}
          </View>
          {type === 'LIBRE' ? (
            <Text style={[typography.bodySmall, { color: colors.onSurfaceVariant }]}>
              Un bloque libre no te marca como ocupado en los huecos de tus grupos.
            </Text>
          ) : null}
        </View>

        <View style={styles.section}>
          <FieldLabel>Horario</FieldLabel>
          <View style={styles.row}>
            <View style={styles.flex}>
              <TextField
                accessibilityLabel="Hora de inicio"
                value={startTime}
                onChangeText={setStartTime}
                placeholder="08:00"
                keyboardType="numbers-and-punctuation"
                maxLength={5}
                returnKeyType="next"
                onSubmitEditing={() => endRef.current?.focus()}
                error={startHint.error ? startHint.text : undefined}
                helperText={startHint.error ? undefined : startHint.text}
              />
            </View>
            <View style={styles.flex}>
              <TextField
                accessibilityLabel="Hora de fin"
                inputRef={endRef}
                value={endTime}
                onChangeText={setEndTime}
                placeholder="10:00"
                keyboardType="numbers-and-punctuation"
                maxLength={5}
                returnKeyType="done"
                onSubmitEditing={() => void submit()}
                error={endHint.error ? endHint.text : undefined}
                helperText={endHint.error ? undefined : endHint.text}
              />
            </View>
          </View>
        </View>

        {save.error ? <ErrorBanner message={save.error} /> : null}
        <PrimaryButton
          title="Guardar bloque"
          loadingTitle="Guardando…"
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
  row: { flexDirection: 'row', gap: 10 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  dayChip: { minWidth: 56 },
});
```

- [ ] **Step 8: Ejecutar y ver que pasa** — `npm test -w mobile` → PASS. `npm run typecheck -w mobile` → sin errores.

- [ ] **Step 9: Commit** — `git add mobile/src/utils mobile/src/components mobile/src/screens/schedule mobile/src/navigation` → `feat(mobile): mi horario (día de hoy, puntuales por fecha, borrar con confirmación) y nuevo bloque`

---

### Task 7: Mobile — grupos (lista, diálogos, detalle con pestañas) y cierre de la fase

**Files:**
- Create: `mobile/src/utils/groups.ts`, `mobile/src/components/AppDialog.tsx`, `mobile/src/screens/groups/GroupListScreen.tsx`, `mobile/src/screens/groups/GroupDialogs.tsx`, `mobile/src/screens/groups/GroupDetailScreen.tsx`, `mobile/src/screens/groups/InviteCodeCard.tsx`, `mobile/src/screens/groups/tabs/PlansTab.tsx`, `mobile/src/screens/groups/tabs/AvailabilityTab.tsx`, `mobile/src/screens/groups/tabs/MembersTab.tsx`
- Modify: `mobile/package.json` (expo-clipboard), `mobile/jest.setup.ts`, `mobile/src/components/index.ts`, `mobile/src/navigation/types.ts`, `mobile/src/navigation/RootNavigator.tsx`, `mobile/src/navigation/AppDrawer.tsx`, `README.md`
- Test: `mobile/src/utils/__tests__/groups.test.ts`, `mobile/src/screens/groups/__tests__/GroupListScreen.test.tsx`, `mobile/src/screens/groups/__tests__/MembersTab.test.tsx`, `mobile/src/screens/groups/__tests__/AvailabilityTab.test.tsx`, `mobile/src/screens/groups/__tests__/InviteCodeCard.test.tsx`

**Interfaces:**
- Consumes: `useGroups`, `useGroup`, `useAvailability`, `useAction`, `useRefreshOnFocus` (Task 5); `DrawerScreen`, `AppStackScreen` (Task 6); `useAuth()` (Fase 1: `user.id`); `dayLong` (Task 6); componentes de Fase 1 y Task 6.
- Produces:
  - `utils/groups.ts`: `memberCountLabel(n): string` («1 miembro» / «n miembros»), `type DayWindows = { dayOfWeek: number; windows: MatchWindow[] }`, `groupWindowsByDay(windows): DayWindows[]`.
  - `AppDialog({ title, children, confirmLabel, onConfirm, onDismiss, confirmDisabled?, loading? })`.
  - `CreateGroupDialog`/`JoinGroupDialog({ submit: (value: string) => Promise<Group>; onDone: (group: Group) => void; onDismiss: () => void })`.
  - `InviteCodeCard({ code })`, `PlansTab()`, `AvailabilityTab({ groupId, threshold, memberCount })`, `MembersTab({ group, currentUserId, onToggleEssential: (userId, value) => Promise<void>, onLeave: () => Promise<void> })`.
  - Navegación: `AppStackParamList.GroupDetail: { groupId: string; name: string }`; `GroupTabsParamList = { Plans: undefined; Availability: undefined; Members: undefined }`. Fase 3 reemplaza `PlansTab`.

- [ ] **Step 1: Instalar expo-clipboard y mockearlo** (dentro de `mobile/`):
```bash
cd mobile
npx expo install expo-clipboard
```
Comprobar que quedó en `dependencies`. Añadir al final de `mobile/jest.setup.ts`:
```ts
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => true) }));
```

- [ ] **Step 2: Escribir los tests que fallan**

`mobile/src/utils/__tests__/groups.test.ts`:
```ts
import { groupWindowsByDay, memberCountLabel } from '../groups';

it('memberCountLabel singulariza', () => {
  expect(memberCountLabel(1)).toBe('1 miembro');
  expect(memberCountLabel(3)).toBe('3 miembros');
});

it('groupWindowsByDay agrupa conservando el orden del servidor', () => {
  const w = (dayOfWeek: number, startTime: string) => ({ dayOfWeek, startTime, endTime: '20:00', availabilityPercentage: 100, freeMembers: 2 });
  expect(groupWindowsByDay([w(1, '12:00'), w(3, '08:00'), w(3, '19:00')])).toEqual([
    { dayOfWeek: 1, windows: [w(1, '12:00')] },
    { dayOfWeek: 3, windows: [w(3, '08:00'), w(3, '19:00')] },
  ]);
  expect(groupWindowsByDay([])).toEqual([]);
});
```

`mobile/src/screens/groups/__tests__/GroupListScreen.test.tsx`:
```tsx
import type { Group, GroupSummary } from '@hueckoapp/shared';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { ApiError } from '../../../api/client';
import * as groupsApi from '../../../api/groups';
import { showToast } from '../../../utils/toast';
import { GroupListScreen } from '../GroupListScreen';

jest.mock('../../../api/groups');
jest.mock('../../../utils/toast', () => ({ showToast: jest.fn() }));
jest.mock('../../../hooks/useRefreshOnFocus', () => ({ useRefreshOnFocus: jest.fn() }));

const mocked = groupsApi as jest.Mocked<typeof groupsApi>;
const navigation = { navigate: jest.fn() } as any;
const summary: GroupSummary = { id: 'g1', name: 'Proyecto Integrador', description: '', memberCount: 1, availabilityThreshold: 80 };
const group = (over: Partial<Group>): Group => ({ ...summary, inviteCode: 'PROY2026', members: [], ...over });
const renderScreen = () => render(<GroupListScreen navigation={navigation} route={{} as any} />);

beforeEach(() => jest.clearAllMocks());

it('sin grupos muestra el estado vacío', async () => {
  mocked.listGroups.mockResolvedValue([]);
  await renderScreen();
  expect(await screen.findByText('Aún no tienes ningún grupo')).toBeTruthy();
  expect(screen.getByText('Crea uno para invitar a tus compañeros, o únete con el código que te hayan pasado.')).toBeTruthy();
});

it('muestra una tarjeta por grupo y abre su detalle', async () => {
  mocked.listGroups.mockResolvedValue([
    summary,
    { id: 'g2', name: 'Amigos', description: 'Los de siempre', memberCount: 3, availabilityThreshold: 80 },
  ]);
  await renderScreen();
  expect(await screen.findByText('Proyecto Integrador')).toBeTruthy();
  expect(screen.getByText('1 miembro')).toBeTruthy();
  expect(screen.getByText('3 miembros')).toBeTruthy();
  expect(screen.getByText('Los de siempre')).toBeTruthy();
  await fireEvent.press(screen.getByText('Amigos'));
  expect(navigation.navigate).toHaveBeenCalledWith('GroupDetail', { groupId: 'g2', name: 'Amigos' });
});

it('crea un grupo desde el diálogo y lo añade a la lista', async () => {
  mocked.listGroups.mockResolvedValue([]);
  mocked.createGroup.mockResolvedValue(group({ id: 'g9', name: 'Estudio' }));
  await renderScreen();
  await fireEvent.press(await screen.findByText('Crear grupo'));
  expect(screen.getByText('Crear Nuevo Grupo')).toBeTruthy();

  await fireEvent.press(screen.getByText('Crear')); // deshabilitado con el nombre vacío
  expect(mocked.createGroup).not.toHaveBeenCalled();

  await fireEvent.changeText(screen.getByLabelText('Nombre del grupo'), '  Estudio ');
  await fireEvent.press(screen.getByText('Crear'));
  await waitFor(() => expect(screen.queryByText('Crear Nuevo Grupo')).toBeNull());
  expect(mocked.createGroup).toHaveBeenCalledWith({ name: 'Estudio' });
  expect(screen.getByText('Estudio')).toBeTruthy();
  expect(showToast).toHaveBeenCalledWith('Grupo «Estudio» creado.');
});

it('unirse: fuerza mayúsculas, muestra el error y lo olvida al cerrar el diálogo', async () => {
  mocked.listGroups.mockResolvedValue([]);
  mocked.joinGroup.mockRejectedValueOnce(new ApiError(404, 'INVALID_INVITE_CODE', 'Código de invitación inválido.'));
  await renderScreen();
  await fireEvent.press(await screen.findByText('Unirme'));
  expect(screen.getByText('Unirse a un Grupo')).toBeTruthy();

  await fireEvent.changeText(screen.getByLabelText('Código de Invitación'), 'proy2026');
  expect(screen.getByLabelText('Código de Invitación').props.value).toBe('PROY2026');
  await fireEvent.press(screen.getByText('Unirse'));
  expect(await screen.findByText('Código de invitación inválido.')).toBeTruthy();
  expect(mocked.joinGroup).toHaveBeenCalledWith('PROY2026');

  await fireEvent.press(screen.getByText('Cancelar'));
  await fireEvent.press(screen.getByText('Unirme'));
  expect(screen.queryByText('Código de invitación inválido.')).toBeNull();
  expect(screen.getByLabelText('Código de Invitación').props.value).toBe('');
});

it('unirse con éxito añade el grupo y avisa', async () => {
  mocked.listGroups.mockResolvedValue([]);
  mocked.joinGroup.mockResolvedValue(group({ id: 'g2', name: 'Amigos de la Uni', memberCount: 2 }));
  await renderScreen();
  await fireEvent.press(await screen.findByText('Unirme'));
  await fireEvent.changeText(screen.getByLabelText('Código de Invitación'), 'HUECKO123');
  await fireEvent.press(screen.getByText('Unirse'));
  expect(await screen.findByText('Amigos de la Uni')).toBeTruthy();
  expect(showToast).toHaveBeenCalledWith('Te uniste a «Amigos de la Uni».');
});
```

`mobile/src/screens/groups/__tests__/MembersTab.test.tsx`:
```tsx
import type { Group, GroupMember } from '@hueckoapp/shared';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Alert } from 'react-native';

import { MembersTab } from '../tabs/MembersTab';

jest.mock('../../../utils/toast', () => ({ showToast: jest.fn() }));

const owner: GroupMember = { id: 'u1', name: 'Usuario de Prueba', email: 'test@test.com', role: 'OWNER', isEssential: false };
const ana: GroupMember = { id: 'u2', name: 'Ana', email: 'ana@test.com', role: 'MEMBER', isEssential: true };
const group: Group = {
  id: 'g1', name: 'Proyecto Integrador', description: '', memberCount: 2, availabilityThreshold: 80,
  inviteCode: 'PROY2026', members: [owner, ana],
};

it('lista a todos con sus insignias; un MEMBER no ve los interruptores', async () => {
  await render(<MembersTab group={group} currentUserId="u2" onToggleEssential={jest.fn()} onLeave={jest.fn()} />);
  expect(screen.getByText('Usuario de Prueba')).toBeTruthy();
  expect(screen.getByText('Ana (tú)')).toBeTruthy();
  expect(screen.getByText('Administrador')).toBeTruthy();
  expect(screen.getByText('Imprescindible')).toBeTruthy();
  expect(screen.queryByLabelText('Imprescindible: Ana')).toBeNull();
});

it('con más de 8 miembros se ven todos (resuelve el TODO «Ver todos los integrantes»)', async () => {
  const members: GroupMember[] = Array.from({ length: 10 }, (_, i) => ({
    id: `u${i}`, name: `Persona ${i}`, email: `p${i}@test.com`, role: i === 0 ? 'OWNER' : 'MEMBER', isEssential: false,
  }));
  await render(
    <MembersTab group={{ ...group, members, memberCount: 10 }} currentUserId="u0" onToggleEssential={jest.fn()} onLeave={jest.fn()} />,
  );
  expect(screen.getByText('Persona 9')).toBeTruthy();
});

it('el OWNER marca y desmarca imprescindibles', async () => {
  const onToggle = jest.fn().mockResolvedValue(undefined);
  await render(<MembersTab group={group} currentUserId="u1" onToggleEssential={onToggle} onLeave={jest.fn()} />);
  await fireEvent(screen.getByLabelText('Imprescindible: Ana'), 'valueChange', false);
  expect(onToggle).toHaveBeenCalledWith('u2', false);
});

it('salir del grupo pide confirmación y solo sale al confirmar', async () => {
  const onLeave = jest.fn().mockResolvedValue(undefined);
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  await render(<MembersTab group={group} currentUserId="u2" onToggleEssential={jest.fn()} onLeave={onLeave} />);

  await fireEvent.press(screen.getByText('Salir del grupo'));
  expect(alert).toHaveBeenCalledWith(
    'Salir del grupo',
    '¿Seguro que quieres salir de «Proyecto Integrador»? Tu horario dejará de contar en sus huecos.',
    expect.any(Array),
  );
  expect(onLeave).not.toHaveBeenCalled();

  const buttons = alert.mock.calls[0][2]!;
  await act(async () => buttons.find((b) => b.text === 'Salir')!.onPress!());
  expect(onLeave).toHaveBeenCalledTimes(1);
});
```

`mobile/src/screens/groups/__tests__/AvailabilityTab.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react-native';

import * as groupsApi from '../../../api/groups';
import { AvailabilityTab } from '../tabs/AvailabilityTab';

jest.mock('../../../api/groups');
const mocked = groupsApi as jest.Mocked<typeof groupsApi>;

beforeEach(() => jest.clearAllMocks());

it('muestra las franjas agrupadas por día con su % y los libres', async () => {
  mocked.getAvailability.mockResolvedValue([
    { dayOfWeek: 1, startTime: '12:00', endTime: '20:00', availabilityPercentage: 100, freeMembers: 2 },
    { dayOfWeek: 3, startTime: '08:00', endTime: '14:00', availabilityPercentage: 100, freeMembers: 2 },
    { dayOfWeek: 3, startTime: '19:00', endTime: '20:00', availabilityPercentage: 50, freeMembers: 1 },
  ]);
  await render(<AvailabilityTab groupId="g1" threshold={50} memberCount={2} />);
  expect(await screen.findByText('Lunes')).toBeTruthy();
  expect(screen.getByText('Miércoles')).toBeTruthy();
  expect(screen.queryByText('Martes')).toBeNull();
  expect(screen.getByText('08:00 - 14:00')).toBeTruthy();
  expect(screen.getByText('50%')).toBeTruthy();
  expect(screen.getByText('1 de 2 libres')).toBeTruthy();
  expect(mocked.getAvailability).toHaveBeenCalledWith('g1');
});

it('sin franjas explica el umbral', async () => {
  mocked.getAvailability.mockResolvedValue([]);
  await render(<AvailabilityTab groupId="g1" threshold={80} memberCount={2} />);
  expect(await screen.findByText('Sin huecos en común')).toBeTruthy();
  expect(screen.getByText('Ninguna franja alcanza el 80% de disponibilidad que pide el grupo.')).toBeTruthy();
});
```

`mobile/src/screens/groups/__tests__/InviteCodeCard.test.tsx`:
```tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as Clipboard from 'expo-clipboard';

import { showToast } from '../../../utils/toast';
import { InviteCodeCard } from '../InviteCodeCard';

jest.mock('../../../utils/toast', () => ({ showToast: jest.fn() }));

it('muestra el código, lo copia y avisa (resuelve UI spec §6 punto 3)', async () => {
  await render(<InviteCodeCard code="PROY2026" />);
  expect(screen.getByText('PROY2026')).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('Copiar código de invitación'));
  await waitFor(() => expect(showToast).toHaveBeenCalledWith('Código PROY2026 copiado.'));
  expect(Clipboard.setStringAsync).toHaveBeenCalledWith('PROY2026');
});
```

- [ ] **Step 3: Ejecutar y ver que falla** — `npm test -w mobile -- groups` → FAIL.

- [ ] **Step 4: Implementar utilidades y el diálogo base**

`mobile/src/utils/groups.ts`:
```ts
import type { MatchWindow } from '@hueckoapp/shared';

// GroupList/GroupDetail singularizan (UI spec §2.4, §2.6).
export const memberCountLabel = (n: number) => (n === 1 ? '1 miembro' : `${n} miembros`);

export type DayWindows = { dayOfWeek: number; windows: MatchWindow[] };

/** Agrupa las franjas por día conservando el orden del servidor (día y hora). */
export function groupWindowsByDay(windows: readonly MatchWindow[]): DayWindows[] {
  const days: DayWindows[] = [];
  for (const window of windows) {
    const last = days.at(-1);
    if (last && last.dayOfWeek === window.dayOfWeek) last.windows.push(window);
    else days.push({ dayOfWeek: window.dayOfWeek, windows: [window] });
  }
  return days;
}
```

`mobile/src/components/AppDialog.tsx` (AlertDialog M3 de UI spec §2.5: radio 28, fondo `surfaceContainerHigh`, «Cancelar» a la izquierda del botón de confirmar):
```tsx
import type { ReactNode } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, typography } from '../theme';

type Props = {
  title: string;
  children: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  onDismiss: () => void;
  confirmDisabled?: boolean;
  loading?: boolean;
};

const DISABLED_BG = 'rgba(29,27,32,0.12)';
const DISABLED_FG = 'rgba(29,27,32,0.38)';

// Mientras carga no se puede cerrar (ni tocando fuera ni con Atrás), igual que en Kotlin.
export function AppDialog({ title, children, confirmLabel, onConfirm, onDismiss, confirmDisabled = false, loading = false }: Props) {
  const dismiss = () => {
    if (!loading) onDismiss();
  };
  const blocked = confirmDisabled || loading;

  return (
    <Modal transparent visible animationType="fade" onRequestClose={dismiss}>
      <KeyboardAvoidingView style={styles.backdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable accessibilityLabel="Cerrar diálogo" style={StyleSheet.absoluteFill} onPress={dismiss} />
        <View style={styles.card} accessibilityViewIsModal>
          <Text style={[typography.headlineSmall, { color: colors.onSurface }]}>{title}</Text>
          <View style={styles.body}>{children}</View>
          <View style={styles.actions}>
            <Pressable accessibilityRole="button" disabled={loading} onPress={dismiss} style={styles.textButton}>
              <Text style={[typography.labelLarge, { color: loading ? DISABLED_FG : colors.primary }]}>Cancelar</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={confirmLabel}
              accessibilityState={{ disabled: blocked, busy: loading }}
              disabled={blocked}
              onPress={onConfirm}
              style={[styles.confirm, { backgroundColor: confirmDisabled ? DISABLED_BG : colors.primary }]}
            >
              {loading ? (
                <ActivityIndicator size={16} color={colors.onPrimary} />
              ) : (
                <Text style={[typography.labelLarge, { color: confirmDisabled ? DISABLED_FG : colors.onPrimary }]}>{confirmLabel}</Text>
              )}
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: 'rgba(29,27,32,0.32)' },
  card: { borderRadius: 28, backgroundColor: colors.surfaceContainerHigh, padding: 24 },
  body: { marginTop: 16 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 8, marginTop: 24 },
  textButton: { height: 40, paddingHorizontal: 12, justifyContent: 'center' },
  confirm: { height: 40, minWidth: 88, paddingHorizontal: 24, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
});
```
Añadir a `mobile/src/components/index.ts`: `export { AppDialog } from './AppDialog';`

- [ ] **Step 5: Implementar la lista de grupos y sus diálogos**

`mobile/src/screens/groups/GroupDialogs.tsx` (UI spec §2.5; quirk 22: el diálogo solo se monta mientras está abierto, así que al cerrarlo se olvidan el texto y el error):
```tsx
import type { Group } from '@hueckoapp/shared';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { AppDialog, TextField } from '../../components';
import { useAction } from '../../hooks/useAction';
import { colors, typography } from '../../theme';

type DialogProps = {
  submit: (value: string) => Promise<Group>;
  onDone: (group: Group) => void;
  onDismiss: () => void;
};

export function CreateGroupDialog({ submit, onDone, onDismiss }: DialogProps) {
  const [name, setName] = useState('');
  const action = useAction(submit);

  const confirm = async () => {
    if (!name.trim()) return;
    const result = await action.run(name);
    if (result.ok) onDone(result.value);
  };

  return (
    <AppDialog
      title="Crear Nuevo Grupo"
      confirmLabel="Crear"
      onConfirm={() => void confirm()}
      onDismiss={onDismiss}
      confirmDisabled={!name.trim()}
      loading={action.loading}
    >
      <TextField
        label="Nombre del grupo"
        value={name}
        onChangeText={(text) => {
          setName(text);
          action.clearError();
        }}
        maxLength={60}
        autoCapitalize="sentences"
        returnKeyType="done"
        onSubmitEditing={() => void confirm()}
        error={action.error ?? undefined}
      />
    </AppDialog>
  );
}

export function JoinGroupDialog({ submit, onDone, onDismiss }: DialogProps) {
  const [code, setCode] = useState('');
  const action = useAction(submit);

  const confirm = async () => {
    if (!code.trim()) return;
    const result = await action.run(code);
    if (result.ok) onDone(result.value);
  };

  return (
    <AppDialog
      title="Unirse a un Grupo"
      confirmLabel="Unirse"
      onConfirm={() => void confirm()}
      onDismiss={onDismiss}
      confirmDisabled={!code.trim()}
      loading={action.loading}
    >
      <Text style={[typography.bodyMedium, { color: colors.onSurfaceVariant }]}>
        Ingresa el código de invitación que te compartió el administrador del grupo.
      </Text>
      <View style={{ height: 16 }} />
      <TextField
        label="Código de Invitación"
        value={code}
        onChangeText={(text) => {
          // Se fuerza a mayúsculas en cada pulsación (UI spec §2.5).
          setCode(text.toUpperCase());
          action.clearError();
        }}
        autoCapitalize="characters"
        maxLength={32}
        returnKeyType="done"
        onSubmitEditing={() => void confirm()}
        error={action.error ?? undefined}
      />
    </AppDialog>
  );
}
```

`mobile/src/screens/groups/GroupListScreen.tsx` (UI spec §2.4 con la copia corregida de §7):
```tsx
import type { Group, GroupSummary } from '@hueckoapp/shared';
import { useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { EmptyState, ErrorBanner, HueckoCard, PrimaryButton, SecondaryButton } from '../../components';
import { useGroups } from '../../hooks/useGroups';
import { useRefreshOnFocus } from '../../hooks/useRefreshOnFocus';
import type { DrawerScreen } from '../../navigation/types';
import { categoryColorFor, colors, typography } from '../../theme';
import { memberCountLabel } from '../../utils/groups';
import { showToast } from '../../utils/toast';
import { CreateGroupDialog, JoinGroupDialog } from './GroupDialogs';

type OpenDialog = 'create' | 'join' | null;

function GroupCard({ group, onPress }: { group: GroupSummary; onPress: () => void }) {
  return (
    <HueckoCard onPress={onPress} padding={0}>
      <View style={[styles.banner, { backgroundColor: categoryColorFor(group.name) }]}>
        <Text style={[typography.displaySmall, styles.initial]}>{group.name.trim().charAt(0).toUpperCase()}</Text>
      </View>
      <View style={styles.cardBody}>
        <Text style={[typography.titleMedium, { color: colors.onSurface }]}>{group.name}</Text>
        {group.description ? (
          <Text numberOfLines={2} style={[typography.bodySmall, styles.description]}>
            {group.description}
          </Text>
        ) : null}
        <Text style={[typography.labelSmall, styles.count]}>{memberCountLabel(group.memberCount)}</Text>
      </View>
    </HueckoCard>
  );
}

export function GroupListScreen({ navigation }: DrawerScreen<'Groups'>) {
  const { groups, loading, refreshing, error, reload, create, join } = useGroups();
  useRefreshOnFocus(reload);
  const [dialog, setDialog] = useState<OpenDialog>(null);
  const close = () => setDialog(null);

  const onCreated = (group: Group) => {
    close();
    showToast(`Grupo «${group.name}» creado.`);
  };
  const onJoined = (group: Group) => {
    close();
    showToast(`Te uniste a «${group.name}».`);
  };

  const renderContent = () => {
    if (loading) return <ActivityIndicator color={colors.primary} style={styles.spinner} />;
    if (error && groups.length === 0) {
      return (
        <View style={styles.errorBox}>
          <ErrorBanner message={error} />
          <SecondaryButton title="Reintentar" icon="refresh" onPress={() => void reload()} />
        </View>
      );
    }
    if (groups.length === 0) {
      return (
        <EmptyState
          title="Aún no tienes ningún grupo"
          description="Crea uno para invitar a tus compañeros, o únete con el código que te hayan pasado."
          icon="groups"
          actionLabel="Crear mi primer grupo"
          onAction={() => setDialog('create')}
        />
      );
    }
    return groups.map((group) => (
      <GroupCard
        key={group.id}
        group={group}
        onPress={() => navigation.navigate('GroupDetail', { groupId: group.id, name: group.name })}
      />
    ));
  };

  return (
    <>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void reload()} colors={[colors.primary]} />}
      >
        <View>
          <Text style={[typography.headlineLarge, { color: colors.onSurface }]}>Mis grupos</Text>
          <Text style={[typography.bodyMedium, styles.subtitle]}>
            Consulta a quién tienes en cada grupo y en qué franjas coincidís todos.
          </Text>
          <View style={styles.actions}>
            <SecondaryButton title="Unirme" icon="vpn-key" style={styles.flex} onPress={() => setDialog('join')} />
            <PrimaryButton title="Crear grupo" icon="group-add" style={styles.flex} onPress={() => setDialog('create')} />
          </View>
        </View>
        {renderContent()}
      </ScrollView>
      {dialog === 'create' ? <CreateGroupDialog submit={create} onDone={onCreated} onDismiss={close} /> : null}
      {dialog === 'join' ? <JoinGroupDialog submit={join} onDone={onJoined} onDismiss={close} /> : null}
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: { flex: 1, backgroundColor: colors.surface },
  content: { paddingHorizontal: 16, paddingVertical: 20, gap: 12 },
  subtitle: { color: colors.onSurfaceVariant, marginTop: 6 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 16, marginBottom: 8 },
  spinner: { marginTop: 32 },
  errorBox: { gap: 12 },
  banner: { height: 100, alignItems: 'center', justifyContent: 'center' },
  initial: { color: '#FFFFFF' },
  cardBody: { paddingHorizontal: 16, paddingVertical: 12 },
  description: { color: colors.onSurfaceVariant, marginTop: 4 },
  count: { color: colors.onSurfaceVariant, marginTop: 8 },
});
```

- [ ] **Step 6: Implementar el detalle y sus pestañas**

`mobile/src/screens/groups/InviteCodeCard.tsx` (resuelve UI spec §6 punto 3: el código no se veía en ninguna parte):
```tsx
import { MaterialIcons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radius, typography } from '../../theme';
import { showToast } from '../../utils/toast';

export function InviteCodeCard({ code }: { code: string }) {
  const copy = async () => {
    await Clipboard.setStringAsync(code);
    showToast(`Código ${code} copiado.`);
  };

  return (
    <View style={styles.card}>
      <View style={styles.texts}>
        <Text style={[typography.labelMedium, { color: colors.onSurfaceVariant }]}>Código de invitación</Text>
        <Text selectable style={[typography.titleLarge, styles.code]}>{code}</Text>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel="Copiar código de invitación" onPress={() => void copy()} style={styles.copy}>
        <MaterialIcons name="content-copy" size={18} color={colors.primary} />
        <Text style={[typography.labelLarge, { color: colors.primary }]}>Copiar</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: radius.xxl,
    backgroundColor: colors.surfaceContainer,
  },
  texts: { flex: 1 },
  code: { color: colors.onSurface, letterSpacing: 2 },
  copy: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 48, paddingHorizontal: 8 },
});
```

`mobile/src/screens/groups/tabs/PlansTab.tsx`:
```tsx
import { View } from 'react-native';

import { EmptyState } from '../../../components';
import { colors } from '../../../theme';

// Se reemplaza en la Fase 3 (propuestas y votación).
export function PlansTab() {
  return (
    <View style={{ flex: 1, justifyContent: 'center', backgroundColor: colors.surface }}>
      <EmptyState
        title="Todavía no hay planes"
        description="Las propuestas de planes y las votaciones llegan en la Fase 3."
        icon="event-note"
      />
    </View>
  );
}
```

`mobile/src/screens/groups/tabs/AvailabilityTab.tsx`:
```tsx
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Badge, EmptyState, ErrorBanner, HueckoCard, SecondaryButton } from '../../../components';
import { useAvailability } from '../../../hooks/useAvailability';
import { colors, typography } from '../../../theme';
import { dayLong } from '../../../utils/days';
import { groupWindowsByDay } from '../../../utils/groups';

type Props = { groupId: string; threshold: number; memberCount: number };

// «Huecos»: franjas en común calculadas por el servidor (GET /groups/:id/availability).
export function AvailabilityTab({ groupId, threshold, memberCount }: Props) {
  const { windows, loading, refreshing, error, reload } = useAvailability(groupId);
  const days = groupWindowsByDay(windows);

  const renderContent = () => {
    if (loading) return <ActivityIndicator color={colors.primary} style={styles.spinner} />;
    if (error) {
      return (
        <View style={styles.errorBox}>
          <ErrorBanner message={error} />
          <SecondaryButton title="Reintentar" icon="refresh" onPress={() => void reload()} />
        </View>
      );
    }
    if (days.length === 0) {
      return (
        <EmptyState
          title="Sin huecos en común"
          description={`Ninguna franja alcanza el ${threshold}% de disponibilidad que pide el grupo.`}
          icon="event-busy"
        />
      );
    }
    return days.map((day) => (
      <View key={day.dayOfWeek} style={styles.day}>
        <Text style={[typography.titleMedium, { color: colors.onSurface }]}>{dayLong(day.dayOfWeek)}</Text>
        {day.windows.map((w) => (
          <HueckoCard key={`${w.dayOfWeek}-${w.startTime}`} padding={14}>
            <View style={styles.row}>
              <View style={styles.flex}>
                <Text style={[typography.titleMedium, { color: colors.onSurface }]}>{`${w.startTime} - ${w.endTime}`}</Text>
                <Text style={[typography.bodySmall, { color: colors.onSurfaceVariant }]}>{`${w.freeMembers} de ${memberCount} libres`}</Text>
              </View>
              <Badge text={`${w.availabilityPercentage}%`} containerColor={colors.primaryContainer} contentColor={colors.onPrimaryContainer} />
            </View>
          </HueckoCard>
        ))}
      </View>
    ));
  };

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void reload()} colors={[colors.primary]} />}
    >
      <Text style={[typography.bodyMedium, { color: colors.onSurfaceVariant }]}>
        {`Franjas de 08:00 a 20:00 en las que está libre al menos el ${threshold}% del grupo, según los horarios recurrentes de cada miembro.`}
      </Text>
      {renderContent()}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: { flex: 1, backgroundColor: colors.surface },
  content: { padding: 16, gap: 20 },
  spinner: { marginTop: 32 },
  errorBox: { gap: 12 },
  day: { gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
});
```

`mobile/src/screens/groups/tabs/MembersTab.tsx` (lista completa de miembros, sin el tope de 8 de Kotlin):
```tsx
import type { Group, GroupMember } from '@hueckoapp/shared';
import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import { errorMessage } from '../../../api/client';
import { Avatar, Badge, SecondaryButton } from '../../../components';
import { categoryColor, colors, typography } from '../../../theme';
import { showToast } from '../../../utils/toast';

type Props = {
  group: Group;
  currentUserId: string;
  onToggleEssential: (userId: string, isEssential: boolean) => Promise<void>;
  onLeave: () => Promise<void>;
};

export function MembersTab({ group, currentUserId, onToggleEssential, onLeave }: Props) {
  const isOwner = group.members.some((m) => m.id === currentUserId && m.role === 'OWNER');
  const [leaving, setLeaving] = useState(false);

  const toggle = async (member: GroupMember, value: boolean) => {
    try {
      await onToggleEssential(member.id, value);
    } catch (e) {
      showToast(errorMessage(e));
    }
  };

  const leave = async () => {
    setLeaving(true);
    try {
      await onLeave();
    } catch (e) {
      showToast(errorMessage(e));
      setLeaving(false);
    }
  };

  const confirmLeave = () => {
    if (leaving) return;
    Alert.alert('Salir del grupo', `¿Seguro que quieres salir de «${group.name}»? Tu horario dejará de contar en sus huecos.`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Salir', style: 'destructive', onPress: () => void leave() },
    ]);
  };

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      {isOwner ? (
        <Text style={[typography.bodySmall, { color: colors.onSurfaceVariant }]}>
          Marca como imprescindibles a quienes deben estar sí o sí: si uno falta a un plan, el plan se vuelve a coordinar.
        </Text>
      ) : null}
      {group.members.map((member, index) => (
        <View key={member.id} style={styles.row}>
          <Avatar name={member.name} color={categoryColor(index)} size={40} />
          <View style={styles.texts}>
            <Text style={[typography.titleMedium, { color: colors.onSurface }]}>
              {member.id === currentUserId ? `${member.name} (tú)` : member.name}
            </Text>
            <Text style={[typography.bodySmall, { color: colors.onSurfaceVariant }]}>{member.email}</Text>
            {member.role === 'OWNER' || member.isEssential ? (
              <View style={styles.badges}>
                {member.role === 'OWNER' ? (
                  <Badge text="Administrador" containerColor={colors.primaryContainer} contentColor={colors.onPrimaryContainer} />
                ) : null}
                {member.isEssential ? (
                  <Badge text="Imprescindible" containerColor={colors.tertiaryContainer} contentColor={colors.onTertiaryContainer} />
                ) : null}
              </View>
            ) : null}
          </View>
          {isOwner ? (
            <Switch
              accessibilityLabel={`Imprescindible: ${member.name}`}
              value={member.isEssential}
              onValueChange={(value) => void toggle(member, value)}
              trackColor={{ true: colors.primary, false: colors.surfaceContainerHigh }}
              thumbColor={colors.surfaceContainerLowest}
            />
          ) : null}
        </View>
      ))}
      <SecondaryButton title={leaving ? 'Saliendo…' : 'Salir del grupo'} icon="logout" color={colors.error} onPress={confirmLeave} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: colors.surface },
  content: { padding: 16, gap: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  texts: { flex: 1 },
  badges: { flexDirection: 'row', gap: 6, marginTop: 6 },
});
```

`mobile/src/screens/groups/GroupDetailScreen.tsx` (UI spec §2.6: banner 120 con la inicial en `displayMedium` 45/52 peso 400, nombre `headlineSmall`, nº de miembros; debajo el código de invitación y las pestañas):
```tsx
import { createMaterialTopTabNavigator } from '@react-navigation/material-top-tabs';
import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { ErrorBanner, SecondaryButton } from '../../components';
import { useAuth } from '../../context/AuthContext';
import { useGroup } from '../../hooks/useGroup';
import type { AppStackScreen, GroupTabsParamList } from '../../navigation/types';
import { categoryColorFor, colors, typography } from '../../theme';
import { memberCountLabel } from '../../utils/groups';
import { showToast } from '../../utils/toast';
import { InviteCodeCard } from './InviteCodeCard';
import { AvailabilityTab } from './tabs/AvailabilityTab';
import { MembersTab } from './tabs/MembersTab';
import { PlansTab } from './tabs/PlansTab';

const Tabs = createMaterialTopTabNavigator<GroupTabsParamList>();

export function GroupDetailScreen({ navigation, route }: AppStackScreen<'GroupDetail'>) {
  const { groupId } = route.params;
  const { user } = useAuth();
  const { group, loading, error, reload, setEssential, leave } = useGroup(groupId);

  // La cabecera arranca con el nombre recibido y se actualiza si cambió en el servidor.
  useEffect(() => {
    if (group) navigation.setOptions({ title: group.name });
  }, [group?.name, navigation]);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (!group) {
    return (
      <View style={[styles.centered, styles.errorBox]}>
        <ErrorBanner message={error ?? 'Grupo no encontrado.'} />
        <SecondaryButton title="Reintentar" icon="refresh" onPress={() => void reload()} />
      </View>
    );
  }

  const handleLeave = async () => {
    await leave();
    showToast(`Saliste de «${group.name}».`);
    navigation.goBack();
  };

  return (
    <View style={styles.screen}>
      <View style={[styles.banner, { backgroundColor: categoryColorFor(group.name) }]}>
        <Text style={styles.bannerInitial}>{group.name.trim().charAt(0).toUpperCase()}</Text>
      </View>
      <View style={styles.header}>
        <Text style={[typography.headlineSmall, { color: colors.onSurface }]}>{group.name}</Text>
        {group.description ? (
          <Text style={[typography.bodyMedium, { color: colors.onSurfaceVariant }]}>{group.description}</Text>
        ) : null}
        <Text style={[typography.labelMedium, { color: colors.onSurfaceVariant }]}>{memberCountLabel(group.memberCount)}</Text>
        <InviteCodeCard code={group.inviteCode} />
      </View>
      <Tabs.Navigator
        screenOptions={{
          tabBarActiveTintColor: colors.primary,
          tabBarInactiveTintColor: colors.onSurfaceVariant,
          tabBarIndicatorStyle: { backgroundColor: colors.primary },
          tabBarStyle: { backgroundColor: colors.surface },
          tabBarLabelStyle: { ...typography.labelLarge, textTransform: 'none' },
          sceneStyle: { backgroundColor: colors.surface },
        }}
      >
        <Tabs.Screen name="Plans" component={PlansTab} options={{ title: 'Planes' }} />
        <Tabs.Screen name="Availability" options={{ title: 'Huecos' }}>
          {() => <AvailabilityTab groupId={group.id} threshold={group.availabilityThreshold} memberCount={group.memberCount} />}
        </Tabs.Screen>
        <Tabs.Screen name="Members" options={{ title: 'Miembros' }}>
          {() => (
            <MembersTab group={group} currentUserId={user?.id ?? ''} onToggleEssential={setEssential} onLeave={handleLeave} />
          )}
        </Tabs.Screen>
      </Tabs.Navigator>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  centered: { flex: 1, justifyContent: 'center', padding: 16, backgroundColor: colors.surface },
  errorBox: { gap: 12 },
  banner: { height: 120, alignItems: 'center', justifyContent: 'center' },
  bannerInitial: { fontSize: 45, lineHeight: 52, fontWeight: '400', color: '#FFFFFF' },
  header: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8, gap: 4 },
});
```

- [ ] **Step 7: Navegación**

`mobile/src/navigation/types.ts` — añadir `GroupDetail` al stack y el tipo de las pestañas:
```ts
export type AppStackParamList = {
  Main: NavigatorScreenParams<DrawerParamList>;
  AddSchedule: { initialDay?: number } | undefined;
  GroupDetail: { groupId: string; name: string };
};

// Pestañas del detalle de grupo.
export type GroupTabsParamList = { Plans: undefined; Availability: undefined; Members: undefined };
```

`mobile/src/navigation/RootNavigator.tsx` — importar `import { GroupDetailScreen } from '../screens/groups/GroupDetailScreen';` y añadir tras `AddSchedule`:
```tsx
      <AppStack.Screen name="GroupDetail" component={GroupDetailScreen} options={({ route }) => ({ title: route.params.name })} />
```

`mobile/src/navigation/AppDrawer.tsx` — importar `import { GroupListScreen } from '../screens/groups/GroupListScreen';` y reemplazar la pantalla `Groups` por:
```tsx
      <Drawer.Screen name="Groups" component={GroupListScreen} options={{ title: 'Grupos', drawerIcon: icon('group') }} />
```
(`Dashboard` sigue con `PlaceholderScreen` hasta la Fase 3.)

- [ ] **Step 8: Ejecutar y ver que pasa** — `npm test -w mobile` → PASS. `npm run typecheck -w mobile` → sin errores.

- [ ] **Step 9: Verificación final de la fase**
  - `npm test` (raíz: backend + mobile) → verde.
  - `npm run typecheck` → verde.
  - `cd mobile && OUT="$(mktemp -d)" && npx expo export --platform android --output-dir "$OUT" && rm -rf "$OUT"` → empaqueta sin errores.
  - `cd mobile && npx expo-doctor` → sin problemas.
  - Prueba manual (si hay emulador o Expo Go): `npm run seed -w backend`, `npm run backend`, `npm run mobile`; entrar con `test@test.com` / `password123`; Horario arranca en el día de hoy; añadir un bloque puntual para esta semana y verlo en su día; borrar con confirmación; Grupos → «Unirme» con `huecko123` (entra en «Amigos de la Uni»; una segunda vez muestra «Ya perteneces a este grupo.»); abrir «Proyecto Integrador» → copiar el código; «Huecos» muestra las 9 franjas de E3; «Miembros» permite marcar a Ana como imprescindible; «Salir del grupo» con confirmación vuelve a la lista actualizada.

- [ ] **Step 10: README** — en la hoja de ruta marcar `- [x] **Fase 2** — Grupos, horarios y cruce de disponibilidad`; en «Temas del curso», fila **Hooks**, cambiar el texto por: «`useState`/`useEffect`, `AuthContext` y hooks propios en `mobile/src/hooks/`: genéricos (`useResource`, `useAction`, `useRefreshOnFocus`) y de dominio (`useSchedule`, `useGroups`, `useGroup`, `useAvailability`)».

- [ ] **Step 11: Commit** — `git add mobile/package.json package-lock.json mobile/jest.setup.ts mobile/src/utils mobile/src/components mobile/src/screens/groups mobile/src/navigation README.md` → `feat(mobile): grupos con diálogos, detalle en pestañas (planes, huecos, miembros) y código copiable`

---

## Cobertura de la spec (autorrevisión)

| Requisito | Task |
|---|---|
| Domain §1 matcher exacto + E1–E6 | 3 (`matcher.ts`, `matcher.test.ts`) |
| G10 normalización del código · G11 formato y unicidad | 2 |
| G12 selector de tipo · B21/quirk 11 reinicio del formulario · B22 | 1 (validación enum), 6 (AddSchedule) |
| G13/B14 puntuales y `LIBRE` fuera del cruce | 3 (`groupAvailability`, api.md) |
| C5 «3 mejores franjas» | Fase 3 (solo se usa al crear propuestas); el matcher ya exporta `weeklyWindows` |
| C6 PATCH solo OWNER, umbral 0–100, promoción al salir · C7 roles | 2 |
| Domain §2.3 GroupViewModel (crear/unirse, errores, limpiar al teclear) | 5 (`useGroups`, `useAction`), 7 (diálogos) |
| Domain §2.5 ScheduleViewModel (validación HH:mm, orden, recurrente/puntual) | 1, 6 |
| Domain §3.2 semilla | 4 |
| UI §2.4, §2.5, §2.6 (miembros), §2.9, §2.10, §3.8 | 6, 7 |
| Quirks 3, 10, 15, 18, 22 y TODO «Ver todos los integrantes» | 7, 6, 6, 6, 7, 7 |
| UI §7 tildes corregidas | 6, 7 (copia exacta en tests) |
| Navegación: GroupDetail y AddSchedule apiladas; drawer Horario y Grupos reales | 6, 7 |
