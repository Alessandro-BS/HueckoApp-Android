package com.example.hueckoapp.ui.group

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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.ArrowBack
import androidx.compose.material.icons.outlined.HowToVote
import androidx.compose.material3.BottomSheetDefaults
import androidx.compose.material3.CenterAlignedTopAppBar
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.example.hueckoapp.domain.model.PlanProposal
import com.example.hueckoapp.domain.model.ProposalState
import com.example.hueckoapp.domain.model.User
import com.example.hueckoapp.ui.components.HueckoAvatar
import com.example.hueckoapp.ui.components.HueckoBadge
import com.example.hueckoapp.ui.components.HueckoCard
import com.example.hueckoapp.ui.theme.HueckoRadius
import com.example.hueckoapp.ui.theme.categoryColorByIndex

/**
 * Pantalla de detalle de un grupo.
 *
 * Orden: banner, titulo + integrantes, botones de accion,
 * llamadas a la votacion, planes propuestos y lista horizontal de miembros.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun GroupDetailScreen(
    groupId: String,
    viewModel: GroupViewModel,
    planningViewModel: GroupPlanningViewModel,
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val groups by viewModel.groups.collectAsStateWithLifecycle()
    val planning by planningViewModel.state.collectAsStateWithLifecycle()
    val group = groups.firstOrNull { it.id == groupId }

    var showVotingSheet by remember { mutableStateOf(false) }
    var showCreatePlanSheet by remember { mutableStateOf(false) }

    if (group == null) {
        Box(modifier = modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            Text(
                text = "Grupo no encontrado",
                style = MaterialTheme.typography.bodyLarge,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        return
    }

    val proposals = planningViewModel.proposalsOf(group.id)
    val votingCalls = planningViewModel.votingCallsOf(group.id)
    val activePlanIds = votingCalls.map { it.planId }

    Scaffold(
        topBar = {
            CenterAlignedTopAppBar(
                title = { Text(group.name) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Outlined.ArrowBack, contentDescription = "Volver")
                    }
                },
                colors = TopAppBarDefaults.centerAlignedTopAppBarColors(
                    containerColor = MaterialTheme.colorScheme.surface,
                ),
            )
        },
        containerColor = MaterialTheme.colorScheme.surface,
    ) { innerPadding ->
        LazyColumn(
            modifier = modifier
                .fillMaxSize()
                .padding(innerPadding),
            contentPadding = PaddingValues(bottom = 24.dp),
            verticalArrangement = Arrangement.spacedBy(20.dp),
        ) {
            // Banner
            item {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(120.dp)
                        .background(color = categoryColorByIndex(group.name.hashCode())),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        text = group.name.trim().take(1).uppercase(),
                        style = MaterialTheme.typography.displayMedium,
                        color = Color.White,
                    )
                }
            }

            // Titulo + integrantes
            item {
                Column(
                    modifier = Modifier.padding(horizontal = 16.dp),
                    verticalArrangement = Arrangement.spacedBy(4.dp),
                ) {
                    Text(
                        text = group.name,
                        style = MaterialTheme.typography.headlineSmall,
                        color = MaterialTheme.colorScheme.onSurface,
                    )
                    Text(
                        text = "${group.members.size} ${if (group.members.size == 1) "miembro" else "miembros"}",
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }

            // Botones de accion
            item {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp),
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    OutlinedButton(
                        onClick = { showCreatePlanSheet = true },
                        modifier = Modifier.weight(1f),
                        shape = RoundedCornerShape(HueckoRadius.xxl),
                    ) {
                        Icon(Icons.Outlined.Add, contentDescription = null, modifier = Modifier.size(18.dp))
                        Spacer(Modifier.width(6.dp))
                        Text("Crear plan")
                    }
                    OutlinedButton(
                        onClick = { showVotingSheet = true },
                        modifier = Modifier.weight(1f),
                        shape = RoundedCornerShape(HueckoRadius.xxl),
                    ) {
                        Icon(Icons.Outlined.HowToVote, contentDescription = null, modifier = Modifier.size(18.dp))
                        Spacer(Modifier.width(6.dp))
                        Text("Votacion")
                    }
                }
            }

            // Llamadas a la votacion
            if (votingCalls.isNotEmpty()) {
                item {
                    Column(modifier = Modifier.padding(horizontal = 16.dp)) {
                        Text(
                            text = "Llamadas a la votacion",
                            style = MaterialTheme.typography.titleMedium,
                            color = MaterialTheme.colorScheme.onSurface,
                        )
                    }
                }
                items(votingCalls, key = { it.id }) { call ->
                    VotingCallCard(
                        call = call,
                        onVoteClick = { /* TODO: ir a votar */ },
                    )
                }
            }

            // Planes propuestos
            item {
                Column(modifier = Modifier.padding(horizontal = 16.dp)) {
                    Text(
                        text = "Planes propuestos",
                        style = MaterialTheme.typography.titleMedium,
                        color = MaterialTheme.colorScheme.onSurface,
                    )
                }
            }

            if (proposals.isEmpty()) {
                item {
                    Text(
                        text = "Nadie ha propuesto un plan todavia.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(horizontal = 16.dp),
                    )
                }
            } else {
                items(proposals, key = { it.id }) { proposal ->
                    PlanCard(
                        proposal = proposal,
                        onDetailsClick = { /* TODO: ir a detalle del plan */ },
                    )
                }
            }

            // Miembros
            item {
                Column(modifier = Modifier.padding(horizontal = 16.dp)) {
                    Text(
                        text = "Integrantes",
                        style = MaterialTheme.typography.titleMedium,
                        color = MaterialTheme.colorScheme.onSurface,
                    )
                }
            }

            item {
                MembersRow(
                    members = group.members,
                    onSeeAll = { /* TODO: ver todos los miembros */ },
                )
            }
        }
    }

    // Bottom sheet para elegir plan y crear llamada a la votacion
    if (showVotingSheet) {
        VotingCallBottomSheet(
            proposals = proposals,
            activePlanIds = activePlanIds,
            onSelectPlan = { proposal ->
                planningViewModel.createVotingCall(groupId, proposal)
                showVotingSheet = false
            },
            onDismiss = { showVotingSheet = false },
        )
    }

    // Bottom sheet para crear propuesta de plan
    if (showCreatePlanSheet) {
        CreatePlanBottomSheet(
            onCreatePlan = { title, location, deadline ->
                planningViewModel.createProposal(groupId, title, location, deadline)
                showCreatePlanSheet = false
            },
            onDismiss = { showCreatePlanSheet = false },
        )
    }
}

@Composable
private fun VotingCallCard(
    call: VotingCall,
    onVoteClick: () -> Unit,
) {
    HueckoCard(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = call.planTitle,
                    style = MaterialTheme.typography.titleMedium,
                    color = MaterialTheme.colorScheme.onSurface,
                )
                Spacer(Modifier.height(2.dp))
                Text(
                    text = "Convocado por ${call.createdBy} · ${call.createdAt}",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            TextButton(onClick = onVoteClick) {
                Text("Ir a votar")
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun VotingCallBottomSheet(
    proposals: List<PlanProposal>,
    activePlanIds: List<String>,
    onSelectPlan: (PlanProposal) -> Unit,
    onDismiss: () -> Unit,
) {
    val sheetState = rememberModalBottomSheetState()

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = sheetState,
        containerColor = MaterialTheme.colorScheme.surface,
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp)
                .padding(bottom = 32.dp),
        ) {
            Text(
                text = "Crear llamado a la votacion",
                style = MaterialTheme.typography.titleMedium,
                color = MaterialTheme.colorScheme.onSurface,
            )
            Spacer(Modifier.height(4.dp))
            Text(
                text = "Selecciona un plan para convocar al grupo a votar.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(Modifier.height(16.dp))

            if (proposals.isEmpty()) {
                Text(
                    text = "No hay planes propuestos todavia.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            } else {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    proposals.forEach { proposal ->
                        val isActive = proposal.id in activePlanIds
                        Surface(
                            onClick = { if (!isActive) onSelectPlan(proposal) },
                            modifier = Modifier.fillMaxWidth(),
                            shape = RoundedCornerShape(HueckoRadius.xxl),
                            color = if (isActive) {
                                MaterialTheme.colorScheme.surfaceContainerLow
                            } else {
                                MaterialTheme.colorScheme.surfaceContainer
                            },
                            enabled = !isActive,
                        ) {
                            Column(
                                modifier = Modifier.padding(14.dp),
                            ) {
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    verticalAlignment = Alignment.CenterVertically,
                                ) {
                                    Text(
                                        text = proposal.title,
                                        style = MaterialTheme.typography.titleSmall,
                                        color = MaterialTheme.colorScheme.onSurface,
                                    )
                                    if (isActive) {
                                        HueckoBadge(
                                            text = "Ya convocado",
                                            containerColor = MaterialTheme.colorScheme.secondaryContainer,
                                            contentColor = MaterialTheme.colorScheme.onSecondaryContainer,
                                        )
                                    }
                                }
                                if (!proposal.location.isNullOrBlank()) {
                                    Text(
                                        text = proposal.location,
                                        style = MaterialTheme.typography.bodySmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun CreatePlanBottomSheet(
    onCreatePlan: (title: String, location: String?, deadline: String) -> Unit,
    onDismiss: () -> Unit,
) {
    val sheetState = rememberModalBottomSheetState()
    var title by remember { mutableStateOf("") }
    var location by remember { mutableStateOf("") }
    var deadline by remember { mutableStateOf("") }

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = sheetState,
        containerColor = MaterialTheme.colorScheme.surface,
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp)
                .padding(bottom = 32.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text(
                text = "Crear propuesta de plan",
                style = MaterialTheme.typography.titleMedium,
                color = MaterialTheme.colorScheme.onSurface,
            )

            androidx.compose.material3.OutlinedTextField(
                value = title,
                onValueChange = { title = it },
                label = { Text("Titulo del plan") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )

            androidx.compose.material3.OutlinedTextField(
                value = location,
                onValueChange = { location = it },
                label = { Text("Ubicacion (opcional)") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )

            androidx.compose.material3.OutlinedTextField(
                value = deadline,
                onValueChange = { deadline = it },
                label = { Text("Fecha limite de votacion") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )

            Spacer(Modifier.height(4.dp))

            androidx.compose.material3.Button(
                onClick = { onCreatePlan(title, location, deadline) },
                enabled = title.isNotBlank() && deadline.isNotBlank(),
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(HueckoRadius.xxl),
            ) {
                Text("Crear propuesta")
            }
        }
    }
}

@Composable
private fun PlanCard(
    proposal: PlanProposal,
    onDetailsClick: () -> Unit,
) {
    HueckoCard(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp),
    ) {
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
                if (!proposal.location.isNullOrBlank()) {
                    Spacer(Modifier.height(2.dp))
                    Text(
                        text = proposal.location,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                Spacer(Modifier.height(4.dp))
                Text(
                    text = proposal.votingDeadline,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }

            Spacer(Modifier.width(12.dp))

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
                    "En votacion",
                    MaterialTheme.colorScheme.secondaryContainer,
                    MaterialTheme.colorScheme.onSecondaryContainer,
                )
            }
            HueckoBadge(text = label, containerColor = container, contentColor = content)
        }

        Spacer(Modifier.height(12.dp))

        TextButton(
            onClick = onDetailsClick,
            contentPadding = PaddingValues(0.dp),
        ) {
            Text("Ver detalles")
        }
    }
}

@Composable
private fun MembersRow(
    members: List<User>,
    onSeeAll: () -> Unit,
) {
    Column {
        LazyRow(
            contentPadding = PaddingValues(horizontal = 16.dp),
            horizontalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            items(members.take(8), key = { it.id }) { member ->
                Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(4.dp),
                ) {
                    HueckoAvatar(
                        name = member.name,
                        color = categoryColorByIndex(members.indexOf(member)),
                        size = 48.dp,
                    )
                    Text(
                        text = member.name,
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurface,
                        maxLines = 1,
                    )
                }
            }
        }

        if (members.size > 8) {
            TextButton(
                onClick = onSeeAll,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp),
            ) {
                Text("Ver todos los integrantes (${members.size})")
            }
        }
    }
}
