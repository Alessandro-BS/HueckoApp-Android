package com.example.hueckoapp.ui.schedule

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
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
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.CalendarToday
import androidx.compose.material.icons.outlined.DeleteOutline
import androidx.compose.material.icons.outlined.DocumentScanner
import androidx.compose.material.icons.outlined.EventAvailable
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.example.hueckoapp.domain.model.BlockType
import com.example.hueckoapp.domain.model.DayOfWeek
import com.example.hueckoapp.domain.model.TimeBlock
import com.example.hueckoapp.ui.components.EmptyState
import com.example.hueckoapp.ui.components.HueckoBadge
import com.example.hueckoapp.ui.components.HueckoDaySelector
import com.example.hueckoapp.ui.components.PrimaryAction
import com.example.hueckoapp.ui.components.SecondaryAction
import com.example.hueckoapp.ui.theme.HueckoRadius
import com.example.hueckoapp.ui.theme.categoryColorByIndex

/**
 * Mi horario.
 *
 * Sigue la vista movil de `SchedulePage.tsx`: un dia cada vez. La rejilla
 * semanal de la web se descarta aqui porque en un telefono cada celda medira
 * unos 45dp y no cabria ni la hora dentro.
 *
 * Las dos acciones —importar por OCR y anadir a mano— van arriba y visibles.
 * En la web son dos botones de cabecera; meterlas en un boton flotante
 * obligaria a adivinar cual de las dos hace.
 */
@Composable
fun MyScheduleScreen(
    viewModel: ScheduleViewModel,
    onNavigateToAdd: () -> Unit,
    onNavigateToOcr: (android.net.Uri) -> Unit,
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val blocks by viewModel.timeBlocks.collectAsState()
    var selectedDay by remember { mutableStateOf(DayOfWeek.LUN) }

    val photoPicker = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.PickVisualMedia(),
        onResult = { uri -> uri?.let(onNavigateToOcr) },
    )

    val blocksOfDay = blocks
        .filter { it.dayOfWeek == selectedDay.iso }
        .sortedBy { it.startTime }

    LazyColumn(
        modifier = modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.surface),
        contentPadding = PaddingValues(horizontal = 16.dp, vertical = 20.dp),
        verticalArrangement = Arrangement.spacedBy(20.dp),
    ) {
        item {
            Column {
                Text(
                    text = "Mi horario",
                    style = MaterialTheme.typography.headlineLarge,
                    color = MaterialTheme.colorScheme.onSurface,
                )
                Spacer(Modifier.height(6.dp))
                Text(
                    text = "Registra tus clases y turnos. Lo que no esté aquí cuenta como hueco libre para tus grupos.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Spacer(Modifier.height(16.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    SecondaryAction(
                        text = "Escanear",
                        icon = Icons.Outlined.DocumentScanner,
                        onClick = {
                            photoPicker.launch(
                                PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly),
                            )
                        },
                        modifier = Modifier.weight(1f),
                    )
                    PrimaryAction(
                        text = "Añadir bloque",
                        icon = Icons.Outlined.Add,
                        onClick = onNavigateToAdd,
                        modifier = Modifier.weight(1f),
                    )
                }
            }
        }

        if (blocks.isEmpty()) {
            item {
                EmptyState(
                    icon = Icons.Outlined.CalendarToday,
                    title = "Aún no tienes horarios registrados",
                    description = "Añade tus clases, trabajo o actividades para que tus grupos encuentren los mejores huecos.",
                    actionLabel = "Añadir mi primer bloque",
                    onAction = onNavigateToAdd,
                )
            }
        } else {
            item {
                HueckoDaySelector(
                    selected = selectedDay,
                    captionFor = { day ->
                        val total = blocks.count { it.dayOfWeek == day.iso }
                        if (total == 0) "libre" else total.toString()
                    },
                    onSelect = { selectedDay = it },
                )
            }

            if (blocksOfDay.isEmpty()) {
                item { FreeDayNotice(day = selectedDay, onAdd = onNavigateToAdd) }
            } else {
                items(blocksOfDay, key = { it.id }) { block ->
                    TimeBlockItem(
                        block = block,
                        onDelete = { viewModel.deleteBlock(block.id) },
                    )
                }
            }
        }
    }
}

@Composable
private fun FreeDayNotice(day: DayOfWeek, onAdd: () -> Unit) {
    EmptyState(
        icon = Icons.Outlined.EventAvailable,
        title = "Sin bloques el ${day.label}",
        description = "Todo el día cuenta como libre para tus grupos.",
        actionLabel = "Añadir un bloque",
        onAction = onAdd,
    )
}

/**
 * Fila de un bloque de horario.
 *
 * La usa tambien la pantalla de revision del OCR, por eso es publica y recibe
 * `onDelete` como opcional: alli los bloques todavia no existen y no hay nada
 * que borrar.
 */
@Composable
fun TimeBlockItem(
    block: TimeBlock,
    onDelete: (() -> Unit)? = null,
    modifier: Modifier = Modifier,
) {
    val dayName = DayOfWeek.fromIso(block.dayOfWeek ?: -1)?.label ?: "Puntual"
    // El color identifica el bloque de un vistazo; se deriva del id para que
    // el mismo bloque conserve su color entre recomposiciones y pantallas.
    val accent = categoryColorByIndex(block.id.hashCode())

    Surface(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(HueckoRadius.card),
        color = MaterialTheme.colorScheme.surfaceContainerLowest,
        border = androidx.compose.foundation.BorderStroke(
            1.dp,
            MaterialTheme.colorScheme.outlineVariant,
        ),
    ) {
        Row(
            modifier = Modifier.padding(14.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Box(
                modifier = Modifier
                    .width(4.dp)
                    .height(40.dp)
                    .background(accent, RoundedCornerShape(HueckoRadius.sm)),
            )

            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = block.label,
                    style = MaterialTheme.typography.titleMedium,
                    color = MaterialTheme.colorScheme.onSurface,
                )
                Spacer(Modifier.height(2.dp))
                Text(
                    text = "$dayName · ${block.timeRange}",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }

            if (!block.isRecurring || block.type == BlockType.PUNTUAL) {
                HueckoBadge(
                    text = "Puntual",
                    containerColor = MaterialTheme.colorScheme.secondaryContainer,
                    contentColor = MaterialTheme.colorScheme.onSecondaryContainer,
                )
            }

            if (onDelete != null) {
                IconButton(onClick = onDelete) {
                    Icon(
                        Icons.Outlined.DeleteOutline,
                        contentDescription = "Eliminar ${block.label}",
                        tint = MaterialTheme.colorScheme.error,
                        modifier = Modifier.size(22.dp),
                    )
                }
            }
        }
    }
}
