package com.example.hueckoapp.data.repository

import com.example.hueckoapp.domain.model.Criticality
import com.example.hueckoapp.domain.model.DayOfWeek
import com.example.hueckoapp.domain.model.IncidenceType
import com.example.hueckoapp.domain.model.PlanIncidence
import com.example.hueckoapp.domain.model.PlanProposal
import com.example.hueckoapp.domain.model.ProposalState
import com.example.hueckoapp.domain.model.TimeBlock
import com.example.hueckoapp.domain.model.TimeWindowProposal
import com.example.hueckoapp.domain.repository.PlanRepository
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update

/**
 * Implementacion simulada de propuestas, en la linea de los demas
 * repositorios de esta fase.
 *
 * Las semillas cuelgan del grupo "g1" que siembra [GroupRepositoryImpl], para
 * que al abrirlo haya algo que votar y algun hueco que cruzar. Sin esto la
 * pantalla de grupos se ve vacia y no se puede comprobar nada.
 */
class PlanRepositoryImpl : PlanRepository {

    private val _proposals = MutableStateFlow(seedProposals())

    /**
     * Horario del resto del grupo. Ana (user_2) tiene clase de manana los
     * lunes y turno de tarde los miercoles; asi el cruce da huecos distintos
     * segun el dia en vez de una franja plana de 8 a 20.
     */
    private val _occupancy = MutableStateFlow(
        listOf(
            TimeBlock("occ_1", "user_2", 1, "08:00", "12:00", "Clase de Redes"),
            TimeBlock("occ_2", "user_2", 3, "15:00", "19:00", "Turno de tarde"),
            TimeBlock("occ_3", "user_2", 5, "09:00", "11:00", "Laboratorio"),
        )
    )

    override fun getProposals(): Flow<List<PlanProposal>> = _proposals.asStateFlow()

    override fun getGroupOccupancy(): Flow<List<TimeBlock>> = _occupancy.asStateFlow()

    override suspend fun voteWindow(
        proposalId: String,
        windowId: String,
        userEmail: String,
    ): Result<Unit> {
        _proposals.update { propuestas ->
            propuestas.map { propuesta ->
                if (propuesta.id != proposalId) return@map propuesta
                propuesta.copy(
                    suggestedWindows = propuesta.suggestedWindows.map { ventana ->
                        // Un voto por propuesta: elegir una franja retira el
                        // voto de las demas, o el recuento no diria nada.
                        val sinVoto = ventana.voterEmails - userEmail
                        if (ventana.id == windowId && userEmail !in ventana.voterEmails) {
                            ventana.copy(voterEmails = sinVoto + userEmail)
                        } else {
                            ventana.copy(voterEmails = sinVoto)
                        }
                    },
                )
            }
        }
        return Result.success(Unit)
    }

    override suspend fun resolveIncidences(proposalId: String, newState: String): Result<Unit> {
        val estado = runCatching { ProposalState.valueOf(newState) }.getOrNull()
            ?: return Result.failure(IllegalArgumentException("Estado desconocido: $newState"))

        _proposals.update { propuestas ->
            propuestas.map { propuesta ->
                if (propuesta.id != proposalId) {
                    propuesta
                } else {
                    propuesta.copy(
                        state = estado,
                        incidences = propuesta.incidences.map { it.copy(resolved = true) },
                        // Reprogramar es volver a elegir hora: los votos de la
                        // ronda anterior ya no dicen nada de las ventanas nuevas.
                        suggestedWindows = if (estado == ProposalState.PROPUESTO) {
                            propuesta.suggestedWindows.map { it.copy(voterEmails = emptyList()) }
                        } else {
                            propuesta.suggestedWindows
                        },
                    )
                }
            }
        }
        return Result.success(Unit)
    }

    private fun seedProposals(): List<PlanProposal> = listOf(
        PlanProposal(
            id = "prop_1",
            groupId = "g1",
            title = "Reunión de avance del proyecto",
            location = "Biblioteca central",
            createdBy = "test@test.com",
            votingDeadline = "Cerrada",
            state = ProposalState.CONFIRMADO,
            suggestedWindows = listOf(
                TimeWindowProposal(
                    id = "w_1",
                    day = DayOfWeek.MIE,
                    startTime = "11:00",
                    endTime = "13:00",
                    availabilityPercentage = 100,
                    voterEmails = listOf("test@test.com", "ana@test.com"),
                ),
            ),
            incidences = listOf(
                PlanIncidence(
                    id = "inc_1",
                    userEmail = "ana@test.com",
                    userName = "Ana",
                    type = IncidenceType.IMPREVISTO,
                    reason = "Cruce con un examen de laboratorio a última hora.",
                    criticality = Criticality.ALTA,
                ),
            ),
        ),
        PlanProposal(
            id = "prop_2",
            groupId = "g1",
            title = "Repaso antes de la entrega",
            location = "Google Meet",
            createdBy = "ana@test.com",
            votingDeadline = "Cierra hoy a las 20:00",
            state = ProposalState.PROPUESTO,
            suggestedWindows = listOf(
                TimeWindowProposal("w_21", DayOfWeek.MAR, "16:00", "18:00", 100, listOf("ana@test.com")),
                TimeWindowProposal("w_22", DayOfWeek.JUE, "10:00", "12:00", 100),
                TimeWindowProposal("w_23", DayOfWeek.VIE, "16:00", "18:00", 50),
            ),
        ),
    )
}
