package com.example.hueckoapp.ui.navigation

import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import com.example.hueckoapp.data.repository.AuthRepositoryImpl
import com.example.hueckoapp.data.repository.ScheduleRepositoryImpl
import com.example.hueckoapp.data.service.GeminiService
import com.example.hueckoapp.ui.auth.AuthViewModel
import com.example.hueckoapp.ui.auth.LoginScreen
import com.example.hueckoapp.ui.auth.RegisterScreen
import com.example.hueckoapp.ui.dashboard.DashboardScreen
import com.example.hueckoapp.ui.ocr.OcrReviewScreen
import com.example.hueckoapp.ui.ocr.OcrViewModel
import com.example.hueckoapp.ui.schedule.AddScheduleScreen
import com.example.hueckoapp.ui.schedule.MyScheduleScreen
import com.example.hueckoapp.ui.schedule.ScheduleViewModel
import kotlinx.coroutines.launch

@Composable
fun HueckoNavigation() {
    val navController = rememberNavController()
    val scope = androidx.compose.runtime.rememberCoroutineScope()

    // Instanciación manual temporal
    val authRepository = remember { AuthRepositoryImpl() }
    val authViewModel = remember { AuthViewModel(authRepository) }
    
    val scheduleRepository = remember { ScheduleRepositoryImpl() }
    val scheduleViewModel = remember { ScheduleViewModel(scheduleRepository) }

    val geminiService = remember { GeminiService() }
    val ocrViewModel = remember { OcrViewModel(geminiService) }

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
            DashboardScreen(onNavigateToSchedule = { navController.navigate("my_schedule") })
        }
        composable("my_schedule") {
            MyScheduleScreen(
                viewModel = scheduleViewModel,
                onNavigateToAdd = { navController.navigate("add_schedule") },
                onNavigateToOcr = { uri ->
                    val encodedUri = java.net.URLEncoder.encode(uri.toString(), "UTF-8")
                    navController.navigate("ocr_review/$encodedUri")
                },
                onBack = { navController.popBackStack() }
            )
        }
        composable("add_schedule") {
            AddScheduleScreen(
                viewModel = scheduleViewModel,
                onBack = { navController.popBackStack() }
            )
        }
        composable("ocr_review/{uri}") { backStackEntry ->
            val uriString = backStackEntry.arguments?.getString("uri") ?: ""
            val uri = android.net.Uri.parse(java.net.URLDecoder.decode(uriString, "UTF-8"))
            OcrReviewScreen(
                viewModel = ocrViewModel,
                imageUri = uri,
                onConfirm = { blocks ->
                    scope.launch {
                        blocks.forEach { scheduleRepository.addTimeBlock(it) }
                        navController.navigate("my_schedule") {
                            popUpTo("my_schedule") { inclusive = true }
                        }
                    }
                },
                onBack = { navController.popBackStack() }
            )
        }
    }
}
