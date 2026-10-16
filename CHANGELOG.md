# 📝 Cambios

Todos los cambios importantes de HueckoApp. Las versiones siguen [SemVer](https://semver.org/lang/es/) y cada una tiene su tag en `main`.

## 🏷️ [2.0.0] — 2026-10-16

Segunda entrega: la app se rehace en **Expo + React Native** con backend propio. La versión nativa en Kotlin queda congelada en [`legacy-android/`](legacy-android/).

### ✨ Nuevo

- 🏗️ **Monorepo** con npm workspaces: `mobile/` (Expo SDK 57), `backend/` (Express 5) y `shared/` (tipos del contrato). Contrato de la API en [`docs/api.md`](docs/api.md) (#17).
- 🔐 **Cuentas** con JWT (token cifrado en `expo-secure-store`), contraseñas con bcrypt y límite de intentos.
- 📅 **Horario, grupos y huecos en común**: bloques con el reloj nativo de Android (#29), grupos con código de invitación y cruce de disponibilidad en el servidor.
- 🗳️ **Propuestas y votación**: franjas, fecha límite, lugar con la ubicación actual (`expo-location`), confirmación e imprevistos con miembros imprescindibles.
- 🤖 **Huecko IA** con Google Gemini, solo desde el backend: escaneo de horarios desde una foto, borrador de plan desde una frase, ideas de plan y resumen de la votación (#22).
- 🛡️ **Administración**: roles, estadísticas y gráficos, informes PDF y CSV, usuarios, grupos y registro de acciones (#24).
- 🐘 **PostgreSQL**: PGlite en desarrollo y tests, Neon en producción, con migraciones versionadas (#25).
- 🧭 **Barra inferior** Inicio · Horario · Grupos (#28).
- 💾 **Async Storage**: el login recuerda el último correo, la app abre **sin red** con la sesión guardada e Inicio muestra su última copia con el aviso «Sin conexión» (#35).
- ✨ **Borrador con IA más preciso**: respeta la duración y el momento del día pedidos y propone **hasta 3 franjas** para votar, siempre dentro de huecos reales (#37).
- 🛡️ La cuenta administradora **solo administra**: abre en Administración, sin Inicio, Horario ni Grupos (#38).
- 🗺️ Mapa de **OpenStreetMap** (Leaflet en `react-native-webview`, sin clave) para «Elegir en el mapa». El botón queda desactivado y marcado *en curso* (#32, #36).

### 🐛 Corregido

- 📷 Las fotos grandes del horario se reducen antes de subirse (#30).
- 📄 El PDF del informe también se exporta en Expo Go (#31).
- 🗺️ El mapa de Google salía negro en Expo Go (Google rechaza la clave de Expo Go): se reemplaza por OpenStreetMap (#36).

### 🧰 Interno

- 🟢 Node 22 fijado para todo el equipo (`.nvmrc`, `engine-strict`) y CI con typecheck y tests en cada PR (#27).
- 🧪 1060 tests (560 del backend y 500 de la app).
- 📜 README (#26, #34), [guía de pruebas](docs/guia-de-pruebas.md) (#33) y [guía de despliegue](docs/despliegue.md).

## 🏷️ [1.0.0] — 2026-09-29

Primera entrega: app **nativa en Kotlin + Jetpack Compose** (ahora en [`legacy-android/`](legacy-android/)), con horarios, grupos, votación de planes y OCR de horarios simulado.

[2.0.0]: https://github.com/Alessandro-BS/HueckoApp-Android/compare/v1.0.0...v2.0.0
[1.0.0]: https://github.com/Alessandro-BS/HueckoApp-Android/releases/tag/v1.0.0
