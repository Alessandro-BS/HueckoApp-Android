package com.example.hueckoapp.ui.group

import androidx.compose.runtime.State
import androidx.compose.runtime.mutableStateOf
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.hueckoapp.domain.model.Group
import com.example.hueckoapp.domain.repository.GroupRepository
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

class GroupViewModel(private val repository: GroupRepository) : ViewModel() {

    // Lista reactiva de los grupos a los que pertenece el usuario
    val groups: StateFlow<List<Group>> = repository.getGroups()
        .stateIn(
            scope = viewModelScope,
            started = SharingStarted.WhileSubscribed(5000),
            initialValue = emptyList()
        )

    private val _isLoading = mutableStateOf(false)
    val isLoading: State<Boolean> = _isLoading

    private val _errorMessage = mutableStateOf<String?>(null)
    val errorMessage: State<String?> = _errorMessage
    
    fun clearError() { _errorMessage.value = null }

    // Función para crear un nuevo grupo
    fun createGroup(name: String, onSuccess: () -> Unit) {
        if (name.isBlank()) return
        
        viewModelScope.launch {
            _isLoading.value = true
            _errorMessage.value = null
            
            repository.createGroup(name)
                .onSuccess { onSuccess() }
                .onFailure { _errorMessage.value = it.message }
                
            _isLoading.value = false
        }
    }

    // Función para unirse a un grupo con código
    fun joinGroup(inviteCode: String, onSuccess: () -> Unit) {
        if (inviteCode.isBlank()) return
        
        viewModelScope.launch {
            _isLoading.value = true
            _errorMessage.value = null
            
            repository.joinGroup(inviteCode)
                .onSuccess { onSuccess() }
                .onFailure { _errorMessage.value = it.message }
                
            _isLoading.value = false
        }
    }
}
