---
name: v3-apk-progreso
description: "Estado de la v3.0.0 (APK con EAS + backend en Render/Neon) y plan acordado, al pausar el 2026-10-31"
metadata:
  node_type: memory
  type: project
  originSessionId: fcbab1cc-55c6-4f8b-a8fc-7ffa2dee1e5e
  modified: 2026-10-31T22:45:43.046Z
---

v3.0.0 = APK con EAS Build + backend en Render + Neon + requisitos del curso (ver [[requisitos-tercera-entrega]]).

Hecho (al 2026-10-31):
- PRs #40 y #41 (fixes del borrador IA «hoy» e imprevisto en plan cancelado) integrados en develop.
- Neon (us-east-1) y Render creados con la cuenta GitHub del usuario. Backend vivo en https://hueckoapp-api.onrender.com (health 200, DB OK). El servicio despliega la rama feature/apk-eas: pasarlo a `develop` al integrar #42 y a `main` en la release.
- Expo: cuenta alessandro-bs, proyecto @alessandro-bs/hueckoapp (projectId daa0c4c3-…). Primer APK (build cad3980b, perfil preview, versionCode 1) generado y verificado con la URL de Render.
- PR #42 (feature/apk-eas → develop) ABIERTO, CI verde. Incluye eas.json, render.yaml, paquetes SDK 57, guía de despliegue, CLAUDE.md (secretos en Render) y README con los requisitos de la tercera entrega. Comentarios de Sourcery respondidos; el del timeout de 15 s con Render dormido queda para el PR de TanStack Query.

Decisiones del usuario:
- NO hacer la release 3.0.0 hasta que lo diga; quiere agregar más funciones antes.
- Las funciones se prueban en Expo Go; el APK final se genera solo para la release (no lanzar builds de EAS por cada cambio). Excepción inevitable: el sensor de proximidad necesita development build.

Al 2026-11-03: PR #42 integrado en develop. PR #43 (TanStack Query, feature/mobile-tanstack-query → develop) abierto con CI verde; falta probarlo en Expo Go con Render dormido. Pendiente del usuario: cambiar en el panel de Render la rama de feature/apk-eas a develop.
Proximidad: diseño docs/superpowers/specs/2026-11-03-unirse-por-proximidad-design.md y plan docs/superpowers/plans/2026-11-03-unirse-por-proximidad.md (7 tareas), aprobados por el usuario; se ejecuta con subagentes (superpowers:subagent-driven-development). Rama local feature/unirse-por-proximidad (sale de #43, sin push). Tasks 1–2 (backend) hechas y revisadas (dd7173f, 53a7aaf, 0ad9eff). Task 3 (módulo Kotlin) se detuvo a medias por pedido del usuario: archivos sin commit en mobile/modules/ y src/hooks/useProximity*. Registro de avance (ledger) en .superpowers/sdd/2026-11-03-unirse-por-proximidad/progress.md (ignorado vía .git/info/exclude).

Plan:
1. Integrar PR #42 (esperar su confirmación).
2. feature/mobile-tanstack-query (Volley ≈ TanStack Query, Inicio y Grupos; reintentos para Render dormido).
3. feature/unirse-por-proximidad: endpoints de emparejamiento + pantallas + giroscopio + módulo nativo de proximidad + development build (probar con 2 celulares Android).
4. Recordar al usuario resetear la contraseña de Neon (la pegó en el chat) si no lo hizo.

**Why:** retomar sin rehacer lo hecho. **How to apply:** empezar por el punto 1 del plan cuando el usuario vuelva.

Entorno: Node 22 vía fnm y gh en ~/.local/share/{fnm,gh-cli} (en PATH de fish; en Bash hay que exportarlos y hacer `eval "$(fnm env --shell zsh)"`). gh logueado como Alessandro-BS; eas-cli logueado como alessandro-bs. La máquina tiene 7,6 GB: los tests de la app con la suite completa fallan 3 por memoria (pasan solos y en CI); usar --maxWorkers=2.

Al 2026-11-10: proximidad terminada (tasks 1-7, revisión final limpia; backend 617, app 578). PR #44 (feature/unirse-por-proximidad → feature/mobile-tanstack-query, apilado sobre #43) abierto. Falta: prueba en 2 celulares con `eas build --profile development` + backend local en la misma Wi-Fi (pasos en README); el Kotlin no se ha compilado aún. Ledger se conserva hasta esa prueba. Siguiente: fases de paridad con Nakusuo, ver [[nakusuo-paridad]] (fase 1 = franjas con fecha).
