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

data class VotingCall(
    val id: String,
    val planId: String,
    val planTitle: String,
    val createdBy: String,
    val createdAt: String,
)

data class GroupPlanningState(
    val proposals: List<PlanProposal> = emptyList(),
    /** Bloques de todos los miembros, ya normalizados a su `userId` real. */
    val blocks: List<TimeBlock> = emptyList(),
    val userEmail: String = "",
    val toast: String? = null,
    val votingCalls: List<VotingCall> = emptyList(),
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
    private val _votingCalls = MutableStateFlow<List<VotingCall>>(emptyList())
    private val _localProposals = MutableStateFlow<List<PlanProposal>>(emptyList())

    val state: StateFlow<GroupPlanningState> = combine(
        authRepository.getCurrentUser(),
        scheduleRepository.getTimeBlocks(),
        planRepository.getGroupOccupancy(),
        planRepository.getProposals(),
        toast,
    ) { results ->
        val user = results[0] as? com.example.hueckoapp.domain.model.User
        @Suppress("UNCHECKED_CAST")
        val ownBlocks = results[1] as List<TimeBlock>
        val occupancy = results[2] as List<TimeBlock>
        val proposals = results[3] as List<PlanProposal>
        val message = results[4] as? String

        val mine = user?.let { u -> ownBlocks.map { it.copy(userId = u.id) } }.orEmpty()

        GroupPlanningState(
            proposals = proposals + _localProposals.value,
            blocks = mine + occupancy,
            userEmail = user?.email.orEmpty(),
            toast = message,
            votingCalls = _votingCalls.value,
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

    /** Crear una propuesta de plan (placeholder). */
    fun createProposal(groupId: String, title: String, location: String?, deadline: String) {
        if (title.isBlank()) {
            showToast("El titulo no puede estar vacio.")
            return
        }
        val proposal = PlanProposal(
            id = "local_${groupId}_${System.currentTimeMillis()}",
            groupId = groupId,
            title = title.trim(),
            location = location?.trim()?.ifBlank { null },
            createdBy = state.value.userEmail,
            votingDeadline = deadline.trim(),
            state = ProposalState.PROPUESTO,
        )
        _localProposals.value = _localProposals.value + proposal
        showToast("Propuesta creada.")
    }

    /** Llamadas a la votacion de un grupo. */
    fun votingCallsOf(groupId: String): List<VotingCall> =
        state.value.votingCalls.filter { it.id.startsWith(groupId) }

    /** Crear una llamada a la votacion para un plan (placeholder). */
    fun createVotingCall(groupId: String, proposal: PlanProposal) {
        val alreadyExists = _votingCalls.value.any { it.planId == proposal.id }
        if (alreadyExists) {
            showToast("Ya hay un llamado activo para este plan.")
            return
        }
        val call = VotingCall(
            id = "${groupId}_${proposal.id}_${System.currentTimeMillis()}",
            planId = proposal.id,
            planTitle = proposal.title,
            createdBy = state.value.userEmail,
            createdAt = java.text.SimpleDateFormat("dd/MM/yyyy", java.util.Locale.getDefault())
                .format(java.util.Date()),
        )
        _votingCalls.value = _votingCalls.value + call
        showToast("Llamado a la votación creado.")
    }

    private fun showToast(message: String) {
        toast.value = message
        viewModelScope.launch {
            delay(3_000)
            if (toast.value == message) toast.value = null
        }
    }
}
