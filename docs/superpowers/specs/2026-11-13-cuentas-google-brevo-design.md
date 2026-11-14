# Cuentas: Google, verificación de correo, recuperar contraseña y 2FA (fase 6)

Fecha: 2026-11-13 · Rama: `feature/cuentas-google-brevo` (sale de `feature/notificaciones-push`, PR #49, mientras
#43–#49 no estén integrados).

## Intención

Igualar las cuentas con la otra versión del proyecto (repos de Nakusuo): entrar con Google, correo verificado, recuperar
la contraseña y segundo factor. Hoy solo hay registro y login con correo y contraseña; la app no manda ningún correo y
cualquiera puede registrarse con un correo ajeno. El usuario decidió (2026-11-13) que **esta es la última fase antes de
generar el APK** para la exposición; gestión del grupo (expulsar, regenerar código) y el QR quedan para después.

## Objetivos

1. **Entrar con Google** (botón «Continuar con Google» en Login y Registro), con la ventana de cuentas nativa de Android.
2. **Verificación del correo obligatoria**: una cuenta creada con correo y contraseña no puede usar la app hasta
   escribir el código de 6 dígitos que le llega por correo.
3. **Recuperar la contraseña** con un código al correo.
4. **2FA opcional por correo**: quien lo activa en Perfil, tras escribir su contraseña, debe escribir un código que le
   llega al correo.
5. **Todo documentado** antes del APK: una guía única de puesta en marcha (ver «Documentación»).

## No objetivos

- Añadir al grupo por correo (descartado por el usuario: se entra por código o proximidad).
- QR del grupo (mostrar/escanear): versión posterior a la exposición.
- App autenticadora (TOTP), códigos de respaldo, SMS.
- Enlaces en el correo (deep links / página web de verificación).
- Cambiar el correo de la cuenta, cambiar la contraseña desde Perfil sabiendo la actual, borrar la cuenta.
- Login con Google en Expo Go o en iOS.
- Desvincular Google de una cuenta.

## Anti-objetivos (sería un fracaso aunque funcione)

- Que una cuenta sin verificar o un login con 2FA a medias obtenga una sesión (JWT).
- Que alguien se apropie de una cuenta ajena: entrar con un token de Google no verificado, adivinar un código por fuerza
  bruta, o reutilizar un código ya usado o vencido.
- Que el login o «olvidé mi contraseña» revelen si un correo tiene cuenta (más de lo que ya revela el registro con
  `EMAIL_TAKEN`).
- Que las cuentas que ya existen (la del usuario, las de sus compañeros, la semilla) queden bloqueadas al actualizar.
- Códigos guardados en texto plano, o la clave de Brevo / secretos de Google en el repo o en la app.
- Gastar el cupo diario de Brevo (300 correos) por reenvíos sin límite.

## Restricciones

- Monorepo actual: Express 5 + zod + `ApiError` + SQL parametrizado; PGlite en tests y Neon en producción; React Native
  con Expo SDK 57, React Navigation, `expo-secure-store` para el JWT. Migración nueva al final de `migrations.ts` (la
  13); nunca se edita una publicada. `shared/index.d.ts` y `docs/api.md` cambian en el mismo commit que el endpoint.
- Google Sign-In nativo exige development build (como la proximidad); en Expo Go el botón no aparece.
- Brevo, plan gratis: 300 correos/día y remitente verificado. La clave vive solo en Render (`BREVO_API_KEY`).
- Los tests no pueden llamar a Google ni a Brevo: clientes inyectables con dobles en los tests.
- Textos de la app en español, con el tono actual.

## Enfoques considerados

- **A. Sin código no hay sesión (elegido por el usuario).** Cuando falta un código, login y registro no devuelven el JWT
  sino un *reto* (`challenge`) temporal; la app manda el código al reto y recibe el JWT. Un solo mecanismo para
  verificación, 2FA y recuperación. Una cuenta sin verificar nunca tiene sesión, así que no hay que proteger cada ruta.
  Coste: cambia la respuesta de login/registro y la app que la consume.
- **B. Sesión limitada.** JWT normal y `requireAuth` rechaza todo salvo las rutas del código. Descartado: cada ruta nueva
  es un posible olvido y no sirve para el 2FA (una sesión a medias es justo lo que hay que evitar).
- **C. Enlace en el correo.** Descartado: necesita página web o deep links, frágiles en Android.

## Diseño

### Datos (migración 13)

- `users`:
  - `password_hash` pasa a admitir `NULL` (cuentas creadas solo con Google).
  - `email_verified BOOLEAN NOT NULL DEFAULT false`; la migración pone **`true` en todas las filas existentes**.
  - `google_sub TEXT COLLATE "C" UNIQUE NULL` (el `sub` del token de Google).
  - `two_factor_enabled BOOLEAN NOT NULL DEFAULT false`.
  - `session_version INTEGER NOT NULL DEFAULT 0` (se sube al recuperar la contraseña: cierra las sesiones viejas).
- `auth_challenges` (un reto = una espera de código):
  - `id` (aleatorio, 32 bytes en base64url; es lo que la app guarda y manda), `user_id` (FK, `ON DELETE CASCADE`),
    `purpose` (`VERIFY_EMAIL | LOGIN_2FA | RESET_PASSWORD | ENABLE_2FA`), `code_hash`, `attempts` (0..5),
    `created_at`, `expires_at` (creación + 15 min), `last_sent_at`, `consumed_at`.
  - Un usuario tiene como mucho un reto vivo por propósito: crear uno nuevo invalida (marca consumido) el anterior del
    mismo propósito.
  - El código se guarda como HMAC-SHA256 con `JWT_SECRET` como clave (no bcrypt: 6 dígitos no ganan nada con un hash
    lento y el límite de intentos es lo que protege). Se compara en tiempo constante.

### Reglas del código

- 6 dígitos (`000000`–`999999`, `crypto.randomInt`), vence a los **15 min**.
- **5 intentos**: al quinto fallo el reto queda consumido; hay que pedir otro (reenviar o volver a entrar).
- **Reenviar**: genera un código nuevo en el mismo reto (resetea `attempts`, extiende `expires_at`), como mucho una vez
  por **60 s** (`429 RESEND_TOO_SOON` con los segundos que faltan) y como mucho **5 envíos por reto**.
- Usar un código bien lo marca consumido: no se puede reutilizar.
- **Límite por cuenta, no solo por reto:** si ya hay un reto vivo del mismo usuario y propósito enviado hace menos de
  60 s, login/registro/olvidé **reutilizan ese reto sin mandar otro correo** (devuelven el mismo `challenge`). Además,
  como mucho **10 correos por cuenta cada 24 h** (todos los propósitos); pasado eso, crear o reenviar responde
  `429 EMAIL_DAILY_LIMIT` «Ya te enviamos muchos códigos hoy. Inténtalo mañana.» (en `/password/forgot` no se responde
  el 429, ver abajo). Así nadie llena el correo de otro ni agota el cupo de Brevo.

### Endpoints (todos en `/api/auth`, con limitador por IP como los actuales)

Tipo nuevo en `shared`:
`AuthResult = { token: string; user: CurrentUser } | { challenge: { id: string; purpose: ChallengePurpose; emailHint: string; resendAvailableAt: string } }`
(`emailHint` = «a***@gmail.com»).

- `POST /register` `{ name, email, password }` → crea la cuenta sin verificar, manda el código `VERIFY_EMAIL` y responde
  `201 { challenge }`. Si el correo ya existe **sin verificar y sin Google**, en vez de `409` reemplaza nombre y
  contraseña y manda un código nuevo (así nadie «secuestra» un correo registrándolo primero sin poder confirmarlo).
  Correo existente verificado → `409 EMAIL_TAKEN` como hoy.
- `POST /login` `{ email, password }` → credenciales malas `401 INVALID_CREDENTIALS` (también si la cuenta no tiene
  contraseña); suspendida `403` como hoy; sin verificar → `200 { challenge: VERIFY_EMAIL }` (y manda código); con 2FA →
  `200 { challenge: LOGIN_2FA }`; si no → `200 { token, user }`.
- `POST /google` `{ idToken }` → el backend verifica el token con `google-auth-library` (`audience` =
  `GOOGLE_WEB_CLIENT_ID`) y exige `email_verified: true`. Busca por `google_sub`; si no, por correo y **vincula** (pone
  `google_sub` y `email_verified = true`). Si la cuenta encontrada **no estaba verificada**, al vincular se borran su
  contraseña y su 2FA y se toma el nombre de Google: quien la registró nunca demostró ser dueño del correo (evita que un
  atacante registre el correo ajeno con su contraseña y espere a que la víctima entre con Google). Si no existe, crea la cuenta (nombre de Google, sin contraseña, verificada).
  Suspendida → `403`. **Sin 2FA** (decisión del usuario: Google ya verifica). Responde `{ token, user }`. Token inválido
  → `401 GOOGLE_TOKEN_INVALID`.
- `POST /challenges/:id/verify` `{ code }` (y para `RESET_PASSWORD` además `{ newPassword }`):
  - código correcto → consume el reto y según el propósito: `VERIFY_EMAIL` pone `email_verified = true`;
    `RESET_PASSWORD` cambia la contraseña, sube `session_version`, borra los `push_devices` del usuario (el celular de
  un posible ladrón deja de recibir sus avisos; el propio se vuelve a registrar al entrar) y también verifica el correo
  (demostró que lo lee);
    `LOGIN_2FA` nada más. Los tres devuelven `{ token, user }`. `ENABLE_2FA` pone `two_factor_enabled = true` y responde
    `204` (va con sesión, ver abajo).
  - incorrecto → `400 CODE_INVALID` con los intentos que quedan; quinto fallo, vencido o consumido →
    `410 CHALLENGE_EXPIRED` («Pide un código nuevo»). Reto inexistente → `410` también.
- `POST /challenges/:id/resend` → reglas de reenvío; `204`.
- `POST /password/forgot` `{ email }` → **siempre `202 { challenge }` con la misma forma**: si el correo existe crea un
  reto `RESET_PASSWORD` real y manda el código; si no, devuelve un reto falso (id aleatorio que no se guarda; verificarlo
  da `410`). Así no revela si hay cuenta. Una cuenta solo-Google también puede: así se crea una contraseña.
  Para no delatar la cuenta por el resultado: aquí un fallo de Brevo o el límite diario **no** cambian la respuesta (se
  registran en el log y quien tenga cuenta puede reenviar), y `/challenges/:id/resend` de un reto falso responde `204`
  igual que uno real. Queda una diferencia de tiempo de respuesta (el real espera a Brevo); se acepta, porque el
  registro ya revela qué correos tienen cuenta con `EMAIL_TAKEN`.
- 2FA desde Perfil (con sesión, `requireAuth`):
  - `POST /me/2fa/enable` `{ password }` → contraseña incorrecta → `400 WRONG_PASSWORD` (no `401`: el interceptor de la
    app cierra la sesión con cualquier `401`); cuenta sin contraseña → `409 PASSWORD_REQUIRED`; si no, manda el código
    `ENABLE_2FA` y devuelve `{ challenge }`; se confirma con
    `/challenges/:id/verify` (exige que el JWT sea del mismo usuario del reto).
  - `POST /me/2fa/disable` `{ password }` → contraseña correcta → `two_factor_enabled = false`, `204`; incorrecta →
    `400 WRONG_PASSWORD`; cuenta sin contraseña → `409 PASSWORD_REQUIRED`.
- `CurrentUser` gana `emailVerified`, `twoFactorEnabled`, `hasPassword`, `hasGoogle`.

### Sesiones

- El JWT incluye `sv` (= `session_version`); `requireAuth` ya lee la fila del usuario en cada petición y ahora también
  compara `sv`: distinto → `401`. Recuperar la contraseña cierra así todas las sesiones anteriores (incluido el celular
  de quien robó la cuenta). Los JWT ya emitidos sin `sv` cuentan como `sv = 0` (nadie pierde la sesión al actualizar).
- `requireAuth` **no** necesita mirar `email_verified`: con el enfoque A una cuenta sin verificar nunca tiene JWT. Las
  cuentas que ya existen quedan verificadas por la migración.
- `make-admin` y la semilla crean cuentas verificadas.

### Envío de correos (Brevo)

- `EmailClient.send({ to, subject, text, html })`. Implementación real: `POST https://api.brevo.com/v3/smtp/email`
  con cabecera `api-key`, sin SDK, timeout de 10 s.
- Sin `BREVO_API_KEY` (desarrollo y tests) se usa un cliente de consola que escribe el código en el log del backend;
  los tests usan un doble que guarda los correos. En producción (`NODE_ENV=production`) arrancar sin `BREVO_API_KEY` es
  un error de configuración (zod).
- El envío es en el momento, dentro de la petición, **después** de guardar el reto. Si Brevo falla: `503
  EMAIL_SEND_FAILED` «No pudimos enviar el correo. Intenta reenviar el código en un momento.» y el reto queda vivo
  (se puede reenviar sin esperar los 60 s, porque `last_sent_at` solo se actualiza si el envío salió).
- Remitente: `BREVO_SENDER_EMAIL` y `BREVO_SENDER_NAME` («HueckoApp»). Correos en texto plano + HTML simple: asunto
  «Tu código de HueckoApp: 123456», cuerpo con el código, para qué es y que vence en 15 minutos.

### App

- **Login / Registro**: tras enviar, si la respuesta trae `challenge` se abre la pantalla **«Escribe el código»**
  (fuera de la sesión): 6 casillas, texto «Te enviamos un código a a***@gmail.com», «Reenviar código» con cuenta atrás,
  errores de `CODE_INVALID` / `CHALLENGE_EXPIRED`. Al verificar llega `{ token, user }` y se inicia sesión como hoy.
- **«¿Olvidaste tu contraseña?»** en Login → pide el correo → pantalla del código con dos campos más (contraseña nueva y
  repetir) → entra con sesión nueva.
- **Continuar con Google** en Login y Registro (`@react-native-google-signin/google-signin`, config plugin en
  `app.json`, `webClientId` desde `app.json` `extra`, que no es secreto). Oculto en Expo Go. Cancelar no muestra error.
- **Perfil**: interruptor «Verificación en dos pasos» (activar → pantalla del código; desactivar → pide la contraseña).
  Deshabilitado con explicación si la cuenta no tiene contraseña.
- **Cerrar sesión** también cierra la sesión de Google en el celular (para poder elegir otra cuenta).

### Documentación

- `docs/api.md` (todos los endpoints nuevos y la nueva forma de login/registro) y `shared/index.d.ts`.
- **Guía única de puesta en marcha** `docs/puesta-en-marcha.md` (pedido explícito del usuario, antes del APK), en orden:
  Firebase (push), Google Cloud (pantalla de consentimiento, cliente Android con SHA-1 de `eas credentials`, cliente
  Web), Brevo (cuenta, remitente, clave), variables de Render y de GitHub, consultas de control en Neon de **todas** las
  fases (1, 4, 5 y esta), orden de integración de los PR #43–#50 y release, desplegar el backend antes del APK, `eas
  build` y la prueba en dos celulares con una lista por función. Enlaza a `docs/despliegue.md` y
  `docs/guia-de-pruebas.md` en vez de duplicarlos.
- README (funciones y totales de tests).

## Lo que queda a quien lo construya

- Partir el trabajo en tareas y el orden (sugerido: datos + retos + email → login/registro/verify → recuperar → Google →
  2FA → app → documentación).
- Nombres internos, estructura de archivos dentro de `backend/src/auth/` y de `mobile/src/screens/auth/`.
- Textos exactos de los errores no fijados aquí (en español, tono actual).
- Diseño visual de la pantalla del código.

## Decisiones tomadas por Claude (a revisar por el usuario)

- Cuentas existentes verificadas automáticamente; mismo correo con Google se vincula.
- Código de 6 dígitos, 15 min, 5 intentos, reenvío cada 60 s y como mucho 5 por reto.
- Recuperar la contraseña cierra todas las sesiones anteriores y también verifica el correo.
- Registro con un correo existente sin verificar reemplaza los datos y reenvía el código.
- HMAC en vez de bcrypt para los códigos; envío síncrono con error `503` reintentable.
- Vincular Google a una cuenta sin verificar borra su contraseña y su 2FA.
- Activar y desactivar el 2FA piden la contraseña; error `400 WRONG_PASSWORD` (no `401`).
- Reutilizar el reto vivo si se envió hace menos de 60 s, y 10 correos por cuenta cada 24 h.
- «Olvidé mi contraseña» responde igual aunque Brevo falle o se pase el límite; se acepta la diferencia de tiempo.
- Recuperar la contraseña borra los celulares registrados para push.
