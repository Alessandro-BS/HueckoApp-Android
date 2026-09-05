package com.example.hueckoapp.ui.auth

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.hueckoapp.data.HueckoRepository
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/**
 * Estado del formulario de inicio de sesion.
 *
 * Los errores por campo se guardan aparte del error de servidor porque tienen
 * origen y ciclo de vida distintos: los primeros aparecen al validar y se
 * borran al escribir; el segundo solo se limpia al reintentar el envio.
 */
data class LoginUiState(
    val email: String = "",
    val password: String = "",
    val showPassword: Boolean = false,
    val emailError: String? = null,
    val passwordError: String? = null,
    val serverError: String? = null,
    val isSubmitting: Boolean = false,
    val isLoggedIn: Boolean = false,
)

class LoginViewModel : ViewModel() {

    private val _uiState = MutableStateFlow(LoginUiState())
    val uiState: StateFlow<LoginUiState> = _uiState.asStateFlow()

    fun onEmailChange(value: String) {
        _uiState.update { it.copy(email = value, emailError = null, serverError = null) }
    }

    fun onPasswordChange(value: String) {
        _uiState.update { it.copy(password = value, passwordError = null, serverError = null) }
    }

    fun togglePasswordVisibility() {
        _uiState.update { it.copy(showPassword = !it.showPassword) }
    }

    /** Rellena las credenciales de demostracion, como el boton "Autocompletar". */
    fun fillDemoCredentials() {
        _uiState.update {
            it.copy(
                email = HueckoRepository.DEMO_EMAIL,
                password = HueckoRepository.DEMO_PASSWORD,
                emailError = null,
                passwordError = null,
                serverError = null,
            )
        }
    }

    /**
     * Valida y entra. Las reglas son las mismas del esquema Zod de la web:
     * correo con formato valido y contrasena de al menos 6 caracteres.
     */
    fun submit() {
        val state = _uiState.value
        if (state.isSubmitting) return

        val emailError = when {
            state.email.isBlank() -> "El correo es requerido"
            !EMAIL_REGEX.matches(state.email.trim()) -> "Ingresa un correo valido"
            else -> null
        }
        val passwordError = when {
            state.password.isBlank() -> "La contrasena es requerida"
            state.password.length < 6 -> "Minimo 6 caracteres"
            else -> null
        }

        if (emailError != null || passwordError != null) {
            _uiState.update { it.copy(emailError = emailError, passwordError = passwordError) }
            return
        }

        viewModelScope.launch {
            _uiState.update { it.copy(isSubmitting = true, serverError = null) }
            // Latencia simulada: sin ella el boton de carga nunca llega a verse
            // y no se puede comprobar que el estado deshabilitado funciona.
            delay(SIMULATED_NETWORK_DELAY_MS)

            val credencialesValidas = state.email.trim().equals(HueckoRepository.DEMO_EMAIL, ignoreCase = true) &&
                state.password == HueckoRepository.DEMO_PASSWORD

            if (credencialesValidas) {
                HueckoRepository.signIn(HueckoRepository.demoUser)
                _uiState.update { it.copy(isSubmitting = false, isLoggedIn = true) }
            } else {
                _uiState.update {
                    it.copy(
                        isSubmitting = false,
                        serverError = "Credenciales incorrectas. Intenta de nuevo.",
                    )
                }
            }
        }
    }

    private companion object {
        const val SIMULATED_NETWORK_DELAY_MS = 900L
        val EMAIL_REGEX = Regex("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$")
    }
}
