package com.example.hueckoapp.ui.components

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.CalendarMonth
import androidx.compose.material.icons.outlined.Dashboard
import androidx.compose.material.icons.outlined.Group
import androidx.compose.material.icons.outlined.Person
import androidx.compose.ui.graphics.vector.ImageVector

enum class HueckoDestination(val route: String, val label: String, val icon: ImageVector) {
    DASHBOARD("dashboard", "Inicio", Icons.Outlined.Dashboard),
    SCHEDULE("my_schedule", "Horario", Icons.Outlined.CalendarMonth),
    GROUPS("groups", "Grupos", Icons.Outlined.Group),
    PROFILE("profile", "Perfil", Icons.Outlined.Person),
}
