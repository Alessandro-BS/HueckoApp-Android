package com.example.hueckoapp.ui.schedule

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AddScheduleScreen(
    viewModel: ScheduleViewModel,
    onBack: () -> Unit
) {
    val label by viewModel.newLabel
    val selectedDay by viewModel.newDay
    val startTime by viewModel.newStartTime
    val endTime by viewModel.newEndTime
    val isLoading by viewModel.isLoading

    val days = listOf("Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo")

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Nuevo Horario") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "Volver")
                    }
                }
            )
        }
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            OutlinedTextField(
                value = label,
                onValueChange = { viewModel.onLabelChange(it) },
                label = { Text("Nombre del bloque (ej: Clase)") },
                modifier = Modifier.fillMaxWidth()
            )

            Text("Día de la semana", style = MaterialTheme.typography.titleSmall)
            
            Column(Modifier.selectableGroup()) {
                days.forEachIndexed { index, day ->
                    Row(
                        Modifier
                            .fillMaxWidth()
                            .height(40.dp)
                            .selectable(
                                selected = (selectedDay == index + 1),
                                onClick = { viewModel.onDayChange(index + 1) },
                                role = Role.RadioButton
                            ),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        RadioButton(selected = (selectedDay == index + 1), onClick = null)
                        Text(text = day, modifier = Modifier.padding(start = 16.dp))
                    }
                }
            }

            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(
                    value = startTime,
                    onValueChange = { viewModel.onStartTimeChange(it) },
                    label = { Text("Inicio (HH:mm)") },
                    modifier = Modifier.weight(1f)
                )
                OutlinedTextField(
                    value = endTime,
                    onValueChange = { viewModel.onEndTimeChange(it) },
                    label = { Text("Fin (HH:mm)") },
                    modifier = Modifier.weight(1f)
                )
            }

            Spacer(modifier = Modifier.weight(1f))

            Button(
                onClick = { viewModel.saveBlock(onBack) },
                modifier = Modifier.fillMaxWidth(),
                enabled = label.isNotBlank() && !isLoading
            ) {
                if (isLoading) CircularProgressIndicator(modifier = Modifier.size(24.dp))
                else Text("Guardar Horario")
            }
        }
    }
}
