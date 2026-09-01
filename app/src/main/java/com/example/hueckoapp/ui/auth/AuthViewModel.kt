package com.example.hueckoapp.ui.auth

import androidx.compose.runtime.State
import androidx.compose.runtime.mutableStateOf
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.hueckoapp.domain.repository.AuthRepository
import kotlinx.coroutines.launch

class AuthViewModel(private val repository: AuthRepository) : ViewModel() {

    private val _email = mutableStateOf("")
    val email: State<String> = _email

    private val _name = mutableStateOf("")
    val name: State<String> = _name

    private val _password = mutableStateOf("")
    val password: State<String> = _password

    private val _isLoading = mutableStateOf(false)
    val isLoading: State<Boolean> = _isLoading

    private val _errorMessage = mutableStateOf<String?>(null)
    val errorMessage: State<String?> = _errorMessage

    private val _isLoggedIn = mutableStateOf(false)
    val isLoggedIn: State<Boolean> = _isLoggedIn

    fun onEmailChange(newValue: String) { _email.value = newValue }

    fun onNameChange(newValue: String) { _name.value = newValue }

    fun onPasswordChange(newValue: String) { _password.value = newValue }

    // Registra un nuevo usuario
    fun register() {
        viewModelScope.launch {
            _isLoading.value = true
            _errorMessage.value = null
            repository.register(_name.value, _email.value, _password.value)
                .onSuccess { _isLoggedIn.value = true }
                .onFailure { _errorMessage.value = it.message }
            _isLoading.value = false
        }
    }

    // Procesa el inicio de sesión del usuario
    fun login() {
        viewModelScope.launch {
            _isLoading.value = true
            _errorMessage.value = null
            
            repository.login(_email.value, _password.value)
                .onSuccess { _isLoggedIn.value = true }
                .onFailure { _errorMessage.value = it.message }
            
            _isLoading.value = false
        }
    }
}
