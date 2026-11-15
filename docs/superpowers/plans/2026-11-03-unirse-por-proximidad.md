# Unirse a un grupo acercando el celular — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** que una persona se una a un grupo juntando su celular Android con el de un miembro, que ve su nombre y confirma.

**Architecture:** los dos celulares envían un aviso al detectar proximidad (módulo nativo Kotlin) con el celular quieto
(giroscopio de `expo-sensors`). El backend empareja los avisos por la hora del servidor dentro de una transacción con
candado y guarda los intentos en la tabla `proximity_requests`. La app consulta el estado cada 1,5 s con TanStack
Query hasta un estado final.

**Tech Stack:** Express 5 + zod + Postgres (`Db`, PGlite en tests) + Vitest/Supertest; Expo SDK 57 + RN 0.86 +
TypeScript + TanStack Query + Expo Modules (Kotlin) + `expo-sensors` + Jest.

**Spec:** [docs/superpowers/specs/2026-11-03-unirse-por-proximidad-design.md](../specs/2026-11-03-unirse-por-proximidad-design.md)

## Global Constraints

- Rama `feature/unirse-por-proximidad`, creada desde `feature/mobile-tanstack-query` (PR #43). Si #43 ya está en
  `develop`, desde `develop`. Commits convencionales en español (`feat(backend): …`, `feat(mobile): …`).
- Tiempos (constantes en `backend/src/proximity/proximity-rules.ts`): `MATCH_WINDOW_MS = 3000`,
  `WAITING_TTL_MS = 5000`, `CONFIRM_TTL_MS = 30000`, `ACCEPT_DELAY_MS = 3000`.
- El servidor usa **su** reloj (`deps.now()`), nunca una hora enviada por el celular.
- Fechas en la base como `TEXT COLLATE "C"` ISO (patrón de `migrations.ts`), ids con `randomUUID()`.
- Errores con `ApiError(status, code, message)`. Mensajes en español: `PROXIMITY_NOT_FOUND` «Intento no encontrado.»,
  `PROXIMITY_NOT_PENDING` «Esta solicitud ya no se puede responder.».
- Solo Android. En Expo Go o iOS `isAvailable()` devuelve `false` y la pantalla ofrece «Usar el código».
- Paquetes de la app con `npx expo install` dentro de `mobile/`. No se editan `android/` ni `ios/` a mano.
- Antes de cada commit: `npm run typecheck` y los tests del workspace tocado. Los tests de mobile, con `--maxWorkers=2`
  (la máquina tiene 7,6 GB).
- `docs/api.md` y `shared/index.d.ts` cambian en el mismo commit que los endpoints.

## Review Focus

1. **Render dormido al abrir la pantalla:** si el primer aviso despierta al servidor, el segundo llega con más de 3 s
   de diferencia y nunca se emparejan. Las dos pantallas llaman a `GET /api/health` al montarse, para despertarlo
   antes de juntar los celulares. Test en la Task 6.
2. **El sensor ya está «cerca» al abrir la pantalla** (mano encima, bolsillo): no se envía nada hasta ver una
   transición lejos→cerca. Test en la Task 5.
3. **Parpadeo del sensor** (cerca/lejos/cerca en medio segundo): se envía un solo aviso por intento. Test en la Task 5.
4. **Salir de la pantalla (o volver atrás) con un intento activo:** se llama a `DELETE /proximity/:id` y la otra
   persona ve «Cancelado». Tests en las Tasks 4 y 2.
5. **Falla de red al enviar el aviso:** se muestra el error con «Intentar de nuevo». No se queda en «Buscando…». Test en la Task 4.

---

### Task 1: Backend — tabla, reglas y emparejamiento

**Files:**
- Modify: `shared/index.d.ts` (tipos `ProximityRole`, `ProximityStatus`, `ProximityRequest` del spec, con
  `expiresAt: string | null` y `acceptableFrom: string | null`)
- Modify: `backend/src/db/migrations.ts` (migración 5: tabla `proximity_requests`)
- Create: `backend/src/proximity/proximity-rules.ts` (constantes + `effectiveStatus`)
- Create: `backend/src/proximity/proximity.repository.ts`
- Test: `backend/test/proximity.repository.test.ts`, `backend/test/migrations.test.ts` (si cuenta migraciones)

**Interfaces:**
- Produces:
  - `type ProximityRow = { id; user_id; role; group_id: string | null; status; peer_id: string | null; created_at: string; matched_at: string | null }`
  - `effectiveStatus(row: ProximityRow, now: Date): ProximityStatus`: devuelve `EXPIRED` si `WAITING` y
    `now ≥ created_at + WAITING_TTL_MS`, o si `MATCHED` y `now ≥ matched_at + CONFIRM_TTL_MS`. Si no, devuelve el
    estado guardado.
  - `proximityRepository(db: Db)` con:
    - `create(userId: string, role: ProximityRole, groupId: string | null, now: Date): Promise<ProximityRow>`: hace todo el emparejamiento.
    - `findOwn(id: string, userId: string): Promise<ProximityRow | undefined>`
    - `findPeer(row: ProximityRow): Promise<ProximityRow | undefined>`
    - `setPairStatus(row: ProximityRow, status: ProximityStatus): Promise<void>`: cambia las dos mitades.

Migración 5, columnas del spec. `role IN ('INVITE','JOIN')`; `status IN (los 7 estados)`;
`CHECK ((role = 'INVITE') = (group_id IS NOT NULL))`; `group_id` con `ON DELETE CASCADE`; `user_id` con `ON DELETE CASCADE`;
`peer_id` sin FK (evita el ciclo al insertar), y un índice `(status, created_at)`.

Algoritmo de `create`. Todo va dentro de `db.transaction` y empieza con
`SELECT pg_advisory_xact_lock($1)`, con `PROXIMITY_LOCK_ID = 72_616_003`.
1. Cancelar el intento activo del usuario: un `WAITING` o `MATCHED` todavía no vencido. Su pareja también pasa a `CANCELLED`.
2. Insertar el aviso nuevo como `WAITING`, con `created_at = now`.
3. **Mirar hacia adelante.** Buscar parejas `MATCHED` con `matched_at ≥ now − MATCH_WINDOW_MS` que tengan una mitad
   del rol opuesto al del aviso nuevo y de otro usuario. Si el aviso nuevo es `JOIN`, esa mitad es la `INVITE`, y
   además el usuario no debe ser ya miembro de su grupo. Si existe alguna, el aviso nuevo y las dos mitades pasan a
   `AMBIGUOUS` y `create` termina.
4. **Mirar hacia atrás.** Buscar candidatos `WAITING` del rol opuesto, de otro usuario, con
   `created_at ≥ now − MATCH_WINDOW_MS`. Si el aviso nuevo es `JOIN`, se descartan las invitaciones a grupos donde
   ya es miembro; si es `INVITE`, se descartan los `JOIN` de usuarios que ya son miembros de su grupo.
   - 0 candidatos: el aviso queda `WAITING`.
   - 1 candidato: los dos pasan a `MATCHED`, con `peer_id` cruzado y `matched_at = now`.
   - 2 o más: el aviso y todos los candidatos pasan a `AMBIGUOUS`.

- [ ] **Step 1: Write the failing tests** en `proximity.repository.test.ts`. Usa `makeTestDb()`, usuarios y grupo
  creados con el repositorio de grupos, y `now` fijo en `NOW` de `test/helpers.ts`.
  - `empareja una invitación y una unión a menos de 3 s`: invite en `NOW` y join en `NOW+2999ms`. Las dos quedan
    `MATCHED`, con `peer_id` cruzado y `matched_at` igual a `NOW+2999` en ISO.
  - `no empareja a 3,1 s`: join en `NOW+3100` → las dos `WAITING`.
  - `dos candidatos → todos AMBIGUOUS`: dos invitaciones de usuarios distintos y después un join.
  - `un aviso que llega ≤ 3 s después de una pareja la anula`: invite A, join B (+0,4 s), join C (+0,8 s). A, B y C
    quedan `AMBIGUOUS`. **El mismo caso con C a `matched_at + 3100 ms`**: A y B siguen `MATCHED` y C queda `WAITING`.
  - `no se empareja consigo mismo`: invite y join del mismo usuario. Queda `WAITING` solo el último, y el anterior
    `CANCELLED`.
  - `un aviso nuevo cancela el anterior y a su pareja`.
  - `ignora la unión de quien ya es miembro`: join de un miembro del grupo → la invitación sigue `WAITING`.
  - `effectiveStatus vence WAITING a los 5 s y MATCHED a los 30 s`: comprobar el borde exacto (`≥`).
- [ ] **Step 2: Run** `npm test -w backend -- proximity.repository`. Expected: FAIL (el módulo no existe).
- [ ] **Step 3: Implement** la migración, los tipos compartidos, `proximity-rules.ts` y `proximity.repository.ts`
  según el algoritmo de arriba.
- [ ] **Step 4: Run** `npm test -w backend` y `npm run typecheck`. Expected: PASS (incluye `migrations.test.ts`).
- [ ] **Step 5: Commit** `feat(backend): tabla y emparejamiento de los intentos por proximidad`

### Task 2: Backend — endpoints `/api/proximity` y contrato

**Files:**
- Create: `backend/src/proximity/proximity.routes.ts`, `backend/src/proximity/proximity.schemas.ts`
- Modify: `backend/src/app.ts` (`api.use('/proximity', auth, proximityRouter(deps))`)
- Modify: `docs/api.md` (sección «Proximidad», con estados, tiempos y la regla de los 3 s)
- Test: `backend/test/proximity.test.ts`

**Interfaces:**
- Consumes: `proximityRepository`, `effectiveStatus` y las constantes de la Task 1; `loadGroupForMember` y
  `groupsRepository.addMember`/`findById`; `isForeignKeyViolation`.
- Produces: los endpoints del spec, que responden `ProximityRequest`. Su DTO es `toDto(row, peer, now)`:
  - `status = effectiveStatus(row, now)`.
  - `group`: en `INVITE`, su propio grupo; en `JOIN`, el del peer, y solo a partir de `MATCHED`.
  - `peer: { id, name }` del usuario del peer, a partir de `MATCHED`.
  - `expiresAt`: `created_at + 5 s` en `WAITING`, `matched_at + 30 s` en `MATCHED` y `null` en los demás estados.
  - `acceptableFrom`: `matched_at + 3 s` en `MATCHED` y `null` en los demás estados.

Reglas de las rutas:
- `invite`: valida `{ groupId: string }` con zod y usa `loadGroupForMember`, que responde `404`/`403` como en `/groups/:id`.
- `join`: `{}`.
- `GET`: solo su dueño; si no, `404 PROXIMITY_NOT_FOUND`.
- `accept`/`reject`: dentro de la transacción con el mismo candado.
  - El intento debe ser del usuario, de rol `INVITE` y con estado efectivo `MATCHED`. Además,
    `now ≥ matched_at + ACCEPT_DELAY_MS`. Si no, `409 PROXIMITY_NOT_PENDING`.
  - `accept` llama a `addMember(groupId, joinUserId)`. Si devuelve `false` (ya era miembro), la pareja queda
    `ACCEPTED` igual.
  - Si falla la FK `group_members_group_id_fkey`, la pareja pasa a `EXPIRED` y se responde `404 GROUP_NOT_FOUND`.
- `DELETE`: solo el dueño. Un `WAITING` o `MATCHED` todavía no vencido pasa a `CANCELLED` en las dos mitades.
  Responde `204` siempre que el intento sea suyo.

- [ ] **Step 1: Write the failing tests** en `proximity.test.ts`. Usa `makeTestApp({ now: clock.now })` con
  `makeClock(NOW)`, `registerUser`, `createGroup` y `bearer`.
  - `flujo completo`: Luis invita y Ana se une a +1 s. `GET` de Ana → `MATCHED`, con `group.name` y `peer.name = 'Luis'`.
    A `+4 s`, Luis acepta → `200 ACCEPTED`. `GET /groups` de Ana incluye el grupo.
  - `aceptar antes de 3 s → 409 PROXIMITY_NOT_PENDING`.
  - `rechazar` → las dos mitades `REJECTED` y Ana no es miembro.
  - `quien se une no puede aceptar` → `409`.
  - `aceptar vencido (a +31 s de matched_at) → 409` y `GET` → `EXPIRED`.
  - `invitar a un grupo ajeno → 403 NOT_A_MEMBER`; `grupo inexistente → 404 GROUP_NOT_FOUND`.
  - `GET del intento de otro → 404 PROXIMITY_NOT_FOUND`.
  - `DELETE cancela a la pareja`: Ana borra el suyo y `GET` de Luis → `CANCELLED`.
  - `aceptar cuando Ana ya se unió con el código → 200 ACCEPTED`.
  - `sin token → 401`.
- [ ] **Step 2: Run** `npm test -w backend -- proximity.test`. Expected: FAIL (404 en las rutas).
- [ ] **Step 3: Implement** las rutas, los esquemas, el montaje en `app.ts` y la sección de `docs/api.md`.
- [ ] **Step 4: Run** `npm test -w backend` y `npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(backend): endpoints para unirse a un grupo por proximidad`

### Task 3: Módulo nativo de proximidad (Kotlin) y development build

**Files:**
- Create: `mobile/modules/proximity/` (con `npx create-expo-module@latest --local proximity`; se borran las carpetas
  `ios/` y web). Contiene `expo-module.config.json` (solo `android`), `android/src/main/java/…/ProximityModule.kt` e `index.ts`.
- Create: `mobile/src/hooks/useProximity.ts`
- Modify: `mobile/jest.setup.ts` (mock del módulo), `mobile/eas.json` (perfil `development`), `mobile/package.json`
  (`expo-dev-client` con `npx expo install expo-dev-client`)
- Test: `mobile/src/hooks/__tests__/useProximity.test.ts`

Antes de empezar, leer `https://docs.expo.dev/modules/get-started/` y `…/modules/module-api/` (Expo Modules en el SDK 57).

**Interfaces:**
- Produces:
  - `modules/proximity/index.ts`:
    - `isAvailable(): boolean`
    - `addProximityListener(cb: (e: { near: boolean }) => void): { remove(): void }`
  - El listener nativo se registra al primer suscriptor y se quita con el último (`OnStartObserving` /
    `OnStopObserving`). Sin módulo nativo (`requireOptionalNativeModule('Proximity')` devuelve `null`):
    `isAvailable()` es `false` y `addProximityListener` devuelve un `remove` que no hace nada.
  - Kotlin: `SensorManager.getDefaultSensor(Sensor.TYPE_PROXIMITY)`. Emite `onChange` con
    `near = values[0] < sensor.maximumRange`, y solo cuando cambia el valor.
  - `useProximity(enabled: boolean): { available: boolean; near: boolean }`: escucha solo con `enabled` y con la
    pantalla en foco (`useIsFocused`).
  - Mock de Jest: `jest.mock('./modules/proximity')` con `isAvailable` como `jest.fn(() => true)` y
    `__emit(near: boolean)`, que llama a los listeners activos.
  - `eas.json`: el perfil `development` es `{ "developmentClient": true, "distribution": "internal", "android": { "buildType": "apk" }, "env": { "EXPO_PUBLIC_API_URL": "https://hueckoapp-api.onrender.com/api" } }`.

- [ ] **Step 1: Write the failing tests**:
  - `useProximity refleja near al emitir`
  - `no escucha con enabled=false`
  - `deja de escuchar al desmontar`: comprobar que se llama a `remove`.
  - `available=false sin módulo nativo`
- [ ] **Step 2: Run** `npx jest --maxWorkers=2 useProximity` en `mobile/`. Expected: FAIL.
- [ ] **Step 3: Implement** el módulo, el hook, el mock, el perfil de EAS y `expo-dev-client`.
- [ ] **Step 4: Run** `npx jest --maxWorkers=2`, `npm run typecheck` y `npx expo-doctor` en `mobile/`. Expected: PASS
  (expo-doctor sin errores nuevos).
- [ ] **Step 5: Commit** `feat(mobile): módulo nativo del sensor de proximidad y perfil de development build`

### Task 4: Cliente de la API y sesión de proximidad (app)

**Files:**
- Create: `mobile/src/api/proximity.ts`, `mobile/src/hooks/useProximitySession.ts`
- Modify: `mobile/src/api/queryClient.ts` (`queryKeys.proximity(id)`)
- Test: `mobile/src/hooks/__tests__/useProximitySession.test.ts`, `mobile/src/api/__tests__/endpoints.test.ts`

**Interfaces:**
- Consumes: `api` (axios), `queryKeys`, `errorMessage`, y `ProximityRequest` de `@hueckoapp/shared`.
- Produces:
  - En `api/proximity.ts`:
    - `sendInvite(groupId)` y `sendJoin()`, que devuelven `Promise<ProximityRequest>`
    - `getProximity(id)` y `acceptProximity(id)` / `rejectProximity(id)`, que devuelven `Promise<ProximityRequest>`
    - `cancelProximity(id): Promise<void>`
    - `pingServer(): Promise<void>` (`GET /health`, sin lanzar)
  - `useProximitySession(target: { role: 'INVITE'; groupId: string } | { role: 'JOIN' })` devuelve
    `{ request: ProximityRequest | undefined; phase: 'idle' | 'sending' | 'active' | 'done'; error: string | null; send(): void; accept(): Promise<void>; reject(): Promise<void>; reset(): void }`:
    - `send` es una mutación. Si ya hay uno en curso, no hace nada.
    - Con un `id`, `useQuery(queryKeys.proximity(id))` usa `refetchInterval: 1500` mientras el estado sea `WAITING`
      o `MATCHED`, y `false` en los estados finales.
    - `done` es un estado final. `reset` vuelve a `idle` y olvida el `id`.
    - Al desmontar con estado `WAITING` o `MATCHED`, llama a `cancelProximity` sin esperar la respuesta.

- [ ] **Step 1: Write the failing tests**. Usa `withQueryClient()`, el mock de `../../api/proximity` y temporizadores falsos.
  - `send crea el intento y consulta cada 1,5 s hasta un estado final`: tres respuestas
    `WAITING → MATCHED → ACCEPTED`; después de `ACCEPTED`, avanzar 3 s no hace más llamadas.
  - `send dos veces seguidas crea un solo intento`
  - `un error al enviar deja phase=idle con el mensaje`: `ApiError(0,'NETWORK_ERROR',…)` → `error` es el mensaje.
  - `al desmontar en WAITING llama a cancelProximity(id)`. `en ACCEPTED no lo llama`.
  - `accept llama a acceptProximity y refleja ACCEPTED`
  - `endpoints.test.ts`: cada función usa el método y la ruta correctos, `POST /proximity/invite` con `{ groupId }`.
- [ ] **Step 2: Run** `npx jest --maxWorkers=2 useProximitySession endpoints`. Expected: FAIL.
- [ ] **Step 3: Implement** según las interfaces.
- [ ] **Step 4: Run** `npx jest --maxWorkers=2` y `npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(mobile): cliente y sesión de los intentos por proximidad`

### Task 5: Giroscopio y disparador (lejos→cerca con el celular quieto)

**Files:**
- Create: `mobile/src/hooks/useStillness.ts`, `mobile/src/hooks/useProximityTrigger.ts`
- Modify: `mobile/package.json` (`npx expo install expo-sensors`), `mobile/jest.setup.ts` (mock de `Gyroscope` con `__emit({x,y,z})`)
- Test: `mobile/src/hooks/__tests__/useStillness.test.ts`, `mobile/src/hooks/__tests__/useProximityTrigger.test.ts`

**Interfaces:**
- Consumes: `useProximity` (Task 3).
- Produces:
  - `useStillness(enabled: boolean): boolean`: `Gyroscope.setUpdateInterval(100)`. Devuelve `true` si
    `√(x²+y²+z²) < 0.6` rad/s en todas las lecturas de los últimos `400` ms (`STILL_THRESHOLD`, `STILL_WINDOW_MS`).
    Si el giroscopio no está disponible (`Gyroscope.isAvailableAsync()` es `false`), devuelve siempre `true`.
  - `useProximityTrigger(enabled: boolean, onTrigger: () => void): { available: boolean; near: boolean; still: boolean }`:
    llama a `onTrigger` **una vez** en cada transición lejos→cerca que ocurra con `still === true`. Si al habilitarse
    el sensor ya está cerca, espera a que pase a lejos.

- [ ] **Step 1: Write the failing tests**:
  - `useStillness`: `quieto tras 400 ms bajo 0,6`; `un pico de 1 rad/s lo vuelve false`;
    `sin giroscopio devuelve true`.
  - `useProximityTrigger`:
    - `lejos→cerca quieto dispara una vez`
    - `cerca→lejos→cerca en 300 ms dispara una sola vez por transición` (dos transiciones, dos disparos; ninguna sin `still`)
    - `si ya estaba cerca al habilitarse no dispara hasta lejos→cerca`
    - `en movimiento no dispara`
    - `con enabled=false no dispara`
- [ ] **Step 2: Run** `npx jest --maxWorkers=2 useStillness useProximityTrigger`. Expected: FAIL.
- [ ] **Step 3: Implement**.
- [ ] **Step 4: Run** `npx jest --maxWorkers=2` y `npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(mobile): giroscopio para confirmar que el celular está quieto`

### Task 6: Pantallas «Acercar para invitar» y «Unirse acercando»

**Files:**
- Create: `mobile/src/screens/groups/ProximityInviteScreen.tsx`, `mobile/src/screens/groups/ProximityJoinScreen.tsx`,
  `mobile/src/screens/groups/ProximityStatusView.tsx` (la vista común de estados)
- Modify: `mobile/src/navigation/RootNavigator.tsx` y su tipo de params (`ProximityInvite: { groupId: string; name: string }`,
  `ProximityJoin: undefined`), `mobile/src/screens/groups/GroupDetailScreen.tsx` (botón junto a `InviteCodeCard`) y
  `mobile/src/screens/groups/GroupListScreen.tsx` (botón junto a «Unirse con código»)
- Test: `mobile/src/screens/groups/__tests__/ProximityInviteScreen.test.tsx`, `…/ProximityJoinScreen.test.tsx` y los
  tests existentes de `GroupDetailScreen`/`GroupListScreen` (el botón navega)

**Interfaces:**
- Consumes: `useProximitySession` (Task 4), `useProximityTrigger` (Task 5), `pingServer`, `Vibration` de
  `react-native`, `queryKeys.groups` y `queryKeys.group(id)`, los componentes de `src/components`.
- Produces: pantallas. Textos fijos del spec:
  - Preparado: «Junta los celulares pantalla con pantalla».
  - Sin sensor: «Tu celular no tiene sensor de proximidad (o estás en Expo Go)».
  - Ambigüedad: «Hubo otro intento cerca. Repitan o usen el código».
  - Invitador en `MATCHED`: «**{peer}** quiere unirse a *{grupo}*». Antes de `acceptableFrom` se ve «Confirmando…»;
    después, Aceptar/Rechazar.
  - Quien se une en `MATCHED`: «Esperando a que **{peer}** te acepte en *{grupo}*».
  - Invitador en `ACCEPTED`: «{peer} ya es parte del grupo».
  - Siempre visible: «Usar el código». En la pantalla de invitar vuelve al detalle; en la de unirse abre el diálogo de código.

Comportamiento:
- `pingServer()` al montar.
- `Vibration.vibrate()` una vez, cuando la pareja `MATCHED` ya se puede aceptar (`now ≥ acceptableFrom`).
  Así no vibra una pareja que después se anula por dudosa.
- `ACCEPTED`:
  - Quien se une: invalida `queryKeys.groups` y hace `navigation.replace('GroupDetail', { groupId, name })`.
  - Invitador: invalida `queryKeys.group(groupId)` y hace `goBack()` a los 2 s.
- `REJECTED`, `EXPIRED`, `AMBIGUOUS` y `CANCELLED`: mensaje y «Intentar de nuevo» (`reset`).

- [ ] **Step 1: Write the failing tests**. Mockean `useProximitySession` y `useProximityTrigger` y comprueban cada
  estado con sus textos y botones.
  - `al montar llama a pingServer`
  - `sin sensor muestra el aviso y «Usar el código»`
  - `MATCHED antes de acceptableFrom muestra «Confirmando…», después Aceptar/Rechazar`
  - `vibra una vez al llegar acceptableFrom, y no antes`
  - `unirse: ACCEPTED navega al detalle del grupo`
  - `AMBIGUOUS muestra el texto y «Intentar de nuevo» llama a reset`
  - `el disparador llama a send`
- [ ] **Step 2: Run** `npx jest --maxWorkers=2 Proximity GroupDetailScreen GroupListScreen`. Expected: FAIL.
- [ ] **Step 3: Implement**.
- [ ] **Step 4: Run** `npx jest --maxWorkers=2` y `npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(mobile): pantallas para invitar y unirse acercando el celular`

### Task 7: Documentación, verificación y prueba con dos celulares

**Files:**
- Modify: `README.md` (requisitos de proximidad y giroscopio a ✅, y cómo generar e instalar el development build) y
  `docs/despliegue.md` (perfil `development`)

- [ ] **Step 1:** Actualizar la documentación.
- [ ] **Step 2: Run** `npm run typecheck` y `npm test` desde la raíz. Expected: todo PASS.
- [ ] **Step 3: Commit** `docs: unirse a un grupo acercando el celular`
- [ ] **Step 4:** Abrir el PR a `develop` (o a `feature/mobile-tanstack-query` si #43 no está integrado).
- [ ] **Step 5 (con el usuario):** el backend de esta rama tiene que estar accesible para los celulares: apuntar
  Render a esta rama mientras se prueba, o usar el backend local en la misma red Wi-Fi. `eas build --profile development --platform android`,
  instalarlo en los dos celulares y probar:
  - pareja correcta y aceptar
  - rechazar
  - dejar vencer
  - tres celulares a la vez (ambigüedad)
  - Render dormido

  Ajustar `STILL_THRESHOLD`/`STILL_WINDOW_MS` si hace falta.
