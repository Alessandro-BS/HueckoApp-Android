# Fase 1 — Autenticación y navegación: plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Registro, inicio y cierre de sesión reales (backend con SQLite + JWT, app con SecureStore) y la navegación completa de la app (stack de autenticación + drawer principal) con el sistema de diseño portado de Kotlin.

**Architecture:** El backend Express guarda usuarios en SQLite usando el módulo nativo `node:sqlite` (sin ORM ni dependencias nativas), hashea contraseñas con bcryptjs y emite JWT. `createApp(deps)` recibe la base de datos y el secreto por inyección para poder probarlo con una base en memoria. La app Expo usa un `AuthContext` que restaura la sesión desde `expo-secure-store` al arrancar, un cliente axios con interceptores (token y errores) y React Navigation: `native-stack` en la raíz, que muestra el stack de auth o el `drawer` principal según la sesión.

**Tech Stack:** Express 5, TypeScript, `node:sqlite` (Node ≥ 22.13), bcryptjs 3, jsonwebtoken 9, zod 4, helmet, express-rate-limit, Vitest + Supertest · Expo SDK 57, React Navigation 7 (native-stack, drawer), expo-secure-store, axios, @expo/vector-icons, jest-expo + @testing-library/react-native.

**Spec:** `docs/superpowers/specs/2026-09-29-ui-screens-spec.md` (§1, §2.1, §2.2, §2.12, §3, §4, §5) y `docs/superpowers/specs/2026-09-29-domain-logic-spec.md` (§2.1, §5.2 C8). Contrato: `docs/api.md`.

## Global Constraints

- Idioma de la UI y de los mensajes de error: español, **con tildes correctas** (se corrigen las faltas del original, ver UI spec §7).
- Contraseña: mínimo **8** caracteres, máximo 72 (límite de bcrypt). Mensaje: «Mínimo 8 caracteres».
- Regex de correo (cliente y servidor), sobre el valor con `trim()`: `^[^@\s]+@[^@\s]+\.[^@\s]+$`. El servidor además lo pasa a minúsculas.
- IDs: `crypto.randomUUID()`.
- Forma de error del backend: `{ "error": { "code", "message", "details" } }` (ya implementada en `backend/src/middleware/errors.ts`).
- El token JWT se guarda **solo** en `expo-secure-store` (clave `hueckoapp.token`). Nunca en AsyncStorage ni en logs.
- Navegación: React Navigation (no Expo Router). El drawer reemplaza a la barra inferior de Kotlin con las mismas 4 secciones y el mismo orden: Inicio, Horario, Grupos, Perfil.
- Paquetes de `mobile/` se instalan con `npx expo install` ejecutado dentro de `mobile/`. Paquetes de `backend/` con `npm install <pkg> -w backend` desde la raíz.
- Commits convencionales en español terminados con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Identidad git: variables `GIT_AUTHOR_NAME="Aless Bustamante" GIT_AUTHOR_EMAIL="fabrizio.bs9012@gmail.com"` (y las mismas `GIT_COMMITTER_*`); no hay `user.name` configurado.
- Antes de cada commit: `npm run typecheck` y `npm test` desde la raíz en verde.

## Mapa de archivos

**backend/**
| Archivo | Responsabilidad |
|---|---|
| `src/db/migrations.ts` | Lista ordenada de migraciones SQL |
| `src/db/database.ts` | `openDatabase(path)`, `migrate(db)`, tipo `Db` |
| `src/users/users.repository.ts` | Acceso a la tabla `users` |
| `src/auth/passwords.ts` | `hashPassword`, `verifyPassword` |
| `src/auth/tokens.ts` | `signToken`, `verifyToken` |
| `src/auth/require-auth.ts` | Middleware que exige `Authorization: Bearer` y expone `getUserId(res)` |
| `src/auth/auth.schemas.ts` | Esquemas zod de registro y login |
| `src/auth/auth.routes.ts` | Router `/auth` (register, login, me) |
| `src/app.ts` | `createApp(deps: AppDeps)` (modificado) |
| `src/config/env.ts` | Añade `JWT_SECRET`, `JWT_EXPIRES_IN`, `DATABASE_PATH` (modificado) |
| `src/index.ts` | Abre la base y arranca (modificado) |
| `test/helpers.ts` | `makeTestApp()` con SQLite en memoria |
| `test/database.test.ts`, `test/auth.test.ts` | Tests |

**mobile/**
| Archivo | Responsabilidad |
|---|---|
| `src/theme/colors.ts` | Tokens de color (se completan los que faltan) |
| `src/theme/typography.ts` | Estilos de texto de `Type.kt` |
| `src/theme/radius.ts` | Radios `HueckoRadius` |
| `src/theme/categoryColors.ts` | Colores de categoría + `javaHash` |
| `src/theme/index.ts` | Reexporta el tema |
| `src/components/*.tsx` | `HueckoCard`, `PrimaryButton`, `SecondaryButton`, `TextField`, `ErrorBanner`, `SectionHeader`, `EmptyState`, `Avatar`, `Badge` |
| `src/utils/validation.ts` | Validación de correo, contraseña y nombre |
| `src/utils/toast.ts` | `showToast(msg)` |
| `src/auth/tokenStorage.ts` | Lectura/escritura del token en SecureStore |
| `src/api/client.ts` | Instancia axios, interceptores, `ApiError` |
| `src/api/auth.ts` | `loginRequest`, `registerRequest`, `meRequest` |
| `src/context/AuthContext.tsx` | `AuthProvider` + `useAuth()` |
| `src/navigation/types.ts` | Tipos de parámetros de cada navegador |
| `src/navigation/RootNavigator.tsx` | Stack raíz según sesión |
| `src/navigation/AppDrawer.tsx` | Drawer principal + contenido personalizado |
| `src/screens/auth/LoginScreen.tsx`, `RegisterScreen.tsx` | Pantallas de acceso |
| `src/screens/profile/ProfileScreen.tsx` | Perfil y cierre de sesión |
| `src/screens/SplashScreen.tsx` | Carga mientras se restaura la sesión |
| `src/screens/PlaceholderScreen.tsx` | Inicio/Horario/Grupos hasta la Fase 2 |
| `App.tsx`, `index.ts` | Montaje de providers (modificados) |
| `jest.setup.ts` | Mocks globales de tests |
| `src/**/__tests__/*.test.ts(x)` | Tests |

---

### Task 1: Base de datos SQLite con migraciones

**Files:**
- Create: `backend/src/db/migrations.ts`, `backend/src/db/database.ts`, `backend/test/database.test.ts`

**Interfaces:**
- Produces: `type Db = DatabaseSync`; `openDatabase(path: string): Db` (activa `foreign_keys`, aplica migraciones); `migrate(db: Db): void`; `migrations: string[]`.

- [ ] **Step 1: Escribir el test que falla** — `backend/test/database.test.ts`

```ts
import { describe, expect, it } from 'vitest';

import { migrate, openDatabase } from '../src/db/database';
import { migrations } from '../src/db/migrations';

describe('openDatabase', () => {
  it('aplica todas las migraciones y deja user_version al día', () => {
    const db = openDatabase(':memory:');
    const { user_version } = db.prepare('PRAGMA user_version').get() as { user_version: number };
    expect(user_version).toBe(migrations.length);
  });

  it('crea la tabla users con email único', () => {
    const db = openDatabase(':memory:');
    const insert = db.prepare('INSERT INTO users (id, name, email, password_hash) VALUES (?, ?, ?, ?)');
    insert.run('1', 'Ana', 'ana@correo.com', 'x');
    expect(() => insert.run('2', 'Otra', 'ana@correo.com', 'y')).toThrow();
  });

  it('es idempotente: migrar una base ya migrada no hace nada', () => {
    const db = openDatabase(':memory:');
    expect(() => migrate(db)).not.toThrow();
    const { user_version } = db.prepare('PRAGMA user_version').get() as { user_version: number };
    expect(user_version).toBe(migrations.length);
  });

  it('activa las claves foráneas', () => {
    const db = openDatabase(':memory:');
    const { foreign_keys } = db.prepare('PRAGMA foreign_keys').get() as { foreign_keys: number };
    expect(foreign_keys).toBe(1);
  });
});
```

- [ ] **Step 2: Ejecutar y ver que falla**

Run: `npm test -w backend -- database`
Expected: FAIL, «Cannot find module '../src/db/database'».

- [ ] **Step 3: Implementar**

`backend/src/db/migrations.ts`:
```ts
// Migraciones en orden. Nunca se edita una ya publicada: se agrega una nueva al final.
// PRAGMA user_version guarda cuántas se aplicaron.
export const migrations: string[] = [
  `CREATE TABLE users (
     id            TEXT PRIMARY KEY,
     name          TEXT NOT NULL,
     email         TEXT NOT NULL UNIQUE,
     password_hash TEXT NOT NULL,
     created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
   );`,
];
```

`backend/src/db/database.ts`:
```ts
import { DatabaseSync } from 'node:sqlite';

import { migrations } from './migrations';

export type Db = DatabaseSync;

// Abre (o crea) la base y la deja al día. ':memory:' para tests.
export function openDatabase(path: string): Db {
  const db = new DatabaseSync(path);
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec('PRAGMA journal_mode = WAL;');
  migrate(db);
  return db;
}

export function migrate(db: Db): void {
  const { user_version: current } = db.prepare('PRAGMA user_version').get() as { user_version: number };
  for (let version = current; version < migrations.length; version++) {
    db.exec('BEGIN');
    try {
      db.exec(migrations[version]);
      db.exec(`PRAGMA user_version = ${version + 1}`);
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }
}
```

- [ ] **Step 4: Ejecutar y ver que pasa**

Run: `npm test -w backend -- database` → PASS (4 tests). Luego `npm run typecheck -w backend` → sin errores.

- [ ] **Step 5: Commit** — `feat(backend): base de datos SQLite con migraciones (node:sqlite)`

---

### Task 2: Autenticación en el backend (registro, login, sesión)

**Files:**
- Create: `backend/src/users/users.repository.ts`, `backend/src/auth/passwords.ts`, `backend/src/auth/tokens.ts`, `backend/src/auth/require-auth.ts`, `backend/src/auth/auth.schemas.ts`, `backend/src/auth/auth.routes.ts`, `backend/test/helpers.ts`, `backend/test/auth.test.ts`
- Modify: `backend/src/app.ts`, `backend/src/config/env.ts`, `backend/src/index.ts`, `backend/.env.example`, `backend/test/health.test.ts`, `docs/api.md`, `README.md`

**Interfaces:**
- Consumes: `Db`, `openDatabase` (Task 1); `ApiError` de `src/middleware/errors.ts`; `User` de `@hueckoapp/shared`.
- Produces:
  - `type AppDeps = { db: Db; jwtSecret: string; jwtExpiresIn: string }`; `createApp(deps: AppDeps): Express`.
  - `requireAuth(secret: string): RequestHandler` y `getUserId(res: Response): string` — las usan todas las rutas privadas de fases siguientes.
  - `usersRepository(db)` con `create({name,email,passwordHash}): User`, `findByEmail(email): (User & {passwordHash: string}) | undefined`, `findById(id): User | undefined`.
  - `makeTestApp(): { app: Express; db: Db }` y `registerUser(app, overrides?): Promise<{ token: string; user: User }>` en `test/helpers.ts`, reutilizables en fases siguientes.
  - Endpoints: `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me`.

- [ ] **Step 1: Instalar dependencias**

```bash
npm install bcryptjs jsonwebtoken helmet express-rate-limit -w backend
npm install -D @types/jsonwebtoken -w backend
```

- [ ] **Step 2: Escribir los tests que fallan**

`backend/test/helpers.ts`:
```ts
import type { User } from '@hueckoapp/shared';
import type { Express } from 'express';
import request from 'supertest';

import { createApp } from '../src/app';
import { openDatabase, type Db } from '../src/db/database';

export const TEST_SECRET = 'secreto-de-pruebas-con-mas-de-32-caracteres';

export function makeTestApp(): { app: Express; db: Db } {
  const db = openDatabase(':memory:');
  const app = createApp({ db, jwtSecret: TEST_SECRET, jwtExpiresIn: '1h' });
  return { app, db };
}

let counter = 0;
export async function registerUser(
  app: Express,
  overrides: Partial<{ name: string; email: string; password: string }> = {},
): Promise<{ token: string; user: User }> {
  counter += 1;
  const body = {
    name: `Usuario ${counter}`,
    email: `usuario${counter}@correo.com`,
    password: 'contrasena-segura',
    ...overrides,
  };
  const res = await request(app).post('/api/auth/register').send(body);
  if (res.status !== 201) throw new Error(`registro falló: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body;
}
```

`backend/test/auth.test.ts`:
```ts
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Express } from 'express';

import { makeTestApp, registerUser, TEST_SECRET } from './helpers';

let app: Express;
beforeEach(() => {
  ({ app } = makeTestApp());
});

describe('POST /api/auth/register', () => {
  it('crea la cuenta y devuelve token + usuario sin contraseña', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: '  Ana Pérez ', email: '  Ana@Correo.com ', password: 'contrasena-segura' });
    expect(res.status).toBe(201);
    expect(typeof res.body.token).toBe('string');
    expect(res.body.user).toEqual({ id: expect.any(String), name: 'Ana Pérez', email: 'ana@correo.com' });
    expect(JSON.stringify(res.body)).not.toContain('password');
  });

  it('rechaza un correo ya registrado con 409 EMAIL_TAKEN', async () => {
    await registerUser(app, { email: 'ana@correo.com' });
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Otra', email: 'ANA@correo.com', password: 'contrasena-segura' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('EMAIL_TAKEN');
    expect(res.body.error.message).toBe('Ya existe una cuenta con ese correo.');
  });

  it.each([
    [{ name: '', email: 'a@b.co', password: 'contrasena-segura' }, 'name', 'El nombre es requerido'],
    [{ name: 'Ana', email: 'no-es-correo', password: 'contrasena-segura' }, 'email', 'Ingresa un correo válido'],
    [{ name: 'Ana', email: 'a@b.co', password: 'corta' }, 'password', 'Mínimo 8 caracteres'],
  ])('valida los datos (%j) → 400 en %s', async (body, field, message) => {
    const res = await request(app).post('/api/auth/register').send(body);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details).toContainEqual(expect.objectContaining({ path: [field], message }));
  });
});

describe('POST /api/auth/login', () => {
  it('inicia sesión con el correo en cualquier formato de mayúsculas', async () => {
    await registerUser(app, { email: 'ana@correo.com', password: 'contrasena-segura' });
    const res = await request(app).post('/api/auth/login').send({ email: ' ANA@correo.com', password: 'contrasena-segura' });
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe('ana@correo.com');
    expect(typeof res.body.token).toBe('string');
  });

  it.each([
    ['contraseña incorrecta', 'ana@correo.com', 'otra-contrasena'],
    ['correo inexistente', 'nadie@correo.com', 'contrasena-segura'],
  ])('%s → 401 con el mismo mensaje', async (_caso, email, password) => {
    await registerUser(app, { email: 'ana@correo.com', password: 'contrasena-segura' });
    const res = await request(app).post('/api/auth/login').send({ email, password });
    expect(res.status).toBe(401);
    expect(res.body.error).toMatchObject({ code: 'INVALID_CREDENTIALS', message: 'Correo o contraseña incorrectos.' });
  });
});

describe('GET /api/auth/me', () => {
  it('devuelve el usuario del token', async () => {
    const { token, user } = await registerUser(app);
    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual(user);
  });

  it('sin token → 401 UNAUTHORIZED', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('token firmado con otro secreto → 401', async () => {
    const forged = jwt.sign({ sub: 'x' }, 'otro-secreto-cualquiera-de-32-caracteres!!');
    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${forged}`);
    expect(res.status).toBe(401);
  });

  it('token expirado → 401', async () => {
    const { user } = await registerUser(app);
    const expired = jwt.sign({ sub: user.id }, TEST_SECRET, { expiresIn: -10 });
    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${expired}`);
    expect(res.status).toBe(401);
  });
});
```

Modificar `backend/test/health.test.ts` para usar `makeTestApp()` en vez de `createApp()`:
```ts
import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { makeTestApp } from './helpers';

describe('API base', () => {
  const { app } = makeTestApp();

  it('GET /api/health responde ok', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('una ruta inexistente devuelve 404 con el formato de error del contrato', async () => {
    const res = await request(app).get('/api/no-existe');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});
```

- [ ] **Step 3: Ejecutar y ver que falla** — `npm test -w backend` → FAIL (no existen `createApp(deps)` ni `/auth`).

- [ ] **Step 4: Implementar**

`backend/src/users/users.repository.ts`:
```ts
import { randomUUID } from 'node:crypto';

import type { User } from '@hueckoapp/shared';

import type { Db } from '../db/database';

type UserRow = { id: string; name: string; email: string; password_hash: string };

const toUser = (row: UserRow): User => ({ id: row.id, name: row.name, email: row.email });

export function usersRepository(db: Db) {
  return {
    create(input: { name: string; email: string; passwordHash: string }): User {
      const id = randomUUID();
      db.prepare('INSERT INTO users (id, name, email, password_hash) VALUES (?, ?, ?, ?)').run(
        id, input.name, input.email, input.passwordHash,
      );
      return { id, name: input.name, email: input.email };
    },
    findByEmail(email: string): (User & { passwordHash: string }) | undefined {
      const row = db.prepare('SELECT * FROM users WHERE email = ?').get(email) as UserRow | undefined;
      return row && { ...toUser(row), passwordHash: row.password_hash };
    },
    findById(id: string): User | undefined {
      const row = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined;
      return row && toUser(row);
    },
  };
}
```

`backend/src/auth/passwords.ts`:
```ts
import bcrypt from 'bcryptjs';

const COST = 10;

export const hashPassword = (plain: string) => bcrypt.hash(plain, COST);
export const verifyPassword = (plain: string, hash: string) => bcrypt.compare(plain, hash);

// Hash válido de una contraseña que nadie usa. Se compara contra él cuando el correo
// no existe, para que la respuesta tarde lo mismo y no delate qué correos están registrados.
export const DUMMY_HASH = bcrypt.hashSync('hueckoapp-dummy-password', COST);
```

`backend/src/auth/tokens.ts`:
```ts
import jwt, { type SignOptions } from 'jsonwebtoken';

export function signToken(userId: string, secret: string, expiresIn: string): string {
  return jwt.sign({}, secret, { subject: userId, expiresIn: expiresIn as SignOptions['expiresIn'] });
}

// Devuelve el id del usuario o null si el token es inválido o expiró.
export function verifyToken(token: string, secret: string): string | null {
  try {
    const payload = jwt.verify(token, secret);
    return typeof payload === 'object' && typeof payload.sub === 'string' ? payload.sub : null;
  } catch {
    return null;
  }
}
```

`backend/src/auth/require-auth.ts`:
```ts
import type { RequestHandler, Response } from 'express';

import { ApiError } from '../middleware/errors';
import { verifyToken } from './tokens';

const unauthorized = () => new ApiError(401, 'UNAUTHORIZED', 'Tu sesión expiró. Inicia sesión de nuevo.');

export function requireAuth(secret: string): RequestHandler {
  return (req, res, next) => {
    const header = req.get('authorization') ?? '';
    const [scheme, token] = header.split(' ');
    const userId = scheme === 'Bearer' && token ? verifyToken(token, secret) : null;
    if (!userId) return next(unauthorized());
    res.locals.userId = userId;
    next();
  };
}

// Id del usuario autenticado. Solo se usa detrás de requireAuth.
export function getUserId(res: Response): string {
  const id = res.locals.userId;
  if (typeof id !== 'string') throw unauthorized();
  return id;
}
```

`backend/src/auth/auth.schemas.ts`:
```ts
import { z } from 'zod';

const EMAIL_REGEX = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

const email = z
  .string({ error: 'El correo es requerido' })
  .trim()
  .min(1, 'El correo es requerido')
  .regex(EMAIL_REGEX, 'Ingresa un correo válido')
  .transform((v) => v.toLowerCase());

export const registerSchema = z.object({
  name: z.string({ error: 'El nombre es requerido' }).trim().min(1, 'El nombre es requerido').max(80),
  email,
  password: z
    .string({ error: 'La contraseña es requerida' })
    .min(8, 'Mínimo 8 caracteres')
    .max(72, 'Máximo 72 caracteres'),
});

export const loginSchema = z.object({
  email,
  password: z.string({ error: 'La contraseña es requerida' }).min(1, 'La contraseña es requerida'),
});
```

`backend/src/auth/auth.routes.ts`:
```ts
import { Router } from 'express';
import rateLimit from 'express-rate-limit';

import type { AppDeps } from '../app';
import { ApiError } from '../middleware/errors';
import { usersRepository } from '../users/users.repository';
import { loginSchema, registerSchema } from './auth.schemas';
import { DUMMY_HASH, hashPassword, verifyPassword } from './passwords';
import { getUserId, requireAuth } from './require-auth';
import { signToken } from './tokens';

export function authRouter({ db, jwtSecret, jwtExpiresIn }: AppDeps) {
  const router = Router();
  const users = usersRepository(db);

  // Frena ataques de fuerza bruta: 20 intentos cada 15 minutos por IP.
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 20,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_req, _res, next) =>
      next(new ApiError(429, 'TOO_MANY_REQUESTS', 'Demasiados intentos. Espera unos minutos.')),
  });

  router.post('/register', limiter, async (req, res) => {
    const { name, email, password } = registerSchema.parse(req.body);
    if (users.findByEmail(email)) {
      throw new ApiError(409, 'EMAIL_TAKEN', 'Ya existe una cuenta con ese correo.');
    }
    const user = users.create({ name, email, passwordHash: await hashPassword(password) });
    res.status(201).json({ token: signToken(user.id, jwtSecret, jwtExpiresIn), user });
  });

  router.post('/login', limiter, async (req, res) => {
    const { email, password } = loginSchema.parse(req.body);
    const found = users.findByEmail(email);
    const ok = await verifyPassword(password, found?.passwordHash ?? DUMMY_HASH);
    if (!found || !ok) {
      throw new ApiError(401, 'INVALID_CREDENTIALS', 'Correo o contraseña incorrectos.');
    }
    const { passwordHash: _omit, ...user } = found;
    res.json({ token: signToken(user.id, jwtSecret, jwtExpiresIn), user });
  });

  router.get('/me', requireAuth(jwtSecret), (_req, res) => {
    const user = users.findById(getUserId(res));
    if (!user) throw new ApiError(401, 'UNAUTHORIZED', 'Tu sesión expiró. Inicia sesión de nuevo.');
    res.json(user);
  });

  return router;
}
```

> Express 5 captura los errores lanzados en handlers `async`, así que `throw new ApiError(...)` llega al `errorHandler` sin `try/catch`.

`backend/src/app.ts` (reemplazar completo):
```ts
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';

import { authRouter } from './auth/auth.routes';
import type { Db } from './db/database';
import { errorHandler, notFound } from './middleware/errors';

export type AppDeps = {
  db: Db;
  jwtSecret: string;
  jwtExpiresIn: string;
};

// La app se crea aparte de index.ts para poder probarla sin abrir un puerto
// y con una base de datos en memoria.
export function createApp(deps: AppDeps) {
  const app = express();

  app.use(helmet());
  app.use(cors());
  app.use(express.json({ limit: '1mb' }));

  const api = express.Router();
  api.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });
  api.use('/auth', authRouter(deps));

  app.use('/api', api);
  app.use(notFound);
  app.use(errorHandler);

  return app;
}
```

`backend/src/config/env.ts` (reemplazar el esquema):
```ts
import 'dotenv/config';
import { z } from 'zod';

// Valida las variables de entorno al arrancar: si falta algo, el servidor
// no levanta y el error dice qué falta, en vez de fallar más tarde.
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET debe tener al menos 32 caracteres (ver .env.example)'),
  JWT_EXPIRES_IN: z.string().default('7d'),
  DATABASE_PATH: z.string().default('./data/hueckoapp.db'),
});

export const env = envSchema.parse(process.env);
```

`backend/src/index.ts`:
```ts
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

import { createApp } from './app';
import { env } from './config/env';
import { openDatabase } from './db/database';

mkdirSync(dirname(env.DATABASE_PATH), { recursive: true });
const db = openDatabase(env.DATABASE_PATH);

createApp({ db, jwtSecret: env.JWT_SECRET, jwtExpiresIn: env.JWT_EXPIRES_IN }).listen(env.PORT, () => {
  console.log(`HueckoApp API escuchando en http://localhost:${env.PORT}/api`);
});
```

`backend/.env.example`: reemplazar la línea `DATABASE_URL="file:./dev.db"` y su comentario por:
```
# Archivo SQLite (se crea solo). El módulo node:sqlite viene con Node 22.13+.
DATABASE_PATH=./data/hueckoapp.db
```
y añadir `data/` al `.gitignore` de la raíz, en la sección `backend/`.

- [ ] **Step 5: Ejecutar y ver que pasa** — `npm test -w backend` → PASS (todos). `npm run typecheck -w backend` → sin errores.

- [ ] **Step 6: Prueba manual del servidor**

```bash
cp backend/.env.example backend/.env
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"   # pegar en JWT_SECRET de backend/.env
npm run backend   # en otra terminal
curl -s -X POST localhost:3000/api/auth/register -H "Content-Type: application/json" -d '{"name":"Ana","email":"ana@correo.com","password":"contrasena-segura"}'
```
Expected: `201` con `token` y `user`. Detener el servidor y borrar `backend/data/`.

- [ ] **Step 7: Actualizar el contrato** — en `docs/api.md`:
  - Convenciones: IDs `string (UUID)` en lugar de `cuid`.
  - `POST /auth/register`: «`password` entre 8 y 72 caracteres. El correo se guarda con `trim` y en minúsculas.»
  - `POST /auth/login`: `401 INVALID_CREDENTIALS` con mensaje «Correo o contraseña incorrectos.» igual si el correo no existe.
  - Tabla de errores: añadir `429 | Demasiados intentos en /auth (20 cada 15 min por IP)`.
  - `README.md`: en la hoja de ruta, marcar Fase 1 solo al final de Task 5 (no aquí).

- [ ] **Step 8: Commit** — `feat(backend): registro, login y sesión con JWT, bcrypt y rate limit`

---

### Task 3: Sistema de diseño en mobile (tema + componentes base) y entorno de tests

**Files:**
- Modify: `mobile/package.json`, `mobile/src/theme/colors.ts`, `package.json` (raíz, script `test`)
- Create: `mobile/jest.setup.ts`, `mobile/src/theme/typography.ts`, `mobile/src/theme/radius.ts`, `mobile/src/theme/categoryColors.ts`, `mobile/src/theme/index.ts`, `mobile/src/components/{HueckoCard,PrimaryButton,SecondaryButton,TextField,ErrorBanner,SectionHeader,EmptyState,Avatar,Badge}.tsx`, `mobile/src/components/index.ts`, `mobile/src/theme/__tests__/categoryColors.test.ts`, `mobile/src/components/__tests__/components.test.tsx`

**Interfaces:**
- Produces (lo usan todas las pantallas):
  - `colors` (objeto de tokens), `typography` (`Record<TypographyVariant, TextStyle>`), `radius` (`{ sm:4, md:6, lg:8, xl:10, xxl:12, xxxl:16, card:24 }`), `categoryColor(i: number): string`, `categoryColorFor(key: string): string`, `javaHash(s: string): number`. Todo exportado desde `src/theme`.
  - Componentes exportados desde `src/components`:
    - `HueckoCard({ children, onPress?, style?, containerColor?, borderColor?, padding? = 20 })`
    - `PrimaryButton({ title, onPress, icon?, disabled?, loading?, loadingTitle?, size?: 'md' | 'lg', style? })` — `md` alto 48, `lg` alto 52; con `loading` muestra spinner + `loadingTitle` y queda deshabilitado.
    - `SecondaryButton({ title, onPress, icon?, style?, color? })` — `color` opcional para el texto/borde (p. ej. `colors.error` en «Cerrar sesión»).
    - `TextField({ label, value, onChangeText, placeholder?, leadingIcon?, error?, secureToggle?, keyboardType?, autoCapitalize?, autoComplete?, textContentType?, returnKeyType?, onSubmitEditing?, inputRef?, testID? })`
    - `ErrorBanner({ message })`, `SectionHeader({ title, subtitle?, actionLabel?, onAction? })`, `EmptyState({ title, description, icon?, actionLabel?, onAction? })`, `Avatar({ name, color, size? = 32 })`, `Badge({ text, containerColor, contentColor })`.
  - `icon` es un nombre de `MaterialIcons` de `@expo/vector-icons` (tipo `IconName = keyof typeof MaterialIcons.glyphMap`, exportado desde `src/components`).

- [ ] **Step 1: Instalar y configurar tests** (dentro de `mobile/`)

```bash
cd mobile
npx expo install @expo/vector-icons jest-expo jest @testing-library/react-native @types/jest -- --save-dev
```
Mover `@expo/vector-icons` a `dependencies` si quedó en `devDependencies` (se usa en runtime). En `mobile/package.json` añadir:
```json
"scripts": { "test": "jest" },
"jest": {
  "preset": "jest-expo",
  "setupFiles": ["./jest.setup.ts"]
}
```
(Conservar los scripts existentes; solo añadir `test`.) `mobile/jest.setup.ts`:
```ts
// Mocks globales para tests.
jest.mock('expo-secure-store', () => {
  const store = new Map<string, string>();
  return {
    getItemAsync: jest.fn(async (k: string) => store.get(k) ?? null),
    setItemAsync: jest.fn(async (k: string, v: string) => void store.set(k, v)),
    deleteItemAsync: jest.fn(async (k: string) => void store.delete(k)),
    __store: store,
  };
});
```
En el `package.json` raíz: `"test": "npm test -w backend && npm test -w mobile"`.

- [ ] **Step 2: Tests que fallan**

`mobile/src/theme/__tests__/categoryColors.test.ts`:
```ts
import { categoryColor, categoryColorFor, javaHash } from '..';

describe('categoryColors', () => {
  it('javaHash coincide con String.hashCode() de Java', () => {
    expect(javaHash('')).toBe(0);
    expect(javaHash('a')).toBe(97);
    expect(javaHash('Proyecto Integrador')).toBe(1032726658);
  });

  it('categoryColor usa módulo no negativo sobre 8 colores', () => {
    expect(categoryColor(0)).toBe('#6750A4');
    expect(categoryColor(8)).toBe('#6750A4');
    expect(categoryColor(-1)).toBe('#7A5926');
  });

  it('categoryColorFor es estable para la misma clave', () => {
    expect(categoryColorFor('g1')).toBe(categoryColorFor('g1'));
  });
});
```
> `1032726658` es `"Proyecto Integrador".hashCode()` en Java (verificado con la fórmula `h = (31*h + c) | 0`).

`mobile/src/components/__tests__/components.test.tsx`:
```tsx
import { fireEvent, render, screen } from '@testing-library/react-native';

import { EmptyState, PrimaryButton, TextField } from '..';

describe('PrimaryButton', () => {
  it('llama a onPress', () => {
    const onPress = jest.fn();
    render(<PrimaryButton title="Iniciar sesión" onPress={onPress} />);
    fireEvent.press(screen.getByText('Iniciar sesión'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('en loading muestra el texto de carga y no responde', () => {
    const onPress = jest.fn();
    render(<PrimaryButton title="Iniciar sesión" loadingTitle="Iniciando sesión…" loading onPress={onPress} />);
    expect(screen.getByText('Iniciando sesión…')).toBeTruthy();
    fireEvent.press(screen.getByText('Iniciando sesión…'));
    expect(onPress).not.toHaveBeenCalled();
  });
});

describe('TextField', () => {
  it('muestra el error y alterna la visibilidad de la contraseña', () => {
    render(<TextField label="Contraseña" value="x" onChangeText={() => {}} error="Mínimo 8 caracteres" secureToggle />);
    expect(screen.getByText('Mínimo 8 caracteres')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Mostrar contraseña'));
    expect(screen.getByLabelText('Ocultar contraseña')).toBeTruthy();
  });
});

describe('EmptyState', () => {
  it('muestra la acción si se pasa', () => {
    const onAction = jest.fn();
    render(<EmptyState title="Sin grupos" description="Crea uno" actionLabel="Crear grupo" onAction={onAction} />);
    fireEvent.press(screen.getByText('Crear grupo'));
    expect(onAction).toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Ejecutar y ver que falla** — `npm test -w mobile` → FAIL (módulos inexistentes).

- [ ] **Step 4: Implementar el tema**

`mobile/src/theme/colors.ts`: conservar los tokens existentes y añadir:
```ts
  surfaceContainerLowest: '#FFFFFF',
  surfaceContainerLow: '#F7F2FA',
  surfaceContainer: '#F3EDF7',
  surfaceContainerHigh: '#ECE6F0',
  inverseSurface: '#322F35',
  inverseOnSurface: '#F4EFF4',
  scrim: '#1D1B20',
```

`mobile/src/theme/typography.ts` — valores exactos de UI spec §4.1:
```ts
import type { TextStyle } from 'react-native';

export type TypographyVariant =
  | 'displaySmall' | 'headlineLarge' | 'headlineMedium' | 'headlineSmall'
  | 'titleLarge' | 'titleMedium' | 'titleSmall'
  | 'bodyLarge' | 'bodyMedium' | 'bodySmall'
  | 'labelLarge' | 'labelMedium' | 'labelSmall';

export const typography: Record<TypographyVariant, TextStyle> = {
  displaySmall: { fontSize: 34, fontWeight: '700', lineHeight: 40, letterSpacing: -0.7 },
  headlineLarge: { fontSize: 30, fontWeight: '700', lineHeight: 36, letterSpacing: -0.6 },
  headlineMedium: { fontSize: 24, fontWeight: '700', lineHeight: 30, letterSpacing: -0.5 },
  headlineSmall: { fontSize: 20, fontWeight: '700', lineHeight: 26, letterSpacing: -0.4 },
  titleLarge: { fontSize: 18, fontWeight: '600', lineHeight: 24 },
  titleMedium: { fontSize: 16, fontWeight: '600', lineHeight: 22 },
  titleSmall: { fontSize: 13, fontWeight: '700', lineHeight: 18 },
  bodyLarge: { fontSize: 16, fontWeight: '400', lineHeight: 24 },
  bodyMedium: { fontSize: 14, fontWeight: '400', lineHeight: 20 },
  bodySmall: { fontSize: 12, fontWeight: '400', lineHeight: 17 },
  labelLarge: { fontSize: 14, fontWeight: '700', lineHeight: 18 },
  labelMedium: { fontSize: 12, fontWeight: '600', lineHeight: 16 },
  labelSmall: { fontSize: 11, fontWeight: '600', lineHeight: 16 },
};
```

`mobile/src/theme/radius.ts`:
```ts
export const radius = { sm: 4, md: 6, lg: 8, xl: 10, xxl: 12, xxxl: 16, card: 24 } as const;
```

`mobile/src/theme/categoryColors.ts`:
```ts
// Mismos colores de categoría que la app Kotlin (UI spec §4.5).
const CATEGORY_COLORS = ['#6750A4', '#535288', '#7B4B8E', '#4A6B5B', '#8C523B', '#4E588E', '#823B58', '#7A5926'];

export const categoryColor = (index: number) =>
  CATEGORY_COLORS[((index % CATEGORY_COLORS.length) + CATEGORY_COLORS.length) % CATEGORY_COLORS.length];

// Igual que String.hashCode() de Java, para que cada grupo/bloque tenga el mismo color que en Android.
export const javaHash = (s: string) => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return h;
};

export const categoryColorFor = (key: string) => categoryColor(javaHash(key));
```

`mobile/src/theme/index.ts`:
```ts
export * from './categoryColors';
export { colors } from './colors';
export { radius } from './radius';
export { typography, type TypographyVariant } from './typography';
```

- [ ] **Step 5: Implementar los componentes** siguiendo UI spec §3 (medidas, colores y radios exactos). Guía por componente:
  - `HueckoCard`: `View` (o `Pressable` si hay `onPress`, con `android_ripple={{ color: colors.primaryContainer }}`), `borderWidth: 1`, `borderRadius: radius.card`, fondo `containerColor ?? colors.surfaceContainerLowest`, borde `borderColor ?? colors.outlineVariant`, `padding ?? 20`, sin sombra.
  - `PrimaryButton`: `Pressable` con `accessibilityRole="button"` y `accessibilityState={{ disabled, busy: loading }}`; alto 48 (`lg` = 52); `borderRadius: radius.xxl`; fondo `colors.primary`; deshabilitado: fondo `rgba(29,27,32,0.12)` y texto `rgba(29,27,32,0.38)`; contenido fila centrada: `ActivityIndicator` 18 (color `onPrimary`) + 10 de espacio + `loadingTitle ?? title` cuando `loading`; si no, icono 18 + 8 + `title` (`typography.labelLarge` en `lg`, `labelMedium` en `md`). `disabled || loading` bloquea `onPress`.
  - `SecondaryButton`: alto 48, radio 12, fondo `surfaceContainerLowest`, borde 1 `color ?? colors.outline`, icono 18 y texto `labelMedium` en `color ?? colors.primary`.
  - `TextField`: etiqueta (`labelMedium`, `onSurfaceVariant`) + 6 de espacio + contenedor fila alto mín. 56, radio 12, borde 1 `outlineVariant` (enfocado: 2 `primary`; con error: 2 `error`), icono inicial 20 `onSurfaceVariant`, `TextInput` flex 1 (`bodyLarge`, `placeholderTextColor={colors.outline}`, `selectionColor={colors.primary}`), y con `secureToggle` un `Pressable` 48×48 con icono `visibility`/`visibility-off` y `accessibilityLabel` «Mostrar contraseña»/«Ocultar contraseña» que alterna `secureTextEntry`. Error debajo (`bodySmall`, `colors.error`, margen superior 4) con `accessibilityLiveRegion="polite"`. Pasar `inputRef` al `TextInput` para encadenar «Siguiente».
  - `ErrorBanner`: fila con fondo `errorContainer`, radio 12, padding 12, gap 8, icono `error-outline` 18 `onErrorContainer` + texto `bodySmall` `onErrorContainer`; `accessibilityRole="alert"`.
  - `SectionHeader`, `EmptyState`, `Avatar`, `Badge`: exactamente como UI spec §3.4–§3.7 (`EmptyState`: círculo 100 fondo `primaryContainer` con opacidad 0.5, icono 48 `primary`, título `titleLarge` bold centrado, descripción `bodyMedium` centrada, botón píldora alto 40 padding 24 si hay acción; icono por defecto `inbox`).
  - `mobile/src/components/index.ts` reexporta todos y `export type IconName = keyof typeof MaterialIcons.glyphMap;`.

- [ ] **Step 6: Ejecutar y ver que pasa** — `npm test -w mobile` → PASS. `npm run typecheck -w mobile` → sin errores.

- [ ] **Step 7: Commit** — `feat(mobile): sistema de diseño (tema y componentes base) y tests con jest-expo`

---

### Task 4: Sesión en mobile (validación, cliente API, SecureStore, AuthContext)

**Files:**
- Create: `mobile/src/utils/validation.ts`, `mobile/src/utils/toast.ts`, `mobile/src/auth/tokenStorage.ts`, `mobile/src/api/client.ts`, `mobile/src/api/auth.ts`, `mobile/src/context/AuthContext.tsx`, `mobile/src/utils/__tests__/validation.test.ts`, `mobile/src/context/__tests__/AuthContext.test.tsx`

**Interfaces:**
- Consumes: `API_URL` de `src/config.ts`; `User` de `@hueckoapp/shared`.
- Produces:
  - `validateEmail(v: string): string | null`, `validatePassword(v: string): string | null`, `validateName(v: string): string | null` (devuelven el mensaje de error o `null`).
  - `showToast(message: string): void`.
  - `tokenStorage`: `{ get(): Promise<string|null>; set(token: string): Promise<void>; clear(): Promise<void> }`.
  - `api` (instancia axios), `class ApiError extends Error { status: number; code: string; details: unknown }`, `setAuthToken(token: string | null)`, `setUnauthorizedHandler(fn: () => void)`, `errorMessage(e: unknown): string`.
  - `loginRequest(email, password): Promise<AuthResponse>`, `registerRequest(name, email, password): Promise<AuthResponse>`, `meRequest(): Promise<User>`; `type AuthResponse = { token: string; user: User }`.
  - `AuthProvider` y `useAuth(): { status: 'loading' | 'signedOut' | 'signedIn'; user: User | null; login(email, password): Promise<void>; register(name, email, password): Promise<void>; logout(): Promise<void> }`. `login`/`register` lanzan `ApiError` si fallan (la pantalla muestra `errorMessage(e)`).

- [ ] **Step 1: Tests que fallan**

`mobile/src/utils/__tests__/validation.test.ts`:
```ts
import { validateEmail, validateName, validatePassword } from '../validation';

describe('validación de formularios', () => {
  it.each([
    ['', 'El correo es requerido'],
    ['   ', 'El correo es requerido'],
    ['ana', 'Ingresa un correo válido'],
    ['ana@correo', 'Ingresa un correo válido'],
    [' ana@correo.com ', null],
  ])('validateEmail(%j) → %j', (v, expected) => expect(validateEmail(v)).toBe(expected));

  it.each([
    ['', 'La contraseña es requerida'],
    ['  ', 'La contraseña es requerida'],
    ['1234567', 'Mínimo 8 caracteres'],
    ['12345678', null],
  ])('validatePassword(%j) → %j', (v, expected) => expect(validatePassword(v)).toBe(expected));

  it.each([
    ['', 'El nombre es requerido'],
    ['  ', 'El nombre es requerido'],
    ['Ana', null],
  ])('validateName(%j) → %j', (v, expected) => expect(validateName(v)).toBe(expected));
});
```

`mobile/src/context/__tests__/AuthContext.test.tsx`:
```tsx
import { act, renderHook, waitFor } from '@testing-library/react-native';
import * as SecureStore from 'expo-secure-store';
import type { ReactNode } from 'react';

import * as authApi from '../../api/auth';
import { AuthProvider, useAuth } from '../AuthContext';

jest.mock('../../api/auth');
const mocked = authApi as jest.Mocked<typeof authApi>;
const ana = { id: 'u1', name: 'Ana', email: 'ana@correo.com' };
const wrapper = ({ children }: { children: ReactNode }) => <AuthProvider>{children}</AuthProvider>;

beforeEach(async () => {
  jest.clearAllMocks();
  await SecureStore.deleteItemAsync('hueckoapp.token');
});

it('sin token guardado termina en signedOut', async () => {
  const { result } = renderHook(() => useAuth(), { wrapper });
  await waitFor(() => expect(result.current.status).toBe('signedOut'));
  expect(mocked.meRequest).not.toHaveBeenCalled();
});

it('con token válido restaura la sesión', async () => {
  await SecureStore.setItemAsync('hueckoapp.token', 'tok');
  mocked.meRequest.mockResolvedValue(ana);
  const { result } = renderHook(() => useAuth(), { wrapper });
  await waitFor(() => expect(result.current.status).toBe('signedIn'));
  expect(result.current.user).toEqual(ana);
});

it('con token inválido lo borra y queda signedOut', async () => {
  await SecureStore.setItemAsync('hueckoapp.token', 'viejo');
  mocked.meRequest.mockRejectedValue(new Error('401'));
  const { result } = renderHook(() => useAuth(), { wrapper });
  await waitFor(() => expect(result.current.status).toBe('signedOut'));
  expect(await SecureStore.getItemAsync('hueckoapp.token')).toBeNull();
});

it('login guarda el token y logout lo borra', async () => {
  mocked.loginRequest.mockResolvedValue({ token: 'nuevo', user: ana });
  const { result } = renderHook(() => useAuth(), { wrapper });
  await waitFor(() => expect(result.current.status).toBe('signedOut'));

  await act(() => result.current.login('ana@correo.com', 'contrasena-segura'));
  expect(result.current.status).toBe('signedIn');
  expect(await SecureStore.getItemAsync('hueckoapp.token')).toBe('nuevo');

  await act(() => result.current.logout());
  expect(result.current.status).toBe('signedOut');
  expect(await SecureStore.getItemAsync('hueckoapp.token')).toBeNull();
});
```

- [ ] **Step 2: Ejecutar y ver que falla** — `npm test -w mobile` → FAIL.

- [ ] **Step 3: Implementar**

`mobile/src/utils/validation.ts`:
```ts
// Mismas reglas que el backend (backend/src/auth/auth.schemas.ts).
const EMAIL_REGEX = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
export const PASSWORD_MIN = 8;

export function validateEmail(value: string): string | null {
  const v = value.trim();
  if (!v) return 'El correo es requerido';
  if (!EMAIL_REGEX.test(v)) return 'Ingresa un correo válido';
  return null;
}

export function validatePassword(value: string): string | null {
  if (!value.trim()) return 'La contraseña es requerida';
  if (value.length < PASSWORD_MIN) return `Mínimo ${PASSWORD_MIN} caracteres`;
  return null;
}

export function validateName(value: string): string | null {
  return value.trim() ? null : 'El nombre es requerido';
}
```

`mobile/src/utils/toast.ts`:
```ts
import { Alert, Platform, ToastAndroid } from 'react-native';

// Aviso breve: Toast nativo en Android, alerta en iOS.
export function showToast(message: string) {
  if (Platform.OS === 'android') ToastAndroid.show(message, ToastAndroid.SHORT);
  else Alert.alert('', message);
}
```

`mobile/src/auth/tokenStorage.ts`:
```ts
import * as SecureStore from 'expo-secure-store';

// El token vive cifrado en el Keystore de Android (Keychain en iOS). Nunca en AsyncStorage.
const KEY = 'hueckoapp.token';

export const tokenStorage = {
  get: () => SecureStore.getItemAsync(KEY),
  set: (token: string) => SecureStore.setItemAsync(KEY, token),
  clear: () => SecureStore.deleteItemAsync(KEY),
};
```

`mobile/src/api/client.ts`:
```ts
import axios, { AxiosError } from 'axios';

import { API_URL } from '../config';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details: unknown = null,
  ) {
    super(message);
  }
}

export const api = axios.create({ baseURL: API_URL, timeout: 15000 });

let authToken: string | null = null;
let onUnauthorized: (() => void) | null = null;

export const setAuthToken = (token: string | null) => {
  authToken = token;
};
export const setUnauthorizedHandler = (fn: (() => void) | null) => {
  onUnauthorized = fn;
};

api.interceptors.request.use((config) => {
  if (authToken) config.headers.Authorization = `Bearer ${authToken}`;
  return config;
});

type ErrorBody = { error?: { code?: string; message?: string; details?: unknown } };

api.interceptors.response.use(
  (response) => response,
  (error: AxiosError<ErrorBody>) => {
    if (!error.response) {
      throw new ApiError(0, 'NETWORK_ERROR', 'No se pudo conectar con el servidor. Revisa tu conexión.');
    }
    const { status, data } = error.response;
    // Un 401 con sesión abierta significa token vencido: cerrar sesión.
    if (status === 401 && authToken) onUnauthorized?.();
    throw new ApiError(
      status,
      data?.error?.code ?? 'UNKNOWN',
      data?.error?.message ?? 'Ocurrió un error inesperado.',
      data?.error?.details ?? null,
    );
  },
);

export const errorMessage = (e: unknown) =>
  e instanceof ApiError ? e.message : 'Ocurrió un error inesperado.';
```

`mobile/src/api/auth.ts`:
```ts
import type { User } from '@hueckoapp/shared';

import { api } from './client';

export type AuthResponse = { token: string; user: User };

export const loginRequest = async (email: string, password: string) =>
  (await api.post<AuthResponse>('/auth/login', { email, password })).data;

export const registerRequest = async (name: string, email: string, password: string) =>
  (await api.post<AuthResponse>('/auth/register', { name, email, password })).data;

export const meRequest = async () => (await api.get<User>('/auth/me')).data;
```

`mobile/src/context/AuthContext.tsx`:
```tsx
import type { User } from '@hueckoapp/shared';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { loginRequest, meRequest, registerRequest, type AuthResponse } from '../api/auth';
import { setAuthToken, setUnauthorizedHandler } from '../api/client';
import { tokenStorage } from '../auth/tokenStorage';

type Status = 'loading' | 'signedOut' | 'signedIn';

type AuthContextValue = {
  status: Status;
  user: User | null;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('loading');
  const [user, setUser] = useState<User | null>(null);

  const logout = useCallback(async () => {
    setAuthToken(null);
    await tokenStorage.clear();
    setUser(null);
    setStatus('signedOut');
  }, []);

  const startSession = useCallback(async ({ token, user }: AuthResponse) => {
    await tokenStorage.set(token);
    setAuthToken(token);
    setUser(user);
    setStatus('signedIn');
  }, []);

  // Al abrir la app: si hay token guardado, comprobar que siga siendo válido.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const token = await tokenStorage.get();
      if (!token) {
        if (!cancelled) setStatus('signedOut');
        return;
      }
      setAuthToken(token);
      try {
        const me = await meRequest();
        if (!cancelled) {
          setUser(me);
          setStatus('signedIn');
        }
      } catch {
        if (!cancelled) await logout();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [logout]);

  useEffect(() => {
    setUnauthorizedHandler(() => void logout());
    return () => setUnauthorizedHandler(null);
  }, [logout]);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      login: async (email, password) => startSession(await loginRequest(email.trim(), password)),
      register: async (name, email, password) =>
        startSession(await registerRequest(name.trim(), email.trim(), password)),
      logout,
    }),
    [status, user, startSession, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>');
  return ctx;
}
```

- [ ] **Step 4: Ejecutar y ver que pasa** — `npm test -w mobile` y `npm run typecheck -w mobile` → verde.

- [ ] **Step 5: Commit** — `feat(mobile): sesión con SecureStore, cliente axios y AuthContext`

---

### Task 5: Navegación y pantallas de acceso y perfil

**Files:**
- Create: `mobile/src/navigation/types.ts`, `mobile/src/navigation/RootNavigator.tsx`, `mobile/src/navigation/AppDrawer.tsx`, `mobile/src/screens/SplashScreen.tsx`, `mobile/src/screens/PlaceholderScreen.tsx`, `mobile/src/screens/auth/LoginScreen.tsx`, `mobile/src/screens/auth/RegisterScreen.tsx`, `mobile/src/screens/profile/ProfileScreen.tsx`, `mobile/src/screens/auth/__tests__/LoginScreen.test.tsx`, `mobile/src/screens/auth/__tests__/RegisterScreen.test.tsx`
- Modify: `mobile/App.tsx`, `mobile/index.ts`, `README.md`

**Interfaces:**
- Consumes: `useAuth()` (Task 4); componentes y tema (Task 3); `validateEmail/validatePassword/validateName`, `showToast`, `errorMessage` (Task 4).
- Produces (las fases 2–4 agregan pantallas aquí):
```ts
// mobile/src/navigation/types.ts
import type { NavigatorScreenParams } from '@react-navigation/native';

export type AuthStackParamList = { Login: undefined; Register: undefined };

export type DrawerParamList = {
  Dashboard: undefined;
  Schedule: undefined;
  Groups: undefined;
  Profile: undefined;
};

// Pantallas que se apilan sobre el drawer (sin menú). Se completan en fases siguientes.
export type AppStackParamList = {
  Main: NavigatorScreenParams<DrawerParamList>;
};

declare global {
  namespace ReactNavigation {
    interface RootParamList extends AppStackParamList, AuthStackParamList {}
  }
}
```

- [ ] **Step 1: Tests que fallan**

`mobile/src/screens/auth/__tests__/LoginScreen.test.tsx`:
```tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { ApiError } from '../../../api/client';
import { LoginScreen } from '../LoginScreen';

const login = jest.fn();
jest.mock('../../../context/AuthContext', () => ({ useAuth: () => ({ login }) }));
const navigation = { navigate: jest.fn() } as any;

beforeEach(() => login.mockReset());

it('valida los campos antes de llamar al servidor', () => {
  render(<LoginScreen navigation={navigation} route={{} as any} />);
  fireEvent.press(screen.getByText('Iniciar sesión'));
  expect(screen.getByText('El correo es requerido')).toBeTruthy();
  expect(screen.getByText('La contraseña es requerida')).toBeTruthy();
  expect(login).not.toHaveBeenCalled();
});

it('editar un campo borra su error', () => {
  render(<LoginScreen navigation={navigation} route={{} as any} />);
  fireEvent.press(screen.getByText('Iniciar sesión'));
  fireEvent.changeText(screen.getByPlaceholderText('tucorreo@ejemplo.com'), 'a');
  expect(screen.queryByText('El correo es requerido')).toBeNull();
});

it('muestra el error del servidor', async () => {
  login.mockRejectedValue(new ApiError(401, 'INVALID_CREDENTIALS', 'Correo o contraseña incorrectos.'));
  render(<LoginScreen navigation={navigation} route={{} as any} />);
  fireEvent.changeText(screen.getByPlaceholderText('tucorreo@ejemplo.com'), 'ana@correo.com');
  fireEvent.changeText(screen.getByPlaceholderText('Al menos 8 caracteres'), 'contrasena-segura');
  fireEvent.press(screen.getByText('Iniciar sesión'));
  await waitFor(() => expect(screen.getByText('Correo o contraseña incorrectos.')).toBeTruthy());
  expect(login).toHaveBeenCalledWith('ana@correo.com', 'contrasena-segura');
});

it('"Regístrate" navega al registro', () => {
  render(<LoginScreen navigation={navigation} route={{} as any} />);
  fireEvent.press(screen.getByText('Regístrate'));
  expect(navigation.navigate).toHaveBeenCalledWith('Register');
});
```

`mobile/src/screens/auth/__tests__/RegisterScreen.test.tsx`:
```tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { RegisterScreen } from '../RegisterScreen';

const register = jest.fn();
jest.mock('../../../context/AuthContext', () => ({ useAuth: () => ({ register }) }));
const navigation = { goBack: jest.fn() } as any;

it('valida nombre, correo y contraseña', () => {
  render(<RegisterScreen navigation={navigation} route={{} as any} />);
  fireEvent.press(screen.getByText('Registrarme'));
  expect(screen.getByText('El nombre es requerido')).toBeTruthy();
  expect(screen.getByText('El correo es requerido')).toBeTruthy();
  expect(screen.getByText('La contraseña es requerida')).toBeTruthy();
  expect(register).not.toHaveBeenCalled();
});

it('registra con datos válidos', async () => {
  register.mockResolvedValue(undefined);
  render(<RegisterScreen navigation={navigation} route={{} as any} />);
  fireEvent.changeText(screen.getByPlaceholderText('Ana Pérez'), 'Ana');
  fireEvent.changeText(screen.getByPlaceholderText('tucorreo@ejemplo.com'), 'ana@correo.com');
  fireEvent.changeText(screen.getByPlaceholderText('Al menos 8 caracteres'), 'contrasena-segura');
  fireEvent.press(screen.getByText('Registrarme'));
  await waitFor(() => expect(register).toHaveBeenCalledWith('Ana', 'ana@correo.com', 'contrasena-segura'));
});

it('"Inicia sesión" vuelve atrás', () => {
  render(<RegisterScreen navigation={navigation} route={{} as any} />);
  fireEvent.press(screen.getByText('Inicia sesión'));
  expect(navigation.goBack).toHaveBeenCalled();
});
```

- [ ] **Step 2: Ejecutar y ver que falla** — `npm test -w mobile` → FAIL.

- [ ] **Step 3: Implementar pantallas de acceso** siguiendo UI spec §2.1 y §2.2 al pie de la letra, con estos cambios deliberados:
  - Placeholder de contraseña «Al menos 8 caracteres» y regla de 8 (Global Constraints).
  - Se elimina la «Nota de desarrollo» de Login (ya hay servidor real).
  - Error de servidor: `ErrorBanner` con `errorMessage(e)`, se limpia al reintentar.
  - Tras éxito no se navega a mano: `RootNavigator` cambia de stack al pasar `status` a `signedIn`. Se llama `showToast('¡Sesión iniciada con éxito! Bienvenido a HueckoApp.')`.
  - Estado local por pantalla (`useState`) para campos, errores por campo, `loading` y `serverError`. Validar al pulsar el botón; `onChangeText` de cada campo borra su error.
  - «Siguiente» en el teclado enfoca el siguiente campo (`inputRef` + `returnKeyType="next"`); en el último, `returnKeyType="done"` y `onSubmitEditing` envía.
  - Contenedor: `KeyboardAvoidingView` (`behavior="padding"` en iOS, `undefined` en Android) + `ScrollView` con `keyboardShouldPersistTaps="handled"` + `SafeAreaView` de `react-native-safe-area-context`.
  - Firma: `export function LoginScreen({ navigation }: NativeStackScreenProps<AuthStackParamList, 'Login'>)` (y análogo en Register). «Regístrate» → `navigation.navigate('Register')`; Register: flecha atrás (a11y «Volver al inicio de sesión») e «Inicia sesión» → `navigation.goBack()`.
  - Correo: `keyboardType="email-address"`, `autoCapitalize="none"`, `autoComplete="email"`, `textContentType="emailAddress"`. Contraseña: `autoComplete="password"` en login y `"new-password"` en registro.

- [ ] **Step 4: Implementar Perfil** según UI spec §2.12: título «Mi perfil»; tarjeta con `Avatar` 48 (`categoryColor(0)`, inicial del nombre o «H»), «Sesión iniciada», nombre (`titleMedium`) y correo; `SecondaryButton` «Cerrar sesión» con `color={colors.error}` que llama `logout()`; tarjeta «Próximamente» (fondo y borde `surfaceContainer`). Sin diálogo de confirmación (igual que Kotlin).

- [ ] **Step 5: Implementar navegación**

`mobile/src/screens/SplashScreen.tsx`: pantalla centrada con fondo `colors.background`, marca «H» (cuadrado 52, `primary`, radio 12) y `ActivityIndicator` `primary`.

`mobile/src/screens/PlaceholderScreen.tsx`: `EmptyState` con `title` e `icon` recibidos por props y descripción «Esta sección llega en la próxima fase de la migración.».

`mobile/src/navigation/AppDrawer.tsx`:
```tsx
import { MaterialIcons } from '@expo/vector-icons';
import {
  createDrawerNavigator,
  DrawerContentScrollView,
  DrawerItem,
  DrawerItemList,
  type DrawerContentComponentProps,
} from '@react-navigation/drawer';
import { StyleSheet, Text, View } from 'react-native';

import { Avatar } from '../components';
import { useAuth } from '../context/AuthContext';
import { PlaceholderScreen } from '../screens/PlaceholderScreen';
import { ProfileScreen } from '../screens/profile/ProfileScreen';
import { categoryColor, colors, typography } from '../theme';
import type { DrawerParamList } from './types';

const Drawer = createDrawerNavigator<DrawerParamList>();

const icon = (name: keyof typeof MaterialIcons.glyphMap) => ({ color, size }: { color: string; size: number }) => (
  <MaterialIcons name={name} color={color} size={size} />
);

function DrawerContent(props: DrawerContentComponentProps) {
  const { user, logout } = useAuth();
  return (
    <DrawerContentScrollView {...props}>
      <View style={styles.header}>
        <Avatar name={user?.name ?? 'H'} color={categoryColor(0)} size={48} />
        <Text style={styles.name}>{user?.name}</Text>
        <Text style={styles.email}>{user?.email}</Text>
      </View>
      <DrawerItemList {...props} />
      <DrawerItem
        label="Cerrar sesión"
        labelStyle={{ color: colors.error }}
        icon={({ size }) => <MaterialIcons name="logout" size={size} color={colors.error} />}
        onPress={() => void logout()}
      />
    </DrawerContentScrollView>
  );
}

export function AppDrawer() {
  return (
    <Drawer.Navigator
      initialRouteName="Dashboard"
      backBehavior="initialRoute"
      drawerContent={(props) => <DrawerContent {...props} />}
      screenOptions={{
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.onSurface,
        headerShadowVisible: false,
        drawerActiveTintColor: colors.onPrimaryContainer,
        drawerActiveBackgroundColor: colors.primaryContainer,
        drawerInactiveTintColor: colors.onSurfaceVariant,
        drawerStyle: { backgroundColor: colors.surface },
        sceneStyle: { backgroundColor: colors.surface },
      }}
    >
      <Drawer.Screen name="Dashboard" options={{ title: 'Inicio', drawerIcon: icon('dashboard') }}>
        {() => <PlaceholderScreen title="Inicio" icon="dashboard" />}
      </Drawer.Screen>
      <Drawer.Screen name="Schedule" options={{ title: 'Horario', drawerIcon: icon('calendar-month') }}>
        {() => <PlaceholderScreen title="Mi horario" icon="calendar-month" />}
      </Drawer.Screen>
      <Drawer.Screen name="Groups" options={{ title: 'Grupos', drawerIcon: icon('group') }}>
        {() => <PlaceholderScreen title="Mis grupos" icon="group" />}
      </Drawer.Screen>
      <Drawer.Screen name="Profile" component={ProfileScreen} options={{ title: 'Perfil', drawerIcon: icon('person-outline') }} />
    </Drawer.Navigator>
  );
}

const styles = StyleSheet.create({
  header: { padding: 16, paddingTop: 8, gap: 4, marginBottom: 8 },
  name: { ...typography.titleMedium, color: colors.onSurface, marginTop: 8 },
  email: { ...typography.bodySmall, color: colors.onSurfaceVariant },
});
```

`mobile/src/navigation/RootNavigator.tsx`:
```tsx
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { useAuth } from '../context/AuthContext';
import { LoginScreen } from '../screens/auth/LoginScreen';
import { RegisterScreen } from '../screens/auth/RegisterScreen';
import { SplashScreen } from '../screens/SplashScreen';
import { colors } from '../theme';
import { AppDrawer } from './AppDrawer';
import type { AppStackParamList, AuthStackParamList } from './types';

const AuthStack = createNativeStackNavigator<AuthStackParamList>();
const AppStack = createNativeStackNavigator<AppStackParamList>();

// Cambiar de stack según la sesión borra el historial: tras cerrar sesión no se puede volver atrás.
export function RootNavigator() {
  const { status } = useAuth();
  if (status === 'loading') return <SplashScreen />;

  if (status === 'signedOut') {
    return (
      <AuthStack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.surface } }}>
        <AuthStack.Screen name="Login" component={LoginScreen} />
        <AuthStack.Screen name="Register" component={RegisterScreen} />
      </AuthStack.Navigator>
    );
  }

  return (
    <AppStack.Navigator screenOptions={{ contentStyle: { backgroundColor: colors.surface } }}>
      <AppStack.Screen name="Main" component={AppDrawer} options={{ headerShown: false }} />
    </AppStack.Navigator>
  );
}
```

`mobile/index.ts` — primera línea: `import 'react-native-gesture-handler';` (requerido por el drawer).

`mobile/App.tsx`:
```tsx
import { DefaultTheme, NavigationContainer } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AuthProvider } from './src/context/AuthContext';
import { RootNavigator } from './src/navigation/RootNavigator';
import { colors } from './src/theme';

const navigationTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: colors.primary,
    background: colors.surface,
    card: colors.surface,
    text: colors.onSurface,
    border: colors.outlineVariant,
  },
};

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AuthProvider>
          <NavigationContainer theme={navigationTheme}>
            <RootNavigator />
          </NavigationContainer>
        </AuthProvider>
        <StatusBar style="dark" />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
```

- [ ] **Step 6: Verificar**
  - `npm test` (raíz: backend + mobile) → verde.
  - `npm run typecheck` → verde.
  - `cd mobile && npx expo export --platform android --output-dir <tmp>` → empaqueta sin errores (borrar la salida después).
  - `cd mobile && npx expo-doctor` → sin problemas.

- [ ] **Step 7: README** — marcar `[x] **Fase 1**` en la hoja de ruta y añadir en «Cómo levantar el proyecto» que el primer usuario se crea desde la pantalla de registro.

- [ ] **Step 8: Commit** — `feat(mobile): navegación (stack + drawer) y pantallas de login, registro y perfil`
