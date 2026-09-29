# HueckoApp 🕒 — Coordinación de horarios entre amigos

HueckoApp centraliza la disponibilidad de grupos de amigos, compañeros de universidad o de trabajo: cruza agendas automáticamente, permite votar planes y gestiona imprevistos. La IA ayuda a leer horarios desde una foto y en las votaciones.

## Estructura del repositorio

| Carpeta | Qué contiene | Tecnología |
|---|---|---|
| [`mobile/`](mobile/) | App móvil | React Native (Expo) + TypeScript, React Navigation |
| [`backend/`](backend/) | API REST, base de datos e integración con IA | Node.js + Express + TypeScript |
| [`shared/`](shared/) | Tipos del contrato, usados por la app y el backend (`@hueckoapp/shared`) | TypeScript |
| [`docs/`](docs/) | Contrato de la API y documentación | Markdown |
| [`legacy-android/`](legacy-android/) | Versión anterior nativa (congelada en `v1.0.0`) | Kotlin + Jetpack Compose |

Es un **monorepo con npm workspaces**: un solo `npm install` en la raíz instala todo, con un único `package-lock.json`.

El **contrato de la API** ([`docs/api.md`](docs/api.md)) es el acuerdo entre la app y el backend. Cualquier cambio de endpoint se actualiza ahí en el mismo PR.

## Requisitos

- [Node.js](https://nodejs.org/) 22.13 o superior y npm
- Git
- **Expo Go** en tu celular, o un emulador de Android Studio

## Cómo levantar el proyecto

### 1. Instalar dependencias (una sola vez, desde la raíz)
```bash
npm install
```

### 2. Backend
```bash
cp backend/.env.example backend/.env   # completa JWT_SECRET (el archivo explica cómo generarlo)
npm run backend                        # http://localhost:3000/api/health
```

### 3. App móvil (en otra terminal)
```bash
cp mobile/.env.example mobile/.env     # si usas celular físico, pon la IP de tu PC en EXPO_PUBLIC_API_URL
npm run mobile                         # escanea el QR con Expo Go, o presiona "a" para el emulador
```

> **Primer usuario:** no hay usuarios precargados; el primero se crea desde la pantalla de registro de la app («Regístrate»).

> **Importante:** en el emulador de Android, `localhost` es el propio emulador. Para llegar al backend de tu PC se usa `10.0.2.2`. En un celular físico, usa la IP de tu PC en la red Wi-Fi (y que ambos estén en la misma red).

### Comandos útiles
| Dónde | Comando | Para qué |
|---|---|---|
| raíz | `npm test` | Tests del backend (Vitest + Supertest) |
| raíz | `npm run typecheck` | Revisar tipos de backend y mobile |
| `mobile/` | `npx expo install <paquete>` | Instalar paquetes (elige la versión compatible con el SDK; **no uses `npm install`** para librerías nativas) |
| `mobile/` | `npx expo-doctor` | Diagnosticar dependencias |

## Temas del curso y dónde se aplican

| Tema | Dónde |
|---|---|
| **Hooks** | `useState`/`useEffect`, `AuthContext` y hooks propios (`useGroups`, `useSchedule`, `useProposals`) en `mobile/src/hooks/` |
| **Seguridad en Android** | Token JWT en `expo-secure-store`, permisos en tiempo de ejecución, contraseñas con bcrypt y claves de IA solo en el backend |
| **Localización** | `expo-location` para la ubicación de los planes |
| **Consumo de APIs REST** | Cliente `axios` en `mobile/src/api/` contra el backend Express |
| **Navegación** | `native-stack` (flujos), `drawer` (menú principal) y `material-top-tabs` (pestañas del grupo) |

## Hoja de ruta

- [x] **Fase 0** — Monorepo, base de `mobile/` y `backend/`, contrato de la API
- [x] **Fase 1** — Autenticación (JWT + SecureStore) y navegación completa
- [ ] **Fase 2** — Grupos, horarios y cruce de disponibilidad
- [ ] **Fase 3** — Propuestas, votación y ubicación
- [ ] **Fase 4** — IA: OCR de horarios y ayuda en votaciones
- [ ] **Fase 5** — Tests, despliegue del backend y APK con EAS Build

## Flujo de trabajo (git flow)

| Rama | Uso |
|---|---|
| `main` | Solo versiones publicadas. Cada merge lleva un tag (`v1.0.0`, `v2.0.0`...) |
| `develop` | Integración. Aquí se juntan las funciones terminadas |
| `feature/<nombre>` | Una función. Sale de `develop` y vuelve por PR a `develop` |
| `release/<versión>` | Preparar una versión. Sale de `develop`, va por PR a `main` y se vuelve a unir a `develop` |
| `hotfix/<nombre>` | Arreglo urgente en producción. Sale de `main` y vuelve a `main` y `develop` |

Reglas:
- Nunca se hace commit directo en `main` ni en `develop`: todo entra por Pull Request.
- Nombres de rama con prefijo del área cuando ayude: `feature/backend-auth`, `feature/mobile-navigation`.
- Commits en formato convencional: `feat(mobile): ...`, `fix(backend): ...`, `docs: ...`, `chore: ...`.
- Antes de abrir un PR: tests y `typecheck` en verde.

---
*Este proyecto sigue las metodologías de gestión de requerimientos (REQM) y Scrum para asegurar la trazabilidad y calidad del software.*
