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
| 401 | Falta el token o expiró → la app vuelve al login |
| 403 | Autenticado pero sin permiso (p. ej. no es miembro del grupo) |
| 404 | No existe, o no es visible para este usuario |
| 409 | Conflicto de reglas: email ya registrado, votación cerrada, ya es miembro |
| 422 | La IA no pudo interpretar la imagen |
| 429 | Demasiados intentos en `/auth` (20 cada 15 min por IP) |
| 500 | Error inesperado del servidor |

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
`200 TimeBlock[]`, solo los del usuario autenticado.

### `POST /me/time-blocks`
```json
{ "label": "Clase de Android", "type": "CLASE", "startTime": "08:00", "endTime": "10:00",
  "isRecurring": true, "dayOfWeek": 1, "date": null }
```
Reglas: `startTime < endTime`; si `isRecurring`, `dayOfWeek` es obligatorio y `date` es null; si no, al revés.
`201 TimeBlock`

### `POST /me/time-blocks/bulk`
`{ "blocks": [ ...mismo cuerpo que arriba... ] }` → `201 TimeBlock[]`. Lo usa la pantalla de revisión del OCR para guardar todo de una vez.

### `DELETE /me/time-blocks/:id`
`204` · `404` si el bloque no es del usuario.

### `GET /me/upcoming-plans`
`200 Proposal[]`: propuestas `CONFIRMADO` de todos mis grupos con fecha futura, ordenadas. Alimenta el dashboard.

## Grupos

### `GET /groups`
`200 GroupSummary[]`: grupos de los que soy miembro.

### `POST /groups`
```json
{ "name": "Proyecto Integrador", "description": "", "availabilityThreshold": 80 }
```
El servidor genera el `inviteCode` y deja al creador como `OWNER`. `201 Group`

### `POST /groups/join`
`{ "inviteCode": "PROY2026" }` → `200 Group` · `404` si el código no existe · `409 ALREADY_MEMBER`

### `GET /groups/:id`
`200 Group` con la lista completa de miembros · `403` si no soy miembro.

### `PATCH /groups/:id`
Solo el `OWNER`. Campos opcionales: `name`, `description`, `availabilityThreshold`. `200 Group`

### `PATCH /groups/:id/members/:userId`
Solo el `OWNER`. `{ "isEssential": true }` → `200 GroupMember`

### `DELETE /groups/:id/members/me`
Salir del grupo. `204`

### `GET /groups/:id/availability`
Cruce de horarios de todos los miembros, calculado en el servidor con el umbral del grupo.
`200 MatchWindow[]`, ordenadas por día y hora.

## Propuestas y votación

### `GET /groups/:id/proposals`
`200 Proposal[]` del grupo, las más recientes primero.

### `POST /groups/:id/proposals`
```json
{
  "title": "Estudiar para el parcial",
  "location": { "name": "Biblioteca", "latitude": -12.07, "longitude": -77.08 },
  "votingDeadline": "2026-10-03T23:59:00.000Z",
  "windows": [ { "dayOfWeek": 5, "startTime": "16:00", "endTime": "18:00" } ]
}
```
Si `windows` viene vacío u omitido, el servidor propone las 3 mejores franjas de `/availability`.
`201 Proposal`

### `GET /proposals/:id`
`200 Proposal`

### `PUT /proposals/:id/vote`
`{ "windowId": "..." }`. El voto es **excluyente**: si ya había votado, se reemplaza.
`200 Proposal` · `409 VOTING_CLOSED` si pasó el `votingDeadline` o el estado no es `PROPUESTO`.

### `DELETE /proposals/:id/vote`
Retira mi voto. `200 Proposal`

### `POST /proposals/:id/confirm`
Solo quien la creó. `{ "windowId": "..." }` (opcional: si falta, gana la más votada). Pasa a `CONFIRMADO`. `200 Proposal`

### `POST /proposals/:id/cancel`
Solo quien la creó. Pasa a `CANCELADO`. `200 Proposal`

### `POST /proposals/:id/incidences`
Reportar un imprevisto sobre un plan confirmado.
```json
{ "type": "TARDANZA", "reason": "Tráfico", "delayMinutes": 20 }
```
Si quien reporta es imprescindible (`isEssential`) y el tipo es `FALTA`, la propuesta pasa a `EN_RECOORDINACION`. `201 Proposal`

### `POST /proposals/:id/incidences/resolve`
Solo quien la creó. `{ "newState": "CONFIRMADO" | "CANCELADO" }` → marca las incidencias como resueltas. `200 Proposal`

## Inteligencia artificial

Toda llamada a la IA pasa por el backend: la API key **nunca** va en la app.

### `POST /ai/schedule-ocr`
`multipart/form-data` con el campo `image` (JPG o PNG, máx. 5 MB).
Devuelve bloques **sin guardar**, para que el usuario los revise y los guarde con `POST /me/time-blocks/bulk`.
```json
{ "blocks": [ { "label": "Cálculo", "type": "CLASE", "startTime": "08:00", "endTime": "10:00",
                "isRecurring": true, "dayOfWeek": 1, "date": null } ] }
```
`200` · `422 AI_UNREADABLE` si la imagen no parece un horario.

### Otras funciones de IA (por definir)
Ayuda en votaciones y demás funciones: se agregan aquí cuando el equipo las defina, con el mismo formato.

---

## Cambios respecto a la app Kotlin

- **Bloques puntuales con fecha:** en Kotlin un bloque puntual solo tenía `dayOfWeek = null` y no guardaba *qué día* ocurría. Ahora lleva `date`.
- **`isEssential` es por grupo:** en Kotlin estaba en `User`, pero alguien puede ser imprescindible en un grupo y no en otro. Ahora está en `GroupMember`.
- **Votos por usuario, no por email:** el servidor sabe quién vota por el token; la app ya no envía `userEmail`.
- **Un solo usuario actual:** el `id` sale siempre del token. Esto elimina el desajuste `mock_123` / `user_1` de la versión Kotlin.
- **Ubicación con coordenadas:** `location` pasa de texto libre a `{ name, latitude, longitude }` para usar `expo-location`.
