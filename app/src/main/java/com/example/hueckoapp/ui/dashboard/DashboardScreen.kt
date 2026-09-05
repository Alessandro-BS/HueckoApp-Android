package com.example.hueckoapp.ui.dashboard

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.CalendarMonth
import androidx.compose.material.icons.outlined.Check
import androidx.compose.material.icons.outlined.EditCalendar
import androidx.compose.material.icons.outlined.EventAvailable
import androidx.compose.material.icons.outlined.EventBusy
import androidx.compose.material.icons.outlined.Groups
import androidx.compose.material.icons.outlined.GroupAdd
import androidx.compose.material.icons.outlined.HowToVote
import androidx.compose.material.icons.outlined.Place
import androidx.compose.material.icons.outlined.Schedule
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Snackbar
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.example.hueckoapp.domain.model.AttendeeStatus
import com.example.hueckoapp.domain.model.BlockType
import com.example.hueckoapp.domain.model.TimeBlock
import com.example.hueckoapp.domain.model.TimeWindowProposal
import com.example.hueckoapp.domain.model.UpcomingEvent
import com.example.hueckoapp.ui.components.EmptyState
import com.example.hueckoapp.ui.components.HueckoAvatar
import com.example.hueckoapp.ui.components.HueckoBadge
import com.example.hueckoapp.ui.components.HueckoCard
import com.example.hueckoapp.ui.components.PrimaryAction
import com.example.hueckoapp.ui.components.SecondaryAction
import com.example.hueckoapp.ui.components.SectionHeader
import com.example.hueckoapp.ui.theme.HueckoRadius
import com.example.hueckoapp.ui.theme.HueckoTheme
import com.example.hueckoapp.ui.theme.categoryColorByIndex

/**
 * Inicio.
 *
 * Una sola columna, en el orden en que hacen falta las cosas: que pasa hoy,
 * que esta decidido, que sigue abierto. Las metricas van en dos columnas, que
 * es el maximo que cabe legible a 360dp de ancho.
 *
 * La jerarquia se apoya en el color y el espacio, no en sombras ni
 * degradados: las tarjetas son superficie plana con un borde de 1dp.
 */
@Composable
fun DashboardScreen(
    viewModel: DashboardViewModel,
    onNavigateToSchedule: () -> Unit,
    onNavigateToGroups: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()

    Box(modifier = modifier.fillMaxSize()) {
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .background(MaterialTheme.colorScheme.surface),
            contentPadding = PaddingValues(horizontal = 16.dp, vertical = 20.dp),
            verticalArrangement = Arrangement.spacedBy(24.dp),
        ) {
            item { GreetingHeader(state) }

            state.expressAlert?.let { alert ->
                item {
                    ExpressVoteCard(
                        alert = alert,
                        chosen = state.expressChoice,
                        onVote = viewModel::submitExpressVote,
                    )
                }
            }

            item { MetricsGrid(state, onNavigateToGroups, onNavigateToSchedule) }

            item {
                Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    SectionHeader(title = "Próximo plan confirmado")
                    val plan = state.upcomingEvent
                    if (plan != null) {
                        UpcomingPlanCard(plan)
                    } else {
                        EmptyState(
                            icon = Icons.Outlined.EventBusy,
                            title = "Sin planes confirmados",
                            description = "Propón un plan en tus grupos y Huecko sugerirá los mejores horarios.",
                            actionLabel = "Ir a mis grupos",
                            onAction = onNavigateToGroups,
                        )
                    }
                }
            }

            item {
                TodayScheduleCard(
                    today = state.today.label,
                    blocks = state.todayBlocks,
                    totalBlocks = state.totalBlocks,
                    onManage = onNavigateToSchedule,
                )
            }

            item { MyGroupsCard(state.groups, onNavigateToGroups) }

            item {
                SectionHeader(
                    title = "Votaciones en curso",
                    subtitle = "Opciones generadas a partir de la disponibilidad del grupo.",
                )
            }

            if (state.pendingVotes.isEmpty()) {
                item {
                    EmptyState(
                        icon = Icons.Outlined.HowToVote,
                        title = "No hay votaciones activas",
                        description = "Cuando alguien proponga un plan podrás elegir aquí tu franja preferida.",
                        actionLabel = "Ver grupos",
                        onAction = onNavigateToGroups,
                    )
                }
            } else {
                items(state.pendingVotes, key = { it.proposal.id }) { vote ->
                    PendingVoteCard(
                        vote = vote,
                        userEmail = state.userEmail,
                        onVote = { windowId -> viewModel.vote(vote.proposal.id, windowId) },
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
                Text(state.toast.orEmpty(), style = MaterialTheme.typography.bodyMedium)
            }
        }
    }
}

@Composable
private fun GreetingHeader(state: DashboardUiState) {
    Column {
        Text(
            text = state.longDate,
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(Modifier.height(4.dp))
        Text(
            text = if (state.name.isBlank()) {
                state.greeting
            } else {
                "${state.greeting}, ${state.name}"
            },
            style = MaterialTheme.typography.headlineLarge,
            color = MaterialTheme.colorScheme.onSurface,
        )
        Spacer(Modifier.height(6.dp))
        Text(
            text = "Esto es lo que pasa hoy en tus grupos y horarios.",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

/**
 * Aviso de baja critica con votacion expres (HU-14).
 *
 * Los tres botones ocupan una fila propia y a ancho repartido: junto al texto,
 * "Reprogramar" se partiria en dos lineas a 360dp.
 */
@Composable
private fun ExpressVoteCard(
    alert: ExpressVoteAlert,
    chosen: ExpressVoteChoice?,
    onVote: (ExpressVoteChoice) -> Unit,
) {
    val extended = HueckoTheme.extended
    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(HueckoRadius.card),
        color = extended.warningContainer,
        border = BorderStroke(1.dp, extended.warning.copy(alpha = 0.35f)),
    ) {
        Column(modifier = Modifier.padding(18.dp)) {
            Text(
                text = "Votación exprés",
                style = MaterialTheme.typography.labelMedium,
                color = extended.onWarningContainer,
            )
            Spacer(Modifier.height(8.dp))
            Text(
                text = "${alert.who} no podrá asistir a «${alert.planTitle}»",
                style = MaterialTheme.typography.titleMedium,
                color = MaterialTheme.colorScheme.onSurface,
            )
            Spacer(Modifier.height(4.dp))
            Text(
                text = alert.reason,
                style = MaterialTheme.typography.bodySmall,
                color = extended.onWarningContainer,
            )

            Spacer(Modifier.height(16.dp))

            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                ExpressVoteChoice.entries.forEach { choice ->
                    ExpressVoteButton(
                        choice = choice,
                        selected = chosen == choice,
                        onClick = onVote,
                        modifier = Modifier.weight(1f),
                    )
                }
            }
        }
    }
}

@Composable
private fun ExpressVoteButton(
    choice: ExpressVoteChoice,
    selected: Boolean,
    onClick: (ExpressVoteChoice) -> Unit,
    modifier: Modifier = Modifier,
) {
    Surface(
        modifier = modifier.height(48.dp),
        shape = RoundedCornerShape(HueckoRadius.xxl),
        color = if (selected) {
            MaterialTheme.colorScheme.primary
        } else {
            MaterialTheme.colorScheme.surfaceContainerLowest
        },
        border = if (selected) null else BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
        onClick = { onClick(choice) },
    ) {
        Box(contentAlignment = Alignment.Center) {
            Text(
                text = choice.label,
                style = MaterialTheme.typography.labelMedium,
                color = if (selected) {
                    MaterialTheme.colorScheme.onPrimary
                } else {
                    MaterialTheme.colorScheme.onSurface
                },
            )
        }
    }
}

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
                value = state.activeGroups.toString(),
                caption = "Con disponibilidad sincronizada",
                icon = Icons.Outlined.Groups,
                onClick = onOpenGroups,
                modifier = Modifier.weight(1f),
            )
            MetricCard(
                label = "Votaciones abiertas",
                value = state.openVotes.toString(),
                caption = "Planes pendientes de hora",
                icon = Icons.Outlined.HowToVote,
                onClick = onOpenGroups,
                modifier = Modifier.weight(1f),
            )
        }
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            MetricCard(
                label = "Horas coincidentes",
                value = "${state.matchingHours} h",
                caption = "Donde coincide el 80% o más",
                icon = Icons.Outlined.Schedule,
                onClick = onOpenSchedule,
                modifier = Modifier.weight(1f),
            )
            MetricCard(
                label = "Mi horario",
                value = state.totalBlocks.toString(),
                caption = "Bloques registrados",
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
    caption: String,
    icon: ImageVector,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    HueckoCard(
        modifier = modifier,
        contentPadding = PaddingValues(16.dp),
        onClick = onClick,
    ) {
        Icon(
            icon,
            contentDescription = null,
            tint = MaterialTheme.colorScheme.primary,
            modifier = Modifier.size(20.dp),
        )
        Spacer(Modifier.height(12.dp))
        Text(
            text = value,
            style = MaterialTheme.typography.displaySmall,
            color = MaterialTheme.colorScheme.onSurface,
        )
        Text(
            text = label,
            style = MaterialTheme.typography.titleSmall,
            color = MaterialTheme.colorScheme.onSurface,
        )
        Spacer(Modifier.height(2.dp))
        Text(
            text = caption,
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

@Composable
private fun UpcomingPlanCard(plan: UpcomingEvent) {
    HueckoCard(
        modifier = Modifier.fillMaxWidth(),
        containerColor = MaterialTheme.colorScheme.primaryContainer,
        borderColor = MaterialTheme.colorScheme.primaryContainer,
    ) {
        Text(
            text = "${plan.dayLabel} · ${plan.timeRange}",
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onPrimaryContainer,
        )
        Spacer(Modifier.height(6.dp))
        Text(
            text = plan.title,
            style = MaterialTheme.typography.headlineSmall,
            color = MaterialTheme.colorScheme.onPrimaryContainer,
        )
        Spacer(Modifier.height(12.dp))

        IconLabel(Icons.Outlined.Place, plan.location, MaterialTheme.colorScheme.onPrimaryContainer)
        Spacer(Modifier.height(4.dp))
        IconLabel(
            Icons.Outlined.Groups,
            "${plan.attendees.count { it.status != AttendeeStatus.NO_ASISTE }} de ${plan.attendees.size} asistirán",
            MaterialTheme.colorScheme.onPrimaryContainer,
        )

        Spacer(Modifier.height(16.dp))

        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            plan.attendees.take(6).forEachIndexed { index, attendee ->
                HueckoAvatar(
                    name = attendee.name,
                    color = categoryColorByIndex(index),
                    contentDescription = attendee.name,
                )
            }
        }
    }
}

@Composable
private fun TodayScheduleCard(
    today: String,
    blocks: List<TimeBlock>,
    totalBlocks: Int,
    onManage: () -> Unit,
) {
    HueckoCard(modifier = Modifier.fillMaxWidth()) {
        SectionHeader(
            title = "Mi horario de hoy",
            actionLabel = "Ver todo",
            onAction = onManage,
        )
        Spacer(Modifier.height(14.dp))

        if (blocks.isEmpty()) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Icon(
                    Icons.Outlined.EventAvailable,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.size(22.dp),
                )
                Column {
                    Text(
                        text = "Nada en la agenda para hoy ($today)",
                        style = MaterialTheme.typography.titleSmall,
                        color = MaterialTheme.colorScheme.onSurface,
                    )
                    Text(
                        text = "Tienes $totalBlocks bloque(s) en la semana.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        } else {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                blocks.forEachIndexed { index, block -> ScheduleBlockRow(block, index) }
            }
        }
    }
}

@Composable
private fun ScheduleBlockRow(block: TimeBlock, index: Int) {
    val extended = HueckoTheme.extended
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Box(
            modifier = Modifier
                .size(10.dp)
                .background(categoryColorByIndex(index), CircleShape),
        )
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = block.label,
                style = MaterialTheme.typography.titleSmall,
                color = MaterialTheme.colorScheme.onSurface,
            )
            Text(
                text = block.timeRange,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }

        val (label, container, content) = when (block.type) {
            BlockType.LIBRE -> Triple("Libre", extended.successContainer, extended.onSuccessContainer)
            BlockType.PUNTUAL -> Triple(
                "Puntual",
                MaterialTheme.colorScheme.secondaryContainer,
                MaterialTheme.colorScheme.onSecondaryContainer,
            )
            else -> Triple(
                "Ocupado",
                MaterialTheme.colorScheme.surfaceContainerHigh,
                MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        HueckoBadge(text = label, containerColor = container, contentColor = content)
    }
}

@Composable
private fun MyGroupsCard(groups: List<GroupSummary>, onOpenGroups: () -> Unit) {
    HueckoCard(modifier = Modifier.fillMaxWidth()) {
        SectionHeader(
            title = "Mis grupos",
            actionLabel = "Gestionar",
            onAction = onOpenGroups,
        )
        Spacer(Modifier.height(14.dp))

        if (groups.isEmpty()) {
            Text(
                text = "Todavía no perteneces a ningún grupo.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        } else {
            Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
                groups.forEachIndexed { index, group ->
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        HueckoAvatar(
                            name = group.name,
                            color = categoryColorByIndex(index),
                            size = 40.dp,
                        )
                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                text = group.name,
                                style = MaterialTheme.typography.titleSmall,
                                color = MaterialTheme.colorScheme.onSurface,
                            )
                            Text(
                                text = "${group.memberCount} miembros · ${group.nextSlot}",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                        HueckoBadge(
                            text = "${group.matchPercentage}%",
                            containerColor = MaterialTheme.colorScheme.primaryContainer,
                            contentColor = MaterialTheme.colorScheme.onPrimaryContainer,
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
    HueckoCard(modifier = Modifier.fillMaxWidth()) {
        Text(
            text = vote.groupName,
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.primary,
        )
        Spacer(Modifier.height(4.dp))
        Text(
            text = vote.proposal.title,
            style = MaterialTheme.typography.titleLarge,
            color = MaterialTheme.colorScheme.onSurface,
        )
        Spacer(Modifier.height(2.dp))
        Text(
            text = vote.proposal.votingDeadline,
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )

        Spacer(Modifier.height(16.dp))

        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            vote.proposal.suggestedWindows.forEach { window ->
                VoteWindowRow(
                    window = window,
                    hasVoted = userEmail in window.voterEmails,
                    onClick = { onVote(window.id) },
                )
            }
        }
    }
}

/**
 * Opcion de horario votable.
 *
 * El estado elegido se marca con el color del borde y una casilla, no solo con
 * un tono de fondo: quien no distingue bien los colores necesita una segunda
 * senal para saber que ya voto.
 */
@Composable
private fun VoteWindowRow(
    window: TimeWindowProposal,
    hasVoted: Boolean,
    onClick: () -> Unit,
) {
    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(HueckoRadius.xxl),
        color = if (hasVoted) {
            MaterialTheme.colorScheme.primaryContainer
        } else {
            MaterialTheme.colorScheme.surface
        },
        border = BorderStroke(
            if (hasVoted) 2.dp else 1.dp,
            if (hasVoted) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outlineVariant,
        ),
        onClick = onClick,
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 14.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Box(
                modifier = Modifier.size(20.dp),
                contentAlignment = Alignment.Center,
            ) {
                if (hasVoted) {
                    Icon(
                        Icons.Outlined.Check,
                        contentDescription = "Tu voto",
                        tint = MaterialTheme.colorScheme.primary,
                        modifier = Modifier.size(20.dp),
                    )
                }
            }

            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = "${window.day.label} · ${window.timeRange}",
                    style = MaterialTheme.typography.titleSmall,
                    color = MaterialTheme.colorScheme.onSurface,
                )
                Text(
                    text = "${window.availabilityPercentage}% del grupo disponible",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }

            val votes = window.voterEmails.size
            Text(
                text = "$votes ${if (votes == 1) "voto" else "votos"}",
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
private fun QuickActions(onCreateGroup: () -> Unit, onEditSchedule: () -> Unit) {
    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        SecondaryAction(
            text = "Nuevo grupo",
            icon = Icons.Outlined.GroupAdd,
            onClick = onCreateGroup,
            modifier = Modifier.weight(1f),
        )
        PrimaryAction(
            text = "Editar horario",
            icon = Icons.Outlined.EditCalendar,
            onClick = onEditSchedule,
            modifier = Modifier.weight(1f),
        )
    }
}

@Composable
private fun IconLabel(icon: ImageVector, text: String, tint: Color) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Icon(icon, contentDescription = null, tint = tint, modifier = Modifier.size(16.dp))
        Text(text = text, style = MaterialTheme.typography.bodyMedium, color = tint)
    }
}

