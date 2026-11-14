# Unirse a un grupo acercando el celular — diseño

Rama: `feature/unirse-por-proximidad`. Parte de la v3.0.0.

## Por qué

La tercera entrega del curso exige usar el **sensor de proximidad** y el **giroscopio**. En lugar de una demo suelta,
se usan para algo útil: una persona se une a un grupo juntando su celular con el de un miembro, sin escribir el código
de invitación. El código sigue existiendo y es la alternativa siempre disponible.

## Objetivos

- Cualquier **miembro** de un grupo (no solo el `OWNER`) puede invitar acercando el celular.
- Quien invita **ve el nombre** de quien se quiere unir y **confirma** (Aceptar / Rechazar) antes de que entre.
- Los dos celulares detectan proximidad; el **servidor** los empareja por la hora en que llegan sus avisos.
- El giroscopio confirma que los celulares están **quietos** al juntarse (evita falsos positivos al guardar el
  celular en el bolsillo o tapar el sensor con la mano mientras se mueve).
- Funciona en el APK y en un *development build* en **Android**.

## No objetivos

- iOS: no se escribe la parte nativa de iOS. Allí (y en Expo Go) la función aparece como «no disponible» y se ofrece
  el código.
- Magnetómetro y sensor de luz (opcionales del curso): fuera de esta rama.
- Reemplazar el código de invitación o el endpoint `POST /groups/join`: se quedan igual.
- Avisos en tiempo real (WebSocket/SSE) o notificaciones push.

## Anti-objetivos (sería un fracaso aunque «funcione»)

- Que alguien entre a un grupo **sin** la confirmación de quien invita.
- Que alguien entre al **grupo equivocado** o que se empareje con el celular equivocado sin que nadie lo note.
- Que la pantalla se quede esperando para siempre: toda espera tiene tiempo límite y salida («Usar el código»).

## Restricciones

- App: Expo SDK 57, React Native 0.86 (arquitectura nueva), TypeScript, React Navigation (native-stack). Ver `CLAUDE.md`.
- Backend: Express 5 + zod + `ApiError`, Postgres detrás de la interfaz `Db` (Neon en producción, PGlite en tests),
  SQL parametrizado. Reloj inyectado (`now` en `ResolvedDeps`) para poder probar las ventanas de tiempo.
- `expo-sensors` no trae proximidad → módulo nativo propio → **development build** (no Expo Go). Probar de verdad
  requiere **dos celulares Android con sensor de proximidad**.
- Render plan gratuito: puede estar dormido (~1 min). La primera petición tarda; los reintentos de TanStack Query
  (PR #43) lo cubren.
- Contrato: `docs/api.md` y `shared/index.d.ts` se actualizan en el mismo PR.

## Enfoques considerados

| Decisión | Elegido | Descartado y por qué |
|---|---|---|
| Leer el sensor de proximidad | **Módulo nativo propio en Kotlin** con Expo Modules (`mobile/modules/proximity`, `SensorManager.TYPE_PROXIMITY`). Poco código, bajo nuestro control, cumple «módulo nativo» del curso. | Librerías de terceros (`react-native-proximity` y similares): abandonadas, sin soporte de la arquitectura nueva de RN 0.86. |
| Enterarse de la pareja y de la confirmación | **Consultar al servidor cada ~1,5 s** mientras la pantalla está abierta (`refetchInterval` de TanStack Query). Simple, funciona con Render gratis. | WebSocket/SSE: infraestructura nueva y Render gratis corta conexiones al dormir; no compensa para esperas de segundos. |
| Dónde guarda el servidor los intentos | **Tabla nueva en Postgres** (`proximity_requests`) detrás de `Db`. Probable con PGlite, sobrevive reinicios. | En memoria: se pierde en cada reinicio de Render y no se puede inspeccionar. |

El usuario eligió las tres recomendadas.

## Flujo (decidido con el usuario)

1. **Quien invita** abre el detalle de su grupo → **Acercar para invitar**. **Quien se une** abre «Mis grupos» →
   **Unirse acercando** (junto a «Unirse con código»). Ambos ven «Junta los celulares pantalla con pantalla».
2. Cuando el sensor pasa de *lejos* a *cerca* y el giroscopio dice que el celular está quieto, el celular envía su
   aviso al servidor (`invite` con el `groupId`, o `join`).
3. El servidor empareja una invitación con una unión que lleguen con **menos de 3 s** de diferencia.
   Si en esa ventana hay **más de una** pareja posible, no empareja a nadie: todos los implicados ven
   «Hubo otro intento cerca. Repitan o usen el código».
4. Con pareja: los dos celulares **vibran**. Quien invita ve «**Ana** quiere unirse a *Proyecto Integrador*» con
   **Aceptar** / **Rechazar**. Quien se une ve «Esperando a que **Luis** te acepte en *Proyecto Integrador*».
5. **Aceptar** → la persona queda como `MEMBER`; su app la lleva al detalle del grupo y la lista «Mis grupos» la incluye.
   **Rechazar** o **30 s** sin respuesta → la solicitud vence; quien se une ve «No se completó» y puede repetir.

## Backend

### Tabla `proximity_requests` (migración nueva)

| Columna | Tipo | Nota |
|---|---|---|
| `id` | text PK | mismo estilo de id que el resto de tablas |
| `user_id` | FK `users` | quien envía el aviso |
| `role` | `'INVITE' \| 'JOIN'` | |
| `group_id` | FK `groups`, null en `JOIN` | en `INVITE`, el grupo del que soy miembro |
| `status` | ver estados | |
| `peer_id` | FK `proximity_requests`, null | la otra mitad de la pareja |
| `created_at` | timestamptz | **hora del servidor** al recibir el aviso |
| `matched_at` | timestamptz, null | |

**Estados:** `WAITING` → `MATCHED` → `ACCEPTED` \| `REJECTED` \| `EXPIRED`; también `WAITING` → `AMBIGUOUS` \| `EXPIRED`;
y `CANCELLED` si el usuario sale de la pantalla. Ambas mitades de una pareja tienen siempre el mismo estado.

**Decisión mía:** se empareja por la hora **del servidor** al recibir el aviso, no por la hora del celular: los
relojes de dos teléfonos pueden diferir varios segundos; la latencia de red entre ellos suele ser bastante menor.

**Vencimientos (calculados al leer o al escribir, sin tareas en segundo plano):** `WAITING` vence a los 5 s de
`created_at`; `MATCHED` vence a los 30 s de `matched_at`.

### Emparejamiento

Al crear un aviso, dentro de **una transacción serializada** (p. ej. `pg_advisory_xact_lock` con una clave fija, o
`SELECT … FOR UPDATE`; que funcione igual en PGlite):

1. Buscar avisos `WAITING` del **rol opuesto**, de **otro usuario**, con `created_at` dentro de los últimos 3 s.
2. 0 candidatos → el aviso queda `WAITING`.
3. 1 candidato → los dos pasan a `MATCHED` y se enlazan (`peer_id`), con `matched_at = now`.
4. ≥ 2 candidatos → el nuevo aviso y todos los candidatos pasan a `AMBIGUOUS`.
5. **Regla extra (decidida con el usuario): también se mira hacia adelante.** Antes de los pasos 2–4, si existe una
   pareja `MATCHED` cuyo `matched_at` está dentro de los últimos 3 s y en la que el aviso nuevo **podría haber
   participado** (es del rol opuesto a una de sus mitades y de otro usuario), esa pareja **y** el aviso nuevo pasan
   a `AMBIGUOUS`: el servidor ya no sabe cuál era el celular de verdad. Así, el orden de llegada no decide quién
   entra. Mientras una pareja tiene menos de 3 s, en la app quien invita **no ve aún Aceptar/Rechazar** (ve
   «Confirmando…»); `accept` sobre una pareja de menos de 3 s responde `409 PROXIMITY_NOT_PENDING`. Así nunca se
   retira una pareja que alguien ya está aceptando. El vencimiento de 30 s de `MATCHED` cuenta desde `matched_at`.

Transiciones nuevas: `MATCHED` → `AMBIGUOUS` (solo durante sus primeros 3 s).

Un usuario con un aviso propio `WAITING` o `MATCHED` que envía otro: el anterior pasa a `CANCELLED` (un solo intento
activo por usuario).

### Endpoints (todos detrás de `requireAuth`, montados en `/api/proximity`)

| Método y ruta | Quién | Respuesta |
|---|---|---|
| `POST /proximity/invite` `{ groupId }` | miembro del grupo (`403 NOT_A_MEMBER`, `404 GROUP_NOT_FOUND`) | `201 ProximityRequest` |
| `POST /proximity/join` `{}` | cualquiera | `201 ProximityRequest` |
| `GET /proximity/:id` | solo su dueño (`404 PROXIMITY_NOT_FOUND` si no es suyo) | `200 ProximityRequest` |
| `POST /proximity/:id/accept` | dueño de la mitad `INVITE`, estado `MATCHED` | `200 ProximityRequest` (`ACCEPTED`) |
| `POST /proximity/:id/reject` | dueño de la mitad `INVITE`, estado `MATCHED` | `200 ProximityRequest` (`REJECTED`) |
| `DELETE /proximity/:id` | su dueño | `204`; `WAITING`/`MATCHED` → `CANCELLED` (también la otra mitad) |

`accept`/`reject` fuera de `MATCHED` (vencida, ya resuelta) → `409 PROXIMITY_NOT_PENDING`.

`ProximityRequest` (tipo nuevo en `shared/index.d.ts`):

```ts
type ProximityStatus = 'WAITING' | 'MATCHED' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED' | 'AMBIGUOUS' | 'CANCELLED';
type ProximityRequest = {
  id: string;
  role: 'INVITE' | 'JOIN';
  status: ProximityStatus;
  group: { id: string; name: string } | null; // en JOIN, solo se conoce a partir de MATCHED
  peer: { id: string; name: string } | null;  // a partir de MATCHED
  expiresAt: string | null; // ISO, en WAITING y MATCHED; lo usa la app para la cuenta atrás. null en estados finales
  acceptableFrom: string | null; // ISO; en MATCHED, matched_at + 3 s (regla extra); null en otros estados
};
```

**Aceptar** reutiliza `groups.addMember` (igual que `POST /groups/join`). Si quien se une ya era miembro, el aviso
`JOIN` no debería emparejarse con ese grupo: **al emparejar**, si el usuario `JOIN` ya es miembro del grupo de la
invitación, se trata como 0 candidatos para esa pareja (decisión mía; el builder puede elegir mostrar
`ALREADY_MEMBER` en su lugar si resulta más claro). Si al **aceptar** resulta que ya es miembro (se unió con el
código mientras tanto; `addMember` devuelve `false`), la pareja queda `ACCEPTED` igual: termina en el grupo, que es
lo que se buscaba (decisión mía). Si el grupo se borró entre medias, `accept` responde
`404 GROUP_NOT_FOUND` y la pareja pasa a `EXPIRED`.

## App (mobile)

### Módulo nativo `mobile/modules/proximity` (Expo Modules, Kotlin, solo Android)

- `isAvailable(): boolean` — hay sensor `TYPE_PROXIMITY`.
- `startListening()` / `stopListening()` — registra/quita el `SensorEventListener`.
- Evento `onChange({ near: boolean })` — `near = valor < getMaximumRange()` (en muchos sensores es binario: 0 o el máximo).
- Sin implementación iOS: desde JS, si el módulo nativo no existe (Expo Go, iOS), `isAvailable()` es `false`.

Hook `useProximity()` en `src/hooks/` que expone `{ available, near }` y para de escuchar al desmontar o al salir
de foco.

### Giroscopio

`expo-sensors` `Gyroscope` (instalar con `npx expo install expo-sensors`). Hook `useStillness()` → `still: boolean`:
el celular está quieto si la magnitud de la velocidad angular se mantiene bajo un umbral durante una ventana corta.
Umbral y ventana los ajusta el builder probando (punto de partida: < 0,6 rad/s durante 400 ms).

### Pantallas (native-stack, dentro de `AppStack`)

- `ProximityInviteScreen` (params: `groupId`, `name`), desde un botón **Acercar para invitar** en el detalle del
  grupo, junto a la tarjeta del código.
- `ProximityJoinScreen`, desde un botón **Unirse acercando** en «Mis grupos».

Ambas siguen la misma máquina de estados:

1. *Preparado*: instrucciones + ilustración/ícono. Si `available` es `false`: mensaje «Tu celular no tiene sensor de
   proximidad (o estás en Expo Go)» y botón «Usar el código».
2. Al detectar transición lejos→cerca con `still` verdadero: envía el aviso (`POST /proximity/invite|join`) y pasa
   a *Buscando* (≤ 5 s).
3. Consulta `GET /proximity/:id` cada ~1,5 s (`refetchInterval` de TanStack Query) hasta un estado final.
4. `MATCHED` → `Vibration.vibrate()` (de `react-native`, sin dependencia nueva), una vez pasados los 3 s de la regla
   extra (el servidor expone desde cuándo se puede aceptar, p. ej. `acceptableFrom` en `ProximityRequest`; antes,
   «Confirmando…»). Invitador: nombre + Aceptar/Rechazar con cuenta atrás. Quien se une: «Esperando a que X te acepte en Y».
5. `ACCEPTED` → invitador: «Ana ya es parte del grupo» y vuelve al detalle (que recarga miembros); quien se une:
   navega al detalle del grupo e invalida `queryKeys.groups`.
6. `EXPIRED` / `REJECTED` / `AMBIGUOUS` / `CANCELLED` → mensaje y botón «Intentar de nuevo»; siempre visible
   «Usar el código».
7. Al salir de la pantalla con un intento activo → `DELETE /proximity/:id`.

Las llamadas van en `src/api/proximity.ts` (axios, como el resto).

### Build

- Añadir `expo-dev-client` y un perfil `development` en `mobile/eas.json` (`developmentClient: true`,
  `distribution: internal`, APK). Es la excepción ya acordada a «no generar builds por cada cambio».
- Lo demás de la app se sigue probando en Expo Go; estas dos pantallas muestran «no disponible» allí.

## Pruebas

- **Backend (Vitest + Supertest + PGlite, reloj inyectado):** emparejar dentro de 3 s; no emparejar a 3,1 s;
  ambigüedad con 2 candidatos; un aviso que llega ≤ 3 s después de formarse una pareja la anula (y a 3,1 s no);
  `accept` antes de los 3 s responde `409`; un usuario no se empareja consigo mismo; vencimientos de `WAITING` y `MATCHED`;
  solo quien invita acepta/rechaza; aceptar une al grupo; `409` fuera de `MATCHED`; `403` invitar a un grupo ajeno;
  un intento nuevo cancela el anterior; no se ve el aviso de otra persona.
- **App (Jest):** el módulo nativo y `expo-sensors` se mockean en `jest.setup.ts`; tests de `useStillness`, del envío
  solo con lejos→cerca + quieto, y de cada estado de las dos pantallas.
- **Manual:** dos celulares Android con el *development build*: pareja correcta, rechazo, vencimiento, y tres
  celulares a la vez (ambigüedad).

## Documentación

`docs/api.md` (sección nueva «Proximidad»), `shared/index.d.ts`, README (requisitos: proximidad y giroscopio a
✅; cómo generar el development build), `docs/despliegue.md` si cambia algo del build.

## Dependencias de otras ramas

Usa TanStack Query del **PR #43**. Esta rama sale de `develop` una vez integrado #43 (o de
`feature/mobile-tanstack-query` y se rebasa después).

## Lo que queda a criterio del builder

- Formato del id, nombre exacto de la migración, cómo serializar el emparejamiento (siempre que funcione en PGlite y Neon).
- Umbrales del giroscopio y la ilustración/textos finales de las pantallas.
- Estructura interna del módulo Kotlin y del config plugin, si hace falta alguno.
- Orden de los commits.
