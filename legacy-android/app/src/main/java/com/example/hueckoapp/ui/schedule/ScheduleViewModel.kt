package com.example.hueckoapp.ui.schedule

import androidx.compose.runtime.State
import androidx.compose.runtime.mutableStateOf
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.hueckoapp.domain.model.TimeBlock
import com.example.hueckoapp.domain.repository.ScheduleRepository
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

class ScheduleViewModel(private val repository: ScheduleRepository) : ViewModel() {

    // Flujo de bloques horarios del usuario
    val timeBlocks: StateFlow<List<TimeBlock>> = repository.getTimeBlocks()
        .stateIn(
            scope = viewModelScope,
            started = SharingStarted.WhileSubscribed(5000),
            initialValue = emptyList()
        )

    private val _isLoading = mutableStateOf(false)
    val isLoading: State<Boolean> = _isLoading

    // Estado del formulario para nuevo bloque
    private val _newLabel = mutableStateOf("")
    val newLabel: State<String> = _newLabel

    private val _newDay = mutableStateOf(1) // 1 = Lunes
    val newDay: State<Int> = _newDay

    private val _isRecurring = mutableStateOf(true)
    val isRecurring: State<Boolean> = _isRecurring

    private val _newStartTime = mutableStateOf("08:00")
    val newStartTime: State<String> = _newStartTime

    private val _newEndTime = mutableStateOf("09:00")
    val newEndTime: State<String> = _newEndTime

    fun onLabelChange(value: String) { _newLabel.value = value }
    fun onDayChange(value: Int) { _newDay.value = value }
    fun onRecurringChange(value: Boolean) { _isRecurring.value = value }
    fun onStartTimeChange(value: String) { _newStartTime.value = value }
    fun onEndTimeChange(value: String) { _newEndTime.value = value }

    // Guarda el nuevo bloque en el repositorio (recurrente o puntual)
    fun saveBlock(onSuccess: () -> Unit) {
        viewModelScope.launch {
            _isLoading.value = true
            val block = TimeBlock(
                id = System.currentTimeMillis().toString(),
                userId = "user_1",
                dayOfWeek = if (_isRecurring.value) _newDay.value else null,
                startTime = _newStartTime.value,
                endTime = _newEndTime.value,
                label = _newLabel.value,
                isRecurring = _isRecurring.value
            )
            repository.addTimeBlock(block)
            _isLoading.value = false
            onSuccess()
        }
    }

    // Elimina un bloque por su ID
    fun deleteBlock(blockId: String) {
        viewModelScope.launch {
            _isLoading.value = true
            repository.deleteTimeBlock(blockId)
            _isLoading.value = false
        }
    }
}
