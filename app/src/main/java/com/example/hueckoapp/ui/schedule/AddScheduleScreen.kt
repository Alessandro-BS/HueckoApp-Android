package com.example.hueckoapp.ui.schedule

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.example.hueckoapp.domain.model.DayOfWeek
import com.example.hueckoapp.ui.components.PrimaryAction
import com.example.hueckoapp.ui.theme.HueckoRadius

/**
 * Alta de un bloque de horario (HU-01, HU-03).
 *
 * El dia se elige con siete pastillas en una fila que se ajusta sola, no con
 * una lista de siete radios: ocupa una linea en lugar de media pantalla y deja
 * el boton de guardar a la vista sin tener que desplazarse.
 *
 * Las horas se validan aqui mismo. Aceptar "25:70" y descubrirlo despues, al
 * cruzar agendas, dejaria un bloque que nadie sabe interpretar.
 */
@Composable
fun AddScheduleScreen(
    viewModel: ScheduleViewModel,
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val label by viewModel.newLabel
    val selectedDay by viewModel.newDay
    val startTime by viewModel.newStartTime
    val endTime by viewModel.newEndTime
    val isLoading by viewModel.isLoading

    val startValid = isValidTime(startTime)
    val endValid = isValidTime(endTime)
    val orderValid = startValid && endValid && minutesOf(endTime) > minutesOf(startTime)
    val canSave = label.isNotBlank() && orderValid && !isLoading

    Column(
        modifier = modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.surface)
            .imePadding()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 16.dp, vertical = 20.dp),
        verticalArrangement = Arrangement.spacedBy(20.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = onBack) {
                Icon(
                    Icons.AutoMirrored.Outlined.ArrowBack,
                    contentDescription = "Volver",
                    tint = MaterialTheme.colorScheme.onSurface,
                )
            }
            Spacer(Modifier.size(4.dp))
            Text(
                text = "Nuevo bloque",
                style = MaterialTheme.typography.headlineMedium,
                color = MaterialTheme.colorScheme.onSurface,
            )
        }

        Column {
            FieldLabel("Nombre del bloque")
            Spacer(Modifier.height(6.dp))
            HueckoField(
                value = label,
                onValueChange = viewModel::onLabelChange,
                placeholder = "Clase de Cálculo",
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Next),
            )
        }

        Column {
            FieldLabel("Día de la semana")
            Spacer(Modifier.height(10.dp))
            FlowRow(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                DayOfWeek.week.forEach { day ->
                    val active = day.iso == selectedDay
                    Surface(
                        onClick = { viewModel.onDayChange(day.iso) },
                        modifier = Modifier
                            .widthIn(min = 56.dp)
                            .height(48.dp)
                            .semantics { this.selected = active },
                        shape = RoundedCornerShape(HueckoRadius.xxl),
                        color = if (active) {
                            MaterialTheme.colorScheme.primary
                        } else {
                            MaterialTheme.colorScheme.surfaceContainer
                        },
                    ) {
                        Row(
                            modifier = Modifier.padding(horizontal = 14.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.Center,
                        ) {
                            Text(
                                text = day.label,
                                style = MaterialTheme.typography.titleSmall,
                                color = if (active) {
                                    MaterialTheme.colorScheme.onPrimary
                                } else {
                                    MaterialTheme.colorScheme.onSurface
                                },
                            )
                        }
                    }
                }
            }
        }

        Column {
            FieldLabel("Horario")
            Spacer(Modifier.height(6.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                HueckoField(
                    value = startTime,
                    onValueChange = viewModel::onStartTimeChange,
                    placeholder = "08:00",
                    supporting = if (startValid) "Inicio" else "Formato HH:mm",
                    isError = !startValid,
                    keyboardOptions = KeyboardOptions(
                        keyboardType = KeyboardType.Number,
                        imeAction = ImeAction.Next,
                    ),
                    modifier = Modifier.weight(1f),
                )
                HueckoField(
                    value = endTime,
                    onValueChange = viewModel::onEndTimeChange,
                    placeholder = "10:00",
                    supporting = when {
                        !endValid -> "Formato HH:mm"
                        !orderValid -> "Debe ser posterior"
                        else -> "Fin"
                    },
                    isError = !endValid || !orderValid,
                    keyboardOptions = KeyboardOptions(
                        keyboardType = KeyboardType.Number,
                        imeAction = ImeAction.Done,
                    ),
                    modifier = Modifier.weight(1f),
                )
            }
        }

        PrimaryAction(
            text = if (isLoading) "Guardando…" else "Guardar bloque",
            icon = null,
            onClick = { viewModel.saveBlock(onBack) },
            enabled = canSave,
            modifier = Modifier.fillMaxWidth(),
        )

        if (isLoading) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.Center,
            ) {
                CircularProgressIndicator(
                    modifier = Modifier.size(20.dp),
                    strokeWidth = 2.dp,
                    color = MaterialTheme.colorScheme.primary,
                )
            }
        }
    }
}

@Composable
private fun FieldLabel(text: String) {
    Text(
        text = text,
        style = MaterialTheme.typography.labelMedium,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
    )
}

@Composable
private fun HueckoField(
    value: String,
    onValueChange: (String) -> Unit,
    placeholder: String,
    keyboardOptions: KeyboardOptions,
    modifier: Modifier = Modifier,
    supporting: String? = null,
    isError: Boolean = false,
) {
    OutlinedTextField(
        value = value,
        onValueChange = onValueChange,
        modifier = modifier.fillMaxWidth(),
        placeholder = {
            Text(
                text = placeholder,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.outline,
            )
        },
        supportingText = supporting?.let { { Text(it) } },
        isError = isError,
        singleLine = true,
        shape = RoundedCornerShape(HueckoRadius.xxl),
        textStyle = MaterialTheme.typography.bodyLarge,
        keyboardOptions = keyboardOptions,
        colors = OutlinedTextFieldDefaults.colors(
            focusedContainerColor = Color.Transparent,
            unfocusedContainerColor = Color.Transparent,
            errorContainerColor = Color.Transparent,
            focusedBorderColor = MaterialTheme.colorScheme.primary,
            unfocusedBorderColor = MaterialTheme.colorScheme.outlineVariant,
            cursorColor = MaterialTheme.colorScheme.primary,
        ),
    )
}

/** Acepta HH:mm de 00:00 a 23:59. */
private fun isValidTime(value: String): Boolean =
    Regex("^([01]\\d|2[0-3]):[0-5]\\d$").matches(value)

private fun minutesOf(value: String): Int {
    val parts = value.split(':')
    val hours = parts.getOrNull(0)?.toIntOrNull() ?: 0
    val minutes = parts.getOrNull(1)?.toIntOrNull() ?: 0
    return hours * 60 + minutes
}
