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
- Nada para la base de datos: en desarrollo el backend usa [PGlite](https://pglite.dev) (PostgreSQL dentro del propio proceso, sin instalar Postgres ni Docker); en producción, [Neon](https://neon.com) (ver «Base de datos en producción»)
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

> **Base de datos local:** con `DATABASE_URL` vacía (lo normal en desarrollo), el backend guarda todo en PostgreSQL con PGlite, en `backend/data/pglite` (se crea sola al arrancar, con todas las tablas). Para empezar de cero, detén el servidor y borra esa carpeta. PGlite admite **un solo proceso**: detén el servidor antes de `npm run seed -w backend` o `npm run make-admin -w backend` (si no, lo avisan: «La base local … está abierta por otro proceso»). El archivo `backend/data/hueckoapp.db` de la versión con SQLite ya no se usa y se puede borrar (sus datos no se copian: la semilla vuelve a crear los de ejemplo).

> **Zona horaria:** `TZ` en `backend/.env` (por defecto `America/Lima`) es la zona en la que el servidor calcula la fecha y hora de los planes confirmados (`scheduledAt` y `scheduledDate`). En el despliegue hay que fijarla siempre: sin ella el servidor usa la suya (normalmente UTC) y los planes caerían en otra fecha u hora.

> **Despliegue detrás de un proxy:** en Render, Railway o detrás de nginx pon `TRUST_PROXY=1` (el número de proxies) en el `.env` del servidor; si no, todas las peticiones parecen venir de la misma IP y el límite de intentos de login (`LOGIN_RATE_LIMIT`) y de registro (`REGISTER_RATE_LIMIT`) bloquearía a todos a la vez.

> **Huecko IA (opcional):** pon tu clave de Gemini en `GEMINI_API_KEY` de `backend/.env` (se consigue en https://aistudio.google.com/apikey). El modelo se cambia con `GEMINI_MODEL` (por defecto `gemini-3.5-flash-lite`, que responde en pocos segundos); si está saturado, sin cuota, no existe o tarda demasiado, el servidor reintenta una vez con `GEMINI_FALLBACK_MODEL` (por defecto `gemini-3.5-flash`). `GEMINI_THINKING_LEVEL` (por defecto `low`) limita el razonamiento del modelo para que responda más rápido. Estos valores caben en el plan gratuito de Gemini (`gemini-3.8-flash` solo permite 20 peticiones al día y suele estar saturado). Sin clave, la IA responde con datos de ejemplo y la app muestra «Modo demostración». La clave nunca va en la app.

### Base de datos en producción (Neon)
1. Crea un proyecto en [Neon](https://console.neon.tech) con **Postgres 18** (la versión por defecto; hace falta 16 o posterior), **en la misma región que el servicio de Render** (o la más cercana): cada consulta es un viaje de red y algunas pantallas (p. ej. los informes de administración) hacen una docena seguidas.
2. En **Connect**, copia la cadena de conexión (la *pooled* sirve) y cambia `sslmode=require` por `sslmode=verify-full` (mismo cifrado, sin el aviso de seguridad de `pg`).
3. Ponla en `DATABASE_URL` del entorno del servidor (nunca en el repo ni en la app). Con `NODE_ENV=production` el servidor no arranca sin ella. Las consultas tienen un tiempo máximo (en `backend/src/db/pg-driver.ts`): Postgres cancela a los 15 s una sentencia dentro de una transacción (`SET LOCAL statement_timeout`, compatible con la conexión *pooled*) y el servidor deja de esperar cualquier consulta a los 20 s.
4. Al arrancar, el servidor crea o actualiza las tablas (migraciones en `backend/src/db/migrations.ts`, anotadas en `schema_migrations`).
5. Primer administrador: `npm run make-admin -w backend -- <correo>` con la `DATABASE_URL` de producción **solo para ese comando**, en el entorno de la terminal; **nunca la escribas en `backend/.env`** (así ni `npm run backend` ni la semilla tocan producción por descuido). Una variable ya definida en la terminal gana a `backend/.env`:
   - bash: `DATABASE_URL='postgresql://…' npm run make-admin -w backend -- <correo>`
   - PowerShell: `$env:DATABASE_URL='postgresql://…'; npm run make-admin -w backend -- <correo>; Remove-Item Env:DATABASE_URL`

   La consola solo abre una base que ya tenga el esquema. La semilla (`npm run seed -w backend`) es solo para desarrollo: con una `DATABASE_URL` que no apunte a esta máquina se niega (salvo `-- --allow-remote`, para una base de pruebas), porque crea cuentas con contraseña conocida, una de ellas ADMIN.
6. Antes de desplegar en Render, arranca el servidor una vez contra un proyecto Neon de pruebas (con su `DATABASE_URL` real) y comprueba salud, inicio de sesión, Inicio y `make-admin`: los tests no usan red, así que Neon no se prueba automáticamente.

### 2b. Datos de ejemplo (opcional)
```bash
npm run seed -w backend   # usuarios, grupos, horarios y dos planes con fechas de hoy; se puede repetir sin duplicar nada (renueva los planes)
```

| Correo | Contraseña | Qué tiene |
|---|---|---|
| `test@test.com` | `password123` | Administra «Proyecto Integrador» (código `PROY2026`) junto con Ana. Clases el lunes 08–10 y el miércoles 14–16. Creó «Reunión de avance del proyecto» (confirmada para dentro de 2 días a las 11:00, con un imprevisto de Ana: sale el aviso en Inicio) |
| `ana@test.com` | `password123` | Miembro de «Proyecto Integrador». Bloques el lunes, el miércoles y el viernes. Propuso «Repaso antes de la entrega» (en votación hasta mañana a las 20:00, con su voto) |
| `carlos@test.com` | `password123` | Único miembro de «Amigos de la Uni»: prueba «Unirme» con el código `HUECKO123` |
| `admin@test.com` | `password123` | Administración de la app (rol `ADMIN`): ve «Administración» en el menú. No pertenece a ningún grupo |

### 3. App móvil (en otra terminal)
```bash
cp mobile/.env.example mobile/.env     # si usas celular físico, pon la IP de tu PC en EXPO_PUBLIC_API_URL
npm run mobile                         # escanea el QR con Expo Go, o presiona "a" para el emulador
```

> **Primer usuario:** créalo desde la pantalla de registro («Regístrate») o carga los datos de ejemplo del paso 2b.

> **Importante:** en el emulador de Android, `localhost` es el propio emulador. Para llegar al backend de tu PC se usa `10.0.2.2`. En un celular físico, usa la IP de tu PC en la red Wi-Fi (y que ambos estén en la misma red).

### Administración de la app
Una cuenta con rol `ADMIN` ve **«Administración»** en el menú lateral: estadísticas, informes (PDF y CSV), usuarios, grupos y el registro de acciones. Nadie se hace administrador al registrarse ni desde la API: el rol se da (o se quita) **desde la consola del servidor**:
```bash
npm run make-admin -w backend -- ana@test.com            # dar el rol
npm run make-admin -w backend -- ana@test.com --revoke   # quitarlo
```
Usa la base de `backend/.env` (`DATABASE_URL` o, si está vacía, PGlite en `PGLITE_DATA_DIR`) y solo abre una que ya exista con el esquema de HueckoApp (si la carpeta o la URL están mal, lo dice en vez de crear una vacía). Con la base local, detén antes el servidor: PGlite admite un solo proceso. No deja la app sin ningún administrador activo y queda en el registro de acciones como «Consola del servidor». La persona ve (o deja de ver) el menú **al volver a la app (primer plano), al reabrirla o al iniciar sesión**; si pierde el rol mientras usa «Administración», la app lo detecta en la siguiente petición y sale de esas pantallas. Con la semilla (paso 2b) ya existe `admin@test.com`.

#### Prueba manual en un celular (pendiente antes de `release/2.0.0`)
Los gráficos, el PDF, el CSV y el menú compartir solo se prueban con mocks en Jest. Antes de publicar, con Expo Go:
- [ ] Entrar como `admin@test.com` y abrir las 5 pestañas de «Administración» (etiquetas de los gráficos legibles).
- [ ] En «Informes», exportar PDF y CSV y abrir los dos (nombre `informe-hueckoapp_<desde>_<hasta>`, tildes bien en Excel).
- [ ] Suspender a `ana@test.com`: su sesión se cierra con el aviso.
- [ ] Quitar y dar el rol a alguien: el menú cambia al volver a la app.

### Comandos útiles
| Dónde | Comando | Para qué |
|---|---|---|
| raíz | `npm test` | Tests del backend (Vitest + Supertest, cada test con su base PGlite en memoria: sin red ni Postgres instalado) y de mobile (Jest). Fijan ellos mismos `TZ=America/Lima` (`backend/vitest.config.mts` y `mobile/jest.globalSetup.js`): pasan igual en cualquier PC o CI, sin prefijos en la terminal |
| raíz | `npm run typecheck` | Revisar tipos de backend y mobile |
| `mobile/` | `npx expo install <paquete>` | Instalar paquetes (elige la versión compatible con el SDK; **no uses `npm install`** para librerías nativas) |
| `mobile/` | `npx expo-doctor` | Diagnosticar dependencias |
| raíz | `npm run make-admin -w backend -- <correo> [--revoke]` | Dar o quitar el rol de administrador |
| raíz | `npm run seed -w backend` | Datos de ejemplo en la base local (con el servidor detenido) |

## Temas del curso y dónde se aplican

| Tema | Dónde |
|---|---|
| **Hooks** | `useState`/`useEffect`, `AuthContext` y hooks propios en `mobile/src/hooks/`: genéricos (`useResource`, `useAction`, `useVoteToggle`, `useRefreshOnFocus`, `useRefreshErrorToast`, `usePagedList`) y de dominio (`useSchedule`, `useGroups`, `useGroup`, `useAvailability`, `useProposals`, `useProposal`, `useDashboard`, `useCurrentLocation`, `useScheduleOcr`, `useProposalDraft`, `useAiSuggestions`, `useVotingSummary`, `useAiStatus`, `useAdminStats`, `useAdminReport`, `useAdminUsers`, `useAdminGroups`, `useAdminAudit`, `useAdminUser`, `useAdminGroup`) |
| **Seguridad en Android** | Token JWT en `expo-secure-store`, permisos en tiempo de ejecución, contraseñas con bcrypt y claves de IA solo en el backend. **Autorización por roles** (`USER`/`ADMIN`): el servidor lee rol y estado de la base en cada petición (`requireAuth` y `requireAdmin` en `backend/src/auth/require-auth.ts`), nadie se hace administrador por la API (solo `npm run make-admin`), una cuenta suspendida queda fuera al instante y cada acción de administración queda en un registro |
| **Localización** | `expo-location` en `mobile/src/hooks/useCurrentLocation.ts`: permiso de ubicación en primer plano (texto del permiso en el plugin de `app.json`), posición actual y geocodificación inversa para el lugar de un plan; «Abrir en el mapa» con `Linking` (`geo:` en Android) |
| **Consumo de APIs REST** | Cliente `axios` en `mobile/src/api/` contra el backend Express |
| **Base de datos** | PostgreSQL: Neon en producción (driver `pg` con un pool de conexiones) y PGlite en desarrollo y en los tests, detrás de una misma interfaz (`backend/src/db/db.ts`) con consultas parametrizadas, transacciones reales y migraciones versionadas (`schema_migrations`) |
| **Navegación** | `native-stack` (flujos), `drawer` (menú principal; «Administración» solo aparece con rol `ADMIN`) y `material-top-tabs` (pestañas del grupo y del panel de administración) |
| **Cámara y galería** | `expo-image-picker` en `mobile/src/utils/scheduleImage.ts`: permiso de cámara en tiempo de ejecución (textos en el plugin de `app.json`), selector de fotos del sistema y validación de tipo y tamaño antes de subir |
| **Inteligencia artificial** | Google Gemini **solo desde el backend** (`backend/src/ai/`, SDK `@google/genai`): OCR de horarios, borrador de propuesta a partir de una frase, ideas de plan para los huecos del grupo y resumen de votación. Respuestas validadas con zod, límite por usuario y modo demostración sin clave |
| **Gráficos e informes** | Panel «Administración» (`mobile/src/screens/admin/`): gráficos con `react-native-gifted-charts` (sobre `react-native-svg`), informe en PDF generado en el teléfono con `expo-print` y CSV escrito con `expo-file-system`, ambos compartidos con `expo-sharing`. Los números los calcula el servidor (`backend/src/admin/stats.ts`), en su zona horaria |

## Hoja de ruta

- [x] **Fase 0** — Monorepo, base de `mobile/` y `backend/`, contrato de la API
- [x] **Fase 1** — Autenticación (JWT + SecureStore) y navegación completa
- [x] **Fase 2** — Grupos, horarios y cruce de disponibilidad
- [x] **Fase 3** — Propuestas, votación y ubicación
- [x] **Fase 4** — IA: OCR de horarios y ayuda en votaciones
- [x] **Fase 4.5** — Administración: roles, estadísticas, informes (PDF y CSV), usuarios, grupos, moderación y registro de acciones
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
