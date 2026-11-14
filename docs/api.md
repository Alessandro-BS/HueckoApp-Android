# Contrato de la API REST de HueckoApp

Este documento es el acuerdo entre `mobile/` y `backend/`. Si un endpoint cambia, se cambia **aquí primero** (en el mismo PR que el código), para que el otro lado se entere.

- **URL base (desarrollo):** `http://localhost:3000/api`
  - Emulador Android: `http://10.0.2.2:3000/api`
  - Celular físico: `http://<IP-de-tu-PC-en-la-red>:3000/api`
- **Formato:** JSON en UTF-8, salvo el OCR, que recibe `multipart/form-data`.
- **Autenticación:** cabecera `Authorization: Bearer <token>` en todo lo que no sea `/auth/register`, `/auth/login` o `/health`.

## Convenciones

| Dato | Formato | Ejemplo |
|---|---|---|
| IDs | string (UUID) | `"3f2b8c1e-5a4d-4e6f-9b7a-1c2d3e4f5a6b"` |
| Fecha y hora | ISO 8601 en UTC | `"2026-10-05T18:00:00.000Z"` |
| Fecha sola | `YYYY-MM-DD` | `"2026-10-05"` |
| Hora del día | `HH:mm` (24 h) | `"14:30"` |
| Día de la semana | entero 1–7 (1 = lunes, 7 = domingo) | `3` |

### Errores

Todos los errores tienen la misma forma:

```json
{ "error": { "code": "VOTING_CLOSED", "message": "La votación ya cerró", "details": null } }
```

| HTTP | Cuándo |
|---|---|
| 400 | Datos inválidos (`details` trae los campos que fallaron) |
| 400 | Subida del OCR: `IMAGE_REQUIRED` (falta la imagen), `INVALID_IMAGE` (no es JPG/PNG/WEBP), `INVALID_UPLOAD` (campos de más o multipart roto) |
| 400 | `INVALID_JSON`: el cuerpo de la petición no es JSON válido |
| 401 | Falta el token, expiró o la cuenta ya no existe → la app vuelve al login |
| 403 | Autenticado pero sin permiso (p. ej. no es miembro del grupo; `NOT_ORGANIZER`: la acción es solo de organizadores del grupo; `NOT_A_VOTER`: no está entre quienes votan la votación exprés de un plan de su grupo). `ACCOUNT_SUSPENDED`: la cuenta está suspendida (en el login y con cualquier token) → la app cierra sesión y muestra el mensaje. `NOT_ADMIN`: ruta de administración y la cuenta no es `ADMIN` |
| 404 | No existe, o no es visible para este usuario |
| 409 | Conflicto de reglas: email ya registrado, ya es miembro, votación cerrada, de fecha o exprés (`VOTING_CLOSED`), nadie votó (`NO_VOTES`), el estado del plan no lo permite (`INVALID_STATE`; también si otra petición lo cambió justo antes: el estado se comprueba al escribir), franja repetida (`WINDOW_EXISTS`), plan sin franjas y con menos de 2 huecos en común en la semana (`NO_COMMON_WINDOWS`), confirmar una franja que ya empezó (`WINDOW_STARTED`), quitarle el rol al último organizador de un grupo (`LAST_ORGANIZER`), un bloque del horario que se solapa con otro (`TIME_BLOCK_OVERLAP`); en administración, cambiarse a uno mismo (`CANNOT_CHANGE_SELF`) o dejar la app sin administradores activos (`LAST_ADMIN`) |
| 413 | `PAYLOAD_TOO_LARGE`: la petición supera el tamaño máximo (1 MB; 5 MB la imagen del OCR) |
| 429 | `TOO_MANY_REQUESTS`: demasiados intentos por IP cada 15 min en `/auth/login` (20), en `/auth/register` (10) o con los códigos (`/auth/password/forgot`, `/auth/challenges/:id/verify` y `/resend`, 30), con contadores separados, o demasiadas llamadas a la IA (20 cada 15 min por usuario), o demasiados avisos de proximidad (10 por minuto por usuario) |
| 400/410/429/503 | Códigos por correo: `CODE_INVALID`, `CHALLENGE_EXPIRED`, `RESEND_TOO_SOON`, `EMAIL_DAILY_LIMIT`, `EMAIL_SEND_FAILED` (ver «Autenticación» → «Códigos por correo») |
| 500 | Error inesperado del servidor |
| 502 | `AI_BAD_RESPONSE`: la IA respondió algo que no cumple el formato esperado |
| 503 | `AI_UNAVAILABLE`: la IA no respondió (proveedor caído o más de 30 s) |

### Límites e IP del cliente
Los límites de `/auth` son **por IP**, con contadores separados para login (`LOGIN_RATE_LIMIT`, 20), registro (`REGISTER_RATE_LIMIT`, 10) y códigos (`CODE_RATE_LIMIT`, 30: verificar y reenviar) cada 15 min. Si el backend está detrás de un proxy (Render, Railway, nginx…), `TRUST_PROXY` debe decir cuántos hay (normalmente `1`) para que la IP salga de `X-Forwarded-For`; con `false` (por defecto) esa cabecera se ignora.

---

## Tipos

Los tipos de cada respuesta están definidos **una sola vez** en [`shared/index.d.ts`](../shared/index.d.ts) y los importan tanto la app como el backend:

```ts
import type { Group, Proposal, TimeBlock } from '@hueckoapp/shared';
```

Resumen de las entidades:

| Tipo | Qué es |
|---|---|
| `User` | Usuario (`id`, `name`, `email`) |
| `CurrentUser` | Quien inició sesión: `User` + `role` (`USER`/`ADMIN`) + `emailVerified`, `twoFactorEnabled`, `hasPassword`, `hasGoogle`. Solo lo devuelven `/auth/login`, `/auth/challenges/:id/verify` y `/auth/me` |
| `AuthResult` / `Challenge` / `ChallengePurpose` | Respuesta de registro y login: la sesión o un reto con código por correo (ver «Autenticación») |
| `TimeBlock` | Bloque de horario: recurrente (`dayOfWeek`) o puntual (`date`) |
| `GroupSummary` / `Group` | Grupo; el detalle incluye `inviteCode` y `members` |
| `GroupMember` | Usuario + `role` (`ORGANIZER`/`MEMBER`) + `isEssential` |
| `MatchWindow` | Franja libre en común con su % de coincidencia |
| `Proposal` | Propuesta de plan con ventanas, votos, ubicación e incidencias |
| `TimeWindow` | Ventana horaria votable dentro de una propuesta: fecha concreta (`date` `YYYY-MM-DD` en `America/Lima`) y su `dayOfWeek` |
| `Incidence` | Imprevisto reportado sobre un plan confirmado (con `criticalReason` si es una ausencia crítica) |
| `ExpressVote` | Votación exprés del grupo tras una ausencia crítica (`Proposal.expressVote`) |
| `Location` | Lugar con nombre y coordenadas opcionales |
| `ProposalWithGroup` | `Proposal` + `groupName` |
| `UpcomingPlan` / `Attendee` | Próximo plan con la asistencia prevista de cada miembro |
| `Dashboard` | Resumen de «Inicio» (`GET /me/dashboard`) |
| `AiStatus` | Si la IA del servidor es Gemini o el modo demostración |
| `AiTask` | Función de la app que llamó a la IA (estadísticas) |
| `ScheduleOcrResult` | Bloques leídos de una foto, sin guardar |
| `ProposalDraft` / `PlanSuggestion` / `PlanCategory` | Borrador e ideas de plan de la IA (sin guardar) |
| `VotingSummary` | Resumen de una votación con una recomendación de la IA |
| `Page<T>` | Lista paginada de administración (`items`, `page`, `pageSize`, `total`) |
| `AdminUserSummary` / `AdminUserDetail` | Cuenta vista por la administración (rol, estado, grupos, actividad) |
| `AdminGroupSummary` / `AdminGroupDetail` / `AdminProposalSummary` | Grupo y propuestas vistos por la administración |
| `AuditEntry` | Una acción del registro de administración |
| `AdminStats` / `Timeseries` / `PopularHours` / `AdminReport` | Estadísticas e informe de un periodo (calculados en el servidor) |

---

## Salud

### `GET /health`
Sin autenticación. Responde `200 { "status": "ok" }`.

## Autenticación

**Sin código no hay JWT:** una cuenta recibe su token solo después de confirmar su correo con el código que le mandamos. `/auth/register` y `/auth/login` responden un `AuthResult`:

```ts
type AuthResult = { token: string; user: CurrentUser }   // sesión (AuthResponse)
                | { challenge: Challenge };              // hay que escribir el código del correo antes
type Challenge = { id: string; purpose: ChallengePurpose; emailHint: string; resendAvailableAt: string };
type ChallengePurpose = 'VERIFY_EMAIL' | 'LOGIN_2FA' | 'RESET_PASSWORD' | 'ENABLE_2FA';
```

`emailHint` es el correo enmascarado («a***@gmail.com»); `resendAvailableAt` (ISO), desde cuándo se puede pedir otro código. Con un `challenge`, la app abre «Escribe el código» y lo confirma con `POST /auth/challenges/:id/verify`.

### `POST /auth/register`
```json
{ "name": "Ana", "email": "ana@correo.com", "password": "min 8 caracteres" }
```
`password` entre 8 y 72 caracteres. El correo se guarda con `trim` y en minúsculas.

Crea la cuenta **sin verificar**, manda el código `VERIFY_EMAIL` y responde `201 { "challenge": Challenge }` (sin token). La cuenta nace siempre con `role: "USER"` (un `role` en el cuerpo se ignora).
- Correo que ya existe **sin verificar y sin Google** → en vez de `409` se reemplazan el nombre y la contraseña, se anulan los códigos pendientes y se manda uno nuevo (otro `id`, aunque no hayan pasado 60 s): `201 { challenge }`. Así nadie se queda con un correo ajeno registrándolo primero, y el código que ya tenía la dueña del correo no confirma la cuenta con la contraseña de otra persona.
- Correo ya verificado (o vinculado a Google) → `409 EMAIL_TAKEN`.
- `503 EMAIL_SEND_FAILED` o `429 EMAIL_DAILY_LIMIT` (ver «Códigos por correo»): la cuenta queda creada sin verificar; volver a registrarse con el mismo correo lo reintenta.

### `POST /auth/login`
```json
{ "email": "ana@correo.com", "password": "..." }
```
- Cuenta verificada → `200 { "token": "<jwt>", "user": CurrentUser }`.
- Cuenta sin verificar (y contraseña correcta) → `200 { "challenge": Challenge }` con `purpose: "VERIFY_EMAIL"` y un código nuevo en el correo (o el mismo reto si se mandó hace menos de 60 s). Puede dar `503 EMAIL_SEND_FAILED` o `429 EMAIL_DAILY_LIMIT`.
- Cuenta verificada con **verificación en dos pasos** activa (y contraseña correcta, no suspendida) → `200 { "challenge": Challenge }` con `purpose: "LOGIN_2FA"` y el código en el correo, **sin `token`**. Con contraseña incorrecta es `401` y no se manda ningún correo. Mismos `503`/`429` que arriba.
- `401 INVALID_CREDENTIALS` · `403 ACCOUNT_SUSPENDED`.

El `401 INVALID_CREDENTIALS` lleva el mensaje «Correo o contraseña incorrectos.» y es igual si el correo no existe o si la cuenta no tiene contraseña (creada con Google). `403 ACCOUNT_SUSPENDED` («Tu cuenta está suspendida. Si crees que es un error, escribe al equipo de HueckoApp.») solo sale si la contraseña es correcta; con una incorrecta la respuesta es el mismo `401`.

### `POST /auth/google`
```json
{ "idToken": "<idToken de Google>" }
```
Entra (o crea la cuenta) con un idToken de Google verificado en el servidor contra `GOOGLE_WEB_CLIENT_ID`. Comparte el límite por IP de `/auth/login`.
- Busca por `google_sub`; si no hay, por el correo (en minúsculas) y vincula la cuenta. Sin cuenta, la crea (nombre de Google recortado a 80 caracteres, sin contraseña, verificada).
- Correo de una cuenta **ya verificada** → se vincula y conserva su contraseña y su verificación en dos pasos.
- Correo de una cuenta **sin verificar** (alguien la registró sin demostrar que el correo es suyo) → se vincula, pierde la contraseña y la verificación en dos pasos, toma el nombre de Google y se anulan sus códigos pendientes.
- No pide el segundo paso: Google ya autenticó a la persona. Responde `200 { "token": "<jwt>", "user": CurrentUser }`.
- `401 GOOGLE_TOKEN_INVALID` (token inválido o correo de Google sin verificar) · `409 GOOGLE_ACCOUNT_MISMATCH` («Ese correo ya está vinculado a otra cuenta de Google.») · `403 ACCOUNT_SUSPENDED` · `503 GOOGLE_NOT_CONFIGURED` (el servidor no tiene `GOOGLE_WEB_CLIENT_ID`) · `400 VALIDATION_ERROR`.

### `POST /auth/password/forgot`
```json
{ "email": "ana@correo.com" }
```
**Siempre** `202 { "challenge": Challenge }` con `purpose: "RESET_PASSWORD"` (nunca trae `token`), exista o no una cuenta con ese correo, falle o no el envío (Brevo) y se haya pasado o no el límite diario: no revela qué correos tienen cuenta. `emailHint` sale del correo escrito y `resendAvailableAt` es ahora + 60 s. Si hay cuenta (también la creada solo con Google o sin verificar) se manda el código; si no, el reto es falso: no se guarda ni se envía nada, `verify` de ese id da `410` y `resend` da `204`. Un correo mal escrito es `400 VALIDATION_ERROR`; comparte el límite por IP de los códigos (`429 TOO_MANY_REQUESTS`).

### `POST /auth/challenges/:id/verify`
```json
{ "code": "123456", "newPassword": "solo al recuperar la contraseña" }
```
`code`: 6 dígitos (se admiten espacios alrededor). Un formato malo es `400 VALIDATION_ERROR` y **no gasta intento**. `newPassword` (mismas reglas que la contraseña del registro) es **obligatorio** en un reto `RESET_PASSWORD` (si falta o no cumple, `400 VALIDATION_ERROR` sin gastar intento). Solo se usa con `RESET_PASSWORD`; en los demás propósitos no hace nada, pero si se envía debe cumplir esas reglas (si no, `400 VALIDATION_ERROR`).

- Código correcto en un reto `VERIFY_EMAIL` → marca el correo como verificado y responde `200 { "token": "<jwt>", "user": CurrentUser }`. Si la cuenta está suspendida, el correo queda verificado igual pero responde `403 ACCOUNT_SUSPENDED` sin token.
- Código correcto en un reto `RESET_PASSWORD` → guarda la contraseña nueva, sube la versión de sesión (**todos los tokens anteriores dan `401`**), marca el correo como verificado (también si la cuenta era solo de Google: ahora tiene contraseña) y borra los celulares registrados para avisos push; responde `200 { "token": "<jwt nuevo>", "user": CurrentUser }`. Si la cuenta está suspendida, el cambio se aplica igual pero responde `403 ACCOUNT_SUSPENDED` sin token.
- Código incorrecto → `400 CODE_INVALID` con `details: { "attemptsLeft": n }`.
- Quinto fallo, reto vencido, ya usado o inexistente → `410 CHALLENGE_EXPIRED` («Pide un código nuevo.»).
- Código correcto en un reto `LOGIN_2FA` → `200 { "token": "<jwt>", "user": CurrentUser }`. Si la cuenta está suspendida, `403 ACCOUNT_SUSPENDED` sin token.
- Código correcto en un reto `ENABLE_2FA` → activa la verificación en dos pasos y responde `204` (sin cuerpo ni token). Este reto exige además `Authorization: Bearer <jwt>` válido (mismas reglas que cualquier ruta con token, incluida la versión de sesión) **de la misma cuenta del reto**; sin token, con uno inválido o de otra persona responde `410 CHALLENGE_EXPIRED` **sin gastar intento** (nunca `401`: la app cierra sesión con cualquier `401`) y el código sigue valiendo para su dueña.

### `POST /auth/challenges/:id/resend`
Sin cuerpo. Manda un código nuevo (el anterior deja de valer, los intentos vuelven a 0 y el vencimiento se extiende) → `204`.
`429 RESEND_TOO_SOON` con `details: { "retryAfterSeconds": n }` · `429 EMAIL_DAILY_LIMIT` · `503 EMAIL_SEND_FAILED` · `410 CHALLENGE_EXPIRED` (vencido, usado o ya se reenvió 5 veces). Un id que no existe en la base responde `204` sin enviar nada (así un reto falso de `/auth/password/forgot` no se delata).

### `POST /auth/me/2fa/enable`
Requiere token. `PasswordInput`:
```json
{ "password": "la contraseña actual" }
```
Cuenta con contraseña correcta → `200 { "challenge": Challenge }` con `purpose: "ENABLE_2FA"` y el código en el correo; la app lo confirma con `POST /auth/challenges/:id/verify` mandando también el token (ver arriba), y entonces `twoFactorEnabled` pasa a `true`.
- `400 WRONG_PASSWORD` (contraseña incorrecta; nunca `401`) · `409 PASSWORD_REQUIRED` (cuenta sin contraseña, creada con Google: primero debe crear una con «¿Olvidaste tu contraseña?») · `503 EMAIL_SEND_FAILED` · `429 EMAIL_DAILY_LIMIT` · `409 TWO_FACTOR_ALREADY_ENABLED` («La verificación en dos pasos ya está activada.»; se comprueba después de la contraseña, sin reto ni correo) · `429 TOO_MANY_REQUESTS` (límite propio, ver abajo) · `400 VALIDATION_ERROR` (falta `password`).
- No cambia la versión de sesión: el token actual sigue valiendo.

### `POST /auth/me/2fa/disable`
Requiere token. Mismo cuerpo `PasswordInput`. Contraseña correcta → desactiva la verificación en dos pasos y responde `204`; después `/auth/login` vuelve a dar el token directo. Mismos errores `400 WRONG_PASSWORD`, `409 PASSWORD_REQUIRED` y `429 TOO_MANY_REQUESTS`. No cambia la versión de sesión.

**Límite de `enable` y `disable`:** comparten un cupo de **5 intentos cada 15 min por cuenta** (no por IP; se cuenta tras validar el token) → `429 TOO_MANY_REQUESTS`; otra cuenta en la misma IP no se ve afectada.

### Códigos por correo
- 6 dígitos, valen **15 minutos**, **5 intentos** (el quinto fallo quema el reto).
- Reenvío cada **60 s** como mucho, y como mucho **5 envíos** por reto.
- Como mucho **10 correos por cuenta cada 24 h** (todos los propósitos) → `429 EMAIL_DAILY_LIMIT` («Ya te enviamos muchos códigos hoy. Inténtalo mañana.»).
- Pedir un código otra vez al entrar (login) antes de 60 s reutiliza el reto vivo sin mandar otro correo. Registrarse otra vez sobre un correo sin verificar nunca lo reutiliza (ver `POST /auth/register`).
- Si el correo no sale: `503 EMAIL_SEND_FAILED` («No pudimos enviar el correo. Intenta reenviar el código en un momento.»); el reto queda vivo y se puede reenviar sin esperar.
- `forgot`, `verify` y `resend` comparten un límite por IP (`CODE_RATE_LIMIT`, 30 cada 15 min) → `429 TOO_MANY_REQUESTS`.

### `GET /auth/me`
`200 CurrentUser` (`{ id, name, email, role, emailVerified, twoFactorEnabled, hasPassword, hasGoogle }`). La app lo usa al abrir para comprobar si el token guardado sigue siendo válido y para saber si mostrar «Administración». También lo vuelve a pedir **al volver a primer plano** y cuando una petición responde `403 NOT_ADMIN` (le quitaron el rol): así un cambio de rol se ve sin reabrir la app.

`hasPassword`: la cuenta puede entrar con contraseña (una creada con Google no tiene); `hasGoogle`: está vinculada a Google.

### Rol y estado de la cuenta
Cada cuenta tiene `role` (`USER` o `ADMIN`) y `status` (`ACTIVE` o `SUSPENDED`). El JWT solo identifica a la persona (`sub`) y la versión de su sesión (`sv`): **en cada petición con token el servidor lee el rol, el estado y la versión de sesión de la base**, así que un cambio surte efecto al instante, sin esperar a que caduque el token (un `role` metido en el JWT no cuenta).
- Cuenta suspendida → `403 ACCOUNT_SUSPENDED` en cualquier ruta con token y en el login; la app cierra sesión.
- Token de una cuenta que ya no existe → `401 UNAUTHORIZED`.
- `sv` distinto de la versión de sesión de la cuenta → `401 UNAUTHORIZED` (así se cierran todas las sesiones anteriores, p. ej. al recuperar la contraseña). Un token emitido antes de que existiera `sv` cuenta como versión `0`.
- Solo las cuentas `ADMIN` entran en `/admin/...` (`403 NOT_ADMIN`). Nadie se hace administrador por la API (ver «Administración»).
- Las cuentas que ya existían antes de la verificación del correo y las de la semilla están verificadas, y `make-admin` verifica el correo de la cuenta que nombra administradora: todas entran con su contraseña sin pedir código.

> **Cerrar sesión** se hace en la app: se borra el token de `SecureStore`. No hay endpoint.

## Mi horario

### `GET /me/time-blocks`
`200 TimeBlock[]`, solo los del usuario autenticado. Orden: recurrentes por día y hora de inicio; después los puntuales por fecha y hora.

### `POST /me/time-blocks`
```json
{ "label": "Clase de Android", "type": "CLASE", "startTime": "08:00", "endTime": "10:00",
  "isRecurring": true, "dayOfWeek": 1, "date": null }
```
Cuerpo = `TimeBlockInput` de `shared`. Reglas:
- `label` obligatorio, 1–80 caracteres tras `trim`.
- `type` ∈ `CLASE | TRABAJO | LIBRE | PUNTUAL`.
- `startTime` y `endTime` en `HH:mm` de 00:00 a 23:59 con dos dígitos (`8:00` y `24:00` no valen); `startTime < endTime`.
- Recurrente (`isRecurring: true`): `dayOfWeek` 1–7 obligatorio; `date` `null` u omitido.
- Puntual (`isRecurring: false`): `date` `YYYY-MM-DD` real obligatorio; `dayOfWeek` `null` u omitido.
- `userId` lo pone el servidor desde el token (si viene en el cuerpo, se ignora).
- **Sin solapes:** un bloque no puede cruzarse con otro del mismo usuario (de cualquier tipo, `LIBRE` incluido). Las horas se cruzan de forma estricta (08:00–10:00 y 10:00–12:00 no se solapan). Chocan dos recurrentes del mismo día, dos puntuales de la misma fecha, y un puntual con un recurrente si la fecha cae en el día de la semana del recurrente. Se comprueba al guardar, con el usuario bloqueado, así que dos guardados a la vez no se cuelan. Los solapes ya guardados antes de esta regla siguen funcionando (`GET` no cambia).

`201 TimeBlock` · `400 VALIDATION_ERROR` (`details[].path` indica el campo) · `409 TIME_BLOCK_OVERLAP` «Se solapa con «Cálculo II» (lunes 08:00–11:00).» (o «… (16/11/2026 09:00–10:00).» si es puntual), con `details: { blockId }` del bloque guardado con el que choca

### `POST /me/time-blocks/bulk`
`{ "blocks": [ ...mismo cuerpo que arriba... ] }` → `201 TimeBlock[]`. Entre 1 y 100 bloques. **Todo o nada:** si uno es inválido responde `400` (con `path` tipo `["blocks", 1, "endTime"]`) y no se guarda ninguno. Lo usa la pantalla de revisión del OCR. Con solapes responde `409 TIME_BLOCK_OVERLAP` y no se guarda ninguno: si el bloque `i` choca con uno ya guardado, `details: { path: ["blocks", i], blockId }`; si choca con otro del mismo lote (anterior), el mensaje nombra ese otro bloque y `details: { path: ["blocks", i], otherIndex }`.

### `PUT /me/time-blocks/:id`
Cuerpo = `TimeBlockInput` (mismas reglas que `POST`). Reemplaza el bloque. `200 TimeBlock` · `400 VALIDATION_ERROR` · `404 TIME_BLOCK_NOT_FOUND` «Bloque no encontrado.» (no existe o no es del usuario) · `409 TIME_BLOCK_OVERLAP` (igual que en `POST`; el bloque editado no choca consigo mismo).

### `DELETE /me/time-blocks/:id`
`204` · `404 TIME_BLOCK_NOT_FOUND` si el bloque no existe o no es del usuario.

### `GET /me/upcoming-plans`
`200 ProposalWithGroup[]`: propuestas `CONFIRMADO` de todos mis grupos cuyo `scheduledAt` todavía no llegó, de la más próxima a la más lejana. Cada una lleva `groupName`. Antes de responder cierra las votaciones de franjas vencidas de mis grupos (ver «Cierre automático») y después las votaciones exprés vencidas (ver «Votación exprés»).

### `GET /me/dashboard`
Todo lo que necesita «Inicio» en una sola llamada: `200 Dashboard`. Antes de calcularlo cierra las votaciones de franjas vencidas de mis grupos (ver «Cierre automático») y después las votaciones exprés vencidas (ver «Votación exprés»).
- `metrics.activeGroups`: grupos de los que soy miembro.
- `metrics.openVotes`: propuestas `PROPUESTO` de mis grupos (las vencidas se cierran antes de calcular: son las que siguen en votación).
- `metrics.matchingHours`: suma, sobre las franjas de las propuestas de mis grupos **que no están `CANCELADO`** (cualquier otro estado cuenta, también `EN_RECOORDINACION`) con `availabilityPercentage ≥ 80` (fijo, no el umbral del grupo), de `hora(endTime) − hora(startTime)` en horas enteras (se truncan los minutos), sin deduplicar solapes. Es la fórmula de la app Kotlin salvo que aquí las canceladas no cuentan.
- `metrics.totalBlocks`: mis bloques de horario (recurrentes y puntuales).
- `nextPlan`: el primero de `/me/upcoming-plans` con `attendees`, uno por miembro del grupo; su estado sale de su primera incidencia sin resolver: `TARDANZA` → `RETRASADO`, `FALTA`/`IMPREVISTO` → `NO_ASISTE`, ninguna → `PUNTUAL`. `null` si no hay.
- `groups`: uno por grupo (en el orden de `GET /groups`), con `nextWindow` (`date`, `dayOfWeek`, `startTime`, `endTime`, `availabilityPercentage`) = la franja elegida (o, si no hay, la primera) de su propuesta **más reciente** que no esté `CANCELADO` y tenga franjas. «Más reciente» = mayor `createdAt`; a igual `createdAt`, la creada después (el orden de `GET /groups/:id/proposals`). `null` si no hay ninguna.
- `pendingVotes`: propuestas `PROPUESTO` de mis grupos con `groupName`, las que cierran antes primero.
- `expressAlert`: por prioridad: el primer plan que aún no ocurrió con votación exprés `ABIERTA` (`kind: "VOTACION"`; `who` y `reason` son los de la votación, quien reportó y su motivo, y `expiresAt` es cuándo vence), si no el primero `EN_RECOORDINACION` (`kind: "RECOORDINACION"`, aunque su fecha vieja ya pasara: sigue atascado hasta que se replantee; `who`/`reason` salen de su votación exprés más reciente y, si no tiene, de su incidencia sin resolver más crítica), si no el primero que aún no ocurrió `CONFIRMADO` con incidencias sin resolver (`kind: "AVISO"`, una ausencia que no es crítica; `who`/`reason` de su incidencia sin resolver más crítica: `ALTA` primero, si no la más antigua). `expiresAt` es `null` salvo en `VOTACION`. `canResolve` es el `canManage` del plan para mí. `canVote` es, en `VOTACION`, el `canVote` de esa votación para mí (`false` si soy quien avisó o no estaba en el grupo al abrirse: la app ofrece «Ver votación» en vez de «Votar»); `false` en los demás `kind`. `null` si no hay.

El «horario de hoy» no viene aquí: depende de la zona horaria del teléfono, así que la app lo calcula con `GET /me/time-blocks`.

## Grupos

### `GET /groups`
`200 GroupSummary[]`: grupos de los que soy miembro, en el orden en que me uní.

### `POST /groups`
```json
{ "name": "Proyecto Integrador", "description": "", "availabilityThreshold": 80 }
```
`name` obligatorio (1–60 tras `trim`); `description` opcional (≤ 200, por defecto `""`); `availabilityThreshold` entero 0–100 (por defecto 80).
El servidor genera el `inviteCode`: **8 caracteres** de `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (sin `0/O/1/I`), único. Los códigos de la semilla (`PROY2026`, `HUECKO123`) no siguen ese formato y siguen siendo válidos. El creador queda como `ORGANIZER`. `201 Group`

### `POST /groups/join`
`{ "inviteCode": "PROY2026" }` → `200 Group`. El código se normaliza con `trim` y mayúsculas (`" proy2026 "` sirve).
`404 INVALID_INVITE_CODE` «Código de invitación inválido.» · `409 ALREADY_MEMBER` «Ya perteneces a este grupo.» · `400` si viene vacío.

### `GET /groups/:id`
`200 Group` con la lista completa de miembros, en orden de llegada.
`404 GROUP_NOT_FOUND` si no existe · `403 NOT_A_MEMBER` si existe pero no soy miembro. (Igual en todas las rutas `/groups/:id/...`.)

### `PATCH /groups/:id`
Solo un `ORGANIZER` (`403 NOT_ORGANIZER` «Solo un organizador del grupo puede hacer esto.»). Campos opcionales con las mismas reglas que al crear: `name`, `description`, `availabilityThreshold`; hay que enviar al menos uno. `200 Group`

### `PATCH /groups/:id/members/:userId`
Cambia a un miembro: si es imprescindible y/o su rol. Cuerpo = `UpdateMemberInput`: `{ "isEssential"?: boolean, "role"?: "ORGANIZER" | "MEMBER" }`, al menos uno de los dos; si llegan los dos se aplican juntos (o ninguno).
- Solo un `ORGANIZER`, que puede cambiar a cualquiera del grupo: nombrar organizador a un miembro, quitarle el rol a otro organizador (también al creador del grupo) o quitárselo a sí mismo, y marcar imprescindible a cualquiera (también a sí mismo).
- **Nunca sin organizadores:** quitarle el rol al último `ORGANIZER` → `409 LAST_ORGANIZER` «El grupo necesita al menos un organizador.» y no se cambia nada (tampoco el `isEssential` del mismo cuerpo). Se comprueba con el grupo bloqueado, como al salir (y ahí también se vuelve a comprobar que quien actúa sigue siendo `ORGANIZER`: si otro le quitó el rol justo antes, `403 NOT_ORGANIZER`): si dos organizadores se quitan el rol a la vez, o uno se lo quita mientras el otro sale del grupo, el segundo ve lo que dejó el primero.
- Comprobaciones en este orden: `404 GROUP_NOT_FOUND` · `403 NOT_A_MEMBER` · `403 NOT_ORGANIZER` · `400 VALIDATION_ERROR` (cuerpo vacío, «Envía isEssential o role»; `isEssential` que no es booleano; `role` distinto de `ORGANIZER`/`MEMBER`) · `404 MEMBER_NOT_FOUND` «Esa persona no pertenece al grupo.» · `409 LAST_ORGANIZER`.

`200 GroupMember` con los cambios aplicados.

### `DELETE /groups/:id/members/me`
Salir del grupo. `204`. Si sale el último `ORGANIZER` y quedan miembros, pasa a `ORGANIZER` quien lleva más tiempo en el grupo. Si no queda nadie, el grupo se borra. Sus votos se conservan, pero no cuentan mientras no vuelva (ver `GET /proposals/:id`). Sus propuestas siguen en el grupo y las gestionan los `ORGANIZER` (ver «Quién gestiona un plan»).

### `GET /groups/:id/availability`
Cruce de horarios de todos los miembros **en una semana concreta**, calculado en el servidor con el umbral del grupo (mismo algoritmo que `AvailabilityMatcher.kt`, aplicado día a día).
Query `?week=YYYY-MM-DD` (opcional): cualquier día se normaliza a su lunes; por defecto, la semana actual (zona America/Lima). Solo valen esta semana y las 3 siguientes: otra → `400 VALIDATION_ERROR` («Elige una semana entre esta y las próximas 3»).
`200 MatchWindow[]`, cada una con su `date` (`YYYY-MM-DD`), ordenadas por fecha y hora · `400 VALIDATION_ERROR` · `403 NOT_A_MEMBER` · `404 GROUP_NOT_FOUND`.

Reglas:
- La agenda va de **08:00 a 20:00** en horas enteras; cada hora `h` es la franja `[h:00, h+1:00)`.
- Un bloque ocupa **entera** cualquier hora que toque: el inicio trunca minutos (`10:30` → 10) y el fin redondea hacia arriba (`10:30` → 11).
- Por hora: `libres = miembros − personas ocupadas` (una persona cuenta una vez aunque tenga bloques solapados); `% = round(libres × 100 / miembros)`.
- Una hora vale si `% ≥ availabilityThreshold` (inclusivo). Las horas válidas seguidas se fusionan en una franja, que muestra el **peor** `%` y el **menor** `freeMembers` de sus horas.
- Cada día cuenta los bloques **recurrentes** de ese día de la semana y los **puntuales** de esa fecha.
- No se ofrecen franjas que ya empezaron (en la semana actual); se descartan enteras, sin recortarlas.
- Los bloques de tipo **`LIBRE` no ocupan**.
- Grupo sin miembros → `[]`.

## Propuestas y votación

### `GET /groups/:id/proposals`
`200 Proposal[]` del grupo, **las más recientes primero** (`createdAt` descendente). Devuelve todas, también las `CANCELADO` (la app oculta las canceladas a mano y muestra las que se cancelaron solas, con `autoClosed`, para poder replantearlas). Antes de responder cierra las votaciones de franjas vencidas del grupo (ver «Cierre automático») y después las votaciones exprés vencidas (ver «Votación exprés»). `403 NOT_A_MEMBER` · `404 GROUP_NOT_FOUND`.

### `POST /groups/:id/proposals`
```json
{
  "title": "Estudiar para el parcial",
  "location": { "name": "Biblioteca", "latitude": -12.07, "longitude": -77.08 },
  "votingDeadline": "2026-10-03T23:59:00.000Z",
  "windows": [ { "date": "2026-10-09", "startTime": "16:00", "endTime": "18:00" },
               { "date": "2026-10-10", "startTime": "10:00", "endTime": "12:00" } ]
}
```
Cuerpo = `ProposalInput` de `shared`. Reglas:
- `title` obligatorio, 1–80 caracteres tras `trim` («El título no puede estar vacío.»).
- `location` opcional (`null` u omitido = sin lugar). `name` 1–100 tras `trim`; `latitude` (−90…90) y `longitude` (−180…180) van **juntas** o ambas `null`/omitidas.
- `votingDeadline` ISO 8601 (con `Z` u offset) **posterior al momento de crear** («La fecha límite debe ser futura») y **anterior al inicio de la primera franja** («La votación debe cerrar antes de la primera franja»). Sin `windows`, el servidor solo elige franjas que empiezan después de este plazo. Se guarda y se devuelve en UTC.
- `windows` opcional: **de 2 a 5** («Elige entre 2 y 5 franjas»); cada una `{ date, startTime, endTime }` (`TimeWindowInput`) con estas reglas, todas `400 VALIDATION_ERROR`:
  - `date` `YYYY-MM-DD` real (en `America/Lima`) de esta semana o las 3 siguientes («Elige una fecha entre esta semana y las próximas 3»);
  - `startTime`/`endTime` en `HH:mm` con `startTime < endTime` («La hora de fin debe ser posterior a la de inicio»);
  - su inicio (`date` + `startTime` en Lima) posterior a ahora («La franja ya empezó»): p. ej. el lunes de esta semana estando a jueves se rechaza;
  - sin repetidas («Hay franjas repetidas») ni solapadas el mismo día («Hay franjas que se solapan el mismo día»; una que acaba justo cuando empieza otra no se solapa).
  El `availabilityPercentage` lo calcula el servidor (ver `POST /proposals/:id/windows`), con los bloques recurrentes de ese día de la semana y los puntuales de esa fecha.
- `week` opcional (`YYYY-MM-DD`; cualquier día se normaliza a su lunes; por defecto, la semana actual): **solo se usa si `windows` viene vacío u omitido**, y entonces solo valen esta semana y las 3 siguientes (`400` «Elige una semana entre esta y las próximas 3»). Con `windows` se ignora.
- Si `windows` viene vacío u omitido, el servidor propone **las 3 mejores franjas** de `/availability?week=` que empiezan después del `votingDeadline` (así tampoco entran las que ya empezaron): mayor `availabilityPercentage`, luego mayor duración, luego fecha y hora más tempranas. Si salen menos de 2 (también porque el plazo deja fuera las demás), **no se crea** y responde `409 NO_COMMON_WINDOWS` («El grupo no tiene huecos en común esta semana: elige las franjas a mano.»).
- `multipleVotes` opcional (booleano, por defecto `true`; otro tipo → `400`): con `true` cada persona puede votar **varias** franjas; con `false`, una sola (votar otra mueve el voto). Se guarda en la propuesta y no cambia al replantear.
- Nace `PROPUESTO`, con `createdAt` = ahora, sin votos ni incidencias, y con `autoClosed: false`.

`201 Proposal` · `400 VALIDATION_ERROR` · `403 NOT_A_MEMBER` · `404 GROUP_NOT_FOUND` · `409 NO_COMMON_WINDOWS`

### `GET /proposals/:id`
`200 Proposal`. `windows` van por fecha y hora; cada una lleva su `date` (`YYYY-MM-DD`, en `America/Lima`) y el `dayOfWeek` de esa fecha; `myVoteWindowIds` son las franjas que votó quien pregunta (en el orden de `windows`; vacío si ninguna), `multipleVotes` dice si se pueden votar varias, `autoClosed` si la votación se cerró sola al vencer el plazo (ver «Cierre automático») y `canManage` dice si quien pregunta puede gestionarla (ver «Quién gestiona un plan»). `expressVote` es su votación exprés más reciente (la abierta o la última cerrada; `null` si nunca tuvo); si está abierta y ya venció, se cierra antes de responder (ver «Votación exprés»). Si sigue `PROPUESTO` y ya llegó su `votingDeadline`, antes se cierra su votación de franjas (ver «Cierre automático»).
`404 PROPOSAL_NOT_FOUND` · `403 NOT_A_MEMBER` si no soy miembro de su grupo. (Igual en todas las rutas `/proposals/:id/...`. Todas menos `POST /proposals/:id/ai/summary` cierran también primero la votación vencida: después de comprobar el acceso y antes de todo lo demás. El resumen con IA no la cierra: solo lee, y resume la propuesta tal como está guardada.)

### Cierre automático
Una propuesta `PROPUESTO` cuyo `votingDeadline` ya llegó se cierra sola:
- gana la franja más votada; si empatan, la de mayor `availabilityPercentage`; si siguen, la de fecha y hora más tempranas (la misma regla que `POST /proposals/:id/confirm` sin `windowId`). Pasa a `CONFIRMADO` con `chosenWindowId`, `scheduledAt` y `scheduledDate` como al confirmar a mano, **aunque la franja ya haya empezado** cuando alguien consulta (al vencer el plazo era válida: el plazo siempre es anterior a la primera franja);
- solo cuentan los votos de quienes **siguen** en el grupo; si no queda ninguno → `CANCELADO` (y quien gestiona puede replantearla: ver `POST /proposals/:id/replan`);
- en los dos casos `autoClosed: true`. `autoClosed` solo describe el estado al que llevó el plazo: confirmar a mano antes del plazo deja `false`, y cualquier cambio posterior lo devuelve a `false` (cancelar a mano, también desde la administración; el resultado `CANCELAR` o `REAGENDAR` de una votación exprés; replantear). Así, `CONFIRMADO` con `autoClosed: true` es «confirmado al cerrar la votación» y `CANCELADO` con `autoClosed: true` es solo «nadie votó antes del plazo».

No hay procesos en segundo plano: se cierra **al consultar**, en una transacción con la propuesta bloqueada que vuelve a comprobar estado y plazo, así que dos consultas a la vez la cierran **una sola vez**. Lo hacen `GET /proposals/:id` y todas las rutas `/proposals/:id/...` salvo el resumen con IA (votar, quitar el voto, añadir franja, confirmar, cancelar, reportar, votación exprés y replantear), `GET /groups/:id/proposals` (las del grupo), `GET /me/dashboard` y `GET /me/upcoming-plans` (las de mis grupos) y, en la administración, `GET /admin/groups/:id` (las de ese grupo), `POST /admin/proposals/:id/cancel` (esa propuesta) y `GET /admin/stats`, `/admin/stats/timeseries`, `/admin/stats/popular-hours` y `/admin/reports` (todas, antes de calcular). También antes de que cambien los miembros de un grupo: `DELETE /groups/:id/members/me`, `POST /groups/join` (una vez resuelto el código) y `POST /proximity/:id/accept` cierran las vencidas de ese grupo, de franjas y exprés, con los miembros de antes del cambio: el recuento solo cuenta a quienes siguen en el grupo, y así no depende de quién entró o salió después del plazo. Si un cierre falla, se anota y la consulta responde igual (la siguiente lo reintenta); votar y confirmar siguen rechazándose tras el plazo. El resultado no depende de cuándo se mire: votar y quitar el voto comprueban estado y plazo con la propuesta bloqueada, así que ningún voto entra después del recuento.

**Votos de quien ya no está:** `voteCount` solo cuenta los votos de quienes **siguen** en el grupo. Si alguien sale, su voto no se borra, pero deja de contar en `voteCount`, en «la más votada» al confirmar, en `GET /me/dashboard` y en el resumen con IA; si vuelve a unirse, cuenta otra vez.

### Quién gestiona un plan
Confirmar, cancelar y replantear lo deciden (qué hacer ante una ausencia crítica lo vota el grupo: ver «Votación exprés»):
1. quien creó la propuesta, mientras siga en el grupo (si sale y vuelve, la recupera);
2. cualquier `ORGANIZER` del grupo, la haya creado o no.

Siempre hay al menos un `ORGANIZER` (`409 LAST_ORGANIZER` y la herencia al salir, ver `DELETE /groups/:id/members/me`), así que ningún plan se queda sin quien lo gestione.

Cada `Proposal` trae `canManage` calculado para quien pregunta: la app muestra los botones con él (no comparando ids). Si lo intenta alguien que no gestiona el plan: `403 NOT_MANAGER` «Solo quien organiza el plan puede hacer esto.»

### `PUT /proposals/:id/vote`
`{ "windowId": "..." }`. Según `Proposal.multipleVotes`: con `true`, cada voto **suma** una franja a las que ya votaste; con `false`, votar otra franja **mueve** el único voto. Votar la misma otra vez **no cambia nada** (idempotente). Retirar un voto se hace con `DELETE`.
`200 Proposal` · `409 VOTING_CLOSED` «La votación ya cerró.» si el estado no es `PROPUESTO` o ya llegó el `votingDeadline` (entonces ya se cerró sola: ver «Cierre automático») · `404 WINDOW_NOT_FOUND` si la franja no es de esta propuesta (también si un replanteo la borró justo antes de guardar el voto).

### `DELETE /proposals/:id/vote`
Retira mis votos: con `?windowId=` solo el de esa franja; sin parámetros, todos los míos en la propuesta (si no había, no pasa nada). `200 Proposal` · `409 VOTING_CLOSED` con las mismas reglas que votar.

### `POST /proposals/:id/windows`
Añadir una franja a una propuesta en votación. Cualquier miembro. `{ "date": "2026-10-09", "startTime": "18:00", "endTime": "19:30" }` (`TimeWindowInput`, con las mismas reglas de una franja al crear: fecha de las 4 semanas válidas, horas, que no haya empezado). Además, todas `400 VALIDATION_ERROR`:
- no puede solaparse con una franja que ya tiene la propuesta («Hay franjas que se solapan el mismo día»);
- la propuesta no puede pasar de 5 franjas («Máximo 5 franjas»);
- tiene que empezar después del `votingDeadline` vigente («La franja debe empezar después del cierre de la votación»).
El servidor calcula su `availabilityPercentage` con los horarios **actuales** del grupo: para cada hora que toca la franja (mismo redondeo que `/availability`: inicio truncado, fin hacia arriba) calcula el % de miembros libres y se queda con el **peor**. No se aplica el umbral del grupo ni el rango 08–20. Los porcentajes no se recalculan después.
`201 Proposal` · `400 VALIDATION_ERROR` · `409 WINDOW_EXISTS` «Esa franja ya está propuesta.» (misma `date`, `startTime` y `endTime`) · `409 VOTING_CLOSED`

### `POST /proposals/:id/confirm`
Solo quien gestiona el plan (`403 NOT_MANAGER`, ver «Quién gestiona un plan») y solo si está `PROPUESTO` y **antes** del `votingDeadline` (`409 INVALID_STATE`): al vencer el plazo la votación se cierra sola (ver «Cierre automático») y ya no se confirma a mano. Estado y plazo se vuelven a comprobar al guardar, con la propuesta bloqueada: si el plazo vence justo mientras tanto, también `409 INVALID_STATE`. `{ "windowId": "..." }` es opcional:
- con `windowId`: se confirma esa franja, tenga votos o no (`404 WINDOW_NOT_FOUND` si no es de la propuesta);
- sin `windowId`: gana la más votada; si empatan, la de mayor `availabilityPercentage`; si siguen empatadas, la de fecha y hora más tempranas. Si nadie votó → `409 NO_VOTES`.
- si la franja elegida (con o sin `windowId`) ya empezó → `409 WINDOW_STARTED` «Esa franja ya empezó: replantea la propuesta.»
- el estado y la franja se vuelven a comprobar al guardar, con el plan bloqueado: si otra petición lo canceló o lo **replanteó** justo antes (la franja elegida ya no existe), `409 INVALID_STATE` y no se toca nada; un replanteo que llega justo después espera y lo ve ya `CONFIRMADO`.

Pasa a `CONFIRMADO` con `chosenWindowId`, `scheduledAt` = el instante de inicio de esa franja (su `date` y `startTime` en `America/Lima`, en UTC) y `scheduledDate` (`"YYYY-MM-DD"`) = su `date`, para que la app la muestre sin depender de la zona del teléfono. No depende de la variable `TZ` del servidor. Desde ese momento no se puede votar. `200 Proposal` · `409 WINDOW_STARTED`

### `POST /proposals/:id/cancel`
Solo quien gestiona el plan (`403 NOT_MANAGER`). Desde cualquier estado salvo `CANCELADO` (`409 INVALID_STATE`). Pasa a `CANCELADO`. `200 Proposal`

### `POST /proposals/:id/incidences`
Reportar un imprevisto sobre un plan `CONFIRMADO` cuya franja confirmada todavía no terminó (si no, `409 INVALID_STATE` «Solo se pueden reportar imprevistos de un plan confirmado.»; también en `EN_RECOORDINACION`: no hay fecha a la que faltar). Cualquier miembro. Antes de comprobar el estado se cierra la votación exprés del plan si ya venció (su resultado puede haberlo cambiado). El estado se vuelve a comprobar al guardar, con el plan bloqueado: si otra petición lo cancela (o una votación lo manda a recoordinar) justo antes, también `409` y no se guarda nada; si lo cancela justo después, espera a que la incidencia (y la votación que abra) quede guardada.
```json
{ "type": "TARDANZA", "reason": "Tráfico", "delayMinutes": 20 }
```
Cuerpo = `IncidenceInput`. Reglas:
- `type` ∈ `FALTA | TARDANZA | IMPREVISTO`; `reason` obligatorio, 1–200 caracteres tras `trim`.
- `delayMinutes`: entero 1–600, **obligatorio** si `TARDANZA`; `null` u omitido en los demás.
- **Ausencia crítica:** una `FALTA` o un `IMPREVISTO` es crítico si se cumple una de estas reglas, en este orden (la primera da `criticalReason`): quien reporta **propuso el plan** («propuso este plan»), es **imprescindible** (`isEssential`, «el grupo lo marcó como imprescindible») o es **organizador del grupo** (`ORGANIZER`, «es organizador del grupo»). Una `TARDANZA` nunca lo es.
- `criticality` la pone el servidor: ausencia crítica → `ALTA`; cualquier otra `FALTA` o un `IMPREVISTO` → `MEDIA`; `TARDANZA` → `BAJA`, o `MEDIA` si `delayMinutes ≥ 30`. `criticalReason` es `null` si no es crítica.
- Una ausencia crítica **abre la votación exprés** del grupo (ver «Votación exprés») y el plan **sigue `CONFIRMADO`** mientras se vota. No se abre si el plan ya tiene una abierta (la incidencia se guarda igual e informa) ni si quien avisa está solo en el grupo (nadie puede votar).

`201 Proposal`

### Votación exprés
Cuando alguien importante no puede ir a un plan confirmado, **decide el grupo**. `Proposal.expressVote` (`ExpressVote`) es la votación más reciente del plan: la abierta o la última cerrada (`null` si nunca tuvo); como mucho hay una abierta por plan.
- **Quién vota:** los miembros del grupo al abrirse, menos quien avisó (la lista queda fijada). Puede votar quien está en esa lista y **sigue** en el grupo; quien sale deja de poder votar y su voto deja de contar (en `counts`, `eligibleVoters`, el quórum y «votaron todos»). Quien entra después no vota.
- **Plazo** (`expiresAt`): `EXPRESS_VOTE_MINUTES` minutos (60 por defecto) desde que se abre (`openedAt`), sin pasar del inicio del plan (`scheduledAt`), pero **nunca menos de 5 minutos**.
- **Cierre:** en cuanto votaron todos los votantes que siguen en el grupo, o al vencer el plazo. No hay procesos en segundo plano: una votación vencida se cierra **al consultar** (`GET /proposals/:id`, `GET /groups/:id/proposals`, `GET /me/dashboard`, `GET /me/upcoming-plans`, reportar y votar, y antes de que alguien entre o salga del grupo: ver «Cierre automático»), en una transacción con el plan bloqueado, así que dos consultas a la vez la cierran y aplican su resultado **una sola vez**.
- **Resultado** (`result`, `resultByDefault`; `null` mientras está abierta): quórum = 2 votos, o todos los votantes que siguen si son menos (`quorum`). Sin quórum → `MANTENER` con `resultByDefault: true`. Si no, la opción más votada; en empate gana la más prudente: `MANTENER` > `REAGENDAR` > `CANCELAR`.
- **Qué hace con el plan, solo si sigue `CONFIRMADO`:** `CANCELAR` → `CANCELADO`; `MANTENER` → nada; `REAGENDAR` → `EN_RECOORDINACION` con `chosenWindowId`, `scheduledAt` y `scheduledDate` a `null` y sin votos de fecha. Si quien gestiona ya lo canceló, la votación se cierra sin tocarlo. Siempre, al cerrar, **todas** las incidencias del plan quedan `resolved: true`.
- **Campos:** `reportedBy`, `reason` y `criticalReason` (de la incidencia que la abrió); `counts` = `{ CANCELAR, REAGENDAR, MANTENER }` (visibles para todos); `myVote` (`null` si no voté o no puedo votar); `canVote` (abierta y soy votante que sigue en el grupo); `eligibleVoters`; `closedAt`; `recommendation` (`{ option, reason }` de la IA, o `null`): se guarda unos instantes **después** de abrirse la votación (la respuesta de reportar aún trae `null`) y solo si sigue abierta; ver «Inteligencia artificial».

### `PUT /proposals/:id/express-vote`
Votar en la votación exprés abierta del plan. Cuerpo = `ExpressVoteInput`: `{ "option": "REAGENDAR" }` (`CANCELAR | REAGENDAR | MANTENER`). Un voto por persona; votar otra vez **cambia** el voto mientras siga abierta. Si con este voto ya votaron todos, la votación se cierra en el momento y se aplica su resultado (la respuesta ya lo trae).
`200 Proposal` · `400 VALIDATION_ERROR` «Elige CANCELAR, REAGENDAR o MANTENER» · `403 NOT_A_VOTER` «No puedes votar en esta votación.» (quien avisó o quien no estaba en el grupo al abrirse; quien ya salió del grupo recibe antes `403 NOT_A_MEMBER`) · `409 VOTING_CLOSED` «La votación ya cerró.» (el plan no tiene votación abierta, ya venció o el plan ya no está `CONFIRMADO`: p. ej. quien gestiona lo canceló con la votación abierta).

### `POST /proposals/:id/replan`
Replantea una propuesta **en votación** (`PROPUESTO`), **en recoordinación** (`EN_RECOORDINACION`, lo que deja una votación exprés con resultado REAGENDAR) o **cancelada sola porque nadie votó** (`CANCELADO` con `autoClosed: true`, ver «Cierre automático»): reemplaza sus franjas y su plazo por otros nuevos y el plan vuelve a `PROPUESTO` con `autoClosed: false`. Solo quien gestiona el plan (`403 NOT_MANAGER`) y solo en esos estados (`409 INVALID_STATE`, también con una `CANCELADO` a mano). Antes se cierra la votación si venció: una `PROPUESTO` vencida sin votos se replantea ya `CANCELADO` con `autoClosed`; si alguien la votó, ya está `CONFIRMADO` y no se replantea. Sirve también cuando todas las franjas ya pasaron (p. ej. propuestas sin votos anteriores a las fechas). Desde `EN_RECOORDINACION` se borran además las incidencias del plan y sus votaciones exprés cerradas (la respuesta trae `incidences: []` y `expressVote: null`), todo en la misma transacción que el cambio de franjas; desde `PROPUESTO` se conservan (p. ej. las incidencias resueltas de un plan que se reprogramó con el flujo anterior a la votación exprés); el estado se vuelve a comprobar al guardar (y que una `CANCELADO` siga con `autoClosed`), así que si otra petición lo canceló justo antes, `409 INVALID_STATE` y no se toca nada. Cancelar también funciona desde `EN_RECOORDINACION`. Cuerpo = `ReplanInput`:
```json
{ "votingDeadline": "2026-10-04T20:00:00.000Z",
  "windows": [ { "date": "2026-10-07", "startTime": "11:00", "endTime": "13:00" },
               { "date": "2026-10-08", "startTime": "16:00", "endTime": "18:00" } ] }
```
`votingDeadline` futuro y anterior al inicio de la primera franja; `windows` de 2 a 5 con las mismas reglas que al crear (fechas de las 4 semanas válidas, inicio futuro, sin repetidas ni solapadas). Se borran las franjas anteriores con sus votos y se calcula el % de las nuevas. `200 Proposal` · `400 VALIDATION_ERROR`

## Inteligencia artificial

Toda llamada a la IA pasa por el backend (Google Gemini, modelo `GEMINI_MODEL`): la API key **nunca** va en la app. Reglas comunes:
- Todas las rutas exigen token. Las que llaman a la IA comparten un límite de **20 llamadas cada 15 min por usuario** (`429 TOO_MANY_REQUESTS`); `GET /ai/status` no cuenta.
- La respuesta de la IA se valida siempre: si no cumple el formato → `502 AI_BAD_RESPONSE`; si el proveedor falla o tarda más de 30 s → `503 AI_UNAVAILABLE`. Nunca se devuelven datos inventados para tapar un fallo.
- Si el modelo principal está saturado (503), sin cuota (429), no existe (404: nombre mal escrito o modelo retirado) o agota su tiempo (el principal solo puede usar 2/3 de `GEMINI_TIMEOUT_MS`), el servidor reintenta una vez con `GEMINI_FALLBACK_MODEL`; `GEMINI_TIMEOUT_MS` (30 s) es el tope total de los dos intentos. Cualquier otro fallo no se reintenta.
- Modelos por defecto: `GEMINI_MODEL=gemini-3.5-flash-lite` y `GEMINI_FALLBACK_MODEL=gemini-3.5-flash`. Cada llamada envía `generation_config.thinking_level` con `GEMINI_THINKING_LEVEL` (`minimal` · `low` · `medium` · `high`; por defecto `low`) para responder más rápido.
- La IA **solo sugiere**: ninguna de estas rutas guarda datos del usuario (solo la anotación de uso de la viñeta siguiente). El usuario revisa el resultado y lo confirma con los endpoints de siempre.
- **Registro de uso:** cada petición que llega al proveedor se anota en `ai_calls` con quién la hizo, la función (`AiTask`: `schedule-ocr`, `proposal-draft`, `plan-suggestions`, `voting-summary`, `express-recommendation`), si salió bien (respuesta válida) o mal (`502`/`503`), cuánto tardó y cuándo. **Nunca** se guarda el prompt, la foto ni la respuesta. Lo que no llega a la IA (`429`, `400` de la subida, `403`, `404`, `409`) no se anota. Lo usan las estadísticas de «Administración».
- **Recomendación de la votación exprés (sin ruta propia):** al abrirse una votación exprés, el servidor pide a la IA qué conviene votar **después** de responder el reporte (`express-recommendation`, anotada con quien avisó). Solo recibe el título, el lugar, el inicio, las horas que faltan, el motivo, por qué es crítica y cuántos votan; nunca correos. Si falla, la respuesta es inválida o la votación ya cerró, no se guarda nada y `recommendation` sigue en `null`; si sale bien, aparece en `Proposal.expressVote.recommendation` al consultar el plan.
- **Modo demostración:** si el servidor no tiene `GEMINI_API_KEY`, las respuestas son datos de ejemplo fijos (validados igual).

### `GET /ai/status`
`200 AiStatus`: `{ "provider": "gemini" }` o `{ "provider": "mock" }` (modo demostración; la app lo avisa).

### `POST /ai/schedule-ocr`
`multipart/form-data` con el campo `image`: **una** foto JPG, PNG o WEBP de hasta 5 MB. Cuenta para el límite de IA.
Devuelve `ScheduleOcrResult`: bloques **sin guardar**, para que el usuario los revise (puede editarlos o quitarlos) y los guarde con `POST /me/time-blocks/bulk`.
```json
{ "blocks": [ { "label": "Cálculo", "type": "CLASE", "startTime": "08:00", "endTime": "10:00",
                "isRecurring": true, "dayOfWeek": 1, "date": null } ] }
```
Reglas:
- Cada bloque que lee la IA se valida por separado: `dayOfWeek` entero 1–7, horas `HH:mm` (`9:00` se corrige a `09:00`), inicio < fin y `label` no vacío (se recorta a 80). Los inválidos y los repetidos (mismo día, horas y nombre) **se descartan**.
- Todos salen como clase recurrente: `type: "CLASE"`, `isRecurring: true`, `date: null`. Ordenados por día y hora; como máximo 100.
- Si la foto no parece un horario o no se lee ningún bloque válido: `200 { "blocks": [] }` (no hay error `422`). Si la IA responde algo que no es JSON con esa forma: `502`; si el proveedor falla: `503`.
- El tipo declarado debe ser `image/jpeg`, `image/png` o `image/webp`, pero manda el de los **primeros bytes** del archivo: si son de un JPG, PNG o WEBP real se acepta aunque el tipo declarado no coincida (p. ej. una PNG enviada como `image/jpeg`) y a la IA se le envía el tipo real; si no son de ninguno → `400 INVALID_IMAGE`.
- La petición solo puede llevar la parte `image`: cualquier campo de texto de más → `400 INVALID_UPLOAD`.
- La app pide al selector de fotos la versión JPG de las fotos HEIC del iPhone y comprueba tipo y tamaño antes de subir: el servidor nunca recibe HEIC (si llegara, `400 INVALID_IMAGE`).

`200` · `400 IMAGE_REQUIRED` (falta el archivo) · `400 INVALID_IMAGE` (no es JPG/PNG/WEBP) · `400 INVALID_UPLOAD` (otro campo, más de un archivo o un multipart roto o cortado) · `413 PAYLOAD_TOO_LARGE` · `429` · `502 AI_BAD_RESPONSE` · `503 AI_UNAVAILABLE`

### `POST /groups/:id/ai/proposal-draft`
Convierte una frase en un borrador para «Nueva propuesta». Solo miembros (`403 NOT_A_MEMBER` · `404 GROUP_NOT_FOUND`). Cuerpo = `ProposalDraftInput`:
```json
{ "text": "Estudiar para el parcial el jueves en la biblioteca", "week": "2026-10-05" }
```
`text` obligatorio, 3–500 caracteres tras `trim`. `week` opcional (lunes `YYYY-MM-DD`; cualquier día se normaliza a su lunes): sin `week`, los candidatos son los huecos de esta semana y de la siguiente que aún no empezaron; con `week`, solo los de esa semana (los mismos que `GET /groups/:id/availability?week=`). Fuera de las 4 semanas válidas → `400 VALIDATION_ERROR`. Responde `200 ProposalDraft` (no guarda nada):
```json
{ "title": "Estudiar para el parcial", "category": "ESTUDIO", "placeName": "Biblioteca central",
  "window": { "date": "2026-10-08", "dayOfWeek": 4, "startTime": "16:00", "endTime": "18:00", "availabilityPercentage": 100, "freeMembers": 2 },
  "windows": [ { "date": "2026-10-08", "dayOfWeek": 4, "startTime": "16:00", "endTime": "18:00", "availabilityPercentage": 100, "freeMembers": 2 },
               { "date": "2026-10-10", "dayOfWeek": 6, "startTime": "08:00", "endTime": "20:00", "availabilityPercentage": 100, "freeMembers": 2 } ],
  "votingDeadline": "2026-10-08T14:00:00.000Z" }
```
- `category` ∈ `ESTUDIO | REUNION | COMIDA | DEPORTE | SALIDA | OTRO` (`PlanCategory`; una desconocida → `OTRO`). No se guarda en la propuesta.
- A la IA se le pasan los candidatos numerados y **con fecha** («1. Jue 8 oct 16:00–18:00 · 100 % del grupo libre (2 personas)»), como máximo 30, y responde con el número (`windowIndex`) y, además, con `startTime`/`endTime` para recortarlo a lo que se pide (duración, momento del día; 2 h si no dice). El recorte solo se aplica si son `HH:mm`, el fin va después del inicio y caen dentro del hueco; si no, vale el hueco completo. Conserva `availabilityPercentage` y `freeMembers` del hueco (el peor caso del tramo). Un número que no existe se descarta.
- `windows`: **de 2 a 5 opciones** para votar, cada una dentro de un hueco real del grupo y lista para usarse como `TimeWindowInput` (`date`, `startTime`, `endTime`). La IA da la principal y hasta 2 alternativas; se descartan las inválidas, las repetidas o que se solapan el mismo día y las que empiezan en menos de 2 h (para que la votación pueda cerrar 1 h antes). Si quedan menos de 2, el servidor completa con las mejores franjas de los candidatos (mayor `availabilityPercentage`, luego mayor duración, luego fecha y hora más tempranas) que no se solapen con las elegidas. La primera es `window`.
- Si ni así hay 2 opciones → `409 NO_COMMON_WINDOWS`. Si ya los candidatos son menos de 2, responde lo mismo **sin llamar a la IA** (no cuenta en el registro de llamadas).
- `votingDeadline`: ahora + las horas que sugiere la IA, redondeado **hacia arriba** a la hora en punto (siempre a 1 h o más de ahora). Las horas van de 1 a 168; si faltan, no son enteras o están fuera de rango, se usan 48. El cierre se adelanta a 1 h antes del inicio de la opción que llega primero (puede caer en :30) si eso es anterior y deja al menos 1 h desde ahora.
- Fechas y horas son las de **America/Lima**; el prompt dice «hoy» en esa zona.
- Títulos de más de 80 y lugares de más de 100 caracteres se recortan; un lugar vacío es `null`.

`200` · `400 VALIDATION_ERROR` · `403` · `404` · `409 NO_COMMON_WINDOWS` · `429` · `502 AI_BAD_RESPONSE` · `503 AI_UNAVAILABLE`

### `POST /groups/:id/ai/suggestions`
Cuerpo opcional `{ "week"?: "YYYY-MM-DD" }` con la misma regla que el borrador (sin `week`: esta semana y la siguiente, solo lo que no empezó; fuera de las 4 semanas válidas → `400 VALIDATION_ERROR`). 3 ideas de plan para los huecos libres del grupo, teniendo en cuenta su descripción y sus últimas 5 propuestas (para no repetir). Solo miembros.
`200 PlanSuggestions`: `{ "suggestions": [ { "title", "category", "placeIdea", "window", "reason" } ] }`, entre 1 y 3 (las ideas mal formadas se descartan; si no queda ninguna → `502`). `window` es un `MatchWindow` con `date` de la lista de candidatos, o `null` si la IA dio un número que no existe. La app abre «Nueva propuesta» rellenada con la idea elegida.

`200` · `400 VALIDATION_ERROR` · `403` · `404` · `429` · `502 AI_BAD_RESPONSE` · `503 AI_UNAVAILABLE`

### `POST /proposals/:id/ai/summary`
Sin cuerpo. Resumen corto de los votos y los imprevistos del plan, con una recomendación para quien lo gestiona. Cualquier miembro (`403 NOT_A_MEMBER` · `404 PROPOSAL_NOT_FOUND`); no para planes `CANCELADO` (`409 INVALID_STATE`). No cierra antes la votación vencida (ver «Cierre automático»): resume la propuesta tal como está guardada. A la IA le llega cada franja con su fecha («Jue 8 oct 08:00–20:00»). **Nunca cambia el plan**: confirmar, reprogramar o cancelar se hace con los endpoints de siempre.
```json
{ "summary": "Votó 1 de 2 integrantes: el jueves va ganando y no hay imprevistos.",
  "recommendation": "CONFIRMAR", "reason": "Hay una franja clara y nadie reportó problemas." }
```
`recommendation` ∈ `CONFIRMAR | REPROGRAMAR | CANCELAR` (`SummaryRecommendation`; otra → `502`). `summary` ≤ 600 y `reason` ≤ 300 caracteres. A la IA solo van nombres de los miembros y datos de votos e imprevistos, nunca correos ni fotos.

`200` · `403` · `404` · `409` · `429` · `502 AI_BAD_RESPONSE` · `503 AI_UNAVAILABLE`

## Proximidad

Unirse a un grupo acercando dos celulares: quien ya es miembro pulsa «Invitar» y quien quiere entrar pulsa «Unirse»; cuando los dos sensores de proximidad detectan el otro celular, cada app envía un aviso y el servidor los empareja. Todo se calcula con el reloj **del servidor**, nunca con una hora enviada por el celular. Todas las rutas piden token. Responden `ProximityRequest`:

```json
{ "id": "…", "role": "JOIN", "status": "MATCHED", "group": { "id": "…", "name": "Equipo" },
  "peer": { "id": "…", "name": "Luis" }, "expiresAt": "2026-10-05T18:00:31.000Z", "acceptableFrom": "2026-10-05T18:00:04.000Z" }
```

Cada aviso es una mitad de la pareja; las dos mitades comparten estado. `group` es el grupo de la invitación (en `JOIN`, solo a partir de `MATCHED`); `peer` es la otra persona y solo se muestra en `MATCHED`, `ACCEPTED` y `REJECTED`.

| Estado | Significado | `expiresAt` | `acceptableFrom` |
|---|---|---|---|
| `WAITING` | aviso enviado, sin pareja; vence a los 5 s | `created_at + 5 s` | `null` |
| `MATCHED` | pareja formada; quien invita decide; vence a los 30 s | `matched_at + 30 s` | `matched_at + 3 s` |
| `ACCEPTED` | quien invita aceptó y la otra persona ya es miembro | `null` | `null` |
| `REJECTED` | quien invita rechazó | `null` | `null` |
| `EXPIRED` | venció sin respuesta (se calcula al leer), la otra mitad dejó de existir (se borró el grupo o el usuario) o quien invita salió del grupo antes de aceptar | `null` | `null` |
| `AMBIGUOUS` | llegaron más de dos avisos casi a la vez y no se sabe cuál era el celular de verdad | `null` | `null` |
| `CANCELLED` | alguien salió o empezó otro intento | `null` | `null` |

**Regla de los 3 s:** dos avisos de rol opuesto se emparejan si llegan como mucho a 3 s uno del otro. Si hay más de un candidato, o llega otro aviso que hubiera podido emparejarse con alguien ya emparejado hace 3 s o menos, todos quedan `AMBIGUOUS`. Por eso quien invita **no puede aceptar ni rechazar hasta pasados 3 s de `matched_at`** (estrictamente: el milisegundo `matched_at + 3 s` aún no vale). Cada usuario tiene un solo intento activo: uno nuevo cancela el anterior. No se empareja con quien ya es miembro del grupo ni con uno mismo.

**Límite:** `POST /proximity/invite` y `POST /proximity/join` comparten un límite de **10 avisos por minuto por usuario**; pasado, `429 TOO_MANY_REQUESTS` «Demasiados intentos. Espera un momento.». Consultar, responder y cancelar no cuentan.

### `POST /proximity/invite`
Cuerpo `{ "groupId": "…" }`. `201 ProximityRequest` (rol `INVITE`, normalmente `WAITING`; ya `MATCHED` si el aviso de la otra persona llegó antes) · `400 VALIDATION_ERROR` · `404 GROUP_NOT_FOUND` · `403 NOT_A_MEMBER` · `429 TOO_MANY_REQUESTS`.

### `POST /proximity/join`
Cuerpo `{}`. `201 ProximityRequest` (rol `JOIN`) · `429 TOO_MANY_REQUESTS`.

### `GET /proximity/:id`
La app lo consulta cada 1,5 s. Solo su dueño: `200 ProximityRequest` · `404 PROXIMITY_NOT_FOUND` (también si es de otra persona).

### `POST /proximity/:id/accept`
Solo quien invita, con la pareja en `MATCHED` vigente y pasados los 3 s. Añade a la otra persona al grupo (si ya era miembro, la pareja queda `ACCEPTED` igual). `200 ProximityRequest` con `ACCEPTED` · `409 PROXIMITY_NOT_PENDING` «Esta solicitud ya no se puede responder.» (rol `JOIN`, otro estado, vencida o antes de los 3 s) · `404 PROXIMITY_NOT_FOUND` (también si el grupo ya se había borrado: el borrado se lleva el aviso de quien invita) · `404 GROUP_NOT_FOUND` (el grupo se borra justo mientras se acepta; la pareja pasa a `EXPIRED`) · `403 NOT_A_MEMBER` «No perteneces a este grupo.» (quien invita salió del grupo después de invitar; nadie entra y la pareja pasa a `EXPIRED`).

### `POST /proximity/:id/reject`
Mismas reglas que `accept`, pero las dos mitades pasan a `REJECTED` y nadie entra al grupo. `200 ProximityRequest` · `409 PROXIMITY_NOT_PENDING` · `404 PROXIMITY_NOT_FOUND`.

### `DELETE /proximity/:id`
Cancela: un `WAITING` o `MATCHED` aún vigente pasa a `CANCELLED` en las dos mitades; en otro estado no cambia nada. `204` siempre que el intento sea suyo · `404 PROXIMITY_NOT_FOUND`.

---

## Notificaciones

Avisos push (Expo) de los planes. Cada cambio de un plan guarda sus avisos (tabla `notifications`, una fila por destinatario) **en la misma transacción** que el cambio: si el cambio se deshace, el aviso no queda; si se guarda, el aviso queda pendiente hasta que el envío lo marque. Solo se avisa cuando el cambio de verdad ocurrió (un `409` no deja avisos).

### Avisos

| `kind` | Cuándo | A quién | `data.screen` |
|---|---|---|---|
| `NEW_PROPOSAL` | se crea una propuesta | miembros del grupo menos quien la creó | `VOTING` |
| `PLAN_CONFIRMED` | se confirma a mano o al cerrarse la votación sola | miembros del grupo; a mano, menos quien confirmó | `PLAN` |
| `PLAN_CANCELLED` | se cancela a mano, desde el admin o sin votos (cierre automático) | miembros del grupo; a mano, menos quien canceló | `PLAN` |
| `EXPRESS_OPENED` | se abre una votación exprés | sus votantes (miembros menos quien avisó) | `PLAN` |
| `EXPRESS_RESULT` | se cierra una votación exprés de un plan que sigue `CONFIRMADO` | miembros del grupo | `PLAN` |
| `REMINDER` | desde 60 min antes del inicio de un plan `CONFIRMADO` que aún no empezó | miembros del grupo sin una incidencia `FALTA`/`IMPREVISTO` en ese plan | `PLAN` |

- **Destinatarios:** los miembros **actuales** del grupo en el momento del cambio (quien ya salió no recibe). Quien hace el cambio a mano no recibe su propio aviso; el admin que cancela no se excluye (avisa a todos los miembros).
- **Un aviso por hecho:** una votación exprés que decide `CANCELAR` avisa solo con `EXPRESS_RESULT`, sin un `PLAN_CANCELLED` aparte. Moderar (admin) una propuesta que ya se canceló sola no avisa (el grupo ya recibió `PLAN_CANCELLED`). Si quien gestiona cancela el plan con una votación exprés abierta, al cerrarse esa votación no avisa (su resultado ya no se aplica).
- `data` = `NotificationData` `{ "kind", "proposalId", "groupId", "screen" }`: la app abre la pantalla indicada al tocar el aviso.
- **Textos** (título · cuerpo). El título es el nombre del grupo; `{plan}` es el título de la propuesta, `{nombre}` el nombre de la persona, y las fechas y horas van en `America/Lima` (`{cuándo}` = «jueves 15 de octubre, 16:00»; `{HH:mm}` en 24 h):
  - `NEW_PROPOSAL`: «{nombre} propuso «{plan}». Vota tus franjas.»
  - `PLAN_CONFIRMED`: ««{plan}» se confirmó para el {cuándo}.»
  - `PLAN_CANCELLED`: ««{plan}» se canceló.»; sin votos (cierre automático): ««{plan}» se canceló: nadie votó antes del plazo.»
  - `EXPRESS_OPENED`: «{nombre} no podrá ir a «{plan}» ({razón crítica}). Vota qué hacer.» (la razón crítica de la incidencia, p. ej. «propuso este plan»)
  - `EXPRESS_RESULT`: «El grupo decidió {mantener|reagendar|cancelar} «{plan}».»; sin quórum: «Sin quórum: «{plan}» se mantiene.»
  - `REMINDER`: ««{plan}» empieza a las {HH:mm} en {lugar}.»; sin lugar: ««{plan}» empieza a las {HH:mm}.»

### `PUT /me/push-devices`
Registra el celular para recibir avisos. Cuerpo `PushDeviceInput` `{ "token": "ExponentPushToken[…]" }`; el token debe ser `ExponentPushToken[...]` o `ExpoPushToken[...]`, de **255 caracteres como máximo**. Si ya existía (también de otra cuenta), pasa a quien lo envía y se actualiza `last_seen_at`. `204` · `400 VALIDATION_ERROR` · `401`.

### `DELETE /me/push-devices/:token`
Borra ese token si es de quien lo pide (la app lo envía con `encodeURIComponent`, porque lleva corchetes). `204` siempre, también si no existe o es de otra persona (idempotente) · `401`.

---

## Internal

Rutas para el despertador de GitHub Actions; no las usa la app. Solo existen si el servidor tiene `CRON_SECRET`; sin él responden `404`. No llevan token de usuario: se autentican con `Authorization: Bearer <CRON_SECRET>`.

### `POST /internal/tick`
Ejecuta un barrido, el mismo que el servidor hace cada minuto: cierra las votaciones de franjas y las exprés vencidas de todos los grupos, encola un `REMINDER` por miembro de cada plan `CONFIRMADO` que empieza en la próxima hora (menos a quien reportó `FALTA` o `IMPREVISTO`; una sola vez por plan y hora) y envía los avisos pendientes. `200 { "closed": 0, "reminders": 0, "sent": 0 }` (`closed`: votaciones cerradas; `reminders`: recordatorios nuevos; `sent`: avisos enviados) · `401 UNAUTHORIZED` «No autorizado.» si falta la cabecera o el secreto no coincide.

---

## Administración

Rutas para las cuentas con rol `ADMIN` (ver «Rol y estado de la cuenta»). Todas exigen token y rol: sin token (o con uno inválido) → `401 UNAUTHORIZED`; cuenta suspendida → `403 ACCOUNT_SUSPENDED`; si no es `ADMIN` → `403 NOT_ADMIN`. Reglas comunes:
- **Primer administrador:** solo desde la consola del servidor: `npm run make-admin -w backend -- <correo>` (`--revoke` para quitarlo). No hay endpoint para hacerse administrador.
- **Listas paginadas:** `?page=` (desde 1; por defecto 1, también si llega vacío: `?page=`) y, donde se indica, `?search=` (≤ 100 caracteres; busca el texto tal cual, sin distinguir mayúsculas en letras sin tilde; `%` y `_` son literales). 20 por página. Responden `Page<T>`: `{ "items": [...], "page": 1, "pageSize": 20, "total": 57 }`. Parámetros inválidos → `400 VALIDATION_ERROR`.
- **Registro de acciones:** toda escritura de esta sección se anota en el registro (`GET /admin/audit`) en la misma transacción: si no se puede anotar, la acción no se hace.
- Fechas de las respuestas en ISO 8601 UTC. Los periodos de estadísticas e informes se piden como días `YYYY-MM-DD` (ver abajo).
- **Votaciones vencidas:** `GET /admin/groups/:id` cierra antes las votaciones de franjas vencidas de ese grupo, y `GET /admin/stats`, `/admin/stats/timeseries`, `/admin/stats/popular-hours` y `/admin/reports`, todas las vencidas antes de calcular (ver «Cierre automático»): un plan ya cerrado no cuenta como `PROPUESTO`.

### Estadísticas e informes: fechas y zona horaria
- Los periodos van en `?from=&to=` como **días de calendario** `YYYY-MM-DD`, **ambos incluidos** (`?from=2026-09-01&to=2026-09-30`). `from = to` es un periodo de un día. `to` no puede ser anterior a `from` y el periodo dura como mucho **366 días**. Una fecha con otro formato (también un instante ISO), que no existe (`2026-02-30`) o con un año fuera de **2000–9999** («El año debe estar entre 2000 y 9999.») → `400 VALIDATION_ERROR` con el campo en `details`.
- El servidor convierte esos días en las medianoches de **su** zona (`TZ`, `America/Lima`): el periodo es `[00:00 de from, 00:00 del día siguiente a to)`. La zona del teléfono no influye.
- Los tramos por **día** o **semana (lunes a domingo)** y las **horas** también se calculan en la zona del servidor. `start` es la fecha `YYYY-MM-DD` del día o del lunes en esa zona. La base de datos solo filtra por rango; el agrupado se hace en el servidor con la zona de `TZ`, así el resultado no depende de la zona horaria configurada en la base.
- «Planes confirmados» (`confirmedPlans`) = propuestas `CONFIRMADO` o `EN_RECOORDINACION`; en un periodo cuentan por su fecha (`scheduledAt`), porque no se guarda cuándo se confirmaron. Por eso la app lo llama **«Planes con fecha en el periodo»** en «Informes», el PDF y el CSV: no es lo mismo que los «Confirmado» de `proposalsByState`, que cuenta las propuestas **creadas** en el periodo según su estado actual.
- Por semanas, cada tramo es la semana entera que empieza ese lunes, pero solo cuenta lo que cae dentro del periodo: la primera y la última semana pueden ser parciales (el PDF y el CSV lo avisan y titulan la columna «Semana del»).

### `GET /admin/stats`
`200 AdminStats`, totales de ahora mismo:
```json
{ "users": { "total": 57, "active": 55, "suspended": 2, "admins": 1 }, "groups": 12,
  "proposals": { "PROPUESTO": 4, "CONFIRMADO": 9, "EN_RECOORDINACION": 1, "CANCELADO": 3 },
  "confirmedPlans": 10, "incidences": 6,
  "ai": { "calls": 40, "ok": 37, "successRate": 93,
          "byTask": [ { "task": "schedule-ocr", "calls": 20, "ok": 18, "successRate": 90, "avgDurationMs": 2400 }, … ] } }
```
`admins` cuenta todas las cuentas `ADMIN` (también suspendidas). `successRate` = % entero de llamadas con respuesta válida, `null` sin llamadas. `byTask` trae siempre las 4 funciones, en el orden de `AiTask`.

### `GET /admin/stats/timeseries?from=&to=&bucket=week`
`bucket` ∈ `day | week` (por defecto `week`). `200 Timeseries`: `{ from, to, bucket, points: [ { start, registrations, groupsCreated, proposalsCreated, aiCalls } ] }`, con `from`/`to` = los días pedidos y un punto por tramo que toca el periodo, **también los vacíos** (el primero puede empezar antes de `from`, en su lunes).

### `GET /admin/stats/popular-hours?from=&to=`
Histograma de la hora de inicio (zona del servidor) de los planes confirmados. `from`/`to` opcionales pero **juntos** («Envía «from» y «to» juntos, o ninguno.»); sin ellos, todos. `200 PopularHours`: `{ from, to, hours: [ { hour: 0, count: 0 }, …, { hour: 23, count: 1 } ] }` (siempre 24; `from`/`to` = los días pedidos, o `null`).

### `GET /admin/reports?from=&to=`
Todas las cifras del periodo en una sola respuesta, `200 AdminReport`: la pantalla «Informes», el PDF y el CSV salen de estos mismos datos.
- `period`: `{ from, to, fromDate, toDate }`: `fromDate`/`toDate` son los días pedidos (primero y último incluidos) y `from`/`to` el intervalo en ISO que calculó el servidor (p. ej. `?from=2026-09-29&to=2026-09-30` → `from: "2026-09-29T05:00:00.000Z"`, `to: "2026-10-01T05:00:00.000Z"`); `generatedAt`.
- `bucket`: `day` si el periodo dura 31 días o menos; si no, `week`.
- `summary`: `{ newUsers, newGroups, newProposals, confirmedPlans, incidences, aiCalls }` del periodo.
- `proposalsByState` (de las propuestas creadas en el periodo), `ai` (como en `/admin/stats`, del periodo), `timeseries` (como `/admin/stats/timeseries` con ese `bucket`), `popularHours` (24 horas, planes con fecha en el periodo) y `topGroups` (hasta 5 `{ id, name, proposals }`, por propuestas creadas en el periodo; a igual número, por nombre y después por `id`, para que el orden sea siempre el mismo).

### `GET /admin/users?search=&page=`
`200 Page<AdminUserSummary>`: `{ id, name, email, role, status, createdAt, groupCount }`, las cuentas más nuevas primero. `search` busca en nombre y correo.

### `GET /admin/users/:id`
`200 AdminUserDetail` = `AdminUserSummary` + `groups` (`{ id, name, role }` en el orden en que se unió) + `activity` (`{ proposalsCreated, votes, incidences, timeBlocks, aiCalls }`). `404 USER_NOT_FOUND`.

### `PATCH /admin/users/:id/status`
`{ "status": "SUSPENDED" }` o `{ "status": "ACTIVE" }` (`UserStatusInput`) → `200 AdminUserDetail`.
- Suspender surte efecto al instante: su login y sus peticiones con token responden `403 ACCOUNT_SUSPENDED`. Sus grupos, planes y votos no se tocan.
- Si ya tenía ese estado → `200` sin cambios ni anotación.
- `409 CANNOT_CHANGE_SELF` «No puedes suspender tu propia cuenta ni quitarte el rol de administrador.» · `409 LAST_ADMIN` «Tiene que quedar al menos un administrador activo.» · `404 USER_NOT_FOUND` · `400 VALIDATION_ERROR` (el cuerpo se valida antes de buscar la cuenta).

### `PATCH /admin/users/:id/role`
`{ "role": "ADMIN" }` o `{ "role": "USER" }` (`UserRoleInput`) → `200 AdminUserDetail`. Mismas reglas que el estado (`CANNOT_CHANGE_SELF`, `LAST_ADMIN`, sin cambios si ya lo tenía). Cuenta desde la siguiente petición de esa persona; la app muestra u oculta «Administración» al volver a primer plano, al reabrirse o al iniciar sesión (y, si pierde el rol mientras está en esas pantallas, en cuanto una petición responde `403 NOT_ADMIN`).

### `GET /admin/groups?search=&page=`
`200 Page<AdminGroupSummary>`: `{ id, name, description, memberCount, proposalCount, organizers, createdAt }`, los más nuevos primero. `organizers` son los `User` con rol `ORGANIZER`, del que lleva más tiempo en el grupo al más reciente (`[]` si no quedan miembros); se cargan en una sola consulta para toda la página. `search` busca en el nombre y el código de invitación.

### `GET /admin/groups/:id`
`200 AdminGroupDetail` = `AdminGroupSummary` + `inviteCode`, `availabilityThreshold`, `members` (`GroupMember[]`, en orden de llegada) y `proposals` (`AdminProposalSummary[]`, las más recientes primero: `{ id, title, state, createdBy, createdAt, votingDeadline, scheduledAt, scheduledDate, voteCount, incidenceCount, autoClosed }`; `voteCount` solo cuenta a quienes siguen en el grupo; `autoClosed` como en `Proposal`, ver «Cierre automático»). La administración lo ve **sin ser miembro**. `404 GROUP_NOT_FOUND`.

### `DELETE /admin/groups/:id`
Borra el grupo con sus miembros, propuestas, franjas, votos e incidencias. `204` · `404 GROUP_NOT_FOUND`. Se anota como `GROUP_DELETED` con `{ name, members, proposals }`.

### `POST /admin/proposals/:id/cancel`
Moderación: cancela una propuesta de **cualquier** grupo, sin ser miembro ni quien la organiza. Cuerpo obligatorio `AdminCancelProposalInput`: `{ "reason": "Contenido inapropiado" }` (**obligatorio**, de 3 a 200 caracteres tras `trim`; sin él, en blanco o fuera de ese rango → `400 VALIDATION_ERROR`; se guarda en el registro). Desde cualquier estado salvo `CANCELADO`, como `POST /proposals/:id/cancel`, y además desde `CANCELADO` con `autoClosed: true` (se canceló sola porque nadie votó): sigue `CANCELADO`, pasa a `autoClosed: false` (como cancelada a mano, ya no se replantea) y se anota con `from: "CANCELADO"`. Antes se cierra su votación si venció (ver «Cierre automático»), así que el resultado no depende de si alguien la consultó: con votos se confirma sola y se cancela (anotada `from: "CONFIRMADO"`, queda `autoClosed: false`); sin votos ya quedó `CANCELADO` con `autoClosed` y se modera como acaba de decirse. Una `CANCELADO` sin `autoClosed` → `409`. `200 AdminProposalSummary` · `409 INVALID_STATE` «La propuesta ya está cancelada.» · `404 PROPOSAL_NOT_FOUND` · `400 VALIDATION_ERROR`. Se anota como `PROPOSAL_CANCELLED` con `{ title, groupId, from, reason }`. Quien organiza el plan sigue usando `POST /proposals/:id/cancel`; esta ruta es solo para `ADMIN`.

### `GET /admin/audit?page=`
`200 Page<AuditEntry>`, lo más reciente primero:
```json
{ "id": "…", "action": "USER_SUSPENDED", "admin": { "id": "…", "name": "Admin", "email": "admin@test.com" },
  "targetType": "USER", "targetId": "…", "details": { "name": "Ana", "from": "ACTIVE", "to": "SUSPENDED" },
  "createdAt": "2026-09-29T15:00:00.000Z" }
```
- `action` ∈ `USER_SUSPENDED | USER_REACTIVATED | USER_PROMOTED | USER_DEMOTED | GROUP_DELETED | PROPOSAL_CANCELLED`; `targetType` ∈ `USER | GROUP | PROPOSAL`.
- `admin: null` = cambio hecho desde la consola (`npm run make-admin`).
- `details` guarda lo necesario para entender la acción aunque el objetivo ya no exista (nombre, título, estado anterior y nuevo, contadores, motivo); nunca correos, contraseñas ni tokens.

---

## Cambios respecto a la app Kotlin

- **Bloques puntuales con fecha:** en Kotlin un bloque puntual solo tenía `dayOfWeek = null` y no guardaba *qué día* ocurría. Ahora lleva `date`.
- **Franjas con fecha:** en Kotlin las franjas eran «semana tipo» (día de la semana y horas), y la fecha se calculaba al confirmar («el próximo jueves»); los puntuales no contaban para la disponibilidad. Ahora cada franja lleva `date` (`YYYY-MM-DD`, en `America/Lima`), elegida en una de las 4 semanas válidas; el plan se agenda en la fecha de la franja ganadora y `dayOfWeek` se deriva de esa fecha.
- **`isEssential` es por grupo:** en Kotlin estaba en `User`, pero alguien puede ser imprescindible en un grupo y no en otro. Ahora está en `GroupMember`.
- **Votos por usuario, no por email:** el servidor sabe quién vota por el token; la app ya no envía `userEmail`.
- **Un solo usuario actual:** el `id` sale siempre del token. Esto elimina el desajuste `mock_123` / `user_1` de la versión Kotlin.
- **Ubicación con coordenadas:** `location` pasa de texto libre a `{ name, latitude, longitude }` para usar `expo-location`.
- **Código de invitación:** 8 caracteres sin símbolos ambiguos, generado y garantizado único por el servidor (antes: 3 letras del nombre + 3 cifras, podía repetirse). Se acepta en minúsculas y con espacios.
- **Cruce de agendas:** los bloques `LIBRE` ya no cuentan como ocupados.
- **Voto:** votar dos veces la misma franja ya no retira el voto en el servidor (`PUT /vote` es idempotente); la app lo retira con `DELETE` cuando se toca la franja ya votada, así que el gesto es el mismo.
- **Plazo real:** `votingDeadline` es una fecha ISO (antes, texto libre) y cierra la votación.
- **Sin «llamados a la votación»:** en Kotlin eran un marcador local sin efecto; no hay endpoint y la app quita el botón «Votación» y la sección «Llamadas a la votación» del grupo.
- **Votación exprés:** la decide el grupo votando (`CANCELAR`, `REAGENDAR` o `MANTENER`, con quórum y plazo; ver «Votación exprés»), no el primero que pulsaba; reagendar deja el plan en recoordinación.
- **Criticidad** calculada por el servidor: una ausencia crítica (de quien propuso el plan, de un imprescindible o del organizador) es `ALTA` y lleva su `criticalReason`; las demás, según el tipo y los minutos de retraso.
- **Plan confirmado con fecha:** `scheduledAt` y `scheduledDate`; el «próximo plan» usa la franja elegida, no la primera.
- **OCR revisable y honesto:** los bloques leídos se validan uno a uno, salen como clases recurrentes (antes llegaban con `id`, `type` y `isRecurring` vacíos), se pueden corregir o quitar antes de guardarlos, y si la IA falla se muestra el error en vez de un horario inventado. El modelo `gemini-1.5-flash` (retirado) se sustituye por `GEMINI_MODEL`.
