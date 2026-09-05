package com.example.hueckoapp.ui.group

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.hueckoapp.domain.model.DayOfWeek
import com.example.hueckoapp.domain.model.Group
import com.example.hueckoapp.domain.model.MatchWindow
import com.example.hueckoapp.domain.model.PlanProposal
import com.example.hueckoapp.domain.model.ProposalState
import com.example.hueckoapp.domain.model.TimeBlock
import com.example.hueckoapp.domain.repository.AuthRepository
import com.example.hueckoapp.domain.repository.PlanRepository
import com.example.hueckoapp.domain.repository.ScheduleRepository
import com.example.hueckoapp.domain.usecase.AvailabilityMatcher
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

data class GroupPlanningState(
    val proposals: List<PlanProposal> = emptyList(),
    /** Bloques de todos los miembros, ya normalizados a su `userId` real. */
    val blocks: List<TimeBlock> = emptyList(),
    val userEmail: String = "",
    val toast: String? = null,
)

/**
 * Lo que la pantalla de grupos necesita ademas de la lista de grupos:
 * propuestas en votacion y cruce de agendas.
 *
 * Va aparte de [GroupViewModel] a proposito. Aquel gestiona la pertenencia a
 * grupos (crear, unirse) y este la planificacion dentro de uno; mezclarlos
 * ataria el alta de un grupo al ciclo de vida de una votacion.
 */
class GroupPlanningViewModel(
    private val authRepository: AuthRepository,
    scheduleRepository: ScheduleRepository,
    private val planRepository: PlanRepository,
) : ViewModel() {

    private val toast = MutableStateFlow<String?>(null)

    val state: StateFlow<GroupPlanningState> = combine(
        authRepository.getCurrentUser(),
        scheduleRepository.getTimeBlocks(),
        planRepository.getGroupOccupancy(),
        planRepository.getProposals(),
        toast,
    ) { user, ownBlocks, occupancy, proposals, message ->
        // El horario propio se guarda sin saber quien lo mira: el repositorio
        // sirve "los bloques del usuario actual" y su `userId` es el de la
        // semilla. Para cruzarlo con el resto hay que reetiquetarlo con el id
        // real, o el usuario no cuenta como ocupado en su propio grupo.
        val mine = user?.let { u -> ownBlocks.map { it.copy(userId = u.id) } }.orEmpty()

        GroupPlanningState(
            proposals = proposals,
            blocks = mine + occupancy,
            userEmail = user?.email.orEmpty(),
            toast = message,
        )
    }.stateIn(
        scope = viewModelScope,
        started = SharingStarted.WhileSubscribed(5_000),
        initialValue = GroupPlanningState(),
    )

    /** Propuestas vivas de un grupo. Una cancelada ya no admite votos. */
    fun proposalsOf(groupId: String): List<PlanProposal> = state.value.proposals
        .filter { it.groupId == groupId && it.state != ProposalState.CANCELADO }

    /** Franjas del grupo que alcanzan su umbral en el dia elegido (HU-05). */
    fun windowsFor(group: Group, day: DayOfWeek): List<MatchWindow> =
        AvailabilityMatcher.windowsFor(group, state.value.blocks, day)

    fun vote(proposalId: String, windowId: String) {
        val email = state.value.userEmail
        if (email.isEmpty()) return
        viewModelScope.launch {
            planRepository.voteWindow(proposalId, windowId, email)
            showToast("Tu voto ha sido registrado.")
        }
    }

    fun notifyCodeCopied(code: String) = showToast("Código $code copiado.")

    private fun showToast(message: String) {
        toast.value = message
        viewModelScope.launch {
            delay(3_000)
            if (toast.value == message) toast.value = null
        }
    }
}
