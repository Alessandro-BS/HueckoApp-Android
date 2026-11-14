# ☁️ Despliegue en producción

> 📦 **v3.0.0:** backend en Render + Neon y la app como **APK** con EAS Build. Orden: 1) Neon, 2) Render, 3) APK.
>
> 🧰 **Antes de empezar, sigue la [guía de puesta en marcha](puesta-en-marcha.md):** reúne Firebase, Google, Brevo, las variables de Render y GitHub, las consultas de Neon y el orden de los PR. Este documento es la referencia de cada pieza.

## 🐘 Base de datos (Neon)

1. 🆕 Crea un proyecto en [Neon](https://console.neon.tech) con **Postgres 18** (la versión por defecto; hace falta 16 o posterior), **en la misma región que el servicio de Render**: `render.yaml` usa `virginia`, así que elige **AWS US East 1 (N. Virginia)**. Cada consulta es un viaje de red y algunas pantallas (como los informes de administración) hacen una docena seguidas.
2. 🔗 En **Connect**, copia la cadena de conexión (la *pooled* sirve) y cambia `sslmode=require` por `sslmode=verify-full` (mismo cifrado, sin el aviso de seguridad de `pg`).
3. 🔒 Ponla en `DATABASE_URL` del entorno del servidor, **nunca en el repo ni en la app**. Con `NODE_ENV=production` el servidor no arranca sin ella.
   - ⏱️ Tiempos máximos (en `backend/src/db/pg-driver.ts`): Postgres cancela a los **15 s** una sentencia dentro de una transacción (`SET LOCAL statement_timeout`, compatible con la conexión *pooled*), y el servidor deja de esperar cualquier consulta a los **20 s**.
4. 🧱 Al arrancar, el servidor crea o actualiza las tablas solo (migraciones en `backend/src/db/migrations.ts`, anotadas en `schema_migrations`).
5. 🛡️ **Primer administrador:** ejecuta `make-admin` con la `DATABASE_URL` de producción **solo para ese comando**, en la terminal. **Nunca la escribas en `backend/.env`**: así ni `npm run backend` ni la semilla tocan producción por descuido. Una variable definida en la terminal gana a `backend/.env`:

   ```bash
   # bash
   DATABASE_URL='postgresql://…' npm run make-admin -w backend -- <correo>
   ```

   ```powershell
   # PowerShell
   $env:DATABASE_URL='postgresql://…'; npm run make-admin -w backend -- <correo>; Remove-Item Env:DATABASE_URL
   ```

   - `make-admin` solo abre una base que ya tenga el esquema **en la misma versión que tu copia del código**. No la migra (eso lo hace el servidor desplegado al arrancar), así que despliega antes y usa el mismo commit.
   - 🚫 La semilla es solo para desarrollo: si `DATABASE_URL` no apunta a esta máquina, se niega a escribir (salvo con `-- --allow-remote`, para una base de pruebas), porque crea cuentas con contraseña conocida, una de ellas ADMIN.
6. 🧪 **Antes de desplegar en Render**, arranca el servidor una vez contra un proyecto Neon de pruebas (con su `DATABASE_URL` real) y comprueba salud, inicio de sesión, Inicio y `make-admin`. Los tests no usan red, así que Neon no se prueba automáticamente.

---

## 🌐 Backend (Render)

| Variable | Valor recomendado | ¿Por qué? |
|---|---|---|
| `NODE_ENV` | `production` | Exige `DATABASE_URL` y desactiva comportamientos de desarrollo |
| `DATABASE_URL` | Cadena de Neon con `sslmode=verify-full` | Base de datos de producción |
| `JWT_SECRET` | Valor largo y aleatorio (distinto al de desarrollo) | Firma de los tokens |
| `TZ` | `America/Lima` | 🕐 Los planes confirmados (`scheduledAt`, `scheduledDate`) se calculan en esta zona. Sin ella el servidor usa UTC y los planes caerían en otra fecha u hora |
| `TRUST_PROXY` | `1` | 🧱 Render pone un proxy delante. Sin esto, todas las peticiones parecen venir de la misma IP y el límite de intentos de login (`LOGIN_RATE_LIMIT`) y de registro (`REGISTER_RATE_LIMIT`) bloquearía a todos a la vez |
| `GEMINI_API_KEY` | Tu clave | IA (opcional) |
| `CRON_SECRET` | Valor largo y aleatorio (mínimo 32 caracteres) | ⏰ Protege `POST /api/internal/tick`, que llama el despertador de GitHub Actions. Vacío = sin ese endpoint |
| `EXPO_ACCESS_TOKEN` | Token de Expo (opcional) | Solo si activaste «Enhanced Security» en tu cuenta de Expo |
| `BREVO_API_KEY`, `BREVO_SENDER_EMAIL`, `BREVO_SENDER_NAME` | Clave de Brevo, remitente verificado y nombre (`HueckoApp`) | 📧 Códigos por correo. Con `NODE_ENV=production` el servidor **no arranca** sin las dos primeras. Ver [guía](puesta-en-marcha.md) |
| `GOOGLE_WEB_CLIENT_ID` | ID de cliente Web de Google (no es secreto) | Sin él, «Continuar con Google» responde `503 GOOGLE_NOT_CONFIGURED`. Ver [guía](puesta-en-marcha.md) |

### 🚀 Crear el servicio con el Blueprint

1. En [Render](https://dashboard.render.com): **New → Blueprint** y elige este repositorio. Render lee [`render.yaml`](../render.yaml), que ya trae todo lo de la tabla: `NODE_ENV`, `TZ`, `TRUST_PROXY` y un `JWT_SECRET` aleatorio.
2. Te pide los valores que no van en el repo: `DATABASE_URL` (la de Neon), `GEMINI_API_KEY` (vacía = modo demostración), `CRON_SECRET`, `BREVO_API_KEY`, `BREVO_SENDER_EMAIL` y `GOOGLE_WEB_CLIENT_ID`.
3. Despliega rama `main`. Cuando termine, abre `https://<tu-servicio>.onrender.com/api/health`: debe responder `{"status":"ok"}`.
4. Si la URL no es `https://hueckoapp-api.onrender.com` (Render añade un sufijo si el nombre está ocupado), cámbiala en `mobile/eas.json` antes de generar el APK.

> ⚙️ Comandos (ya en `render.yaml`): build `npm ci --include=dev --workspace backend --workspace shared && npm run build -w backend` · start `npm start -w backend`. El `--include=dev` es obligatorio: con `NODE_ENV=production` npm se salta `typescript` (devDependency) y el build falla.
>
> ⏰ **Despertador (avisos push):** el servidor barre cada minuto (cierra votaciones vencidas, encola recordatorios y envía los avisos pendientes), pero el plan gratuito de Render lo duerme tras 15 min sin uso. El workflow [`despertador.yml`](../.github/workflows/despertador.yml) llama a `POST /api/internal/tick` cada ~10 min. En GitHub → *Settings → Secrets and variables → Actions*: secreto `CRON_SECRET` (el mismo valor que en Render) y variable `API_URL` (p. ej. `https://hueckoapp-api.onrender.com`, sin `/` final). Sin alguno de los dos, el workflow avisa y termina sin error.
>
> ⚠️ **Límites de GitHub Actions para este despertador:**
> - Los workflows con `schedule` **solo corren desde la rama predeterminada (`main`)**: hasta que `despertador.yml` llegue a `main` no se ejecutará solo (el botón *Run workflow* tampoco aparece hasta que el archivo del workflow exista en `main`).
> - GitHub **desactiva los workflows programados tras 60 días sin actividad** en el repositorio: si los avisos dejan de salir, entra a la pestaña *Actions* y vuelve a habilitarlo.
> - El cron **no es exacto**: en horas de mucha carga una ejecución puede retrasarse varios minutos o saltarse, y por eso un recordatorio puede llegar con retraso. Si hace falta puntualidad, usa un servicio de cron externo que llame al mismo endpoint.
>
> 💤 En el plan gratuito el servicio se duerme tras 15 min sin uso: la primera petición después tarda ~1 min en responder.

---

## 🔔 Avisos push (Firebase)

Los avisos usan Firebase Cloud Messaging (FCM V1) a través del servicio de Expo. Hace falta una sola vez:

1. En la [consola de Firebase](https://console.firebase.google.com) crea un proyecto y agrega una app **Android** con el paquete que está en `android.package` de `mobile/app.json`.
2. Descarga `google-services.json` y guárdalo en `mobile/google-services.json`. **Se sube al repo** (no es secreto: solo identifica la app) y en `mobile/app.json` agrega `"googleServicesFile": "./google-services.json"` dentro de `android`.
3. En Firebase → *Configuración del proyecto → Cuentas de servicio* genera una **clave privada** (JSON). Esa clave **sí es secreta**: no la guardes dentro del repo; `.gitignore` ignora `*-firebase-adminsdk-*.json` y `mobile/google-service-account*.json` por si se cuela.
4. Súbela a EAS (una vez):
   ```bash
   cd mobile
   npx eas-cli@latest credentials
   ```
   Elige **Android → production → Google Service Account → Manage your Google Service Account Key for Push Notifications (FCM V1)** y sube el JSON. Repite para el perfil `development` si vas a probar con ese APK.
5. Genera un APK nuevo (`development`, `preview` o `production`): las notificaciones remotas **no funcionan en Expo Go**.

---

## 📦 APK (EAS Build)

La app se compila en los servidores de Expo; no hace falta Android Studio. La URL del backend va en `mobile/eas.json` (`EXPO_PUBLIC_API_URL`) y queda **dentro del APK** (`preview` y `production`): si cambia, hay que generar otro. El APK `development` es distinto: carga el JavaScript desde Metro en tu PC y toma la URL de `mobile/.env`.

1. 🔑 Crea una cuenta en [expo.dev](https://expo.dev) e inicia sesión (una vez por PC):
   ```bash
   cd mobile
   npx eas-cli@latest login
   ```
2. 🔗 Enlaza el proyecto (una vez; agrega `extra.eas.projectId` y `owner` a `app.json`, que se suben al repo):
   ```bash
   npx eas-cli@latest init
   ```
3. 🏗️ Genera el APK con el perfil `preview` (la primera vez EAS crea y guarda la clave de firma de Android: acepta):
   ```bash
   npx eas-cli@latest build -p android --profile preview
   ```
4. 📲 Al terminar (~10-15 min), EAS muestra un enlace y un QR: ábrelo en el celular, descarga el `.apk` e instálalo (Android pide permitir «instalar apps desconocidas»).

| Perfil | Para qué | Versión |
|---|---|---|
| `development` | APK con *development client* (`expo-dev-client`) para probar módulos nativos, como unirse acercando el celular. Se genera con `--profile development` y se usa con `npx expo start --dev-client`: el código y `EXPO_PUBLIC_API_URL` salen de Metro y de `mobile/.env` (no de `eas.json`). Mientras la función no esté desplegada, contra el backend local (`npm run backend`, celulares en la misma Wi-Fi; ver «Probarlo» en el [README](../README.md)) | `versionCode` lo lleva EAS (`appVersionSource: remote`), como en `preview` |
| `preview` | APK para probar y entregar | `versionCode` lo lleva EAS (`appVersionSource: remote`) |
| `production` | Igual, pero sube el `versionCode` solo (`autoIncrement`) | Para cada versión publicada |
