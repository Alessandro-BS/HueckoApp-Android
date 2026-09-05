package com.example.hueckoapp.ui.dashboard

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.hueckoapp.data.HueckoRepository
import com.example.hueckoapp.domain.model.DayOfWeek
import com.example.hueckoapp.domain.model.Group
import com.example.hueckoapp.domain.model.PlanProposal
import com.example.hueckoapp.domain.model.ProposalState
import com.example.hueckoapp.domain.model.TimeBlock
import com.example.hueckoapp.domain.model.UpcomingEvent
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import java.util.Calendar

/** Resumen de un grupo tal y como lo lista el inicio. */
data class GroupSummary(
    val id: String,
    val nombre: String,
    val miembros: Int,
    val coincidenciaPorcentaje: Int,
    val proximaFranja: String,
    val colorArgb: Long,
)

/** Votacion abierta que el usuario todavia puede resolver desde el inicio. */
data class PendingVote(
    val proposal: PlanProposal,
    val groupName: String,
)

data class DashboardUiState(
    val saludo: String = "",
    val nombre: String = "",
    val fechaLarga: String = "",
    val hoy: DayOfWeek = DayOfWeek.LUN,
    val bloquesDeHoy: List<TimeBlock> = emptyList(),
    val gruposActivos: Int = 0,
    val votacionesActivas: Int = 0,
    val horasCoincidentes: Int = 0,
    val bloquesTotales: Int = 0,
    val proximoPlan: UpcomingEvent? = null,
    val grupos: List<GroupSummary> = emptyList(),
    val votaciones: List<PendingVote> = emptyList(),
    /** Aviso de baja critica que dispara la votacion expres (HU-14). */
    val alertaVotacionExpres: ExpressVoteAlert? = null,
    val votoExpresElegido: ExpressVoteChoice? = null,
    val toast: String? = null,
)

data class ExpressVoteAlert(
    val quien: String,
    val motivo: String,
    val planTitulo: String,
    val tiempoRestante: String,
)

enum class ExpressVoteChoice(val etiqueta: String) {
    REPROGRAMAR("Reprogramar"),
    CANCELAR("Cancelar"),
    MANTENER("Mantener"),
}

class DashboardViewModel : ViewModel() {

    private val alertaDescartada = MutableStateFlow(false)
    private val votoExpres = MutableStateFlow<ExpressVoteChoice?>(null)
    private val toast = MutableStateFlow<String?>(null)

    val uiState: StateFlow<DashboardUiState> = combine(
        HueckoRepository.groups,
        HueckoRepository.proposals,
        HueckoRepository.mySchedule,
        HueckoRepository.currentUser,
        combine(alertaDescartada, votoExpres, toast) { descartada, voto, aviso ->
            Triple(descartada, voto, aviso)
        },
    ) { grupos, propuestas, horario, usuario, (descartada, voto, aviso) ->
        val email = usuario?.email ?: HueckoRepository.DEMO_EMAIL
        val hoy = DayOfWeek.fromCalendarField(Calendar.getInstance().get(Calendar.DAY_OF_WEEK))

        val votaciones = propuestas
            .filter { it.estado == ProposalState.PROPUESTO }
            .map { propuesta ->
                PendingVote(
                    proposal = propuesta,
                    groupName = grupos.firstOrNull { it.id == propuesta.groupId }?.nombre ?: "Grupo",
                )
            }

        DashboardUiState(
            saludo = saludoSegunHora(),
            nombre = usuario?.nombre?.substringBefore(' ') ?: "Alex",
            fechaLarga = fechaLarga(),
            hoy = hoy,
            bloquesDeHoy = horario.filter { it.day == hoy },
            gruposActivos = grupos.size,
            votacionesActivas = votaciones.size,
            horasCoincidentes = horasCoincidentes(propuestas),
            bloquesTotales = horario.size,
            proximoPlan = HueckoRepository.upcomingEvent(email),
            grupos = grupos.map { resumen(it, propuestas) },
            votaciones = votaciones,
            alertaVotacionExpres = if (descartada) null else alertaAbierta(propuestas),
            votoExpresElegido = voto,
            toast = aviso,
        )
    }.stateIn(
        scope = viewModelScope,
        started = SharingStarted.WhileSubscribed(5_000),
        initialValue = DashboardUiState(),
    )

    private val _userEmail = MutableStateFlow(HueckoRepository.DEMO_EMAIL)
    val userEmail: StateFlow<String> = _userEmail.asStateFlow()

    fun vote(proposalId: String, windowId: String) {
        HueckoRepository.voteWindow(proposalId, windowId, currentEmail())
        showToast("Tu voto ha sido registrado correctamente.")
    }

    /**
     * Registra la preferencia en la votacion expres y cierra el aviso poco
     * despues, para que la respuesta del grupo se vea confirmada antes de que
     * la tarjeta desaparezca.
     */
    fun submitExpressVote(choice: ExpressVoteChoice) {
        votoExpres.value = choice
        showToast("Votacion expres registrada: ${choice.etiqueta.uppercase()}. Notificando al grupo...")
        viewModelScope.launch {
            delay(2_500)
            alertaDescartada.value = true
        }
    }

    fun dismissToast() {
        toast.value = null
    }

    private fun showToast(mensaje: String) {
        toast.value = mensaje
        viewModelScope.launch {
            delay(3_500)
            if (toast.value == mensaje) toast.value = null
        }
    }

    private fun currentEmail(): String =
        HueckoRepository.currentUser.value?.email ?: HueckoRepository.DEMO_EMAIL

    // ------------------------------------------------------------- derivados

    private fun resumen(group: Group, propuestas: List<PlanProposal>): GroupSummary {
        val siguiente = propuestas
            .filter { it.groupId == group.id && it.estado != ProposalState.CANCELADO }
            .flatMap { it.ventanasSugeridas }
            .firstOrNull()

        return GroupSummary(
            id = group.id,
            nombre = group.nombre,
            miembros = group.miembros.size,
            coincidenciaPorcentaje = siguiente?.disponibilidadPorcentaje ?: group.umbralDisponibilidad,
            proximaFranja = siguiente
                ?.let { "${it.dia.label} ${it.rangoHorario}" }
                ?: "Sin propuesta aun",
            colorArgb = group.miembros.firstOrNull()?.colorArgb ?: 0xFF3F5D45,
        )
    }

    /**
     * Horas de la semana en las que coincide al menos el 80% del grupo. Se
     * cuentan sobre las ventanas ya propuestas, que es lo que el usuario puede
     * aprovechar hoy; el cruce completo de agendas vive en la pantalla de
     * grupos.
     */
    private fun horasCoincidentes(propuestas: List<PlanProposal>): Int = propuestas
        .flatMap { it.ventanasSugeridas }
        .filter { it.disponibilidadPorcentaje >= 80 }
        .sumOf { ventana ->
            val inicio = ventana.horaInicio.substringBefore(':').toIntOrNull() ?: 0
            val fin = ventana.horaFin.substringBefore(':').toIntOrNull() ?: 0
            (fin - inicio).coerceAtLeast(0)
        }

    /**
     * Solo la ausencia de alguien imprescindible abre una votacion expres: si
     * cualquier baja la disparara, el grupo votaria a diario y el aviso
     * perderia todo su valor.
     */
    private fun alertaAbierta(propuestas: List<PlanProposal>): ExpressVoteAlert? {
        val propuesta = propuestas.firstOrNull { plan ->
            plan.estado == ProposalState.CONFIRMADO && plan.incidencias.any { !it.resuelta }
        } ?: return null
        val incidencia = propuesta.incidencias.firstOrNull { !it.resuelta } ?: return null

        return ExpressVoteAlert(
            quien = incidencia.userName,
            motivo = incidencia.motivo,
            planTitulo = propuesta.titulo,
            tiempoRestante = "14:20 min",
        )
    }

    private fun saludoSegunHora(): String = when (Calendar.getInstance().get(Calendar.HOUR_OF_DAY)) {
        in 0..11 -> "Buenos dias"
        in 12..18 -> "Buenas tardes"
        else -> "Buenas noches"
    }

    private fun fechaLarga(): String {
        val cal = Calendar.getInstance()
        val dia = DIAS_LARGOS[cal.get(Calendar.DAY_OF_WEEK) - 1]
        val mes = MESES[cal.get(Calendar.MONTH)]
        return "$dia, ${cal.get(Calendar.DAY_OF_MONTH)} de $mes"
    }

    private companion object {
        // Se formatea a mano en vez de con java.time porque minSdk es 29 y el
        // resultado debe ser identico al de la web (es-ES) en cualquier locale
        // del telefono.
        val DIAS_LARGOS = listOf(
            "Domingo", "Lunes", "Martes", "Miercoles", "Jueves", "Viernes", "Sabado",
        )
        val MESES = listOf(
            "enero", "febrero", "marzo", "abril", "mayo", "junio",
            "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
        )
    }
}
