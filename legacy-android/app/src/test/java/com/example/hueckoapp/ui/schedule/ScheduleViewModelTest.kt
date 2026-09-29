package com.example.hueckoapp.ui.schedule

import com.example.hueckoapp.domain.model.TimeBlock
import com.example.hueckoapp.domain.repository.ScheduleRepository
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Before
import org.junit.Test

class FakeScheduleRepositoryForTest : ScheduleRepository {
    private val blocks = MutableStateFlow<List<TimeBlock>>(emptyList())
    override fun getTimeBlocks(): Flow<List<TimeBlock>> = blocks
    override suspend fun addTimeBlock(block: TimeBlock): Result<Unit> {
        blocks.value = blocks.value + block
        return Result.success(Unit)
    }
    override suspend fun deleteTimeBlock(blockId: String): Result<Unit> {
        blocks.value = blocks.value.filter { it.id != blockId }
        return Result.success(Unit)
    }
    fun getSavedBlocks() = blocks.value
}

@OptIn(ExperimentalCoroutinesApi::class)
class ScheduleViewModelTest {

    private val testDispatcher = StandardTestDispatcher()

    @Before
    fun setUp() {
        Dispatchers.setMain(testDispatcher)
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    @Test
    fun saveBlock_recurrent_savesWithDayOfWeek() = runTest {
        val repo = FakeScheduleRepositoryForTest()
        val viewModel = ScheduleViewModel(repo)

        viewModel.onLabelChange("Clase Matutina")
        viewModel.onDayChange(2) // Martes
        viewModel.onRecurringChange(true)
        viewModel.onStartTimeChange("09:00")
        viewModel.onEndTimeChange("11:00")

        viewModel.saveBlock {}
        testDispatcher.scheduler.advanceUntilIdle()

        val saved = repo.getSavedBlocks().first()
        assertEquals("Clase Matutina", saved.label)
        assertEquals(2, saved.dayOfWeek)
        assertEquals(true, saved.isRecurring)
    }

    @Test
    fun saveBlock_punctual_savesWithNullDayOfWeek() = runTest {
        val repo = FakeScheduleRepositoryForTest()
        val viewModel = ScheduleViewModel(repo)

        viewModel.onLabelChange("Reunión Única")
        viewModel.onRecurringChange(false)
        viewModel.onStartTimeChange("15:00")
        viewModel.onEndTimeChange("16:00")

        viewModel.saveBlock {}
        testDispatcher.scheduler.advanceUntilIdle()

        val saved = repo.getSavedBlocks().first()
        assertEquals("Reunión Única", saved.label)
        assertNull(saved.dayOfWeek)
        assertEquals(false, saved.isRecurring)
    }
}
