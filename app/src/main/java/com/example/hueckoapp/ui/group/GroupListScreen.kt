package com.example.hueckoapp.ui.group

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.ContentCopy
import androidx.compose.material.icons.outlined.EventBusy
import androidx.compose.material.icons.outlined.GroupAdd
import androidx.compose.material.icons.outlined.Groups
import androidx.compose.material.icons.outlined.Key
import androidx.compose.material.icons.outlined.Star
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Snackbar
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalClipboard
import androidx.compose.ui.platform.ClipEntry
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import kotlinx.coroutines.launch
import com.example.hueckoapp.domain.model.DayOfWeek
import com.example.hueckoapp.domain.model.Group
import com.example.hueckoapp.domain.model.MatchWindow
import com.example.hueckoapp.domain.model.PlanProposal
import com.example.hueckoapp.domain.model.ProposalState
import com.example.hueckoapp.domain.model.TimeWindowProposal
import com.example.hueckoapp.domain.model.User
import com.example.hueckoapp.ui.components.EmptyState
import com.example.hueckoapp.ui.components.HueckoAvatar
import com.example.hueckoapp.ui.components.HueckoBadge
import com.example.hueckoapp.ui.components.HueckoCard
import com.example.hueckoapp.ui.components.HueckoDaySelector
import com.example.hueckoapp.ui.components.PrimaryAction
import com.example.hueckoapp.ui.components.SecondaryAction
import com.example.hueckoapp.ui.components.SectionHeader
import com.example.hueckoapp.ui.theme.HueckoRadius
import com.example.hueckoapp.ui.theme.categoryColorByIndex

/**
 * Mis grupos y horario en comun.
 *
 * La agenda semanal no se pinta como rejilla de siete columnas por doce horas:
 * a 360dp cada celda quedaria en 45dp y no cabria ni la hora. En su lugar hay
 * un selector de dia y la lista de franjas de ese dia, que es la informacion
 * que de verdad se busca.
 *
 * El panel de un grupo se despliega pegado a su tarjeta, no al final de la
 * pantalla: si apareciera abajo, pulsar "Ver horario" dejaria el resultado a
 * dos pantallas de scroll del grupo que lo abrio.
 */
@Composable
fun GroupListScreen(
    viewModel: GroupViewModel,
    planningViewModel: GroupPlanningViewModel,
    modifier: Modifier = Modifier,
) {
    val groups by viewModel.groups.collectAsStateWithLifecycle()
    val planning by planningViewModel.state.collectAsStateWithLifecycle()
    val clipboard = LocalClipboard.current
    val scope = rememberCoroutineScope()

    var openGroupId by remember { mutableStateOf<String?>(null) }
    var selectedDay by remember { mutableStateOf(DayOfWeek.LUN) }
    var showCreateDialog by remember { mutableStateOf(false) }
    var showJoinDialog by remember { mutableStateOf(false) }

    Box(modifier = modifier.fillMaxSize()) {
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .background(MaterialTheme.colorScheme.surface),
            contentPadding = PaddingValues(horizontal = 16.dp, vertical = 20.dp),
            verticalArrangement = Arrangement.spacedBy(20.dp),
        ) {
            item {
                Header(
                    onJoin = { showJoinDialog = true },
                    onCreate = { showCreateDialog = true },
                )
            }

            if (groups.isEmpty()) {
                item {
                    EmptyState(
                        icon = Icons.Outlined.Groups,
                        title = "Aún no tienes ningún grupo",
                        description = "Crea uno para invitar a tus compañeros, o únete con el código que te hayan pasado.",
                        actionLabel = "Crear mi primer grupo",
                        onAction = { showCreateDialog = true },
                    )
                }
            } else {
                items(groups, key = { it.id }) { group ->
                    val isOpen = openGroupId == group.id
                    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        GroupCard(
                            group = group,
                            isOpen = isOpen,
                            onCopyCode = {
                                scope.launch {
                                    clipboard.setClipEntry(
                                        ClipEntry(
                                            android.content.ClipData.newPlainText(
                                                "Código de invitación",
                                                group.inviteCode,
                                            ),
                                        ),
                                    )
                                }
                                planningViewModel.notifyCodeCopied(group.inviteCode)
                            },
                            // Abrir un grupo cierra el anterior: dos paneles
                            // abiertos a la vez obligan a buscar a ciegas.
                            onToggle = { openGroupId = if (isOpen) null else group.id },
                        )

                        AnimatedVisibility(visible = isOpen) {
                            GroupPanel(
                                group = group,
                                proposals = planningViewModel.proposalsOf(group.id),
                                userEmail = planning.userEmail,
                                selectedDay = selectedDay,
                                onSelectDay = { selectedDay = it },
                                windowsFor = { day -> planningViewModel.windowsFor(group, day) },
                                onVote = { windowId, proposalId ->
                                    planningViewModel.vote(proposalId, windowId)
                                },
                            )
                        }
                    }
                }
            }
        }

        AnimatedVisibility(
            visible = planning.toast != null,
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .padding(16.dp),
        ) {
            Snackbar(
                shape = RoundedCornerShape(HueckoRadius.xxl),
                containerColor = MaterialTheme.colorScheme.inverseSurface,
                contentColor = MaterialTheme.colorScheme.inverseOnSurface,
            ) {
                Text(planning.toast.orEmpty(), style = MaterialTheme.typography.bodyMedium)
            }
        }
    }

    // Los dialogos de alta ya existian y hablan con GroupViewModel; se
    // reutilizan tal cual en lugar de duplicar el formulario.
    if (showCreateDialog) {
        CreateGroupDialog(viewModel = viewModel, onDismiss = { showCreateDialog = false })
    }
    if (showJoinDialog) {
        JoinGroupDialog(viewModel = viewModel, onDismiss = { showJoinDialog = false })
    }
}

@Composable
private fun Header(onJoin: () -> Unit, onCreate: () -> Unit) {
    Column {
        Text(
            text = "Mis grupos",
            style = MaterialTheme.typography.headlineLarge,
            color = MaterialTheme.colorScheme.onSurface,
        )
        Spacer(Modifier.height(6.dp))
        Text(
            text = "Consulta a quién tienes en cada grupo y en qué franjas coincidís todos.",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(Modifier.height(16.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            SecondaryAction(
                text = "Unirme",
                icon = Icons.Outlined.Key,
                onClick = onJoin,
                modifier = Modifier.weight(1f),
            )
            PrimaryAction(
                text = "Crear grupo",
                icon = Icons.Outlined.GroupAdd,
                onClick = onCreate,
                modifier = Modifier.weight(1f),
            )
        }
    }
}

@Composable
private fun GroupCard(
    group: Group,
    isOpen: Boolean,
    onCopyCode: () -> Unit,
    onToggle: () -> Unit,
) {
    HueckoCard(
        modifier = Modifier.fillMaxWidth(),
        borderColor = if (isOpen) {
            MaterialTheme.colorScheme.primary
        } else {
            MaterialTheme.colorScheme.outlineVariant
        },
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.Top,
        ) {
            Text(
                text = group.name,
                style = MaterialTheme.typography.headlineSmall,
                color = MaterialTheme.colorScheme.onSurface,
                modifier = Modifier.weight(1f),
            )
            Spacer(Modifier.width(8.dp))
            HueckoBadge(
                text = "Umbral ${group.availabilityThreshold}%",
                containerColor = MaterialTheme.colorScheme.secondaryContainer,
                contentColor = MaterialTheme.colorScheme.onSecondaryContainer,
            )
        }

        if (group.description.isNotBlank()) {
            Spacer(Modifier.height(8.dp))
            Text(
                text = group.description,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }

        Spacer(Modifier.height(14.dp))
        InviteCodeRow(code = group.inviteCode, onCopy = onCopyCode)

        Spacer(Modifier.height(16.dp))
        Text(
            text = "Miembros (${group.members.size})",
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(Modifier.height(8.dp))
        MemberChips(group.members)

        Spacer(Modifier.height(16.dp))
        PrimaryAction(
            text = if (isOpen) "Ocultar horario común" else "Ver horario común",
            icon = null,
            onClick = onToggle,
            modifier = Modifier.fillMaxWidth(),
        )
    }
}

/**
 * Codigo de invitacion. Todo el bloque es pulsable y no solo la palabra
 * "Copiar": es la unica accion de la fila, y un objetivo estrecho se falla con
 * el pulgar.
 */
@Composable
private fun InviteCodeRow(code: String, onCopy: () -> Unit) {
    Surface(
        onClick = onCopy,
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(min = 48.dp),
        shape = RoundedCornerShape(HueckoRadius.xxl),
        color = MaterialTheme.colorScheme.surfaceContainer,
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 14.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Icon(
                Icons.Outlined.Key,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.size(18.dp),
            )
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = "Código de invitación",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Text(
                    text = code,
                    style = MaterialTheme.typography.titleMedium,
                    color = MaterialTheme.colorScheme.onSurface,
                )
            }
            Icon(
                Icons.Outlined.ContentCopy,
                contentDescription = "Copiar código",
                tint = MaterialTheme.colorScheme.primary,
                modifier = Modifier.size(20.dp),
            )
        }
    }
}

@Composable
private fun MemberChips(members: List<User>) {
    FlowRow(
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        members.forEachIndexed { index, member ->
            Surface(
                shape = RoundedCornerShape(HueckoRadius.xxl),
                color = MaterialTheme.colorScheme.surfaceContainer,
            ) {
                Row(
                    modifier = Modifier.padding(horizontal = 8.dp, vertical = 6.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    HueckoAvatar(
                        name = member.name,
                        color = categoryColorByIndex(index),
                        size = 24.dp,
                    )
                    Text(
                        text = member.name,
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurface,
                    )
                    if (member.isEssential) {
                        Icon(
                            Icons.Outlined.Star,
                            contentDescription = "Imprescindible",
                            tint = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.size(16.dp),
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun GroupPanel(
    group: Group,
    proposals: List<PlanProposal>,
    userEmail: String,
    selectedDay: DayOfWeek,
    onSelectDay: (DayOfWeek) -> Unit,
    windowsFor: (DayOfWeek) -> List<MatchWindow>,
    onVote: (windowId: String, proposalId: String) -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
        HueckoCard(modifier = Modifier.fillMaxWidth()) {
            SectionHeader(title = "Planes propuestos")
            Spacer(Modifier.height(14.dp))

            if (proposals.isEmpty()) {
                Text(
                    text = "Nadie ha propuesto un plan en este grupo todavía.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            } else {
                Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
                    proposals.forEach { proposal ->
                        ProposalBlock(
                            proposal = proposal,
                            userEmail = userEmail,
                            onVote = { windowId -> onVote(windowId, proposal.id) },
                        )
                    }
                }
            }
        }

        HueckoCard(modifier = Modifier.fillMaxWidth()) {
            SectionHeader(
                title = "Horario en común",
                subtitle = "${group.members.size} integrantes · mínimo ${group.availabilityThreshold}%",
            )
            Spacer(Modifier.height(14.dp))

            HueckoDaySelector(
                selected = selectedDay,
                captionFor = { day ->
                    val count = windowsFor(day).size
                    if (count == 0) "sin hueco" else count.toString()
                },
                onSelect = onSelectDay,
            )

            Spacer(Modifier.height(16.dp))

            val windows = windowsFor(selectedDay)
            if (windows.isEmpty()) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    Icon(
                        Icons.Outlined.EventBusy,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.size(22.dp),
                    )
                    Text(
                        text = "Ninguna franja del ${selectedDay.label} llega al ${group.availabilityThreshold}% del grupo.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            } else {
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    windows.forEach { window ->
                        MatchWindowRow(window, group.members.size)
                    }
                }
            }
        }
    }
}

@Composable
private fun MatchWindowRow(window: MatchWindow, totalMembers: Int) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Box(
            modifier = Modifier
                .size(8.dp)
                .background(MaterialTheme.colorScheme.primary, CircleShape),
        )
        Text(
            text = window.timeRange,
            style = MaterialTheme.typography.titleMedium,
            color = MaterialTheme.colorScheme.onSurface,
            modifier = Modifier.weight(1f),
        )
        Text(
            text = "${window.freeMembers} de $totalMembers libres",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

@Composable
private fun ProposalBlock(
    proposal: PlanProposal,
    userEmail: String,
    onVote: (String) -> Unit,
) {
    Column {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.Top,
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = proposal.title,
                    style = MaterialTheme.typography.titleMedium,
                    color = MaterialTheme.colorScheme.onSurface,
                )
                proposal.location?.let {
                    Text(
                        text = it,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
            Spacer(Modifier.width(8.dp))

            val (label, container, content) = when (proposal.state) {
                ProposalState.CONFIRMADO -> Triple(
                    "Confirmado",
                    MaterialTheme.colorScheme.primaryContainer,
                    MaterialTheme.colorScheme.onPrimaryContainer,
                )
                ProposalState.EN_RECOORDINACION -> Triple(
                    "Re-coordinando",
                    MaterialTheme.colorScheme.tertiaryContainer,
                    MaterialTheme.colorScheme.onTertiaryContainer,
                )
                else -> Triple(
                    "En votación",
                    MaterialTheme.colorScheme.secondaryContainer,
                    MaterialTheme.colorScheme.onSecondaryContainer,
                )
            }
            HueckoBadge(text = label, containerColor = container, contentColor = content)
        }

        Spacer(Modifier.height(10.dp))

        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            proposal.suggestedWindows.forEach { window ->
                WindowOption(
                    window = window,
                    hasVoted = userEmail in window.voterEmails,
                    enabled = proposal.state == ProposalState.PROPUESTO,
                    onClick = { onVote(window.id) },
                )
            }
        }
    }
}

/**
 * Opcion votable. Un plan ya confirmado se muestra pero no se puede votar: el
 * boton deshabilitado explica por que la fila sigue ahi, cosa que ocultarla no
 * haria.
 */
@Composable
private fun WindowOption(
    window: TimeWindowProposal,
    hasVoted: Boolean,
    enabled: Boolean,
    onClick: () -> Unit,
) {
    Surface(
        onClick = onClick,
        enabled = enabled,
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(min = 48.dp),
        shape = RoundedCornerShape(HueckoRadius.xxl),
        color = if (hasVoted) {
            MaterialTheme.colorScheme.primaryContainer
        } else {
            MaterialTheme.colorScheme.surfaceContainer
        },
        border = if (hasVoted) {
            BorderStroke(2.dp, MaterialTheme.colorScheme.primary)
        } else {
            null
        },
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 14.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = "${window.day.label} · ${window.timeRange}",
                    style = MaterialTheme.typography.titleSmall,
                    color = MaterialTheme.colorScheme.onSurface,
                )
                Text(
                    text = "${window.availabilityPercentage}% disponible" +
                        if (hasVoted) " · tu voto" else "",
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
