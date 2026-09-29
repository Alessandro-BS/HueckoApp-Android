package com.example.hueckoapp.ui.ocr

import android.net.Uri
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
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.outlined.ErrorOutline
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.example.hueckoapp.domain.model.TimeBlock
import com.example.hueckoapp.ui.components.HueckoCard
import com.example.hueckoapp.ui.components.PrimaryAction
import com.example.hueckoapp.ui.components.SecondaryAction
import com.example.hueckoapp.ui.schedule.TimeBlockItem
import com.example.hueckoapp.ui.theme.HueckoRadius

/**
 * Revision del horario extraido por OCR (HU-02).
 *
 * El paso de revision no es un tramite: un modelo de lenguaje leyendo la foto
 * de un horario se equivoca, y confirmar sin mirar mete bloques falsos en el
 * cruce de disponibilidad de todo el grupo. Por eso la pantalla dice cuantos
 * bloques se han detectado y deja el boton de confirmar al final de la lista,
 * despues de haberla recorrido.
 */
@Composable
fun OcrReviewScreen(
    viewModel: OcrViewModel,
    imageUri: Uri,
    onConfirm: (List<TimeBlock>) -> Unit,
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val uiState by viewModel.uiState
    val context = LocalContext.current

    LaunchedEffect(imageUri) {
        viewModel.processImage(context, imageUri)
    }

    Column(
        modifier = modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.surface),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 8.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            IconButton(onClick = onBack) {
                Icon(
                    Icons.AutoMirrored.Outlined.ArrowBack,
                    contentDescription = "Volver",
                    tint = MaterialTheme.colorScheme.onSurface,
                )
            }
            Text(
                text = "Revisar escaneo",
                style = MaterialTheme.typography.titleLarge,
                color = MaterialTheme.colorScheme.onSurface,
            )
        }

        when (val state = uiState) {
            is OcrUiState.Success -> SuccessContent(
                blocks = state.blocks,
                onConfirm = { onConfirm(state.blocks) },
                onDiscard = onBack,
            )

            is OcrUiState.Error -> CenteredNotice(
                title = "No se pudo leer el horario",
                message = state.message,
                isError = true,
                onRetry = onBack,
            )

            else -> LoadingContent()
        }
    }
}

@Composable
private fun LoadingContent() {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        CircularProgressIndicator(
            color = MaterialTheme.colorScheme.primary,
            strokeWidth = 3.dp,
        )
        Spacer(Modifier.height(20.dp))
        Text(
            text = "Leyendo tu horario",
            style = MaterialTheme.typography.titleMedium,
            color = MaterialTheme.colorScheme.onSurface,
        )
        Spacer(Modifier.height(6.dp))
        Text(
            text = "Puede tardar unos segundos. No cierres la pantalla.",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
        )
    }
}

@Composable
private fun SuccessContent(
    blocks: List<TimeBlock>,
    onConfirm: () -> Unit,
    onDiscard: () -> Unit,
) {
    if (blocks.isEmpty()) {
        CenteredNotice(
            title = "No se detectó ningún bloque",
            message = "Prueba con una foto más nítida o añade los bloques a mano.",
            isError = false,
            onRetry = onDiscard,
        )
        return
    }

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(horizontal = 16.dp, vertical = 12.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            HueckoCard(
                modifier = Modifier.fillMaxWidth(),
                containerColor = MaterialTheme.colorScheme.primaryContainer,
                borderColor = MaterialTheme.colorScheme.primaryContainer,
            ) {
                Text(
                    text = "${blocks.size} ${if (blocks.size == 1) "bloque detectado" else "bloques detectados"}",
                    style = MaterialTheme.typography.titleMedium,
                    color = MaterialTheme.colorScheme.onPrimaryContainer,
                )
                Spacer(Modifier.height(4.dp))
                Text(
                    text = "Revísalos antes de confirmar: se sumarán a tu horario y afectarán a los huecos que vean tus grupos.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onPrimaryContainer,
                )
            }
        }

        items(blocks, key = { it.id }) { block ->
            // Sin `onDelete`: estos bloques todavia no existen en el
            // repositorio, asi que no hay nada que borrar. Se acepta la lista
            // entera o ninguna.
            TimeBlockItem(block = block)
        }

        item {
            Spacer(Modifier.height(4.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                SecondaryAction(
                    text = "Descartar",
                    icon = null,
                    onClick = onDiscard,
                    modifier = Modifier.weight(1f),
                )
                PrimaryAction(
                    text = "Añadir a mi horario",
                    icon = null,
                    onClick = onConfirm,
                    modifier = Modifier.weight(1f),
                )
            }
        }
    }
}

@Composable
private fun CenteredNotice(
    title: String,
    message: String,
    isError: Boolean,
    onRetry: () -> Unit,
) {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .padding(24.dp),
        contentAlignment = Alignment.Center,
    ) {
        Surface(
            shape = RoundedCornerShape(HueckoRadius.card),
            color = if (isError) {
                MaterialTheme.colorScheme.errorContainer
            } else {
                MaterialTheme.colorScheme.surfaceContainer
            },
        ) {
            Column(
                modifier = Modifier.padding(24.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Icon(
                    Icons.Outlined.ErrorOutline,
                    contentDescription = null,
                    tint = if (isError) {
                        MaterialTheme.colorScheme.onErrorContainer
                    } else {
                        MaterialTheme.colorScheme.onSurfaceVariant
                    },
                    modifier = Modifier.size(28.dp),
                )
                Spacer(Modifier.height(12.dp))
                Text(
                    text = title,
                    style = MaterialTheme.typography.titleMedium,
                    color = if (isError) {
                        MaterialTheme.colorScheme.onErrorContainer
                    } else {
                        MaterialTheme.colorScheme.onSurface
                    },
                    textAlign = TextAlign.Center,
                )
                Spacer(Modifier.height(6.dp))
                Text(
                    text = message,
                    style = MaterialTheme.typography.bodyMedium,
                    color = if (isError) {
                        MaterialTheme.colorScheme.onErrorContainer
                    } else {
                        MaterialTheme.colorScheme.onSurfaceVariant
                    },
                    textAlign = TextAlign.Center,
                )
                Spacer(Modifier.height(18.dp))
                PrimaryAction(text = "Volver", icon = null, onClick = onRetry)
            }
        }
    }
}
