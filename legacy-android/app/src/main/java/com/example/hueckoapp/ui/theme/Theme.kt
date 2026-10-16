package com.example.hueckoapp.ui.theme

import android.app.Activity
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalView
import androidx.core.view.WindowCompat

/**
 * Esquema claro de Huecko.
 *
 * El color dinamico de Android 12+ esta deshabilitado a proposito: la
 * identidad de la marca es el violeta, y dejar que el fondo de pantalla del
 * telefono lo reescriba haria que la app se viera distinta en cada movil y
 * rompiera la continuidad con la web.
 */
private val HueckoLightColorScheme = lightColorScheme(
    primary = HuePrimary,
    onPrimary = HueOnPrimary,
    primaryContainer = HuePrimaryContainer,
    onPrimaryContainer = HueOnPrimaryContainer,
    inversePrimary = HueInversePrimary,

    secondary = HueSecondary,
    onSecondary = HueOnSecondary,
    secondaryContainer = HueSecondaryContainer,
    onSecondaryContainer = HueOnSecondaryContainer,

    tertiary = HueTertiary,
    onTertiary = HueOnTertiary,
    tertiaryContainer = HueTertiaryContainer,
    onTertiaryContainer = HueOnTertiaryContainer,

    error = HueError,
    onError = HueOnError,
    errorContainer = HueErrorContainer,
    onErrorContainer = HueOnErrorContainer,

    background = HueBackground,
    onBackground = HueOnBackground,
    surface = HueSurface,
    onSurface = HueOnSurface,
    surfaceVariant = HueSurfaceVariant,
    onSurfaceVariant = HueOnSurfaceVariant,

    outline = HueOutline,
    outlineVariant = HueOutlineVariant,
    scrim = HueScrim,
    inverseSurface = HueInverseSurface,
    inverseOnSurface = HueInverseOnSurface,

    surfaceDim = HueSurfaceDim,
    surfaceBright = HueSurfaceBright,
    surfaceContainerLowest = HueSurfaceContainerLowest,
    surfaceContainerLow = HueSurfaceContainerLow,
    surfaceContainer = HueSurfaceContainer,
    surfaceContainerHigh = HueSurfaceContainerHigh,
    surfaceContainerHighest = HueSurfaceContainerHighest,
)

/**
 * Roles que la interfaz usa y Material 3 no define: exito, aviso y los tonos
 * de pulsacion. Viajan por un CompositionLocal para leerse igual que
 * `MaterialTheme.colorScheme`, sin constantes sueltas por las pantallas.
 */
@Immutable
data class HueckoExtendedColors(
    val primaryPressed: Color = HuePrimaryPressed,
    val secondaryPressed: Color = HueSecondaryPressed,
    val success: Color = HueSuccess,
    val onSuccess: Color = HueOnSuccess,
    val successContainer: Color = HueSuccessContainer,
    val onSuccessContainer: Color = HueOnSuccessContainer,
    val warning: Color = HueWarning,
    val onWarning: Color = HueOnWarning,
    val warningContainer: Color = HueWarningContainer,
    val onWarningContainer: Color = HueOnWarningContainer,
)

val LocalHueckoColors = staticCompositionLocalOf { HueckoExtendedColors() }

/** Atajo de lectura para las pantallas: `HueckoTheme.extended.warning`. */
object HueckoTheme {
    val extended: HueckoExtendedColors
        @Composable get() = LocalHueckoColors.current
}

@Composable
fun HueckoAppTheme(content: @Composable () -> Unit) {
    val view = LocalView.current
    if (!view.isInEditMode) {
        SideEffect {
            val window = (view.context as Activity).window
            window.statusBarColor = HueSurface.toArgb()
            window.navigationBarColor = HueSurfaceContainer.toArgb()
            // Fondo claro, luego iconos de barra oscuros o se vuelven invisibles.
            WindowCompat.getInsetsController(window, view).apply {
                isAppearanceLightStatusBars = true
                isAppearanceLightNavigationBars = true
            }
        }
    }

    CompositionLocalProvider(LocalHueckoColors provides HueckoExtendedColors()) {
        MaterialTheme(
            colorScheme = HueckoLightColorScheme,
            typography = HueckoTypography,
            shapes = HueckoShapes,
            content = content,
        )
    }
}
