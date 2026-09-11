package com.example.hueckoapp.domain.usecase

import com.example.hueckoapp.domain.model.DayOfWeek
import com.example.hueckoapp.domain.model.Group
import com.example.hueckoapp.domain.model.MatchWindow
import com.example.hueckoapp.domain.model.TimeBlock

/**
 * Cruce inteligente de agendas (modulo 2, HU-05 y HU-06).
 *
 * Es una funcion pura, sin repositorios ni corrutinas, para que se pueda
 * probar con una lista de bloques y sin levantar nada. Toda la logica de
 * "cuando puede quedar este grupo" vive aqui y en ningun otro sitio.
 */
object AvailabilityMatcher {

    /** Franja horaria que se pinta en la agenda: de 08:00 a 20:00. */
    private val AGENDA_HOURS = 8..19

    /**
     * Agrupa en franjas legibles las horas consecutivas en las que al menos el
     * umbral del grupo esta libre.
     *
     * Una franja se describe por su hora MENOS disponible, no por la media:
     * decir "de 10 a 13 esta libre el 80%" cuando a las 12 solo lo esta el 40%
     * es prometer un hueco que se rompe por la mitad.
     *
     * @param blocks bloques de TODOS los miembros, ya con `userId` real. Los
     *   bloques de quien no pertenece al grupo se ignoran.
     */
    fun windowsFor(group: Group, blocks: List<TimeBlock>, day: DayOfWeek): List<MatchWindow> {
        if (group.members.isEmpty()) return emptyList()

        val memberIds = group.members.map { it.id }.toSet()
        val relevantes = blocks.filter { it.userId in memberIds && it.dayOfWeek == day.iso }

        val ventanas = mutableListOf<MatchWindow>()

        for (hour in AGENDA_HOURS) {
            val ocupados = relevantes
                .filter { hour >= it.startHour && hour < it.endHour }
                .map { it.userId }
                .toSet()

            val libres = group.members.size - ocupados.size
            val porcentaje = Math.round(libres * 100f / group.members.size)
            if (porcentaje < group.availabilityThreshold) continue

            val anterior = ventanas.lastOrNull()
            if (anterior != null && anterior.endHour == hour) {
                // Prolonga la franja abierta y se queda con el peor dato de las
                // horas que la componen.
                ventanas[ventanas.lastIndex] = anterior.copy(
                    endHour = hour + 1,
                    availabilityPercentage = minOf(anterior.availabilityPercentage, porcentaje),
                    freeMembers = minOf(anterior.freeMembers, libres),
                )
            } else {
                ventanas += MatchWindow(
                    day = day,
                    startHour = hour,
                    endHour = hour + 1,
                    availabilityPercentage = porcentaje,
                    freeMembers = libres,
                )
            }
        }

        return ventanas
    }
}
