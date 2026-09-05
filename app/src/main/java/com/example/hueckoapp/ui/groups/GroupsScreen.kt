package com.example.hueckoapp.ui.groups

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Campaign
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.GridView
import androidx.compose.material.icons.filled.GroupAdd
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.outlined.EventBusy
import androidx.compose.material.icons.outlined.Groups
import androidx.compose.material.icons.outlined.HowToVote
import androidx.compose.material.icons.outlined.Key
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Slider
import androidx.compose.material3.Snackbar
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.example.hueckoapp.domain.model.DayOfWeek
import com.example.hueckoapp.domain.model.Group
import com.example.hueckoapp.domain.model.GroupMember
import com.example.hueckoapp.domain.model.MatchWindow
import com.example.hueckoapp.domain.model.PlanProposal
import com.example.hueckoapp.domain.model.ProposalState
import com.example.hueckoapp.ui.components.EmptyState
import com.example.hueckoapp.ui.components.HueckoBadge
import com.example.hueckoapp.ui.components.HueckoCard
import com.example.hueckoapp.ui.dashboard.PrimaryAction
import com.example.hueckoapp.ui.dashboard.SecondaryAction
import com.example.hueckoapp.ui.theme.HueckoRadius
import com.example.hueckoapp.ui.theme.HueckoTheme

/**
 * Mis grupos y horario en comun.
 *
 * Traduce `GroupsPage.tsx` quedandose con su rama movil: la rejilla de siete
 * columnas de la agenda se sustituye por un selector de dia mas la lista de
 * franjas de ese dia, que es exactamente lo que hace la web por debajo de
 * `md:`. El panel del grupo se despliega pegado a su tarjeta y no al final de
 * la pantalla, para no dejarlo a dos pantallas de distancia del grupo que lo
 * abrio.
 */
@Composable
fun GroupsScreen(
    modifier: Modifier = Modifier,
    viewModel: GroupsViewModel = viewModel(),
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    val clipboard = LocalClipboardManager.current

    Box(modifier = modifier.fillMaxWidth()) {
        LazyColumn(
            modifier = Modifier
                .fillMaxWidth()
                .background(MaterialTheme.colorScheme.surface),
            contentPadding = PaddingValues(horizontal = 16.dp, vertical = 20.dp),
            verticalArrangement = Arrangement.spacedBy(20.dp),
        ) {
            item {
                GroupsHeader(
                    onJoin = viewModel::openJoinDialog,
                    onCreate = viewModel::openCreateDialog,
                )
            }

            if (state.grupos.isEmpty()) {
                item {
                    EmptyState(
                        icon = Icons.Outlined.Groups,
                        title = "Aun no tienes ningun grupo",
                        description = "Crea tu primer grupo para invitar a tus amigos o companeros y ver su coincidencia horaria.",
                        actionLabel = "Crear mi primer grupo",
                        onAction = viewModel::openCreateDialog,
                    )
                }
            } else {
                items(state.grupos, key = { it.id }) { grupo ->
                    val abierto = state.grupoAbiertoId == grupo.id
                    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        GroupCard(
                            grupo = grupo,
                            abierto = abierto,
                            codigoCopiado = state.codigoCopiado == grupo.codigoInvitacion,
                            onCopyCode = {
                                clipboard.setText(AnnotatedString(grupo.codigoInvitacion))
                                viewModel.onCodeCopied(grupo.codigoInvitacion)
                            },
                            onToggle = { viewModel.toggleGroup(grupo.id) },
                        )

                        AnimatedVisibility(visible = abierto) {
                            GroupPanel(
                                grupo = grupo,
                                propuestas = viewModel.proposalsOf(grupo.id),
                                userEmail = viewModel.currentEmail(),
                                diaSeleccionado = state.diaSeleccionado,
                                onSelectDay = viewModel::selectDay,
                                windowsFor = { dia -> viewModel.windowsFor(grupo, dia) },
                                onVote = { proposalId, windowId ->
                                    viewModel.vote(proposalId, windowId)
                                },
                            )
                        }
                    }
                }
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
                Text(state.toast.orEmpty(), style = MaterialTheme.typography.bodySmall)
            }
        }
    }

    when (state.dialogo) {
        GroupsDialog.CREAR -> CreateGroupDialog(state, viewModel)
        GroupsDialog.UNIRSE -> JoinGroupDialog(state, viewModel)
        GroupsDialog.NINGUNO -> Unit
    }
}

@Composable
private fun GroupsHeader(onJoin: () -> Unit, onCreate: () -> Unit) {
    Column {
        Text(
            text = "Mis grupos y horario comun",
            style = MaterialTheme.typography.headlineLarge,
            color = MaterialTheme.colorScheme.onSurface,
        )
        Spacer(Modifier.height(6.dp))
        Text(
            text = "Administra tus grupos, revisa a sus integrantes y visualiza los espacios libres de todos los miembros.",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(Modifier.height(16.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            SecondaryAction(
                text = "Unirse con codigo",
                icon = Icons.Outlined.Key,
                onClick = onJoin,
                modifier = Modifier.weight(1f),
            )
            PrimaryAction(
                text = "Crear grupo",
                icon = Icons.Filled.GroupAdd,
                onClick = onCreate,
                modifier = Modifier.weight(1f),
            )
        }
    }
}

@Composable
private fun GroupCard(
    grupo: Group,
    abierto: Boolean,
    codigoCopiado: Boolean,
    onCopyCode: () -> Unit,
    onToggle: () -> Unit,
) {
    HueckoCard(
        modifier = Modifier.fillMaxWidth(),
        borderColor = if (abierto) {
            MaterialTheme.colorScheme.secondary
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
                text = grupo.nombre,
                style = MaterialTheme.typography.headlineSmall,
                color = MaterialTheme.colorScheme.onSurface,
                modifier = Modifier.weight(1f),
            )
            Spacer(Modifier.width(8.dp))
            HueckoBadge(
                text = "Umbral ${grupo.umbralDisponibilidad}%",
                containerColor = MaterialTheme.colorScheme.inversePrimary.copy(alpha = 0.35f),
                contentColor = HueckoTheme.extended.primaryHover,
                borderColor = MaterialTheme.colorScheme.secondary.copy(alpha = 0.4f),
            )
        }

        Spacer(Modifier.height(8.dp))

        Text(
            text = grupo.descripcion.ifBlank { "Sin descripcion." },
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )

        Spacer(Modifier.height(14.dp))

        InvitationCodeRow(
            codigo = grupo.codigoInvitacion,
            copiado = codigoCopiado,
            onCopy = onCopyCode,
        )

        Spacer(Modifier.height(14.dp))

        Text(
            text = "MIEMBROS (${grupo.miembros.size})",
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(Modifier.height(8.dp))
        MemberChips(grupo.miembros)

        Spacer(Modifier.height(16.dp))

        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            SecondaryAction(
                text = "Proponer plan",
                icon = Icons.Filled.Campaign,
                onClick = onToggle,
                modifier = Modifier.weight(1f),
            )
            PrimaryAction(
                text = if (abierto) "Ocultar horario" else "Ver horario comun",
                icon = Icons.Filled.GridView,
                onClick = onToggle,
                modifier = Modifier.weight(1f),
            )
        }
    }
}

/**
 * Codigo de invitacion. El bloque entero es pulsable, no solo la palabra
 * "Copiar": es la accion unica de la fila y a 360dp un objetivo de 60dp de
 * ancho se falla con el pulgar.
 */
@Composable
private fun InvitationCodeRow(codigo: String, copiado: Boolean, onCopy: () -> Unit) {
    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(HueckoRadius.xxl),
        color = MaterialTheme.colorScheme.surfaceContainer,
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
        onClick = onCopy,
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 12.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Row(
                modifier = Modifier.weight(1f),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Icon(
                    Icons.Outlined.Key,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.size(18.dp),
                )
                Text(
                    text = codigo,
                    style = MaterialTheme.typography.titleSmall,
                    color = MaterialTheme.colorScheme.onSurface,
                )
            }

            Row(
                modifier = Modifier
                    .clip(RoundedCornerShape(HueckoRadius.lg))
                    .background(MaterialTheme.colorScheme.surfaceContainerLowest)
                    .padding(horizontal = 10.dp, vertical = 6.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                Icon(
                    if (copiado) Icons.Filled.Check else Icons.Filled.ContentCopy,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.size(14.dp),
                )
                Text(
                    text = if (copiado) "Copiado" else "Copiar",
                    style = MaterialTheme.typography.labelSmall,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.primary,
                )
            }
        }
    }
}

@Composable
private fun MemberChips(miembros: List<GroupMember>) {
    FlowRow(
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        miembros.forEach { miembro ->
            val esencial = miembro.isEssential
            Row(
                modifier = Modifier
                    .clip(RoundedCornerShape(HueckoRadius.xxl))
                    .background(
                        if (esencial) {
                            HueckoTheme.extended.warningContainer
                        } else {
                            MaterialTheme.colorScheme.surfaceContainerLowest
                        },
                    )
                    .border(
                        1.dp,
                        if (esencial) {
                            HueckoTheme.extended.warning.copy(alpha = 0.4f)
                        } else {
                            MaterialTheme.colorScheme.outlineVariant
                        },
                        RoundedCornerShape(HueckoRadius.xxl),
                    )
                    .padding(horizontal = 10.dp, vertical = 6.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                Box(
                    modifier = Modifier
                        .size(10.dp)
                        .clip(CircleShape)
                        .background(Color(miembro.colorArgb)),
                )
                Text(
                    text = miembro.nombre,
                    style = MaterialTheme.typography.labelMedium,
                    color = if (esencial) {
                        HueckoTheme.extended.onWarningContainer
                    } else {
                        MaterialTheme.colorScheme.onSurface
                    },
                )
                if (esencial) {
                    Icon(
                        Icons.Filled.Star,
                        contentDescription = "Imprescindible",
                        tint = HueckoTheme.extended.warning,
                        modifier = Modifier.size(14.dp),
                    )
                }
            }
        }
    }
}

/** Planes en votacion mas la agenda de coincidencias del grupo abierto. */
@Composable
private fun GroupPanel(
    grupo: Group,
    propuestas: List<PlanProposal>,
    userEmail: String,
    diaSeleccionado: DayOfWeek,
    onSelectDay: (DayOfWeek) -> Unit,
    windowsFor: (DayOfWeek) -> List<MatchWindow>,
    onVote: (String, String) -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
        HueckoCard(modifier = Modifier.fillMaxWidth()) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Icon(
                    Icons.Outlined.HowToVote,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.size(20.dp),
                )
                Text(
                    text = "Planes y votacion",
                    style = MaterialTheme.typography.titleLarge,
                    color = MaterialTheme.colorScheme.onSurface,
                )
            }

            Spacer(Modifier.height(12.dp))

            if (propuestas.isEmpty()) {
                Text(
                    text = "No hay propuestas de planes activas en este grupo.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            } else {
                Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    propuestas.forEach { propuesta ->
                        ProposalBlock(
                            propuesta = propuesta,
                            userEmail = userEmail,
                            onVote = { windowId -> onVote(propuesta.id, windowId) },
                        )
                    }
                }
            }
        }

        HueckoCard(
            modifier = Modifier.fillMaxWidth(),
            containerColor = MaterialTheme.colorScheme.surfaceContainerLow,
        ) {
            Text(
                text = "Horario en comun",
                style = MaterialTheme.typography.titleLarge,
                color = MaterialTheme.colorScheme.onSurface,
            )
            Spacer(Modifier.height(2.dp))
            Text(
                text = "${grupo.miembros.size} integrantes - ${grupo.umbralDisponibilidad}% minimo",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )

            Spacer(Modifier.height(14.dp))

            DaySelector(
                seleccionado = diaSeleccionado,
                franjasPorDia = { dia -> windowsFor(dia).size },
                onSelect = onSelectDay,
            )

            Spacer(Modifier.height(14.dp))

            val franjas = windowsFor(diaSeleccionado)
            if (franjas.isEmpty()) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(HueckoRadius.xxl))
                        .background(MaterialTheme.colorScheme.surfaceContainer)
                        .padding(24.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    Icon(
                        Icons.Outlined.EventBusy,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.size(34.dp),
                    )
                    Spacer(Modifier.height(8.dp))
                    Text(
                        text = "Sin huecos el ${diaSeleccionado.label}",
                        style = MaterialTheme.typography.titleMedium,
                        color = MaterialTheme.colorScheme.onSurface,
                    )
                    Spacer(Modifier.height(4.dp))
                    Text(
                        text = "Ninguna franja llega al ${grupo.umbralDisponibilidad}% del grupo.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            } else {
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    franjas.forEach { franja ->
                        MatchWindowRow(franja, grupo.miembros.size)
                    }
                }
            }
        }
    }
}

/** Selector horizontal de dia: la version movil de la rejilla semanal. */
@Composable
private fun DaySelector(
    seleccionado: DayOfWeek,
    franjasPorDia: (DayOfWeek) -> Int,
    onSelect: (DayOfWeek) -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .horizontalScroll(rememberScrollState()),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        DayOfWeek.week.forEach { dia ->
            val activo = dia == seleccionado
            val libres = franjasPorDia(dia)
            Surface(
                modifier = Modifier.widthIn(min = 62.dp),
                shape = RoundedCornerShape(HueckoRadius.xl),
                color = if (activo) {
                    MaterialTheme.colorScheme.primary
                } else {
                    MaterialTheme.colorScheme.surfaceContainer
                },
                border = BorderStroke(
                    1.dp,
                    if (activo) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outlineVariant,
                ),
                onClick = { onSelect(dia) },
            ) {
                Column(
                    modifier = Modifier.padding(horizontal = 10.dp, vertical = 8.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    Text(
                        text = dia.label,
                        style = MaterialTheme.typography.labelMedium,
                        fontWeight = FontWeight.Bold,
                        color = if (activo) {
                            MaterialTheme.colorScheme.onPrimary
                        } else {
                            MaterialTheme.colorScheme.onSurface
                        },
                    )
                    Text(
                        text = when (libres) {
                            0 -> "sin hueco"
                            1 -> "1 franja"
                            else -> "$libres franjas"
                        },
                        style = MaterialTheme.typography.labelSmall,
                        fontWeight = FontWeight.Normal,
                        color = if (activo) {
                            MaterialTheme.colorScheme.onPrimary.copy(alpha = 0.8f)
                        } else {
                            MaterialTheme.colorScheme.onSurfaceVariant
                        },
                    )
                }
            }
        }
    }
}

@Composable
private fun MatchWindowRow(franja: MatchWindow, totalMiembros: Int) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(HueckoRadius.xxl))
            .background(MaterialTheme.colorScheme.surfaceBright)
            .border(
                1.dp,
                MaterialTheme.colorScheme.outlineVariant,
                RoundedCornerShape(HueckoRadius.xxl),
            )
            .padding(horizontal = 14.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Text(
            text = franja.rangoHorario,
            style = MaterialTheme.typography.titleMedium,
            color = MaterialTheme.colorScheme.onSurface,
        )
        Column(horizontalAlignment = Alignment.End) {
            Text(
                text = "${franja.disponibilidadPorcentaje}% libre",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.primary,
            )
            Text(
                text = "${franja.librePersonas}/$totalMiembros personas",
                style = MaterialTheme.typography.labelSmall,
                fontWeight = FontWeight.Normal,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
private fun ProposalBlock(
    propuesta: PlanProposal,
    userEmail: String,
    onVote: (String) -> Unit,
) {
    val extended = HueckoTheme.extended
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(HueckoRadius.xxl))
            .background(MaterialTheme.colorScheme.surface)
            .border(
                1.dp,
                MaterialTheme.colorScheme.outlineVariant,
                RoundedCornerShape(HueckoRadius.xxl),
            )
            .padding(14.dp),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.Top,
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = propuesta.titulo,
                    style = MaterialTheme.typography.titleMedium,
                    color = MaterialTheme.colorScheme.onSurface,
                )
                propuesta.lugar?.let {
                    Text(
                        text = it,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
            Spacer(Modifier.width(8.dp))

            val (etiqueta, fondo, texto) = when (propuesta.estado) {
                ProposalState.CONFIRMADO -> Triple(
                    "Confirmado",
                    MaterialTheme.colorScheme.primary,
                    MaterialTheme.colorScheme.onPrimary,
                )
                ProposalState.EN_RECOORDINACION -> Triple(
                    "Re-coordinando",
                    extended.warningContainer,
                    extended.onWarningContainer,
                )
                else -> Triple(
                    "En votacion",
                    MaterialTheme.colorScheme.secondaryContainer,
                    MaterialTheme.colorScheme.onSecondaryContainer,
                )
            }
            HueckoBadge(text = etiqueta, containerColor = fondo, contentColor = texto)
        }

        Spacer(Modifier.height(10.dp))

        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            propuesta.ventanasSugeridas.forEach { ventana ->
                val votado = ventana.votosUsuarios.contains(userEmail)
                Surface(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(HueckoRadius.xl),
                    color = if (votado) {
                        MaterialTheme.colorScheme.primaryContainer
                    } else {
                        MaterialTheme.colorScheme.surfaceContainerLowest
                    },
                    border = BorderStroke(
                        1.dp,
                        if (votado) {
                            MaterialTheme.colorScheme.primary
                        } else {
                            MaterialTheme.colorScheme.outlineVariant
                        },
                    ),
                    onClick = { onVote(ventana.id) },
                ) {
                    Row(
                        modifier = Modifier.padding(horizontal = 12.dp, vertical = 10.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.SpaceBetween,
                    ) {
                        Column(modifier = Modifier.weight(1f)) {
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
                        HueckoBadge(
                            text = "${ventana.votosUsuarios.size} votos",
                            containerColor = MaterialTheme.colorScheme.surfaceContainer,
                            contentColor = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }
        }
    }
}

// ----------------------------------------------------------------- dialogos

@Composable
private fun CreateGroupDialog(state: GroupsUiState, viewModel: GroupsViewModel) {
    AlertDialog(
        onDismissRequest = viewModel::dismissDialog,
        shape = RoundedCornerShape(HueckoRadius.card),
        containerColor = MaterialTheme.colorScheme.surfaceContainerLowest,
        title = { Text("Crear grupo", style = MaterialTheme.typography.headlineSmall) },
        text = {
            Column {
                OutlinedTextField(
                    value = state.nuevoNombre,
                    onValueChange = viewModel::onNewNameChange,
                    label = { Text("Nombre del grupo") },
                    singleLine = true,
                    shape = RoundedCornerShape(HueckoRadius.xxl),
                    modifier = Modifier.fillMaxWidth(),
                )
                Spacer(Modifier.height(12.dp))
                OutlinedTextField(
                    value = state.nuevaDescripcion,
                    onValueChange = viewModel::onNewDescriptionChange,
                    label = { Text("Descripcion") },
                    shape = RoundedCornerShape(HueckoRadius.xxl),
                    modifier = Modifier.fillMaxWidth(),
                )
                Spacer(Modifier.height(16.dp))
                Text(
                    text = "Umbral de coincidencia: ${state.nuevoUmbral}%",
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Slider(
                    value = state.nuevoUmbral.toFloat(),
                    onValueChange = { viewModel.onThresholdChange(it.toInt()) },
                    valueRange = 50f..100f,
                    steps = 9,
                )
                Text(
                    text = "Solo se sugieren franjas donde este libre al menos ese porcentaje del grupo.",
                    style = MaterialTheme.typography.labelSmall,
                    fontWeight = FontWeight.Normal,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        },
        confirmButton = {
            TextButton(
                onClick = viewModel::createGroup,
                enabled = state.nuevoNombre.isNotBlank(),
            ) {
                Text("Crear", fontWeight = FontWeight.Bold)
            }
        },
        dismissButton = {
            TextButton(onClick = viewModel::dismissDialog) { Text("Cancelar") }
        },
    )
}

@Composable
private fun JoinGroupDialog(state: GroupsUiState, viewModel: GroupsViewModel) {
    AlertDialog(
        onDismissRequest = viewModel::dismissDialog,
        shape = RoundedCornerShape(HueckoRadius.card),
        containerColor = MaterialTheme.colorScheme.surfaceContainerLowest,
        title = { Text("Unirse con codigo", style = MaterialTheme.typography.headlineSmall) },
        text = {
            Column {
                Text(
                    text = "Pide el codigo a quien administra el grupo. Por ejemplo UNIV-2026.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Spacer(Modifier.height(12.dp))
                OutlinedTextField(
                    value = state.codigoIntroducido,
                    onValueChange = viewModel::onJoinCodeChange,
                    label = { Text("Codigo de invitacion") },
                    singleLine = true,
                    isError = state.errorUnion != null,
                    shape = RoundedCornerShape(HueckoRadius.xxl),
                    modifier = Modifier.fillMaxWidth(),
                )
                state.errorUnion?.let {
                    Spacer(Modifier.height(6.dp))
                    Text(
                        text = it,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.error,
                    )
                }
            }
        },
        confirmButton = {
            TextButton(onClick = viewModel::joinGroup) {
                Text("Unirme", fontWeight = FontWeight.Bold)
            }
        },
        dismissButton = {
            TextButton(onClick = viewModel::dismissDialog) { Text("Cancelar") }
        },
    )
}
