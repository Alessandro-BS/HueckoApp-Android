package com.example.hueckoapp.ui.group

import androidx.compose.foundation.BorderStroke
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
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.ArrowBack
import androidx.compose.material.icons.outlined.Check
import androidx.compose.material.icons.outlined.Place
import androidx.compose.material3.CenterAlignedTopAppBar
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.example.hueckoapp.domain.model.DayOfWeek
import com.example.hueckoapp.domain.model.PlanProposal
import com.example.hueckoapp.domain.model.ProposalState
import com.example.hueckoapp.domain.model.TimeWindowProposal
import com.example.hueckoapp.ui.components.HueckoBadge
import com.example.hueckoapp.ui.components.HueckoCard
import com.example.hueckoapp.ui.components.HueckoDaySelector
import com.example.hueckoapp.ui.components.SectionHeader
import com.example.hueckoapp.ui.theme.HueckoRadius

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun VotingScreen(
    proposalId: String,
    groupId: String,
    planningViewModel: GroupPlanningViewModel,
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val planning by planningViewModel.state.collectAsStateWithLifecycle()

    val proposal = planning.proposals.firstOrNull { it.id == proposalId }

    var showAddWindowSheet by remember { mutableStateOf(false) }

    Scaffold(
        topBar = {
            CenterAlignedTopAppBar(
                title = { Text("Votar") },
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
        if (proposal == null) {
            Box(
                modifier = modifier
                    .fillMaxSize()
                    .padding(innerPadding),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    text = "Propuesta no encontrada",
                    style = MaterialTheme.typography.bodyLarge,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            return@Scaffold
        }

        val email = planning.userEmail
        val windows = proposal.suggestedWindows

        LazyColumn(
            modifier = modifier
                .fillMaxSize()
                .padding(innerPadding),
            contentPadding = PaddingValues(horizontal = 16.dp, vertical = 20.dp),
            verticalArrangement = Arrangement.spacedBy(20.dp),
        ) {
            item { ProposalHeader(proposal) }

            item {
                SectionHeader(
                    title = "Elige una franja horaria",
                    subtitle = "Selecciona la opcion que mas te convenga. Un voto por persona.",
                )
            }

            if (windows.isEmpty()) {
                item {
                    HueckoCard(modifier = Modifier.fillMaxWidth()) {
                        Text(
                            text = "No hay franjas disponibles. Agrega una manualmente.",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            } else {
                items(windows, key = { it.id }) { window ->
                    VoteWindowRow(
                        window = window,
                        hasVoted = email in window.voterEmails,
                        onClick = { planningViewModel.vote(proposalId, window.id) },
                    )
                }
            }

            item {
                Surface(
                    onClick = { showAddWindowSheet = true },
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(HueckoRadius.xxl),
                    color = MaterialTheme.colorScheme.surfaceContainerLowest,
                    border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
                ) {
                    Row(
                        modifier = Modifier.padding(16.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.Center,
                    ) {
                        Icon(
                            Icons.Outlined.Add,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.primary,
                            modifier = Modifier.size(20.dp),
                        )
                        Spacer(Modifier.width(8.dp))
                        Text(
                            text = "Agregar franja horaria",
                            style = MaterialTheme.typography.titleSmall,
                            color = MaterialTheme.colorScheme.primary,
                        )
                    }
                }
            }
        }
    }

    if (showAddWindowSheet) {
        AddWindowBottomSheet(
            onCreateWindow = { day, start, end ->
                planningViewModel.addSuggestedWindow(proposalId, day, start, end)
                showAddWindowSheet = false
            },
            onDismiss = { showAddWindowSheet = false },
        )
    }
}

@Composable
private fun ProposalHeader(proposal: PlanProposal) {
    HueckoCard(
        modifier = Modifier.fillMaxWidth(),
        containerColor = MaterialTheme.colorScheme.primaryContainer,
        borderColor = MaterialTheme.colorScheme.primaryContainer,
    ) {
        Text(
            text = proposal.title,
            style = MaterialTheme.typography.headlineSmall,
            color = MaterialTheme.colorScheme.onPrimaryContainer,
        )
        Spacer(Modifier.height(8.dp))

        if (!proposal.location.isNullOrBlank()) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(
                    Icons.Outlined.Place,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.onPrimaryContainer,
                    modifier = Modifier.size(16.dp),
                )
                Spacer(Modifier.width(6.dp))
                Text(
                    text = proposal.location,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onPrimaryContainer,
                )
            }
            Spacer(Modifier.height(4.dp))
        }

        Text(
            text = "Cierra: ${proposal.votingDeadline}",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onPrimaryContainer,
        )

        Spacer(Modifier.height(12.dp))

        val stateLabel = when (proposal.state) {
            ProposalState.CONFIRMADO -> "Confirmado"
            ProposalState.EN_RECOORDINACION -> "Re-coordinando"
            ProposalState.CANCELADO -> "Cancelado"
            ProposalState.PROPUESTO -> "En votacion"
        }
        val stateContainer = when (proposal.state) {
            ProposalState.CONFIRMADO -> MaterialTheme.colorScheme.primary
            ProposalState.EN_RECOORDINACION -> MaterialTheme.colorScheme.tertiaryContainer
            ProposalState.CANCELADO -> MaterialTheme.colorScheme.errorContainer
            ProposalState.PROPUESTO -> MaterialTheme.colorScheme.secondaryContainer
        }
        val stateContent = when (proposal.state) {
            ProposalState.CONFIRMADO -> MaterialTheme.colorScheme.onPrimary
            ProposalState.EN_RECOORDINACION -> MaterialTheme.colorScheme.onTertiaryContainer
            ProposalState.CANCELADO -> MaterialTheme.colorScheme.onErrorContainer
            ProposalState.PROPUESTO -> MaterialTheme.colorScheme.onSecondaryContainer
        }
        HueckoBadge(
            text = stateLabel,
            containerColor = stateContainer,
            contentColor = stateContent,
        )
    }
}

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
                    text = "${window.day.label} ${window.timeRange}",
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
            Surface(
                shape = RoundedCornerShape(HueckoRadius.xxl),
                color = if (votes > 0) {
                    MaterialTheme.colorScheme.primaryContainer
                } else {
                    MaterialTheme.colorScheme.surfaceContainerLow
                },
            ) {
                Text(
                    text = "$votes ${if (votes == 1) "voto" else "votos"}",
                    modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp),
                    style = MaterialTheme.typography.labelMedium,
                    color = if (votes > 0) {
                        MaterialTheme.colorScheme.onPrimaryContainer
                    } else {
                        MaterialTheme.colorScheme.onSurfaceVariant
                    },
                )
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun AddWindowBottomSheet(
    onCreateWindow: (day: DayOfWeek, startTime: String, endTime: String) -> Unit,
    onDismiss: () -> Unit,
) {
    val sheetState = rememberModalBottomSheetState()
    var selectedDay by remember { mutableStateOf(DayOfWeek.LUN) }
    var startTime by remember { mutableStateOf("09:00") }
    var endTime by remember { mutableStateOf("11:00") }

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
                text = "Agregar franja horaria",
                style = MaterialTheme.typography.titleMedium,
                color = MaterialTheme.colorScheme.onSurface,
            )

            Text(
                text = "Selecciona el dia y la franja horaria que propones.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )

            HueckoDaySelector(
                selected = selectedDay,
                captionFor = { "" },
                onSelect = { selectedDay = it },
            )

            OutlinedTextField(
                value = startTime,
                onValueChange = { startTime = it },
                label = { Text("Hora de inicio (HH:mm)") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )

            OutlinedTextField(
                value = endTime,
                onValueChange = { endTime = it },
                label = { Text("Hora de fin (HH:mm)") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )

            Spacer(Modifier.height(4.dp))

            androidx.compose.material3.Button(
                onClick = { onCreateWindow(selectedDay, startTime, endTime) },
                enabled = startTime.isNotBlank() && endTime.isNotBlank(),
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(HueckoRadius.xxl),
            ) {
                Text("Agregar")
            }
        }
    }
}
