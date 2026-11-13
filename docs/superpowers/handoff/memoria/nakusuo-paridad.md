---
name: nakusuo-paridad
description: "Objetivo de igualar funcionalidades con los repos de Nakusuo (huecko-frontend/backend/ai-service), mismo proyecto en otro curso"
metadata:
  node_type: memory
  type: project
  originSessionId: cdaf225f-1ef6-4c66-a348-d90050be4ab1
  modified: 2026-11-11T01:09:08.810Z
---

2026-11-10: el usuario quiere que el APK (v3.0.0) presente las mismas funcionalidades que github.com/Nakusuo/huecko-frontend, huecko-backend (Spring + Postgres/Mongo) y huecko-ai-service (FastAPI + Gemini): mismo proyecto presentado en otro curso. Solo funcionalidades, no su stack. Más nuestros extras (proximidad, GPS, admin que gestiona, offline).

Análisis hecho: nos faltan p. ej. editar perfil/foto/perfil público, logros, editar bloque, regenerar código/QR/añadir por correo/expulsar, «Llegué», «Estoy libre ahora», votación exprés grupal (+IA criticidad/recomendación), cierre automático, voto múltiple, álbum/muro, tiempo real, recordatorios, verificación de correo, 2FA, Google login, reportes, legales.
Choques de reglas que el usuario debe decidir: franjas por día de semana (nuestro) vs ventanas con fecha (ellos); imprevisto decide una persona (nuestro) vs vota el grupo; un OWNER vs varios organizadores; admin gestiona vs observa.

Decisiones del usuario (2026-11-10):
1. Imprevistos: decide todo el grupo (cancelar, reagendar, mantener) → votación exprés grupal como Nakusuo.
2. Franjas: como ellos, ventanas con fecha concreta (migrar modelo; toca OCR, IA, Inicio, estadísticas).
3. Roles: como ellos, varios organizadores; el botón «imprescindible» queda y lo controla el organizador (interpretación a confirmar).
4. Admin: ambas filosofías (gestiona + observa: salud, métricas, logs, reportes).

**Why:** ambos equipos presentan el mismo producto. **How to apply:** tras terminar proximidad, planificar la paridad por fases (brainstorming → plan), respetando git flow; ver [[v3-apk-progreso]].

2026-11-10: Fase 1 (franjas con fecha) — spec docs/superpowers/specs/2026-11-10-franjas-con-fecha-design.md y plan docs/superpowers/plans/2026-11-10-franjas-con-fecha.md (10 tareas) aprobados; se ejecuta con subagentes en rama feature/franjas-con-fecha (sale de feature/unirse-por-proximidad). Ledger: .superpowers/sdd/2026-11-10-franjas-con-fecha/progress.md. Decisiones: semana elegible (hasta 4), día + horas, 2–5 franjas, % no limita, replantear propuestas en votación, zona Lima fija.

Al 2026-11-10 (pausa pedida por el usuario): Tasks 1–2 de 10 hechas y revisadas (151db1e, 6cd6580, sin push). Task 3 detenida a medias: trabajo parcial guardado en `git stash` «wip franjas-con-fecha Task 3…» (tocó matcher.ts, que no debía). Retomar leyendo el ledger .superpowers/sdd/2026-11-10-franjas-con-fecha/progress.md. Pendiente antes de desplegar: correr en Neon la consulta de control de task-2-report.md (ISODOW(scheduled_date) = day_of_week).

Al 2026-11-12 (segunda pausa pedida por el usuario): Tasks 1–3 de 10 hechas y revisadas (151db1e, 6cd6580, 9063fb9, sin push). Task 4 detenida a medias: backend verde (676/676), faltaba mobile, docs/api.md y commit; guardado en `git stash` «wip franjas-con-fecha Task 4…». Retomar con el ledger. El usuario quiere que todo lo manual (consulta en Neon, prueba en 2 celulares) se haga al final, y que se siga con subagentes sin parar hasta terminar.

2026-11-13: **Fase 1 (franjas con fecha) TERMINADA** en la rama feature/franjas-con-fecha (82767db..03a4fe6, sin push): 10 tareas + revisión final + arreglos, todo revisado; backend 688/688, mobile 611/611. Workspace .superpowers/sdd borrado (la historia está en git).
Pendiente con OK del usuario: push + PR (a develop, o apilado sobre #44 si no está integrado); prueba en 2 celulares.
Antes de desplegar (con el esquema viejo, ANTES de que corra la migración 7) correr en Neon; debe dar 0 filas:
`SELECT p.id, p.scheduled_date, w.day_of_week FROM proposals p JOIN proposal_windows w ON w.id = p.chosen_window_id WHERE p.scheduled_date IS NOT NULL AND EXTRACT(ISODOW FROM p.scheduled_date::date) <> w.day_of_week;`
Diferido (menores, posible PR de seguimiento): tests del backend construyen NOW en hora local con TZ=Lima forzado en vitest (no detectan fuga de TZ); ExpressVoteCard sin estado pending al reprogramar; ConfirmPlanDialog deja elegir franjas ya empezadas (solo avisa con 409); huecos de cobertura (AddWindowSheet, ReplanSheet quitar/tope 5); texto NO_COMMON_WINDOWS siempre dice «esta semana»; editor abre 09:00–11:00 aunque ya pasó hoy.
Siguiente: fase 2 de paridad (brainstorming → plan).
2026-11-13: push hecho y PR #45 creado (base feature/unirse-por-proximidad, apilado sobre #44).

2026-11-13: Fase 2 = votación exprés grupal (como Nakusuo; IA solo recomienda; cierre perezoso al consultar). Spec docs/superpowers/specs/2026-11-13-votacion-expres-grupal-design.md y plan docs/superpowers/plans/2026-11-13-votacion-expres-grupal.md (8 tareas) en rama feature/votacion-expres-grupal (sale de feature/franjas-con-fecha; commits d2b71f6, 3ef0f97, sin push). Falta que el usuario apruebe el plan y elija modo de ejecución.
2026-11-13 (pausa pedida por el usuario): fase 2 con subagentes; Tasks 1–2 de 8 hechas y revisadas (1724d38, 39500ed, sin push). Task 3 detenida a medias (iba por las rutas): guardada en `git stash` «wip votacion-expres Task 3…». Retomar leyendo el ledger .superpowers/sdd/2026-11-13-votacion-expres-grupal/progress.md (incluye la regla para `open` dentro de la transacción).
