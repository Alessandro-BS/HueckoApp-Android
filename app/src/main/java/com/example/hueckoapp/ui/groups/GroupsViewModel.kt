package com.example.hueckoapp.ui.groups

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.hueckoapp.data.HueckoRepository
import com.example.hueckoapp.domain.model.DayOfWeek
import com.example.hueckoapp.domain.model.Group
import com.example.hueckoapp.domain.model.MatchWindow
import com.example.hueckoapp.domain.model.PlanProposal
import com.example.hueckoapp.domain.model.ProposalState
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import java.util.Calendar

/** Estado local de la pantalla: que grupo esta abierto y que dia se mira. */
data class GroupsUiState(
    val grupos: List<Group> = emptyList(),
    val propuestas: List<PlanProposal> = emptyList(),
    val grupoAbiertoId: String? = null,
    val diaSeleccionado: DayOfWeek = DayOfWeek.LUN,
    val codigoCopiado: String? = null,
    val dialogo: GroupsDialog = GroupsDialog.NINGUNO,
    val codigoIntroducido: String = "",
    val errorUnion: String? = null,
    val nuevoNombre: String = "",
    val nuevaDescripcion: String = "",
    val nuevoUmbral: Int = 80,
    val toast: String? = null,
)

enum class GroupsDialog { NINGUNO, CREAR, UNIRSE }

class GroupsViewModel : ViewModel() {

    private val grupoAbiertoId = MutableStateFlow<String?>(null)
    private val diaSeleccionado = MutableStateFlow(
        DayOfWeek.fromCalendarField(Calendar.getInstance().get(Calendar.DAY_OF_WEEK)),
    )
    private val local = MutableStateFlow(LocalForm())

    private data class LocalForm(
        val codigoCopiado: String? = null,
        val dialogo: GroupsDialog = GroupsDialog.NINGUNO,
        val codigoIntroducido: String = "",
        val errorUnion: String? = null,
        val nuevoNombre: String = "",
        val nuevaDescripcion: String = "",
        val nuevoUmbral: Int = 80,
        val toast: String? = null,
    )

    val uiState: StateFlow<GroupsUiState> = combine(
        HueckoRepository.groups,
        HueckoRepository.proposals,
        grupoAbiertoId,
        diaSeleccionado,
        local,
    ) { grupos, propuestas, abierto, dia, form ->
        GroupsUiState(
            grupos = grupos,
            propuestas = propuestas,
            grupoAbiertoId = abierto,
            diaSeleccionado = dia,
            codigoCopiado = form.codigoCopiado,
            dialogo = form.dialogo,
            codigoIntroducido = form.codigoIntroducido,
            errorUnion = form.errorUnion,
            nuevoNombre = form.nuevoNombre,
            nuevaDescripcion = form.nuevaDescripcion,
            nuevoUmbral = form.nuevoUmbral,
            toast = form.toast,
        )
    }.stateIn(
        scope = viewModelScope,
        started = SharingStarted.WhileSubscribed(5_000),
        initialValue = GroupsUiState(),
    )

    /** Abrir un grupo cierra el anterior: dos paneles abiertos a la vez en un
     *  telefono obligan a desplazarse a ciegas para volver al que interesaba. */
    fun toggleGroup(groupId: String) {
        grupoAbiertoId.value = if (grupoAbiertoId.value == groupId) null else groupId
    }

    fun selectDay(day: DayOfWeek) {
        diaSeleccionado.value = day
    }

    fun vote(proposalId: String, windowId: String) {
        HueckoRepository.voteWindow(proposalId, windowId, currentEmail())
        showToast("Tu voto ha sido registrado.")
    }

    /** Franjas del grupo que cumplen su umbral en el dia elegido (HU-05, HU-06). */
    fun windowsFor(group: Group, day: DayOfWeek): List<MatchWindow> =
        HueckoRepository.recommendedWindows(group, day)

    fun proposalsOf(groupId: String): List<PlanProposal> =
        uiState.value.propuestas.filter { it.groupId == groupId && it.estado != ProposalState.CANCELADO }

    // --------------------------------------------------------------- codigos

    fun onCodeCopied(codigo: String) {
        local.value = local.value.copy(codigoCopiado = codigo)
        viewModelScope.launch {
            delay(2_000)
            if (local.value.codigoCopiado == codigo) {
                local.value = local.value.copy(codigoCopiado = null)
            }
        }
    }

    // --------------------------------------------------------------- dialogos

    fun openCreateDialog() {
        local.value = local.value.copy(
            dialogo = GroupsDialog.CREAR,
            nuevoNombre = "",
            nuevaDescripcion = "",
            nuevoUmbral = 80,
        )
    }

    fun openJoinDialog() {
        local.value = local.value.copy(
            dialogo = GroupsDialog.UNIRSE,
            codigoIntroducido = "",
            errorUnion = null,
        )
    }

    fun dismissDialog() {
        local.value = local.value.copy(dialogo = GroupsDialog.NINGUNO, errorUnion = null)
    }

    fun onNewNameChange(value: String) {
        local.value = local.value.copy(nuevoNombre = value)
    }

    fun onNewDescriptionChange(value: String) {
        local.value = local.value.copy(nuevaDescripcion = value)
    }

    fun onThresholdChange(value: Int) {
        local.value = local.value.copy(nuevoUmbral = value)
    }

    fun onJoinCodeChange(value: String) {
        local.value = local.value.copy(codigoIntroducido = value, errorUnion = null)
    }

    fun createGroup() {
        val nombre = local.value.nuevoNombre.trim()
        if (nombre.isEmpty()) return

        val grupo = HueckoRepository.createGroup(
            nombre = nombre,
            descripcion = local.value.nuevaDescripcion.trim(),
            umbral = local.value.nuevoUmbral,
            user = currentUser(),
        )
        local.value = local.value.copy(dialogo = GroupsDialog.NINGUNO)
        grupoAbiertoId.value = grupo.id
        showToast("Grupo creado. Comparte el codigo ${grupo.codigoInvitacion}.")
    }

    fun joinGroup() {
        val codigo = local.value.codigoIntroducido.trim()
        if (codigo.isEmpty()) {
            local.value = local.value.copy(errorUnion = "Introduce el codigo del grupo.")
            return
        }

        val grupo = HueckoRepository.joinGroupByCode(codigo, currentUser())
        if (grupo == null) {
            local.value = local.value.copy(errorUnion = "No existe ningun grupo con ese codigo.")
            return
        }

        local.value = local.value.copy(dialogo = GroupsDialog.NINGUNO, errorUnion = null)
        grupoAbiertoId.value = grupo.id
        showToast("Te has unido a ${grupo.nombre}.")
    }

    // ----------------------------------------------------------------- avisos

    private fun showToast(mensaje: String) {
        local.value = local.value.copy(toast = mensaje)
        viewModelScope.launch {
            delay(3_000)
            if (local.value.toast == mensaje) local.value = local.value.copy(toast = null)
        }
    }

    private fun currentUser() = HueckoRepository.currentUser.value ?: HueckoRepository.demoUser

    fun currentEmail(): String = currentUser().email
}
