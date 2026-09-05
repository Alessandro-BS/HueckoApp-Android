package com.example.hueckoapp.ui.navigation

import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Scaffold
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Modifier
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import com.example.hueckoapp.data.repository.AuthRepositoryImpl
import com.example.hueckoapp.data.repository.GroupRepositoryImpl
import com.example.hueckoapp.data.repository.PlanRepositoryImpl
import com.example.hueckoapp.data.repository.ScheduleRepositoryImpl
import com.example.hueckoapp.data.service.GeminiService
import com.example.hueckoapp.ui.auth.AuthViewModel
import com.example.hueckoapp.ui.auth.LoginScreen
import com.example.hueckoapp.ui.auth.RegisterScreen
import com.example.hueckoapp.ui.components.HueckoBottomBar
import com.example.hueckoapp.ui.components.HueckoDestination
import com.example.hueckoapp.ui.dashboard.DashboardScreen
import com.example.hueckoapp.ui.dashboard.DashboardViewModel
import com.example.hueckoapp.ui.group.GroupListScreen
import com.example.hueckoapp.ui.group.GroupPlanningViewModel
import com.example.hueckoapp.ui.group.GroupViewModel
import com.example.hueckoapp.ui.ocr.OcrReviewScreen
import com.example.hueckoapp.ui.ocr.OcrViewModel
import com.example.hueckoapp.ui.profile.ProfileScreen
import com.example.hueckoapp.ui.schedule.AddScheduleScreen
import com.example.hueckoapp.ui.schedule.MyScheduleScreen
import com.example.hueckoapp.ui.schedule.ScheduleViewModel
import kotlinx.coroutines.launch

object Routes {
    const val LOGIN = "login"
    const val REGISTER = "register"
    const val ADD_SCHEDULE = "add_schedule"
    const val OCR_REVIEW = "ocr_review/{uri}"
}

/**
 * Grafo de navegacion.
 *
 * La barra inferior solo aparece en los cuatro destinos principales. En login,
 * registro o en un formulario a pantalla completa no hay a donde saltar, y
 * dejarla visible invitaria a abandonar lo que se esta rellenando.
 */
@Composable
fun HueckoNavigation(navController: NavHostController = rememberNavController()) {
    val scope = rememberCoroutineScope()

    // Instanciacion manual temporal, a la espera de un inyector de dependencias.
    val authRepository = remember { AuthRepositoryImpl() }
    val scheduleRepository = remember { ScheduleRepositoryImpl() }
    val groupRepository = remember { GroupRepositoryImpl() }
    val planRepository = remember { PlanRepositoryImpl() }
    val geminiService = remember { GeminiService() }

    val authViewModel = remember { AuthViewModel(authRepository) }
    val scheduleViewModel = remember { ScheduleViewModel(scheduleRepository) }
    val groupViewModel = remember { GroupViewModel(groupRepository) }
    val ocrViewModel = remember { OcrViewModel(geminiService) }
    val dashboardViewModel = remember {
        DashboardViewModel(authRepository, groupRepository, scheduleRepository, planRepository)
    }
    val planningViewModel = remember {
        GroupPlanningViewModel(authRepository, scheduleRepository, planRepository)
    }

    val backStackEntry by navController.currentBackStackEntryAsState()
    val currentRoute = backStackEntry?.destination?.route
    val currentTab = HueckoDestination.entries.firstOrNull { it.route == currentRoute }

    Scaffold(
        bottomBar = {
            if (currentTab != null) {
                HueckoBottomBar(
                    current = currentTab,
                    onNavigate = { destination -> navController.navigateToTab(destination) },
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
                    viewModel = authViewModel,
                    onNavigateToRegister = { navController.navigate(Routes.REGISTER) },
                    onLoginSuccess = {
                        navController.navigate(HueckoDestination.DASHBOARD.route) {
                            // Se saca login de la pila: el boton Atras no debe
                            // devolver a un formulario ya resuelto.
                            popUpTo(Routes.LOGIN) { inclusive = true }
                        }
                    },
                )
            }

            composable(Routes.REGISTER) {
                RegisterScreen(
                    viewModel = authViewModel,
                    onNavigateToLogin = { navController.popBackStack() },
                    onRegisterSuccess = {
                        navController.navigate(HueckoDestination.DASHBOARD.route) {
                            popUpTo(Routes.LOGIN) { inclusive = true }
                        }
                    },
                )
            }

            composable(HueckoDestination.DASHBOARD.route) {
                DashboardScreen(
                    viewModel = dashboardViewModel,
                    onNavigateToSchedule = { navController.navigateToTab(HueckoDestination.SCHEDULE) },
                    onNavigateToGroups = { navController.navigateToTab(HueckoDestination.GROUPS) },
                )
            }

            composable(HueckoDestination.GROUPS.route) {
                GroupListScreen(
                    viewModel = groupViewModel,
                    planningViewModel = planningViewModel,
                )
            }

            composable(HueckoDestination.SCHEDULE.route) {
                MyScheduleScreen(
                    viewModel = scheduleViewModel,
                    onNavigateToAdd = { navController.navigate(Routes.ADD_SCHEDULE) },
                    onNavigateToOcr = { uri ->
                        val encodedUri = java.net.URLEncoder.encode(uri.toString(), "UTF-8")
                        navController.navigate("ocr_review/$encodedUri")
                    },
                    onBack = { navController.popBackStack() },
                )
            }

            composable(HueckoDestination.PROFILE.route) {
                ProfileScreen(
                    viewModel = authViewModel,
                    onLoggedOut = {
                        navController.navigate(Routes.LOGIN) {
                            popUpTo(HueckoDestination.DASHBOARD.route) { inclusive = true }
                        }
                    },
                )
            }

            composable(Routes.ADD_SCHEDULE) {
                AddScheduleScreen(
                    viewModel = scheduleViewModel,
                    onBack = { navController.popBackStack() },
                )
            }

            composable(Routes.OCR_REVIEW) { entry ->
                val uriString = entry.arguments?.getString("uri").orEmpty()
                val uri = android.net.Uri.parse(java.net.URLDecoder.decode(uriString, "UTF-8"))
                OcrReviewScreen(
                    viewModel = ocrViewModel,
                    imageUri = uri,
                    onConfirm = { blocks ->
                        scope.launch {
                            blocks.forEach { scheduleRepository.addTimeBlock(it) }
                            navController.navigate(HueckoDestination.SCHEDULE.route) {
                                popUpTo(HueckoDestination.SCHEDULE.route) { inclusive = true }
                            }
                        }
                    },
                    onBack = { navController.popBackStack() },
                )
            }
        }
    }
}

/**
 * Salta a una pestana sin apilar copias. El ancla del `popUpTo` es el inicio y
 * no la raiz del grafo, porque la raiz es `login` y esa entrada desaparece al
 * autenticarse.
 */
private fun NavHostController.navigateToTab(destination: HueckoDestination) {
    navigate(destination.route) {
        popUpTo(HueckoDestination.DASHBOARD.route) { saveState = true }
        launchSingleTop = true
        restoreState = true
    }
}
