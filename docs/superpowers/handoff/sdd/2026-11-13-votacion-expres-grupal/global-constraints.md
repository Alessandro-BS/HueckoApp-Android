## Global Constraints

- Rama `feature/votacion-expres-grupal` (sale de `feature/franjas-con-fecha`). Commits convencionales en español con
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Sin push.
- Opciones exactas: `CANCELAR | REAGENDAR | MANTENER`. Estados de votación: `ABIERTA | CERRADA`.
- Criticidad (solo `FALTA` o `IMPREVISTO`), en este orden, primera que se cumple:
  «propuso este plan» (`createdBy`) → «el grupo lo marcó como imprescindible» (`isEssential`) →
  «es organizador del grupo» (`role === 'OWNER'`). Ninguna → no crítica. `TARDANZA` nunca es crítica.
- Ausencia crítica → `criticality: 'ALTA'`; las demás, `criticalityFor` como hoy.
- Plazo: `min(abierta + EXPRESS_VOTE_MINUTES, scheduledAt)`, nunca menos de `abierta + 5 min`.
  `EXPRESS_VOTE_MINUTES` entero positivo, por defecto **60**.
- Votan los miembros al abrir menos quien avisó; cuentan solo los que **siguen** en el grupo. Lista vacía al abrir →
  no se abre votación.
- Quórum = `min(2, votantes que siguen)`. Sin quórum → `MANTENER` con `resultByDefault: true`.
  Empate → `MANTENER` > `REAGENDAR` > `CANCELAR`.
- Cierra cuando votaron todos los votantes que siguen, o al vencer. Una sola `ABIERTA` por plan (índice único parcial).
- Resultado solo si el plan sigue `CONFIRMADO`: `CANCELAR` → `CANCELADO`; `MANTENER` → nada; `REAGENDAR` →
  `EN_RECOORDINACION` con `chosen_window_id`, `scheduled_at`, `scheduled_date` a `NULL` y votos de fecha borrados.
  Siempre: incidencias del plan `resolved = TRUE`.
- Reportar solo con el plan `CONFIRMADO` y la franja confirmada sin terminar; si no, `409 INVALID_STATE`
  «Solo se pueden reportar imprevistos de un plan confirmado.».
- Se retira `POST /proposals/:id/incidences/resolve` y `ResolveIncidencesInput`.
- `shared/index.d.ts` y `docs/api.md` cambian en el mismo commit que el endpoint. Migración nueva al final de
  `backend/src/db/migrations.ts` (la 8); nunca se edita una publicada.
- Fechas e instantes con `backend/src/common/zone.ts` / `mobile/src/utils/zone.ts`; nunca la zona del proceso ni del
  teléfono.
- Antes de cada commit: `npm run typecheck` (raíz) y los tests del workspace tocado (mobile: `npx jest --maxWorkers=2`).
- Bash: `export PATH="$HOME/.local/share/fnm:$PATH"; eval "$(fnm env --shell zsh)"`.

## Review Focus

1. **Dos lecturas a la vez cierran la misma votación vencida:** el resultado se aplica una sola vez. Test en Task 3
   (`interleave` antes del UPDATE de cierre).
2. **Aviso a pocos minutos del inicio:** con `scheduledAt` en 2 min, `expiresAt = abierta + 5 min`. Test en Task 1.
3. **Votante que se va del grupo con la votación abierta:** no puede votar (`403`), deja de contar para «votaron
   todos» y para el quórum. Test en Task 3.
4. **Quien gestiona cancela con la votación abierta:** al cerrarse después no resucita el plan (sigue `CANCELADO`).
   Test en Task 3.
5. **La IA falla o responde tarde:** reportar responde `201` igual; una sugerencia que llega con la votación ya
   cerrada se descarta. Test en Task 5.

---
