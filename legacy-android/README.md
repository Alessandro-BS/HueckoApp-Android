> **Versión congelada.** Esta es la app nativa original (Kotlin + Jetpack Compose), publicada como `v1.0.0`. El desarrollo continúa en React Native en [`../mobile`](../mobile) y [`../backend`](../backend). Para abrirla, abre **esta carpeta** (`legacy-android/`) en Android Studio.

# HueckoApp 🕒 - Coordinación de Horarios entre Amigos

HueckoApp es una plataforma diseñada para centralizar la disponibilidad de grupos de amigos, compañeros de universidad o de trabajo. La aplicación permite cruzar agendas automáticamente, facilitar la votación de planes y gestionar imprevistos de forma inteligente.

## 🚀 Visión del Producto
Coordinar planes suele ser tedioso a través de chats. **HueckoApp** soluciona esto mediante un heatmap de disponibilidad grupal y un sistema de toma de decisiones basado en quórum.

---

## 📱 Componentes y Conceptos de Android Implementados

El proyecto cumple y demuestra el dominio de los conceptos fundamentales y avanzados del desarrollo en Android:

1. **Anclaje:** Uso de restricciones y sistemas de alineación mediante modificadores y layouts en Jetpack Compose (`Alignment`, `Arrangement`, `Modifier.fillMaxSize()`, etc.).
2. **Botón ("Boton"):** Integración de componentes interactivos de Material 3 (`Button`, `OutlinedButton`, `TextButton` y botones de acción personalizados).
3. **`onClick`:** Gestión de eventos de clic en botones, tarjetas (`HueckoCard`), selectores de días, opciones de voto y elementos de navegación.
4. **Desarrollo de un diseño utilizando layouts:** Organización visual adaptativa empleando `Column`, `Row`, `Box`, `LazyColumn` y `FlowRow`.
5. **Aplicación de estilos básicos:** Sistema de diseño centralizado en `ui/theme/` (`Theme.kt`, `Color.kt`, `Shape.kt`, `Type.kt`) aplicando Material 3, paleta de colores morada/lavanda y tipografías tipificadas.
6. **Activity y Menús:** 
   - **Activity:** `MainActivity.kt` como punto de entrada de la aplicación.
   - **Menú:** Barra de navegación inferior (`HueckoBottomBar`) para alternar entre las vistas principales (Dashboard, Grupos, Horario, Perfil).
7. **ListView:** Uso del equivalente moderno en Jetpack Compose (**`LazyColumn`** y `LazyRow`) para renderizar listas eficientes de bloques horarios, grupos y votaciones.
8. **Ciclo de vida de la Activity:** Implementación explícita de los métodos del ciclo de vida en `MainActivity.kt` (`onCreate`, `onStart`, `onResume`, `onPause`, `onStop`, `onDestroy`) con registros de depuración.

---

## ✅ Funcionalidades Implementadas (Technical Changelog)

### Módulo 1: Acceso, Perfil y Dashboard Principal
- **Autenticación y Sesión:** Pantallas de Login y Registro con validación en cliente, manejo reactivo mediante `AuthViewModel` y notificación emergente (Toast/Snackbar) de bienvenida al ingresar a la cuenta.
- **Dashboard Principal:** Vista de inicio con saludo contextual, métricas rápidas (grupos activos, votaciones abiertas, horas coincidentes, bloques totales), próximo plan confirmado, horario de hoy y votaciones en curso.
- **Perfil de Usuario:** Pantalla de perfil con visualización de datos de cuenta y opción de cierre de sesión seguro.

### Módulo 2: Gestión de Horarios e IA (OCR con Mock Data)
- **Mi Horario:** Visualización de bloques horarios registrados por el usuario.
- **Registro Manual Recurrente y Puntual:** Formulario avanzado para añadir bloques de horario seleccionando si son recurrentes semanales (con selector de días de la semana) o puntuales de única vez (`dayOfWeek = null`).
- **Escaneo con IA (OCR) + Mock Fallback:** Integración con **Google Gemini (Vertex AI)** para extraer horarios desde fotos, con un robusto modo de datos mock (fallback offline automático cuando la API key está vacía o falla la red).
- **Validación Humana:** Pantalla de revisión de bloques detectados por el OCR antes de guardarlos en el calendario del usuario.

### Módulo 3: Cruce Inteligente, Grupos y Votaciones
- **Gestión de Grupos y Detalle:** Creación de grupos, unión mediante código de invitación (con copiado al portapapeles) y listado de miembros con distinción de integrantes imprescindibles.
- **Cruce de Agendas y Horario en Común:** Cálculo de franjas libres que cumplen con el umbral de coincidencia del grupo (Heatmap).
- **Propuestas de Planes y Votación:** Creación de propuestas y sistema de votos excluyentes con plazos límite.

---

## 🧪 Pruebas Unitarias y Calidad
- Suite de pruebas unitarias implementada con JUnit y Coroutines Test (`kotlinx-coroutines-test`) cubriendo:
  - `DashboardViewModelTest`
  - `AuthViewModelTest`
  - `OcrViewModelTest`
  - `ScheduleViewModelTest`

---

## 🛠️ Stack Tecnológico
- **Lenguaje:** Kotlin
- **UI:** Jetpack Compose (Material 3)
- **Arquitectura:** MVVM (Model-View-ViewModel)
- **Navegación:** Jetpack Navigation Compose
- **Red:** Retrofit + Gson
- **IA:** Firebase Vertex AI (Gemini 1.5 Flash) + Modo Mock Offline
- **Pruebas:** JUnit, Coroutines Test

---
*Este proyecto sigue las metodologías de gestión de requerimientos (REQM) y Scrum para asegurar la trazabilidad y calidad del software.*
