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

    // Elimina un bloque por su ID
    fun deleteBlock(blockId: String) {
        viewModelScope.launch {
            _isLoading.value = true
            repository.deleteTimeBlock(blockId)
            _isLoading.value = false
        }
    }
}
