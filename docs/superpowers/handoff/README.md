# Traspaso: seguir la fase 5 (notificaciones push) en otro ordenador

Estado al 2026-11-13. Lo que solo existía en el ordenador anterior está ahora en GitHub:

| Qué | Dónde |
|---|---|
| Fases 1–4 | PRs #45, #46, #47, #48 (apilados) |
| Fase 5 (push): diseño, plan, Tasks 1–3 hechas y revisadas | rama `feature/notificaciones-push` (sale de `feature/horario-y-votacion`, #48) |
| Registro de avance de los subagentes (ledger, briefs, reports) | `docs/superpowers/handoff/sdd/` (en el original vive en `.superpowers/sdd/`, ignorado por git) |
| Memoria de Claude del proyecto | `docs/superpowers/handoff/memoria/` |

No hay trabajo a medias: la Task 4 tiene su brief escrito pero no se empezó.

---

## Para ti (la persona): pasos en el ordenador nuevo

1. Actualiza el repo y ponte en la rama de la fase 5:
   ```bash
   git fetch --all
   git checkout feature/notificaciones-push
   npm install
   ```
2. `backend/.env` no está en el repo. Si ya lo tienes en ese ordenador, sirve igual (la fase 5 aún no pide variables
   nuevas para los tests).
3. Abre Claude Code en la carpeta del repo y pega esto:

   > Lee docs/superpowers/handoff/README.md y sigue la sección «Para Claude». Continúa la fase 5 con subagentes desde
   > donde quedó, sin parar, y avísame cuando termine.

Pendiente de tu lado (para el final): crear el proyecto de Firebase (`google-services.json` en `mobile/` y la clave
FCM V1 en EAS, nunca en el repo), `CRON_SECRET` en Render y como secreto de GitHub, `API_URL` como variable de GitHub,
borrar la rama remota `wip/votacion-expres-task3`, las consultas en Neon y la prueba en dos celulares.

---

## Para Claude: cómo retomar

1. **Restaura la memoria del proyecto.** Copia los archivos de `docs/superpowers/handoff/memoria/` a tu directorio de
   memoria de este proyecto (el que indica tu prompt de sistema, sección «Memory»). Si ya hay archivos con el mismo
   nombre, quédate con el más completo (normalmente el de esta carpeta, que es el más reciente). Léelos: tienen la hoja
   de ruta (fases 5–12 y Final), las decisiones del usuario y lo pendiente.
2. **Restaura el registro de avance de los subagentes:**
   ```bash
   mkdir -p .superpowers/sdd
   cp -r docs/superpowers/handoff/sdd/2026-11-13-notificaciones-push .superpowers/sdd/
   ```
   Si `.superpowers/` no está ignorado en ese clon, añádelo a `.git/info/exclude`. Los `review-*.diff` no se copiaron:
   se regeneran con el script `review-package` cuando hagan falta.
3. **Sigue con la skill `superpowers:subagent-driven-development`** sobre el plan
   `docs/superpowers/plans/2026-11-13-notificaciones-push.md`. El ledger
   `.superpowers/sdd/2026-11-13-notificaciones-push/progress.md` dice dónde quedó: Tasks 1–3 completas; Task 4 con
   brief (`task-4-brief.md`) sin despachar, BASE = el commit de la Task 3 (`5ff06f7`); el commit de este traspaso
   solo añade esta carpeta.
   Al despachar la Task 4, pásale las reglas del ledger que le tocan: C (`closeDueProposals` / `closeDueInScope`
   devuelven `Promise<number>` para el conteo del tick), D (`CRON_SECRET` vacío = sin configurar) y G (tras un error
   de transporte se conserva `claimed_at` como espera de 5 min). El cableado de `createExpoPushClient` en `index.ts`
   es trabajo de la Task 4.
4. El usuario quiere que se siga **sin pausas** hasta terminar las 6 tareas, la revisión final y sus arreglos; push y
   PR solo con su OK (PR apilado: base `feature/horario-y-votacion` mientras #48 no esté integrado).
5. Antes de terminar la fase, borra esta carpeta de traspaso (`git rm -r docs/superpowers/handoff`) en un commit
   `docs: quitar el traspaso entre ordenadores`.
