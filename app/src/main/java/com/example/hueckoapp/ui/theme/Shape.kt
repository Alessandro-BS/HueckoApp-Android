package com.example.hueckoapp.ui.theme

import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Shapes
import androidx.compose.ui.unit.dp

/**
 * Radios de la web (`--radius-*` y las utilidades `rounded-*` de Tailwind),
 * traducidos de rem a dp con la equivalencia habitual 1rem = 16dp.
 */
object HueckoRadius {
    val sm = 4.dp    // 0.25rem
    val md = 6.dp    // 0.375rem
    val lg = 8.dp    // 0.5rem
    val xl = 10.dp   // 0.625rem
    val xxl = 12.dp  // 0.75rem
    val xxxl = 16.dp // 1rem
    /** Tarjetas grandes: la clase rounded-3xl de Tailwind mide 1.5rem. */
    val card = 24.dp
}

val HueckoShapes = Shapes(
    extraSmall = RoundedCornerShape(HueckoRadius.sm),
    small = RoundedCornerShape(HueckoRadius.lg),
    medium = RoundedCornerShape(HueckoRadius.xxl),
    large = RoundedCornerShape(HueckoRadius.xxxl),
    extraLarge = RoundedCornerShape(HueckoRadius.card),
)
