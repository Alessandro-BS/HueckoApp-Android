> **Versión congelada.** Esta es la app nativa original (Kotlin + Jetpack Compose), publicada como `v1.0.0`. El desarrollo continúa en React Native en [`../mobile`](../mobile) y [`../backend`](../backend). Para abrirla, abre **esta carpeta** (`legacy-android/`) en Android Studio.

# HueckoApp 🕒 - Coordinación de Horarios entre Amigos

HueckoApp es una plataforma diseñada para centralizar la disponibilidad de grupos de amigos, compañeros de universidad o de trabajo. La aplicación permite cruzar agendas automáticamente, facilitar la votación de planes y gestionar imprevistos de forma inteligente.

## 🚀 Visión del Producto
Coordinar planes suele ser tedioso a través de chats. **HueckoApp** soluciona esto mediante un heatmap de disponibilidad grupal y un sistema de toma de decisiones basado en quórum.

---

## ✅ Cambios Realizados

### Fase 1: Arquitectura y Seguridad
- **Estructura MVVM:** Implementación de paquetes organizados por capas (`ui`, `data`, `domain`) para asegurar la mantenibilidad (RNF-10).
- **Seguridad de API Keys:** Configuración de `BuildConfig` y `local.properties` para proteger las claves de Google Gemini y evitar filtraciones en el repositorio.
- **Navegación Robusta:** Implementación de `Navigation Compose` con gestión de pila de navegación (backstack) para flujos de usuario seguros.

### Fase 2: Autenticación (Módulo de Acceso)
- **Login y Registro:** Creación de interfaces modernas con Material 3 para el acceso de usuarios.
- **Gestión de Estado:** Uso de `ViewModels` para manejar de forma reactiva los formularios y estados de carga.
- **Repositorio de Autenticación:** Implementación de lógica de dominio para manejar sesiones de usuario (simulada/Mock para desarrollo inicial).

### Fase 3: Gestión de Disponibilidad e IA (Módulo 1)
- **Mi Horario:** Pantalla de visualización de bloques horarios cargados por el usuario (HU-01).
- **Formulario de Registro Manual:** Interfaz para añadir bloques recurrentes con selectores de día (Lunes-Domingo) y hora (HH:mm).
- **Escaneo con IA (OCR):** Integración con **Google Gemini (Vertex AI)** para extraer automáticamente horarios desde fotos de la galería (HU-02).
- **Validación Humana:** Pantalla de revisión de bloques detectados por la IA antes de su persistencia final (RF-03, RNF-06).

---

## 🛠️ Próximas Funcionalidades

Siguiendo el Documento de Producto y Arquitectura:

### Módulo 2: Cruce Inteligente (El Corazón de la App)
- [ ] **Gestión de Grupos:** Creación de grupos, invitaciones mediante códigos y lista de miembros.
- [ ] **Algoritmo de Intersección:** Lógica para cruzar la disponibilidad de todos los miembros del grupo.
- [ ] **Heatmap Dinámico:** Visualización gráfica de los "huecos" libres del grupo con intensidad según el quórum (HU-05).
- [ ] **Filtros de Coincidencia:** Configuración de umbral mínimo (ej. 70%) para ver huecos no unánimes (HU-06).

### Módulo 3: Votación y Planes
- [ ] **Propuesta de Planes:** Selección de ventanas de tiempo sugeridas por el sistema (HU-08).
- [ ] **Votación Grupal:** Sistema de votos con plazo límite y confirmación automática (HU-09, HU-10).

### Módulo 4 & 5: Tiempo Real e IA Avanzada
- [ ] **Notificaciones de Retraso:** Alertas persistentes en el chat y vista de evento (HU-11, HU-12).
- [ ] **IA ante Imprevistos:** Evaluación automática de criticidad de ausencias y votaciones exprés (HU-14, HU-15).

---

## 🛠️ Stack Tecnológico
- **Lenguaje:** Kotlin
- **UI:** Jetpack Compose (Material 3)
- **Arquitectura:** MVVM (Model-View-ViewModel)
- **Inyección de Dependencias:** Hilt (Próximamente)
- **Red:** Retrofit + Gson
- **IA:** Firebase Vertex AI (Gemini 1.5 Flash)
- **Persistencia:** StateFlow (Memoria) / Room (Local) / Backend Java (Próximamente)

---
*Este proyecto sigue las metodologías de gestión de requerimientos (REQM) para asegurar la trazabilidad y calidad del software.*
