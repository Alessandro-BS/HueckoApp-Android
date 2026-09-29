package com.example.hueckoapp.domain.repository

import com.example.hueckoapp.domain.model.PlanProposal
import com.example.hueckoapp.domain.model.TimeBlock
import kotlinx.coroutines.flow.Flow

/**
 * Propuestas de plan y votacion (modulos 3 y 4).
 *
 * Va aparte de [GroupRepository] porque son ciclos de vida distintos: un grupo
 * dura meses y una votacion, horas.
 */
interface PlanRepository {
    /** Propuestas visibles para el usuario, de todos sus grupos. */
    fun getProposals(): Flow<List<PlanProposal>>

    /**
     * Bloques de horario del RESTO de miembros del grupo, necesarios para
     * cruzar agendas. El horario propio lo sirve [ScheduleRepository]; en un
     * backend real esto seria una consulta al servidor, no datos del telefono.
     */
    fun getGroupOccupancy(): Flow<List<TimeBlock>>

    /** Vota una ventana. El voto es excluyente dentro de la misma propuesta. */
    suspend fun voteWindow(proposalId: String, windowId: String, userEmail: String): Result<Unit>

    /** Cierra la votacion expres abierta por un imprevisto (HU-14). */
    suspend fun resolveIncidences(proposalId: String, newState: String): Result<Unit>
}
