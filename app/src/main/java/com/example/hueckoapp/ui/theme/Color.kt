package com.example.hueckoapp.ui.theme

import androidx.compose.ui.graphics.Color

/**
 * Paleta de Huecko: violeta apagado.
 *
 * Cambiar la marca = cambiar este archivo. Ninguna pantalla conoce un
 * hexadecimal; todas leen roles a traves de `MaterialTheme.colorScheme` o de
 * [HueckoExtendedColors].
 *
 * Reglas que cumple cada valor de aqui, y que conviene mantener al tocarlo:
 *
 *  - Todo par texto/fondo que forme una frase pasa 4.5:1 (WCAG AA). Los tonos
 *    son oscuros y poco saturados a proposito: un violeta vivo sobre blanco se
 *    queda en 3:1 y deja de ser legible para media clase en una pantalla al
 *    sol.
 *  - Solo hay un acento. El violeta marca lo pulsable; nada mas compite por la
 *    atencion.
 *  - Error, exito y aviso NO son violeta. El color de un estado tiene que
 *    poder distinguirse del cromo de la interfaz, o el aviso deja de avisar.
 */

// --- Primario -----------------------------------------------------------
/** 9.01:1 sobre `surface`. Es el unico acento de la interfaz. */
val HuePrimary = Color(0xFF4A3B77)
val HuePrimaryPressed = Color(0xFF3E3165)
val HueOnPrimary = Color(0xFFFFFFFF)
val HuePrimaryContainer = Color(0xFFE6E1F0)
val HueOnPrimaryContainer = Color(0xFF241C42)

// --- Secundario ---------------------------------------------------------
/** Violeta desaturado hacia el gris: acompana sin disputar el primario. */
val HueSecondary = Color(0xFF5D566E)
val HueSecondaryPressed = Color(0xFF4C465B)
val HueOnSecondary = Color(0xFFFFFFFF)
val HueSecondaryContainer = Color(0xFFE7E4EC)
val HueOnSecondaryContainer = Color(0xFF262231)

// --- Terciario ----------------------------------------------------------
val HueTertiary = Color(0xFF6A5670)
val HueOnTertiary = Color(0xFFFFFFFF)
val HueTertiaryContainer = Color(0xFFEBE3EE)
val HueOnTertiaryContainer = Color(0xFF2C2430)

// --- Estados: fuera de la familia violeta, y a proposito ------------------
val HueError = Color(0xFFB3261E)
val HueOnError = Color(0xFFFFFFFF)
val HueErrorContainer = Color(0xFFF9DEDC)
val HueOnErrorContainer = Color(0xFF410E0B)

/** Material 3 no define exito ni aviso; viajan por [HueckoExtendedColors]. */
val HueSuccess = Color(0xFF2F6B4F)
val HueOnSuccess = Color(0xFFFFFFFF)
val HueSuccessContainer = Color(0xFFDBEEE2)
val HueOnSuccessContainer = Color(0xFF10301F)

val HueWarning = Color(0xFF7A5210)
val HueOnWarning = Color(0xFFFFFFFF)
val HueWarningContainer = Color(0xFFF8EACF)
val HueOnWarningContainer = Color(0xFF3A2504)

// --- Superficies --------------------------------------------------------
/** Blanco con una gota de violeta, no blanco puro: separa el lienzo de las
 *  tarjetas sin necesidad de sombras. */
val HueBackground = Color(0xFFF8F7FA)
val HueOnBackground = Color(0xFF1C1B22)
val HueSurface = Color(0xFFF8F7FA)
val HueOnSurface = Color(0xFF1C1B22)
val HueSurfaceVariant = Color(0xFFE9E7EE)
val HueOnSurfaceVariant = Color(0xFF4A4557)

/**
 * `outline` es color de BORDE y de marcador de posicion, nunca de texto de
 * lectura: sobre `surface` da 4.4:1 y se queda corto para cuerpo de texto.
 * Para texto secundario, [HueOnSurfaceVariant] (8.6:1).
 */
val HueOutline = Color(0xFF767185)
val HueOutlineVariant = Color(0xFFDBD8E3)

val HueScrim = Color(0xFF1C1B22)
val HueInverseSurface = Color(0xFF2F2B38)
val HueInverseOnSurface = Color(0xFFF4F2F7)
val HueInversePrimary = Color(0xFFC9C0E0)

val HueSurfaceDim = Color(0xFFE6E4EC)
val HueSurfaceBright = Color(0xFFFFFFFF)
val HueSurfaceContainerLowest = Color(0xFFFFFFFF)
val HueSurfaceContainerLow = Color(0xFFFCFBFD)
val HueSurfaceContainer = Color(0xFFF1EFF5)
val HueSurfaceContainerHigh = Color(0xFFEBE9F1)
val HueSurfaceContainerHighest = Color(0xFFE4E2EB)

/**
 * Colores de categoria de bloques y grupos. Son DATOS, no cromo de interfaz:
 * identifican materias y miembros, por eso viven fuera del `ColorScheme`.
 *
 * Cada tono esta oscurecido hasta pasar 4.5:1 sobre fondo claro, porque el
 * color se pinta tambien como TEXTO del bloque y no solo como punto de color.
 * Se ordenan de forma que dos consecutivos nunca sean del mismo tono: la
 * asignacion es ciclica y en un grupo pequeno se veran seguidos.
 */
val CategoryColors: List<Color> = listOf(
    Color(0xFF4A3B77), // Violeta
    Color(0xFF3F5068), // Pizarra
    Color(0xFF6B3F63), // Ciruela
    Color(0xFF3E5F4A), // Musgo
    Color(0xFF8A5340), // Arcilla
    Color(0xFF3F4A80), // Indigo
    Color(0xFF7A3B4E), // Vino
    Color(0xFF6E5626), // Bronce
)

/** Devuelve un color estable por indice, dando la vuelta al final de la lista. */
fun categoryColorByIndex(index: Int): Color = CategoryColors[index.mod(CategoryColors.size)]
