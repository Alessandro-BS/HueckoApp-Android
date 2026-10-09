# 🧪 Guía de pruebas en el celular

Recorrido completo para comprobar HueckoApp en un celular (o emulador) **con la IA real de Gemini**: desde crear un grupo hasta resolver un imprevisto y revisar la administración. Cada paso dice **qué hacer**, **qué deberías ver** y **por qué funciona así**, para que cualquiera del equipo sepa si algo está mal o es lo esperado.

> ⏱️ El recorrido completo toma unos 30–40 minutos. Puedes hacer las secciones por separado.

---

## 0️⃣ Antes de empezar

| | Qué | Cómo |
|---|---|---|
| 🟢 | Node 22 | `fnm use` en la raíz (ver «¿Qué versión de Node?» en el [README](../README.md)) |
| 🔑 | Clave de Gemini | En `backend/.env`: `GEMINI_API_KEY=...` (gratis en <https://aistudio.google.com/apikey>). Sin ella la IA responde en **modo demostración** |
| 🌱 | Datos de ejemplo | `npm run seed -w backend` **con el servidor detenido** |
| ⚙️ | Backend | `npm run backend` → <http://localhost:3000/api/health> debe decir `ok` |
| 📱 | App | `npm run mobile` y abre el proyecto en **Expo Go** (QR) o con `a` en el emulador |
| 🌐 | Dirección | `mobile/.env` → `EXPO_PUBLIC_API_URL`: `http://10.0.2.2:3000/api` en el emulador, o `http://<IP-de-tu-PC>:3000/api` en un celular en la misma Wi-Fi |

**Cuentas de ejemplo** (contraseña `password123` en todas): `test@test.com`, `ana@test.com`, `carlos@test.com` y `admin@test.com` (administración).

**Para cambiar de cuenta:** ☰ (arriba a la izquierda) → **Cerrar sesión**.

**Límite de la IA:** 20 llamadas cada 15 minutos por cuenta. Este recorrido usa menos.

**Horarios para fotografiar:** abre [`docs/pruebas/horarios-de-ejemplo.html`](pruebas/horarios-de-ejemplo.html) en el navegador de tu PC. Tiene un horario para Ana y otro para Carlos.

---

## 1️⃣ Navegación

| # | Qué hacer | Qué deberías ver | Por qué |
|---|---|---|---|
| 1 | Inicia sesión con `test@test.com` | Abajo, la barra **Inicio · Horario · Grupos** | Las secciones de todos los días quedan a un toque y al alcance del pulgar |
| 2 | Toca **☰** arriba a la izquierda | Menú con tu nombre, **Inicio**, **Perfil** y **Cerrar sesión** | El drawer (tema del curso) guarda lo de uso ocasional |
| 3 | Entra a un grupo | Desaparece la barra y aparece la flecha **←** | Los detalles se apilan encima con su botón para volver (`native-stack`) |
| 4 | Usa el botón atrás del celular hasta salir | Vuelve a **Inicio** antes de cerrar la app | `backBehavior: initialRoute`: atrás siempre pasa por Inicio |
| 5 | Cierra la app del todo y ábrela | Sigues con la sesión iniciada | El token se guarda cifrado en `expo-secure-store` |

## 2️⃣ Crear el grupo (`test@test.com`)

| # | Qué hacer | Qué deberías ver | Por qué |
|---|---|---|---|
| 1 | **Grupos → Crear grupo**, nombre `Prueba IA` → **Crear** | El grupo aparece con su **código de invitación** | Solo se pide el nombre: el código lo genera el servidor |
| 2 | Anota el código | — | Ana y Carlos lo usarán para unirse |

## 3️⃣ Ana se une y escanea su horario con la cámara (`ana@test.com`)

| # | Qué hacer | Qué deberías ver | Por qué |
|---|---|---|---|
| 1 | **Grupos → Unirme** → código del paso 2 → **Unirse** | «Prueba IA» en su lista | Unirse solo necesita el código |
| 2 | **Horario → Escanear → Cámara** y fotografía la tabla **«Horario de Ana»** | «Leyendo tu horario» y luego **unos 7 bloques** (Física I, Programación, Base de Datos, Estadística, Inglés) | Gemini lee la foto. Nada se guarda todavía |
| 3 | Toca una hora de un bloque | Se abre el **reloj de Android (24 h)** | Las horas se eligen, no se escriben: así no hay errores de formato |
| 4 | Si alguna hora se ve en **rojo** («Formato HH:mm»), corrígela con el reloj | El rojo desaparece | La IA puede leer mal: tú revisas antes de guardar |
| 5 | **Añadir a mi horario** | «Se añadieron N bloques…» | Se guardan todos juntos (`/me/time-blocks/bulk`) |

**Pruebas extra:**
- 📸 **Foto pesada:** las cámaras de muchos megapíxeles dan fotos de más de 5 MB. La app las **reduce a 2000 px antes de subirlas**, así que no debe salir «La foto pesa más de 5 MB».
- ☕ **Algo que no es un horario** (una taza, la pared): debe decir que no detectó bloques, sin romperse.

## 4️⃣ Carlos se une y escanea desde la galería (`carlos@test.com`)

| # | Qué hacer | Qué deberías ver | Por qué |
|---|---|---|---|
| 1 | Únete a «Prueba IA» con el mismo código | — | — |
| 2 | Guarda en el celular una captura de **«Horario de Carlos»** | — | Para probar el otro camino de subida |
| 3 | **Horario → Escanear → Galería** y elige la captura | **Unos 8 bloques**, incluido el **sábado** (Taller de Proyectos) | La galería usa el selector del sistema: no pide permiso |
| 4 | Revisa y **Añadir a mi horario** | — | — |

## 5️⃣ Agregar un bloque a mano (cualquier cuenta)

| # | Qué hacer | Qué deberías ver | Por qué |
|---|---|---|---|
| 1 | **Horario → Añadir bloque** | Horas `🕒 08:00` y `🕒 09:00` como botones, sin teclado | Se eligen con el reloj nativo |
| 2 | Inicio 10:00 y fin 09:30 | **«Debe ser posterior»** y **Guardar bloque** desactivado | El fin tiene que ser después del inicio |
| 3 | Fin 11:30, nombre y **Guardar bloque** | «Bloque guardado.» | Viaja al servidor como `"11:30"` |
| 4 | Abre el reloj y toca **Cancelar** | La hora no cambia | Cerrar el reloj no borra lo elegido |

## 6️⃣ Huecos en común (`test@test.com`)

| # | Qué hacer | Qué deberías ver | Por qué |
|---|---|---|---|
| 1 | **Grupos → Prueba IA → pestaña Huecos** | Franjas en las que el grupo está libre (p. ej. martes en la tarde) | El servidor cruza los horarios de todos |
| 2 | Si dice **«Sin huecos en común»** | — | Ninguna franja llega al % mínimo del grupo, o faltan horarios (pasos 3–4) |

> 💡 La IA **solo puede proponer franjas de esta lista**: no se inventa horarios.

## 7️⃣ Borrador de plan con IA (`test@test.com`)

**Planes → Crear propuesta →** tarjeta **«Describe tu plan»** → escribe la frase → **Rellenar con IA**.

| Frase de ejemplo | Qué esperar |
|---|---|
| `pichanga el sábado en la tarde` | Categoría **DEPORTE**, una franja del sábado |
| `estudiar para el parcial de estadística el martes en la biblioteca` | **ESTUDIO**, martes, lugar «Biblioteca» |
| `almuerzo de cumpleaños de Ana el viernes` | **COMIDA**, viernes |
| `reunión para avanzar el proyecto lo antes posible` | **REUNION**, la franja más cercana |
| `ir al cine el fin de semana` | **SALIDA** |
| `ab` | Error: pide al menos 3 caracteres |

**Por qué:** la IA convierte la frase en título, categoría, lugar, franja y fecha límite. **Todo se puede editar** antes de crear la propuesta.

> ⚠️ Pendiente de revisar: con «en la tarde» la IA puede devolver una franja larga que empieza en la mañana (p. ej. 08:00–20:00), porque elige entre los huecos completos del grupo.

## 8️⃣ Lugar del plan

En el formulario de la propuesta de estudio:

| # | Qué hacer | Qué deberías ver | Por qué |
|---|---|---|---|
| 1 | **Usar mi ubicación actual** y **rechaza** el permiso | Mensaje claro, sin romperse | El permiso se pide en tiempo de ejecución (tema del curso) |
| 2 | Repite y **acéptalo** | La dirección donde estás, y «Con coordenadas: se podrá abrir en el mapa.» | Geocodificación inversa del teléfono |
| 3 | **Elegir en el mapa** | Mapa de Google a pantalla completa | Para planes que no son donde estás |
| 4 | Busca `Plaza de Armas de Lima` → **Buscar** | El mapa va al lugar, con el pin y el nombre abajo | Geocodificador del teléfono, sin claves |
| 5 | Toca otro punto del mapa y **arrastra el pin** | El nombre cambia a la dirección del nuevo punto | Para ajustar el sitio exacto |
| 6 | **Usar este lugar** | El campo Lugar se llena, con coordenadas | — |
| 7 | Elige la fecha límite y **Crear propuesta** | «Propuesta creada.» | — |

## 9️⃣ Ideas de plan con IA (`test@test.com`)

| # | Qué hacer | Qué deberías ver | Por qué |
|---|---|---|---|
| 1 | **Planes → Ideas con IA** | «Ideas con Huecko IA» con **hasta 3 ideas**, cada una con lugar, franja y motivo | La IA mira los huecos libres y las últimas propuestas para no repetirse |
| 2 | **Usar** en una idea | Se abre «Crear propuesta» ya rellenado | — |
| 3 | Pide ideas otra vez | Ideas distintas | — |

## 🔟 Votar (con cada cuenta)

| Cuenta | Qué hacer |
|---|---|
| `test@test.com` | **Planes → Votar** en la propuesta de estudio → elige una franja |
| `ana@test.com` | Vota en la misma propuesta |
| `carlos@test.com` | **No votes** todavía |

**Por qué:** así el resumen siguiente tiene un caso realista (2 de 3 votos).

## 1️⃣1️⃣ Resumen con IA y confirmar (`test@test.com`)

| # | Qué hacer | Qué deberías ver | Por qué |
|---|---|---|---|
| 1 | **Planes → Ver detalles** de la propuesta | Tarjeta **«Resumen con Huecko IA»** | — |
| 2 | **Resumir votación** | «Votaron 2 de 3…», una **recomendación** (p. ej. Confirmar) y su motivo | La IA **solo sugiere**: nunca cambia el plan |
| 3 | **Confirmar plan** | El plan pasa a confirmado | Confirmar siempre lo decide una persona |

## 1️⃣2️⃣ Imprevisto (Ana) y resumen de nuevo

| # | Qué hacer | Qué deberías ver | Por qué |
|---|---|---|---|
| 1 | `ana@test.com` → plan confirmado → **Reportar imprevisto** → «¿Qué pasó?»: `Cruce de examen` → **Reportar** | — | — |
| 2 | `test@test.com` → **Inicio** | Aviso del imprevisto de Ana | Quien organiza se entera al instante |
| 3 | **Ver detalles → Actualizar resumen** | Sigue recomendando **Confirmar** | Ana no es imprescindible y 2 de 3 sí pueden ir |
| 4 | **Grupos → Prueba IA → Miembros**: activa **Imprescindible** en Ana | — | Solo el dueño del grupo puede marcarlo |
| 5 | **Ver detalles → Actualizar resumen** | Ahora debería recomendar **Reprogramar** (la IA sigue la regla, pero no es 100 % determinista) | Regla del servidor: si un imprescindible no puede ir, se reprograma ([`voting-summary.ts`](../backend/src/ai/voting-summary.ts)) |

## 1️⃣3️⃣ Administración (`admin@test.com`)

| # | Qué hacer | Qué deberías ver | Por qué |
|---|---|---|---|
| 1 | **☰ → Administración** | 5 pestañas: Estadísticas, Informes, Usuarios, Grupos, Registro | Con otras cuentas el menú no aparece |
| 2 | **Estadísticas** | La IA con tus llamadas por función (escaneo, borrador, ideas, resumen), % de éxito y tiempo medio | Confirma que lo anterior usó la IA real |
| 3 | **Informes → Exportar PDF** | Se abre «Compartir» con `informe-hueckoapp_<desde>_<hasta>.pdf` | El PDF se genera en el teléfono (`expo-print`) |
| 4 | **Exportar CSV** y ábrelo en Excel | Tildes bien y columnas separadas | CSV con `;` y BOM UTF-8 para Excel en español |
| 5 | **Usuarios → Ana → Suspender**, y entra como Ana | No puede ingresar (o se le cierra la sesión con aviso). Luego **reactívala** | El servidor revisa el estado en cada petición |
| 6 | Da y quita el rol de administrador a Carlos | El menú de Carlos cambia al volver a la app | El rol se lee de la base, no del token |
| 7 | **Registro** | Todas las acciones anteriores | Cada acción de administración queda anotada |

---

## 🐞 Si algo falla

Anota **la cuenta**, **el paso**, **qué esperabas** y **qué viste** (con captura). Mensajes útiles:

| Mensaje | Qué significa |
|---|---|
| «Modo demostración» | Falta `GEMINI_API_KEY` en `backend/.env` o no se reinició el backend |
| Error de red al iniciar sesión | La app no llega al backend: revisa `EXPO_PUBLIC_API_URL` y que estén en la misma Wi-Fi |
| `429` / «demasiadas solicitudes» | Se pasó el límite de la IA (20 cada 15 min por cuenta) |
| «La base local … está abierta por otro proceso» | Detén el servidor antes de `seed` o `make-admin` |
