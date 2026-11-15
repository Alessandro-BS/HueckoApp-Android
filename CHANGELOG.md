# 📝 Cambios

Todos los cambios importantes de HueckoApp. Las versiones siguen [SemVer](https://semver.org/lang/es/) y cada una tiene su tag en `main`.

## 🏷️ [3.0.0] — 2026-11-14

Tercera entrega: **APK instalable** con el backend en Render + Neon, los requisitos del curso (Volley, sensores, notificaciones) y paridad de funciones con la otra versión del proyecto.

### ✨ Nuevo

- 📦 **APK con EAS Build** y backend publicado en **Render** con base de datos en **Neon** (#42).
- 🌐 **TanStack Query** (equivalente de Volley): caché por consulta y reintentos automáticos sin red o con Render dormido, en Inicio, Grupos, Planes y Disponibilidad (#43, #51).
- 📡 **Unirse a un grupo acercando el celular**: módulo nativo con el sensor de proximidad y el **giroscopio** para no disparar mientras se mueve (#44).
- 📆 **Franjas con fecha** en las propuestas: cada franja es un día concreto, sin días pasados (#45).
- ⚠️ **Votación exprés** ante una ausencia crítica: el grupo vota cancelar, reagendar o mantener, con recomendación de la IA (#46).
- 👥 **Varios organizadores** por grupo; el último no se puede quitar (#47).
- 🗳️ **Cierre automático** de la votación de franjas, **voto múltiple** y bloques de horario sin solapes (#48).
- 🔔 **Notificaciones push** (Firebase Cloud Messaging): nueva propuesta, plan confirmado o cancelado, votación exprés abierta y su resultado, y recordatorio 1 h antes; interruptor por celular en Perfil (#49).
- 🔐 **Cuentas**: «Continuar con Google», verificación del correo obligatoria con un código, recuperar la contraseña y verificación en dos pasos opcional; correos por **Brevo** (#50).
- 🌍 **Página web y política de privacidad** en GitHub Pages, para la pantalla de consentimiento de Google (#52).

### 🐛 Corregido

- 🤖 El borrador con IA para «hoy» ya no se agenda la semana siguiente (#40).
- 🚫 Un imprevisto no se guarda en un plan que se acaba de cancelar (#41).
- 👥 Crear o unirse a un grupo antes de que cargue «Mis grupos» ya no deja solo el grupo nuevo, y al salir de un grupo Inicio deja de mostrarlo (#51).

### ⚠️ Cambios que rompen compatibilidad

- 📱 El registro ya no devuelve el token sino un reto con código: **los APK anteriores no pueden registrar cuentas contra este backend**. Despliega el backend y reparte el APK nuevo a la vez.
- 🔑 El servidor no arranca en producción sin `BREVO_API_KEY` y `BREVO_SENDER_EMAIL`.

### 🧰 Interno

- 🗃️ Migraciones 7 a 13 (franjas con fecha, votación exprés, organizadores, voto múltiple, notificaciones y cuentas). Las cuentas existentes quedan verificadas.
- ⏰ Barrido cada minuto en el servidor y **despertador** de GitHub Actions que llama a `/api/internal/tick` cada ~10 min.
- 🧪 1848 tests (1068 del backend y 780 de la app).
- 📜 [Guía de puesta en marcha](docs/puesta-en-marcha.md) con todo lo que se configura fuera del código.

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

[3.0.0]: https://github.com/Alessandro-BS/HueckoApp-Android/compare/v2.0.0...v3.0.0
[2.0.0]: https://github.com/Alessandro-BS/HueckoApp-Android/compare/v1.0.0...v2.0.0
[1.0.0]: https://github.com/Alessandro-BS/HueckoApp-Android/releases/tag/v1.0.0
