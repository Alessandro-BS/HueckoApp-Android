# Votación exprés grupal (fase 2 de paridad con Nakusuo)

Fecha: 2026-11-13 · Rama prevista: `feature/votacion-expres-grupal` (sale de `feature/franjas-con-fecha`, PR #45, mientras
#43–#45 no estén integrados).

## Intención

Los dos equipos presentan el mismo producto. En la versión de Nakusuo (`huecko-backend`, módulo `imprevisto`), cuando
alguien importante no puede ir a un plan confirmado **decide el grupo** con una votación corta: cancelar, reagendar o
mantener. En la nuestra hoy decide una sola persona (quien gestiona el plan) con «Reprogramar / Cancelar / Mantener».
El usuario eligió hacerlo **como Nakusuo**. La IA solo **recomienda** qué votar.

## Objetivos

- Una ausencia crítica abre una votación exprés del grupo con tres opciones: `CANCELAR`, `REAGENDAR`, `MANTENER`.
- La criticidad la deciden reglas fijas (las de Nakusuo), con una razón legible para el grupo.
- La votación se cierra sola (al votar todos o al vencer el plazo) y su resultado se aplica al plan.
- La IA sugiere una opción con su razón, sin bloquear nada.
- `REAGENDAR` deja el plan en recoordinación y quien lo gestiona propone franjas nuevas con el replanteo de la fase 1.

## No objetivos

- Tiempo real / notificaciones push (Nakusuo avisa por WebSocket; aquí la app ve el cambio al recargar o al enfocar).
- Varios organizadores por grupo (otra fase). «Organizador» = `OWNER` del grupo, y gestionar sigue siendo
  «Quién gestiona un plan» de `docs/api.md`.
- Que la IA decida la criticidad leyendo el motivo (Nakusuo lo tiene apagado por defecto; el usuario lo descartó).
- Alertas de retraso separadas como en Nakusuo: la `TARDANZA` sigue siendo una incidencia informativa como hoy.
- Procesos periódicos, cron externo o infraestructura nueva.

## Anti-objetivos (sería un fracaso aunque funcione)

- Que un solo voto cancele el plan de un grupo de seis.
- Que una votación decida después de que el plan ya empezó.
- Que un plan quede atascado en `EN_RECOORDINACION` sin que nadie pueda sacarlo.
- Que un fallo o la lentitud de la IA impida reportar o votar.
- Que dos consultas a la vez cierren la misma votación dos veces o apliquen dos resultados.

## Restricciones

- Backend Express 5 + zod + `ApiError`; Postgres detrás de `Db` (Neon / PGlite), SQL parametrizado; la migración se
  añade al final de `backend/src/db/migrations.ts` (nunca se edita una publicada).
- Render gratis: el servidor se duerme; no hay procesos que corran solos.
- Zona fija `America/Lima` y helpers de `common/zone.ts` (fase 1).
- `shared/index.d.ts` y `docs/api.md` cambian en el mismo commit que el endpoint.
- App Expo con React Navigation; TanStack Query ya integrado para datos del servidor.
- Tests: Vitest (backend) con reloj inyectable (`now()`), Jest (app).

## Enfoques considerados (cierre de una votación vencida)

- **A. Cerrar al consultar — elegido.** Cada lectura del plan, cada voto y la carga de Inicio comprueban si la votación
  venció y, si es así, la cierran y aplican el resultado en una transacción con el plan bloqueado. No requiere nada
  nuevo y se prueba con el reloj. Contra: si nadie abre la app el estado no cambia, pero nadie lo ve desactualizado.
- B. Temporizador dentro del servidor + A de respaldo — descartado: dormido no corre, así que A hace falta igual.
- C. Cron externo (Render / GitHub Actions) — descartado: un servicio y un secreto más, cuesta y despierta el servidor.

## Diseño (decidido con el usuario)

### Reportar y criticidad

- Se mantiene `POST /proposals/:id/incidences` con `FALTA | TARDANZA | IMPREVISTO`.
- `TARDANZA` → informa, como hoy (no abre votación).
- `FALTA` o `IMPREVISTO` → se evalúa con las reglas de Nakusuo, **en este orden**, y la primera que se cumple da la
  razón:
  1. quien falta **propuso el plan** (`createdBy`) → «propuso este plan»;
  2. es **imprescindible** (`isEssential`) → «el grupo lo marcó como imprescindible»;
  3. es **organizador del grupo** (`OWNER`) → «es organizador del grupo».
  Si ninguna se cumple: no crítica, solo informa; el plan sigue confirmado.
- Una ausencia crítica abre la votación exprés; **el plan sigue `CONFIRMADO` mientras se vota** (desaparece la regla
  actual «FALTA de un imprescindible → `EN_RECOORDINACION` al momento»).

### Votación

- Opciones `CANCELAR | REAGENDAR | MANTENER`.
- Votan **todos los miembros del grupo menos quien avisó**. Un voto por persona; se puede cambiar mientras esté abierta.
- Plazo: **60 minutos** desde que se abre, sin pasar del inicio del plan (`scheduledAt`), y **al menos 5 minutos**.
- Cierre: en cuanto votaron todos los que pueden votar, o al vencer el plazo (aplicado al consultar, enfoque A).
- Quórum: **2 votos**, o todos los que pueden votar si son menos. Sin quórum → **`MANTENER`** por defecto
  (`resultByDefault: true`).
- Empate: gana la opción más prudente, en orden `MANTENER` > `REAGENDAR` > `CANCELAR`.
- Como mucho **una votación abierta por plan**, garantizado por la base (índice único parcial).

### Resultado aplicado al plan (solo si sigue `CONFIRMADO`)

- `CANCELAR` → `CANCELADO`.
- `MANTENER` → no cambia nada.
- `REAGENDAR` → `EN_RECOORDINACION`: `chosenWindowId`, `scheduledAt`, `scheduledDate` a `null` y se borran los votos de
  fecha. Quien gestiona el plan propone de 2 a 5 franjas nuevas y un plazo (el `ReplanSheet` / `POST /replan` de la
  fase 1, ampliado para aceptar `EN_RECOORDINACION`) y el plan vuelve a `PROPUESTO`.
- Si el plan ya no está `CONFIRMADO` al cerrar (p. ej. alguien lo canceló), la votación se cierra pero no toca el plan.

### IA

- Al abrirse la votación se pide a la IA, **en segundo plano** (sin esperar en la respuesta del reporte), una opción y
  una razón corta, con: título, lugar, inicio y horas que faltan, motivo, razón de criticidad, votantes posibles y el
  resultado por defecto. Se guarda en la votación. Si falla o responde algo inválido, no hay sugerencia y nada más.
- Pasa por el registro de llamadas de IA existente (`ai_calls`, nueva tarea) y funciona con el cliente simulado.

## Mis decisiones (no las tomó el usuario; revisables)

- **Cerrar al consultar:** puntos de comprobación = `GET /proposals/:id`, listas de propuestas del grupo,
  `GET /me/dashboard`, `GET /me/upcoming-plans`, votar y reportar.
- **Reemplazo del flujo actual:** se retira `POST /proposals/:id/incidences/resolve` (quien gestiona ya no decide solo).
  Quien gestiona sigue pudiendo **cancelar** el plan cuando quiera (`POST /cancel`); una votación abierta de un plan
  cancelado se cierra sin aplicar nada.
- **Solo se reporta sobre `CONFIRMADO`:** en `EN_RECOORDINACION` no hay fecha a la que faltar.
- **Segunda ausencia crítica con una votación ya abierta:** la incidencia se guarda e informa, pero no abre otra
  votación (Nakusuo la rechazaba; aquí sería perder el aviso).
- **Al cerrar, todas las incidencias del plan quedan `resolved: true`** (como el «resolver» de hoy).
- **Votantes:** se fijan al abrir (miembros menos quien avisa); quien sale del grupo después deja de poder votar y su voto
  deja de contar, como con los votos de fecha.
- **`criticality` existente:** una ausencia crítica queda `ALTA`; el resto se calcula como hoy. Se añade
  `criticalReason`.
- **Contrato (borrador):** `Proposal.expressVote: ExpressVote | null` (la abierta o la última cerrada) con
  `{ id, status: 'ABIERTA' | 'CERRADA', reportedBy, reason, criticalReason, expiresAt, counts por opción, myVote,
  canVote, eligibleVoters, quorum, result, resultByDefault, recommendation: { option, reason } | null }`;
  `PUT /proposals/:id/express-vote` `{ option }` → `200 Proposal`; errores `409 VOTING_CLOSED` si no está abierta,
  `403` si no puede votar (quien avisó o no es votante).
- **Inicio:** `expressAlert.kind` gana `'VOTACION'` (votación abierta); `'RECOORDINACION'` pasa a significar «el grupo
  decidió reagendar», con la acción «Proponer franjas» para quien gestiona; `'AVISO'` sigue para incidencias no críticas
  sin resolver.
- **Configuración:** `EXPRESS_VOTE_MINUTES` (por defecto 60) en el esquema de entorno; resultado por defecto fijo
  `MANTENER`.
- **Datos existentes en Neon:** planes ya en `EN_RECOORDINACION` (por la regla vieja) se quedan así y quien gestiona los
  saca con el replanteo; incidencias sin resolver de planes confirmados quedan como avisos.

## Detalles resueltos tras la revisión del constructor (decisiones mías, siguiendo a Nakusuo donde lo hace)

- **Recoordinación nunca atasca:** en `EN_RECOORDINACION` quien gestiona (`canManage`, con su sustitución de siempre)
  puede **replantear** (`POST /replan`, mismas reglas que en `PROPUESTO`: 2–5 franjas, plazo antes de la primera, sin
  votos) o **cancelar**. La acción «Proponer franjas» de Inicio y del plan es para `canManage`. Ahí no se reporta
  (`409 INVALID_STATE`). Inicio y `/me/upcoming-plans` lo muestran como hoy, con la alerta `RECOORDINACION`.
- **Cerca del inicio (como Nakusuo):** el plazo es `min(ahora + 60 min, scheduledAt)` pero nunca menos de 5 minutos
  desde que se abre (gana el mínimo de 5). No se puede reportar cuando la franja confirmada ya **terminó**
  (`409 INVALID_STATE`). El resultado se aplica igual aunque el cierre llegue después del inicio.
- **Votantes:** la lista se fija al abrir (miembros menos quien avisó) y se guarda. Puede votar quien está en esa lista y
  sigue en el grupo; «votaron todos» y el quórum se calculan sobre esa lista **quitando a quien ya salió**. Si la lista
  queda vacía al abrir (quien avisa está solo), no se abre votación: solo se informa. En un grupo de 2 el único voto es
  el quórum (Nakusuo lo acepta: es todo el que puede opinar).
- **Criticidad:** la regla 1 usa `createdBy`; si quien creó se fue del grupo no puede reportar, así que no aplica.
  `criticalReason` (`string | null`) se guarda en la `Incidence` y se copia a la votación. Las incidencias ya guardadas
  conservan su `criticality`. Una `FALTA` no crítica queda `MEDIA` (como hoy).
- **Contrato:** `counts = { CANCELAR, REAGENDAR, MANTENER }` (números, visibles para todos mientras está abierta);
  `myVote` es `null` si no voté o no puedo votar; `result` y `resultByDefault` son `null` mientras está abierta;
  `recommendation` `null` hasta que llegue (o si la IA falló).
- **Historial:** una tabla de votaciones uno-a-muchos por plan (como mucho una `ABIERTA`). `Proposal.expressVote` es la
  más reciente. Al **replantear desde `EN_RECOORDINACION`** se borran las incidencias y las votaciones cerradas de la
  fecha anterior (como `limpiarLoDeLaFechaAnterior` de Nakusuo), para que el plan nuevo empiece limpio.
- **Cierre perezoso acotado:** solo toca planes con una votación `ABIERTA` y vencida; si cerrar falla se registra en el
  log y la lectura responde igual (lo reintenta la siguiente consulta).
- **IA:** la llamada se anota en `ai_calls` con el `userId` de quien avisó y una tarea nueva `express-recommendation`
  (las estadísticas de administración la listan como las demás). Una sugerencia que llega cuando la votación ya cerró
  se descarta.

## Lo que queda al constructor

- Esquema exacto de las tablas (p. ej. `express_votes` y `express_vote_ballots`), nombres de columnas e índices.
- Cómo se integra el cierre perezoso en el repositorio (función reutilizable con bloqueo `FOR UPDATE`).
- Prompt de la recomendación y su validación con zod.
- Diseño visual de la tarjeta de votación en la app (opciones, recuento, tiempo restante, sugerencia de la IA,
  resultado), siguiendo los componentes existentes (`ExpressVoteCard`, `ReportIncidenceSheet`).
- Actualizar `docs/api.md`, `shared/index.d.ts`, README.
