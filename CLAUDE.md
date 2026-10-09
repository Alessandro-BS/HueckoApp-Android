# HueckoApp — guía para agentes de IA

Monorepo con npm workspaces. Instala siempre desde la raíz (`npm install`); hay un solo `package-lock.json`.

| Carpeta | Qué es |
|---|---|
| `mobile/` | App Expo (React Native + TypeScript) |
| `backend/` | API REST Express 5 + TypeScript |
| `shared/` | `@hueckoapp/shared`: solo tipos (`index.d.ts`) del contrato, importados con `import type` |
| `docs/api.md` | Contrato de la API. Se actualiza en el mismo PR que cambia un endpoint |
| `legacy-android/` | App Kotlin original, congelada en `v1.0.0`. Solo de referencia; no se modifica |

## Reglas generales

- **Git flow:** `feature/*` sale de `develop` y vuelve por PR; `release/*` va a `main` con tag semver; nunca commits directos en `main`/`develop`.
- Commits convencionales en español: `feat(mobile): ...`, `fix(backend): ...`.
- Antes de dar algo por terminado: `npm run typecheck` y `npm test` desde la raíz.
- Ningún secreto en la app: la clave de Gemini, el `JWT_SECRET` y la `DATABASE_URL` (Neon) viven solo en `backend/.env`.

## mobile/ (Expo)

Expo cambia mucho entre SDKs: no confíes en lo que recuerdas. Mira la versión de `expo` en `mobile/package.json` y consulta `https://docs.expo.dev/versions/v<major>.0.0/` o `https://docs.expo.dev/llms.txt`.

- Instala paquetes con `npx expo install <paquete>` dentro de `mobile/` (elige versiones compatibles con el SDK).
- **Navegación con React Navigation** (no Expo Router), porque lo exige el curso: `native-stack`, `drawer`, `material-top-tabs`. Además `bottom-tabs` para la barra inferior (Inicio, Horario, Grupos), que vive dentro del drawer: el drawer queda para Perfil, Administración y Cerrar sesión.
- Estructura: `src/navigation/` navegadores, `src/screens/` pantallas, `src/components/` UI reutilizable, `src/hooks/` hooks propios, `src/context/` providers, `src/api/` cliente axios, `src/theme/` colores.
- El token JWT se guarda solo en `expo-secure-store`, nunca en AsyncStorage.
- No se crean ni editan `android/`/`ios/` a mano: se generan (config en `app.json` y plugins).
- Librerías con código nativo que no vienen en Expo Go requieren un development build (`npx expo run:android` o `eas build --profile development`).
- Diagnóstico: `npx expo-doctor`, `npx expo install --fix`.

## backend/ (Express)

- `src/app.ts` crea la app sin abrir puerto (así se prueba con Supertest); `src/index.ts` la levanta.
- Errores con `ApiError(status, code, message)`; el middleware los devuelve con la forma `{ error: { code, message, details } }` del contrato.
- Validación de entradas y del entorno con zod.
- Base de datos PostgreSQL: Neon en producción (`DATABASE_URL`, driver `pg`) y PGlite en desarrollo y tests (sin instalar nada; un solo proceso, detén el servidor antes de `seed`/`make-admin`). Ambos van detrás de la interfaz `Db` de `src/db/db.ts`, con SQL parametrizado (`$1`).
- Tests con Vitest en `backend/test/`.
