# 🧰 Puesta en marcha antes del APK

> 📌 **Guía única** con todo lo que falta hacer **fuera del código** para sacar la v3.0.0: Firebase, Google Cloud, Brevo, variables de Render y GitHub, comprobaciones en Neon, orden de los PR, el APK y la prueba en dos celulares. Va en este orden: cada paso supone los anteriores. Marca las casillas `- [ ]` a medida que avances.
>
> ✅ **Estado al 2026-11-14:** pasos 1 a 6 hechos (las casillas marcadas). Falta: release 3.0.0, despliegue, APK y prueba en dos celulares.
>
> 🔎 Los detalles de Neon, Render y EAS no se repiten aquí: están en [`despliegue.md`](despliegue.md).

---

## 1️⃣ Firebase (avisos push)

Los avisos usan FCM V1. Es una sola vez; el detalle está en [Avisos push (Firebase)](despliegue.md#-avisos-push-firebase).

- [x] En la [consola de Firebase](https://console.firebase.google.com) crea un proyecto (o usa el que ya tengas).
- [x] Agrega una app **Android** con el paquete `com.hueckoapp.mobile` (el `android.package` de [`mobile/app.json`](../mobile/app.json)).
- [x] Descarga `google-services.json` y guárdalo en `mobile/google-services.json` (se sube al repo: no es secreto).
- [x] En `mobile/app.json`, dentro de `android`, agrega `"googleServicesFile": "./google-services.json"`. Ya está en el repo: sin esta línea el APK no recibe avisos.
- [x] En Firebase → *Configuración del proyecto → Cuentas de servicio* genera una clave privada (JSON). **Es secreta**: no la guardes dentro del repo.
- [x] Súbela a EAS desde `mobile/`: `npx eas-cli@latest credentials` → **Android → (cualquier perfil) → Google Service Account → Manage your Google Service Account Key for Push Notifications (FCM V1)**. La clave queda asignada al paquete `com.hueckoapp.mobile`, así que sirve para todos los perfiles.

---

## 2️⃣ Google Cloud (Continuar con Google)

Si usas **el mismo proyecto** de Firebase, los clientes OAuth ya aparecen en su [consola de Google Cloud](https://console.cloud.google.com/apis/credentials) y puedes reutilizarlos o crear los que falten.

- [x] **Pantalla de consentimiento** (*APIs y servicios → Pantalla de consentimiento de OAuth*): tipo *Externo*, nombre «HueckoApp», correo de contacto. Mientras esté en modo *Prueba*, agrega como usuarios de prueba las cuentas de Google con las que vas a entrar; o publícala.
  - Para **publicarla** (*Público → Publicar app*), Google exige en *Información de la marca* una página principal, una política de privacidad y su dominio autorizado. Están en la rama `gh-pages` (GitHub Pages): `https://alessandro-bs.github.io/HueckoApp-Android/` y `…/privacidad.html`, con el dominio autorizado `alessandro-bs.github.io`. **No subas logotipo**: obliga a una verificación de Google que tarda días. Si cambian los datos que guarda la app, actualiza `privacidad.html` en esa rama.
- [x] Obtén el **SHA-1 del keystore de EAS** (no uno local): desde `mobile/`, `npx eas-cli@latest credentials -p android`, elige el perfil (`preview`) y copia el *SHA1 Fingerprint*. Si todavía no hay keystore, se crea con el primer `eas build` (paso 8): vuelve a este paso después.
- [x] Crea un **ID de cliente OAuth de tipo Android** con el paquete `com.hueckoapp.mobile` y ese SHA-1. No se copia en ningún archivo: Google lo reconoce por paquete y huella.
- [x] Crea un **ID de cliente OAuth de tipo Web**. Su ID (`xxxx.apps.googleusercontent.com`) es el que usa todo lo demás. **No es secreto.** Pégalo en:
  - [x] `GOOGLE_WEB_CLIENT_ID` en Render (paso 4) y, para probar en local, en `backend/.env`.
  - [x] `mobile/app.json` → `extra.googleWebClientId` (ya configurado). Si estuviera vacío, el botón «Continuar con Google» no se muestra.

> ⚠️ Cambiar `extra.googleWebClientId` o el SHA-1 obliga a **generar otro APK**. El botón tampoco aparece en Expo Go: hace falta el APK o un *development build*.
>
> 💡 Sin `GOOGLE_WEB_CLIENT_ID` en el servidor, `POST /api/auth/google` responde `503 GOOGLE_NOT_CONFIGURED`.

---

## 3️⃣ Brevo (correos con el código)

Registro, entrada con verificación en dos pasos y recuperar la contraseña mandan un código de 6 dígitos por correo con [Brevo](https://app.brevo.com).

- [x] Crea una cuenta gratis (**300 correos al día**).
- [x] *Remitentes, dominios e IP → Remitentes*: agrega y **verifica** el correo desde el que saldrán los códigos (te llega un correo de confirmación). Sin remitente verificado, Brevo rechaza los envíos.
- [x] Verifica tu **teléfono** en Brevo (lo pide antes del primer envío).
- [x] *SMTP y API → Claves API*: genera una clave. Es **secreta** y Brevo la muestra una sola vez. Acceso **Restringido** con solo *Emails transaccionales → Todos* (el backend solo llama a `POST /v3/smtp/email`) y el vencimiento más largo.
  - ⏰ Además de su fecha, **la clave caduca tras 90 días sin uso**: si la app pasa ese tiempo sin enviar códigos, genera otra y cámbiala en Render.
  - 🚫 **No actives** «bloquear direcciones IP no autorizadas» para las claves API: Render no tiene una IP fija y los correos dejarían de salir.
- [x] En Render (paso 4): `BREVO_API_KEY` (la clave), `BREVO_SENDER_EMAIL` (el remitente verificado) y, si quieres otro nombre, `BREVO_SENDER_NAME` (por defecto `HueckoApp`).

> 🚫 Con `NODE_ENV=production`, **si falta `BREVO_API_KEY` o `BREVO_SENDER_EMAIL` el servidor no arranca**. Un valor vacío en Render cuenta como no puesto.
>
> 💡 En desarrollo, sin `BREVO_API_KEY`, los códigos se escriben en el log del backend (no se manda ningún correo).
>
> 🧮 El backend se frena antes de agotar el plan gratis: como mucho `BREVO_DAILY_LIMIT` correos cada 24 h entre todas las cuentas (`280` en `render.yaml`). Pasado eso, pedir o reenviar un código responde «Hoy no podemos enviar más códigos. Inténtalo mañana.» (`503 EMAIL_QUOTA_EXHAUSTED`) y el log de Render lo registra. Si pasas a un plan de Brevo con más correos, sube el valor en Render.

---

## 4️⃣ Variables de Render y de GitHub

### Render

[`render.yaml`](../render.yaml) ya declara todas; al crear el Blueprint Render pide las marcadas con *sync: false*. En un servicio ya creado, agrégalas en *Environment*.

| Variable | Valor | ¿Secreta? |
|---|---|---|
| `NODE_ENV` | `production` (en `render.yaml`) | No |
| `TZ` | `America/Lima` (en `render.yaml`) | No |
| `TRUST_PROXY` | `1` (en `render.yaml`) | No |
| `JWT_SECRET` | Lo genera Render (`generateValue`) | ✅ Sí |
| `DATABASE_URL` | Cadena de Neon con `sslmode=verify-full` | ✅ Sí |
| `GEMINI_API_KEY` | Tu clave (vacía = modo demostración) | ✅ Sí |
| `CRON_SECRET` | Valor largo y aleatorio, mínimo 32 caracteres | ✅ Sí |
| `EXPO_ACCESS_TOKEN` | Solo con «Enhanced Security» en Expo | ✅ Sí |
| `BREVO_API_KEY` | Clave de la API de Brevo (paso 3) | ✅ Sí |
| `BREVO_SENDER_EMAIL` | Remitente verificado en Brevo | No |
| `BREVO_SENDER_NAME` | `HueckoApp` (en `render.yaml`) | No |
| `BREVO_DAILY_LIMIT` | `280` (en `render.yaml`; bajo los 300/día de Brevo gratis, paso 3) | No |
| `GOOGLE_WEB_CLIENT_ID` | ID de cliente **Web** de Google (paso 2) | No |

`CODE_RATE_LIMIT` (30 intentos por IP cada 15 min en verificar, reenviar y «¿Olvidaste tu contraseña?») es opcional: el valor por defecto sirve.

### GitHub (el despertador)

El workflow [`despertador.yml`](../.github/workflows/despertador.yml) llama a `POST /api/internal/tick` cada ~10 min para que Render no se duerma y salgan los avisos. En GitHub → *Settings → Secrets and variables → Actions*:

- [x] Secreto `CRON_SECRET`: **el mismo valor** que en Render.
- [x] Variable `API_URL`: `https://hueckoapp-api.onrender.com` (sin `/` final; ajústala si Render puso otro sufijo).

Sin alguno de los dos, el workflow avisa y termina sin error. Sus límites (solo corre desde `main`, se desactiva a los 60 días sin actividad, cron no exacto) están en [despliegue.md](despliegue.md#-backend-render).

---

## 5️⃣ Consultas de control en Neon (antes de desplegar)

Ejecútalas en el *SQL Editor* de Neon sobre la base de producción. Cada una debe dar exactamente lo indicado; si no, **no despliegues** y revisa esa fase.

- [x] **Fase 1** (antes de la migración 7). Debe dar **0 filas**:
  ```sql
  SELECT p.id, p.scheduled_date, w.day_of_week FROM proposals p JOIN proposal_windows w ON w.id = p.chosen_window_id WHERE p.scheduled_date IS NOT NULL AND EXTRACT(ISODOW FROM p.scheduled_date::date) <> w.day_of_week;
  ```
- [x] **Fase 2**. Debe dar `ai_calls_task_check`:
  ```sql
  SELECT conname FROM pg_constraint WHERE conrelid='ai_calls'::regclass AND contype='c';
  ```
- [x] **Fase 3**. Debe dar `group_members_role_check`:
  ```sql
  SELECT conname FROM pg_constraint WHERE conrelid='group_members'::regclass AND contype='c';
  ```
- [x] **Fase 4**. Debe dar `votes_pkey`:
  ```sql
  SELECT conname FROM pg_constraint WHERE conrelid='votes'::regclass AND contype='p';
  ```
- [ ] **Fase 6** (cuentas): ninguna consulta previa. **Después de desplegar**, esta debe dar `0` (nadie quedó bloqueado: la migración 13 verifica a las cuentas existentes):
  ```sql
  SELECT count(*) FROM users WHERE NOT email_verified;
  ```

---

## 6️⃣ Orden de integración

Los PR están apilados: cada uno parte del anterior.

- [x] Integra, **en este orden**, a `develop`: **#43 → #44 → … → #51 → #52** (hecho el 2026-11-14, con el CI de `develop` en verde tras cada uno). Para una pila futura, este es el orden seguro:
  1. Integra el PR con *merge commit*, **sin** borrar su rama (no uses `gh pr merge --delete-branch`: al borrar la rama, GitHub **cerró** el PR siguiente en vez de cambiarle la base).
  2. Espera el CI de `develop`: al cambiar la base de un PR el CI no se vuelve a ejecutar, pero sí con cada push a `develop`.
  3. Cambia la base del PR siguiente: `gh pr edit <n> --base develop`.
  4. Recién entonces borra la rama integrada.
- [ ] Crea `release/3.0.0` desde `develop` y ábrele un PR a `main`. Al integrarlo, pon el tag `v3.0.0` y vuelve a integrar la release en `develop` (git flow, ver [README](../README.md#-flujo-de-trabajo-git-flow)).
- [x] Comprueba en el panel de Render qué rama despliega el servicio y cámbiala a `main` (`render.yaml` ya dice `branch: main`).
- [ ] Borra la rama remota `wip/votacion-expres-task3` (`git push origin --delete wip/votacion-expres-task3`).

> ⏰ El despertador solo corre desde `main`: empezará a funcionar cuando la release llegue ahí.

---

## 7️⃣ Desplegar el backend antes del APK

> ⚠️ **El APK nuevo no funciona con el backend viejo** (pide códigos, Google y rutas que el servidor antiguo no tiene).
>
> ⚠️ **Y al revés: los APK anteriores a esta fase no pueden registrar cuentas contra el backend nuevo** (el registro ya no devuelve un token, sino un reto con código, que esos APK no saben mostrar). Despliega el backend y reparte el APK nuevo **a la vez**, y pide a quienes tengan el APK viejo que lo actualicen.

- [ ] Con los pasos 3 y 4 hechos, despliega el backend en Render y espera a que termine. Abre `https://hueckoapp-api.onrender.com/api/health`: debe decir `{"status":"ok"}`. Al arrancar, el servidor aplica las migraciones solo.
- [ ] Corre la consulta de la fase 6 del paso 5: debe dar `0`.
- [ ] Si todavía no tienes administrador, créalo ([despliegue.md](despliegue.md#-base-de-datos-neon), punto 5). `make-admin` deja su correo verificado.
- [ ] Con esa cuenta ADMIN, llama **una vez** a `GET /api/admin/stats` (por ejemplo, abriendo Administración en la app o con `curl` y su token). Es el momento en que se cierran las votaciones vencidas que quedaron atrasadas.

---

## 8️⃣ Generar el APK

Google Sign-In y la proximidad **no funcionan en Expo Go**.

- [x] Revisa que `mobile/app.json` tenga `googleServicesFile` (paso 1) y `extra.googleWebClientId` (paso 2), y que la URL de `mobile/eas.json` sea la del servicio de Render.
- [x] En Google Cloud, **restringe la clave de API de Android** que creó Firebase (*Credenciales → Android key (auto created by Firebase) → Restricciones de aplicación → Apps para Android*) al paquete `com.hueckoapp.mobile` y al SHA-1 de EAS, sin tocar sus restricciones de API. Esa clave está en `google-services.json` y GitHub la marca como «secreto filtrado»: es pública por diseño (va dentro del APK), pero así solo sirve desde tu app. Luego cierra la alerta de *Secret scanning* como *Won't fix*.
- [ ] Desde `mobile/`:
  ```bash
  npx eas-cli@latest build -p android --profile preview
  ```
- [ ] Si fue la primera vez que EAS creó el keystore, **vuelve al paso 2** para registrar su SHA-1 en el cliente OAuth Android (con `npx eas-cli@latest credentials -p android`). Si lo hiciste después de generar el APK, no hace falta otro: el SHA-1 no viaja dentro de la app.
- [ ] Instala el `.apk` en **los dos celulares** (enlace o QR de EAS; Android pide permitir «instalar apps desconocidas»).

---

## 9️⃣ Prueba en dos celulares

Usa cuentas distintas en cada celular (p. ej. dos cuentas reales o las de la semilla, **solo si la base lo permite**: la semilla no corre contra producción). Los pasos finos de varias funciones ya están en la [🧪 guía de pruebas](guia-de-pruebas.md); aquí solo va la lista de control.

| ☐ | Función | Qué hacer | Resultado esperado |
|---|---|---|---|
| ☐ | 📡 **Proximidad** | Una cuenta abre **Acercar para invitar** y la otra **Unirse acercando**; juntan los celulares pantalla con pantalla | La segunda entra al grupo y los dos vibran. Ver [README](../README.md#-requisitos-de-la-tercera-entrega-v300) |
| ☐ | 🌀 **Giroscopio** | Intenta unirte acercando mientras mueves el celular | No dispara mientras se mueven; une al quedarse quietos |
| ☐ | 📆 **Franjas con fecha** | Crea una propuesta eligiendo semana, día y horas | Cada franja muestra su fecha; no deja elegir días pasados |
| ☐ | ⚠️ **Votación exprés** | Reporta un imprevisto en un plan con un miembro imprescindible | El grupo vota cancelar, reagendar o mantener y la votación cierra sola |
| ☐ | 👥 **Organizadores** | Haz organizador a otro miembro; intenta quitárselo al último | Los dos gestionan; el último no se puede quitar |
| ☐ | 🗳️ **Cierre automático y voto múltiple** | Ver «Voto múltiple y cierre automático» en la [guía de pruebas](guia-de-pruebas.md) | Se confirma la franja más votada o se cancela si nadie votó |
| ☐ | 🔔 **Push con la app cerrada** | Ver [Avisos push](guia-de-pruebas.md) | El aviso llega y al tocarlo abre Votar o el plan |
| ☐ | 📧 **Registro con código** | Regístrate con un correo real | Llega un correo de «HueckoApp» con 6 dígitos; al escribirlos entras |
| ☐ | 🔐 **Login con 2FA** | Perfil → **Verificación en dos pasos** (te pide la contraseña y un código); cierra sesión y entra | Tras la contraseña pide un código nuevo del correo |
| ☐ | 🔑 **Recuperar contraseña** | En el login, **¿Olvidaste tu contraseña?** | Código por correo, contraseña nueva y entras; en el otro celular la sesión vieja se cierra |
| ☐ | 🟦 **Google** | **Continuar con Google** con una cuenta de Google | Entras sin contraseña ni código. Pasa también con un correo que ya tenía cuenta (se vincula) |

> 🐞 Si el botón de Google no aparece: falta `extra.googleWebClientId` en el APK o estás en Expo Go. Si sale un error de Google al elegir la cuenta: el SHA-1 o el paquete del cliente Android no coinciden con el keystore de EAS. Si no llegan correos: revisa el remitente verificado y el log de Render.
