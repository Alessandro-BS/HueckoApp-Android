# Franjas con fecha — diseño

Rama: `feature/franjas-con-fecha` (sale de `feature/unirse-por-proximidad`, PR #44, que a su vez va sobre #43; cuando
esos se integren, el PR de esta rama apunta a `develop`). Parte de la v3.0.0. Es la **fase 1** de la paridad con los
repos de Nakusuo (`huecko-frontend`, `huecko-backend`, `huecko-ai-service`).

## Por qué

Los dos equipos presentan el mismo producto en cursos distintos. En el de Nakusuo cada ventana de un plan tiene una
**fecha concreta** (`ventanas_plan.fecha`); en el nuestro, las franjas son «semana tipo» (`day_of_week`) y la fecha se
calcula recién al confirmar («el próximo jueves»). El usuario quiere que funcionen igual. Además, con fechas reales los
**horarios puntuales** (un compromiso de un día concreto) por fin cuentan para la disponibilidad: hoy se ignoran, así que
un plan puede caer justo el día que alguien avisó que no puede.

Las fases siguientes (votación exprés grupal, cierre automático, varios organizadores…) se apoyan en esto.

## Objetivos

- Cada franja de una propuesta tiene **fecha** (`YYYY-MM-DD`), hora de inicio y de fin.
- Al proponer, la persona elige **la semana** («Esta semana», «Próxima semana», «En 2 semanas», «En 3 semanas»: hasta
  **4 semanas**, la actual incluida), el **día de la semana** y las horas. La app arma la fecha. Así lo hace la web de
  Nakusuo (sin calendario).
- **De 2 a 5 franjas** por propuesta (hoy: 1 a 10). Se mantiene el botón «las 3 mejores» que elige el servidor.
- La **disponibilidad** de una semana concreta considera los bloques recurrentes **y los puntuales** de esa semana.
  La pestaña Disponibilidad del grupo también tiene el selector de semana.
- Al confirmar, la fecha del plan es la de la franja ganadora (sin «próxima ocurrencia»).
- **Reprogramar** pide franjas nuevas (de 2 a 5) y un plazo nuevo; las viejas se borran con sus votos.
- La fecha no depende de la zona horaria del servidor: la app trabaja en **America/Lima** fija.
- Las propuestas que ya existen siguen funcionando (se migran sin perder votos).

## No objetivos (otras fases o descartado)

- Quién decide un imprevisto (votación exprés grupal), cierre automático por plazo, voto múltiple, varios
  organizadores: fases 2 y 3. En esta fase `POST /incidences/resolve` sigue en manos de quien gestiona el plan.
- Selector de calendario libre: se eligió el modelo de Nakusuo (semana + día).
- Rechazar franjas que no alcanzan el umbral: **no** se hace. El % solo informa; cada persona decide con su voto.
  (Nakusuo sí las rechaza; aquí el usuario lo descartó expresamente.)
- Bloques puntuales de varios días (`fechaFin`), categoría y color del horario: otra fase.
- Cambiar el OCR del horario o las estadísticas del admin (ya usan `scheduled_at`).

## Anti-objetivos

- Que el % impida proponer un plan.
- Que la fecha guardada se corra un día por la zona horaria del proceso (Render corre en UTC).
- Perder votos o planes confirmados al migrar.
- Proponer una franja que ya empezó o que ya pasó.

## Restricciones

- Backend Express 5 + zod + `ApiError`, Postgres detrás de `Db` (Neon / PGlite), SQL parametrizado. Migraciones:
  se añade una nueva al final de `backend/src/db/migrations.ts`, nunca se edita una publicada.
- App Expo SDK 57, React Navigation, TanStack Query (ya en #43). `shared/index.d.ts` y `docs/api.md` cambian en el
  mismo commit que el endpoint.
- Reloj inyectado (`deps.now()`) para todo cálculo de «hoy» / «esta semana» en el servidor.
- Tests: Vitest en backend, Jest (`--maxWorkers=2`) en mobile.

## Enfoques considerados

- **A. Fecha en cada franja, conservando `day_of_week` derivado** — *elegido.* Se añade `date` a
  `proposal_windows`; el servidor deriva `day_of_week` de la fecha al insertar, así el cálculo semanal actual
  (`availability/matcher.ts`, puerto de la app Kotlin) se reutiliza. Solo se le suman los puntuales de la semana
  elegida. Es lo más cercano al modelo de Nakusuo y permite mezclar semanas.
- **B. Rehacer la disponibilidad por semana concreta como Nakusuo** — descartado: reescribe `matcher.ts` y muchos
  tests sin ganar nada visible; además cambia el redondeo (ellos truncan el %, nosotros redondeamos).
- **C. Guardar la semana en la propuesta y dejar las franjas como están** — descartado: todas las franjas quedan en
  una sola semana, «esta semana» con días pasados necesita reglas raras y el modelo queda distinto del de ellos.

## Lo decidido

### Zona horaria y semanas

- Constante `APP_TIME_ZONE = 'America/Lima'` en el backend (un módulo de fechas, p. ej. `backend/src/common/zone.ts`)
  con: `today(now)`, `mondayOf(date)`, `isoDay(date)`, `instant(date, 'HH:mm')` → `Date`. No se usa `TZ` del proceso.
- Una **semana** se identifica por su lunes (`YYYY-MM-DD`). Semanas válidas: la actual y las 3 siguientes
  (`week ∈ [mondayOf(today), mondayOf(today) + 21 días]`).

### Datos

- Migración 7 en `proposal_windows`:
  - `ADD COLUMN date TEXT COLLATE "C"`.
  - Backfill: la franja elegida (`proposals.chosen_window_id`) toma `proposals.scheduled_date`. El resto toma la
    próxima ocurrencia de su `day_of_week` desde la fecha de creación de la propuesta (la misma regla que se usaba al
    confirmar).
  - `SET NOT NULL`. El `UNIQUE` pasa de `(proposal_id, day_of_week, start_time, end_time)` a
    `(proposal_id, date, start_time, end_time)`.
  - `day_of_week` se conserva y siempre se deriva de `date` al insertar.
- Los votos no se tocan (la FK sigue apuntando a la franja por id).

### Reglas de las franjas (servidor)

Al crear una propuesta, al añadir una franja y al reprogramar:

- `date` es una fecha real dentro de las 4 semanas válidas; `startTime < endTime`, formato `HH:mm`.
- El inicio (`instant(date, startTime)`) es **posterior a ahora**.
- Sin franjas repetidas ni que se solapen el mismo día dentro de la propuesta.
- Cantidad: de 2 a 5 al crear manualmente y al reprogramar. `POST /proposals/:id/windows` añade una más mientras
  la votación esté abierta y no se pase de 5.
- El plazo de votación (`votingDeadline`) es futuro y **anterior al inicio de la primera franja** (como Nakusuo: no se
  puede seguir votando una opción que ya empezó).
- El % de cada franja lo calcula el servidor; no hay mínimo.

### «Las 3 mejores»

- `POST /groups/:id/proposals` con `windows` vacío recibe `week` (lunes) y el servidor elige hasta 3 franjas con fecha
  en esa semana, mismas reglas de orden que hoy (`bestWindows`), descartando las que ya empezaron.
- Si encuentra menos de 2, responde `409 NO_COMMON_WINDOWS` (el mínimo de 2 vale también aquí).

### Disponibilidad

- `GET /groups/:id/availability?week=YYYY-MM-DD` (por defecto, la semana actual). Devuelve las franjas de esa semana
  **con fecha**: los recurrentes ocupan su día de la semana; los puntuales, solo su fecha si cae en esa semana. Los
  bloques `LIBRE` siguen sin ocupar.
- El cálculo del % de una franja concreta (`windowAvailability`) usa los recurrentes del día de la semana de la fecha
  más los puntuales de esa fecha.
- Las horas de una semana actual que ya pasaron no se ofrecen como franjas sugeridas.

### Confirmar y reprogramar

- Confirmar: `scheduledAt = instant(date, startTime)`, `scheduledDate = date`. Solo se puede confirmar una franja que
  no haya empezado; si todas pasaron, hay que reprogramar (`409`, código nuevo, p. ej. `WINDOW_STARTED`).
- Reprogramar (`POST /incidences/resolve` con la opción de reprogramar): además del plazo nuevo exige `windows` (2 a 5,
  mismas reglas). Borra las franjas anteriores y sus votos, y limpia `chosen_window_id`/`scheduled_*`.

- **Replantear una propuesta en votación** (decisión del usuario): quien gestiona el plan puede, con la propuesta en
  `PROPUESTO`, reemplazar sus franjas por otras nuevas (2 a 5, mismas reglas) y poner un plazo nuevo; se borran los
  votos anteriores. Sirve sobre todo cuando todas las franjas ya pasaron (frecuente en propuestas migradas). En la app
  usa la misma pantalla que reprogramar. Endpoint y nombre los elige quien construye (p. ej.
  `POST /proposals/:id/replan`). En la fase 2 (decide el grupo, cierre automático) se puede revisar.
- La migración no cancela ni cambia el estado de ninguna propuesta: las que quedan con franjas pasadas se replantean.

### IA

- Borrador (`proposal-draft`) y sugerencias (`ai/suggestions`): los candidatos que se le pasan al modelo son franjas
  **con fecha** de la semana elegida (por defecto, la actual y, si queda poco, la siguiente). Se quita del prompt
  «semana tipo» y el truco «hoy / la próxima semana». El JSON de salida sigue usando `windowIndex`.
- Resumen de la votación: el prompt muestra la fecha de cada franja.

### App

- Editor de franjas: selector de semana (4 opciones), selector de día (L–D; en la semana actual, los días que ya
  pasaron se desactivan) y horas como hoy. Muestra la fecha resultante («Jue 20 nov · 16:00–18:00»).
- Crear propuesta: mínimo 2 y máximo 5 franjas; el botón «las 3 mejores» usa la semana seleccionada.
- Etiquetas de franjas en votación, confirmar, detalle del plan, sugerencias e Inicio con fecha corta
  (`windowLabel` en `mobile/src/utils/proposals.ts` es el punto central).
- Pestaña Disponibilidad del grupo: el mismo selector de semana.
- Reprogramar (`ExpressVoteCard`): además del plazo, el editor de franjas (2 a 5).
- Inicio (`/me/dashboard`): `nextWindow` incluye `date`.

### Contrato

- `TimeWindowInput` pasa a `{ date, startTime, endTime }`. `TimeWindow` y `MatchWindow` añaden `date` (se mantiene
  `dayOfWeek` derivado en las respuestas). `docs/api.md` se actualiza en las secciones de propuestas, disponibilidad,
  dashboard, IA y códigos de error.
- Es un cambio incompatible para clientes viejos; la única app es la nuestra y sale junta en la v3.0.0.

### Decisiones del diseñador (revisables)

- `POST /proposals/:id/windows`: la franja nueva debe empezar **después del plazo vigente**. Las propuestas migradas
  que ya tienen 1 o más de 5 franjas no se tocan; solo se puede añadir si el total queda en 5 o menos.
- Borrador de IA: el servidor garantiza de 2 a 5 franjas en `options` (completa con las mejores franjas de la semana si
  el modelo da menos); si no hay 2 candidatas, `409 NO_COMMON_WINDOWS`.
- Parámetro `week`: se normaliza al lunes (`mondayOf`). Fuera de las 4 semanas válidas → `400 VALIDATION_ERROR`, también
  en `GET /availability`.
- App: calcula «hoy» y los lunes en **America/Lima** (con `Intl`), igual que el servidor; si el reloj del celular está
  desfasado, el servidor rechaza y la app muestra el mensaje. No hay campo de hora del servidor.
- Una franja sugerida de la semana actual que ya empezó se **descarta entera** (no se recorta).
- Los puntuales de tipo `LIBRE` no ocupan, igual que los recurrentes.
- Errores de plazo y de franjas: `400 VALIDATION_ERROR` con `details` y mensajes distintos (plazo pasado / plazo
  posterior a la primera franja / franja que ya empezó / solapadas / cantidad).

## Para quien construye

- Nombres de módulos, helpers y de los códigos de error nuevos (siguiendo el estilo de `docs/api.md`).
- Cómo implementar `instant` con zona fija (Lima no tiene horario de verano; `Intl` o un offset fijo `-05:00`
  son válidos si están probados).
- La consulta que trae los puntuales de un rango de fechas.
- Textos exactos de la UI fuera de los indicados, y cómo se ve el selector de semana.
- Ajustar la semilla (`demo-data.ts`) para crear franjas con fecha dentro de las próximas semanas.
- Orden de trabajo y reparto en tareas (va a `writing-plans`).
