package com.example.hueckoapp.domain.model

/**
 * Modelo de dominio de HueckoApp.
 *
 * Es la traduccion a Kotlin de los ficheros `*.types.ts` de huecko-frontend. Se
 * conservan los nombres en castellano del contrato del backend (nombre,
 * miembros, ventanasSugeridas) para que un campo signifique lo mismo en las
 * tres capas y no haya que traducir mentalmente al depurar.
 */

/** Dia de la semana tal y como lo etiqueta la web. */
enum class DayOfWeek(val label: String) {
    LUN("Lun"),
    MAR("Mar"),
    MIE("Mie"),
    JUE("Jue"),
    VIE("Vie"),
    SAB("Sab"),
    DOM("Dom");

    companion object {
        /** Dias laborables mas fin de semana, en el orden que se pinta la agenda. */
        val week: List<DayOfWeek> = listOf(LUN, MAR, MIE, JUE, VIE, SAB, DOM)

        /**
         * Convierte el `Calendar.DAY_OF_WEEK` de Android (domingo = 1) al dia
         * de esta enumeracion.
         */
        fun fromCalendarField(calendarDayOfWeek: Int): DayOfWeek = when (calendarDayOfWeek) {
            1 -> DOM
            2 -> LUN
            3 -> MAR
            4 -> MIE
            5 -> JUE
            6 -> VIE
            else -> SAB
        }
    }
}

/** Usuario autenticado. Refleja `AuthUser` de auth.types.ts. */
data class User(
    val id: String,
    val nombre: String,
    val email: String,
)

enum class MemberRole { ADMIN, MIEMBRO }

enum class MemberStatus { CONFIRMADO, PENDIENTE }

/**
 * Integrante de un grupo. `isEssential` marca a quien es imprescindible: su
 * ausencia dispara la votacion expres del modulo 4.
 */
data class GroupMember(
    val email: String,
    val nombre: String,
    val isEssential: Boolean = false,
    /** Color de identidad dentro del grupo, tomado de `CategoryColors`. */
    val colorArgb: Long,
    val rol: MemberRole = MemberRole.MIEMBRO,
    val status: MemberStatus = MemberStatus.CONFIRMADO,
)

data class Group(
    val id: String,
    val nombre: String,
    val descripcion: String,
    val codigoInvitacion: String,
    val creadoPor: String,
    /** Porcentaje minimo de coincidencia para proponer una franja (HU-06). */
    val umbralDisponibilidad: Int,
    val miembros: List<GroupMember>,
)

/** Tipo de bloque de horario. Refleja los `type` de schedule.types.ts. */
enum class BlockType { CLASE, TRABAJO, LIBRE, PUNTUAL }

/**
 * Bloque de disponibilidad o indisponibilidad (HU-01 y HU-03).
 * Las horas van en formato HH:mm, igual que en el backend.
 */
data class TimeBlock(
    val id: String,
    val day: DayOfWeek,
    val titulo: String,
    val horaInicio: String,
    val horaFin: String,
    val tipo: BlockType,
    val colorArgb: Long,
    val esRecurrente: Boolean = true,
) {
    val rangoHorario: String get() = "$horaInicio - $horaFin"
}

/** Ventana horaria propuesta para un plan, con sus votos (HU-08, HU-09). */
data class TimeWindowProposal(
    val id: String,
    val dia: DayOfWeek,
    val horaInicio: String,
    val horaFin: String,
    val disponibilidadPorcentaje: Int,
    val votosUsuarios: List<String> = emptyList(),
) {
    val rangoHorario: String get() = "$horaInicio - $horaFin"
}

enum class IncidenceType { FALTA, TARDANZA, IMPREVISTO }

enum class Criticality { BAJA, MEDIA, ALTA }

/** Imprevisto reportado sobre un plan confirmado (HU-11, HU-14). */
data class PlanIncidence(
    val id: String,
    val userEmail: String,
    val userName: String,
    val tipo: IncidenceType,
    val motivo: String,
    val minutosTardanza: Int? = null,
    val criticidad: Criticality = Criticality.MEDIA,
    /** Deja de estar abierta cuando la votacion expres decide que hacer. */
    val resuelta: Boolean = false,
)

enum class ProposalState { PROPUESTO, CONFIRMADO, CANCELADO, EN_RECOORDINACION }

data class PlanProposal(
    val id: String,
    val groupId: String,
    val titulo: String,
    val lugar: String? = null,
    val creadoPor: String,
    val plazoVotacion: String,
    val estado: ProposalState,
    val ventanasSugeridas: List<TimeWindowProposal> = emptyList(),
    val incidencias: List<PlanIncidence> = emptyList(),
)

/** Puntualidad de un asistente al plan confirmado. */
enum class AttendeeStatus { PUNTUAL, RETRASADO, NO_ASISTE }

data class EventAttendee(
    val email: String,
    val nombre: String,
    val status: AttendeeStatus = AttendeeStatus.PUNTUAL,
    val minutosRetraso: Int? = null,
    val isEssential: Boolean = false,
)

/** Vista compuesta del proximo plan confirmado que pinta el dashboard. */
data class UpcomingEvent(
    val id: String,
    val groupId: String,
    val groupName: String,
    val titulo: String,
    val diaLabel: String,
    val rangoHorario: String,
    val lugar: String,
    val estado: ProposalState,
    val asistentes: List<EventAttendee>,
)

/**
 * Franja en la que coincide al menos el umbral del grupo. Es lo que devuelve
 * el cruce de agendas del modulo 2 (HU-05).
 */
data class MatchWindow(
    val dia: DayOfWeek,
    val horaInicio: Int,
    val horaFin: Int,
    val disponibilidadPorcentaje: Int,
    val librePersonas: Int,
) {
    val rangoHorario: String
        get() = "%02d:00 - %02d:00".format(horaInicio, horaFin)
}
