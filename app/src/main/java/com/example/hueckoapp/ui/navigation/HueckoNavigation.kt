package com.example.hueckoapp.ui.navigation

import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Scaffold
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import com.example.hueckoapp.ui.auth.LoginScreen
import com.example.hueckoapp.ui.components.HueckoBottomBar
import com.example.hueckoapp.ui.components.HueckoDestination
import com.example.hueckoapp.ui.dashboard.DashboardScreen
import com.example.hueckoapp.ui.groups.GroupsScreen
import com.example.hueckoapp.ui.placeholder.ComingSoonScreen

object Routes {
    const val LOGIN = "login"
}

/**
 * Grafo de navegacion.
 *
 * La barra inferior solo aparece dentro de la sesion: en la pantalla de
 * acceso no hay a donde navegar, y mostrarla vacia sugeriria lo contrario.
 * Al entrar se limpia `login` de la pila para que el boton Atras del sistema
 * no devuelva al formulario ya resuelto.
 */
@Composable
fun HueckoNavigation(navController: NavHostController = rememberNavController()) {
    val backStackEntry by navController.currentBackStackEntryAsState()
    val rutaActual = backStackEntry?.destination?.route
    val destinoActual = HueckoDestination.entries.firstOrNull { it.route == rutaActual }

    Scaffold(
        bottomBar = {
            if (destinoActual != null) {
                HueckoBottomBar(
                    current = destinoActual,
                    onNavigate = { destino -> navController.navigateToTab(destino) },
                )
            }
        },
    ) { innerPadding ->
        NavHost(
            navController = navController,
            startDestination = Routes.LOGIN,
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding),
        ) {
            composable(Routes.LOGIN) {
                LoginScreen(
                    onLoggedIn = {
                        navController.navigate(HueckoDestination.DASHBOARD.route) {
                            popUpTo(Routes.LOGIN) { inclusive = true }
                        }
                    },
                )
            }

            composable(HueckoDestination.DASHBOARD.route) {
                DashboardScreen(
                    onNavigateToGroups = { navController.navigateToTab(HueckoDestination.GROUPS) },
                    onNavigateToSchedule = { navController.navigateToTab(HueckoDestination.SCHEDULE) },
                )
            }

            composable(HueckoDestination.GROUPS.route) {
                GroupsScreen()
            }

            composable(HueckoDestination.SCHEDULE.route) {
                ComingSoonScreen(
                    titulo = "Mi horario",
                    descripcion = "Aqui viviran los bloques recurrentes y puntuales, y la importacion por OCR de tu horario (HU-01, HU-02, HU-03).",
                )
            }

            composable(HueckoDestination.PROFILE.route) {
                ComingSoonScreen(
                    titulo = "Mi perfil",
                    descripcion = "Datos de la cuenta, preferencias de notificacion y cierre de sesion.",
                )
            }
        }
    }
}

/**
 * Salta a una pestana sin apilar copias: volver a pulsar la pestana en la que
 * ya estas no debe crear una entrada nueva en la pila, y el Atras del sistema
 * tiene que llevar al inicio, no recorrer el historial de pestanas.
 *
 * El ancla del `popUpTo` es el inicio y no la raiz del grafo, porque la raiz
 * es `login` y esa entrada se elimina al autenticarse.
 */
private fun NavHostController.navigateToTab(destino: HueckoDestination) {
    navigate(destino.route) {
        popUpTo(HueckoDestination.DASHBOARD.route) { saveState = true }
        launchSingleTop = true
        restoreState = true
    }
}
