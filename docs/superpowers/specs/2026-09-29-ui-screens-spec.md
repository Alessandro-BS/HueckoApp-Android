# Especificación de UI — HueckoApp (Android legacy → React Native)

- **Fecha:** 2026-09-29
- **Fuente:** `legacy-android/app/src/main/java/com/example/hueckoapp/` (`MainActivity.kt`, `ui/**`)
- **Objetivo:** documentar cada pantalla, diálogo, componente y token visual de la app Kotlin + Jetpack Compose para reimplementarla de forma fiel en React Native (Expo). Todo el copy se reproduce **literalmente**, incluidas las faltas de tildes del original (se señalan con ⚠️ en la sección 7).
- **Convenciones de este documento:**
  - Tamaños en `dp` (equivalen a unidades independientes de densidad de RN). Tipografía en `sp` (en RN, `fontSize` sin escalado adicional).
  - Colores por **token** (`primary`, `onSurfaceVariant`, `surfaceContainerLowest`…). Los valores hex están en `ui/theme/Color.kt` (ver §4.4 para la tabla de mapeo).
  - Tipografía por **estilo** (`headlineLarge`, `bodySmall`…), definidos en §4.1.
  - Radios por token `HueckoRadius.*` (§4.2).
  - "VM" = ViewModel. Los nombres de campos de estado son los del código Kotlin.

---

## 0. Arranque y marco global

| Aspecto | Comportamiento |
|---|---|
| Actividad | `MainActivity` monta `HueckoAppTheme { Surface(fillMaxSize, color = background) { HueckoNavigation() } }`. |
| Tema | Sólo esquema **claro**. Color dinámico (Android 12+) deshabilitado a propósito. No hay modo oscuro. |
| Barras del sistema | Status bar color = `surface` (#FEF7FF) con iconos oscuros; navigation bar color = `surfaceContainer` (#F3EDF7) con iconos oscuros. La app **no** es edge-to-edge (no llama a `enableEdgeToEdge`). |
| Estado global | Todos los repositorios y VMs se instancian **una sola vez** en `HueckoNavigation` (`remember`) y se comparten entre pantallas: `AuthViewModel`, `ScheduleViewModel`, `GroupViewModel`, `OcrViewModel`, `DashboardViewModel`, `GroupPlanningViewModel`. En RN esto equivale a stores globales (Zustand/Context), no a estado por pantalla. |
| Scaffold raíz | Un `Scaffold` envuelve el `NavHost`; su `bottomBar` es `HueckoBottomBar` sólo cuando la ruta actual coincide **exactamente** con una de las 4 pestañas. El contenido recibe `padding(innerPadding)` (deja hueco para la barra inferior). |
| Datos | Todos los repositorios son **mocks en memoria** (ver §8). |

---

## 1. Mapa de navegación

### 1.1 Rutas

| Ruta (patrón) | Constante | Argumentos | Pantalla | Barra inferior |
|---|---|---|---|---|
| `login` | `Routes.LOGIN` | — | `LoginScreen` | Oculta |
| `register` | `Routes.REGISTER` | — | `RegisterScreen` | Oculta |
| `dashboard` | `HueckoDestination.DASHBOARD` | — | `DashboardScreen` | **Visible** (pestaña Inicio) |
| `my_schedule` | `HueckoDestination.SCHEDULE` | — | `MyScheduleScreen` | **Visible** (pestaña Horario) |
| `groups` | `HueckoDestination.GROUPS` | — | `GroupListScreen` | **Visible** (pestaña Grupos) |
| `profile` | `HueckoDestination.PROFILE` | — | `ProfileScreen` | **Visible** (pestaña Perfil) |
| `group_detail/{groupId}` | `Routes.GROUP_DETAIL` | `groupId: string` | `GroupDetailScreen` | Oculta |
| `voting/{proposalId}/{groupId}` | `Routes.VOTING` | `proposalId: string`, `groupId: string` | `VotingScreen` | Oculta |
| `plan_detail/{proposalId}` | `Routes.PLAN_DETAIL` | `proposalId: string` | `PlanDetailScreen` | Oculta |
| `add_schedule` | `Routes.ADD_SCHEDULE` | — | `AddScheduleScreen` | Oculta |
| `ocr_review/{uri}` | `Routes.OCR_REVIEW` | `uri: string` (URI de la imagen, **URL-encoded UTF-8** al navegar y decodificado al leer) | `OcrReviewScreen` | Oculta |

- **Destino inicial:** `login`. No hay persistencia de sesión: cada arranque empieza en Login.
- Los argumentos ausentes se leen como cadena vacía (`orEmpty()`), lo que provoca los estados "no encontrado" de cada pantalla.

### 1.2 Barra inferior (tabs)

Orden de izquierda a derecha (enum `HueckoDestination`):

| # | Ruta | Etiqueta | Icono Material (Outlined) | MaterialIcons (@expo/vector-icons) |
|---|---|---|---|---|
| 1 | `dashboard` | **Inicio** | `Icons.Outlined.Dashboard` | `dashboard` (variante outline: MaterialCommunityIcons `view-dashboard-outline`) |
| 2 | `my_schedule` | **Horario** | `Icons.Outlined.CalendarMonth` | `calendar-month` (MCI `calendar-month-outline`) |
| 3 | `groups` | **Grupos** | `Icons.Outlined.Group` | `group` (MCI `account-multiple-outline`) |
| 4 | `profile` | **Perfil** | `Icons.Outlined.Person` | `person-outline` |

- Visible **sólo** en `dashboard`, `my_schedule`, `groups`, `profile`. Oculta en todas las demás (login, registro, detalle de grupo, votación, detalle de plan, nuevo bloque, revisión OCR). Justificación del código: en formularios a pantalla completa la barra "invitaría a abandonar lo que se está rellenando".
- Las pestañas no tienen `contentDescription` en el icono (la etiqueta de texto hace de nombre accesible).
- Aspecto: ver `HueckoBottomBar` en §3.

### 1.3 Navegación entre pestañas (`navigateToTab`)

Cada salto a pestaña (desde la barra o desde acciones del Dashboard) hace:

- `navigate(tab.route)` con `popUpTo("dashboard") { saveState = true }`, `launchSingleTop = true`, `restoreState = true`.
- Efecto: la pila queda como `dashboard → <tab>` (nunca se apilan copias); se guarda/restaura el estado (scroll, etc.) de cada pestaña. El ancla es `dashboard` y no la raíz porque `login` desaparece tras autenticarse.
- Atrás del sistema desde cualquier pestaña distinta de Inicio → vuelve a Inicio; desde Inicio → sale de la app.
- **Equivalente RN:** Bottom Tabs navigator con Inicio como tab inicial y `backBehavior="initialRoute"`; cada tab con su propio stack o con pantallas modales/stack por encima que ocultan la barra.

### 1.4 Transiciones (acción → destino → efecto en pila)

| Origen | Acción | Destino | Pila / notas |
|---|---|---|---|
| Login | Login OK (`isLoggedIn` pasa a `true`) | `dashboard` | `popUpTo("login") { inclusive = true }` — Login sale de la pila. Antes llama a `dashboardViewModel.showWelcomeToast()`. |
| Login | Pulsar "Regístrate" | `register` | push |
| Register | Flecha atrás o "Inicia sesión" | Login | `popBackStack()` |
| Register | Registro OK (`isLoggedIn` → `true`) | `dashboard` | `popUpTo("login") { inclusive = true }` + `showWelcomeToast()` |
| Dashboard | Tarjeta métrica "Grupos activos" / "Votaciones abiertas"; "Ir a mis grupos"; "Ver grupos"; "Gestionar"; "Nuevo grupo" | `groups` | `navigateToTab` |
| Dashboard | Tarjeta métrica "Horas coincidentes" / "Mi horario"; "Ver todo"; "Editar horario" | `my_schedule` | `navigateToTab` |
| GroupList | Pulsar tarjeta de grupo | `group_detail/{id}` | push |
| GroupDetail | Flecha atrás | anterior | `popBackStack()` |
| GroupDetail | "Ir a votar" en una llamada | `voting/{planId}/{groupId}` | push |
| GroupDetail | "Ver detalles" en un plan | `plan_detail/{proposalId}` | push |
| PlanDetail | "Ir a votar" | `voting/{proposalId}/{proposal.groupId}` | push (puede quedar `… → plan_detail → voting`) |
| PlanDetail / Voting | Flecha atrás | anterior | `popBackStack()` |
| MySchedule | "Añadir bloque" / acciones de estado vacío | `add_schedule` | push |
| MySchedule | "Escanear" → selector de fotos del sistema (sólo imágenes) → imagen elegida | `ocr_review/{encodedUri}` | push. Si el usuario cancela el selector no pasa nada. |
| AddSchedule | Flecha atrás | anterior | `popBackStack()` |
| AddSchedule | "Guardar bloque" (tras guardar) | anterior | `onBack` = `popBackStack()` |
| OcrReview | Flecha atrás / "Descartar" / "Volver" (error o sin bloques) | anterior | `popBackStack()` |
| OcrReview | "Añadir a mi horario" | `my_schedule` | Añade cada bloque al `ScheduleRepository` y luego `navigate("my_schedule") { popUpTo("my_schedule") { inclusive = true } }` → reemplaza la entrada de Horario y descarta `add/ocr`. |
| Profile | "Cerrar sesión" → `isLoggedIn` pasa a `false` | `login` | `popUpTo("dashboard") { inclusive = true }` → pila vacía salvo Login. |

---

## 2. Pantallas

> En todas las pantallas: fondo `surface` (#FEF7FF) salvo que se indique otra cosa. Padding horizontal estándar 16 dp (auth: 20 dp).

### 2.1 Login (`ui/auth/LoginScreen.kt`)

**VM:** `AuthViewModel` (compartido con Register y Profile).
**Estado leído:** `email`, `password`, `isLoading`, `errorMessage` (→ `serverError`), `isLoggedIn`.
**Estado local:** `showPassword` (bool, false), `emailError`, `passwordError` (string | null).

**Contenedor:** columna scrollable, `fillMaxSize`, fondo `surface`, respeta status/nav bar e IME (teclado), padding 20 dp horizontal / 32 dp vertical, contenido centrado horizontalmente.

**Layout (arriba → abajo):**

1. **BrandMark** (fila ancho completo, `gap 14`, centrada verticalmente):
   - Cuadrado 52×52 dp, fondo `primary`, radio `xxl` (12 dp). Dentro letra **"H"** 26 sp Bold, color `onPrimary`, centrada.
   - Columna (flex 1):
     - **"Huecko"** — `headlineMedium`, `onSurface`.
     - **"Coordinar horarios sin discutirlo en el grupo"** — `bodySmall`, `onSurfaceVariant`.
2. Espacio 32.
3. **Tarjeta formulario**: ancho completo, radio `card` (24 dp), fondo `surfaceContainerLowest` (#FFFFFF), borde 1 dp `outlineVariant`, padding interno 24.
   1. **"Bienvenido de vuelta"** — `headlineMedium`, `onSurface`.
   2. Espacio 6. **"Inicia sesión para coordinar horarios con tu grupo."** — `bodyMedium`, `onSurfaceVariant`.
   3. Espacio 24. Label **"Correo electrónico"** (`labelMedium`, `onSurfaceVariant`). Espacio 6.
   4. Campo email (ver "HueckoTextField" abajo): placeholder **"tucorreo@ejemplo.com"**, icono inicial `Mail` (outlined), teclado email, acción IME "Siguiente".
   5. Espacio 18. Label **"Contraseña"**. Espacio 6.
   6. Campo contraseña: placeholder **"Al menos 6 caracteres"**, icono inicial `Lock` (outlined), teclado password, acción IME "Hecho", texto oculto salvo `showPassword`. Icono final: botón (área táctil 48 dp) con `Visibility` (cuando oculto) o `VisibilityOff` (cuando visible), tint `onSurfaceVariant`, a11y **"Mostrar contraseña"** / **"Ocultar contraseña"**. Alterna `showPassword`.
   7. **Banner de error del servidor** (animado, aparece/desaparece con `AnimatedVisibility` — expand+fade por defecto) si `errorMessage != null`: espacio 16 + `ErrorBanner` (ver abajo) con el texto de `errorMessage`.
   8. Espacio 24. **Botón principal** ancho completo, alto 52 dp, radio `xxl`, fondo `primary`, texto `onPrimary`, **sin elevación**, deshabilitado mientras `isLoading`:
      - Normal: **"Iniciar sesión"** (`labelLarge`).
      - Cargando: spinner 18 dp (trazo 2 dp, color `onPrimary`) + espacio 10 + **"Iniciando sesión…"** (con carácter elipsis `…`).
      - Deshabilitado: colores por defecto de M3 (contenedor `onSurface` 12 % alfa, contenido `onSurface` 38 % alfa).
   9. Espacio 8. Fila centrada: **"¿No tienes cuenta?"** (`bodyMedium`, `onSurfaceVariant`) + botón de texto **"Regístrate"** (`bodyMedium` en **Bold**, color `primary`; deshabilitado mientras `isLoading`).
4. Espacio 20. **Nota de desarrollo** (fuera de la tarjeta, padding horizontal 8): **"Mientras no haya servidor, entra cualquier correo con formato válido y una contraseña de 6 caracteres o más."** — `bodySmall`, `onSurfaceVariant`, alineado a la izquierda.

**HueckoTextField (privado, idéntico en Register como `RegisterField`):**
- `OutlinedTextField` de una línea, ancho completo, radio `xxl` (12 dp), fondo transparente en todos los estados.
- Borde: no enfocado `outlineVariant` (1 dp), enfocado `primary` (2 dp, por defecto M3), error `error`.
- Cursor `primary`. Texto `bodyLarge`. Placeholder `bodyMedium` color `outline`.
- Icono inicial 20 dp, tint `onSurfaceVariant`, decorativo (sin a11y).
- Mensaje de error como *supporting text* bajo el campo (estilo `bodySmall` M3 por defecto, color `error`) — debe ir asociado accesiblemente al campo.
- Alto mínimo M3 del campo: 56 dp.

**ErrorBanner (privado):** superficie ancho completo, radio `xxl`, fondo `errorContainer`; fila padding 12, gap 8: icono `ErrorOutline` (filled) 18 dp tint `onErrorContainer` + texto `bodySmall` `onErrorContainer`.

**Validación (cliente, al pulsar el botón — no en tiempo real):**

| Campo | Regla | Mensaje |
|---|---|---|
| Correo | vacío/solo espacios | **"El correo es requerido"** |
| Correo | no cumple `^[^@\s]+@[^@\s]+\.[^@\s]+$` (sobre el valor con `trim`) | **"Ingresa un correo válido"** |
| Contraseña | vacía/solo espacios | **"La contraseña es requerida"** |
| Contraseña | longitud < 6 | **"Mínimo 6 caracteres"** |

- Se validan ambos campos a la vez; si los dos son válidos → `viewModel.login()`.
- Editar un campo borra **su** error de cliente inmediatamente (`emailError = null` / `passwordError = null`) y llama a `onEmailChange` / `onPasswordChange`.
- El error de servidor (`errorMessage`) sólo se limpia al reintentar (`login()` lo pone a `null` al empezar).

**Acciones:**
- `login()`: `isLoading=true`, `errorMessage=null`, llama al repositorio (mock: 1,5 s de retardo; OK si el email contiene "@" y la contraseña ≥ 6; si no, error **"Credenciales inválidas"**). OK → `isLoggedIn=true`. Error → `errorMessage = mensaje`. Finalmente `isLoading=false`.
- Efecto: cuando `isLoggedIn` es `true` → `onLoginSuccess()` (ver §1.4). Se dispara en un efecto (no durante el render) para no navegar dos veces.

### 2.2 Register (`ui/auth/RegisterScreen.kt`)

**VM:** `AuthViewModel`. **Estado:** `name`, `email`, `password`, `isLoading`, `errorMessage`, `isLoggedIn`. Local: `showPassword`, `nameError`, `emailError`, `passwordError`.

**Contenedor:** columna scrollable, fondo `surface`, respeta barras e IME, padding 20 horizontal / **20** vertical, alineación **izquierda** (no centrada).

**Layout:**

1. Botón icono (48 dp) `ArrowBack` (auto-mirrored, outlined), tint `onSurface`, a11y **"Volver al inicio de sesión"** → `onNavigateToLogin` (pop).
2. Espacio 12. **"Crear cuenta"** — `headlineLarge`, `onSurface`.
3. Espacio 6. **"Necesitas una cuenta para compartir tu disponibilidad con un grupo."** — `bodyMedium`, `onSurfaceVariant`.
4. Espacio 24. **Tarjeta formulario** (idéntica a Login: radio 24, `surfaceContainerLowest`, borde 1 dp `outlineVariant`, padding 24):
   1. Label **"Nombre completo"**; espacio 6; campo placeholder **"Ana Pérez"**, icono `Person` (outlined), IME "Siguiente", teclado texto.
   2. Espacio 18. Label **"Correo electrónico"**; campo **"tucorreo@ejemplo.com"**, icono `Mail`, teclado email, IME "Siguiente".
   3. Espacio 18. Label **"Contraseña"**; campo **"Al menos 6 caracteres"**, icono `Lock`, password, IME "Hecho", toggle de visibilidad idéntico a Login (a11y "Mostrar contraseña" / "Ocultar contraseña").
   4. Banner de error animado idéntico a Login si `errorMessage != null`.
   5. Espacio 24. Botón principal 52 dp (mismo estilo): **"Registrarme"** / cargando: spinner + **"Creando cuenta…"**.
   6. Espacio 8. Fila centrada: **"¿Ya tienes cuenta?"** + botón texto Bold **"Inicia sesión"** (→ pop a Login; deshabilitado con `isLoading`).

**Validación (al pulsar):**

| Campo | Regla | Mensaje |
|---|---|---|
| Nombre | vacío/solo espacios | **"El nombre es requerido"** |
| Correo | vacío | **"El correo es requerido"** |
| Correo | regex anterior | **"Ingresa un correo válido"** |
| Contraseña | vacía | **"La contraseña es requerida"** |
| Contraseña | < 6 | **"Mínimo 6 caracteres"** |

- Todo válido → `viewModel.register()`. Mock: 1,5 s, siempre éxito, crea usuario con el nombre/email dados.
- Editar cada campo limpia su error y llama a `onNameChange` / `onEmailChange` / `onPasswordChange`.
- Efecto: `isLoggedIn == true` → `onRegisterSuccess()` (Dashboard + toast de bienvenida).
- Nota: Login y Register comparten los mismos campos `email`/`password` del VM → lo escrito en uno aparece en el otro.

### 2.3 Dashboard / Inicio (`ui/dashboard/DashboardScreen.kt`)

**VM:** `DashboardViewModel.uiState: DashboardUiState` (derivado de auth + grupos + horario + planes). Campos: `greeting`, `name`, `longDate`, `today` (DayOfWeek), `todayBlocks`, `activeGroups`, `openVotes`, `matchingHours`, `totalBlocks`, `upcomingEvent`, `groups: GroupSummary[]`, `pendingVotes: PendingVote[]`, `expressAlert`, `expressChoice`, `userEmail`, `toast`.

**Contenedor:** `Box` a pantalla completa con una lista vertical (FlatList/ScrollView) fondo `surface`, padding 16 horizontal / 20 vertical, **separación 24 dp** entre ítems; y un Snackbar superpuesto abajo.

**Ítems en orden:**

1. **GreetingHeader**
   - `longDate` — `bodySmall`, `onSurfaceVariant`. Formato fijo en español: `"<Día>, <n> de <mes>"`, p. ej. **"Martes, 29 de septiembre"** (días: Domingo, Lunes, Martes, Miércoles, Jueves, Viernes, Sábado; meses en minúscula: enero … diciembre).
   - Espacio 4. Saludo — `headlineLarge`, `onSurface`: `"<greeting>, <name>"`, o sólo `greeting` si `name` está vacío. `greeting`: hora 0–11 → **"Buenos días"**, 12–18 → **"Buenas tardes"**, 19–23 → **"Buenas noches"**. `name` = primera palabra del nombre del usuario.
   - Espacio 6. **"Esto es lo que pasa hoy en tus grupos y horarios."** — `bodyMedium`, `onSurfaceVariant`.

2. **ExpressVoteCard** (sólo si `expressAlert != null`; aparece cuando existe una propuesta `CONFIRMADO` con alguna incidencia no resuelta):
   - Superficie ancho completo, radio 24, fondo `warningContainer`, borde 1 dp `warning` al 35 % de opacidad, padding 18.
   - **"Votación exprés"** — `labelMedium`, `onWarningContainer`.
   - Espacio 8. `"<who> no podrá asistir a «<planTitle>»"` — `titleMedium`, `onSurface` (comillas angulares « »).
   - Espacio 4. `reason` — `bodySmall`, `onWarningContainer`.
   - Espacio 16. Fila de 3 botones (gap 8, cada uno flex 1, alto 48, radio `xxl`), en orden: **"Reprogramar"**, **"Cancelar"**, **"Mantener"**.
     - No seleccionado: fondo `surfaceContainerLowest`, borde 1 dp `outlineVariant`, texto `labelMedium` `onSurface`.
     - Seleccionado (`expressChoice == choice`): fondo `primary`, sin borde, texto `onPrimary`.
   - Pulsar → `viewModel.submitExpressVote(choice)`: marca la elección, muestra toast **"Votación exprés registrada: <label en minúsculas>."** (p. ej. "Votación exprés registrada: reprogramar."), espera 1,5 s y resuelve incidencias con el nuevo estado (Reprogramar → `PROPUESTO` y borra votos; Cancelar → `CANCELADO`; Mantener → `CONFIRMADO`); la tarjeta desaparece al quedar sin incidencias abiertas; `expressChoice` vuelve a `null`.

3. **MetricsGrid**: 2 filas × 2 columnas (gap 12 vertical y horizontal, cada tarjeta flex 1). Cada `MetricCard` = `HueckoCard` pulsable con padding 16:
   - Icono 20 dp tint `primary` → espacio 12 → valor `displaySmall` `onSurface` → label `titleSmall` `onSurface` → espacio 2 → caption `bodySmall` `onSurfaceVariant`.

   | Pos. | Label | Valor | Caption | Icono | Al pulsar |
   |---|---|---|---|---|---|
   | fila 1 izq. | **"Grupos activos"** | `activeGroups` | **"Con disponibilidad sincronizada"** | `Groups` | → pestaña Grupos |
   | fila 1 der. | **"Votaciones abiertas"** | `openVotes` | **"Planes pendientes de hora"** | `HowToVote` | → pestaña Grupos |
   | fila 2 izq. | **"Horas coincidentes"** | `"<matchingHours> h"` | **"Donde coincide el 80% o más"** | `Schedule` | → pestaña Horario |
   | fila 2 der. | **"Mi horario"** | `totalBlocks` | **"Bloques registrados"** | `CalendarMonth` | → pestaña Horario |

   - `matchingHours` = suma de (horaFin − horaInicio, en horas enteras) de todas las ventanas sugeridas con `availabilityPercentage ≥ 80`.
   - `openVotes` = nº de propuestas en estado `PROPUESTO`.

4. **Sección "Próximo plan confirmado"** (columna gap 12):
   - `SectionHeader(title = "Próximo plan confirmado")`.
   - Si `upcomingEvent != null` → **UpcomingPlanCard** (`HueckoCard` fondo y borde `primaryContainer`, padding 20):
     - `"<dayLabel> · <timeRange>"` (p. ej. "Mié · 11:00 - 13:00") — `labelMedium`, `onPrimaryContainer`.
     - Espacio 6. `title` — `headlineSmall`, `onPrimaryContainer`.
     - Espacio 12. Fila icono+texto: `Place` 16 dp + `location` (`bodyMedium`), color `onPrimaryContainer`, gap 8. Si la propuesta no tiene lugar: **"Lugar por definir"**.
     - Espacio 4. Fila `Groups` 16 dp + `"<n> de <total> asistirán"` (n = asistentes cuyo estado ≠ NO_ASISTE).
     - Espacio 16. Fila de hasta **6** `HueckoAvatar` (32 dp, gap 6), color `categoryColorByIndex(i)`, a11y = nombre. El usuario actual aparece como **"Tú"** (avatar "T").
   - Si no → `EmptyStateView`: título **"Sin planes confirmados"**, descripción **"Propón un plan en tus grupos y Huecko sugerirá los mejores horarios."**, icono `EventBusy`, botón **"Ir a mis grupos"** → pestaña Grupos.

5. **TodayScheduleCard** (`HueckoCard`, padding 20):
   - `SectionHeader(title = "Mi horario de hoy", actionLabel = "Ver todo")` → "Ver todo" navega a pestaña Horario.
   - Espacio 14.
   - Si `todayBlocks` vacío: fila gap 12 — icono `EventAvailable` 22 dp `primary` + columna: **"Nada en la agenda para hoy (<today.label>)"** (`titleSmall`, `onSurface`; p. ej. "Nada en la agenda para hoy (Mar)") y **"Tienes <totalBlocks> bloque(s) en la semana."** (`bodySmall`, `onSurfaceVariant`).
   - Si no: columna gap 10 con un **ScheduleBlockRow** por bloque:
     - Punto circular 10 dp color `categoryColorByIndex(index)` · columna (flex 1): `label` (`titleSmall`, `onSurface`) + `"HH:mm - HH:mm"` (`bodySmall`, `onSurfaceVariant`) · `HueckoBadge` según `block.type`:
       - `LIBRE` → **"Libre"**, `successContainer` / `onSuccessContainer`.
       - `PUNTUAL` → **"Puntual"**, `secondaryContainer` / `onSecondaryContainer`.
       - resto (`CLASE`, `TRABAJO`) → **"Ocupado"**, `surfaceContainerHigh` / `onSurfaceVariant`.
   - `todayBlocks` = bloques cuyo `dayOfWeek` coincide con el día ISO actual (lun=1 … dom=7). Los bloques puntuales (`dayOfWeek = null`) nunca aparecen aquí.

6. **MyGroupsCard** (`HueckoCard`):
   - `SectionHeader(title = "Mis grupos", actionLabel = "Gestionar")` → pestaña Grupos.
   - Espacio 14.
   - Vacío: **"Todavía no perteneces a ningún grupo."** (`bodyMedium`, `onSurfaceVariant`).
   - Si no: columna gap 14; por grupo, fila gap 12: `HueckoAvatar` 40 dp color `categoryColorByIndex(index)` (inicial del grupo) · columna flex 1: nombre (`titleSmall`, `onSurface`) + `"<memberCount> miembros · <nextSlot>"` (`bodySmall`, `onSurfaceVariant`; siempre "miembros" en plural) · `HueckoBadge` `"<matchPercentage>%"` (`primaryContainer` / `onPrimaryContainer`).
   - `nextSlot` = `"<Día> <HH:mm - HH:mm>"` de la primera ventana de la primera propuesta no cancelada del grupo, o **"Sin propuesta aún"**. `matchPercentage` = % de esa ventana o, si no hay, el umbral del grupo (80).
   - Las filas de grupo **no** son pulsables.

7. **SectionHeader** título **"Votaciones en curso"**, subtítulo **"Opciones generadas a partir de la disponibilidad del grupo."**

8. Si `pendingVotes` vacío → `EmptyStateView`: **"No hay votaciones activas"** / **"Cuando alguien proponga un plan podrás elegir aquí tu franja preferida."** / icono `HowToVote` / botón **"Ver grupos"** → pestaña Grupos.
   Si no → un **PendingVoteCard** por votación (clave `proposal.id`), cada una un ítem de la lista:
   - `HueckoCard`: `groupName` (`labelMedium`, `primary`; fallback **"Grupo"**) → espacio 4 → `proposal.title` (`titleLarge`, `onSurface`) → espacio 2 → `votingDeadline` (`bodySmall`, `onSurfaceVariant`) → espacio 16 → columna gap 8 de **VoteWindowRow (Dashboard)**:
     - Superficie pulsable ancho completo, radio `xxl`. No votada: fondo `surface`, borde 1 dp `outlineVariant`. Votada: fondo `primaryContainer`, borde **2 dp** `primary`.
     - Fila padding 14 h / 12 v, gap 12: hueco fijo 20×20 con icono `Check` 20 dp `primary` (a11y **"Tu voto"**) sólo si votada · columna flex 1: `"<Día> · <HH:mm - HH:mm>"` (`titleSmall`, `onSurface`) + `"<n>% del grupo disponible"` (`bodySmall`, `onSurfaceVariant`) · texto `"<n> voto"` / `"<n> votos"` (singular sólo si n = 1) `labelMedium` `onSurfaceVariant` (sin cápsula, a diferencia de Voting).
     - Pulsar → `viewModel.vote(proposalId, windowId)` → toast **"Tu voto ha sido registrado."**. Semántica: un voto por propuesta; pulsar otra ventana mueve el voto; pulsar la ya votada **retira** el voto (toggle). Si no hay email de usuario, no hace nada.

9. **QuickActions**: fila gap 10, dos botones flex 1: `SecondaryAction` **"Nuevo grupo"** (icono `GroupAdd`) → pestaña Grupos; `PrimaryAction` **"Editar horario"** (icono `EditCalendar`) → pestaña Horario.

**Snackbar / toast** (superpuesto, alineado abajo-centro, margen 16): visible con animación (fade+expand por defecto) cuando `toast != null`. `Snackbar` M3 con radio `xxl`, fondo `inverseSurface`, texto `bodyMedium` `inverseOnSurface`. Se oculta sola a los **3 s**. Mensajes posibles:
- **"¡Sesión iniciada con éxito! Bienvenido a HueckoApp."** (tras login/registro)
- **"Tu voto ha sido registrado."**
- **"Votación exprés registrada: reprogramar."** / **"…: cancelar."** / **"…: mantener."**

**Carga/errores:** no hay estados de carga ni de error; el estado inicial es `DashboardUiState()` vacío hasta que los flujos emiten.

### 2.4 GroupList / Mis grupos (`ui/group/GroupListScreen.kt`)

**VM:** `GroupViewModel.groups: Group[]`. Local: `showCreateDialog`, `showJoinDialog`.

**Contenedor:** lista vertical fondo `surface`, padding 16 h / 20 v, separación 12.

1. **Header**:
   - **"Mis grupos"** — `headlineLarge`, `onSurface`.
   - Espacio 6. **"Consulta a quien tienes en cada grupo y en que franjas coincideis todos."** — `bodyMedium`, `onSurfaceVariant`. ⚠️ sin tildes en el original.
   - Espacio 16. Fila gap 10: `SecondaryAction` **"Unirme"** (icono `Key`) → abre JoinGroupDialog; `PrimaryAction` **"Crear grupo"** (icono `GroupAdd`) → abre CreateGroupDialog. Ambos flex 1.
2. Si `groups` vacío → `EmptyStateView`: título **"Aun no tienes ningun grupo"**, descripción **"Crea uno para invitar a tus companeros, o unete con el codigo que te hayan pasado."**, icono `Groups`, botón **"Crear mi primer grupo"** → abre CreateGroupDialog. ⚠️ sin tildes/ñ.
3. Si no → un **GroupCard** por grupo (clave `id`):
   - `HueckoCard` pulsable, padding **0**, radio 24 (el banner queda recortado por el radio superior).
   - **Banner**: alto 100 dp, ancho completo, fondo `categoryColorByIndex(hashCode(group.name))` (ver §4.5), inicial del nombre en mayúscula centrada, `displaySmall`, color blanco `#FFFFFF`.
   - Contenido padding 16 h / 12 v: nombre (`titleMedium`, `onSurface`); si `description` no vacía: espacio 4 + descripción (`bodySmall`, `onSurfaceVariant`, máx. 2 líneas); espacio 8; `"<n> miembro"` / `"<n> miembros"` (`labelSmall`, `onSurfaceVariant`).
   - Pulsar → `group_detail/{group.id}`.

No hay estados de carga/error en la lista (la lista es un flujo en memoria).

### 2.5 Diálogos de grupo (`ui/group/GroupDialogs.kt`)

Ambos son `AlertDialog` Material 3 por defecto: radio 28 dp, fondo `surfaceContainerHigh`, título `headlineSmall` (del tema: 20 sp Bold), cuerpo `bodyMedium` `onSurfaceVariant`, botones abajo a la derecha (dismiss a la izquierda del confirm). Botón confirm = `Button` M3 relleno (`primary`, forma píldora, 40 dp de alto); dismiss = `TextButton` (`primary`).

**Cerrar:** tocar fuera / Atrás cierra **sólo si no está cargando**. El valor del campo es local al diálogo (se reinicia al reabrir). `errorMessage` del VM **no** se limpia al cerrar; se limpia al teclear.

#### CreateGroupDialog
- Título: **"Crear Nuevo Grupo"**.
- Cuerpo: `OutlinedTextField` M3 por defecto (etiqueta flotante, radio 4 dp por defecto), una línea, ancho completo, label **"Nombre del grupo"**. Al teclear: actualiza valor y `viewModel.clearError()`.
- Si `errorMessage != null`: texto `bodySmall` color `error`, margen superior 8.
- Confirm: **"Crear"**; habilitado si nombre no vacío y no `isLoading`. Cargando: spinner 16 dp (trazo 2, `onPrimary`) en lugar del texto.
- Dismiss: **"Cancelar"** (deshabilitado si `isLoading`).
- Acción: `viewModel.createGroup(name, onSuccess = onDismiss)` → `isLoading`, mock 1 s, añade grupo y cierra. (No navega al grupo creado.)

#### JoinGroupDialog
- Título: **"Unirse a un Grupo"**.
- Cuerpo: texto **"Ingresa el código de invitación que te compartió el administrador del grupo."** (`bodyMedium`); espacio 16; `OutlinedTextField` label **"Código de Invitación"**, una línea. **La entrada se fuerza a MAYÚSCULAS** en cada pulsación; también `clearError()`.
- Error del VM bajo el campo igual que Create.
- Confirm **"Unirse"** (habilitado si código no vacío y no cargando; spinner al cargar). Dismiss **"Cancelar"**.
- Acción: `viewModel.joinGroup(code, onSuccess = onDismiss)`. Mock (1 s): código ya existente en tus grupos → error **"Ya perteneces a este grupo"**; `HUECKO123` → se une a "Amigos de la Uni"; cualquier otro → **"Código de invitación inválido"**.

### 2.6 GroupDetail (`ui/group/GroupDetailScreen.kt`)

**Parámetro de ruta:** `groupId`. **VMs:** `GroupViewModel.groups` (busca el grupo) y `GroupPlanningViewModel.state` + helpers `proposalsOf(groupId)` (propuestas del grupo con estado ≠ `CANCELADO`) y `votingCallsOf(groupId)`. Local: `showVotingSheet`, `showCreatePlanSheet`.

**Grupo no encontrado:** pantalla completa, texto centrado **"Grupo no encontrado"** (`bodyLarge`, `onSurfaceVariant`). Sin top bar ni botón atrás (sólo Atrás del sistema).

**Top bar:** `CenterAlignedTopAppBar` (alto 64 dp, fondo `surface`), título = `group.name` (`titleLarge`, centrado), icono navegación `ArrowBack` a11y **"Volver"** → pop.

**Cuerpo:** lista vertical, padding inferior 24, separación 20; **sin** padding horizontal global (cada bloque aplica 16 h, el banner va a sangre).

1. **Banner**: alto 120 dp, ancho completo, fondo `categoryColorByIndex(hashCode(group.name))`, inicial centrada en blanco, estilo `displayMedium` (no definido en el tema → valor M3 por defecto: 45 sp, lineHeight 52, peso Normal 400).
2. **Título + integrantes** (padding 16 h, gap 4): `group.name` (`headlineSmall`, `onSurface`); `"<n> miembro(s)"` → **"1 miembro"** / **"<n> miembros"** (`labelMedium`, `onSurfaceVariant`).
3. **Botones de acción** (fila padding 16 h, gap 12, cada uno flex 1): `OutlinedButton` M3 con radio `xxl` (12 dp), borde 1 dp `outline`, contenido `primary`, 40 dp alto, texto `labelLarge`:
   - Icono `Add` 18 dp + espacio 6 + **"Crear propuesta"** → abre CreatePlanBottomSheet.
   - Icono `HowToVote` 18 dp + espacio 6 + **"Votacion"** (⚠️ sin tilde) → abre VotingCallBottomSheet.
4. **Llamadas a la votación** (sólo si hay alguna):
   - Encabezado **"Llamadas a la votacion"** (`titleMedium`, padding 16 h). ⚠️
   - Un **VotingCallCard** por llamada: `HueckoCard` (margen 16 h) con fila espaciada: columna flex 1 [`planTitle` (`titleMedium`, `onSurface`); espacio 2; `"Convocado por <createdBy> · <createdAt>"` (`bodySmall`, `onSurfaceVariant`; `createdBy` es el **email**, `createdAt` formato `dd/MM/yyyy`)] + `TextButton` **"Ir a votar"** → `voting/{call.planId}/{groupId}`.
5. **"Planes propuestos"** (`titleMedium`, padding 16 h).
   - Vacío: **"Nadie ha propuesto un plan todavia."** (`bodyMedium`, `onSurfaceVariant`, padding 16 h). ⚠️
   - Si no: un **PlanCard** por propuesta (`HueckoCard`, margen 16 h):
     - Fila (alineación arriba): columna flex 1 [`title` `titleMedium` `onSurface`; si hay `location`: espacio 2 + `location` `bodySmall` `onSurfaceVariant`; espacio 4; `votingDeadline` `bodySmall` `onSurfaceVariant`] · espacio 12 · `HueckoBadge` de estado:
       - `CONFIRMADO` → **"Confirmado"** (`primaryContainer` / `onPrimaryContainer`)
       - `EN_RECOORDINACION` → **"Re-coordinando"** (`tertiaryContainer` / `onTertiaryContainer`)
       - resto (`PROPUESTO`) → **"En votacion"** (`secondaryContainer` / `onSecondaryContainer`) ⚠️
     - Espacio 12. `TextButton` sin padding interno **"Ver detalles"** → `plan_detail/{proposal.id}`.
6. **"Integrantes"** (`titleMedium`, padding 16 h).
7. **MembersRow**: fila horizontal scrollable (padding 16 h, gap 16) con los **primeros 8** miembros; cada uno columna centrada gap 4: `HueckoAvatar` 48 dp color `categoryColorByIndex(índice en la lista)` + nombre (`labelSmall`, `onSurface`, 1 línea). Si hay **más de 8**: `TextButton` ancho completo (margen 16 h) **"Ver todos los integrantes (<n>)"** → **no hace nada (TODO)**.

#### VotingCallBottomSheet ("llamado a la votación")
- `ModalBottomSheet` M3 (fondo `surface`, esquinas superiores 28 dp, *drag handle* por defecto, scrim). Contenido padding 16 h, 32 inferior.
- **"Crear llamado a la votacion"** (`titleMedium`, `onSurface`) ⚠️; espacio 4; **"Selecciona un plan para convocar al grupo a votar."** (`bodySmall`, `onSurfaceVariant`); espacio 16.
- Sin propuestas: **"No hay planes propuestos todavia."** (`bodyMedium`, `onSurfaceVariant`) ⚠️.
- Con propuestas: columna gap 8; por propuesta, superficie pulsable ancho completo, radio `xxl`, padding 14:
  - Ya convocada (`id` en `activePlanIds`): fondo `surfaceContainerLow`, **deshabilitada**, y badge **"Ya convocado"** (`secondaryContainer` / `onSecondaryContainer`) a la derecha del título.
  - No convocada: fondo `surfaceContainer`, pulsable.
  - Contenido: fila espaciada [título `titleSmall` `onSurface` · badge opcional]; debajo `location` (`bodySmall`, `onSurfaceVariant`) si existe.
- Pulsar una disponible → `planningViewModel.createVotingCall(groupId, proposal)` y cierra la hoja. El VM emite toast **"Llamado a la votación creado."** (o **"Ya hay un llamado activo para este plan."** si ya existía) — ⚠️ estos toasts **no se muestran en ninguna UI** (ver §6).

#### CreatePlanBottomSheet
- `ModalBottomSheet` igual; columna gap 12, padding 16 h / 32 inferior.
- **"Crear propuesta de plan"** (`titleMedium`).
- 3 `OutlinedTextField` M3 por defecto, una línea, ancho completo, con etiqueta flotante:
  1. **"Titulo del plan"** ⚠️
  2. **"Ubicacion (opcional)"** ⚠️
  3. **"Fecha limite de votacion"** ⚠️ (texto libre, sin selector de fecha ni formato)
- Espacio 4. `Button` relleno ancho completo, radio `xxl`: **"Crear propuesta"**; habilitado sólo si título **y** fecha límite no están vacíos (tras `isNotBlank`).
- Acción: `planningViewModel.createProposal(group, title, location, deadline)` y cierra. El VM crea una propuesta local `PROPUESTO` con `title.trim()`, `location.trim()` (vacío → null), `deadline.trim()`, `createdBy` = email del usuario, y **ventanas sugeridas calculadas automáticamente** con el cruce de agendas (`AvailabilityMatcher`) para lun–dom (formato `HH:00`). Toast VM **"Propuesta creada."** (no mostrado). Si título vacío: toast **"El titulo no puede estar vacio."** (no alcanzable por el botón deshabilitado; tampoco mostrado).
- Los campos se reinician cada vez que se abre la hoja.

### 2.7 Voting / Votar (`ui/group/VotingScreen.kt`)

**Parámetros:** `proposalId`, `groupId` (este último no se usa en la UI). **VM:** `GroupPlanningViewModel.state` (`proposals`, `userEmail`). Local: `showAddWindowSheet`.

- **Top bar:** `CenterAlignedTopAppBar` título **"Votar"**, `ArrowBack` a11y **"Volver"** → pop. Fondo `surface`.
- **Propuesta no encontrada:** texto centrado **"Propuesta no encontrada"** (`bodyLarge`, `onSurfaceVariant`) bajo la top bar.
- **Cuerpo:** lista padding 16 h / 20 v, separación 20:
  1. **ProposalHeader** (`HueckoCard` fondo/borde `primaryContainer`, padding 20):
     - `title` (`headlineSmall`, `onPrimaryContainer`). Espacio 8.
     - Si hay `location`: fila [`Place` 16 dp + espacio 6 + `location` `bodyMedium`], color `onPrimaryContainer`; espacio 4.
     - **"Cierra: <votingDeadline>"** (`bodySmall`, `onPrimaryContainer`).
     - Espacio 12. `HueckoBadge` de estado:

       | Estado | Texto | Fondo | Texto color |
       |---|---|---|---|
       | CONFIRMADO | **"Confirmado"** | `primary` | `onPrimary` |
       | EN_RECOORDINACION | **"Re-coordinando"** | `tertiaryContainer` | `onTertiaryContainer` |
       | CANCELADO | **"Cancelado"** | `errorContainer` | `onErrorContainer` |
       | PROPUESTO | **"En votacion"** ⚠️ | `secondaryContainer` | `onSecondaryContainer` |

       (Ojo: aquí `CONFIRMADO` usa `primary`, distinto del PlanCard de GroupDetail que usa `primaryContainer`.)
  2. `SectionHeader` **"Elige una franja horaria"** / subtítulo **"Selecciona la opcion que mas te convenga. Un voto por persona."** ⚠️
  3. Sin ventanas: `HueckoCard` con **"No hay franjas disponibles. Agrega una manualmente."** (`bodyMedium`, `onSurfaceVariant`).
     Con ventanas: un **VoteWindowRow (Voting)** por ventana, igual que el del Dashboard salvo:
     - Texto principal `"<Día> <HH:mm - HH:mm>"` **sin** " · " (p. ej. "Mar 16:00 - 18:00").
     - Contador de votos en **cápsula**: radio `xxl`, padding 10 h / 4 v, `labelMedium`; si votos > 0: fondo `primaryContainer`, texto `onPrimaryContainer`; si 0: fondo `surfaceContainerLow`, texto `onSurfaceVariant`. Texto `"<n> voto"`/`"<n> votos"`.
     - Pulsar → `planningViewModel.vote(proposalId, window.id)` (toggle / mueve el voto; un voto por persona). Toast VM **"Tu voto ha sido registrado."** (no mostrado en esta pantalla).
  4. **Botón "Agregar franja horaria"**: superficie pulsable ancho completo, radio `xxl`, fondo `surfaceContainerLowest`, borde 1 dp `outlineVariant`, padding 16; fila centrada: icono `Add` 20 dp `primary` + espacio 8 + **"Agregar franja horaria"** (`titleSmall`, `primary`) → abre AddWindowBottomSheet.

#### AddWindowBottomSheet
- `ModalBottomSheet` (fondo `surface`), columna gap 12, padding 16 h / 32 inferior.
- **"Agregar franja horaria"** (`titleMedium`, `onSurface`).
- **"Selecciona el dia y la franja horaria que propones."** (`bodySmall`, `onSurfaceVariant`) ⚠️.
- `HueckoDaySelector` (selección inicial **Lun**, caption vacío `""` para todos los días).
- `OutlinedTextField` M3 por defecto, label **"Hora de inicio (HH:mm)"**, valor inicial **"09:00"**.
- `OutlinedTextField` label **"Hora de fin (HH:mm)"**, valor inicial **"11:00"**.
- Espacio 4. `Button` ancho completo radio `xxl` **"Agregar"**, habilitado si ambos campos no están vacíos. **No hay validación de formato ni de orden** (a diferencia de AddSchedule).
- Acción: `planningViewModel.addSuggestedWindow(proposalId, day, start, end)` → añade ventana con `availabilityPercentage = 0` y sin votos; cierra la hoja. Toasts VM **"Franja horaria agregada."** / **"Propuesta no encontrada."** (no mostrados).

### 2.8 PlanDetail / Detalle del plan (`ui/group/PlanDetailScreen.kt`)

**Parámetro:** `proposalId`. **VM:** `GroupPlanningViewModel.state`.

- **Top bar:** título **"Detalle del plan"**, `ArrowBack` a11y **"Volver"** → pop.
- **No encontrado:** **"Plan no encontrado"** centrado (`bodyLarge`, `onSurfaceVariant`).
- **Cuerpo:** lista padding 16 h / 20 v, separación 20:
  1. **PlanInfoCard** (`HueckoCard` `primaryContainer`): `title` (`headlineSmall`); espacio 8; fila lugar opcional (`Place` 16 + 6 + `bodyMedium`) + espacio 4; **"Creado por: <createdBy>"** (email; `bodySmall`); espacio 2; **"Cierra: <votingDeadline>"** (`bodySmall`); espacio 12; badge de estado con la **misma tabla** que ProposalHeader de Voting. Todos los textos `onPrimaryContainer`.
  2. **"Franjas horarias"** (`titleMedium`, `onSurface`).
  3. Sin ventanas: **"Aun no hay franjas propuestas para este plan."** (`bodyMedium`, `onSurfaceVariant`) ⚠️.
     Con ventanas: **WindowDetailRow** por ventana = idéntico visualmente al VoteWindowRow de Voting (check + "<Día> <rango>" + "% del grupo disponible" + cápsula de votos) pero **no pulsable** (sólo lectura).
  4. Sólo si `state == PROPUESTO`: botón superficie ancho completo, radio `xxl`, fondo `primary`, texto **"Ir a votar"** (`titleSmall`, `onPrimary`, padding 16, **alineado a la izquierda**, no centrado) → `voting/{proposalId}/{proposal.groupId}`.

### 2.9 MySchedule / Mi horario (`ui/schedule/MyScheduleScreen.kt`)

**VM:** `ScheduleViewModel.timeBlocks: TimeBlock[]`. Local: `selectedDay` (inicial **Lun**, no el día actual). Selector de fotos del sistema (`PickVisualMedia`, sólo imágenes) → en RN: `expo-image-picker` `launchImageLibraryAsync({ mediaTypes: images })`.

`blocksOfDay` = bloques con `dayOfWeek == selectedDay.iso`, ordenados por `startTime` (orden de cadena).

**Contenedor:** lista fondo `surface`, padding 16 h / 20 v, separación 20.

1. **Cabecera**:
   - **"Mi horario"** (`headlineLarge`, `onSurface`).
   - Espacio 6. **"Registra tus clases y turnos. Lo que no esté aquí cuenta como hueco libre para tus grupos."** (`bodyMedium`, `onSurfaceVariant`).
   - Espacio 16. Fila gap 10: `SecondaryAction` **"Escanear"** (icono `DocumentScanner`) → abre selector de imagen → si hay imagen, navega a `ocr_review`; `PrimaryAction` **"Añadir bloque"** (icono `Add`) → `add_schedule`.
2. Si **no hay ningún bloque**: `EmptyStateView` — **"Aún no tienes horarios registrados"** / **"Añade tus clases, trabajo o actividades para que tus grupos encuentren los mejores huecos."** / icono `CalendarToday` / botón **"Añadir mi primer bloque"** → `add_schedule`. (No se muestra el selector de día.)
3. Si hay bloques:
   - `HueckoDaySelector` con caption por día: nº de bloques de ese día, o **"libre"** si 0.
   - Si el día seleccionado no tiene bloques → `EmptyStateView` **"Sin bloques el <Día>"** (p. ej. "Sin bloques el Mié") / **"Todo el día cuenta como libre para tus grupos."** / icono `EventAvailable` / botón **"Añadir un bloque"** → `add_schedule`.
   - Si tiene → un `TimeBlockItem` por bloque (clave `id`) con `onDelete = viewModel.deleteBlock(id)` (borrado inmediato, sin confirmación ni deshacer).

**TimeBlockItem (público, reutilizado en OCR):**
- Superficie ancho completo, radio 24 (`card`), fondo `surfaceContainerLowest`, borde 1 dp `outlineVariant`; fila padding 14, gap 12, centrada verticalmente:
  - Barra de acento 4×40 dp, radio `sm` (4 dp), color `categoryColorByIndex(hashCode(block.id))`.
  - Columna flex 1: `label` (`titleMedium`, `onSurface`); espacio 2; `"<Día> · <HH:mm - HH:mm>"` (`bodySmall`, `onSurfaceVariant`). `<Día>` = etiqueta corta del `dayOfWeek` o **"Puntual"** si es `null`.
  - Badge **"Puntual"** (`secondaryContainer` / `onSecondaryContainer`) si `!isRecurring` o `type == PUNTUAL`.
  - Si hay `onDelete`: botón icono (48 dp) `DeleteOutline` 22 dp, tint `error`, a11y **"Eliminar <label>"**.

**Parámetro sin uso:** `onBack` se recibe pero no se usa (pestaña raíz).

### 2.10 AddSchedule / Nuevo bloque (`ui/schedule/AddScheduleScreen.kt`)

**VM:** `ScheduleViewModel` — estado del formulario: `newLabel` (""), `newDay` (1 = lunes), `isRecurring` (true), `newStartTime` ("08:00"), `newEndTime` ("09:00"), `isLoading`. Setters: `onLabelChange`, `onDayChange(iso)`, `onRecurringChange(bool)`, `onStartTimeChange`, `onEndTimeChange`, `saveBlock(onSuccess)`.
⚠️ El formulario vive en el VM compartido y **no se reinicia** tras guardar: al volver a entrar se ven los últimos valores.

**Contenedor:** columna scrollable, fondo `surface`, respeta IME, padding 16 h / 20 v, separación 20.

1. **Cabecera**: botón icono `ArrowBack` (auto-mirrored), tint `onSurface`, a11y **"Volver"** → pop; espacio 4; **"Nuevo bloque"** (`headlineMedium`, `onSurface`).
2. **Nombre**: label **"Nombre del bloque"** (`labelMedium`, `onSurfaceVariant`); espacio 6; campo (mismo estilo HueckoField que auth pero **sin icono**) placeholder **"Clase de Cálculo"**, IME "Siguiente".
3. **Tipo**: label **"Tipo de bloque"**; espacio 8; fila gap 10 de 2 botones de elección (flex 1, alto 48, radio `xxl`, padding 8 h, texto `labelMedium` centrado):
   - **"Recurrente"** (seleccionado si `isRecurring`) → `onRecurringChange(true)`.
   - **"Puntual (Única vez)"** (seleccionado si `!isRecurring`) → `onRecurringChange(false)`.
   - Seleccionado: fondo `primary`, texto `onPrimary`. No seleccionado: fondo `surfaceContainer`, texto `onSurface`.
4. **Día de la semana** (sólo si `isRecurring`, con animación de aparición/desaparición): label **"Día de la semana"**; espacio 10; *flow row* (envuelve líneas) gap 8/8 de 7 chips **Lun Mar Mié Jue Vie Sáb Dom**: min ancho 56, alto 48, radio `xxl`, padding 14 h, texto `titleSmall`; activo `primary`/`onPrimary`, inactivo `surfaceContainer`/`onSurface`; a11y `selected`. Pulsar → `onDayChange(day.iso)`.
5. **Horario**: label **"Horario"**; espacio 6; fila gap 10 de dos campos flex 1, teclado numérico:
   - Inicio: placeholder **"08:00"**; supporting text **"Inicio"** si válido, **"Formato HH:mm"** (en rojo, estado error) si no. IME "Siguiente".
   - Fin: placeholder **"10:00"**; supporting: **"Formato HH:mm"** si formato inválido, **"Debe ser posterior"** si fin ≤ inicio, **"Fin"** si todo OK; error si cualquiera de los dos primeros casos. IME "Hecho".
   - (El supporting text siempre está visible, no sólo en error.)
6. **Botón guardar** — `PrimaryAction` ancho completo sin icono: **"Guardar bloque"** / **"Guardando…"** mientras `isLoading`. Habilitado sólo si `canSave`.
7. Si `isLoading`: spinner 20 dp (trazo 2, `primary`) centrado debajo.

**Validación (en tiempo real, controla `enabled`):**
- Hora válida: regex `^([01]\d|2[0-3]):[0-5]\d$` (00:00–23:59, dos dígitos obligatorios).
- `orderValid` = ambas válidas y minutos(fin) > minutos(inicio).
- `canSave` = `label` no vacío (trim) && `orderValid` && !`isLoading`. El nombre vacío **no** muestra mensaje; sólo deshabilita el botón.

**Guardar:** `saveBlock(onBack)` crea `TimeBlock { id: Date.now(), userId: "user_1", dayOfWeek: isRecurring ? newDay : null, startTime, endTime, label, isRecurring }` (tipo por defecto `CLASE`), lo añade al repositorio y vuelve atrás.

### 2.11 OcrReview / Revisar escaneo (`ui/ocr/OcrReviewScreen.kt`)

**Parámetro:** `imageUri`. **VM:** `OcrViewModel.uiState: Initial | Loading | Success(blocks) | Error(message)`. Al montar (y cada vez que cambia el URI) llama `processImage(context, uri)`: carga bitmap → `GeminiService.analyzeScheduleImage` → parsea JSON a `TimeBlock[]`. Excepción → `Error(e.message ?: "Error desconocido")`.

**Layout:** columna fondo `surface`.

1. **Cabecera** (fila padding 8/8): botón icono `ArrowBack` (auto-mirrored) a11y **"Volver"** → pop; **"Revisar escaneo"** (`titleLarge`, `onSurface`).
2. **Contenido según estado:**
   - **Initial / Loading** — columna centrada a pantalla completa, padding 32: spinner (trazo 3 dp, `primary`, tamaño M3 por defecto 40 dp); espacio 20; **"Leyendo tu horario"** (`titleMedium`, `onSurface`); espacio 6; **"Puede tardar unos segundos. No cierres la pantalla."** (`bodyMedium`, `onSurfaceVariant`, centrado).
   - **Error** — `CenteredNotice` en modo error: título **"No se pudo leer el horario"**, mensaje = `state.message`, botón **"Volver"** → pop.
   - **Success con 0 bloques** — `CenteredNotice` modo neutro: **"No se detectó ningún bloque"** / **"Prueba con una foto más nítida o añade los bloques a mano."** / botón **"Volver"** → pop.
   - **Success con bloques** — lista padding 16 h / 12 v, separación 12:
     1. `HueckoCard` fondo/borde `primaryContainer`: **"<n> bloque detectado"** / **"<n> bloques detectados"** (`titleMedium`, `onPrimaryContainer`); espacio 4; **"Revísalos antes de confirmar: se sumarán a tu horario y afectarán a los huecos que vean tus grupos."** (`bodyMedium`, `onPrimaryContainer`).
     2. Un `TimeBlockItem` por bloque **sin** botón de borrar (se acepta todo o nada; no hay edición).
     3. Espacio 4 + fila gap 10: `SecondaryAction` **"Descartar"** (sin icono) → pop; `PrimaryAction` **"Añadir a mi horario"** (sin icono) → `onConfirm(blocks)` (añade al repositorio y navega a Horario, ver §1.4).

**CenteredNotice (privado):** caja a pantalla completa padding 24, centrada; superficie radio 24; fondo `errorContainer` (error) o `surfaceContainer` (neutro); columna padding 24 centrada: icono `ErrorOutline` (outlined) 28 dp (tint `onErrorContainer` / `onSurfaceVariant`); espacio 12; título `titleMedium` centrado (`onErrorContainer` / `onSurface`); espacio 6; mensaje `bodyMedium` centrado (`onErrorContainer` / `onSurfaceVariant`); espacio 18; `PrimaryAction` **"Volver"** sin icono (ancho intrínseco).

### 2.12 Profile / Mi perfil (`ui/profile/ProfileScreen.kt`)

**VM:** `AuthViewModel` — `email`, `isLoggedIn`.

**Contenedor:** columna scrollable, fondo `surface`, padding 16 h / 20 v, separación 20.

1. **"Mi perfil"** (`headlineLarge`, `onSurface`).
2. **Tarjeta de sesión** (`HueckoCard`):
   - Fila gap 14: `HueckoAvatar` 48 dp color `categoryColorByIndex(0)` (#6750A4) con la inicial del email (o "H" si vacío) · columna: **"Sesión iniciada"** (`titleMedium`, `onSurface`) + `email` o **"Sin correo registrado"** (`bodyMedium`, `onSurfaceVariant`).
   - Espacio 20. `OutlinedButton` ancho completo, alto 48, radio `xxl`, texto color `error`, borde M3 por defecto (`outline` 1 dp), padding h 16: **"Cerrar sesión"** (`labelMedium`) → `viewModel.logout()`.
3. **Tarjeta "Próximamente"** (`HueckoCard` fondo y borde `surfaceContainer`): **"Próximamente"** (`titleMedium`, `onSurface`); espacio 6; **"Datos de la cuenta, preferencias de notificación y ajustes de privacidad."** (`bodyMedium`, `onSurfaceVariant`).

**Logout:** repositorio `logout()` → `isLoggedIn=false`, limpia `email`, `password`, `name`, `errorMessage`. Un efecto observa `isLoggedIn == false` → `onLoggedOut()` → Login con la pila limpiada. Sin diálogo de confirmación.

---

## 3. Componentes reutilizables (`ui/components/*`)

### 3.1 `HueckoCard`
- **Propósito:** tarjeta plana base (sin sombra) usada en casi todas las pantallas.
- **Props:** `containerColor` (def. `surfaceContainerLowest`), `borderColor` (def. `outlineVariant`), `shape` (def. radio `card` = 24 dp), `contentPadding` (def. 20 dp en todos los lados), `onClick?` (si existe, toda la tarjeta es pulsable con ripple), `children` (dispuestos en columna).
- **Visual:** borde 1 dp siempre; sin elevación.

### 3.2 `PrimaryAction`
- **Propósito:** botón principal relleno.
- **Props:** `text`, `icon?`, `onClick`, `enabled` (def. true), `style/modifier` (ancho).
- **Visual:** alto 48 dp, radio `xxl` 12 dp, fondo `primary`, contenido `onPrimary`, **elevación 0**, padding horizontal 14; icono 18 dp + espacio 8 + texto `labelMedium` (1 línea). Deshabilitado: colores M3 por defecto (fondo `onSurface` 12 %, texto `onSurface` 38 %).

### 3.3 `SecondaryAction`
- **Propósito:** botón secundario con contorno.
- **Props:** `text`, `icon?`, `onClick`, `style/modifier`. (Sin `enabled`.)
- **Visual:** alto 48, radio 12, fondo `surfaceContainerLowest`, borde 1 dp **`outline`** (#79747E, no `outlineVariant`), padding h 14, contenido centrado: icono 18 dp tint `primary` + espacio 8 + texto `labelMedium` color `primary` (1 línea).

### 3.4 `SectionHeader`
- **Props:** `title`, `subtitle?`, `actionLabel?`, `onAction?`.
- **Visual:** fila ancho completo, centrada verticalmente, espaciada. Columna flex 1: título `titleLarge` `onSurface`; subtítulo `bodySmall` `onSurfaceVariant` (sin espacio extra). Si hay acción: espacio 8 + `TextButton` (color `primary`, padding M3 por defecto 12 h, alto mín. 40) con texto `labelMedium`.

### 3.5 `EmptyStateView`
- **Props:** `title`, `description`, `icon` (def. `Icons.Default.Inbox`), `actionLabel?`, `onActionClick?`.
- **Visual:** columna centrada, padding 32 en todos los lados:
  - Círculo 100 dp, fondo `primaryContainer` al 50 % de opacidad, icono 48 dp `primary`.
  - Espacio 24. Título `titleLarge` forzado a **Bold**, `onSurface`, centrado.
  - Espacio 8. Descripción `bodyMedium`, `onSurfaceVariant`, centrada.
  - Si hay acción: espacio 24 + `Button` M3 **por defecto** (forma píldora/totalmente redondeada, alto 40, padding 24 h, texto `labelLarge`, fondo `primary`, texto `onPrimary`, con la elevación por defecto de M3 = 0 en reposo para `Button` filled).
- No tiene contenedor/borde propio (se pinta sobre el fondo de la pantalla).

### 3.6 `HueckoAvatar`
- **Props:** `name`, `color`, `size` (def. 32 dp), `contentDescription?` (si es null, se oculta a lectores de pantalla).
- **Visual:** círculo del tamaño dado, fondo `color`, inicial (`name.trim()[0]` en mayúscula) en `labelMedium` blanco (#FFFFFF), centrada. El tamaño de texto **no** escala con el avatar (siempre 12 sp).

### 3.7 `HueckoBadge`
- **Props:** `text`, `containerColor`, `contentColor`.
- **Visual:** cápsula radio `lg` (8 dp), padding 8 h / 4 v, texto `labelMedium`.

### 3.8 `HueckoDaySelector`
- **Props:** `selected: DayOfWeek`, `captionFor(day) => string`, `onSelect(day)`.
- **Visual:** fila horizontal **scrollable** ancho completo, gap 8, 7 chips (Lun … Dom). Cada chip: ancho mín. 64, alto 56, radio `xxl` 12, padding 10 h / 8 v; columna centrada: etiqueta del día `titleSmall` + caption `bodySmall`. Activo: fondo `primary`, textos `onPrimary`. Inactivo: fondo `surfaceContainer`, etiqueta `onSurface`, caption `onSurfaceVariant`. a11y `selected`.
- Nota: con caption `""` (AddWindowBottomSheet) la segunda línea queda vacía pero ocupa su altura.

### 3.9 `HueckoBottomBar` + `HueckoDestination`
- **Props:** `current: HueckoDestination`, `onNavigate(dest)`.
- **Visual:** `NavigationBar` M3: alto 80 dp, fondo `surfaceContainer`, **sin elevación tonal**. Cada item: icono 24 dp; indicador de selección en píldora 64×32 dp color `primaryContainer`; label `labelSmall` siempre visible.
  - Seleccionado: icono `onPrimaryContainer`, label `primary`.
  - No seleccionado: icono y label `onSurfaceVariant`.
- Items: ver §1.2.

### 3.10 Componentes privados relevantes (por pantalla)
| Componente | Pantalla | Resumen |
|---|---|---|
| `BrandMark`, `FieldLabel`, `ErrorBanner`, `HueckoTextField` | Login (`RegisterFieldLabel`, `RegisterField` duplicados en Register) | §2.1 |
| `GreetingHeader`, `ExpressVoteCard`, `ExpressVoteButton`, `MetricsGrid`, `MetricCard`, `UpcomingPlanCard`, `TodayScheduleCard`, `ScheduleBlockRow`, `MyGroupsCard`, `PendingVoteCard`, `VoteWindowRow`, `QuickActions`, `IconLabel` | Dashboard | §2.3 |
| `Header`, `GroupCard` | GroupList | §2.4 |
| `VotingCallCard`, `VotingCallBottomSheet`, `CreatePlanBottomSheet`, `PlanCard`, `MembersRow` | GroupDetail | §2.6 |
| `ProposalHeader`, `VoteWindowRow`, `AddWindowBottomSheet` | Voting | §2.7 |
| `PlanInfoCard`, `WindowDetailRow` | PlanDetail | §2.8 |
| `FreeDayNotice`, `TimeBlockItem` (público) | MySchedule | §2.9 |
| `TypeChoiceButton`, `FieldLabel`, `HueckoField` | AddSchedule | §2.10 |
| `LoadingContent`, `SuccessContent`, `CenteredNotice` | OcrReview | §2.11 |

Recomendación RN: unificar `HueckoTextField`/`RegisterField`/`HueckoField` en un único `HueckoTextField` con `leadingIcon?`, `trailing?`, `supportingText?`, `error?`; y los tres `VoteWindowRow`/`WindowDetailRow` en uno con props `separator: " · " | " "`, `countStyle: "plain" | "pill"`, `onPress?`.

---

## 4. Tema

### 4.1 Tipografía (`Type.kt`)

Familia: fuente del **sistema** (`FontFamily.Default` → Roboto en Android; en RN usar la fuente por defecto de la plataforma o empaquetar Roboto para igualar). La web usa Geist (pendiente).

| Estilo | Tamaño (sp) | Peso | Line height (sp) | Letter spacing (sp) |
|---|---|---|---|---|
| `displayMedium` * | 45 | 400 Normal | 52 | 0 |
| `displaySmall` | 34 | 700 Bold | 40 | −0.7 |
| `headlineLarge` | 30 | 700 Bold | 36 | −0.6 |
| `headlineMedium` | 24 | 700 Bold | 30 | −0.5 |
| `headlineSmall` | 20 | 700 Bold | 26 | −0.4 |
| `titleLarge` | 18 | 600 SemiBold | 24 | 0 |
| `titleMedium` | 16 | 600 SemiBold | 22 | 0 |
| `titleSmall` | 13 | 700 Bold | 18 | 0 |
| `bodyLarge` | 16 | 400 Normal | 24 | 0 |
| `bodyMedium` | 14 | 400 Normal | 20 | 0 |
| `bodySmall` | 12 | 400 Normal | 17 | 0 |
| `labelLarge` | 14 | 700 Bold | 18 | 0 |
| `labelMedium` | 12 | 600 SemiBold | 16 | 0 |
| `labelSmall` | 11 | 600 SemiBold | 16 | 0 |

\* `displayMedium` no se redefine en el tema: se usa el valor por defecto de Material 3 (sólo en el banner de GroupDetail). El resto de estilos M3 no listados (`displayLarge`) no se usan.

Notas: los estilos redefinidos sustituyen por completo al de M3, así que su letterSpacing es el de la tabla (0 donde no se indica). En `OutlinedTextField`, el *supporting text* usa `bodySmall` y la etiqueta flotante `bodyLarge`/`bodySmall` del tema.

### 4.2 Radios (`Shape.kt` — `HueckoRadius`)

| Token | dp | Uso principal |
|---|---|---|
| `sm` | 4 | Barra de acento de `TimeBlockItem`; `Shapes.extraSmall` |
| `md` | 6 | (no usado) |
| `lg` | 8 | `HueckoBadge`; `Shapes.small` |
| `xl` | 10 | (no usado) |
| `xxl` | 12 | Botones (Primary/Secondary/login/outlined), campos de texto Huecko, chips de día, filas de voto, banner de error, Snackbar, cápsula de votos, tipo de bloque; `Shapes.medium` |
| `xxxl` | 16 | `Shapes.large` |
| `card` | 24 | `HueckoCard`, tarjeta de login/registro, `ExpressVoteCard`, `TimeBlockItem`, `CenteredNotice`; `Shapes.extraLarge` |

Componentes M3 por defecto que no usan estos tokens: `AlertDialog` (28 dp), `ModalBottomSheet` (28 dp arriba), `Button` por defecto en `EmptyStateView` y diálogos (píldora), `OutlinedTextField` por defecto en diálogos y hojas (4 dp), indicador de NavigationBar (píldora 16 dp).

### 4.3 Espaciado (convenciones observadas)

- Padding de pantalla: **16 dp** horizontal, **20 dp** vertical (Dashboard, Grupos, Horario, Perfil, Voting, PlanDetail, AddSchedule). Auth: 20 h (Login 32 v, Register 20 v).
- Separación entre secciones en listas: 24 (Dashboard), 20 (Horario, Perfil, Voting, PlanDetail, AddSchedule, GroupDetail), 12 (GroupList, OCR).
- Padding interno de tarjeta: 20 (por defecto), 24 (auth, CenteredNotice), 18 (ExpressVote), 16 (MetricCard), 14 (TimeBlockItem, filas de hoja).
- Gaps de filas de botones: 10 (pares de acciones), 12 (métricas, GroupDetail), 8 (voto exprés, chips).
- Label → campo: 6 (8/10 para selectores). Título → subtítulo: 6.
- Alturas táctiles: botones 48 (52 en auth), chips 48/56, `IconButton` 48.
- Sin sombras en ningún sitio: la jerarquía es color + borde 1 dp.

### 4.4 Tokens de color y dónde se usan

| Token | Hex | Uso |
|---|---|---|
| `primary` | #6750A4 | Botones primarios, BrandMark, iconos de métricas/estados vacíos, chips de día activos, texto de SecondaryAction/TextButtons, borde foco de campos, borde de fila votada, label seleccionado de bottom bar, nombre de grupo en PendingVoteCard, badge CONFIRMADO (Voting/PlanDetail), botón "Ir a votar" (PlanDetail), spinners |
| `onPrimary` | #FFFFFF | Texto/iconos sobre `primary` |
| `primaryContainer` | #EADDFF | UpcomingPlanCard, ProposalHeader, PlanInfoCard, tarjeta resumen OCR, fila de voto votada, cápsula de votos > 0, badge % de grupos, badge CONFIRMADO (PlanCard), indicador bottom bar, círculo de EmptyState (50 %) |
| `onPrimaryContainer` | #21005D | Texto sobre `primaryContainer`; icono seleccionado bottom bar |
| `secondaryContainer` / `onSecondaryContainer` | #E8DEF8 / #1D192B | Badges "Puntual", "En votacion", "Ya convocado" |
| `tertiaryContainer` / `onTertiaryContainer` | #FFD8E4 / #31111D | Badge "Re-coordinando" |
| `error` | #B3261E | Icono de borrar bloque, texto "Cerrar sesión", texto de error en diálogos, estado error de campos |
| `errorContainer` / `onErrorContainer` | #F9DEDC / #410E0B | ErrorBanner auth, CenteredNotice error, badge "Cancelado" |
| `surface` | #FEF7FF | Fondo de todas las pantallas, top bars, bottom sheets, fila de voto no votada, status bar |
| `onSurface` | #1D1B20 | Títulos y texto principal |
| `onSurfaceVariant` | #49454F | Texto secundario, labels de campo, iconos de campo, items no seleccionados de bottom bar |
| `outline` | #79747E | Placeholder de campos, borde de SecondaryAction, borde OutlinedButton |
| `outlineVariant` | #CAC4D0 | Borde de tarjetas y campos no enfocados, filas de voto no votadas, botones exprés no seleccionados |
| `surfaceContainerLowest` | #FFFFFF | Fondo de HueckoCard, tarjetas auth, SecondaryAction, TimeBlockItem, botón "Agregar franja", botones exprés no seleccionados |
| `surfaceContainerLow` | #F7F2FA | Cápsula de votos = 0, plan ya convocado en hoja |
| `surfaceContainer` | #F3EDF7 | Bottom bar, nav bar, chips de día inactivos, TypeChoice inactivo, plan convocable en hoja, tarjeta "Próximamente", CenteredNotice neutro |
| `surfaceContainerHigh` | #ECE6F0 | Badge "Ocupado"; fondo de AlertDialog (M3) |
| `inverseSurface` / `inverseOnSurface` | #322F35 / #F4EFF4 | Snackbar del Dashboard |
| `warning` (extendido) | #7A5210 | Borde de ExpressVoteCard (35 % alfa) |
| `warningContainer` / `onWarningContainer` | #F8EACF / #3A2504 | ExpressVoteCard |
| `successContainer` / `onSuccessContainer` | #DBEEE2 / #10301F | Badge "Libre" |
| Blanco literal | #FFFFFF | Iniciales en avatares y banners de grupo |

Tokens definidos pero no usados en UI: `secondary`, `tertiary`, `background` (sólo Surface raíz), `surfaceVariant`, `surfaceDim/Bright`, `surfaceContainerHighest`, `inversePrimary`, `primaryPressed`, `secondaryPressed`, `success`, `onSuccess`, `onWarning`.

### 4.5 Colores de categoría (`CategoryColors`)

Lista de 8: `#6750A4, #535288, #7B4B8E, #4A6B5B, #8C523B, #4E588E, #823B58, #7A5926`. `categoryColorByIndex(i) = CategoryColors[i mod 8]` con módulo **no negativo**.

- Por índice de lista: avatares de asistentes, de grupos (Dashboard) y de miembros, puntos de bloques de hoy, avatar de perfil (índice 0).
- Por **hash de string** (Java `String.hashCode()`): banners de grupo (`group.name`) y barra de acento de bloques (`block.id`). Para que el color coincida con Android en RN:
  ```ts
  const javaHash = (s: string) => { let h = 0; for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0; return h; };
  const categoryColor = (i: number) => CATEGORY[((i % 8) + 8) % 8];
  ```

---

## 5. Iconos usados

Todos son Material Icons **Outlined** salvo indicación. Mapeo sugerido a `@expo/vector-icons` (MI = `MaterialIcons`, MCI = `MaterialCommunityIcons`; si se quiere la variante outline exacta, preferir MCI).

| Icono Compose | Dónde | MI | MCI (outline) |
|---|---|---|---|
| `Outlined.Dashboard` | Tab Inicio | `dashboard` | `view-dashboard-outline` |
| `Outlined.CalendarMonth` | Tab Horario; métrica "Mi horario" | `calendar-month` | `calendar-month-outline` |
| `Outlined.Group` | Tab Grupos | `group` | `account-multiple-outline` |
| `Outlined.Person` | Tab Perfil; campo nombre (Register) | `person-outline` | `account-outline` |
| `Outlined.Mail` | Campo correo (Login/Register) | `mail-outline` | `email-outline` |
| `Outlined.Lock` | Campo contraseña | `lock-outline` | `lock-outline` |
| `Outlined.Visibility` | Mostrar contraseña | `visibility` | `eye-outline` |
| `Outlined.VisibilityOff` | Ocultar contraseña | `visibility-off` | `eye-off-outline` |
| `Filled.ErrorOutline` | ErrorBanner (Login/Register) | `error-outline` | `alert-circle-outline` |
| `Outlined.ErrorOutline` | CenteredNotice (OCR) | `error-outline` | `alert-circle-outline` |
| `AutoMirrored.Outlined.ArrowBack` | Register, AddSchedule, OcrReview | `arrow-back` | `arrow-left` |
| `Outlined.ArrowBack` (no mirrored) | Top bars de GroupDetail, Voting, PlanDetail | `arrow-back` | `arrow-left` |
| `Outlined.Groups` | Métrica "Grupos activos"; asistentes en UpcomingPlanCard; EmptyState de GroupList | `groups` | `account-group-outline` |
| `Outlined.HowToVote` | Métrica "Votaciones abiertas"; EmptyState votaciones; botón "Votacion" (GroupDetail) | `how-to-vote` | `vote-outline` |
| `Outlined.Schedule` | Métrica "Horas coincidentes" | `schedule` | `clock-outline` |
| `Outlined.EventBusy` | EmptyState "Sin planes confirmados" | `event-busy` | `calendar-remove-outline` |
| `Outlined.EventAvailable` | "Nada en la agenda para hoy"; EmptyState día libre (Horario) | `event-available` | `calendar-check-outline` |
| `Outlined.Place` | Lugar en UpcomingPlanCard, ProposalHeader, PlanInfoCard | `place` | `map-marker-outline` |
| `Outlined.Check` | Marca "Tu voto" en filas de voto | `check` | `check` |
| `Outlined.GroupAdd` | "Nuevo grupo" (Dashboard), "Crear grupo" (GroupList) | `group-add` | `account-multiple-plus-outline` |
| `Outlined.EditCalendar` | "Editar horario" (Dashboard) | `edit-calendar` | `calendar-edit` |
| `Outlined.Key` | "Unirme" (GroupList) | `vpn-key` | `key-outline` |
| `Outlined.Add` | "Crear propuesta" (GroupDetail), "Agregar franja horaria" (Voting), "Añadir bloque" (Horario) | `add` | `plus` |
| `Outlined.DocumentScanner` | "Escanear" (Horario) | `document-scanner` | `line-scan` |
| `Outlined.CalendarToday` | EmptyState "Aún no tienes horarios registrados" | `calendar-today` | `calendar-blank-outline` |
| `Outlined.DeleteOutline` | Borrar bloque (TimeBlockItem) | `delete-outline` | `delete-outline` |
| `Default.Inbox` (Filled) | Icono por defecto de EmptyStateView (no usado en la práctica: todas las llamadas pasan icono) | `inbox` | `inbox` |

---

## 6. TODOs, interacciones incompletas y comportamientos a vigilar

**Interacciones sin implementar**
1. **"Ver todos los integrantes (<n>)"** (GroupDetail, sólo con > 8 miembros): `onSeeAll = { /* TODO: ver todos los miembros */ }` → **no hace nada**.
2. **Toasts de `GroupPlanningViewModel` nunca se muestran**: `state.toast` no se pinta en GroupDetail, Voting ni PlanDetail. Mensajes huérfanos: "Tu voto ha sido registrado.", "Propuesta creada.", "El titulo no puede estar vacio.", "Llamado a la votación creado.", "Ya hay un llamado activo para este plan.", "Franja horaria agregada.", "Propuesta no encontrada.", "Código <code> copiado.". Decidir si RN los muestra (recomendado: mismo Snackbar que el Dashboard).
3. **`notifyCodeCopied`** existe en el VM pero **ninguna pantalla muestra ni copia el código de invitación** del grupo (`inviteCode`). No hay forma en la UI de ver el código para invitar a otros.
4. **`windowsFor` / `allWindowsFor`** (cruce de agendas por día) no se usan en ninguna pantalla; el cruce sólo se usa internamente al crear una propuesta.
5. **"Nuevo grupo"** del Dashboard sólo navega a la pestaña Grupos; **no abre** el diálogo de crear grupo.
6. **Llamadas a la votación** son un *placeholder* local: `createdBy` muestra el email, no persisten, y el `votingCalls` del estado se lee como instantánea (se refresca sólo porque el toast emite a la vez).
7. **Perfil**: tarjeta "Próximamente" (datos de cuenta, notificaciones, privacidad) sin funcionalidad.
8. **Login**: nota de desarrollo visible ("Mientras no haya servidor…") — mantener o quitar según backend.
9. `MyScheduleScreen` recibe `onBack` pero no lo usa.

**Comportamientos a replicar o corregir conscientemente**
10. **Bloques puntuales invisibles**: un bloque con `dayOfWeek = null` (tipo "Puntual (Única vez)") se guarda y cuenta en "Mi horario" y en `totalBlocks`, pero **no aparece en ningún día** del selector ni en "Mi horario de hoy". No hay campo de fecha para bloques puntuales.
11. **Formulario de AddSchedule no se reinicia** tras guardar (estado en VM compartido). Valores iniciales: nombre "", Recurrente, Lun, 08:00–09:00 (el placeholder del fin dice "10:00").
12. `AddScheduleScreen` no permite elegir `BlockType` (siempre `CLASE`), así que los badges "Libre"/"Puntual" por `type` del Dashboard sólo se ven con datos OCR.
13. **AddWindowBottomSheet** no valida formato ni orden de horas (acepta cualquier texto no vacío); la ventana añadida tiene 0 % de disponibilidad.
14. **"Fecha limite de votacion"** es texto libre, sin selector ni validación.
15. Borrado de bloques sin confirmación ni deshacer.
16. OCR: no se pueden editar ni quitar bloques individuales; todo o nada. Los bloques vienen tal cual del JSON de Gemini.
17. Votar la misma franja otra vez **retira** el voto (toggle), tanto en Dashboard como en Voting.
18. El selector de día de Horario siempre arranca en **Lun**, no en el día actual.
19. En "Mis grupos" del Dashboard siempre dice "miembros" (plural) aunque sea 1; en GroupList/GroupDetail sí singulariza.
20. Etiqueta de franja inconsistente: Dashboard `"Mar · 16:00 - 18:00"`, Voting/PlanDetail `"Mar 16:00 - 18:00"`.
21. Badge CONFIRMADO: `primaryContainer` en PlanCard (GroupDetail) vs `primary` en Voting/PlanDetail.
22. Los diálogos de grupo no limpian `errorMessage` al cerrarse: un error puede reaparecer al reabrir hasta que se teclee.
23. Identidad de usuario inconsistente en mocks: `AuthRepository` usa el email tecleado; `GroupRepository` siembra al usuario como `test@test.com`; los votos se registran con el email de auth.
24. GroupDetail "Grupo no encontrado" no tiene top bar ni botón de volver.

---

## 7. Copy sin tildes en el original (⚠️)

Reproducido literalmente arriba; recomendación: corregir en RN salvo que se quiera paridad exacta.

| Pantalla | Texto original | Corrección sugerida |
|---|---|---|
| GroupList | "Consulta a quien tienes en cada grupo y en que franjas coincideis todos." | "Consulta a quién tienes en cada grupo y en qué franjas coincidís todos." |
| GroupList | "Aun no tienes ningun grupo" | "Aún no tienes ningún grupo" |
| GroupList | "Crea uno para invitar a tus companeros, o unete con el codigo que te hayan pasado." | "…compañeros, o únete con el código…" |
| GroupDetail | "Votacion" | "Votación" |
| GroupDetail | "Llamadas a la votacion" | "Llamadas a la votación" |
| GroupDetail | "Nadie ha propuesto un plan todavia." | "…todavía." |
| GroupDetail / Voting / PlanDetail | "En votacion" | "En votación" |
| VotingCallBottomSheet | "Crear llamado a la votacion" / "No hay planes propuestos todavia." | "votación" / "todavía" |
| CreatePlanBottomSheet | "Titulo del plan" / "Ubicacion (opcional)" / "Fecha limite de votacion" | "Título…" / "Ubicación…" / "Fecha límite de votación" |
| Voting | "Selecciona la opcion que mas te convenga. Un voto por persona." | "…opción que más…" |
| AddWindowBottomSheet | "Selecciona el dia y la franja horaria que propones." | "…día…" |
| PlanDetail | "Aun no hay franjas propuestas para este plan." | "Aún…" |
| VM (toast) | "El titulo no puede estar vacio." | "El título no puede estar vacío." |

Mayúsculas tipo título en diálogos: "Crear Nuevo Grupo", "Unirse a un Grupo", "Código de Invitación" (el resto de la app usa mayúscula sólo inicial).

---

## 8. Datos mock iniciales (para reproducir capturas)

- **Usuario** (tras login): `id "mock_123"`, nombre "Usuario de Prueba" (registro: nombre tecleado), email = el tecleado.
- **Grupos:** `g1` "Proyecto Integrador", código `PROY2026`, miembros: Usuario de Prueba (test@test.com), Ana (ana@test.com). Unirse con `HUECKO123` añade "Amigos de la Uni" (Carlos + usuario).
- **Bloques:** "Clase de Android" Lun 08:00–10:00; "Trabajo Part-time" Mié 14:00–16:00.
- **Ocupación de otros:** Ana — Lun 08–12 "Clase de Redes", Mié 15–19 "Turno de tarde", Vie 09–11 "Laboratorio".
- **Propuestas (g1):**
  - `prop_1` "Reunión de avance del proyecto", Biblioteca central, deadline "Cerrada", **CONFIRMADO**, ventana Mié 11:00–13:00 (100 %, 2 votos), incidencia abierta de Ana (IMPREVISTO, "Cruce con un examen de laboratorio a última hora.") → dispara la **Votación exprés** en Inicio.
  - `prop_2` "Repaso antes de la entrega", Google Meet, "Cierra hoy a las 20:00", **PROPUESTO**, ventanas Mar 16–18 (100 %, voto de Ana), Jue 10–12 (100 %), Vie 16–18 (50 %).
- Retardos simulados: login/registro 1,5 s; crear/unirse a grupo 1 s.
