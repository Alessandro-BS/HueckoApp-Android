# Horario y votación (fase 4 de paridad con Nakusuo)

Fecha: 2026-11-13 · Rama: `feature/horario-y-votacion` (sale de `feature/organizadores`, PR #47, mientras #43–#47 no
estén integrados).

## Intención

Los dos equipos presentan el mismo producto. En la versión de Nakusuo la votación de franjas **se cierra sola** al vencer
el plazo, se pueden **votar varias franjas** y los bloques del horario **se editan** y **no se solapan**. En la nuestra
quien gestiona el plan confirma a mano, cada persona vota una sola franja y un bloque solo se crea o se borra. El usuario
eligió hacerlo como Nakusuo (hoja de ruta del 2026-11-13: fase 4 de 11; todo antes del APK final).

## Objetivos

- Una propuesta en votación se cierra sola al vencer `votingDeadline`: confirma la franja ganadora o se cancela si nadie
  votó.
- Quien crea una propuesta elige si se pueden votar varias franjas (por defecto, sí).
- Un bloque del horario se puede editar.
- Ningún bloque nuevo o editado se solapa con otro del mismo usuario.

## No objetivos

- Avisar del cierre (notificación o correo): fase 8 (recordatorios). Si entonces hace falta, se añade un barrido periódico.
- Bloques puntuales de varios días (`fechaFin` de Nakusuo) y bandeja de borradores del OCR.
- Corregir los solapes que ya existen en los horarios guardados.
- Tiempo real: el cierre se ve al consultar (fase 11).

## Anti-objetivos (sería un fracaso aunque funcione)

- Una propuesta con el plazo vencido que sigue aceptando votos o que dos lecturas a la vez cierran dos veces.
- Un resultado del cierre que depende de cuándo alguien mira (más tarde, con otra gente en el grupo, con otro reloj).
- Un plan confirmado que ningún miembro votó.
- Dos bloques solapados guardados a la vez por dos peticiones simultáneas.

## Restricciones

- Migración nueva al final de `backend/src/db/migrations.ts` (la 11); nunca se edita una publicada.
- `shared/index.d.ts` y `docs/api.md` cambian en el mismo commit que el endpoint.
- Errores con `ApiError` y la forma `{ error: { code, message, details } }`; validación con zod; SQL parametrizado.
- El backend y el APK nuevo se despliegan juntos (ya lo exigen las fases 2 y 3); por eso el contrato puede cambiar
  `myVoteWindowId` por `myVoteWindowIds`.

## Enfoques considerados (cierre automático)

- **A. Cierre al consultar** (elegido): como la votación exprés de la fase 2, antes de responder se cierran con la
  propuesta bloqueada las que ya vencieron. Funciona aunque Render tenga el servidor dormido y no añade piezas. El
  resultado no depende de cuándo se mire porque tras el plazo no se puede votar.
- B. Barrido cada minuto en el servidor (Nakusuo): en Render gratis no corre mientras duerme, así que igual haría falta A.
- C. A + B: solo útil si algo debe pasar al cerrar aunque nadie mire; eso llega en la fase 8.

## Diseño (decidido con el usuario)

### Reglas

1. **Cierre automático.** Una propuesta `PROPUESTO` con `votingDeadline` vencido se cierra:
   - gana la franja más votada; si empatan, la de mayor `availabilityPercentage`; si siguen, la de fecha y hora más
     tempranas (la misma regla y la misma función que «confirmar» sin `windowId`);
   - solo cuentan los votos de quienes siguen en el grupo; si no queda ninguno → `CANCELADO`;
   - se confirma aunque la franja ganadora ya haya empezado cuando alguien consulta (al vencer el plazo era válida: el
     plazo siempre es anterior a la primera franja);
   - `auto_closed = true`; `scheduledAt` y `scheduledDate` como al confirmar a mano.
   Confirmar a mano antes del plazo no cambia. Quien gestiona puede **replantear** una propuesta que se canceló sola
   por falta de votos (`CANCELADO` con `auto_closed`): vuelve a `PROPUESTO` con franjas y plazo nuevos y
   `auto_closed = false` (así sigue existiendo «replantear una votación vencida», que hoy se puede). Una cancelada a mano
   no se replantea.
   Votar y quitar el voto vuelven a comprobar estado y plazo con la propuesta bloqueada (`FOR UPDATE`): un voto nunca
   entra después de que el cierre hizo el recuento.
2. **Voto múltiple.** Al crear, `multipleVotes` (por defecto `true`):
   - activado: votar una franja la suma a mis votos; votar otra vez la misma no cambia nada; se quita una con
     `DELETE ?windowId=`;
   - desactivado: como hoy, votar otra franja mueve el voto.
   Las propuestas existentes quedan con voto único. Replantear conserva la opción.
3. **Editar un bloque.** `PUT` con todos los campos y las mismas reglas que al crear; solo bloques propios.
4. **Sin solapes.** Crear, editar o importar un bloque que se cruza con otro del mismo usuario se rechaza:
   - las horas se cruzan de forma estricta (8–10 y 10–12 no se solapan);
   - recurrente con recurrente: mismo `dayOfWeek`; puntual con puntual: misma `date`; puntual con recurrente: el día de
     la semana de la `date` (en `America/Lima`) es el `dayOfWeek` del recurrente;
   - todos los tipos cuentan (también `LIBRE`);
   - al editar no se compara el bloque consigo mismo;
   - en `bulk` se comprueban también los bloques del lote entre sí;
   - mensaje: «Se solapa con «{label}» ({día o fecha} {inicio}–{fin}).», p. ej. «Se solapa con «Cálculo II» (lunes
     08:00–11:00).» o «… (16/11/2026 09:00–10:00).».
   Los solapes que ya existen se quedan.

### Datos

Migración 11, en una transacción:

- `ALTER TABLE proposals ADD COLUMN multiple_votes BOOLEAN NOT NULL DEFAULT false`;
- `ALTER TABLE proposals ADD COLUMN auto_closed BOOLEAN NOT NULL DEFAULT false`;
- `ALTER TABLE votes DROP CONSTRAINT votes_pkey` y `ADD PRIMARY KEY (proposal_id, user_id, window_id)`.

Antes de desplegar, comprobar en Neon el nombre de la clave:
`SELECT conname FROM pg_constraint WHERE conrelid = 'votes'::regclass AND contype = 'p';` (debe dar `votes_pkey`).

### API y contrato

- `ProposalInput.multipleVotes?: boolean` (por defecto `true`); `Proposal.multipleVotes: boolean`,
  `Proposal.autoClosed: boolean`; `Proposal.myVoteWindowIds: string[]` reemplaza a `myVoteWindowId` (orden de las
  franjas).
- `PUT /proposals/:id/vote { windowId }`: único → mueve; múltiple → añade (idempotente). Errores como hoy.
- `DELETE /proposals/:id/vote`: sin parámetros quita todos mis votos; con `?windowId=` solo esa franja (si no la había
  votado, no pasa nada). `409 VOTING_CLOSED` como hoy.
- Cierre automático: `closeDueProposals(scope, now)` cierra cada propuesta vencida del alcance con la fila bloqueada
  (`FOR UPDATE`) y vuelve a comprobar estado y plazo dentro del bloqueo (se aplica una sola vez). Corre:
  - en las lecturas que ya cierran la votación exprés: `GET /groups/:id/proposals`, `GET /proposals/:id`,
    `GET /me/dashboard`, `GET /me/upcoming-plans`;
  - antes de votar, quitar el voto, añadir franja y confirmar (tras el plazo responden `409 VOTING_CLOSED` /
    `409 INVALID_STATE` con la propuesta ya cerrada);
  - en el admin: `GET /admin/groups/:id` cierra las de ese grupo; `GET /admin/stats`, `/admin/stats/timeseries`,
    `/admin/stats/popular-hours` y `/admin/reports` cierran todas las vencidas antes de calcular.
- `POST /proposals/:id/replan` admite también `CANCELADO` con `autoClosed` (y lo deja en `false`); el resto de
  `CANCELADO` → `409 INVALID_STATE` como hoy.
- `PUT /me/time-blocks/:id` (cuerpo `TimeBlockInput`): `200 TimeBlock` · `400 VALIDATION_ERROR` ·
  `404 TIME_BLOCK_NOT_FOUND` (no existe o no es mío) · `409 TIME_BLOCK_OVERLAP`.
- `409 TIME_BLOCK_OVERLAP` en `POST /me/time-blocks`, `PUT` y `POST /me/time-blocks/bulk`, con
  `details: { blockId }` (el bloque guardado con el que choca) o, en `bulk`, `details: { path: ["blocks", i],
  blockId | otherIndex }` (con un bloque guardado o con otro del lote). Mientras se guarda se bloquea la fila del
  usuario (`SELECT … FROM users WHERE id = $1 FOR UPDATE`).
- Efectos colaterales: confirmar, el resumen con IA y `voteCount` ya cuentan filas por franja; el prompt del resumen dice
  si cada persona podía votar varias. En el admin, «votos» de un usuario pasa a `COUNT(DISTINCT proposal_id)`.
- `docs/api.md`: §Mi horario, §Propuestas y votación (cierre automático, voto múltiple), tabla de errores
  (`TIME_BLOCK_OVERLAP`), §Admin.

### App

- **Horario:** tocar un bloque en «Mi horario» abre `AddScheduleScreen` rellena con título «Editar bloque» y guarda con
  `PUT`. Un `409 TIME_BLOCK_OVERLAP` se muestra con el mensaje del servidor en un aviso. En `OcrBlocksEditor` el bloque
  que choca queda marcado con el mensaje junto a sus campos, como los errores de validación.
- **Crear propuesta:** interruptor «Permitir votar varias franjas» (activado por defecto) con ayuda corta. Replantear no
  lo muestra.
- **Votar** (`VotingScreen`, `PlanDetailScreen`, Inicio): con voto múltiple, «Puedes votar todas las franjas que te
  sirvan» y cada franja se marca y desmarca sola; en Inicio «Votaste N franjas». Con voto único, como hoy.
  `myVoteWindowIds` sustituye a `myVoteWindowId` en `useProposal`, `useDashboard`, `VoteWindowRow` y los fixtures.
- **Cierre:** en el detalle, con `autoClosed`: «Confirmado al cerrar la votación» (`CONFIRMADO`) o «Cancelado: nadie votó
  antes del plazo» (`CANCELADO`), y en este último caso quien gestiona ve «Replantear». En votación: «La votación cierra el {fecha y hora}. Si nadie vota, el plan se
  cancela.».

## Mis decisiones (no las tomó el usuario; revisables)

- Desempate del cierre automático = el nuestro de «confirmar» (votos → % de disponibilidad → más temprana), no el de
  Nakusuo (votos → más temprana): un solo criterio en la app.
- Confirmar aunque la franja ganadora ya empezó al consultar (el cierre es lógico, a la hora del plazo).
- Solapes con las combinaciones de Nakusuo, también `LIBRE` y puntual contra recurrente.
- Replantear una propuesta cancelada sola por falta de votos (sin esto, el cierre automático quitaría el replanteo de
  una votación vencida, que hoy existe).
- `DELETE ?windowId=` en vez de un cuerpo (algunos clientes no envían cuerpo en `DELETE`).
- El admin cierra las vencidas antes de estadísticas e informes para no contar como «en votación» planes ya cerrados.

## Pruebas

- Backend (Vitest + Supertest, reloj inyectable, PGlite):
  - migración 11 desde una base en versión 10: votos intactos, `multiple_votes`/`auto_closed` en `false`, la clave nueva
    admite varias filas por persona;
  - cierre automático: gana la más votada; desempate por % y por fecha; sin votos → `CANCELADO`; votos de quien salió
    no cuentan; una sola vez con dos lecturas a la vez (`interleave`); votar y confirmar tras el plazo → `409`;
    confirmar a mano antes del plazo; admin y estadísticas ven el estado cerrado; `autoClosed` en la respuesta;
  - voto múltiple: añadir, repetir (sin cambios), quitar una, quitar todas; con voto único se mueve; replantear conserva
    `multipleVotes`; `voteCount` y «la más votada» con varios votos por persona;
  - bloques: editar el propio, ajeno `404`; solapes de cada combinación, borde, editar sin chocar consigo mismo; `bulk`
    contra guardado y dentro del lote; dos `POST` a la vez (`interleave`) → uno `409`.
- App (Jest + Testing Library): editar bloque y aviso de solape; marcado en el OCR; interruptor al crear; votar varias y
  quitar una; textos del cierre; fixtures con `myVoteWindowIds`.
