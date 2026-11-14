---
name: requisitos-tercera-entrega
description: "Requisitos del curso para la v3.0.0 (Volley/Retrofit, cámara, sensores), decisiones tomadas y estado al 2026-10-31"
metadata:
  node_type: memory
  type: project
  originSessionId: fcbab1cc-55c6-4f8b-a8fc-7ffa2dee1e5e
  modified: 2026-10-31T22:43:33.989Z
---

Requisitos de la tercera entrega (v3.0.0), dados por el usuario el 2026-10-31. Están en el README (Hoja de ruta → Requisitos de la tercera entrega).

- Volley/Retrofit: el profesor acepta equivalentes de React Native/Expo.
  - Retrofit ≈ axios (instancia + interceptores en mobile/src/api/client.ts, funciones tipadas en src/api/*.ts): YA INTEGRADO.
  - Volley ≈ TanStack Query (@tanstack/react-query): FALTA. Empezar por Inicio y Grupos; sus reintentos también arreglan el timeout de 15 s con Render dormido (comentario de Sourcery en PR #42).
- Cámara: INTEGRADO (expo-image-picker launchCameraAsync en mobile/src/utils/scheduleImage.ts).
- Sensor de proximidad (obligatorio): FALTA. Idea del usuario: unirse a un grupo acercando el celular a ~5 cm. Diseño acordado: los dos celulares (pantalla con pantalla) detectan proximidad, avisan al servidor con la hora y el servidor empareja invitación + unión en ~3 s; si es ambiguo, no une a nadie. expo-sensors no tiene proximidad → módulo nativo Kotlin (Expo Modules) → development build, no Expo Go.
- Giroscopio (obligatorio): FALTA. expo-sensors Gyroscope (Expo Go): confirmar que los celulares están quietos al juntarse.
- Magnetómetro y luz: opcionales, FALTAN.

**Why:** definen el alcance de la v3.0.0 antes de la release. **How to apply:** la proximidad obliga a un development build, a diferencia del flujo de probar en Expo Go (ver [[v3-apk-progreso]]).

2026-11-13 (auditoría pedida por el usuario; al final pedirá documento + PPT para la presentación del «segundo avance» destacando estos puntos):
- Retrofit ≈ axios (mobile/src/api/client.ts, interceptores) — HECHO (develop). Volley ≈ TanStack Query (src/api/queryClient.ts con reintentos y backoff, hooks useApiQuery/useGroup/useProximitySession) — HECHO (PR #43).
- Cámara: expo-image-picker launchCameraAsync + permiso (src/utils/scheduleImage.ts) para OCR del horario — HECHO. No se usa React Native Camera (obsoleto) ni expo-camera: se usan Expo APIs.
- Ubicación: expo-location (useCurrentLocation, usePlaceLookup en PlacePickerModal) + mapa OSM en WebView — HECHO.
- Sensores: giroscopio expo-sensors (useStillness) + proximidad con módulo nativo Kotlin propio (mobile/modules/proximity, Expo Modules API) — HECHO (PR #44).
- Notificaciones push: NO implementado (no hay expo-notifications). Requiere proyecto Firebase (FCM) + development build/APK.
