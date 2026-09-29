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
| 400 | `INVALID_JSON`: el cuerpo de la petición no es JSON válido |
| 401 | Falta el token o expiró → la app vuelve al login |
| 403 | Autenticado pero sin permiso (p. ej. no es miembro del grupo) |
| 404 | No existe, o no es visible para este usuario |
| 409 | Conflicto de reglas: email ya registrado, ya es miembro, votación cerrada (`VOTING_CLOSED`), nadie votó (`NO_VOTES`), el estado del plan no lo permite (`INVALID_STATE`), franja repetida (`WINDOW_EXISTS`) |
| 413 | `PAYLOAD_TOO_LARGE`: la petición supera el tamaño máximo (1 MB; 5 MB la imagen del OCR) |
| 429 | `TOO_MANY_REQUESTS`: demasiados intentos en `/auth` (20 cada 15 min por IP) o demasiadas llamadas a la IA (20 cada 15 min por usuario) |
| 500 | Error inesperado del servidor |
| 502 | `AI_BAD_RESPONSE`: la IA respondió algo que no cumple el formato esperado |
| 503 | `AI_UNAVAILABLE`: la IA no respondió (proveedor caído o más de 30 s) |

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
| `TimeBlock` | Bloque de horario: recurrente (`dayOfWeek`) o puntual (`date`) |
| `GroupSummary` / `Group` | Grupo; el detalle incluye `inviteCode` y `members` |
| `GroupMember` | Usuario + `role` (`OWNER`/`MEMBER`) + `isEssential` |
| `MatchWindow` | Franja libre en común con su % de coincidencia |
| `Proposal` | Propuesta de plan con ventanas, votos, ubicación e incidencias |
| `TimeWindow` | Ventana horaria votable dentro de una propuesta |
| `Incidence` | Imprevisto reportado sobre un plan confirmado |
| `Location` | Lugar con nombre y coordenadas opcionales |
| `ProposalWithGroup` | `Proposal` + `groupName` |
| `UpcomingPlan` / `Attendee` | Próximo plan con la asistencia prevista de cada miembro |
| `Dashboard` | Resumen de «Inicio» (`GET /me/dashboard`) |
| `AiStatus` | Si la IA del servidor es Gemini o el modo demostración |

---

## Salud

### `GET /health`
Sin autenticación. Responde `200 { "status": "ok" }`.

## Autenticación

### `POST /auth/register`
```json
{ "name": "Ana", "email": "ana@correo.com", "password": "min 8 caracteres" }
```
`password` entre 8 y 72 caracteres. El correo se guarda con `trim` y en minúsculas.

`201 { "token": "<jwt>", "user": User }` · `409 EMAIL_TAKEN`

### `POST /auth/login`
```json
{ "email": "ana@correo.com", "password": "..." }
```
`200 { "token": "<jwt>", "user": User }` · `401 INVALID_CREDENTIALS`

El `401 INVALID_CREDENTIALS` lleva el mensaje «Correo o contraseña incorrectos.» y es igual si el correo no existe.

### `GET /auth/me`
`200 User`. La app lo usa al abrir para comprobar si el token guardado sigue siendo válido.

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

`201 TimeBlock` · `400 VALIDATION_ERROR` (`details[].path` indica el campo)

### `POST /me/time-blocks/bulk`
`{ "blocks": [ ...mismo cuerpo que arriba... ] }` → `201 TimeBlock[]`. Entre 1 y 100 bloques. **Todo o nada:** si uno es inválido responde `400` (con `path` tipo `["blocks", 1, "endTime"]`) y no se guarda ninguno. Lo usa la pantalla de revisión del OCR.

### `DELETE /me/time-blocks/:id`
`204` · `404 TIME_BLOCK_NOT_FOUND` si el bloque no existe o no es del usuario.

### `GET /me/upcoming-plans`
`200 ProposalWithGroup[]`: propuestas `CONFIRMADO` de todos mis grupos cuyo `scheduledAt` todavía no llegó, de la más próxima a la más lejana. Cada una lleva `groupName`.

### `GET /me/dashboard`
Todo lo que necesita «Inicio» en una sola llamada: `200 Dashboard`.
- `metrics.activeGroups`: grupos de los que soy miembro.
- `metrics.openVotes`: propuestas `PROPUESTO` de mis grupos (aunque su plazo haya pasado: siguen pendientes de hora hasta que alguien las confirme).
- `metrics.matchingHours`: suma, sobre las franjas de las propuestas de mis grupos **que no están `CANCELADO`** (cualquier otro estado cuenta, también `EN_RECOORDINACION`) con `availabilityPercentage ≥ 80` (fijo, no el umbral del grupo), de `hora(endTime) − hora(startTime)` en horas enteras (se truncan los minutos), sin deduplicar solapes. Es la fórmula de la app Kotlin salvo que aquí las canceladas no cuentan.
- `metrics.totalBlocks`: mis bloques de horario (recurrentes y puntuales).
- `nextPlan`: el primero de `/me/upcoming-plans` con `attendees`, uno por miembro del grupo; su estado sale de su primera incidencia sin resolver: `TARDANZA` → `RETRASADO`, `FALTA`/`IMPREVISTO` → `NO_ASISTE`, ninguna → `PUNTUAL`. `null` si no hay.
- `groups`: uno por grupo (en el orden de `GET /groups`), con `nextWindow` = la franja elegida (o la primera) de su propuesta no cancelada más antigua que tenga franjas; `null` si no hay.
- `pendingVotes`: propuestas `PROPUESTO` de mis grupos con `groupName`, las que cierran antes primero.
- `expressAlert`: de los planes que aún no ocurrieron, el primero `EN_RECOORDINACION` (`kind: "RECOORDINACION"`) o, si no hay, el primero `CONFIRMADO` con incidencias sin resolver (`kind: "AVISO"`). `who` y `reason` salen de su incidencia sin resolver más crítica (`ALTA` primero; si no, la más antigua). `canResolve` es `true` si soy quien creó el plan. `null` si no hay.

El «horario de hoy» no viene aquí: depende de la zona horaria del teléfono, así que la app lo calcula con `GET /me/time-blocks`.

## Grupos

### `GET /groups`
`200 GroupSummary[]`: grupos de los que soy miembro, en el orden en que me uní.

### `POST /groups`
```json
{ "name": "Proyecto Integrador", "description": "", "availabilityThreshold": 80 }
```
`name` obligatorio (1–60 tras `trim`); `description` opcional (≤ 200, por defecto `""`); `availabilityThreshold` entero 0–100 (por defecto 80).
El servidor genera el `inviteCode`: **8 caracteres** de `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (sin `0/O/1/I`), único. Los códigos de la semilla (`PROY2026`, `HUECKO123`) no siguen ese formato y siguen siendo válidos. El creador queda como `OWNER`. `201 Group`

### `POST /groups/join`
`{ "inviteCode": "PROY2026" }` → `200 Group`. El código se normaliza con `trim` y mayúsculas (`" proy2026 "` sirve).
`404 INVALID_INVITE_CODE` «Código de invitación inválido.» · `409 ALREADY_MEMBER` «Ya perteneces a este grupo.» · `400` si viene vacío.

### `GET /groups/:id`
`200 Group` con la lista completa de miembros, en orden de llegada.
`404 GROUP_NOT_FOUND` si no existe · `403 NOT_A_MEMBER` si existe pero no soy miembro. (Igual en todas las rutas `/groups/:id/...`.)

### `PATCH /groups/:id`
Solo el `OWNER` (`403 NOT_OWNER`). Campos opcionales con las mismas reglas que al crear: `name`, `description`, `availabilityThreshold`; hay que enviar al menos uno. `200 Group`

### `PATCH /groups/:id/members/:userId`
Solo el `OWNER`. `{ "isEssential": true }` → `200 GroupMember` · `404 MEMBER_NOT_FOUND` si esa persona no está en el grupo. El `OWNER` puede marcarse a sí mismo.

### `DELETE /groups/:id/members/me`
Salir del grupo. `204`. Si sale el último `OWNER` y quedan miembros, pasa a `OWNER` quien lleva más tiempo en el grupo. Si no queda nadie, el grupo se borra.

### `GET /groups/:id/availability`
Cruce de horarios de todos los miembros, calculado en el servidor con el umbral del grupo (mismo algoritmo que `AvailabilityMatcher.kt`).
`200 MatchWindow[]`, ordenadas por día (lunes a domingo) y hora · `403 NOT_A_MEMBER` · `404 GROUP_NOT_FOUND`.

Reglas:
- La agenda va de **08:00 a 20:00** en horas enteras; cada hora `h` es la franja `[h:00, h+1:00)`.
- Un bloque ocupa **entera** cualquier hora que toque: el inicio trunca minutos (`10:30` → 10) y el fin redondea hacia arriba (`10:30` → 11).
- Por hora: `libres = miembros − personas ocupadas` (una persona cuenta una vez aunque tenga bloques solapados); `% = round(libres × 100 / miembros)`.
- Una hora vale si `% ≥ availabilityThreshold` (inclusivo). Las horas válidas seguidas se fusionan en una franja, que muestra el **peor** `%` y el **menor** `freeMembers` de sus horas.
- Solo cuentan los bloques **recurrentes**; los puntuales no entran en esta vista semanal (un filtro `?weekOf=YYYY-MM-DD` queda pendiente).
- Los bloques de tipo **`LIBRE` no ocupan**.
- Grupo sin miembros → `[]`.

## Propuestas y votación

### `GET /groups/:id/proposals`
`200 Proposal[]` del grupo, **las más recientes primero** (`createdAt` descendente). Devuelve todas, también las `CANCELADO` (la app las oculta). `403 NOT_A_MEMBER` · `404 GROUP_NOT_FOUND`.

### `POST /groups/:id/proposals`
```json
{
  "title": "Estudiar para el parcial",
  "location": { "name": "Biblioteca", "latitude": -12.07, "longitude": -77.08 },
  "votingDeadline": "2026-10-03T23:59:00.000Z",
  "windows": [ { "dayOfWeek": 5, "startTime": "16:00", "endTime": "18:00" } ]
}
```
Cuerpo = `ProposalInput` de `shared`. Reglas:
- `title` obligatorio, 1–80 caracteres tras `trim` («El título no puede estar vacío.»).
- `location` opcional (`null` u omitido = sin lugar). `name` 1–100 tras `trim`; `latitude` (−90…90) y `longitude` (−180…180) van **juntas** o ambas `null`/omitidas.
- `votingDeadline` ISO 8601 (con `Z` u offset) **posterior al momento de crear** («La fecha límite debe ser futura»). Se guarda y se devuelve en UTC.
- `windows` opcional, hasta 10 y sin repetir; cada una `{ dayOfWeek 1–7, startTime, endTime }` en `HH:mm` con `startTime < endTime` (`TimeWindowInput`). El `availabilityPercentage` lo calcula el servidor (ver `POST /proposals/:id/windows`).
- Si `windows` viene vacío u omitido, el servidor propone **las 3 mejores franjas** de `/availability`: mayor `availabilityPercentage`, luego mayor duración, luego día y hora más tempranos. Si el grupo no tiene ninguna franja, la propuesta nace sin franjas.
- Nace `PROPUESTO`, con `createdAt` = ahora, sin votos ni incidencias.

`201 Proposal` · `400 VALIDATION_ERROR` · `403 NOT_A_MEMBER` · `404 GROUP_NOT_FOUND`

### `GET /proposals/:id`
`200 Proposal`. `windows` van por día y hora; `myVoteWindowId` es la franja que votó quien pregunta.
`404 PROPOSAL_NOT_FOUND` · `403 NOT_A_MEMBER` si no soy miembro de su grupo. (Igual en todas las rutas `/proposals/:id/...`.)

### `PUT /proposals/:id/vote`
`{ "windowId": "..." }`. Un voto por persona y propuesta: votar otra franja **mueve** el voto; votar la misma otra vez **no cambia nada** (idempotente). El «tocar otra vez retira el voto» de la app Kotlin se hace desde la app con `DELETE`.
`200 Proposal` · `409 VOTING_CLOSED` «La votación ya cerró.» si el estado no es `PROPUESTO` o ya llegó el `votingDeadline` · `404 WINDOW_NOT_FOUND` si la franja no es de esta propuesta.

### `DELETE /proposals/:id/vote`
Retira mi voto (si no había, no pasa nada). `200 Proposal` · `409 VOTING_CLOSED` con las mismas reglas que votar.

### `POST /proposals/:id/windows`
Añadir una franja a una propuesta en votación. Cualquier miembro. `{ "dayOfWeek": 5, "startTime": "18:00", "endTime": "19:30" }` (`TimeWindowInput`, mismas reglas de formato y orden).
El servidor calcula su `availabilityPercentage` con los horarios **actuales** del grupo: para cada hora que toca la franja (mismo redondeo que `/availability`: inicio truncado, fin hacia arriba) calcula el % de miembros libres y se queda con el **peor**. No se aplica el umbral del grupo ni el rango 08–20. Los porcentajes no se recalculan después.
`201 Proposal` · `409 WINDOW_EXISTS` «Esa franja ya está propuesta.» · `409 VOTING_CLOSED`

### `POST /proposals/:id/confirm`
Solo quien la creó (`403 NOT_CREATOR` «Solo quien propuso el plan puede hacer esto.») y solo si está `PROPUESTO` (`409 INVALID_STATE`); se puede confirmar antes o después del plazo. `{ "windowId": "..." }` es opcional:
- con `windowId`: se confirma esa franja, tenga votos o no (`404 WINDOW_NOT_FOUND` si no es de la propuesta);
- sin `windowId`: gana la más votada; si empatan, la de mayor `availabilityPercentage`; si siguen empatadas, la de día y hora más tempranos. Si nadie votó → `409 NO_VOTES`.

Pasa a `CONFIRMADO` con `chosenWindowId`, `scheduledAt` = **la próxima vez que ocurre esa franja** (su día de la semana y hora de inicio) desde el momento de confirmar, y `scheduledDate` (`"YYYY-MM-DD"`) = esa misma fecha en la zona horaria del servidor, para que la app la muestre sin depender de la del teléfono. Si hoy es ese día y la hora aún no llegó, es hoy; si ya pasó, la semana siguiente. Se calcula en la zona horaria del servidor: la variable `TZ` del backend (`America/Lima` en `backend/.env.example`; si falta, la del PC). En producción `TZ` debe fijarse siempre. Desde ese momento no se puede votar. `200 Proposal`

### `POST /proposals/:id/cancel`
Solo quien la creó. Desde cualquier estado salvo `CANCELADO` (`409 INVALID_STATE`). Pasa a `CANCELADO`. `200 Proposal`

### `POST /proposals/:id/incidences`
Reportar un imprevisto sobre un plan `CONFIRMADO` o `EN_RECOORDINACION` (si no, `409 INVALID_STATE` «Solo se pueden reportar imprevistos de un plan confirmado.»). Cualquier miembro.
```json
{ "type": "TARDANZA", "reason": "Tráfico", "delayMinutes": 20 }
```
Cuerpo = `IncidenceInput`. Reglas:
- `type` ∈ `FALTA | TARDANZA | IMPREVISTO`; `reason` obligatorio, 1–200 caracteres tras `trim`.
- `delayMinutes`: entero 1–600, **obligatorio** si `TARDANZA`; `null` u omitido en los demás.
- `criticality` la pone el servidor: `FALTA` de un imprescindible → `ALTA`; cualquier otra `FALTA` o un `IMPREVISTO` → `MEDIA`; `TARDANZA` → `BAJA`, o `MEDIA` si `delayMinutes ≥ 30`.
- Si quien reporta es imprescindible (`isEssential`) y el tipo es `FALTA`, un plan `CONFIRMADO` pasa a `EN_RECOORDINACION`.

`201 Proposal`

### `POST /proposals/:id/incidences/resolve`
La «votación exprés». Solo quien la creó, y solo con el plan `CONFIRMADO` o `EN_RECOORDINACION` (`409 INVALID_STATE`). Cuerpo = `ResolveIncidencesInput`:
- `{ "newState": "CONFIRMADO" }` — mantener el plan;
- `{ "newState": "CANCELADO" }` — cancelarlo;
- `{ "newState": "PROPUESTO", "votingDeadline": "2026-10-10T20:00:00.000Z" }` — reprogramar: `votingDeadline` obligatorio y futuro.

`votingDeadline` **solo se valida cuando `newState` es `PROPUESTO`**; con `CONFIRMADO` o `CANCELADO` se ignora. Siempre: **todas** las incidencias quedan `resolved: true`. Con `PROPUESTO` además se borran todos los votos, `chosenWindowId`, `scheduledAt` y `scheduledDate` vuelven a `null` y empieza una votación nueva hasta el plazo enviado; las franjas se conservan. `200 Proposal`

**Cuándo muestra la app la alerta exprés:** con el plan `EN_RECOORDINACION` («Votación exprés»: falta un imprescindible) o `CONFIRMADO` con incidencias sin resolver («Aviso de imprevisto»). En los dos casos solo quien creó el plan ve Reprogramar / Cancelar / Mantener.

## Inteligencia artificial

Toda llamada a la IA pasa por el backend (Google Gemini, modelo `GEMINI_MODEL`): la API key **nunca** va en la app. Reglas comunes:
- Todas las rutas exigen token. Las que llaman a la IA comparten un límite de **20 llamadas cada 15 min por usuario** (`429 TOO_MANY_REQUESTS`); `GET /ai/status` no cuenta.
- La respuesta de la IA se valida siempre: si no cumple el formato → `502 AI_BAD_RESPONSE`; si el proveedor falla o tarda más de 30 s → `503 AI_UNAVAILABLE`. Nunca se devuelven datos inventados para tapar un fallo.
- Si el modelo principal está saturado (503) o sin cuota (429), el servidor reintenta una vez con `GEMINI_FALLBACK_MODEL`; `GEMINI_TIMEOUT_MS` (30 s) es el tope total de los dos intentos.
- La IA **solo sugiere**: ninguna de estas rutas guarda nada. El usuario revisa el resultado y lo confirma con los endpoints de siempre.
- **Modo demostración:** si el servidor no tiene `GEMINI_API_KEY`, las respuestas son datos de ejemplo fijos (validados igual).

### `GET /ai/status`
`200 AiStatus`: `{ "provider": "gemini" }` o `{ "provider": "mock" }` (modo demostración; la app lo avisa).

### `POST /ai/schedule-ocr`
`multipart/form-data` con el campo `image` (JPG o PNG, máx. 5 MB).
Devuelve bloques **sin guardar**, para que el usuario los revise y los guarde con `POST /me/time-blocks/bulk`.
```json
{ "blocks": [ { "label": "Cálculo", "type": "CLASE", "startTime": "08:00", "endTime": "10:00",
                "isRecurring": true, "dayOfWeek": 1, "date": null } ] }
```
`200` · `422 AI_UNREADABLE` si la imagen no parece un horario.

---

## Cambios respecto a la app Kotlin

- **Bloques puntuales con fecha:** en Kotlin un bloque puntual solo tenía `dayOfWeek = null` y no guardaba *qué día* ocurría. Ahora lleva `date`.
- **`isEssential` es por grupo:** en Kotlin estaba en `User`, pero alguien puede ser imprescindible en un grupo y no en otro. Ahora está en `GroupMember`.
- **Votos por usuario, no por email:** el servidor sabe quién vota por el token; la app ya no envía `userEmail`.
- **Un solo usuario actual:** el `id` sale siempre del token. Esto elimina el desajuste `mock_123` / `user_1` de la versión Kotlin.
- **Ubicación con coordenadas:** `location` pasa de texto libre a `{ name, latitude, longitude }` para usar `expo-location`.
- **Código de invitación:** 8 caracteres sin símbolos ambiguos, generado y garantizado único por el servidor (antes: 3 letras del nombre + 3 cifras, podía repetirse). Se acepta en minúsculas y con espacios.
- **Cruce de agendas:** los bloques `LIBRE` ya no cuentan como ocupados.
- **Voto:** votar dos veces la misma franja ya no retira el voto en el servidor (`PUT /vote` es idempotente); la app lo retira con `DELETE` cuando se toca la franja ya votada, así que el gesto es el mismo.
- **Plazo real:** `votingDeadline` es una fecha ISO (antes, texto libre) y cierra la votación.
- **Sin «llamados a la votación»:** en Kotlin eran un marcador local sin efecto; no hay endpoint y la app quita el botón «Votación» y la sección «Llamadas a la votación» del grupo.
- **Votación exprés:** solo quien creó el plan la decide (antes, el primero que pulsaba) y reprogramar pide una nueva fecha límite.
- **Criticidad** calculada por el servidor según el tipo, si es imprescindible y los minutos de retraso.
- **Plan confirmado con fecha:** `scheduledAt` y `scheduledDate`; el «próximo plan» usa la franja elegida, no la primera.
