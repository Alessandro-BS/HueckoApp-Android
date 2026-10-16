# Especificación de la lógica de dominio (app Kotlin → backend Express + app React Native)

- **Fecha:** 2026-09-29
- **Fuente analizada:** `legacy-android/app/src/main/java/com/example/hueckoapp/` (en adelante `hk/`), tests en `legacy-android/app/src/test/`.
- **Contrato destino:** [`docs/api.md`](../../api.md) y [`shared/index.d.ts`](../../../shared/index.d.ts).
- **Objetivo:** describir con exactitud lo que hace hoy la app Kotlin para poder convertirlo en tests unitarios del backend y del cliente. Donde el comportamiento Kotlin es un error o choca con el contrato, se indica en §5 y §6 con una resolución propuesta. **Lo descrito en §1–§4 es el comportamiento actual, no el deseado**, salvo cuando se marca "Propuesta".

Convenciones de este documento:

- `hk/x/Y.kt:N` = fichero y línea.
- Los textos entre comillas `«…»` son literales exactos (incluidas tildes o su ausencia).
- Días: `1 = LUN … 7 = DOM` (`DayOfWeek.iso`, `hk/domain/model/Models.kt:84-91`). Etiquetas cortas: `Lun, Mar, Mié, Jue, Vie, Sáb, Dom`.

---

## 0. Modelo de dominio Kotlin (resumen de lo que importa)

| Tipo Kotlin (`Models.kt`) | Campos relevantes | Equivalente en `shared/index.d.ts` |
|---|---|---|
| `User` (l.19) | `id, name, email, isEssential=false` | `User` (sin `isEssential`; pasa a `GroupMember`) |
| `Group` (l.28) | `id, name, inviteCode, members: User[], description="", availabilityThreshold=80` | `Group` / `GroupSummary` |
| `TimeBlock` (l.39) | `id, userId, dayOfWeek: Int?` (null = puntual), `startTime, endTime` ("HH:mm"), `label, isRecurring=true, type=CLASE` | `TimeBlock` (+ `date`) |
| `TimeBlock.startHour` (l.52) | `startTime.substringBefore(':').toIntOrNull() ?: 0` → **trunca los minutos** | — |
| `TimeBlock.endHour` (l.59-65) | hora de `endTime`; **+1 si minutos > 0** (redondeo hacia arriba); partes no numéricas → 0 | — |
| `TimeBlock.timeRange` (l.49) | `"$startTime - $endTime"` | — |
| `BlockType` (l.105) | `CLASE, TRABAJO, LIBRE, PUNTUAL` | `BlockType` |
| `TimeWindowProposal` (l.108) | `id, day: DayOfWeek, startTime, endTime, availabilityPercentage, voterEmails: String[]` | `TimeWindow` (`voteCount` en vez de la lista) |
| `PlanIncidence` (l.124) | `id, userEmail, userName, type, reason, delayMinutes?, criticality=MEDIA, resolved=false` | `Incidence` (+ `user`, `createdAt`) |
| `ProposalState` (l.136) | `PROPUESTO, CONFIRMADO, CANCELADO, EN_RECOORDINACION` | `ProposalState` |
| `PlanProposal` (l.139) | `id, groupId, title, location: String?, createdBy (email), votingDeadline (texto libre), state, suggestedWindows, incidences` | `Proposal` |
| `AttendeeStatus` (l.152) | `PUNTUAL, RETRASADO, NO_ASISTE` | — (derivado en cliente) |
| `MatchWindow` (l.179) | `day, startHour, endHour, availabilityPercentage, freeMembers`; `timeRange = "%02d:00 - %02d:00"` | `MatchWindow` (`dayOfWeek, startTime, endTime`) |
| `Plan` (l.69) | **no se usa en ninguna parte** | — (descartar) |

`DayOfWeek.fromCalendarField(c)` (l.99-100): convierte `Calendar.DAY_OF_WEEK` (domingo = 1) a ISO: `c == 1 → 7`, si no `c - 1`; si no existe → `LUN`.

---

## 1. AvailabilityMatcher (`hk/domain/usecase/AvailabilityMatcher.kt`)

Función pura `windowsFor(group, blocks, day): MatchWindow[]`. Es la única lógica de cruce de agendas. El backend debe implementarla en `GET /groups/:id/availability` y en la creación de propuestas sin `windows`.

### 1.1 Algoritmo exacto

Parámetros: `group` (con `members` y `availabilityThreshold`), `blocks` (bloques de cualquiera), `day` (un día ISO 1–7).

1. **Grupo vacío:** si `group.members` está vacío → devolver `[]` (l.32). (Evita la división entre 0.)
2. **Filtrado de bloques** (l.34-35): se conservan solo los bloques que cumplen **ambas**:
   - `block.userId ∈ {ids de group.members}` (los bloques de no-miembros se ignoran);
   - `block.dayOfWeek == day.iso`. **Consecuencia:** los bloques puntuales (`dayOfWeek = null`) **nunca** cuentan; no se tiene en cuenta el `type` (un bloque `LIBRE` cuenta como ocupado, ver §6).
3. **Granularidad y rango:** se recorre cada hora entera `hour ∈ [8, 19]` (constante `AGENDA_HOURS = 8..19`, l.18). La hora `h` representa la franja `[h:00, h+1:00)`. Por tanto la agenda cubre de 08:00 a 20:00 y ninguna ventana puede empezar antes de 8 ni acabar después de 20.
4. **Ocupados en la hora** (l.40-43): un bloque ocupa la hora `h` si `h >= block.startHour && h < block.endHour`, con:
   - `startHour` = hora de `startTime` **truncando minutos** (`"10:30"` → 10; ocupa la hora 10 entera);
   - `endHour` = hora de `endTime`, **+1 si los minutos > 0** (`"10:30"` → 11; `"11:00"` → 11).
   - Resultado: cualquier bloque que toque parcialmente una hora la ocupa entera.
   - `ocupados` = **conjunto** de `userId` distintos (dos bloques solapados de la misma persona cuentan una vez).
   - Si `endHour <= startHour` (p. ej. fin anterior al inicio) el bloque no ocupa nada.
   - Formatos no numéricos → la parte inválida vale 0 (`"ab:cd"` → startHour 0).
5. **Libres y porcentaje** (l.45-46):
   - `libres = members.size − ocupados.size` (los miembros sin bloques cuentan como libres).
   - `porcentaje = Math.round(libres * 100f / members.size)` — redondeo Java `floor(x + 0.5)`; en TS usar `Math.round(libres * 100 / n)` (idéntico para valores ≥ 0). Ej.: 2/3 → 67, 1/3 → 33, 1/8 → 13 (12.5 redondea hacia arriba).
6. **Umbral** (l.47): si `porcentaje < group.availabilityThreshold` → la hora se descarta (corta cualquier ventana abierta). Si `porcentaje >= umbral` → la hora es válida (el umbral es **inclusivo**: 80 % con umbral 80 pasa).
7. **Fusión de horas consecutivas** (l.49-66):
   - Si la última ventana creada tiene `endHour == hour` (es decir, la hora anterior también fue válida) → se **prolonga**: `endHour = hour + 1`, `availabilityPercentage = min(anterior, porcentaje)`, `freeMembers = min(anterior, libres)`.
   - Si no → se abre una ventana nueva `{day, startHour: hour, endHour: hour+1, availabilityPercentage: porcentaje, freeMembers: libres}`.
   - La ventana se describe por su **peor hora** (mínimo), no por la media.
8. **Orden:** las ventanas salen en orden ascendente de `startHour` dentro del día. No hay más ordenación.
9. **Varios días:** `GroupPlanningViewModel.allWindowsFor` y `createProposal` concatenan `windowsFor` para `LUN..DOM` en ese orden (`DayOfWeek.week`), por lo que el resultado global queda ordenado por día y luego por hora. Las ventanas nunca cruzan días.

**Mapeo a `shared` (`MatchWindow`):** `dayOfWeek = day.iso`, `startTime = pad2(startHour) + ":00"`, `endTime = pad2(endHour) + ":00"` (la última puede ser `"20:00"`), `availabilityPercentage`, `freeMembers`.

### 1.2 Ejemplos trabajados (listos para test)

Notación de bloque: `(userId, dayOfWeek, start, end)`. Salida: `(día, startHour, endHour, %, freeMembers)`.

**E1 — Datos semilla, grupo `g1`, lunes.**
Grupo `g1`: miembros `mock_123`, `user_2`; umbral 80. Bloques (propios reasignados a `mock_123` + ocupación de Ana):
`(mock_123,1,08:00,10:00)`, `(mock_123,3,14:00,16:00)`, `(user_2,1,08:00,12:00)`, `(user_2,3,15:00,19:00)`, `(user_2,5,09:00,11:00)`.
Horas lunes: 8→0 %, 9→0 %, 10→50 %, 11→50 %, 12…19→100 %.
**Salida:** `[(LUN, 12, 20, 100, 2)]` → `"12:00 - 20:00"`.

**E2 — Semilla `g1`, miércoles.**
Horas: 8…13→100 %, 14→50 % (yo), 15→0 % (ambos), 16,17,18→50 % (Ana), 19→100 %.
**Salida:** `[(MIE, 8, 14, 100, 2), (MIE, 19, 20, 100, 2)]`.

**E3 — Semilla `g1`, semana completa (lo que genera `createProposal`).**
Viernes: Ana ocupa 9 y 10 → `[(VIE,8,9,100,2), (VIE,11,20,100,2)]`. Martes, jueves, sábado y domingo sin bloques → `(d,8,20,100,2)`.
**Salida completa, en orden (9 ventanas):**

| # | id que genera `createProposal` | día | inicio | fin | % |
|---|---|---|---|---|---|
| 1 | `mw_1_12` | LUN | 12:00 | 20:00 | 100 |
| 2 | `mw_2_8` | MAR | 08:00 | 20:00 | 100 |
| 3 | `mw_3_8` | MIE | 08:00 | 14:00 | 100 |
| 4 | `mw_3_19` | MIE | 19:00 | 20:00 | 100 |
| 5 | `mw_4_8` | JUE | 08:00 | 20:00 | 100 |
| 6 | `mw_5_8` | VIE | 08:00 | 09:00 | 100 |
| 7 | `mw_5_11` | VIE | 11:00 | 20:00 | 100 |
| 8 | `mw_6_8` | SAB | 08:00 | 20:00 | 100 |
| 9 | `mw_7_8` | DOM | 08:00 | 20:00 | 100 |

(`freeMembers = 2` en todas.)

**E4 — Mínimo en la fusión + redondeo hacia arriba del fin.**
Grupo de 3 (`A, B, C`), umbral **60**, día LUN. Bloques: `(A,1,09:00,10:00)`, `(B,1,11:30,12:00)`.
`B`: startHour 11, endHour 12 → ocupa la hora 11.
Horas: 8→100, 9→67, 10→100, 11→67, 12…19→100. Todas ≥ 60 → una sola ventana.
**Salida:** `[(LUN, 8, 20, 67, 2)]` (se queda con el peor dato: 67 % y 2 libres).

**E5 — Umbral que corta, minutos que ocupan la hora entera, bloques ignorados.**
Grupo de 3 (`A, B, C`), umbral 80, día MAR. Bloques:
- `(A,2,10:00,10:30)` → ocupa la hora 10 (fin redondeado a 11);
- `(B,2,13:30,14:00)` → ocupa la hora 13 (inicio truncado a 13);
- `(B,null,08:00,20:00)` → puntual: **ignorado**;
- `(Z,2,08:00,20:00)` → `Z` no es miembro: **ignorado**;
- `(C,3,08:00,20:00)` → otro día: ignorado.
Horas 10 y 13 → 2/3 = 67 % < 80 → cortan.
**Salida:** `[(MAR, 8, 10, 100, 3), (MAR, 11, 13, 100, 3), (MAR, 14, 20, 100, 3)]`.

**E6 — Casos límite.**
- a) `members = []` → `[]` (cualquier bloque).
- b) 5 miembros, umbral 80, `(A,4,07:00,21:00)` → cada hora 4/5 = 80 % (pasa, umbral inclusivo) → `[(JUE, 8, 20, 80, 4)]`. Nótese que el bloque que empieza antes de 8 o acaba después de 20 se recorta al rango.
- c) Igual que (b) más `(B,4,12:00,13:00)` → hora 12 = 3/5 = 60 % < 80 → `[(JUE,8,12,80,4), (JUE,13,20,80,4)]`.
- d) Umbral 0, 2 miembros ambos ocupados `08:00-20:00` el VIE → todas las horas 0 % ≥ 0 → `[(VIE, 8, 20, 0, 0)]`.
- e) Umbral 101 → siempre `[]`.
- f) Bloque `(A,1,18:00,08:00)` (fin < inicio) → no ocupa nada.
- g) Dos bloques solapados del mismo miembro `(A,1,08:00,10:00)` y `(A,1,09:00,11:00)` en grupo de 2 → horas 8,9,10 a 50 %; A cuenta una sola vez por hora.

---

## 2. Lógica de cada ViewModel

Comportamiento común:

- **Toast** (`DashboardViewModel.showToast` l.163-169, `GroupPlanningViewModel.showToast` l.229-235): pone el mensaje y lo borra a los **3000 ms** solo si sigue siendo el mismo mensaje (un toast posterior no se borra por el temporizador del anterior).
- Los flujos derivados usan `stateIn(WhileSubscribed(5000))`: son vistas reactivas de los repositorios.

### 2.1 AuthViewModel (`hk/ui/auth/AuthViewModel.kt`)

**Estado:** `email=""`, `name=""`, `password=""`, `isLoading=false`, `errorMessage: String?=null`, `isLoggedIn=false`.

| Función | Reglas |
|---|---|
| `onEmailChange/onNameChange/onPasswordChange(v)` | Asignan tal cual (sin trim). |
| `login()` (l.49-60) | `isLoading=true`, `errorMessage=null`; llama `repository.login(email, password)`; éxito → `isLoggedIn=true`; fallo → `errorMessage = exception.message`; `isLoading=false`. No valida nada en el VM. |
| `register()` (l.37-46) | Igual con `repository.register(name, email, password)`. |
| `logout()` (l.67-76) | `repository.logout()`; `isLoggedIn=false`; vacía `email`, `password`, `name`; `errorMessage=null`. |

**Validación de formulario (en las pantallas, no en el VM) — debe replicarse en el cliente RN:**

- Regex de email (`LoginScreen.kt:409`, `RegisterScreen.kt:369`): `^[^@\s]+@[^@\s]+\.[^@\s]+$`, aplicada sobre `email.trim()`.
- Login (`LoginScreen.kt:93-103`), en este orden por campo:
  - email vacío/blanco → «El correo es requerido»; no casa regex → «Ingresa un correo válido».
  - password blanco → «La contraseña es requerida»; `length < 6` → «Mínimo 6 caracteres».
  - Solo si ambos errores son null se llama `login()`. Editar un campo borra su error.
- Registro (`RegisterScreen.kt:95-107`): nombre blanco → «El nombre es requerido»; email y password con las mismas reglas y textos que el login.
- Botones deshabilitados mientras `isLoading`.

**Repositorio mock (`hk/data/repository/AuthRepositoryImpl.kt`):**

- `login` (l.15-29): espera 1500 ms; éxito si `email.contains("@") && password.length >= 6` → `User(id="mock_123", name="Usuario de Prueba", email=<el introducido>)`; si no → error «Credenciales inválidas».
- `register` (l.31-36): espera 1500 ms; **nunca falla**; `User(id="mock_" + currentTimeMillis, name, email)`. No guarda credenciales.
- `logout`: usuario actual = null. `getCurrentUser()`: flujo del usuario actual.

**Tras login/registro correcto** (`HueckoNavigation.kt:106-127`): `dashboardViewModel.showWelcomeToast()` → «¡Sesión iniciada con éxito! Bienvenido a HueckoApp.» y navega al inicio.

### 2.2 DashboardViewModel (`hk/ui/dashboard/DashboardViewModel.kt`)

Combina `getCurrentUser`, `getGroups`, `getTimeBlocks`, `getProposals`, `expressChoice` y `toast`. No guarda datos propios.

**Estado `DashboardUiState` (l.57-74) y fórmulas exactas** (`today = DayOfWeek.fromCalendarField(hoy)`, `email = user?.email ?: ""`):

| Campo | Fórmula |
|---|---|
| `greeting` (l.262-267) | hora local 0–11 → «Buenos días»; 12–18 → «Buenas tardes»; 19–23 → «Buenas noches». |
| `name` (l.117) | primera palabra del nombre: `user.name.substringBefore(' ')` (`"Ana Pérez"` → `"Ana"`); sin usuario → `""`. La pantalla muestra `greeting` si `name` está en blanco, si no `"<greeting>, <name>"`. |
| `longDate` (l.273-278) | `"<DíaLargo>, <díaDelMes> de <mes>"` en castellano: días `Domingo, Lunes, Martes, Miércoles, Jueves, Viernes, Sábado`; meses en minúscula `enero…diciembre`. Ej. hoy: «Martes, 29 de septiembre». |
| `today` | `DayOfWeek` de hoy. |
| **Horario de hoy** `todayBlocks` (l.120) | `blocks.filter(b => b.dayOfWeek == today.iso)` en el orden del repositorio (sin ordenar; los puntuales nunca aparecen). Si está vacío la pantalla muestra «Nada en la agenda para hoy (<Día>)» y «Tienes <totalBlocks> bloque(s) en la semana.». Etiqueta por tipo: `LIBRE`→«Libre», `PUNTUAL`→«Puntual», resto→«Ocupado». |
| **Grupos activos** `activeGroups` (l.121) | `groups.length` (todos los grupos del usuario). |
| **Votaciones abiertas** `openVotes` (l.122) | nº de propuestas con `state == PROPUESTO` (de todos los grupos, sin mirar plazo ni si ya voté). |
| **Horas coincidentes** `matchingHours` (l.193-200) | Σ sobre **todas** las ventanas de **todas** las propuestas (cualquier estado, incluso `CANCELADO`) con `availabilityPercentage >= 80` (constante `HIGH_MATCH_THRESHOLD`, **no** el umbral del grupo) de `max(0, horaEntera(endTime) − horaEntera(startTime))`, donde `horaEntera` trunca minutos (`"16:30"` → 16). Sin deduplicar solapes. Se muestra `"<n> h"`. |
| **Bloques totales** `totalBlocks` (l.124) | `blocks.length` (recurrentes + puntuales). |
| **Próximo plan** `upcomingEvent` (l.202-222) | `p` = **primera** propuesta (orden del repositorio) con `state == CONFIRMADO`; `g` = su grupo; `w` = **primera** ventana de `p` (no la más votada). Si falta alguno → `null`. `{id:p.id, groupId, groupName:g.name, title, dayLabel:w.day.label, timeRange:"<start> - <end>", location: p.location ?? «Lugar por definir», state, attendees}`. |
| `attendees` (l.224-241) | uno por miembro de `g`: `name` = «Tú» si `member.email == email`, si no `member.name`; `inc` = primera incidencia **no resuelta** con `userEmail == member.email`; `status`: `TARDANZA`→`RETRASADO`, `FALTA`/`IMPREVISTO`→`NO_ASISTE`, sin incidencia→`PUNTUAL`; `delayMinutes = inc?.delayMinutes`; `isEssential = member.isEssential`. La tarjeta muestra «<n> de <total> asistirán» con `n = count(status != NO_ASISTE)` y hasta 6 avatares. |
| `groups: GroupSummary[]` (l.173-186) | por grupo: `next` = primera ventana (aplanando en orden) de las propuestas del grupo con `state != CANCELADO`; `memberCount = members.length`; `matchPercentage = next?.availabilityPercentage ?? group.availabilityThreshold`; `nextSlot = next ? "<día corto> <start> - <end>" : «Sin propuesta aún»`. Pantalla: «<memberCount> miembros · <nextSlot>» y «<matchPercentage>%». Sin grupos: «Todavía no perteneces a ningún grupo.». |
| **Votaciones en curso** `pendingVotes` (l.106-113) | propuestas `PROPUESTO` en orden del repositorio, cada una con `groupName` = nombre del grupo o «Grupo» si no se encuentra. La tarjeta muestra grupo, título, `votingDeadline` (texto) y cada ventana: «<día> · <start> - <end>», «<p>% del grupo disponible», «<n> voto(s)» (`1 → "voto"`, resto `"votos"`), marcada si `email ∈ voterEmails`. |
| `expressAlert` (l.248-260) | primera propuesta con `state == CONFIRMADO` y alguna incidencia `!resolved`; toma la **primera** incidencia no resuelta: `{proposalId, who: inc.userName, reason: inc.reason, planTitle: p.title}`. **No** mira `type`, `criticality` ni `isEssential`. Texto: «Votación exprés», «<who> no podrá asistir a «<planTitle>»», `<reason>`. |
| `expressChoice` | elección en curso (o null). |
| `userEmail` | `email`. |
| `toast` | mensaje actual. |

Tarjetas de métricas (textos exactos, `DashboardScreen.kt:305-335`): «Grupos activos» / «Con disponibilidad sincronizada»; «Votaciones abiertas» / «Planes pendientes de hora»; «Horas coincidentes» / «Donde coincide el 80% o más»; «Mi horario» / «Bloques registrados».

**Funciones:**

- `showWelcomeToast()` → toast «¡Sesión iniciada con éxito! Bienvenido a HueckoApp.».
- `vote(proposalId, windowId)` (l.139-146): si `userEmail` vacío → no hace nada. Si no → `planRepository.voteWindow(proposalId, windowId, email)` y toast «Tu voto ha sido registrado.» (también cuando el voto se retira, ver toggle en §2.4). No comprueba estado ni plazo.
- `submitExpressVote(choice)` (l.152-161): si no hay `expressAlert` → no hace nada. `expressChoice = choice`; toast «Votación exprés registrada: <label en minúsculas>.» («reprogramar» / «cancelar» / «mantener»); espera **1500 ms**; `planRepository.resolveIncidences(proposalId, choice.resultingState)`; `expressChoice = null`.
  - `ExpressVoteChoice` (l.51-55): `REPROGRAMAR("Reprogramar") → PROPUESTO`, `CANCELAR("Cancelar") → CANCELADO`, `MANTENER("Mantener") → CONFIRMADO`.
  - Es una decisión unilateral del primer usuario que pulsa: no hay recuento de votos exprés.

**Valores esperados con la semilla** (login con `test@test.com` / `123456`; hoy martes): `name="Usuario"`, `activeGroups=1`, `openVotes=1` (`prop_2`), `matchingHours=6` (w_1 2 h + w_21 2 h + w_22 2 h; w_23 a 50 % excluida), `totalBlocks=2`, `todayBlocks=[]` (martes), `upcomingEvent = prop_1` («Reunión de avance del proyecto», «Proyecto Integrador», «Mié», «11:00 - 13:00», «Biblioteca central», asistentes: `Tú` PUNTUAL, `Ana` NO_ASISTE → «1 de 2 asistirán»), `groups=[{g1, "Proyecto Integrador", 2, 100, "Mié 11:00 - 13:00"}]`, `pendingVotes=[prop_2 / "Proyecto Integrador"]`, `expressAlert={prop_1, "Ana", "Cruce con un examen de laboratorio a última hora.", "Reunión de avance del proyecto"}`.
Después de la votación exprés:
- **REPROGRAMAR:** `prop_1` → `PROPUESTO`, incidencias resueltas, votos de sus ventanas vaciados → `openVotes=2`, `upcomingEvent=null`, `expressAlert=null`.
- **CANCELAR:** `prop_1` → `CANCELADO` → `upcomingEvent=null`, `expressAlert=null`, resumen de g1 pasa a `w_21`: `100`, «Mar 16:00 - 18:00»; `matchingHours` sigue en 6 (incluye canceladas).
- **MANTENER:** sigue `CONFIRMADO`, incidencia resuelta → Ana vuelve a `PUNTUAL` («2 de 2 asistirán»), `expressAlert=null`.

Tests existentes (`DashboardViewModelTest.kt`): usuario `"Ana Pérez"` + 1 grupo + sin propuestas → `name="Ana"`, `activeGroups=1`, `openVotes=0`; `vote("prop1","win1")` no lanza.

### 2.3 GroupViewModel (`hk/ui/group/GroupViewModel.kt`)

**Estado:** `groups` (flujo), `isLoading`, `errorMessage`.

- `clearError()` → `errorMessage=null`.
- `createGroup(name, onSuccess)`: si `name.isBlank()` → no hace nada (sin mensaje). Si no: `isLoading=true`, `errorMessage=null`, `repository.createGroup(name)` (sin trim) → éxito: `onSuccess()`; fallo: `errorMessage = message`; `isLoading=false`.
- `joinGroup(inviteCode, onSuccess)`: igual con `repository.joinGroup(inviteCode)`.
- Diálogos (`GroupDialogs.kt:47-48,104-105`): botón habilitado si el texto no está en blanco y no carga; al editar se llama `clearError()`.

**Repositorio mock (`GroupRepositoryImpl.kt`):**

- `createGroup(name)` (l.31-41): espera 1000 ms; `Group(id=UUID, name, inviteCode = name.take(3).uppercase() + aleatorio[100..999], members=[usuarioFijo mock_123])`, umbral 80, descripción "". Nunca falla; no comprueba colisión de códigos.
- `joinGroup(code)` (l.43-67): espera 1000 ms; `code = inviteCode.trim().uppercase()`;
  1. si algún grupo del usuario tiene ese `inviteCode` → «Ya perteneces a este grupo»;
  2. si `code == "HUECKO123"` → crea y añade el grupo «Amigos de la Uni» (`inviteCode "HUECKO123"`, miembros `Carlos (user_3)` + usuario actual);
  3. si no → «Código de invitación inválido».

### 2.4 GroupPlanningViewModel (`hk/ui/group/GroupPlanningViewModel.kt`)

**Estado `GroupPlanningState` (l.33-40):**

- `proposals = (repo.getProposals() + _localProposals).distinctBy(id)` — **se queda con la primera aparición, es decir, la del repositorio** (ver bug B7).
- `blocks = mine + occupancy`, con `mine = ownBlocks.map(b => {...b, userId: currentUser.id})` (l.76): los bloques propios se **reasignan** al id del usuario actual (parche del desajuste `user_1`/`mock_123`). Sin usuario → `mine = []`.
- `userEmail = user?.email ?? ""`, `toast`, `votingCalls = _votingCalls.value` (se lee, no se combina: ver B9).

**Funciones:**

| Función | Reglas exactas |
|---|---|
| `proposalsOf(groupId)` (l.92) | propuestas con ese `groupId` y `state != CANCELADO` («una cancelada ya no admite votos»). |
| `windowsFor(group, day)` / `allWindowsFor(group)` (l.96-103) | `AvailabilityMatcher` sobre `state.blocks`; `allWindowsFor` concatena LUN..DOM. |
| `createProposal(group, title, location, deadline)` (l.173-204) | 1. Si `title.isBlank()` → toast «El titulo no puede estar vacio.» (sin tildes) y fin. 2. Ventanas = `allWindowsFor(group)` mapeadas a `TimeWindowProposal{ id: "mw_<iso>_<startHour>" (sin relleno, p. ej. `mw_1_8`), day, startTime: "%02d:00", endTime: "%02d:00", availabilityPercentage, voterEmails: [] }` — **todas** las ventanas de la semana, no un top-N. 3. Propuesta `{ id: "local_<groupId>_<millis>", groupId, title: title.trim(), location: location?.trim() o null si queda en blanco, createdBy: userEmail, votingDeadline: deadline.trim() (texto libre, no se valida), state: PROPUESTO, suggestedWindows, incidences: [] }`. 4. Se añade a `_localProposals` (solo memoria del VM, no llega al repositorio). 5. Toast «Propuesta creada.». La hoja de creación (`GroupDetailScreen.kt:461`) solo habilita el botón si `title` y `deadline` no están en blanco; campos «Titulo del plan», «Ubicacion (opcional)», «Fecha limite de votacion». |
| `addSuggestedWindow(proposalId, day, start, end)` (l.106-135) | Crea `{ id: "sw_<millis>", day, startTime: start, endTime: end, availabilityPercentage: 0, voterEmails: [] }` (sin validar formato ni orden; la hoja solo exige no-blanco, valores por defecto LUN 09:00–11:00). Si la propuesta no existe en `state.proposals` → toast «Propuesta no encontrada.». Si existe → copia con la ventana añadida al final, la guarda en `_localProposals` (reemplazando la copia local previa) y toast «Franja horaria agregada.». |
| `vote(proposalId, windowId)` (l.137-168) | Si `userEmail` vacío → nada. Si la propuesta está en `_localProposals` → aplica la regla de voto localmente; si no → `planRepository.voteWindow`. En ambos casos toast «Tu voto ha sido registrado.». **No comprueba estado ni plazo.** |
| `notifyCodeCopied(code)` (l.170) | toast «Código <code> copiado.» (no se usa en ninguna pantalla). |
| `votingCallsOf(groupId)` (l.207-208) | llamadas cuyo `id` **empieza por** `groupId` (ver B10). |
| `createVotingCall(groupId, proposal)` (l.211-227) | Si ya existe una llamada con `planId == proposal.id` (en cualquier grupo) → toast «Ya hay un llamado activo para este plan.» y fin. Si no: `VotingCall{ id: "<groupId>_<proposalId>_<millis>", planId, planTitle, createdBy: userEmail, createdAt: fecha actual "dd/MM/yyyy" }` → toast «Llamado a la votación creado.». Es solo local (placeholder, no hay notificación). La hoja marca las propuestas ya convocadas con «Ya convocado» y las deshabilita; tarjeta: «Convocado por <email> · <fecha>» + «Ir a votar». |

**Regla de voto excluyente con alternancia** (idéntica en `PlanRepositoryImpl.voteWindow` l.46-69 y en el VM l.144-157). Para cada ventana `w` de la propuesta:

```
sinVoto = w.voterEmails − email
si w.id == windowId y email ∉ w.voterEmails → w.voterEmails = sinVoto + email
si no                                        → w.voterEmails = sinVoto
```

Efectos: (a) votar una ventana quita el voto de las demás de la misma propuesta; (b) **votar de nuevo la misma ventana retira el voto** (toggle); (c) `windowId` inexistente → el usuario queda sin voto en esa propuesta; (d) `proposalId` inexistente → no cambia nada, devuelve éxito.

Ejemplos (semilla `prop_2`; `w_21` tiene `[ana]`):
- `test` vota `w_22` → `w_21=[ana]`, `w_22=[test]`, `w_23=[]`.
- `test` vota luego `w_21` → `w_21=[ana,test]`, `w_22=[]`.
- `test` vota otra vez `w_21` → `w_21=[ana]` (retira).
- `ana` vota `w_23` → `w_21=[]`, `w_23=[ana]`.

**Incidencias / votación exprés / `resolveIncidences`** — no hay función en el VM para crear incidencias (solo existen las de la semilla). La resolución vive en el repositorio y se dispara desde el Dashboard (§2.2):

`PlanRepositoryImpl.resolveIncidences(proposalId, newState)` (l.71-95):
1. `newState` debe ser el nombre exacto de un `ProposalState`; si no → fallo `IllegalArgumentException("Estado desconocido: <newState>")`.
2. Para la propuesta con ese id: `state = newState`; **todas** sus incidencias → `resolved = true`; si `newState == PROPUESTO` → vacía `voterEmails` de todas sus ventanas (reprogramar = nueva ronda); en otro caso mantiene los votos.
3. `proposalId` inexistente → éxito sin cambios. No comprueba estado previo ni permisos.

**Plazos (`votingDeadline`):** en Kotlin es **texto libre** que solo se muestra («Cierra: <texto>», «Cerrada», «Cierra hoy a las 20:00»). No existe ninguna lógica de cierre por plazo ni transición automática de estado.

**Etiquetas de estado:** `CONFIRMADO`→«Confirmado», `EN_RECOORDINACION`→«Re-coordinando», `CANCELADO`→«Cancelado», `PROPUESTO`→«En votacion». El botón «Ir a votar» del detalle solo aparece si `PROPUESTO` (`PlanDetailScreen.kt:126`); la pantalla de votar no restringe.

### 2.5 ScheduleViewModel (`hk/ui/schedule/ScheduleViewModel.kt`)

**Estado:** `timeBlocks` (flujo), `isLoading=false`, formulario `newLabel=""`, `newDay=1`, `isRecurring=true`, `newStartTime="08:00"`, `newEndTime="09:00"`. Setters `onLabelChange/onDayChange/onRecurringChange/onStartTimeChange/onEndTimeChange` asignan tal cual.

- `saveBlock(onSuccess)` (l.50-66): `isLoading=true`; construye `TimeBlock{ id: String(currentTimeMillis), userId: "user_1" (fijo), dayOfWeek: isRecurring ? newDay : null, startTime, endTime, label: newLabel (sin trim), isRecurring, type: CLASE (por defecto, también para puntuales) }`; `repository.addTimeBlock(block)`; `isLoading=false`; `onSuccess()` **siempre**, sin mirar el resultado. **El VM no valida nada** y **no reinicia el formulario** tras guardar.
- `deleteBlock(id)` (l.69-75): `isLoading=true`, `repository.deleteTimeBlock(id)` (filtra por id; id inexistente → éxito sin cambios), `isLoading=false`.

**Reglas recurrente vs puntual:** recurrente → `dayOfWeek = newDay (1–7)`, `isRecurring=true`; puntual → `dayOfWeek = null`, `isRecurring=false`, **sin fecha** (no se sabe qué día ocurre). El selector de día solo se muestra si es recurrente. Tests (`ScheduleViewModelTest.kt`): recurrente «Clase Matutina», día 2, 09:00–11:00 → `dayOfWeek=2`, `isRecurring=true`; puntual «Reunión Única» 15:00–16:00 → `dayOfWeek=null`, `isRecurring=false`.

**Validación de horas (en `AddScheduleScreen.kt:62-65, 296-303`):**
- Formato: regex `^([01]\d|2[0-3]):[0-5]\d$` (00:00–23:59; `"8:00"` y `"24:00"` inválidos).
- Orden: `minutos(end) > minutos(start)` (estricto; mismo valor inválido).
- `canSave = label.isNotBlank() && formatoInicioOK && formatoFinOK && orden && !isLoading`.
- Mensajes bajo los campos: inicio inválido → «Formato HH:mm» (si no, «Inicio»); fin: formato inválido → «Formato HH:mm», orden inválido → «Debe ser posterior», si no «Fin». Botón «Guardar bloque» / «Guardando…».

**Lista «Mi horario»** (`MyScheduleScreen.kt:81,141`): muestra los bloques del día seleccionado (`dayOfWeek == día`) ordenados por `startTime` como texto; el selector muestra el nº de bloques por día o «libre». Los puntuales no aparecen en ningún día (B12).

### 2.6 OcrViewModel (`hk/ui/ocr/OcrViewModel.kt`)

Estados (`OcrUiState`, l.56-61): `Initial`, `Loading`, `Success(blocks)`, `Error(message)`.

Flujo `processImage(context, uri)` (l.27-39):
1. `Loading`.
2. Decodifica el `Uri` a `Bitmap` (`ImageDecoder` en API ≥ 28, `MediaStore` en anteriores).
3. `json = geminiService.analyzeScheduleImage(bitmap)` (nunca lanza por fallos de IA: devuelve el mock, §4).
4. `blocks = Gson.fromJson(json, List<TimeBlock>)`. Gson no ejecuta el constructor de Kotlin: los campos ausentes quedan con valores JVM por defecto → `id=null`, `userId=null`, `isRecurring=false`, `type=null` (ver B13).
5. `Success(blocks)`; cualquier excepción (decodificación, JSON no-array, etc.) → `Error(e.message ?: «Error desconocido»)`.

Pantalla de revisión (`OcrReviewScreen.kt`): la carga muestra «Leyendo tu horario» / «Puede tardar unos segundos. No cierres la pantalla.»; error → «No se pudo leer el horario» + mensaje; lista vacía → «No se detectó ningún bloque» / «Prueba con una foto más nítida o añade los bloques a mano.»; con bloques → «<n> bloque detectado|bloques detectados», aviso «Revísalos antes de confirmar: se sumarán a tu horario y afectarán a los huecos que vean tus grupos.», botones «Descartar» y «Añadir a mi horario». Se acepta la lista entera o nada (no se puede editar/borrar un bloque). Confirmar (`HueckoNavigation.kt:222-228`) llama `scheduleRepository.addTimeBlock` uno a uno y vuelve a «Mi horario».

---

## 3. Datos semilla (mock) → semilla de desarrollo del backend

### 3.1 Tal cual en Kotlin

**Usuarios que aparecen**

| id Kotlin | Nombre | Email | Origen |
|---|---|---|---|
| `mock_123` | Usuario de Prueba | `test@test.com` (en grupos) / el email tecleado (en login) | `AuthRepositoryImpl.kt:20`, `GroupRepositoryImpl.kt:16` |
| `user_1` | — | — | dueño de los bloques propios, `ScheduleRepositoryImpl.kt:15-16`, `ScheduleViewModel.kt:55` |
| `user_2` | Ana | `ana@test.com` | `GroupRepositoryImpl.kt:24` |
| `user_3` | Carlos | `carlos@test.com` | `GroupRepositoryImpl.kt:60` (grupo que se une con `HUECKO123`) |

Ningún usuario tiene `isEssential = true`.

**Grupos**

| id | nombre | inviteCode | miembros | umbral | descripción |
|---|---|---|---|---|---|
| `g1` | Proyecto Integrador | `PROY2026` | `mock_123`, `user_2` (Ana) | 80 | "" |
| (UUID al unirse) | Amigos de la Uni | `HUECKO123` | `user_3` (Carlos), `mock_123` | 80 | "" |

**Bloques de horario**

| id | userId | día | inicio | fin | label | tipo | recurrente |
|---|---|---|---|---|---|---|---|
| `1` | `user_1` (el usuario actual) | 1 LUN | 08:00 | 10:00 | Clase de Android | CLASE | sí |
| `2` | `user_1` (el usuario actual) | 3 MIE | 14:00 | 16:00 | Trabajo Part-time | CLASE | sí |
| `occ_1` | `user_2` | 1 LUN | 08:00 | 12:00 | Clase de Redes | CLASE | sí |
| `occ_2` | `user_2` | 3 MIE | 15:00 | 19:00 | Turno de tarde | CLASE | sí |
| `occ_3` | `user_2` | 5 VIE | 09:00 | 11:00 | Laboratorio | CLASE | sí |

**Propuestas** (`PlanRepositoryImpl.kt:97-141`)

`prop_1` — grupo `g1`, «Reunión de avance del proyecto», ubicación «Biblioteca central», `createdBy test@test.com`, `votingDeadline "Cerrada"`, estado **CONFIRMADO**.
- Ventana `w_1`: MIE 11:00–13:00, 100 %, votos `[test@test.com, ana@test.com]`.
- Incidencia `inc_1`: `ana@test.com` / Ana, `IMPREVISTO`, «Cruce con un examen de laboratorio a última hora.», `delayMinutes=null`, criticidad **ALTA**, `resolved=false`.

`prop_2` — grupo `g1`, «Repaso antes de la entrega», ubicación «Google Meet», `createdBy ana@test.com`, `votingDeadline "Cierra hoy a las 20:00"`, estado **PROPUESTO**, sin incidencias.
- `w_21`: MAR 16:00–18:00, 100 %, votos `[ana@test.com]`.
- `w_22`: JUE 10:00–12:00, 100 %, sin votos.
- `w_23`: VIE 16:00–18:00, 50 %, sin votos.

Códigos de invitación especiales: `HUECKO123` (válido para unirse), cualquier otro no presente → inválido.

### 3.2 Propuesta de semilla normalizada para el backend

Aplicando el contrato (ids reales, votos por usuario, `isEssential` por grupo, fechas ISO, `location` como objeto, contraseñas ≥ 8):

| Usuario | email | contraseña dev | Nota |
|---|---|---|---|
| Usuario de Prueba | `test@test.com` | `password123` | sustituye a `mock_123` **y** `user_1` |
| Ana | `ana@test.com` | `password123` | |
| Carlos | `carlos@test.com` | `password123` | |

- Grupo «Proyecto Integrador», `PROY2026`, umbral 80, descripción "": `test` OWNER, `ana` MEMBER, ambos `isEssential=false`. (Opcional para probar HU-14 del contrato: `ana.isEssential=true`.)
- Grupo «Amigos de la Uni», `HUECKO123`, umbral 80: **solo** `carlos` (OWNER), para que `POST /groups/join {HUECKO123}` por `test` funcione (200) y una segunda vez dé `409 ALREADY_MEMBER`.
- Bloques: los 5 de la tabla, con `userId` de `test` (1 y 2) y de `ana` (occ_*), `type` como arriba, `isRecurring=true`, `date=null`.
- `prop_1`: `location {name:"Biblioteca central", latitude:null, longitude:null}`, `createdBy=test`, `votingDeadline = seedTime − 1 día`, `state=CONFIRMADO`, `chosenWindowId = w_1`; votos: test→w_1, ana→w_1; incidencia de Ana como arriba (`createdAt = seedTime`).
- `prop_2`: `location {name:"Google Meet", …null}`, `createdBy=ana`, `votingDeadline` = hoy a las 20:00 hora local convertida a UTC (si ya pasó, `seedTime + 1 día`), `state=PROPUESTO`; ventanas `w_21/w_22/w_23` con `dayOfWeek` 2/4/5 y los porcentajes de la semilla (o recalculados, ver B15); voto ana→w_21.

---

## 4. GeminiService (`hk/data/service/GeminiService.kt`)

- **SDK / modelo:** Firebase AI (`Firebase.ai.generativeModel`), `modelName = "gemini-1.5-flash"`, `generationConfig { responseMimeType = "application/json" }` (l.15-22).
- **API key:** `BuildConfig.GEMINI_API_KEY`, leída de `local.properties` (`app/build.gradle.kts:29-30`). Solo se usa como interruptor: si está en blanco se devuelve el mock sin llamar a la IA (Firebase AI se autentica con el proyecto Firebase, no con esa key).
- **Contenido enviado:** la imagen (si `bitmap != null`) y después el texto del prompt.
- **Prompt exacto** (l.24-34, tras `trimIndent()`):

```
Analiza esta imagen de un horario y extrae los bloques de tiempo.
Devuelve un JSON con una lista de objetos. Cada objeto debe tener:
- "dayOfWeek": un número del 1 (Lunes) al 7 (Domingo).
- "startTime": hora de inicio en formato HH:mm.
- "endTime": hora de fin en formato HH:mm.
- "label": nombre de la actividad o clase.

Si no estás seguro del día, intenta inferirlo por la posición en la tabla.
Responde SOLO el JSON.
```

- **Forma JSON esperada:** array de `{ "dayOfWeek": number, "startTime": "HH:mm", "endTime": "HH:mm", "label": string }`.
- **Respuesta / fallback** (l.36-54): key en blanco → mock; `response.text` nulo → mock; cualquier excepción (red, Firebase) → mock. Es decir, **el servicio nunca falla**; los errores de la IA se ocultan devolviendo datos inventados.
- **Parseo:** lo hace `OcrViewModel` con Gson a `List<TimeBlock>` (§2.6); no hay validación de campos, rangos ni formato.
- **Mock literal** (l.56-83):

```json
[
  {
    "dayOfWeek": 1,
    "startTime": "08:00",
    "endTime": "10:00",
    "label": "Matemáticas Discretas"
  },
  {
    "dayOfWeek": 1,
    "startTime": "10:30",
    "endTime": "12:30",
    "label": "Arquitectura de Software"
  },
  {
    "dayOfWeek": 3,
    "startTime": "09:00",
    "endTime": "11:00",
    "label": "Bases de Datos Avanzadas"
  },
  {
    "dayOfWeek": 5,
    "startTime": "14:00",
    "endTime": "16:00",
    "label": "Desarrollo Móvil Android"
  }
]
```

Test existente (`OcrViewModelTest.kt`): sin key, `analyzeScheduleImage(null)` contiene «Matemáticas Discretas».

**Propuesta para `POST /ai/schedule-ocr`:**
1. Modelo configurable por `GEMINI_MODEL` (el `gemini-1.5-flash` ya está retirado; usar un modelo *flash* vigente por defecto) y key en `GEMINI_API_KEY` solo en el servidor. Reutilizar el prompt literal.
2. Limpiar la respuesta (quitar vallas ```` ``` ```` si aparecen), `JSON.parse`; aceptar array raíz o `{blocks:[…]}`.
3. Validar cada elemento (`dayOfWeek` entero 1–7, `startTime`/`endTime` con la regex de §2.5, `start < end`, `label` no vacío tras trim); descartar los inválidos.
4. Mapear a la forma del contrato: `{ label, type: "CLASE", startTime, endTime, isRecurring: true, dayOfWeek, date: null }`.
5. Si no queda ningún bloque válido o el JSON no se puede leer → `422 AI_UNREADABLE`.
6. Mock: **solo** si `NODE_ENV !== 'production'` y no hay `GEMINI_API_KEY` → devolver el mock literal (mapeado como en 4). En producción un fallo del proveedor no debe convertirse en datos falsos: responder `502 AI_UNAVAILABLE` (código nuevo a añadir al contrato).

---

## 5. Diferencias con `docs/api.md` y resoluciones propuestas

### 5.1 Reglas Kotlin que el contrato no cubre

| # | Regla / función Kotlin | Resolución propuesta |
|---|---|---|
| G1 | **Alternancia del voto**: votar dos veces la misma ventana retira el voto. | Backend: `PUT /vote` idempotente (votar la misma ventana no cambia nada). Cliente: al pulsar la ventana ya votada llama `DELETE /proposals/:id/vote`. Mismo UX, API limpia. |
| G2 | **Añadir franja a una propuesta** (`addSuggestedWindow`). | Añadir `POST /proposals/:id/windows {dayOfWeek,startTime,endTime}` → `201 Proposal`; solo miembros, solo si `PROPUESTO`; validar formato y `start<end`; `availabilityPercentage` calculado por el servidor con el matcher (en Kotlin es 0). `409` si ya existe una ventana idéntica. |
| G3 | **Llamados a la votación** (`VotingCall`): solo locales, sin efecto real. | No implementar en el MVP del backend. Si se quiere: `POST /proposals/:id/call` → notificación push; unicidad por propuesta (`409 CALL_EXISTS`, texto «Ya hay un llamado activo para este plan.»). |
| G4 | **Votación exprés con «Reprogramar» (→ `PROPUESTO`)**, que además vacía votos. El contrato solo admite `CONFIRMADO | CANCELADO`. | Ampliar `POST /proposals/:id/incidences/resolve` a `newState ∈ {CONFIRMADO, CANCELADO, PROPUESTO}`. Con `PROPUESTO`: borrar votos, `chosenWindowId=null`, exigir nuevo `votingDeadline` futuro en el cuerpo. Siempre: todas las incidencias → `resolved=true`. |
| G5 | **Disparo de la alerta exprés**: en Kotlin, cualquier incidencia no resuelta en un plan `CONFIRMADO`. En el contrato: solo `FALTA` de un imprescindible pasa a `EN_RECOORDINACION`. | Adoptar el contrato como fuente del estado. Cliente: mostrar la alerta exprés cuando `state == EN_RECOORDINACION` (o, como aviso informativo, cuando haya incidencias no resueltas en `CONFIRMADO`). Documentar en `api.md`. |
| G6 | **Criticidad** (`Criticality`) existe en el modelo, pero no hay regla para calcularla y el cuerpo del contrato no la incluye. | Derivarla en el servidor: `FALTA` de imprescindible → `ALTA`; `FALTA` o `IMPREVISTO` → `MEDIA`; `TARDANZA` → `BAJA` (o `MEDIA` si `delayMinutes ≥ 30`). Añadirlo a `api.md`. |
| G7 | **Métricas del dashboard** (votaciones abiertas, votaciones en curso, horas coincidentes, resumen por grupo con `matchPercentage`/`nextSlot`). El contrato solo tiene `/me/upcoming-plans` y `GroupSummary` sin esos campos. | Añadir `GET /me/proposals?state=PROPUESTO` (votaciones en curso de todos mis grupos, con `groupName`) para no hacer N+1. `matchingHours` y resumen por grupo: calcular en cliente con las mismas fórmulas de §2.2 (o, mejor, `GET /me/dashboard` que devuelva `{activeGroups, openVotes, matchingHours, totalBlocks}`). |
| G8 | **Recuento de votos por ventana visible** («n votos») y marcado de mi voto. | Cubierto por `TimeWindow.voteCount` + `Proposal.myVoteWindowId`. Nada que añadir. |
| G9 | **Estados y textos de la UI** («En votacion», «Re-coordinando»…). | Solo cliente. |
| G10 | **Normalización del código de invitación** (`trim().uppercase()`). | El backend debe aplicar la misma normalización en `/groups/join`. |
| G11 | **Formato del código** `NOMBRE[0..3].upper + 100..999`. | El contrato solo dice «el servidor lo genera». Propuesta: 8 caracteres `[A-Z0-9]` sin ambiguos (0/O, 1/I), único (reintentar si colisiona). Mantener los códigos semilla `PROY2026` y `HUECKO123`. |
| G12 | **Tipo del bloque**: Kotlin siempre crea `CLASE`, incluso puntuales. | El contrato exige `type`. Cliente: selector de tipo; por defecto `CLASE` si recurrente y `PUNTUAL` si puntual. Backend: validar el enum. |
| G13 | **Matcher y bloques puntuales / `LIBRE`**. | `/availability` (semanal) sigue ignorando puntuales. Proponer `?weekOf=YYYY-MM-DD` opcional para incluir los puntuales cuya `date` cae en esa semana. Excluir del cruce los bloques `type == LIBRE` (ver B14). Documentarlo. |

### 5.2 Elementos del contrato sin equivalente en Kotlin

| # | Contrato | Resolución |
|---|---|---|
| C1 | `votingDeadline` ISO y `409 VOTING_CLOSED` (Kotlin: texto libre, sin cierre). | Implementar: votar exige `state == PROPUESTO` y `now < votingDeadline`. Validar al crear que sea ISO y futuro (`400`). El cliente usa un selector de fecha y hora en vez de texto libre. |
| C2 | `POST /proposals/:id/confirm` (+ `chosenWindowId`, «gana la más votada»). En Kotlin no hay transición `PROPUESTO → CONFIRMADO`. | Implementar. Desempate de «la más votada»: mayor `voteCount`, luego mayor `availabilityPercentage`, luego el orden de la ventana (día, hora). Sin votos y sin `windowId` → `409 NO_VOTES`. `upcomingEvent` debe usar `chosenWindowId`, no la primera ventana. |
| C3 | `POST /proposals/:id/cancel` (solo el creador). | Implementar; Kotlin solo cancela vía votación exprés. |
| C4 | `POST /proposals/:id/incidences` (reportar). Kotlin no tiene UI ni función para crearlas. | Implementar: solo miembros, solo en `CONFIRMADO` (o `EN_RECOORDINACION`); `reason` obligatorio; `delayMinutes` obligatorio y > 0 si `TARDANZA`, `null` en otro caso. |
| C5 | Si `windows` vacío → «las 3 mejores franjas» (Kotlin propone **todas** las de la semana). | Definir «mejores»: ordenar las de `/availability` por `availabilityPercentage` desc, luego duración desc, luego día y hora asc; tomar 3. Actualizar `api.md` con este criterio. |
| C6 | `DELETE /proposals/:id/vote`, `PATCH /groups/:id`, `PATCH /groups/:id/members/:userId` (`isEssential`), `DELETE /groups/:id/members/me`, `GET /groups/:id`, `GET /auth/me`, `GET /health`, `POST /me/time-blocks/bulk`. | Nuevos; sin lógica Kotlin que replicar. Reglas: solo `OWNER` para los PATCH; `availabilityThreshold` entero 0–100. Al salir el último `OWNER`, promover al miembro más antiguo (a decidir). |
| C7 | Roles `OWNER/MEMBER`. | El creador del grupo es `OWNER`; al unirse, `MEMBER`. |
| C8 | Contraseña «min 8 caracteres» (Kotlin: 6) y `409 EMAIL_TAKEN` (Kotlin: el registro nunca falla). | Adoptar 8 en backend y cliente (mensaje «Mínimo 8 caracteres»). Email normalizado (`trim().toLowerCase()`) y validado con la regex de §2.1. Nombre obligatorio tras trim. |
| C9 | `422 AI_UNREADABLE` (Kotlin: nunca falla, devuelve el mock). | Ver §4, propuesta. |
| C10 | `GET /groups/:id/proposals` «más recientes primero» (Kotlin: orden de inserción). | Ordenar por `createdAt` desc; añadir `createdAt` a `Proposal` en `shared` para que sea visible. |
| C11 | `GET /me/upcoming-plans` «con fecha futura, ordenadas». Una ventana solo tiene `dayOfWeek` + hora, no fecha. | Definir la fecha del plan = siguiente ocurrencia del `dayOfWeek` de la `chosenWindow` a partir de la confirmación (o guardar `scheduledAt` al confirmar). Ordenar por esa fecha asc. |

---

## 6. Errores e incoherencias detectadas

| # | Dónde | Problema | Consecuencia / resolución |
|---|---|---|---|
| B1 | `AuthRepositoryImpl.kt:20` vs `ScheduleRepositoryImpl.kt:15-16` y `ScheduleViewModel.kt:55` | El usuario logueado es `mock_123`, pero los bloques propios se guardan con `userId = "user_1"`. | El matcher ignoraría los bloques propios; `GroupPlanningViewModel.kt:76` lo parchea reasignando `userId`. Backend: `userId` siempre del token (ya previsto en `api.md`). |
| B2 | `AuthRepositoryImpl.kt:33` vs `GroupRepositoryImpl.kt:16,24,37,60` | Un usuario registrado recibe `mock_<ts>`, pero los grupos usan un `currentUser` fijo `mock_123`/`test@test.com`. | Tras registrarse, sus bloques no casan con ningún miembro (el matcher lo trata como ausente, y a `mock_123` como libre). Resuelto por el backend con usuarios reales. |
| B3 | `AuthRepositoryImpl.kt:21-22` vs `GroupRepositoryImpl.kt:16` | Login devuelve el email tecleado; el miembro del grupo tiene `test@test.com`. | Los votos (por email) y la etiqueta «Tú» (`DashboardViewModel.kt:232`) fallan si se entra con otro email. Votos por id de usuario en el backend. |
| B4 | `AuthRepositoryImpl.kt:15-29` | Login acepta cualquier email con «@» y contraseña ≥ 6; ignora el registro y siempre devuelve «Usuario de Prueba». | Implementar credenciales reales (hash) en el backend. |
| B5 | `LoginScreen.kt:100`, `RegisterScreen.kt:103` | Mínimo 6 caracteres vs 8 del contrato. | Ver C8. |
| B6 | `GroupPlanningViewModel.kt:58,202` | Las propuestas creadas viven solo en `_localProposals` del VM: el Dashboard (que lee el repositorio) no las ve y se pierden al reiniciar. | Persistir en backend. |
| B7 | `GroupPlanningViewModel.kt:79` con `:130-133` y `:142-160` | `distinctBy` conserva la versión del **repositorio**; `addSuggestedWindow` sobre una propuesta semilla (p. ej. `prop_2`) guarda una copia local que queda **oculta**, y los votos posteriores a esa propuesta se aplican a la copia oculta. Resultado: la franja añadida no aparece y los votos parecen no registrarse (aunque sale el toast). | En RN no replicar: una sola fuente de verdad (servidor), ver G2. |
| B8 | `DashboardViewModel.kt:144`, `GroupPlanningViewModel.kt:159,166` | El toast «Tu voto ha sido registrado.» sale también cuando la acción retira el voto (toggle) o cuando el repositorio no cambia nada. | Cliente: mensaje distinto al retirar («Tu voto se ha retirado.» — texto nuevo a validar). |
| B9 | `GroupPlanningViewModel.kt:83` | `votingCalls` se lee de `_votingCalls.value` dentro del `combine` pero `_votingCalls` no es una entrada del `combine`: el estado solo se actualiza porque el toast posterior dispara la recombinación. | Irrelevante para el backend; en el cliente, estado reactivo normal. |
| B10 | `GroupPlanningViewModel.kt:208` | `votingCallsOf` filtra por `id.startsWith(groupId)`: el grupo `g1` también ve las llamadas de `g10`, `g11`… | Filtrar por un campo `groupId` explícito. |
| B11 | `GroupPlanningViewModel.kt:137-168`, `PlanRepositoryImpl.kt:46-69`, `DashboardViewModel.kt:139-146` | Votar no comprueba estado ni plazo: se puede votar un plan `CONFIRMADO` (p. ej. desde un llamado a `prop_1`) o `EN_RECOORDINACION`. `createVotingCall` también acepta propuestas no `PROPUESTO`. | Backend: `409 VOTING_CLOSED` (C1). |
| B12 | `MyScheduleScreen.kt:81,141`, `DashboardViewModel.kt:120`, `AvailabilityMatcher.kt:35` | Los bloques puntuales (`dayOfWeek=null`) no aparecen en «Mi horario», ni en «hoy», ni cuentan en el cruce, pero sí en `totalBlocks`. No se guarda su fecha. | `date` del contrato; mostrarlos por fecha; ver G13. |
| B13 | `OcrViewModel.kt:50-53`, `OcrReviewScreen.kt:181`, `HueckoNavigation.kt:224` | Gson crea `TimeBlock` con `id=null`, `userId=null`, `isRecurring=false` (aunque tengan `dayOfWeek`) y `type=null`. Todos los bloques OCR comparten `id` nulo: la `LazyColumn` con `key = { it.id }` probablemente falla por claves duplicadas/nulas, y borrar uno por id borraría todos. | El backend asigna ids y normaliza (`isRecurring=true`, `type=CLASE`) en `/ai/schedule-ocr` y `/me/time-blocks/bulk`. |
| B14 | `AvailabilityMatcher.kt:35-41` | Los bloques `type = LIBRE` cuentan como ocupados. | Excluir `LIBRE` del cruce (G13). Añadir test. |
| B15 | `PlanRepositoryImpl.kt:136-138` | Los porcentajes de la semilla de `prop_2` no casan con el matcher: `w_23` (VIE 16–18) figura con 50 % cuando el cruce da 100 %; `w_22` (JUE 10–12) y `w_21` sí dan 100 %. | En la semilla del backend, recalcular con el matcher o dejar constancia de que son datos fijos. |
| B16 | `DashboardViewModel.kt:193-200` | `matchingHours` suma ventanas de propuestas en **cualquier estado** (incluidas canceladas), usa el 80 fijo y no el umbral del grupo, trunca minutos y no deduplica solapes. | Propuesta: contar solo `PROPUESTO`/`CONFIRMADO` (no canceladas), deduplicar por (día, hora). Decidir con el equipo; documentar la fórmula elegida. |
| B17 | `DashboardViewModel.kt:207-209` | «Próximo plan» = primera propuesta `CONFIRMADO` en orden de inserción y su **primera** ventana, sin fecha ni ventana elegida. | Usar `chosenWindowId` y la fecha (C2, C11). |
| B18 | `DashboardViewModel.kt:183` | Sin propuestas, `matchPercentage` muestra el **umbral** del grupo (80 %) como si fuese coincidencia real. | Mostrar «—» o calcular el mejor % real de `/availability`. |
| B19 | `DashboardViewModel.kt:248-252` | La alerta exprés solo muestra la primera incidencia no resuelta de la primera propuesta; ignora criticidad e `isEssential` (el comentario de `Models.kt:23` dice que la dispara la ausencia de un imprescindible). | Ver G5. |
| B20 | `DashboardViewModel.kt:152-161` | La votación exprés es unilateral: el primer usuario que pulsa decide para todo el grupo, sin permisos. | Contrato: solo el creador resuelve (`/incidences/resolve`). Si se quiere votación real, añadir endpoint de voto exprés (fuera de alcance). |
| B21 | `ScheduleViewModel.kt:50-66` | El VM no valida (la validación solo está en la pantalla), llama `onSuccess()` aunque el guardado falle y no reinicia el formulario (al volver se ven los valores anteriores). | Backend valida (400); cliente reinicia el formulario tras guardar con éxito. |
| B22 | `ScheduleViewModel.kt:53-61` | Los bloques creados siempre son `type = CLASE`, también los puntuales. | Ver G12. |
| B23 | `GroupPlanningViewModel.kt:174-177`, `GroupDetailScreen.kt:461` | El VM solo exige título; la pantalla también exige plazo. `votingDeadline` es texto libre sin validar. El texto de error no lleva tildes («El titulo no puede estar vacio.»). | Backend: `title` obligatorio (trim, 400) y `votingDeadline` ISO futuro. Cliente: corregir a «El título no puede estar vacío.». |
| B24 | `GroupPlanningViewModel.kt:106-120`, `VotingScreen.kt:386` | `addSuggestedWindow` no valida formato ni orden de horas y pone `availabilityPercentage = 0`. | Ver G2. |
| B25 | `GroupRepositoryImpl.kt:36` | `inviteCode` puede colisionar y, con nombres cortos o con espacios/tildes, sale raro (`"Yo"` → `"YO123"`, `"Año 1"` → `"AÑO456"`). | Ver G11. |
| B26 | `GroupViewModel.kt:34,50` | Nombre/código en blanco → la función no hace nada, sin mensaje (el botón ya está deshabilitado); el nombre no se recorta. | Backend: `name` obligatorio tras trim (400). |
| B27 | `GeminiService.kt:17` | `gemini-1.5-flash` está retirado; además cualquier error se enmascara con datos falsos. | Ver §4, propuesta. |
| B28 | `GroupPlanningViewModel.kt:170` | `notifyCodeCopied` nunca se invoca (código muerto). `Plan` (`Models.kt:69`) tampoco se usa. | Descartar. |
| B29 | `DashboardViewModel.kt:120`, `MyScheduleScreen.kt:82` | «Horario de hoy» no se ordena; «Mi horario» ordena por `startTime` como texto (funciona solo porque el formato es `HH:mm` con cero a la izquierda). | Backend/cliente: ordenar por `startTime` validado; exigir `HH:mm` con dos dígitos. |
