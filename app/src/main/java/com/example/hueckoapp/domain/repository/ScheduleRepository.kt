package com.example.hueckoapp.domain.repository

import com.example.hueckoapp.domain.model.TimeBlock
import kotlinx.coroutines.flow.Flow

// Gestión de bloques horarios del usuario
interface ScheduleRepository {
    // Obtiene todos los bloques del usuario actual
    fun getTimeBlocks(): Flow<List<TimeBlock>>

    // Agrega un nuevo bloque de horario
    suspend fun addTimeBlock(block: TimeBlock): Result<Unit>

    // Elimina un bloque existente
    suspend fun deleteTimeBlock(blockId: String): Result<Unit>
}
