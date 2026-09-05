package com.example.hueckoapp.data.repository

import com.example.hueckoapp.domain.model.Group
import com.example.hueckoapp.domain.model.User
import com.example.hueckoapp.domain.repository.GroupRepository
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import java.util.UUID

// Implementación simulada de grupos
class GroupRepositoryImpl : GroupRepository {

    private val currentUser = User("mock_123", "Usuario de Prueba", "test@test.com")

    private val _groups = MutableStateFlow<List<Group>>(
        listOf(
            Group(
                id = "g1",
                name = "Proyecto Integrador",
                inviteCode = "PROY2026",
                members = listOf(currentUser, User("user_2", "Ana", "ana@test.com"))
            )
        )
    )

    override fun getGroups(): Flow<List<Group>> = _groups.asStateFlow()

    override suspend fun createGroup(name: String): Result<Group> {
        delay(1000) // Simular red
        val newGroup = Group(
            id = UUID.randomUUID().toString(),
            name = name,
            inviteCode = name.take(3).uppercase() + (100..999).random(),
            members = listOf(currentUser)
        )
        _groups.update { it + newGroup }
        return Result.success(newGroup)
    }

    override suspend fun joinGroup(inviteCode: String): Result<Group> {
        delay(1000) // Simular red
        
        // Simulación: Comportamiento para probar unirse a un grupo
        val code = inviteCode.trim().uppercase()
        
        // Evitar unirse a grupos que ya tenemos en memoria
        if (_groups.value.any { it.inviteCode == code }) {
            return Result.failure(Exception("Ya perteneces a este grupo"))
        }

        // Simular que el código "HUECKO123" es válido
        if (code == "HUECKO123") {
            val joinedGroup = Group(
                id = UUID.randomUUID().toString(),
                name = "Amigos de la Uni",
                inviteCode = "HUECKO123",
                members = listOf(User("user_3", "Carlos", "carlos@test.com"), currentUser)
            )
            _groups.update { it + joinedGroup }
            return Result.success(joinedGroup)
        }

        return Result.failure(Exception("Código de invitación inválido"))
    }
}
