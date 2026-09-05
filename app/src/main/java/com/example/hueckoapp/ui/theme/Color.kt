package com.example.hueckoapp.ui.theme

import androidx.compose.ui.graphics.Color

/**
 * Paleta de Huecko, portada uno a uno desde el bloque `@theme` de
 * `huecko-frontend/src/index.css`. Cambiar la marca = cambiar este archivo:
 * ninguna pantalla conoce un hexadecimal.
 *
 * Los nombres siguen los roles de Material 3 para que el mapeo a
 * `ColorScheme` en [HueckoAppTheme] sea directo y verificable.
 */

// --- Primario -----------------------------------------------------------
val HuePrimary = Color(0xFF3F5D45)
val HuePrimaryHover = Color(0xFF34503A)
val HueOnPrimary = Color(0xFFFFFFFF)
val HuePrimaryContainer = Color(0xFFE2ECE5)
val HueOnPrimaryContainer = Color(0xFF26352A)

// --- Secundario ---------------------------------------------------------
val HueSecondary = Color(0xFF5F7359)
val HueSecondaryHover = Color(0xFF4F604E)
val HueOnSecondary = Color(0xFFFFFFFF)
val HueSecondaryContainer = Color(0xFFE8EEE9)
val HueOnSecondaryContainer = Color(0xFF293229)

// --- Terciario ----------------------------------------------------------
val HueTertiary = Color(0xFF687668)
val HueOnTertiary = Color(0xFFFFFFFF)
val HueTertiaryContainer = Color(0xFFE6EBE6)
val HueOnTertiaryContainer = Color(0xFF2E382F)

// --- Error --------------------------------------------------------------
val HueError = Color(0xFFBA1A1A)
val HueOnError = Color(0xFFFFFFFF)
val HueErrorContainer = Color(0xFFFFDAD6)
val HueOnErrorContainer = Color(0xFF410002)

// --- Éxito y aviso (no existen como rol en Material 3) -------------------
val HueSuccess = Color(0xFF2F6B4F)
val HueOnSuccess = Color(0xFFFFFFFF)
val HueSuccessContainer = Color(0xFFDBEEE2)
val HueOnSuccessContainer = Color(0xFF10301F)

val HueWarning = Color(0xFF8A5A10)
val HueOnWarning = Color(0xFFFFFFFF)
val HueWarningContainer = Color(0xFFFBEACD)
val HueOnWarningContainer = Color(0xFF3A2504)

// --- Superficies --------------------------------------------------------
val HueBackground = Color(0xFFF7F8F7)
val HueOnBackground = Color(0xFF1B211D)
val HueSurface = Color(0xFFF7F8F7)
val HueOnSurface = Color(0xFF1B211D)
val HueSurfaceVariant = Color(0xFFEAEEEA)
val HueOnSurfaceVariant = Color(0xFF525A53)

/**
 * `outline` es color de BORDE y de marcador de posición. Nunca de texto de
 * lectura: sobre `surface` da 3.9:1 y no pasa AA. Para texto secundario usa
 * [HueOnSurfaceVariant] (5.9:1).
 */
val HueOutline = Color(0xFF757C76)
val HueOutlineVariant = Color(0xFFDDE0DC)

val HueScrim = Color(0xFF1A211B)
val HueInverseSurface = Color(0xFF2E382F)
val HueInverseOnSurface = Color(0xFFF7F8F7)
val HueInversePrimary = Color(0xFFC8D5C4)

val HueSurfaceDim = Color(0xFFE6EAE6)
val HueSurfaceBright = Color(0xFFFFFFFF)
val HueSurfaceContainerLowest = Color(0xFFFFFFFF)
val HueSurfaceContainerLow = Color(0xFFFBFCFB)
val HueSurfaceContainer = Color(0xFFF1F4F1)
val HueSurfaceContainerHigh = Color(0xFFE9EDE9)
val HueSurfaceContainerHighest = Color(0xFFE1E6E1)

/** Verde profundo de marca: paneles y degradados de identidad. */
val HueBrandDeep = Color(0xFF1F2C22)
val HueBrandMid = Color(0xFF34503A)

/**
 * Colores de categoría de bloques y grupos. Son DATOS, no cromo de interfaz:
 * identifican materias y miembros, por eso viven fuera del `ColorScheme`.
 * Réplica de `huecko-frontend/src/theme/palette.ts`.
 */
val CategoryColors: List<Color> = listOf(
    Color(0xFF47624E), // Bosque
    Color(0xFF4C6070), // Pizarra
    Color(0xFF8D5540), // Arcilla
    Color(0xFF71713F), // Oliva
    Color(0xFF614A5F), // Ciruela
    Color(0xFF8F4A41), // Terracota
    Color(0xFF4B5279), // Índigo
    Color(0xFF74572F), // Cobre
)

/** Color por defecto de un bloque nuevo: el primer swatch que ve el usuario. */
val DefaultCategoryColor: Color = CategoryColors.first()

/** Devuelve un color estable por índice, dando la vuelta al final de la lista. */
fun categoryColorByIndex(index: Int): Color = CategoryColors[index.mod(CategoryColors.size)]
