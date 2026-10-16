package com.example.hueckoapp.domain.repository

import com.example.hueckoapp.domain.model.User
import kotlinx.coroutines.flow.Flow

// Operaciones de autenticación de HueckoApp
interface AuthRepository {
    // Inicia sesión con email y contraseña
    suspend fun login(email: String, password: String): Result<User>

    // Registra un nuevo usuario
    suspend fun register(name: String, email: String, password: String): Result<User>

    // Cierra la sesión del usuario actual
    suspend fun logout()

    // Retorna el flujo del usuario actual
    fun getCurrentUser(): Flow<User?>
}
