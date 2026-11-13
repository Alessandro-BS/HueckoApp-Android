# Notificaciones push (fase 5)

Fecha: 2026-11-13 · Rama: `feature/notificaciones-push` (sale de `feature/horario-y-votacion`, PR #48, mientras #43–#48
no estén integrados).

## Intención

Las notificaciones push son un requisito del curso para la presentación (junto con Retrofit/Volley, cámara, ubicación y
sensores, ya hechos). Hoy la app no avisa de nada: hay que abrirla para enterarse de una propuesta nueva, de que el plan
se confirmó o de que alguien imprescindible falta. El usuario pidió adelantar las push a la fase 5 (hoja de ruta
reordenada el 2026-11-13) para que las fases siguientes también puedan avisar.

## Objetivos

- Llegan al celular, aunque la app esté cerrada, seis avisos: nueva propuesta, plan confirmado, plan cancelado, ausencia
  crítica (votación exprés abierta), resultado de la votación exprés y recordatorio 1 h antes del plan.
- Tocar un aviso abre la pantalla del plan (o «Votar»).
- Los avisos que dependen de la hora salen aunque nadie abra la app (barrido en el servidor + despertador).
- Cada persona puede apagarlas en su celular desde Perfil.

## No objetivos

- Avisos de gestión del grupo (alguien se unió, te nombraron organizador, expulsión): fase 6 y siguientes, sobre esta
  base.
- Elegir la antelación del recordatorio o silenciar por tipo.
- Avisos por correo (fase de cuentas) y tiempo real dentro de la app (fase 12).
- iOS (el APK es Android; el código no lo impide, pero no se configura APNs).
- Recibos de Expo (`getReceipts`): se usan solo los tickets del envío.

## Anti-objetivos (sería un fracaso aunque funcione)

- Un mismo aviso que llega dos veces (dos barridos o dos envíos a la vez, reintentos).
- Un aviso que se pierde porque Expo falló o Render se reinició entre el cambio y el envío.
- Un aviso de un cambio que no llegó a guardarse (la transacción se deshizo).
- Avisar a quien hizo la acción, o a quien ya no está en el grupo.
- Seguir mandando avisos a un celular tras cerrar sesión o tras apagar el interruptor.
- Cualquier secreto (clave de la cuenta de servicio de Firebase, `CRON_SECRET`, `EXPO_ACCESS_TOKEN`) en el repo o en la
  app.

## Restricciones

- Migración nueva al final de `backend/src/db/migrations.ts` (la 12).
- `shared/index.d.ts` y `docs/api.md` cambian en el mismo commit que el endpoint. Errores con `ApiError`, zod, SQL
  parametrizado.
- `app.ts` no arranca temporizadores (se prueba con Supertest); el barrido vive en `index.ts`.
- Expo SDK 57: `npx expo install expo-notifications`; push remotas no funcionan en Expo Go en Android (desde el SDK 53):
  solo development build o APK. `getExpoPushTokenAsync({ projectId })` con el `projectId` de EAS. En Android 13+ el
  permiso solo se pide después de crear un canal.
- Expo Push API: `POST https://exp.host/--/api/v2/push/send`, hasta 100 mensajes por petición; reintentar errores de red,
  429 y 5xx; `DeviceNotRegistered` → dejar de enviar a ese token. `EXPO_ACCESS_TOKEN` opcional (`Authorization: Bearer`).
- `google-services.json` se puede subir al repo (identificadores públicos); la clave de la cuenta de servicio (FCM V1) se
  sube solo a EAS y nunca al repo.
- Render gratis duerme a los 15 min sin tráfico y da 750 h/mes: el despertador cada 10 min lo mantiene despierto
  (~744 h/mes).

## Enfoques considerados

Cómo pasa un cambio de estado a una push:

- **A. Bandeja de salida (elegido):** cada cambio escribe filas en `notifications` en su misma transacción; un envío
  inmediato tras la respuesta y el barrido de cada minuto mandan lo pendiente y lo marcan. Nada se pierde ni se duplica,
  y da igual que el cambio venga de una petición, del barrido o del admin.
- B. Enviar al momento sin guardar (como la recomendación de la IA): más simple, pero se pierde si falla o si el servidor
  se duerme.

Cómo se disparan los avisos que dependen de la hora:

- **Barrido cada minuto + despertador de GitHub Actions cada 10 min (elegido).**
- Recordatorio local en el celular: hora exacta, pero se desfasa si el plan cambia con la app cerrada, y los cierres solo
  avisarían al abrir la app.
- Render de pago: sin despertador, ~7 USD/mes.

## Diseño (decidido con el usuario)

### Avisos

| `kind` | Cuándo | A quién | `data.screen` |
|---|---|---|---|
| `NEW_PROPOSAL` | se crea una propuesta | miembros del grupo menos quien la creó | `VOTING` |
| `PLAN_CONFIRMED` | se confirma a mano o al cerrarse la votación sola | miembros del grupo; a mano, menos quien confirmó | `PLAN` |
| `PLAN_CANCELLED` | se cancela a mano, desde el admin, sin votos (cierre automático) o por votación exprés `CANCELAR` | miembros del grupo; a mano, menos quien canceló | `PLAN` |
| `EXPRESS_OPENED` | se abre una votación exprés | sus votantes (miembros menos quien avisó) | `PLAN` |
| `EXPRESS_RESULT` | se cierra una votación exprés | miembros del grupo | `PLAN` |
| `REMINDER` | desde 60 min antes del inicio de un plan `CONFIRMADO` que aún no empezó | miembros del grupo sin una incidencia `FALTA`/`IMPREVISTO` en ese plan | `PLAN` |

- Destinatarios = miembros **actuales** del grupo en el momento del cambio.
- `data` = `{ kind, proposalId, groupId, screen }`.
- Textos (título · cuerpo), con `{grupo}`, `{plan}` (título de la propuesta), `{nombre}` y `{cuándo}` = «jueves 16
  de octubre, 16:00» en `America/Lima`:
  - `NEW_PROPOSAL`: «{grupo}» · «{nombre} propuso «{plan}». Vota tus franjas.»
  - `PLAN_CONFIRMED`: «{grupo}» · ««{plan}» se confirmó para el {cuándo}.»
  - `PLAN_CANCELLED`: «{grupo}» · ««{plan}» se canceló.» (sin votos: ««{plan}» se canceló: nadie votó antes del
    plazo.»)
  - `EXPRESS_OPENED`: «{grupo}» · «{nombre} no podrá ir a «{plan}» ({razón crítica}). Vota qué hacer.»
  - `EXPRESS_RESULT`: «{grupo}» · «El grupo decidió {mantener|reagendar|cancelar} «{plan}».» (sin quórum: «Sin quórum:
    «{plan}» se mantiene.»)
  - `REMINDER`: «{grupo}» · ««{plan}» empieza a las {HH:mm}{ en {lugar}}.»
- `REMINDER` lleva `dedupe_key = reminder:{proposalId}:{userId}:{scheduledAt}`: uno por persona y hora; si el plan se
  replantea y se confirma para otra hora, sale otro.

### Datos

Migración 12, en una transacción:

```sql
CREATE TABLE push_devices (
  token        TEXT COLLATE "C" PRIMARY KEY,
  user_id      TEXT COLLATE "C" NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at   TEXT COLLATE "C" NOT NULL,
  last_seen_at TEXT COLLATE "C" NOT NULL
);
CREATE INDEX push_devices_user_idx ON push_devices (user_id);
CREATE TABLE notifications (
  id         TEXT COLLATE "C" PRIMARY KEY,
  seq        BIGINT GENERATED ALWAYS AS IDENTITY UNIQUE,
  user_id    TEXT COLLATE "C" NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind       TEXT COLLATE "C" NOT NULL CHECK (kind IN ('NEW_PROPOSAL', 'PLAN_CONFIRMED', 'PLAN_CANCELLED',
                                                       'EXPRESS_OPENED', 'EXPRESS_RESULT', 'REMINDER')),
  title      TEXT COLLATE "C" NOT NULL,
  body       TEXT COLLATE "C" NOT NULL,
  data       TEXT COLLATE "C" NOT NULL,
  dedupe_key TEXT COLLATE "C" UNIQUE,
  created_at TEXT COLLATE "C" NOT NULL,
  sent_at    TEXT COLLATE "C",
  attempts   INTEGER NOT NULL DEFAULT 0,
  last_error TEXT COLLATE "C"
);
CREATE INDEX notifications_pending_idx ON notifications (seq) WHERE sent_at IS NULL;
```

(`data` es JSON en texto, como el resto de columnas de texto del esquema; los tipos exactos pueden ajustarse al estilo
de las migraciones existentes.)

### API y contrato

- `PUT /me/push-devices` `{ token }` (`PushDeviceInput`): `token` debe ser `ExponentPushToken[...]` o
  `ExpoPushToken[...]` (`400 VALIDATION_ERROR` si no). Inserta o, si ya existía (también de otra cuenta), lo pasa a mí y
  actualiza `last_seen_at`. `204`.
- `DELETE /me/push-devices/:token`: borra ese token si es mío. `204` siempre (idempotente).
- `POST /api/internal/tick`: sin JWT, `Authorization: Bearer <CRON_SECRET>` comparado en tiempo constante. Sin
  `CRON_SECRET` configurado la ruta no existe (`404`); secreto incorrecto o ausente → `401 UNAUTHORIZED`. Corre el
  barrido y responde `200 { closed, reminders, sent }` (conteos).
- `docs/api.md`: §Notificaciones (avisos, textos, destinatarios), las dos rutas de `/me`, §Internal, tabla de errores.

### Servidor

- `backend/src/notifications/`:
  - `notifications.repository.ts`: `enqueue(db, items)` (inserta filas; con `dedupe_key` usa `ON CONFLICT DO NOTHING`)
    y las consultas del envío; dispositivos (`upsertDevice`, `deleteDevice`, `devicesOf`).
  - `messages.ts`: funciones puras que arman título, cuerpo y `data` de cada `kind` (textos de arriba).
  - `push-client.ts`: interfaz `PushClient.send(messages): Promise<PushTicket[]>`; `createExpoPushClient({ accessToken
    })` con `fetch` a la Expo Push API (lotes de 100, `channelId: 'planes'`, `priority: 'high'`, `sound: 'default'`,
    timeout); `createNoopPushClient()` por defecto (dev sin red y tests que no lo inyectan).
  - `flush.ts`: `flushNotifications(db, push, now)` — toma hasta N pendientes con `FOR UPDATE SKIP LOCKED` en una
    transacción corta, arma un mensaje por cada token del destinatario, envía, y por cada aviso: algún ticket `ok` o
    ningún token → `sent_at = now`; error de red/429/5xx → `attempts + 1` y `last_error` (con 5 intentos se marca
    `sent_at` y se deja el error: abandonado); `DeviceNotRegistered` en un ticket → borra ese token. Nunca lanza.
  - `tick.ts`: `tick(db, push, now)` = `closeDueProposals(db, { all: true }, now)` + cierre de las votaciones exprés
    vencidas de todos los grupos + `enqueueDueReminders(db, now)` + `flushNotifications`. Nunca lanza; devuelve los
    conteos.
- Los avisos se encolan **dentro de la transacción** del cambio: crear propuesta (`proposals.create`), `confirm`,
  `cancel` (organizador y admin), `closeProposalIfDue`, `reportIncidence` al abrir la votación exprés, `closeDue` de la
  exprés (resultado y, si `CANCELAR`, también `PLAN_CANCELLED`). Quien hace la acción a mano se excluye; en el admin no
  hay excluido.
- Tras responder una petición que encoló avisos, `onBackgroundTask(flushNotifications(...))` sin esperar (como la IA).
- `index.ts`: `setInterval(() => void tick(db, push, new Date()), 60_000)` (con `unref` y parado en el apagado).
- `ResolvedDeps` suma `push: PushClient` (por defecto el noop; `index.ts` crea el de Expo) y `cronSecret?: string`.
- Entorno (zod): `CRON_SECRET` opcional (si viene, ≥ 32 caracteres); `EXPO_ACCESS_TOKEN` opcional. `.env.example` y
  `render.yaml` los declaran sin valor.
- `.github/workflows/despertador.yml`: `schedule: cron '*/10 * * * *'` + `workflow_dispatch`; `curl -fsS -X POST
  "$API_URL/api/internal/tick" -H "Authorization: Bearer $CRON_SECRET"` con `vars.API_URL` y `secrets.CRON_SECRET`; si
  falta alguno, el job termina sin error.

### App

- `npx expo install expo-notifications` (y `expo-device` solo si hace falta para detectar emulador). Plugin en
  `app.json` con `icon` (PNG blanco 96×96 con transparencia, generado del logo) y `color` de la marca.
- `src/notifications/`:
  - `registerDevice()`: si es Expo Go (`Constants.executionEnvironment === 'storeClient'`) no hace nada. Crea el canal
    Android `planes` (importancia alta), pide permiso, `getExpoPushTokenAsync({ projectId })`, guarda el token en
    `appStorage` y `PUT /me/push-devices`. Devuelve `'registered' | 'denied' | 'unavailable'`; nunca lanza.
  - `unregisterDevice()`: `DELETE` del token guardado (sin esperar si no hay red) y lo olvida.
  - `useNotificationNavigation(navigationRef)`: `setNotificationHandler` (banner + lista + sonido), al recibir con la app
    abierta invalida Inicio y el plan (`queryClient.invalidateQueries`), al tocar navega según `data.screen`
    (`VOTING` → «Votar»; `PLAN` → detalle), también con la app cerrada (`getLastNotificationResponseAsync`).
- `AuthContext`: al iniciar sesión o abrir con sesión, `registerDevice()` si el interruptor está encendido (por defecto,
  sí); `logout` llama a `unregisterDevice()` antes de borrar el JWT.
- `appStorage`: `pushToken` y `notificationsEnabled` (no secretos; se borran al cerrar sesión salvo la preferencia del
  interruptor, que es del celular).
- Perfil: interruptor «Notificaciones en este celular». Encender → `registerDevice()`; `'denied'` → «Activa las
  notificaciones de HueckoApp en los ajustes del teléfono» + botón «Abrir ajustes» (`Linking.openSettings()`); apagar →
  `unregisterDevice()`. En Expo Go se muestra deshabilitado con «Disponible en la app instalada (APK)».
- `App.tsx`: `navigationRef` (`createNavigationContainerRef`) para navegar desde fuera de las pantallas.
- `app.json` apunta a `google-services.json` (`android.googleServicesFile`) solo cuando el archivo exista en `mobile/`;
  hasta entonces no se añade, para no romper la compilación.

### Lo que hace el usuario (guía en `docs/despliegue.md`)

1. Firebase: crear el proyecto, añadir la app Android con el paquete de `app.json` y descargar `google-services.json` a
   `mobile/` (se puede subir al repo).
2. Firebase → Configuración → Cuentas de servicio → «Generar nueva clave privada»; subirla con `eas credentials` →
   Android → production → Google Service Account → FCM V1. No va al repo (`.gitignore`).
3. Render: `CRON_SECRET` (y `EXPO_ACCESS_TOKEN` si activa la seguridad reforzada). GitHub: secreto `CRON_SECRET` y
   variable `API_URL`.

## Mis decisiones (no las tomó el usuario; revisables)

- Textos exactos de cada aviso (tabla de arriba) y `{cuándo}` en `America/Lima`.
- 5 intentos antes de abandonar un aviso; sin recibos de Expo.
- El recordatorio no va a quien reportó `FALTA`/`IMPREVISTO`; sí a quien reportó `TARDANZA`.
- Con la app abierta se muestra el banner y además se refresca Inicio y el plan.
- La preferencia del interruptor es del celular y sobrevive al cerrar sesión; el token no.
- Sin `CRON_SECRET` la ruta del despertador no existe (no hay forma de llamarla sin configurar el secreto).

## Pruebas

- Backend (Vitest, cliente push falso, reloj inyectable, PGlite):
  - migración 12 desde la versión 11;
  - cada `kind` encolado con destinatarios exactos (sin quien actúa, solo miembros actuales) y textos;
  - atomicidad: si el cambio se deshace (p. ej. `confirm` que devuelve `false`), no queda aviso;
  - recordatorio: una vez por persona y hora (dos barridos), otro tras replantear y reconfirmar, nada para quien reportó
    falta, nada para planes ya empezados;
  - envío: lotes de 100, varios celulares por persona, reintentos hasta 5, `DeviceNotRegistered` borra el token, sin
    celulares → enviado, dos envíos a la vez no repiten (`interleave` con `SKIP LOCKED`);
  - `tick` de punta a punta (cierre automático → `PLAN_CONFIRMED` enviado);
  - `/internal/tick`: `404` sin `CRON_SECRET`, `401` con uno incorrecto, `200` con el correcto;
  - `/me/push-devices`: registrar, pasar de una cuenta a otra, `400` con token inválido, borrar idempotente.
- App (Jest con `expo-notifications` simulado): registro al iniciar sesión y borrado al cerrar; interruptor de Perfil
  (encender, denegado con «Abrir ajustes», apagar); Expo Go sin pedir nada; tocar un aviso navega a «Votar» o al plan
  (también con la app cerrada); aviso con la app abierta invalida las consultas.
- Docs: `docs/api.md`, `shared/index.d.ts`, README (tests y función), `docs/guia-de-pruebas.md` (pasos con el
  development build y dos celulares), `docs/despliegue.md` (Firebase, EAS, Render, GitHub).
