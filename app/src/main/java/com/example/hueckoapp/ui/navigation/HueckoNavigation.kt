package com.example.hueckoapp.ui.navigation

import androidx.compose.runtime.Composable
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import com.example.hueckoapp.ui.dashboard.DashboardScreen

@Composable
fun HueckoNavigation() {
    val navController = rememberNavController()

    NavHost(navController = navController, startDestination = "dashboard") {
        composable("dashboard") {
            DashboardScreen()
        }
        // Próximamente: Login, Grupos, Perfil
    }
}
