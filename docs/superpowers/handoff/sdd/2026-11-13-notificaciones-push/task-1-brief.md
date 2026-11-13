### Task 1: Dispositivos (migración 12 + `/me/push-devices`)

**Files:**
- Modify: `backend/src/db/migrations.ts` (migración 12), `backend/src/app.ts` (montar el router), `shared/index.d.ts`
  (`PushDeviceInput`, `NotificationKind`, `NotificationData`), `docs/api.md` (§Notificaciones: rutas de dispositivos)
- Create: `backend/src/notifications/devices.repository.ts`, `backend/src/notifications/push-devices.routes.ts`,
  `backend/src/notifications/notifications.schemas.ts`
- Test: `backend/test/migrations.test.ts`, nuevo `backend/test/push-devices.test.ts`

**Interfaces:**
- Produces:
  - Migración 12 = el SQL de la spec §Datos (incluida la columna `claimed_at TEXT COLLATE "C"`), una sola cadena del
    array, con comentario «12 — Notificaciones push: celulares registrados y bandeja de salida de avisos.».
  - `shared`: `type NotificationKind = 'NEW_PROPOSAL' | 'PLAN_CONFIRMED' | 'PLAN_CANCELLED' | 'EXPRESS_OPENED' |
    'EXPRESS_RESULT' | 'REMINDER'`; `type NotificationData = { kind: NotificationKind; proposalId: string; groupId:
    string; screen: 'VOTING' | 'PLAN' }`; `type PushDeviceInput = { token: string }`.
  - `devicesRepository(db)`:
    - `upsert(userId: string, token: string, now: Date): Promise<void>` — `INSERT … ON CONFLICT (token) DO UPDATE SET
      user_id = EXCLUDED.user_id, last_seen_at = EXCLUDED.last_seen_at`;
    - `remove(userId: string, token: string): Promise<void>` — solo si es mío;
    - `removeToken(token: string): Promise<void>` — para `DeviceNotRegistered` (Task 3);
    - `tokensOf(userIds: readonly string[]): Promise<Map<string, string[]>>` — `ANY($1::text[])`.
  - `pushDeviceInputSchema = z.object({ token: z.string().trim().regex(/^Expo(nent)?PushToken\[.+\]$/, 'Token de
    notificaciones inválido') })`.
  - Rutas (montadas en `/api/me/push-devices`, detrás de `auth`, ANTES de `api.use('/me', auth, meRouter(deps))`):
    `PUT /` → `204`; `DELETE /:token` → `204` siempre.

- [ ] **Step 1: Write the failing tests:** migración 12 desde la versión 11 (tablas, CHECK de `kind` rechaza
  `'OTRO'`, `dedupe_key` única, borrar un usuario borra sus dispositivos y avisos); `PUT` registra (`204`) y repetirlo
  actualiza `last_seen_at`; el mismo token desde otra cuenta pasa a ella; `ExponentPushToken[abc]` y `ExpoPushToken[abc]`
  valen, `"abc"` → `400 VALIDATION_ERROR`; sin JWT → `401`; `DELETE` del mío → borrado, de uno ajeno → `204` sin
  borrarlo, inexistente → `204`.
- [ ] **Step 2: Run** `cd C:/Users/User/Desktop/HueckoApp-Android/backend && npx vitest run test/migrations.test.ts
  test/push-devices.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** lo de **Interfaces** y `docs/api.md` (§Notificaciones con las dos rutas y el formato del
  token).
- [ ] **Step 4: Run** `npm run typecheck` y `npx vitest run`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(backend): registrar los celulares para notificaciones push`

