package com.example.hueckoapp.data.repository

import com.example.hueckoapp.domain.model.User
import com.example.hueckoapp.domain.repository.AuthRepository
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow

// Implementación simulada para desarrollo inicial
class AuthRepositoryImpl : AuthRepository {

    private val _currentUser = MutableStateFlow<User?>(null)

    override suspend fun login(email: String, password: String): Result<User> {
        delay(1500) // Simula retraso de red
        
        return if (email.contains("@") && password.length >= 6) {
            val user = User(
                id = "mock_123",
                name = "Usuario de Prueba",
                email = email
            )
            _currentUser.value = user
            Result.success(user)
        } else {
            Result.failure(Exception("Credenciales inválidas"))
        }
    }

    override suspend fun register(name: String, email: String, password: String): Result<User> {
        delay(1500)
        val user = User(id = "mock_${System.currentTimeMillis()}", name = name, email = email)
        _currentUser.value = user
        return Result.success(user)
    }

    override suspend fun logout() {
        _currentUser.value = null
    }

    override fun getCurrentUser(): Flow<User?> = _currentUser.asStateFlow()
}
