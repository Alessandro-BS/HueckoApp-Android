package com.example.hueckoapp.domain.model

/**
 * Modelo de dominio de HueckoApp.
 *
 * Los cuatro modelos base (User, Group, TimeBlock, Plan) son los de develop y
 * no cambian de forma: los repositorios de auth, grupos y horario los
 * construyen tal cual. Lo unico que se les anade son campos opcionales al
 * final, que es la parte de la firma que no rompe a quien ya los usa.
 *
 * Debajo viven los tipos de planificacion (propuestas, votos, incidencias y
 * cruce de disponibilidad) que la interfaz necesita y que develop aun no
 * tenia.
 */

// ---------------------------------------------------------------- base

/** Representa un usuario del sistema. */
data class User(
    val id: String,
    val name: String,
    val email: String,
    /** Marca a quien es imprescindible: su ausencia dispara la votacion expres. */
    val isEssential: Boolean = false
)

/** Representa un grupo de amigos. */
data class Group(
    val id: String,
    val name: String,
    val inviteCode: String,
    val members: List<User>,
    val description: String = "",
    /** Porcentaje minimo de coincidencia para sugerir una franja (HU-06). */
    val availabilityThreshold: Int = 80
)

/** Bloque de horario (HU-01, HU-03). */
data class TimeBlock(
    val id: String,
    val userId: String,
    val dayOfWeek: Int? = null, // 1=Lunes...7=Domingo, null=Puntual
    val startTime: String, // HH:mm
    val endTime: String,   // HH:mm
    val label: String,     // Ej: "Clase de Cálculo"
    val isRecurring: Boolean = true,
    val type: BlockType = BlockType.CLASE
) {
    val timeRange: String get() = "$startTime - $endTime"

    /** Hora de inicio en horas enteras, para cruzar agendas por franjas. */
    val startHour: Int get() = startTime.substringBefore(':').toIntOrNull() ?: 0

    /**
     * Hora de fin redondeada hacia arriba. Un bloque que acaba a las 10:30
     * ocupa hasta las 11: media hora suelta no sirve para quedar, y contarla
     * como libre llenaria la agenda de huecos que nadie puede usar.
     */
    val endHour: Int
        get() {
            val partes = endTime.split(':')
            val hora = partes.getOrNull(0)?.toIntOrNull() ?: 0
            val minutos = partes.getOrNull(1)?.toIntOrNull() ?: 0
            return if (minutos > 0) hora + 1 else hora
        }
}

/** Plan o evento grupal confirmado. */
data class Plan(
    val id: String,
    val groupId: String,
    val title: String,
    val location: String?,
    val dateTime: String,
    val status: String // PROPOSED, CONFIRMED, CANCELLED
)

// ------------------------------------------------------- planificacion

/**
 * Dia de la semana. El valor `iso` coincide con el `dayOfWeek` de [TimeBlock]
 * (1 = lunes), que es como lo guarda el repositorio de horarios.
 */
enum class DayOfWeek(val iso: Int, val label: String) {
    LUN(1, "Lun"),
    MAR(2, "Mar"),
    MIE(3, "Mié"),
    JUE(4, "Jue"),
    VIE(5, "Vie"),
    SAB(6, "Sáb"),
    DOM(7, "Dom");

    companion object {
        val week: List<DayOfWeek> = entries

        fun fromIso(iso: Int): DayOfWeek? = entries.firstOrNull { it.iso == iso }

        /** Convierte el `Calendar.DAY_OF_WEEK` de Android (domingo = 1). */
        fun fromCalendarField(calendarDayOfWeek: Int): DayOfWeek =
            fromIso(if (calendarDayOfWeek == 1) 7 else calendarDayOfWeek - 1) ?: LUN
    }
}

/** Naturaleza de un bloque de horario. */
enum class BlockType { CLASE, TRABAJO, LIBRE, PUNTUAL }

/** Ventana horaria propuesta para un plan, con sus votos (HU-08, HU-09). */
data class TimeWindowProposal(
    val id: String,
    val day: DayOfWeek,
    val startTime: String,
    val endTime: String,
    val availabilityPercentage: Int,
    val voterEmails: List<String> = emptyList()
) {
    val timeRange: String get() = "$startTime - $endTime"
}

enum class IncidenceType { FALTA, TARDANZA, IMPREVISTO }

enum class Criticality { BAJA, MEDIA, ALTA }

/** Imprevisto reportado sobre un plan confirmado (HU-11, HU-14). */
data class PlanIncidence(
    val id: String,
    val userEmail: String,
    val userName: String,
    val type: IncidenceType,
    val reason: String,
    val delayMinutes: Int? = null,
    val criticality: Criticality = Criticality.MEDIA,
    /** Deja de estar abierta cuando la votacion expres decide que hacer. */
    val resolved: Boolean = false
)

enum class ProposalState { PROPUESTO, CONFIRMADO, CANCELADO, EN_RECOORDINACION }

/** Propuesta de plan sometida a votacion dentro de un grupo. */
data class PlanProposal(
    val id: String,
    val groupId: String,
    val title: String,
    val location: String? = null,
    val createdBy: String,
    val votingDeadline: String,
    val state: ProposalState,
    val suggestedWindows: List<TimeWindowProposal> = emptyList(),
    val incidences: List<PlanIncidence> = emptyList()
)

/** Puntualidad de un asistente al plan confirmado. */
enum class AttendeeStatus { PUNTUAL, RETRASADO, NO_ASISTE }

data class EventAttendee(
    val email: String,
    val name: String,
    val status: AttendeeStatus = AttendeeStatus.PUNTUAL,
    val delayMinutes: Int? = null,
    val isEssential: Boolean = false
)

/** Vista compuesta del proximo plan confirmado que pinta el dashboard. */
data class UpcomingEvent(
    val id: String,
    val groupId: String,
    val groupName: String,
    val title: String,
    val dayLabel: String,
    val timeRange: String,
    val location: String,
    val state: ProposalState,
    val attendees: List<EventAttendee>
)

/**
 * Franja en la que coincide al menos el umbral del grupo. Es lo que devuelve
 * el cruce de agendas del modulo 2 (HU-05).
 */
data class MatchWindow(
    val day: DayOfWeek,
    val startHour: Int,
    val endHour: Int,
    val availabilityPercentage: Int,
    val freeMembers: Int
) {
    val timeRange: String
        get() = "%02d:00 - %02d:00".format(startHour, endHour)
}
