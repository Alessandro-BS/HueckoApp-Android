package com.example.hueckoapp.ui.group

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
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
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.ArrowForward
import androidx.compose.material.icons.outlined.GroupAdd
import androidx.compose.material.icons.outlined.Groups
import androidx.compose.material.icons.outlined.Key
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.example.hueckoapp.domain.model.Group
import com.example.hueckoapp.ui.components.EmptyStateView
import com.example.hueckoapp.ui.components.HueckoAvatar
import com.example.hueckoapp.ui.components.HueckoCard
import com.example.hueckoapp.ui.components.PrimaryAction
import com.example.hueckoapp.ui.components.SecondaryAction
import com.example.hueckoapp.ui.theme.categoryColorByIndex

/**
 * Lista de grupos del usuario.
 *
 * Muestra una tarjeta limpia por cada grupo: avatar, nombre, descripcion
 * y un boton para ir al detalle. El contenido expandido (horarios, votaciones)
 * vive ahora en [GroupDetailScreen].
 */
@Composable
fun GroupListScreen(
    viewModel: GroupViewModel,
    onGroupClick: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    val groups by viewModel.groups.collectAsStateWithLifecycle()
    var showCreateDialog by remember { mutableStateOf(false) }
    var showJoinDialog by remember { mutableStateOf(false) }

    Column(modifier = modifier.fillMaxSize()) {
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .background(MaterialTheme.colorScheme.surface),
            contentPadding = androidx.compose.foundation.layout.PaddingValues(
                horizontal = 16.dp,
                vertical = 20.dp,
            ),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            item {
                Header(
                    onJoin = { showJoinDialog = true },
                    onCreate = { showCreateDialog = true },
                )
            }

            if (groups.isEmpty()) {
                item {
                    EmptyStateView(
                        title = "Aun no tienes ningun grupo",
                        description = "Crea uno para invitar a tus companeros, o unete con el codigo que te hayan pasado.",
                        icon = Icons.Outlined.Groups,
                        actionLabel = "Crear mi primer grupo",
                        onActionClick = { showCreateDialog = true },
                    )
                }
            } else {
                items(groups, key = { it.id }) { group ->
                    GroupCard(
                        group = group,
                        onClick = { onGroupClick(group.id) },
                    )
                }
            }
        }
    }

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
            text = "Consulta a quien tienes en cada grupo y en que franjas coincideis todos.",
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

/**
 * Tarjeta de grupo simplificada: avatar con la inicial, nombre, descripcion
 * breve, conteo de miembros y boton "Ir a grupo".
 */
@Composable
private fun GroupCard(
    group: Group,
    onClick: () -> Unit,
) {
    HueckoCard(
        modifier = Modifier.fillMaxWidth(),
        contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            HueckoAvatar(
                name = group.name,
                color = categoryColorByIndex(group.name.hashCode()),
                size = 56.dp,
            )

            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = group.name,
                    style = MaterialTheme.typography.titleMedium,
                    color = MaterialTheme.colorScheme.onSurface,
                )

                if (group.description.isNotBlank()) {
                    Spacer(Modifier.height(2.dp))
                    Text(
                        text = group.description,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 2,
                    )
                }

                Spacer(Modifier.height(6.dp))

                Text(
                    text = "${group.members.size} ${if (group.members.size == 1) "miembro" else "miembros"}",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }

            Icon(
                imageVector = Icons.Outlined.ArrowForward,
                contentDescription = "Ir a grupo",
                tint = MaterialTheme.colorScheme.primary,
                modifier = Modifier.size(20.dp),
            )
        }
    }
}
