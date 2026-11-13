### Task 4: Barrido, recordatorios y despertador

**Files:**
- Create: `backend/src/notifications/reminders.ts`, `backend/src/notifications/tick.ts`,
  `backend/src/notifications/internal.routes.ts`, `.github/workflows/despertador.yml`
- Modify: `backend/src/proposals/express-votes.repository.ts` (`closeDueInScope` acepta `{ all: true }`),
  `backend/src/config/env-schema.ts` (`CRON_SECRET`, `EXPO_ACCESS_TOKEN`), `backend/src/app.ts` (`cronSecret?`, montar
  `/internal` sin `auth`), `backend/src/index.ts` (cliente Expo, `setInterval` del barrido, parar al apagar),
  `backend/.env.example`, `render.yaml`, `docs/api.md` (§Internal), `docs/despliegue.md` (Render: `CRON_SECRET`;
  GitHub: secreto `CRON_SECRET` y variable `API_URL`)
- Test: nuevo `backend/test/notifications-tick.test.ts`, `backend/test/env-schema.test.ts`

**Interfaces:**
- Consumes: Tasks 2–3 (`enqueue`, `reminderMessage`, `flushNotifications`), `closeDueProposals(db, { all: true }, now)`.
- Produces:
  - `enqueueDueReminders(db, now): Promise<number>` — planes `CONFIRMADO` con `scheduled_at > now` y `<= now + 60 min`;
    por miembro actual sin incidencia `FALTA`/`IMPREVISTO` en el plan: `REMINDER` con `dedupeKey`
    `reminder:{proposalId}:{userId}:{scheduledAt}`.
  - `tick(db, push, now): Promise<{ closed: number; reminders: number; sent: number }>` — cierra propuestas y exprés
    vencidas de todos los grupos, encola recordatorios, envía; nunca lanza.
  - `POST /api/internal/tick`: montada solo si `cronSecret`; compara `Authorization: Bearer …` con
    `crypto.timingSafeEqual` (longitudes distintas → `401`); `401 UNAUTHORIZED` «No autorizado.»; `200 { closed,
    reminders, sent }`. Usa el `push` de las deps (o el noop si no hay).
  - `env-schema`: `CRON_SECRET: z.string().trim().min(32, 'CRON_SECRET debe tener al menos 32 caracteres').optional()`
    (cadena vacía = sin configurar), `EXPO_ACCESS_TOKEN: z.string().trim().optional()`.
  - `index.ts`: `const push = createExpoPushClient({ accessToken: env.EXPO_ACCESS_TOKEN })`; se pasa a `createApp`;
    `const timer = setInterval(() => void tick(db, push, new Date()), 60_000); timer.unref()`; `clearInterval` en
    `shutdown`.
  - Workflow: `on: schedule: [{ cron: '*/10 * * * *' }]` + `workflow_dispatch`; un job que, si `vars.API_URL` y
    `secrets.CRON_SECRET` existen, hace `curl -fsS -X POST "$API_URL/api/internal/tick" -H "Authorization: Bearer
    $CRON_SECRET"` (los dos vía `env:`), y si falta alguno imprime un aviso y termina en éxito.

- [ ] **Step 1: Write the failing tests:**
  - recordatorio: plan confirmado que empieza en 30 min → `REMINDER` a cada miembro; dos `tick` seguidos → una sola fila
    por persona; quien reportó `FALTA` no recibe (con `TARDANZA` sí); plan que empieza en 61 min → nada; ya empezado →
    nada; replanteado y reconfirmado para otra hora → otro recordatorio;
  - `tick` de punta a punta con `fakePush`: propuesta vencida con votos → se cierra y el cliente recibe
    `PLAN_CONFIRMED`; votación exprés vencida → `EXPRESS_RESULT`;
  - `/internal/tick`: sin `cronSecret` → `404`; con secreto y cabecera incorrecta o ausente → `401`; correcta → `200`
    con los conteos;
  - `env-schema`: `CRON_SECRET` corto → error; vacío → sin configurar.
- [ ] **Step 2: Run** `npx vitest run test/notifications-tick.test.ts test/env-schema.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** lo de **Interfaces**, `.env.example`/`render.yaml` (sin valores), `docs/api.md` y
  `docs/despliegue.md`.
- [ ] **Step 4: Run** `npm run typecheck` y `npx vitest run`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(backend): barrido cada minuto con recordatorios y despertador de GitHub Actions`

