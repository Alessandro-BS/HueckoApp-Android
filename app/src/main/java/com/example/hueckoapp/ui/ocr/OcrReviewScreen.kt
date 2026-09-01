package com.example.hueckoapp.ui.ocr

import android.net.Uri
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Check
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.example.hueckoapp.ui.schedule.TimeBlockItem

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun OcrReviewScreen(
    viewModel: OcrViewModel,
    imageUri: Uri,
    onConfirm: (List<com.example.hueckoapp.domain.model.TimeBlock>) -> Unit,
    onBack: () -> Unit
) {
    val uiState by viewModel.uiState
    val context = LocalContext.current

    // Iniciar procesamiento al entrar
    LaunchedEffect(imageUri) {
        viewModel.processImage(context, imageUri)
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Revisar Escaneo") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Volver")
                    }
                }
            )
        },
        floatingActionButton = {
            if (uiState is OcrUiState.Success) {
                FloatingActionButton(onClick = { 
                    onConfirm((uiState as OcrUiState.Success).blocks) 
                }) {
                    Icon(Icons.Default.Check, contentDescription = "Confirmar todo")
                }
            }
        }
    ) { padding ->
        Box(modifier = Modifier.fillMaxSize().padding(padding)) {
            when (val state = uiState) {
                is OcrUiState.Loading -> {
                    Column(
                        modifier = Modifier.fillMaxSize(),
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.Center
                    ) {
                        CircularProgressIndicator()
                        Spacer(modifier = Modifier.height(16.dp))
                        Text("La IA está analizando tu horario...")
                    }
                }
                is OcrUiState.Success -> {
                    LazyColumn(
                        modifier = Modifier.fillMaxSize(),
                        contentPadding = PaddingValues(16.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        item {
                            Text(
                                "Hemos detectado estos bloques. Por favor, verifica que sean correctos.",
                                style = MaterialTheme.typography.bodyMedium,
                                modifier = Modifier.padding(bottom = 16.dp)
                            )
                        }
                        items(state.blocks) { block ->
                            TimeBlockItem(block = block, onDelete = { /* Por ahora no editable */ })
                        }
                    }
                }
                is OcrUiState.Error -> {
                    Text(
                        text = "Error: ${state.message}",
                        color = MaterialTheme.colorScheme.error,
                        modifier = Modifier.align(Alignment.Center)
                    )
                }
                else -> {}
            }
        }
    }
}
