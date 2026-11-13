# Traspaso: seguir la fase 2 en otro ordenador

Estado al 2026-11-13. Todo lo que solo existía en el ordenador anterior está en GitHub:

| Qué | Dónde |
|---|---|
| Fase 1 (franjas con fecha) | PR #45, rama `feature/franjas-con-fecha` (apilado sobre #44) |
| Fase 2 (votación exprés grupal): diseño, plan, Tasks 1–2 | rama `feature/votacion-expres-grupal` |
| Task 3 a medias (sin probar ni commitear) | rama `wip/votacion-expres-task3` (un solo commit WIP encima de la anterior) |
| Registro de avance de los subagentes (ledger, briefs, reports) | `docs/superpowers/handoff/sdd/` (en el original vive en `.superpowers/sdd/`, ignorado por git) |
| Memoria de Claude del proyecto | `docs/superpowers/handoff/memoria/` |

---

## Para ti (la persona): pasos en el ordenador nuevo

1. Clona o actualiza el repo y ponte en la rama de la fase 2:
   ```bash
   git clone https://github.com/Alessandro-BS/HueckoApp-Android.git   # o, si ya lo tienes: git fetch --all
   cd HueckoApp-Android
   git checkout feature/votacion-expres-grupal
   npm install
   ```
2. Crea `backend/.env` a partir de `backend/.env.example`. Los secretos (`GEMINI_API_KEY`, `JWT_SECRET`, `DATABASE_URL`)
   **no están en el repo**: cópialos del ordenador anterior o de Render. Para los tests no hacen falta.
3. Abre Claude Code en la carpeta del repo y pega esto:

   > Lee docs/superpowers/handoff/README.md y sigue la sección «Para Claude». Continúa la fase 2 con subagentes desde
   > donde quedó, sin parar, y avísame cuando termine.

Eso es todo. Lo manual que sigue pendiente (lo harás al final): la consulta en Neon antes de desplegar (está en
`memoria/nakusuo-paridad.md`) y la prueba en dos celulares.

---

## Para Claude: cómo retomar

1. **Restaura la memoria del proyecto.** Copia los archivos de `docs/superpowers/handoff/memoria/` a tu directorio de
   memoria de este proyecto (el que indica tu prompt de sistema, sección «Memory»). Si ya hay archivos con el mismo
   nombre, quédate con el más completo. Léelos: tienen las decisiones del usuario (paridad con Nakusuo) y lo pendiente.
2. **Restaura el registro de avance de los subagentes:**
   ```bash
   mkdir -p .superpowers/sdd
   cp -r docs/superpowers/handoff/sdd/2026-11-13-votacion-expres-grupal .superpowers/sdd/
   ```
   `.superpowers/` está en `.gitignore`. Los `review-*.diff` no se copiaron: se regeneran con el script
   `review-package` cuando hagan falta.
3. **Recupera la Task 3 a medias** como cambios sin commitear sobre `feature/votacion-expres-grupal`:
   ```bash
   git checkout feature/votacion-expres-grupal
   git diff feature/votacion-expres-grupal origin/wip/votacion-expres-task3 | git apply
   git status   # ~18 archivos modificados + backend/test/express-vote.test.ts nuevo
   ```
   Cuando la Task 3 tenga su commit, borra la rama WIP: `git push origin --delete wip/votacion-expres-task3`.
4. **Sigue con la skill `superpowers:subagent-driven-development`** sobre el plan
   `docs/superpowers/plans/2026-11-13-votacion-expres-grupal.md`. El ledger
   `.superpowers/sdd/2026-11-13-votacion-expres-grupal/progress.md` dice exactamente dónde quedó: Tasks 1–2 completas;
   Task 3 detenida a medias (el ledger lleva la nota de reanudación y la regla sobre `open` dentro de la transacción).
   Despacha un implementador nuevo (opus) para la Task 3 con su brief, avisándole del trabajo parcial ya aplicado.
5. El usuario quiere que se siga **sin pausas** hasta terminar las 8 tareas, la revisión final y sus arreglos; push y PR
   solo con su OK (PR apilado: base `feature/franjas-con-fecha` mientras #45 no esté integrado).
6. Antes de terminar, borra esta carpeta de traspaso del repo (`git rm -r docs/superpowers/handoff`) en un commit
   `docs: quitar el traspaso entre ordenadores`.
