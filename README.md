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

> **Zona horaria:** `TZ` en `backend/.env` (por defecto `America/Lima`) es la zona en la que el servidor calcula la fecha y hora de los planes confirmados (`scheduledAt` y `scheduledDate`). En el despliegue hay que fijarla siempre: sin ella el servidor usa la suya (normalmente UTC) y los planes caerían en otra fecha u hora.

> **Huecko IA (opcional):** pon tu clave de Gemini en `GEMINI_API_KEY` de `backend/.env` (se consigue en https://aistudio.google.com/apikey). El modelo se cambia con `GEMINI_MODEL` (por defecto `gemini-3.5-flash-lite`, que responde en pocos segundos); si está saturado, sin cuota, no existe o tarda demasiado, el servidor reintenta una vez con `GEMINI_FALLBACK_MODEL` (por defecto `gemini-3.5-flash`). `GEMINI_THINKING_LEVEL` (por defecto `low`) limita el razonamiento del modelo para que responda más rápido. Estos valores caben en el plan gratuito de Gemini (`gemini-3.8-flash` solo permite 20 peticiones al día y suele estar saturado). Sin clave, la IA responde con datos de ejemplo y la app muestra «Modo demostración». La clave nunca va en la app.

### 2b. Datos de ejemplo (opcional)
```bash
npm run seed -w backend   # usuarios, grupos y horarios de prueba; se puede repetir sin duplicar nada
```

| Correo | Contraseña | Qué tiene |
|---|---|---|
| `test@test.com` | `password123` | Administra «Proyecto Integrador» (código `PROY2026`) junto con Ana. Clases el lunes 08–10 y el miércoles 14–16. Creó «Reunión de avance del proyecto» (confirmada, con un imprevisto de Ana: sale el aviso en Inicio) |
| `ana@test.com` | `password123` | Miembro de «Proyecto Integrador». Bloques el lunes, el miércoles y el viernes. Propuso «Repaso antes de la entrega» (en votación, con su voto) |
| `carlos@test.com` | `password123` | Único miembro de «Amigos de la Uni»: prueba «Unirme» con el código `HUECKO123` |

### 3. App móvil (en otra terminal)
```bash
cp mobile/.env.example mobile/.env     # si usas celular físico, pon la IP de tu PC en EXPO_PUBLIC_API_URL
npm run mobile                         # escanea el QR con Expo Go, o presiona "a" para el emulador
```

> **Primer usuario:** créalo desde la pantalla de registro («Regístrate») o carga los datos de ejemplo del paso 2b.

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
| **Hooks** | `useState`/`useEffect`, `AuthContext` y hooks propios en `mobile/src/hooks/`: genéricos (`useResource`, `useAction`, `useVoteToggle`, `useRefreshOnFocus`, `useRefreshErrorToast`) y de dominio (`useSchedule`, `useGroups`, `useGroup`, `useAvailability`, `useProposals`, `useProposal`, `useDashboard`, `useCurrentLocation`, `useScheduleOcr`, `useProposalDraft`, `useAiSuggestions`, `useVotingSummary`, `useAiStatus`) |
| **Seguridad en Android** | Token JWT en `expo-secure-store`, permisos en tiempo de ejecución, contraseñas con bcrypt y claves de IA solo en el backend |
| **Localización** | `expo-location` en `mobile/src/hooks/useCurrentLocation.ts`: permiso de ubicación en primer plano (texto del permiso en el plugin de `app.json`), posición actual y geocodificación inversa para el lugar de un plan; «Abrir en el mapa» con `Linking` (`geo:` en Android) |
| **Consumo de APIs REST** | Cliente `axios` en `mobile/src/api/` contra el backend Express |
| **Navegación** | `native-stack` (flujos), `drawer` (menú principal) y `material-top-tabs` (pestañas del grupo) |
| **Cámara y galería** | `expo-image-picker` en `mobile/src/utils/scheduleImage.ts`: permiso de cámara en tiempo de ejecución (textos en el plugin de `app.json`), selector de fotos del sistema y validación de tipo y tamaño antes de subir |
| **Inteligencia artificial** | Google Gemini **solo desde el backend** (`backend/src/ai/`, SDK `@google/genai`): OCR de horarios, borrador de propuesta a partir de una frase, ideas de plan para los huecos del grupo y resumen de votación. Respuestas validadas con zod, límite por usuario y modo demostración sin clave |

## Hoja de ruta

- [x] **Fase 0** — Monorepo, base de `mobile/` y `backend/`, contrato de la API
- [x] **Fase 1** — Autenticación (JWT + SecureStore) y navegación completa
- [x] **Fase 2** — Grupos, horarios y cruce de disponibilidad
- [x] **Fase 3** — Propuestas, votación y ubicación
- [x] **Fase 4** — IA: OCR de horarios y ayuda en votaciones
- [ ] **Fase 5** — Tests, despliegue del backend (con `TZ` fijada, ver «Zona horaria») y APK con EAS Build

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
