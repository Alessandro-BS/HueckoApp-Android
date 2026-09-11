package com.example.hueckoapp.ui.ocr

import android.content.Context
import android.graphics.Bitmap
import android.graphics.ImageDecoder
import android.net.Uri
import android.os.Build
import android.provider.MediaStore
import androidx.compose.runtime.State
import androidx.compose.runtime.mutableStateOf
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.hueckoapp.data.service.GeminiService
import com.example.hueckoapp.domain.model.TimeBlock
import com.google.gson.Gson
import com.google.gson.reflect.TypeToken
import kotlinx.coroutines.launch

class OcrViewModel(private val geminiService: GeminiService) : ViewModel() {

    private val _uiState = mutableStateOf<OcrUiState>(OcrUiState.Initial)
    val uiState: State<OcrUiState> = _uiState

    private val gson = Gson()

    // Procesa la imagen seleccionada con la IA
    fun processImage(context: Context, uri: Uri) {
        viewModelScope.launch {
            _uiState.value = OcrUiState.Loading
            try {
                val bitmap = loadBitmap(context, uri)
                val jsonResult = geminiService.analyzeScheduleImage(bitmap)
                val blocks = parseJson(jsonResult)
                _uiState.value = OcrUiState.Success(blocks)
            } catch (e: Exception) {
                _uiState.value = OcrUiState.Error(e.message ?: "Error desconocido")
            }
        }
    }

    private fun loadBitmap(context: Context, uri: Uri): Bitmap {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            val source = ImageDecoder.createSource(context.contentResolver, uri)
            ImageDecoder.decodeBitmap(source)
        } else {
            MediaStore.Images.Media.getBitmap(context.contentResolver, uri)
        }
    }

    private fun parseJson(json: String): List<TimeBlock> {
        val type = object : TypeToken<List<TimeBlock>>() {}.type
        return gson.fromJson(json, type)
    }
}

sealed class OcrUiState {
    object Initial : OcrUiState()
    object Loading : OcrUiState()
    data class Success(val blocks: List<TimeBlock>) : OcrUiState()
    data class Error(val message: String) : OcrUiState()
}
