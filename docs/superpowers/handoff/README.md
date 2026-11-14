# Traspaso: seguir la fase 6 (cuentas: Google + Brevo) en otro ordenador

Estado al 2026-11-14. Lo que solo existía en el ordenador anterior está ahora en GitHub:

| Qué | Dónde |
|---|---|
| Fases 1–5 | PRs #45, #46, #47, #48, #49 (apilados; #43 y #44 debajo) |
| Fase 6 (cuentas): diseño escrito y revisado | rama `feature/cuentas-google-brevo` (sale de `feature/notificaciones-push`, #49), `docs/superpowers/specs/2026-11-13-cuentas-google-brevo-design.md` |
| Memoria de Claude del proyecto | `docs/superpowers/handoff/memoria/` |

No hay código a medias: la fase 6 está en diseño, esperando que la persona lo apruebe.

---

## Para ti (la persona): pasos en el ordenador nuevo

1. Actualiza el repo y ponte en la rama de la fase 6:
   ```bash
   git fetch --all
   git checkout feature/cuentas-google-brevo
   npm install
   ```
2. `backend/.env` no está en el repo; si ya lo tienes en ese ordenador, sirve igual.
3. Abre Claude Code en la carpeta del repo y pega esto:

   > Lee docs/superpowers/handoff/README.md y sigue la sección «Para Claude». Seguimos con la fase 6.

Pendiente de tu lado (para el final, antes del APK): Firebase (`google-services.json` + clave FCM V1 en EAS), Google
Cloud (clientes OAuth Android con SHA-1 de EAS y Web), Brevo (cuenta, remitente verificado, `BREVO_API_KEY` en Render),
`CRON_SECRET` en Render y como secreto de GitHub, `API_URL` como variable de GitHub, borrar la rama remota
`wip/votacion-expres-task3`, las consultas en Neon y la prueba en dos celulares. Todo quedará en una guía única
(`docs/puesta-en-marcha.md`) al terminar la fase 6.

---

## Para Claude: cómo retomar

1. **Restaura la memoria del proyecto.** Copia los archivos de `docs/superpowers/handoff/memoria/` a tu directorio de
   memoria de este proyecto (el que indica tu prompt de sistema, sección «Memory»). Si ya hay archivos con el mismo
   nombre, quédate con el más completo (normalmente el de esta carpeta, el más reciente). Léelos: tienen la hoja de
   ruta, las decisiones del usuario y lo pendiente. Lo más importante está al final de `nakusuo-paridad.md`.
2. **Dónde quedó la conversación:** la fase 6 (cuentas) terminó el brainstorming. Decisiones del usuario: verificación
   del correo obligatoria; 2FA por código al correo, solo para login con contraseña; enfoque A (sin código no hay JWT:
   login/registro devuelven un `challenge`); sin «añadir por correo»; el QR va a la versión posterior a la exposición;
   **tras esta fase se genera el APK** y antes debe quedar todo documentado (`docs/puesta-en-marcha.md`).
   La spec `docs/superpowers/specs/2026-11-13-cuentas-google-brevo-design.md` (e18e03a) ya pasó el builder check. Se le
   presentaron al usuario 9 decisiones de seguridad tomadas por Claude (lista al final de la spec, «Decisiones tomadas
   por Claude») y **falta su aprobación**.
3. **Siguiente paso:** pregunta al usuario si aprueba la spec (y esas decisiones). Con su OK: skill
   `superpowers:writing-plans` → plan en `docs/superpowers/plans/2026-11-13-cuentas-google-brevo.md` → ejecutar con
   `superpowers:subagent-driven-development`, **sin pausas** hasta terminar las tareas, la revisión final y sus
   arreglos (el usuario lo pidió así en todas las fases). Push y PR solo con su OK (PR apilado: base
   `feature/notificaciones-push` mientras #49 no esté integrado).
4. Commits: identidad `Aless Bustamante <fabrizio.bs9012@gmail.com>` vía variables GIT_AUTHOR_*/GIT_COMMITTER_* (ver
   memoria `git-flow.md`). En Windows, Node 22 con fnm (ver `v3-apk-progreso.md`, «Entorno del segundo ordenador»).
5. Antes de terminar la fase, borra esta carpeta de traspaso (`git rm -r docs/superpowers/handoff`) en un commit
   `docs: quitar el traspaso entre ordenadores`.
