package com.example.hueckoapp.ui.schedule

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.DocumentScanner
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.example.hueckoapp.domain.model.TimeBlock

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MyScheduleScreen(
    viewModel: ScheduleViewModel,
    onNavigateToAdd: () -> Unit,
    onNavigateToOcr: (android.net.Uri) -> Unit,
    onBack: () -> Unit
) {
    val blocks by viewModel.timeBlocks.collectAsState()

    // Selector de imágenes de la galería
    val photoPickerLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.PickVisualMedia(),
        onResult = { uri ->
            uri?.let { onNavigateToOcr(it) }
        }
    )

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Mi Horario") },
                actions = {
                    IconButton(onClick = {
                        photoPickerLauncher.launch(
                            PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)
                        )
                    }) {
                        Icon(Icons.Default.DocumentScanner, contentDescription = "Escanear con IA")
                    }
                }
            )
        },
        floatingActionButton = {
            FloatingActionButton(onClick = onNavigateToAdd) {
                Icon(Icons.Default.Add, contentDescription = "Añadir Horario")
            }
        }
    ) { padding ->
        if (blocks.isEmpty()) {
            Box(modifier = Modifier.fillMaxSize().padding(padding), contentAlignment = Alignment.Center) {
                Text("No tienes horarios registrados.")
            }
        } else {
            LazyColumn(
                modifier = Modifier.fillMaxSize().padding(padding),
                contentPadding = PaddingValues(16.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                items(blocks) { block ->
                    TimeBlockItem(block = block, onDelete = { viewModel.deleteBlock(block.id) })
                }
            }
        }
    }
}

@Composable
fun TimeBlockItem(block: TimeBlock, onDelete: () -> Unit) {
    val dayName = when(block.dayOfWeek) {
        1 -> "Lunes"
        2 -> "Martes"
        3 -> "Miércoles"
        4 -> "Jueves"
        5 -> "Viernes"
        6 -> "Sábado"
        7 -> "Domingo"
        else -> "Evento Puntual"
    }

    Card(
        modifier = Modifier.fillMaxWidth(),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
    ) {
        Row(
            modifier = Modifier.padding(16.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(text = block.label, style = MaterialTheme.typography.titleMedium)
                Text(text = "$dayName | ${block.startTime} - ${block.endTime}", style = MaterialTheme.typography.bodySmall)
            }
            IconButton(onClick = onDelete) {
                Icon(Icons.Default.Delete, contentDescription = "Eliminar", tint = MaterialTheme.colorScheme.error)
            }
        }
    }
}
