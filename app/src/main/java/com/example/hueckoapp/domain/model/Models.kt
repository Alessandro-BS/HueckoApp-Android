package com.example.hueckoapp.domain.model

// Representa un usuario del sistema
data class User(
    val id: String,
    val name: String,
    val email: String,
    val isEssential: Boolean = false
)

// Representa un grupo de amigos
data class Group(
    val id: String,
    val name: String,
    val inviteCode: String,
    val members: List<User>
)

// Bloque de horario (HU-01, HU-03)
data class TimeBlock(
    val id: String,
    val userId: String,
    val dayOfWeek: Int? = null, // 1=Lunes...7=Domingo, null=Puntual
    val startTime: String, // HH:mm
    val endTime: String,   // HH:mm
    val label: String,     // Ej: "Clase de Cálculo"
    val isRecurring: Boolean = true
)

// Plan o evento grupal confirmado
data class Plan(
    val id: String,
    val groupId: String,
    val title: String,
    val location: String?,
    val dateTime: String,
    val status: String // PROPOSED, CONFIRMED, CANCELLED
)
