package com.example.hueckoapp.data.repository

import com.example.hueckoapp.domain.model.TimeBlock
import com.example.hueckoapp.domain.repository.ScheduleRepository
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update

// Implementación simulada de horarios
class ScheduleRepositoryImpl : ScheduleRepository {

    private val _blocks = MutableStateFlow<List<TimeBlock>>(
        listOf(
            TimeBlock("1", "user_1", 1, "08:00", "10:00", "Clase de Android"),
            TimeBlock("2", "user_1", 3, "14:00", "16:00", "Trabajo Part-time")
        )
    )

    override fun getTimeBlocks(): Flow<List<TimeBlock>> = _blocks.asStateFlow()

    override suspend fun addTimeBlock(block: TimeBlock): Result<Unit> {
        _blocks.update { it + block }
        return Result.success(Unit)
    }

    override suspend fun deleteTimeBlock(blockId: String): Result<Unit> {
        _blocks.update { it.filterNot { b -> b.id == blockId } }
        return Result.success(Unit)
    }
}
