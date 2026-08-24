package com.example.hueckoapp.domain.model

import java.time.LocalTime

/**
 * Representa un usuario del sistema HueckoApp.
 */
data class User(
    val id: String,
    val name: String,
    val email: String,
    val isEssential: Boolean = false
)

/**
 * Representa un grupo de amigos.
 */
data class Group(
    val id: String,
    val name: String,
    val members: List<User>
)

/**
 * Representa un bloque de disponibilidad (o indisponibilidad).
 * Basado en HU-01 y HU-03.
 */
data class TimeBlock(
    val id: String,
    val userId: String,
    val dayOfWeek: Int? = null, // 1 para Lunes, null para eventos puntuales
    val startTime: String, // Formato HH:mm
    val endTime: String,   // Formato HH:mm
    val label: String,
    val isRecurring: Boolean = true
)

/**
 * Representa un evento o plan confirmado.
 */
data class Plan(
    val id: String,
    val groupId: String,
    val title: String,
    val location: String?,
    val dateTime: String,
    val status: String // "PROPOSED", "CONFIRMED", "CANCELLED"
)
