package com.example.hueckoapp.data

import com.example.hueckoapp.domain.model.AttendeeStatus
import com.example.hueckoapp.domain.model.BlockType
import com.example.hueckoapp.domain.model.Criticality
import com.example.hueckoapp.domain.model.DayOfWeek
import com.example.hueckoapp.domain.model.EventAttendee
import com.example.hueckoapp.domain.model.Group
import com.example.hueckoapp.domain.model.GroupMember
import com.example.hueckoapp.domain.model.IncidenceType
import com.example.hueckoapp.domain.model.MatchWindow
import com.example.hueckoapp.domain.model.MemberStatus
import com.example.hueckoapp.domain.model.PlanIncidence
import com.example.hueckoapp.domain.model.PlanProposal
import com.example.hueckoapp.domain.model.ProposalState
import com.example.hueckoapp.domain.model.TimeBlock
import com.example.hueckoapp.domain.model.TimeWindowProposal
import com.example.hueckoapp.domain.model.UpcomingEvent
import com.example.hueckoapp.domain.model.User
import androidx.compose.ui.graphics.toArgb
import com.example.hueckoapp.ui.theme.CategoryColors
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/** Bloque de horario de OTRO miembro del grupo, usado para cruzar agendas. */
data class GroupOccupiedSlot(
    val id: String,
    val userEmail: String,
    val userName: String,
    val day: DayOfWeek,
    val horaInicio: String,
    val horaFin: String,
    val titulo: String,
)

/**
 * Origen de datos unico de la app, en memoria.
 *
 * Replica el estado que en la web mantienen los stores de Zustand
 * (`authStore`, `groupsStore`, `scheduleStore`) con exactamente las mismas
 * semillas, de modo que las dos plataformas ensenan el mismo escenario de
 * demostracion. Cuando el backend de Spring Boot este listo, este objeto es el
 * unico punto que hay que sustituir por Retrofit: las pantallas hablan con los
 * ViewModel, y los ViewModel con esta interfaz.
 */
object HueckoRepository {

    /** Credenciales de demostracion, identicas a las de `authService.ts`. */
    const val DEMO_EMAIL = "alex.rodriguez@huecko.com"
    const val DEMO_PASSWORD = "demo1234"

    /** Color de categoria en el formato 0xAARRGGBB que espera `Color(Long)`. */
    private fun catColor(index: Int): Long =
        CategoryColors[index.mod(CategoryColors.size)].toArgb().toLong() and 0xFFFFFFFFL

    // ---------------------------------------------------------------- sesion

    private val _currentUser = MutableStateFlow<User?>(null)
    val currentUser: StateFlow<User?> = _currentUser.asStateFlow()

    fun signIn(user: User) {
        _currentUser.value = user
    }

    fun signOut() {
        _currentUser.value = null
    }

    val demoUser = User(id = "1", nombre = "Alex Rodriguez", email = DEMO_EMAIL)

    // ---------------------------------------------------------------- grupos

    private val _groups = MutableStateFlow(seedGroups())
    val groups: StateFlow<List<Group>> = _groups.asStateFlow()

    private val _proposals = MutableStateFlow(seedProposals())
    val proposals: StateFlow<List<PlanProposal>> = _proposals.asStateFlow()

    private val _mySchedule = MutableStateFlow(seedSchedule())
    val mySchedule: StateFlow<List<TimeBlock>> = _mySchedule.asStateFlow()

    private val occupiedSlots: List<GroupOccupiedSlot> = seedOccupiedSlots()

    /**
     * Registra el voto del usuario en una ventana. El voto es excluyente
     * dentro de la misma propuesta: elegir una franja retira el voto de las
     * demas, igual que en `voteProposalWindow` de la web.
     */
    fun voteWindow(proposalId: String, windowId: String, userEmail: String) {
        _proposals.value = _proposals.value.map { proposal ->
            if (proposal.id != proposalId) return@map proposal
            proposal.copy(
                ventanasSugeridas = proposal.ventanasSugeridas.map { window ->
                    val sinVoto = window.votosUsuarios - userEmail
                    if (window.id == windowId && !window.votosUsuarios.contains(userEmail)) {
                        window.copy(votosUsuarios = sinVoto + userEmail)
                    } else {
                        window.copy(votosUsuarios = sinVoto)
                    }
                },
            )
        }
    }

    /** Crea un grupo con el usuario actual como administrador. */
    fun createGroup(nombre: String, descripcion: String, umbral: Int, user: User): Group {
        val nuevo = Group(
            id = "g-${System.currentTimeMillis()}",
            nombre = nombre,
            descripcion = descripcion,
            codigoInvitacion = generarCodigo(nombre),
            creadoPor = user.email,
            umbralDisponibilidad = umbral,
            miembros = listOf(
                GroupMember(
                    email = user.email,
                    nombre = "${user.nombre.substringBefore(' ')} (Tu)",
                    isEssential = true,
                    colorArgb = catColor(0),
                ),
            ),
        )
        _groups.value = _groups.value + nuevo
        return nuevo
    }

    /** Devuelve el grupo al que se une el usuario, o null si el codigo no existe. */
    fun joinGroupByCode(codigo: String, user: User): Group? {
        val objetivo = _groups.value.firstOrNull {
            it.codigoInvitacion.equals(codigo.trim(), ignoreCase = true)
        } ?: return null

        if (objetivo.miembros.any { it.email == user.email }) return objetivo

        val actualizado = objetivo.copy(
            miembros = objetivo.miembros + GroupMember(
                email = user.email,
                nombre = user.nombre,
                colorArgb = catColor(objetivo.miembros.size),
                status = MemberStatus.PENDIENTE,
            ),
        )
        _groups.value = _groups.value.map { if (it.id == objetivo.id) actualizado else it }
        return actualizado
    }

    private fun generarCodigo(nombre: String): String {
        val raiz = nombre.filter { it.isLetterOrDigit() }.take(5).uppercase().ifEmpty { "GRUPO" }
        return "$raiz-${(100..999).random()}"
    }

    // ------------------------------------------------ cruce de disponibilidad

    /** Horas que pinta la agenda, de 8 a 19 como en la web. */
    private val agendaHours = (8..19).toList()

    /**
     * Porcentaje del grupo libre en una hora concreta.
     *
     * Un miembro esta ocupado si tiene un bloque que cubre esa hora; la
     * comparacion es por hora entera (`inicio <= h < fin`), igual que
     * `getCellAvailability` en la web.
     */
    private fun freePercentage(group: Group, day: DayOfWeek, hour: Int): Pair<Int, Int> {
        val ocupados = occupiedSlots.count { slot ->
            slot.day == day &&
                group.miembros.any { it.email == slot.userEmail } &&
                hour >= slot.horaInicio.substringBefore(':').toInt() &&
                hour < slot.horaFin.substringBefore(':').toInt()
        }
        val total = group.miembros.size.coerceAtLeast(1)
        val libres = group.miembros.size - ocupados
        return libres to Math.round(libres * 100f / total)
    }

    /**
     * Agrupa las horas consecutivas que alcanzan el umbral del grupo en
     * franjas legibles. Es el cruce inteligente del modulo 2 (HU-05): una
     * franja vale por su hora MENOS disponible, no por la media, para no
     * prometer un hueco que en realidad se rompe a mitad.
     */
    fun recommendedWindows(group: Group, day: DayOfWeek): List<MatchWindow> {
        val ventanas = mutableListOf<MatchWindow>()

        agendaHours.forEach { hour ->
            val (libres, porcentaje) = freePercentage(group, day, hour)
            val cumple = porcentaje >= group.umbralDisponibilidad
            val actual = ventanas.lastOrNull()

            when {
                cumple && actual != null && actual.horaFin == hour -> {
                    ventanas[ventanas.lastIndex] = actual.copy(
                        horaFin = hour + 1,
                        disponibilidadPorcentaje = minOf(actual.disponibilidadPorcentaje, porcentaje),
                        librePersonas = minOf(actual.librePersonas, libres),
                    )
                }

                cumple -> ventanas += MatchWindow(
                    dia = day,
                    horaInicio = hour,
                    horaFin = hour + 1,
                    disponibilidadPorcentaje = porcentaje,
                    librePersonas = libres,
                )
            }
        }

        return ventanas
    }

    // ------------------------------------------------------------- dashboard

    /** Primer plan confirmado, compuesto para la tarjeta destacada del inicio. */
    fun upcomingEvent(userEmail: String): UpcomingEvent? {
        val proposal = _proposals.value.firstOrNull { it.estado == ProposalState.CONFIRMADO }
            ?: return null
        val group = _groups.value.firstOrNull { it.id == proposal.groupId } ?: return null
        val window = proposal.ventanasSugeridas.firstOrNull() ?: return null

        return UpcomingEvent(
            id = proposal.id,
            groupId = group.id,
            groupName = group.nombre,
            titulo = proposal.titulo,
            diaLabel = window.dia.label,
            rangoHorario = window.rangoHorario,
            lugar = proposal.lugar ?: "Lugar por definir",
            estado = proposal.estado,
            asistentes = group.miembros.map { member ->
                val incidencia = proposal.incidencias.firstOrNull { it.userEmail == member.email }
                EventAttendee(
                    email = member.email,
                    nombre = if (member.email == userEmail) "Tu" else member.nombre,
                    status = when (incidencia?.tipo) {
                        IncidenceType.TARDANZA -> AttendeeStatus.RETRASADO
                        IncidenceType.FALTA, IncidenceType.IMPREVISTO -> AttendeeStatus.NO_ASISTE
                        null -> AttendeeStatus.PUNTUAL
                    },
                    minutosRetraso = incidencia?.minutosTardanza,
                    isEssential = member.isEssential,
                )
            },
        )
    }

    /** Bloques del horario propio que caen en el dia indicado. */
    fun scheduleFor(day: DayOfWeek): List<TimeBlock> = _mySchedule.value.filter { it.day == day }

    // ------------------------------------------------------------- semillas

    private fun seedGroups(): List<Group> = listOf(
        Group(
            id = "1",
            nombre = "Grupo Universitario - Ing. Software",
            descripcion = "Coordinacion para proyecto final, entregables y sesiones de estudio de fin de ciclo.",
            codigoInvitacion = "UNIV-2026",
            creadoPor = DEMO_EMAIL,
            umbralDisponibilidad = 80,
            miembros = listOf(
                GroupMember(DEMO_EMAIL, "Alex R. (Tu)", isEssential = true, colorArgb = catColor(0)),
                GroupMember("maria.c@huecko.com", "Maria C.", isEssential = true, colorArgb = catColor(1)),
                GroupMember("sam.p@huecko.com", "Sam P.", colorArgb = catColor(2)),
                GroupMember("lucia.t@huecko.com", "Lucia T.", colorArgb = catColor(3)),
                GroupMember(
                    "diego.r@huecko.com",
                    "Diego R.",
                    colorArgb = catColor(4),
                    status = MemberStatus.PENDIENTE,
                ),
            ),
        ),
        Group(
            id = "2",
            nombre = "Amigos de Fin de Semana",
            descripcion = "Pichangas de futbol, asados de domingo, salidas y cumpleanos del grupo.",
            codigoInvitacion = "WEEKEND-99",
            creadoPor = "carlos.m@huecko.com",
            umbralDisponibilidad = 70,
            miembros = listOf(
                GroupMember("carlos.m@huecko.com", "Carlos M.", isEssential = true, colorArgb = catColor(5)),
                GroupMember(DEMO_EMAIL, "Alex R. (Tu)", colorArgb = catColor(0)),
                GroupMember("jorge.l@huecko.com", "Jorge L.", colorArgb = catColor(6)),
                GroupMember("valeria.v@huecko.com", "Valeria V.", colorArgb = catColor(7)),
            ),
        ),
    )

    private fun seedProposals(): List<PlanProposal> = listOf(
        PlanProposal(
            id = "prop-1",
            groupId = "1",
            titulo = "Reunion de Trabajo de Grado y Cierre",
            lugar = "Biblioteca Central / Google Meet",
            creadoPor = "Alex R.",
            plazoVotacion = "Finalizada",
            estado = ProposalState.CONFIRMADO,
            ventanasSugeridas = listOf(
                TimeWindowProposal(
                    id = "w1",
                    dia = DayOfWeek.MIE,
                    horaInicio = "11:00",
                    horaFin = "13:00",
                    disponibilidadPorcentaje = 100,
                    votosUsuarios = listOf(DEMO_EMAIL, "maria.c@huecko.com", "sam.p@huecko.com"),
                ),
            ),
            incidencias = listOf(
                PlanIncidence(
                    id = "inc-1",
                    userEmail = "maria.c@huecko.com",
                    userName = "Maria C.",
                    tipo = IncidenceType.FALTA,
                    motivo = "Cruce con examen sorpresa de laboratorio a ultima hora.",
                    criticidad = Criticality.ALTA,
                ),
            ),
        ),
        PlanProposal(
            id = "prop-2",
            groupId = "2",
            titulo = "Pichanga y Parrilla de Domingo",
            lugar = "Canchas El Golazo",
            creadoPor = "Carlos M.",
            plazoVotacion = "Cierra hoy a las 20:00",
            estado = ProposalState.PROPUESTO,
            ventanasSugeridas = listOf(
                TimeWindowProposal("w-101", DayOfWeek.SAB, "16:00", "18:00", 85, listOf(DEMO_EMAIL, "carlos.m@huecko.com")),
                TimeWindowProposal("w-102", DayOfWeek.DOM, "11:00", "13:00", 100, listOf("carlos.m@huecko.com")),
                TimeWindowProposal("w-103", DayOfWeek.DOM, "15:00", "17:00", 70),
            ),
        ),
        PlanProposal(
            id = "prop-3",
            groupId = "1",
            titulo = "Reunion de Avance de Tesis",
            lugar = "Google Meet / Biblioteca",
            creadoPor = "Alex R.",
            plazoVotacion = "Cierra manana a las 12:00",
            estado = ProposalState.PROPUESTO,
            ventanasSugeridas = listOf(
                TimeWindowProposal("w-201", DayOfWeek.MIE, "14:00", "16:00", 100, listOf("sam.p@huecko.com")),
                TimeWindowProposal("w-202", DayOfWeek.JUE, "10:00", "12:00", 75, listOf(DEMO_EMAIL)),
            ),
        ),
    )

    private fun seedSchedule(): List<TimeBlock> = listOf(
        TimeBlock("1", DayOfWeek.LUN, "Universidad - Algoritmos", "08:00", "11:00", BlockType.CLASE, catColor(4)),
        TimeBlock("2", DayOfWeek.MAR, "Turno Laboral", "10:00", "14:00", BlockType.TRABAJO, catColor(1)),
        TimeBlock("3", DayOfWeek.MIE, "Universidad - Calculo Avanzado", "08:00", "10:00", BlockType.CLASE, catColor(1)),
        TimeBlock("4", DayOfWeek.MIE, "Gimnasio y Entrenamiento", "13:00", "15:30", BlockType.LIBRE, catColor(0)),
        TimeBlock("5", DayOfWeek.JUE, "Turno Laboral", "10:00", "14:00", BlockType.TRABAJO, catColor(1)),
        TimeBlock("6", DayOfWeek.VIE, "Universidad - Redes", "08:00", "11:00", BlockType.CLASE, catColor(0)),
    )

    private fun seedOccupiedSlots(): List<GroupOccupiedSlot> = listOf(
        GroupOccupiedSlot("101", "maria.c@huecko.com", "Maria C.", DayOfWeek.LUN, "08:00", "12:00", "Clase Redes"),
        GroupOccupiedSlot("102", "sam.p@huecko.com", "Sam P.", DayOfWeek.LUN, "09:00", "13:00", "Practicas Pro"),
        GroupOccupiedSlot("103", "lucia.t@huecko.com", "Lucia T.", DayOfWeek.MAR, "08:00", "11:00", "Laboratorio"),
        GroupOccupiedSlot("104", "maria.c@huecko.com", "Maria C.", DayOfWeek.MAR, "14:00", "18:00", "Turno Tarde"),
        GroupOccupiedSlot("105", "sam.p@huecko.com", "Sam P.", DayOfWeek.MIE, "08:00", "10:30", "Calculo"),
        GroupOccupiedSlot("106", "lucia.t@huecko.com", "Lucia T.", DayOfWeek.JUE, "10:00", "14:00", "Ingles VI"),
        GroupOccupiedSlot("107", "maria.c@huecko.com", "Maria C.", DayOfWeek.VIE, "08:00", "11:00", "Arquitectura"),
        GroupOccupiedSlot("108", "sam.p@huecko.com", "Sam P.", DayOfWeek.VIE, "11:00", "15:00", "Trabajo"),
        GroupOccupiedSlot("109", DEMO_EMAIL, "Alex R.", DayOfWeek.LUN, "08:00", "11:00", "Universidad"),
        GroupOccupiedSlot("110", DEMO_EMAIL, "Alex R.", DayOfWeek.MIE, "08:00", "10:00", "Universidad"),
        GroupOccupiedSlot("111", DEMO_EMAIL, "Alex R.", DayOfWeek.VIE, "08:00", "11:00", "Universidad"),
    )
}
