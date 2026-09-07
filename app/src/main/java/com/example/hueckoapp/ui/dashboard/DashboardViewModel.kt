package com.example.hueckoapp.ui.dashboard

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.hueckoapp.domain.model.AttendeeStatus
import com.example.hueckoapp.domain.model.DayOfWeek
import com.example.hueckoapp.domain.model.EventAttendee
import com.example.hueckoapp.domain.model.Group
import com.example.hueckoapp.domain.model.IncidenceType
import com.example.hueckoapp.domain.model.PlanProposal
import com.example.hueckoapp.domain.model.ProposalState
import com.example.hueckoapp.domain.model.TimeBlock
import com.example.hueckoapp.domain.model.UpcomingEvent
import com.example.hueckoapp.domain.model.User
import com.example.hueckoapp.domain.repository.AuthRepository
import com.example.hueckoapp.domain.repository.GroupRepository
import com.example.hueckoapp.domain.repository.PlanRepository
import com.example.hueckoapp.domain.repository.ScheduleRepository
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import java.util.Calendar

/** Resumen de un grupo tal y como lo lista el inicio. */
data class GroupSummary(
    val id: String,
    val name: String,
    val memberCount: Int,
    val matchPercentage: Int,
    val nextSlot: String,
)

/** Votacion abierta que el usuario todavia puede resolver desde el inicio. */
data class PendingVote(
    val proposal: PlanProposal,
    val groupName: String,
)

/** Aviso de baja critica que abre una votacion expres (HU-14). */
data class ExpressVoteAlert(
    val proposalId: String,
    val who: String,
    val reason: String,
    val planTitle: String,
)

enum class ExpressVoteChoice(val label: String, val resultingState: ProposalState) {
    REPROGRAMAR("Reprogramar", ProposalState.PROPUESTO),
    CANCELAR("Cancelar", ProposalState.CANCELADO),
    MANTENER("Mantener", ProposalState.CONFIRMADO),
}

data class DashboardUiState(
    val greeting: String = "",
    val name: String = "",
    val longDate: String = "",
    val today: DayOfWeek = DayOfWeek.LUN,
    val todayBlocks: List<TimeBlock> = emptyList(),
    val activeGroups: Int = 0,
    val openVotes: Int = 0,
    val matchingHours: Int = 0,
    val totalBlocks: Int = 0,
    val upcomingEvent: UpcomingEvent? = null,
    val groups: List<GroupSummary> = emptyList(),
    val pendingVotes: List<PendingVote> = emptyList(),
    val expressAlert: ExpressVoteAlert? = null,
    val expressChoice: ExpressVoteChoice? = null,
    val userEmail: String = "",
    val toast: String? = null,
)

/**
 * Compone el inicio a partir de los cuatro repositorios. No guarda datos
 * propios: todo lo que se ve aqui es una vista derivada de lo que ya sirven
 * auth, grupos, horario y planes, de modo que votar en la pantalla de grupos
 * se refleja aqui sin sincronizar nada a mano.
 */
class DashboardViewModel(
    authRepository: AuthRepository,
    groupRepository: GroupRepository,
    scheduleRepository: ScheduleRepository,
    private val planRepository: PlanRepository,
) : ViewModel() {

    private val expressChoice = MutableStateFlow<ExpressVoteChoice?>(null)
    private val toast = MutableStateFlow<String?>(null)

    val uiState: StateFlow<DashboardUiState> = combine(
        authRepository.getCurrentUser(),
        groupRepository.getGroups(),
        scheduleRepository.getTimeBlocks(),
        planRepository.getProposals(),
        combine(expressChoice, toast) { choice, message -> choice to message },
    ) { user, groups, blocks, proposals, (choice, message) ->
        val today = DayOfWeek.fromCalendarField(Calendar.getInstance().get(Calendar.DAY_OF_WEEK))
        val email = user?.email.orEmpty()

        val votes = proposals
            .filter { it.state == ProposalState.PROPUESTO }
            .map { proposal ->
                PendingVote(
                    proposal = proposal,
                    groupName = groups.firstOrNull { it.id == proposal.groupId }?.name ?: "Grupo",
                )
            }

        DashboardUiState(
            greeting = greetingForHour(),
            name = user?.name?.substringBefore(' ').orEmpty(),
            longDate = longDate(),
            today = today,
            todayBlocks = blocks.filter { it.dayOfWeek == today.iso },
            activeGroups = groups.size,
            openVotes = votes.size,
            matchingHours = matchingHours(proposals),
            totalBlocks = blocks.size,
            upcomingEvent = upcomingEvent(groups, proposals, email),
            groups = groups.map { summaryOf(it, proposals) },
            pendingVotes = votes,
            expressAlert = openAlert(proposals),
            expressChoice = choice,
            userEmail = email,
            toast = message,
        )
    }.stateIn(
        scope = viewModelScope,
        started = SharingStarted.WhileSubscribed(5_000),
        initialValue = DashboardUiState(),
    )

    fun vote(proposalId: String, windowId: String) {
        val email = uiState.value.userEmail
        if (email.isEmpty()) return
        viewModelScope.launch {
            planRepository.voteWindow(proposalId, windowId, email)
            showToast("Tu voto ha sido registrado.")
        }
    }

    /**
     * Registra la preferencia y cierra el aviso tras un momento, para que la
     * eleccion se vea confirmada antes de que la tarjeta desaparezca.
     */
    fun submitExpressVote(choice: ExpressVoteChoice) {
        val proposalId = uiState.value.expressAlert?.proposalId ?: return
        expressChoice.value = choice
        viewModelScope.launch {
            showToast("Votación exprés registrada: ${choice.label.lowercase()}.")
            delay(1_500)
            planRepository.resolveIncidences(proposalId, choice.resultingState.name)
            expressChoice.value = null
        }
    }

    private fun showToast(message: String) {
        toast.value = message
        viewModelScope.launch {
            delay(3_000)
            if (toast.value == message) toast.value = null
        }
    }

    // ------------------------------------------------------------- derivados

    private fun summaryOf(group: Group, proposals: List<PlanProposal>): GroupSummary {
        val next = proposals
            .filter { it.groupId == group.id && it.state != ProposalState.CANCELADO }
            .flatMap { it.suggestedWindows }
            .firstOrNull()

        return GroupSummary(
            id = group.id,
            name = group.name,
            memberCount = group.members.size,
            matchPercentage = next?.availabilityPercentage ?: group.availabilityThreshold,
            nextSlot = next?.let { "${it.day.label} ${it.timeRange}" } ?: "Sin propuesta aún",
        )
    }

    /**
     * Horas de la semana con coincidencia alta. Se cuentan sobre las ventanas
     * ya propuestas, que es lo que el usuario puede aprovechar hoy; el cruce
     * completo de agendas vive en la pantalla de grupos.
     */
    private fun matchingHours(proposals: List<PlanProposal>): Int = proposals
        .flatMap { it.suggestedWindows }
        .filter { it.availabilityPercentage >= HIGH_MATCH_THRESHOLD }
        .sumOf { window ->
            val start = window.startTime.substringBefore(':').toIntOrNull() ?: 0
            val end = window.endTime.substringBefore(':').toIntOrNull() ?: 0
            (end - start).coerceAtLeast(0)
        }

    private fun upcomingEvent(
        groups: List<Group>,
        proposals: List<PlanProposal>,
        userEmail: String,
    ): UpcomingEvent? {
        val proposal = proposals.firstOrNull { it.state == ProposalState.CONFIRMADO } ?: return null
        val group = groups.firstOrNull { it.id == proposal.groupId } ?: return null
        val window = proposal.suggestedWindows.firstOrNull() ?: return null

        return UpcomingEvent(
            id = proposal.id,
            groupId = group.id,
            groupName = group.name,
            title = proposal.title,
            dayLabel = window.day.label,
            timeRange = window.timeRange,
            location = proposal.location ?: "Lugar por definir",
            state = proposal.state,
            attendees = group.members.map { member -> attendeeOf(member, proposal, userEmail) },
        )
    }

    private fun attendeeOf(
        member: User,
        proposal: PlanProposal,
        userEmail: String,
    ): EventAttendee {
        val incidence = proposal.incidences.firstOrNull { it.userEmail == member.email && !it.resolved }
        return EventAttendee(
            email = member.email,
            name = if (member.email == userEmail) "Tú" else member.name,
            status = when (incidence?.type) {
                IncidenceType.TARDANZA -> AttendeeStatus.RETRASADO
                IncidenceType.FALTA, IncidenceType.IMPREVISTO -> AttendeeStatus.NO_ASISTE
                null -> AttendeeStatus.PUNTUAL
            },
            delayMinutes = incidence?.delayMinutes,
            isEssential = member.isEssential,
        )
    }

    /**
     * Solo un imprevisto sin resolver sobre un plan ya confirmado abre la
     * votacion expres. Si la disparara cualquier aviso, el grupo votaria a
     * diario y la alerta dejaria de significar nada.
     */
    private fun openAlert(proposals: List<PlanProposal>): ExpressVoteAlert? {
        val proposal = proposals.firstOrNull { plan ->
            plan.state == ProposalState.CONFIRMADO && plan.incidences.any { !it.resolved }
        } ?: return null
        val incidence = proposal.incidences.first { !it.resolved }

        return ExpressVoteAlert(
            proposalId = proposal.id,
            who = incidence.userName,
            reason = incidence.reason,
            planTitle = proposal.title,
        )
    }

    private fun greetingForHour(): String =
        when (Calendar.getInstance().get(Calendar.HOUR_OF_DAY)) {
            in 0..11 -> "Buenos días"
            in 12..18 -> "Buenas tardes"
            else -> "Buenas noches"
        }

    /**
     * Se formatea a mano en vez de con `java.time` porque el resultado debe
     * salir en castellano sea cual sea el idioma del telefono.
     */
    private fun longDate(): String {
        val cal = Calendar.getInstance()
        val day = LONG_DAYS[cal.get(Calendar.DAY_OF_WEEK) - 1]
        val month = MONTHS[cal.get(Calendar.MONTH)]
        return "$day, ${cal.get(Calendar.DAY_OF_MONTH)} de $month"
    }

    private companion object {
        const val HIGH_MATCH_THRESHOLD = 80

        val LONG_DAYS = listOf(
            "Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado",
        )
        val MONTHS = listOf(
            "enero", "febrero", "marzo", "abril", "mayo", "junio",
            "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
        )
    }
}
