package com.example.hueckoapp.ui.navigation

import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import com.example.hueckoapp.data.repository.AuthRepositoryImpl
import com.example.hueckoapp.ui.auth.AuthViewModel
import com.example.hueckoapp.ui.auth.LoginScreen
import com.example.hueckoapp.ui.auth.RegisterScreen
import com.example.hueckoapp.ui.dashboard.DashboardScreen

@Composable
fun HueckoNavigation() {
    val navController = rememberNavController()
    // Instanciación manual temporal (sin DI aún)
    val authRepository = remember { AuthRepositoryImpl() }
    val authViewModel = remember { AuthViewModel(authRepository) }

    NavHost(navController = navController, startDestination = "login") {
        composable("login") {
            LoginScreen(
                viewModel = authViewModel,
                onNavigateToRegister = { navController.navigate("register") },
                onLoginSuccess = { 
                    navController.navigate("dashboard") {
                        popUpTo("login") { inclusive = true }
                    }
                }
            )
        }
        composable("register") {
            RegisterScreen(
                viewModel = authViewModel,
                onNavigateToLogin = { navController.popBackStack() },
                onRegisterSuccess = {
                    navController.navigate("dashboard") {
                        popUpTo("login") { inclusive = true }
                    }
                }
            )
        }
        composable("dashboard") {
            DashboardScreen()
        }
    }
}
