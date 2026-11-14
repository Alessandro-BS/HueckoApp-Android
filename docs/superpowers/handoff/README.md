# Traspaso: la fase 6 está terminada; seguir en otro ordenador

Estado al 2026-11-14. Todo está en GitHub, en la rama `feature/cuentas-google-brevo`.

| Qué | Dónde |
|---|---|
| Fases 1–5 | PRs #45, #46, #47, #48, #49 (apilados; #43 y #44 debajo) |
| Fase 6 (cuentas: Google + Brevo) **terminada y revisada** | rama `feature/cuentas-google-brevo` (sale de `feature/notificaciones-push`, #49). Spec `docs/superpowers/specs/2026-11-13-cuentas-google-brevo-design.md`, plan `docs/superpowers/plans/2026-11-13-cuentas-google-brevo.md` |
| Guía de lo que falta antes del APK | `docs/puesta-en-marcha.md` |
| Memoria de Claude del proyecto | `docs/superpowers/handoff/memoria/` |

No hay código a medias. Tests al cerrar: backend 1068/1068, mobile 775/775 (`--maxWorkers=2`), typecheck limpio.
**Falta abrir el PR #50** (no se abrió todavía: esperaba el OK del usuario).

---

## Para ti (la persona): pasos en el otro ordenador

1. Actualiza el repo y ponte en la rama de la fase 6:
   ```bash
   git fetch --all
   git checkout feature/cuentas-google-brevo
   git pull
   npm install
   ```
   (`npm install` hace falta: la fase 6 añadió `google-auth-library` al backend y
   `@react-native-google-signin/google-signin` a la app.)
2. `backend/.env` no está en el repo. Si quieres probar los correos de verdad, agrega `BREVO_API_KEY`,
   `BREVO_SENDER_EMAIL` y, para Google, `GOOGLE_WEB_CLIENT_ID` (ver `backend/.env.example`). Sin `BREVO_API_KEY` el
   backend escribe los códigos en su log, que basta para probar en desarrollo.
3. Abre Claude Code en la carpeta del repo y pega esto:

   > Lee docs/superpowers/handoff/README.md y sigue la sección «Para Claude».

---

## Para Claude: cómo retomar

1. **Restaura la memoria del proyecto.** Copia los archivos de `docs/superpowers/handoff/memoria/` a tu directorio de
   memoria de este proyecto (el que indica tu prompt de sistema, sección «Memory»). Si ya hay archivos con el mismo
   nombre, quédate con el más completo (normalmente el de esta carpeta, el más reciente). Léelos: el final de
   `nakusuo-paridad.md` tiene el estado de la fase 6.
2. **Dónde quedó:** fase 6 terminada (8 tareas con revisión por tarea, revisión final de toda la rama y sus arreglos).
   Al usuario se le presentaron las 19 decisiones tomadas por Claude (resumidas abajo) y el menú de cierre; respondió
   «guárdalo en GitHub para seguir en otro ordenador». Se hizo push de la rama, **sin abrir el PR**.
3. **Siguiente paso:** pregunta al usuario si abre el **PR #50** (`feature/cuentas-google-brevo` → base
   `feature/notificaciones-push`, apilado sobre #49), con un cuerpo que resuma la fase y enlace la spec, el plan y
   `docs/puesta-en-marcha.md`. Después, si quiere:
   - PR de seguimiento con los hallazgos de Sourcery en #43 que siguen sin arreglar en todo el stack: al salir de un
     grupo no se invalida la caché de Inicio (`useGroup.leave`); crear/unirse con la lista de grupos sin caché la
     reemplaza solo con el grupo nuevo; las pestañas Planes y Disponibilidad siguen con `useResource` (sin los
     reintentos de TanStack Query).
   - Acompañarle con `docs/puesta-en-marcha.md` (Firebase, Google Cloud OAuth Android + Web con el SHA-1 de
     `eas credentials`, Brevo, Render/GitHub, consultas en Neon, integrar #43 → #50 en orden, release 3.0.0, desplegar
     el backend y repartir el APK nuevo a la vez, prueba en dos celulares, borrar la rama remota
     `wip/votacion-expres-task3`).
4. Commits: identidad `Aless Bustamante <fabrizio.bs9012@gmail.com>` vía variables GIT_AUTHOR_*/GIT_COMMITTER_* (ver
   memoria `git-flow.md`). En Windows, Node 22 con fnm (ver `v3-apk-progreso.md`, entornos de cada ordenador). Tests de
   mobile siempre con `--maxWorkers=2`; vitest desde una ruta con la `C:` en mayúscula.
5. Antes de abrir el PR, borra esta carpeta de traspaso (`git rm -r docs/superpowers/handoff`) en un commit
   `docs: quitar el traspaso entre ordenadores` y haz push.

### Decisiones tomadas por Claude en la fase 6 (ya presentadas al usuario)

1. Rutas del 2FA en `/api/auth/me/2fa/*`.
2. Columna `send_count` en `auth_challenges`.
3. Google opcional en producción (sin `GOOGLE_WEB_CLIENT_ID` → 503 y botón oculto); Brevo obligatorio.
4. Si Brevo falla en registro/login no se devuelve el reto; repetir reenvía.
5. Código correcto en cuenta suspendida: efecto aplicado y 403 sin token.
6. `CODE_RATE_LIMIT` 30 / 15 min por IP en verify, resend y forgot.
7. Variables vacías en Render → valor por defecto; «olvidé» responde igual si Brevo falla.
8. `make-admin` verifica el correo.
9. Re-registrar un correo sin verificar anula sus códigos (anti-apropiación).
10. Siempre se bloquea la fila de la cuenta antes que la del reto.
11. Se aceptan los oráculos activos de enumeración en resend/verify de retos falsos.
12. Vincular Google a una cuenta sin verificar borra contraseña y 2FA y anula sus códigos.
13. Correo vinculado a otra cuenta de Google → `409 GOOGLE_ACCOUNT_MISMATCH`.
14. Nombre de Google recortado a 80 caracteres.
15. Activar/desactivar 2FA: 5 intentos cada 15 min por cuenta (cuenta también los éxitos).
16. Activar con el 2FA ya activo → `409 TWO_FACTOR_ALREADY_ENABLED` sin correo.
17. Textos «Escribe los 6 dígitos del código.» y «Contraseña actualizada. Bienvenido a HueckoApp.».
18. Freno global `BREVO_DAILY_LIMIT` = 280 correos/día → `503 EMAIL_QUOTA_EXHAUSTED`.
19. Timeout de 60 s para el test que aplica todas las migraciones.
