package com.example.hueckoapp.ui.theme

import androidx.compose.ui.graphics.Color

/**
 * Paleta de Huecko: Morado / Púrpura Elegante y Moderno (Material 3).
 *
 * Una paleta centrada en tonos morados y lavanda que aporta identidad de marca
 * clara, manteniendo los contrastes WCAG AA requeridos para legibilidad.
 */

// --- Primario (Morado Vivo / Violeta Profundo) ---------------------------
val HuePrimary = Color(0xFF6750A4)
val HuePrimaryPressed = Color(0xFF4F378B)
val HueOnPrimary = Color(0xFFFFFFFF)
val HuePrimaryContainer = Color(0xFFEADDFF)
val HueOnPrimaryContainer = Color(0xFF21005D)

// --- Secundario (Lavanda Grisáceo) ---------------------------------------
val HueSecondary = Color(0xFF625B71)
val HueSecondaryPressed = Color(0xFF4A4458)
val HueOnSecondary = Color(0xFFFFFFFF)
val HueSecondaryContainer = Color(0xFFE8DEF8)
val HueOnSecondaryContainer = Color(0xFF1D192B)

// --- Terciario (Magenta / Púrpura Rosáceo) ------------------------------
val HueTertiary = Color(0xFF7D5260)
val HueOnTertiary = Color(0xFFFFFFFF)
val HueTertiaryContainer = Color(0xFFFFD8E4)
val HueOnTertiaryContainer = Color(0xFF31111D)

// --- Estados -------------------------------------------------------------
val HueError = Color(0xFFB3261E)
val HueOnError = Color(0xFFFFFFFF)
val HueErrorContainer = Color(0xFFF9DEDC)
val HueOnErrorContainer = Color(0xFF410E0B)

val HueSuccess = Color(0xFF2F6B4F)
val HueOnSuccess = Color(0xFFFFFFFF)
val HueSuccessContainer = Color(0xFFDBEEE2)
val HueOnSuccessContainer = Color(0xFF10301F)

val HueWarning = Color(0xFF7A5210)
val HueOnWarning = Color(0xFFFFFFFF)
val HueWarningContainer = Color(0xFFF8EACF)
val HueOnWarningContainer = Color(0xFF3A2504)

// --- Superficies (Tinte lavanda muy suave) ------------------------------
val HueBackground = Color(0xFFFEF7FF)
val HueOnBackground = Color(0xFF1D1B20)
val HueSurface = Color(0xFFFEF7FF)
val HueOnSurface = Color(0xFF1D1B20)
val HueSurfaceVariant = Color(0xFFE7E0EC)
val HueOnSurfaceVariant = Color(0xFF49454F)

val HueOutline = Color(0xFF79747E)
val HueOutlineVariant = Color(0xFFCAC4D0)

val HueScrim = Color(0xFF1D1B20)
val HueInverseSurface = Color(0xFF322F35)
val HueInverseOnSurface = Color(0xFFF4EFF4)
val HueInversePrimary = Color(0xFFD0BCFF)

val HueSurfaceDim = Color(0xFFDED8E4)
val HueSurfaceBright = Color(0xFFFEF7FF)
val HueSurfaceContainerLowest = Color(0xFFFFFFFF)
val HueSurfaceContainerLow = Color(0xFFF7F2FA)
val HueSurfaceContainer = Color(0xFFF3EDF7)
val HueSurfaceContainerHigh = Color(0xFFECE6F0)
val HueSurfaceContainerHighest = Color(0xFFE6E0EB)

/**
 * Colores de categoría de bloques y grupos con armonía púrpura.
 */
val CategoryColors: List<Color> = listOf(
    Color(0xFF6750A4), // Púrpura Principal
    Color(0xFF535288), // Púrpura Pizarra
    Color(0xFF7B4B8E), // Ciruela Intenso
    Color(0xFF4A6B5B), // Musgo Armonioso
    Color(0xFF8C523B), // Arcilla Cálida
    Color(0xFF4E588E), // Índigo Profundo
    Color(0xFF823B58), // Magenta Oscuro
    Color(0xFF7A5926), // Bronce Dorado
)

/** Devuelve un color estable por índice. */
fun categoryColorByIndex(index: Int): Color = CategoryColors[index.mod(CategoryColors.size)]
