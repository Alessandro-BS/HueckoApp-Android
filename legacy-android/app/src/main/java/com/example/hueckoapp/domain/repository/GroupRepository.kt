package com.example.hueckoapp.domain.repository

import com.example.hueckoapp.domain.model.Group
import kotlinx.coroutines.flow.Flow

// Gestión de grupos del usuario
interface GroupRepository {
    // Obtiene los grupos a los que pertenece el usuario
    fun getGroups(): Flow<List<Group>>

    // Crea un nuevo grupo y devuelve el resultado
    suspend fun createGroup(name: String): Result<Group>

    // Intenta unirse a un grupo usando un código de invitación
    suspend fun joinGroup(inviteCode: String): Result<Group>
}
