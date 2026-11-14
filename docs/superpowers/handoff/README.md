# Traspaso: la v3.0.0 está lista para salir; seguir en otro ordenador

Estado al 2026-11-14. Esta carpeta vive **solo** en la rama `docs/traspaso-v3` (sale de `release/3.0.0`), para no
mezclarla con el PR de la release.

| Qué | Dónde |
|---|---|
| Fases 1–6, arreglos de Sourcery y configuración | **Integrados en `develop`** (PRs #43–#52, CI verde tras cada uno) |
| Release 3.0.0 (versión, CHANGELOG, README con «📲 Probar la v3.0.0 paso a paso», guía de puesta en marcha al día) | Rama `release/3.0.0`, **PR #53 → `main` abierto, sin integrar** |
| Producción | Render despliega `main` con **Auto-Deploy On Commit**; hoy corre la **v2.0.0** |
| Guía de lo que se configura fuera del código | `docs/puesta-en-marcha.md` (pasos 1–6 hechos) |
| Memoria de Claude del proyecto | `docs/superpowers/handoff/memoria/` |

Ya configurado y comprobado: Firebase (FCM V1, clave en EAS), Google Cloud (clientes Android y Web, consentimiento
**en producción**, clave de Android restringida), Brevo (remitente verificado, clave restringida en Render), Render
(variables Brevo, Google y `CRON_SECRET`, guardadas sin desplegar), GitHub (`CRON_SECRET` y `API_URL`), Neon (las 4
consultas de control dieron lo esperado) y GitHub Pages (portada y política de privacidad en la rama `gh-pages`).

---

## Para ti (la persona): pasos en el otro ordenador

1. Trae los cambios y ponte en la rama del traspaso:
   ```bash
   git fetch --all --prune
   git checkout docs/traspaso-v3
   git pull
   npm install
   ```
   Usa Node 22 (`fnm use 22`; en PowerShell, antes: `fnm env --shell powershell | Out-String | Invoke-Expression`).
2. No hace falta ninguna clave secreta para seguir: las de producción viven en Render, EAS y GitHub. Solo si quieres
   levantar el backend en esa PC, copia `backend/.env.example` a `backend/.env` (ver «B. Expo Go» en el README).
3. Para generar el APK desde esa PC, inicia sesión en Expo una vez: desde `mobile/`, `npx eas-cli@latest login`
   (cuenta `alessandro-bs`). Para PRs, `gh auth status` (y `gh auth login` si hace falta).
4. Abre Claude Code en la carpeta del repo y pega esto:

   > Lee docs/superpowers/handoff/README.md y sigue la sección «Para Claude».

---

## Para Claude: cómo retomar

1. **Restaura la memoria del proyecto.** Copia los archivos de `docs/superpowers/handoff/memoria/` a tu directorio de
   memoria de este proyecto (el que indica tu prompt de sistema, sección «Memory»). Si ya hay archivos con el mismo
   nombre, quédate con el más completo (normalmente el de esta carpeta). Lee el final de `nakusuo-paridad.md` y de
   `git-flow.md` (lección sobre PR apilados).
2. **Dónde quedó:** todo integrado en `develop`; `release/3.0.0` con el PR #53 abierto. El usuario decidió dejar el APK
   para después y **no** quiso probar en Expo Go por ahora. La presentación la hará desde su otro ordenador.
3. **Siguiente paso, en este orden** (pregunta al usuario cuándo quiere hacerlo; ya autorizó que Claude integre los PR
   y haga la release):
   1. **APK** desde `release/3.0.0`: el usuario lo lanza en su terminal (pide login e interacción):
      `cd mobile` y `npx eas-cli@latest build -p android --profile preview`. Debe usar el keystore existente
      (*Build Credentials bOH27KiccS*, SHA-1 `B3:67:95:F8:0C:09:E3:E8:4F:26:DA:27:A8:7B:C8:7B:07:DF:5E:C5`): **nunca**
      uno nuevo, porque Google Cloud tiene registrado ese SHA-1. Tarda 15–20 min.
   2. Con el APK listo, **integra el PR #53 en `main`** (merge commit). Render despliega solo; espera y comprueba
      `https://hueckoapp-api.onrender.com/api/health`. Pide al usuario que corra en Neon
      `SELECT count(*) FROM users WHERE NOT email_verified;` (debe dar 0).
   3. Tag `v3.0.0` en `main` y **GitHub Release v3.0.0** con el `.apk` adjunto (el README enlaza a
      `releases/latest`). Después, PR para devolver `release/3.0.0` a `develop`.
   4. Acompañar la **prueba en dos celulares** (recorrido en el README, sección «📲 Probar la v3.0.0»).
   5. Borrar la rama remota `wip/votacion-expres-task3` tras comprobar que no tiene nada fuera de `develop`.
4. Commits: identidad `Aless Bustamante <fabrizio.bs9012@gmail.com>` vía variables GIT_AUTHOR_*/GIT_COMMITTER_* (ver
   memoria `git-flow.md`). En Windows, Node 22 con fnm (ver `v3-apk-progreso.md`). Tests de mobile siempre con
   `--maxWorkers=2`; vitest desde una ruta con la `C:` en mayúscula.
5. Al retomar, **borra esta rama** (`git push origin --delete docs/traspaso-v3`) y sigue en `release/3.0.0`: el
   traspaso no debe llegar a `main` ni a `develop`.
