package com.example.hueckoapp.ui.dashboard

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.CrisisAlert
import androidx.compose.material.icons.filled.EventRepeat
import androidx.compose.material.icons.outlined.CalendarMonth
import androidx.compose.material.icons.outlined.DocumentScanner
import androidx.compose.material.icons.outlined.EditCalendar
import androidx.compose.material.icons.outlined.EventAvailable
import androidx.compose.material.icons.outlined.EventBusy
import androidx.compose.material.icons.outlined.Group
import androidx.compose.material.icons.outlined.GroupAdd
import androidx.compose.material.icons.outlined.Groups
import androidx.compose.material.icons.outlined.HowToVote
import androidx.compose.material.icons.outlined.LocationOn
import androidx.compose.material.icons.outlined.School
import androidx.compose.material.icons.outlined.Schedule
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Snackbar
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.example.hueckoapp.domain.model.AttendeeStatus
import com.example.hueckoapp.domain.model.BlockType
import com.example.hueckoapp.domain.model.TimeBlock
import com.example.hueckoapp.domain.model.TimeWindowProposal
import com.example.hueckoapp.domain.model.UpcomingEvent
import com.example.hueckoapp.ui.components.EmptyState
import com.example.hueckoapp.ui.components.HueckoAvatar
import com.example.hueckoapp.ui.components.HueckoBadge
import com.example.hueckoapp.ui.components.HueckoCard
import com.example.hueckoapp.ui.components.SectionHeader
import com.example.hueckoapp.ui.theme.HueckoRadius
import com.example.hueckoapp.ui.theme.HueckoTheme

/**
 * Inicio.
 *
 * Traduce `DashboardPage.tsx` a una sola columna: en la web las metricas van
 * en cuatro columnas y el horario del dia convive con los grupos en una rejilla
 * de dos; aqui las metricas quedan en dos columnas —el minimo que sigue siendo
 * legible en un telefono— y el resto se apila en el orden de importancia con
 * el que se lee la pagina.
 */
@Composable
fun DashboardScreen(
    onNavigateToGroups: () -> Unit,
    onNavigateToSchedule: () -> Unit,
    modifier: Modifier = Modifier,
    viewModel: DashboardViewModel = viewModel(),
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()

    Box(modifier = modifier.fillMaxWidth()) {
        LazyColumn(
            modifier = Modifier
                .fillMaxWidth()
                .background(MaterialTheme.colorScheme.surface),
            contentPadding = PaddingValues(horizontal = 16.dp, vertical = 20.dp),
            verticalArrangement = Arrangement.spacedBy(24.dp),
        ) {
            item { GreetingHeader(state, onNavigateToSchedule, onNavigateToGroups) }

            state.alertaVotacionExpres?.let { alerta ->
                item {
                    ExpressVoteCard(
                        alerta = alerta,
                        elegido = state.votoExpresElegido,
                        onVote = viewModel::submitExpressVote,
                    )
                }
            }

            item { MetricsGrid(state, onNavigateToGroups, onNavigateToSchedule) }

            item {
                Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    SectionHeader(title = "Proximo plan confirmado")
                    val plan = state.proximoPlan
                    if (plan != null) {
                        UpcomingPlanCard(plan)
                    } else {
                        EmptyState(
                            icon = Icons.Outlined.EventBusy,
                            title = "No tienes eventos confirmados proximos",
                            description = "Propon un plan en tus grupos para que Huecko sugiera los mejores horarios.",
                            actionLabel = "Proponer plan",
                            onAction = onNavigateToGroups,
                        )
                    }
                }
            }

            item {
                TodayScheduleCard(
                    hoy = state.hoy.label,
                    bloques = state.bloquesDeHoy,
                    bloquesTotales = state.bloquesTotales,
                    onManage = onNavigateToSchedule,
                )
            }

            item {
                MyGroupsCard(
                    grupos = state.grupos,
                    onOpenGroups = onNavigateToGroups,
                )
            }

            item {
                Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    HueckoBadge(
                        text = "TU VOTO IMPORTA",
                        containerColor = MaterialTheme.colorScheme.primaryContainer,
                        contentColor = MaterialTheme.colorScheme.primary,
                    )
                    SectionHeader(
                        title = "Votacion de planes en curso",
                        subtitle = "Opciones generadas a partir de la disponibilidad de tu grupo.",
                    )
                }
            }

            if (state.votaciones.isEmpty()) {
                item {
                    EmptyState(
                        icon = Icons.Outlined.HowToVote,
                        title = "No hay votaciones activas",
                        description = "Cuando alguien proponga un plan podras votar aqui tus franjas favoritas.",
                        actionLabel = "Ver grupos",
                        onAction = onNavigateToGroups,
                    )
                }
            } else {
                items(state.votaciones, key = { it.proposal.id }) { votacion ->
                    PendingVoteCard(
                        vote = votacion,
                        userEmail = com.example.hueckoapp.data.HueckoRepository.DEMO_EMAIL,
                        onVote = { windowId -> viewModel.vote(votacion.proposal.id, windowId) },
                    )
                }
            }

            item {
                QuickActions(
                    onCreateGroup = onNavigateToGroups,
                    onEditSchedule = onNavigateToSchedule,
                )
            }
        }

        // El aviso flota sobre la lista, como el toast fijo de la web.
        AnimatedVisibility(
            visible = state.toast != null,
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .padding(16.dp),
        ) {
            Snackbar(
                shape = RoundedCornerShape(HueckoRadius.xxl),
                containerColor = MaterialTheme.colorScheme.inverseSurface,
                contentColor = MaterialTheme.colorScheme.inverseOnSurface,
            ) {
                Text(state.toast.orEmpty(), style = MaterialTheme.typography.bodySmall)
            }
        }
    }
}

@Composable
private fun GreetingHeader(
    state: DashboardUiState,
    onImportOcr: () -> Unit,
    onProposePlan: () -> Unit,
) {
    Column {
        Text(
            text = state.fechaLarga,
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(Modifier.height(4.dp))
        Row {
            Text(
                text = "${state.saludo}, ",
                style = MaterialTheme.typography.headlineLarge,
                color = MaterialTheme.colorScheme.onSurface,
            )
            Text(
                text = "${state.nombre}.",
                style = MaterialTheme.typography.headlineLarge,
                color = MaterialTheme.colorScheme.primary,
            )
        }
        Spacer(Modifier.height(6.dp))
        Text(
            text = "Esto es lo que esta pasando en tus grupos, horarios y planes el dia de hoy.",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )

        Spacer(Modifier.height(16.dp))

        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            SecondaryAction(
                text = "Importar OCR",
                icon = Icons.Outlined.DocumentScanner,
                onClick = onImportOcr,
                modifier = Modifier.weight(1f),
            )
            PrimaryAction(
                text = "Proponer plan",
                icon = Icons.Filled.Add,
                onClick = onProposePlan,
                modifier = Modifier.weight(1f),
            )
        }
    }
}

/**
 * Aviso de baja critica con votacion expres (HU-14).
 *
 * Los tres botones ocupan una fila propia y a ancho completo: en la web caben
 * junto al texto, pero a 360dp quedarian tan estrechos que "Reprogramar" se
 * partiria en dos lineas.
 */
@Composable
private fun ExpressVoteCard(
    alerta: ExpressVoteAlert,
    elegido: ExpressVoteChoice?,
    onVote: (ExpressVoteChoice) -> Unit,
) {
    val extended = HueckoTheme.extended
    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(HueckoRadius.card),
        color = extended.warningContainer.copy(alpha = 0.45f),
        border = BorderStroke(2.dp, extended.warning.copy(alpha = 0.45f)),
    ) {
        Column(modifier = Modifier.padding(18.dp)) {
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Box(
                    modifier = Modifier
                        .size(40.dp)
                        .clip(RoundedCornerShape(HueckoRadius.xxl))
                        .background(extended.warning),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(
                        Icons.Filled.CrisisAlert,
                        contentDescription = null,
                        tint = extended.onWarning,
                        modifier = Modifier.size(22.dp),
                    )
                }

                Column {
                    HueckoBadge(
                        text = "VOTACION EXPRES EN CURSO",
                        containerColor = extended.warningContainer,
                        contentColor = extended.onWarningContainer,
                    )
                    Spacer(Modifier.height(4.dp))
                    Text(
                        text = "Tiempo restante: ${alerta.tiempoRestante}",
                        style = MaterialTheme.typography.labelSmall,
                        color = extended.onWarningContainer,
                    )
                }
            }

            Spacer(Modifier.height(12.dp))

            Text(
                text = "${alerta.quien} (rol critico) reporto un imprevisto para \"${alerta.planTitulo}\"",
                style = MaterialTheme.typography.titleMedium,
                color = MaterialTheme.colorScheme.onSurface,
            )
            Spacer(Modifier.height(4.dp))
            Text(
                text = "Motivo: ${alerta.motivo}",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )

            Spacer(Modifier.height(14.dp))

            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                ExpressVoteButton(
                    choice = ExpressVoteChoice.REPROGRAMAR,
                    icon = Icons.Filled.EventRepeat,
                    selected = elegido == ExpressVoteChoice.REPROGRAMAR,
                    onClick = onVote,
                    modifier = Modifier.weight(1f),
                )
                ExpressVoteButton(
                    choice = ExpressVoteChoice.CANCELAR,
                    icon = Icons.Filled.Close,
                    selected = elegido == ExpressVoteChoice.CANCELAR,
                    onClick = onVote,
                    destructive = true,
                    modifier = Modifier.weight(1f),
                )
                ExpressVoteButton(
                    choice = ExpressVoteChoice.MANTENER,
                    icon = Icons.Filled.Check,
                    selected = elegido == ExpressVoteChoice.MANTENER,
                    onClick = onVote,
                    modifier = Modifier.weight(1f),
                )
            }
        }
    }
}

@Composable
private fun ExpressVoteButton(
    choice: ExpressVoteChoice,
    icon: ImageVector,
    selected: Boolean,
    onClick: (ExpressVoteChoice) -> Unit,
    modifier: Modifier = Modifier,
    destructive: Boolean = false,
) {
    val container = when {
        selected && destructive -> MaterialTheme.colorScheme.error
        selected -> MaterialTheme.colorScheme.primary
        else -> MaterialTheme.colorScheme.surfaceContainerLowest
    }
    val content = when {
        selected && destructive -> MaterialTheme.colorScheme.onError
        selected -> MaterialTheme.colorScheme.onPrimary
        destructive -> MaterialTheme.colorScheme.error
        else -> MaterialTheme.colorScheme.onSurface
    }

    Surface(
        modifier = modifier,
        shape = RoundedCornerShape(HueckoRadius.xxl),
        color = container,
        border = if (selected) null else BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
        onClick = { onClick(choice) },
    ) {
        Column(
            modifier = Modifier.padding(vertical = 10.dp, horizontal = 4.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Icon(icon, contentDescription = null, tint = content, modifier = Modifier.size(18.dp))
            Spacer(Modifier.height(4.dp))
            Text(
                text = choice.etiqueta,
                style = MaterialTheme.typography.labelSmall,
                fontWeight = FontWeight.Bold,
                color = content,
            )
        }
    }
}

/** Las cuatro metricas de la web, en dos columnas. */
@Composable
private fun MetricsGrid(
    state: DashboardUiState,
    onOpenGroups: () -> Unit,
    onOpenSchedule: () -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            MetricCard(
                label = "Grupos activos",
                value = state.gruposActivos.toString(),
                unit = "Grupos",
                caption = "Con disponibilidad sincronizada",
                icon = Icons.Outlined.Groups,
                onClick = onOpenGroups,
                modifier = Modifier.weight(1f),
            )
            MetricCard(
                label = "Votaciones activas",
                value = state.votacionesActivas.toString(),
                unit = "Por votar",
                caption = "Planes abiertos para definir hora",
                icon = Icons.Outlined.HowToVote,
                onClick = onOpenGroups,
                highlight = true,
                modifier = Modifier.weight(1f),
            )
        }
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            MetricCard(
                label = "Huecos coincidentes",
                value = "${state.horasCoincidentes}h",
                unit = "Esta semana",
                caption = "Donde coincide 80% o mas del grupo",
                icon = Icons.Outlined.Schedule,
                onClick = onOpenSchedule,
                modifier = Modifier.weight(1f),
            )
            MetricCard(
                label = "Mi horario",
                value = state.bloquesTotales.toString(),
                unit = "Bloques",
                caption = "Sincronizado con grupos",
                icon = Icons.Outlined.CalendarMonth,
                onClick = onOpenSchedule,
                modifier = Modifier.weight(1f),
            )
        }
    }
}

@Composable
private fun MetricCard(
    label: String,
    value: String,
    unit: String,
    caption: String,
    icon: ImageVector,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    highlight: Boolean = false,
) {
    val extended = HueckoTheme.extended
    HueckoCard(
        modifier = modifier,
        contentPadding = PaddingValues(14.dp),
        shape = RoundedCornerShape(HueckoRadius.xxxl),
        onClick = onClick,
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.Top,
        ) {
            Text(
                text = label,
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.weight(1f),
            )
            Box(
                modifier = Modifier
                    .size(30.dp)
                    .clip(RoundedCornerShape(HueckoRadius.lg))
                    .background(
                        if (highlight) extended.warningContainer else MaterialTheme.colorScheme.primaryContainer,
                    ),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    icon,
                    contentDescription = null,
                    tint = if (highlight) extended.onWarningContainer else MaterialTheme.colorScheme.primary,
                    modifier = Modifier.size(17.dp),
                )
            }
        }

        Spacer(Modifier.height(10.dp))

        Text(
            text = value,
            style = MaterialTheme.typography.displaySmall,
            color = MaterialTheme.colorScheme.onSurface,
        )
        Text(
            text = unit,
            style = MaterialTheme.typography.labelSmall,
            color = if (highlight) extended.onWarningContainer else MaterialTheme.colorScheme.primary,
        )
        Spacer(Modifier.height(4.dp))
        Text(
            text = caption,
            style = MaterialTheme.typography.labelSmall,
            fontWeight = FontWeight.Normal,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

@Composable
private fun UpcomingPlanCard(plan: UpcomingEvent) {
    HueckoCard(
        modifier = Modifier.fillMaxWidth(),
        containerColor = MaterialTheme.colorScheme.surfaceContainer,
        borderColor = MaterialTheme.colorScheme.outlineVariant,
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            HueckoBadge(
                text = "CONFIRMADO",
                containerColor = MaterialTheme.colorScheme.primary,
                contentColor = MaterialTheme.colorScheme.onPrimary,
            )
            Spacer(Modifier.width(8.dp))
            Text(
                text = "${plan.diaLabel} - ${plan.rangoHorario}",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }

        Spacer(Modifier.height(10.dp))

        Text(
            text = plan.titulo,
            style = MaterialTheme.typography.headlineSmall,
            color = MaterialTheme.colorScheme.onSurface,
        )

        Spacer(Modifier.height(10.dp))

        IconLabel(Icons.Outlined.LocationOn, plan.lugar)
        Spacer(Modifier.height(4.dp))
        IconLabel(
            Icons.Outlined.Group,
            "${plan.asistentes.count { it.status != AttendeeStatus.NO_ASISTE }} asistentes confirmados",
        )

        Spacer(Modifier.height(14.dp))

        // Avatares solapados: la fila cabe en movil hasta cinco caras.
        Row(verticalAlignment = Alignment.CenterVertically) {
            plan.asistentes.take(5).forEachIndexed { index, asistente ->
                HueckoAvatar(
                    name = asistente.nombre,
                    color = MaterialTheme.colorScheme.secondary,
                    modifier = Modifier
                        .offset(x = (-8 * index).dp)
                        .border(2.dp, MaterialTheme.colorScheme.surfaceContainer, CircleShape),
                )
            }
            if (plan.asistentes.size > 5) {
                Text(
                    text = "+${plan.asistentes.size - 5}",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.offset(x = (-8 * 5 + 12).dp),
                )
            }
        }

        Spacer(Modifier.height(14.dp))

        PrimaryAction(
            text = "Ver detalles",
            icon = null,
            onClick = { },
            modifier = Modifier.fillMaxWidth(),
        )
    }
}

@Composable
private fun TodayScheduleCard(
    hoy: String,
    bloques: List<TimeBlock>,
    bloquesTotales: Int,
    onManage: () -> Unit,
) {
    HueckoCard(modifier = Modifier.fillMaxWidth()) {
        SectionHeader(
            title = "Mi horario de hoy",
            actionLabel = "Ver todo",
            onAction = onManage,
        )
        Spacer(Modifier.height(12.dp))

        if (bloques.isEmpty()) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(HueckoRadius.xxxl))
                    .background(MaterialTheme.colorScheme.surface)
                    .padding(20.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Icon(
                    Icons.Outlined.EventAvailable,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.size(28.dp),
                )
                Spacer(Modifier.height(8.dp))
                Text(
                    text = "No tienes clases ni actividades para hoy ($hoy)",
                    style = MaterialTheme.typography.titleSmall,
                    color = MaterialTheme.colorScheme.onSurface,
                )
                Spacer(Modifier.height(4.dp))
                Text(
                    text = "Tienes $bloquesTotales bloque(s) en tu horario semanal.",
                    style = MaterialTheme.typography.labelSmall,
                    fontWeight = FontWeight.Normal,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        } else {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                bloques.forEach { bloque -> ScheduleBlockRow(bloque) }
            }
        }
    }
}

@Composable
private fun ScheduleBlockRow(bloque: TimeBlock) {
    val extended = HueckoTheme.extended
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(HueckoRadius.xxxl))
            .background(MaterialTheme.colorScheme.surface)
            .border(
                1.dp,
                MaterialTheme.colorScheme.outlineVariant,
                RoundedCornerShape(HueckoRadius.xxxl),
            )
            .padding(horizontal = 14.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Row(
            modifier = Modifier.weight(1f),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Box(
                modifier = Modifier
                    .size(10.dp)
                    .clip(CircleShape)
                    .background(Color(bloque.colorArgb)),
            )
            Column {
                Text(
                    text = bloque.titulo,
                    style = MaterialTheme.typography.titleSmall,
                    color = MaterialTheme.colorScheme.onSurface,
                )
                Text(
                    text = bloque.rangoHorario,
                    style = MaterialTheme.typography.labelSmall,
                    fontWeight = FontWeight.Normal,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }

        val (etiqueta, fondo, texto) = when (bloque.tipo) {
            BlockType.LIBRE -> Triple("Hueco libre", extended.successContainer, extended.onSuccessContainer)
            BlockType.PUNTUAL -> Triple(
                "Puntual",
                MaterialTheme.colorScheme.secondaryContainer,
                MaterialTheme.colorScheme.onSecondaryContainer,
            )
            else -> Triple(
                "Ocupado",
                MaterialTheme.colorScheme.tertiaryContainer,
                MaterialTheme.colorScheme.onTertiaryContainer,
            )
        }
        HueckoBadge(text = etiqueta, containerColor = fondo, contentColor = texto)
    }
}

@Composable
private fun MyGroupsCard(grupos: List<GroupSummary>, onOpenGroups: () -> Unit) {
    HueckoCard(modifier = Modifier.fillMaxWidth()) {
        SectionHeader(
            title = "Mis grupos activos",
            actionLabel = "+ Nuevo grupo",
            onAction = onOpenGroups,
        )
        Spacer(Modifier.height(12.dp))

        if (grupos.isEmpty()) {
            EmptyState(
                icon = Icons.Outlined.GroupAdd,
                title = "Aun no tienes grupos registrados",
                description = "Crea uno o unete con un codigo para empezar a cruzar horarios.",
                actionLabel = "Crear o unirme",
                onAction = onOpenGroups,
            )
        } else {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                grupos.forEach { grupo ->
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(HueckoRadius.xxxl))
                            .background(MaterialTheme.colorScheme.surfaceContainer)
                            .border(
                                1.dp,
                                MaterialTheme.colorScheme.outlineVariant,
                                RoundedCornerShape(HueckoRadius.xxxl),
                            )
                            .clickable(onClick = onOpenGroups)
                            .padding(12.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        Box(
                            modifier = Modifier
                                .size(40.dp)
                                .clip(RoundedCornerShape(HueckoRadius.lg))
                                .background(Color(grupo.colorArgb)),
                            contentAlignment = Alignment.Center,
                        ) {
                            Text(
                                text = grupo.nombre.take(1).uppercase(),
                                style = MaterialTheme.typography.titleMedium,
                                color = Color.White,
                            )
                        }

                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                text = grupo.nombre,
                                style = MaterialTheme.typography.titleSmall,
                                color = MaterialTheme.colorScheme.onSurface,
                            )
                            Text(
                                text = "${grupo.miembros} miembros - Prox: ${grupo.proximaFranja}",
                                style = MaterialTheme.typography.labelSmall,
                                fontWeight = FontWeight.Normal,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }

                        HueckoBadge(
                            text = "${grupo.coincidenciaPorcentaje}% libre",
                            containerColor = MaterialTheme.colorScheme.surfaceContainerLowest,
                            contentColor = MaterialTheme.colorScheme.primary,
                            borderColor = MaterialTheme.colorScheme.outlineVariant,
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun PendingVoteCard(
    vote: PendingVote,
    userEmail: String,
    onVote: (String) -> Unit,
) {
    val extended = HueckoTheme.extended
    HueckoCard(modifier = Modifier.fillMaxWidth()) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.Top,
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = vote.groupName.uppercase(),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.primary,
                )
                Spacer(Modifier.height(2.dp))
                Text(
                    text = vote.proposal.titulo,
                    style = MaterialTheme.typography.titleLarge,
                    color = MaterialTheme.colorScheme.onSurface,
                )
                vote.proposal.lugar?.let {
                    Spacer(Modifier.height(2.dp))
                    IconLabel(Icons.Outlined.LocationOn, it)
                }
            }
            Spacer(Modifier.width(8.dp))
            HueckoBadge(
                text = vote.proposal.plazoVotacion,
                containerColor = extended.warningContainer,
                contentColor = extended.onWarningContainer,
            )
        }

        Spacer(Modifier.height(14.dp))

        Text(
            text = "Selecciona tu horario preferido:",
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )

        Spacer(Modifier.height(8.dp))

        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            vote.proposal.ventanasSugeridas.forEach { ventana ->
                VoteWindowRow(
                    ventana = ventana,
                    hasVoted = ventana.votosUsuarios.contains(userEmail),
                    onClick = { onVote(ventana.id) },
                )
            }
        }
    }
}

@Composable
private fun VoteWindowRow(
    ventana: TimeWindowProposal,
    hasVoted: Boolean,
    onClick: () -> Unit,
) {
    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(HueckoRadius.xxxl),
        color = if (hasVoted) {
            MaterialTheme.colorScheme.inversePrimary.copy(alpha = 0.35f)
        } else {
            MaterialTheme.colorScheme.surface
        },
        border = BorderStroke(
            1.dp,
            if (hasVoted) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outlineVariant,
        ),
        onClick = onClick,
    ) {
        Row(
            modifier = Modifier.padding(12.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Row(
                modifier = Modifier.weight(1f),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                Box(
                    modifier = Modifier
                        .size(20.dp)
                        .clip(CircleShape)
                        .background(
                            if (hasVoted) MaterialTheme.colorScheme.primary else Color.Transparent,
                        )
                        .border(1.dp, MaterialTheme.colorScheme.outlineVariant, CircleShape),
                    contentAlignment = Alignment.Center,
                ) {
                    if (hasVoted) {
                        Icon(
                            Icons.Filled.Check,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.onPrimary,
                            modifier = Modifier.size(14.dp),
                        )
                    }
                }
                Column {
                    Text(
                        text = "${ventana.dia.label} - ${ventana.rangoHorario}",
                        style = MaterialTheme.typography.titleSmall,
                        color = MaterialTheme.colorScheme.onSurface,
                    )
                    Text(
                        text = "${ventana.disponibilidadPorcentaje}% disponibilidad grupal",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.primary,
                    )
                }
            }

            val votos = ventana.votosUsuarios.size
            HueckoBadge(
                text = "$votos ${if (votos == 1) "voto" else "votos"}",
                containerColor = MaterialTheme.colorScheme.surfaceContainerLowest,
                contentColor = MaterialTheme.colorScheme.onSurfaceVariant,
                borderColor = MaterialTheme.colorScheme.outlineVariant,
            )
        }
    }
}

@Composable
private fun QuickActions(onCreateGroup: () -> Unit, onEditSchedule: () -> Unit) {
    HueckoCard(
        modifier = Modifier.fillMaxWidth(),
        containerColor = MaterialTheme.colorScheme.surfaceContainer,
    ) {
        Text(
            text = "Acciones rapidas",
            style = MaterialTheme.typography.titleSmall,
            color = MaterialTheme.colorScheme.onSurface,
        )
        Spacer(Modifier.height(12.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            QuickAction("Crear grupo", Icons.Outlined.GroupAdd, onCreateGroup, Modifier.weight(1f))
            QuickAction("Ajustar horario", Icons.Outlined.EditCalendar, onEditSchedule, Modifier.weight(1f))
            QuickAction("Tutorial", Icons.Outlined.School, onEditSchedule, Modifier.weight(1f))
        }
    }
}

@Composable
private fun QuickAction(
    text: String,
    icon: ImageVector,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Surface(
        modifier = modifier,
        shape = RoundedCornerShape(HueckoRadius.xxxl),
        color = MaterialTheme.colorScheme.surfaceContainerLowest,
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
        onClick = onClick,
    ) {
        Column(
            modifier = Modifier.padding(vertical = 14.dp, horizontal = 6.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Icon(
                icon,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.primary,
                modifier = Modifier.size(22.dp),
            )
            Spacer(Modifier.height(6.dp))
            Text(
                text = text,
                style = MaterialTheme.typography.labelSmall,
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.onSurface,
            )
        }
    }
}

// ------------------------------------------------------------ utilidades UI

@Composable
private fun IconLabel(icon: ImageVector, text: String) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Icon(
            icon,
            contentDescription = null,
            tint = MaterialTheme.colorScheme.primary,
            modifier = Modifier.size(16.dp),
        )
        Text(
            text = text,
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

@Composable
internal fun PrimaryAction(
    text: String,
    icon: ImageVector?,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Button(
        onClick = onClick,
        modifier = modifier.height(46.dp),
        shape = RoundedCornerShape(HueckoRadius.xxl),
        colors = ButtonDefaults.buttonColors(
            containerColor = MaterialTheme.colorScheme.primary,
            contentColor = MaterialTheme.colorScheme.onPrimary,
        ),
        contentPadding = PaddingValues(horizontal = 12.dp),
    ) {
        if (icon != null) {
            Icon(icon, contentDescription = null, modifier = Modifier.size(18.dp))
            Spacer(Modifier.width(6.dp))
        }
        Text(text, style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.Bold)
    }
}

@Composable
internal fun SecondaryAction(
    text: String,
    icon: ImageVector?,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Surface(
        modifier = modifier.height(46.dp),
        shape = RoundedCornerShape(HueckoRadius.xxl),
        color = MaterialTheme.colorScheme.surfaceContainer,
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
        onClick = onClick,
    ) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.Center,
        ) {
            if (icon != null) {
                Icon(
                    icon,
                    contentDescription = null,
                    tint = HueckoTheme.extended.primaryHover,
                    modifier = Modifier.size(18.dp),
                )
                Spacer(Modifier.width(6.dp))
            }
            Text(
                text = text,
                style = MaterialTheme.typography.labelMedium,
                fontWeight = FontWeight.Bold,
                color = HueckoTheme.extended.primaryHover,
            )
        }
    }
}
