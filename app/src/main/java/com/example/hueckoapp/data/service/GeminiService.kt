package com.example.hueckoapp.data.service

import android.graphics.Bitmap
import com.example.hueckoapp.BuildConfig
import com.google.firebase.Firebase
import com.google.firebase.ai.ai
import com.google.firebase.ai.type.content
import com.google.firebase.ai.type.generationConfig
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

// Servicio para interactuar con la IA de Gemini
class GeminiService {

    // Configuración del modelo (usamos flash para rapidez)
    private val generativeModel = Firebase.ai.generativeModel(
        modelName = "gemini-1.5-flash",
        generationConfig = generationConfig {
            responseMimeType = "application/json"
        }
    )

    // Prompt optimizado para extraer horarios
    private val prompt = """
        Analiza esta imagen de un horario y extrae los bloques de tiempo.
        Devuelve un JSON con una lista de objetos. Cada objeto debe tener:
        - "dayOfWeek": un número del 1 (Lunes) al 7 (Domingo).
        - "startTime": hora de inicio en formato HH:mm.
        - "endTime": hora de fin en formato HH:mm.
        - "label": nombre de la actividad o clase.
        
        Si no estás seguro del día, intenta inferirlo por la posición en la tabla.
        Responde SOLO el JSON.
    """.trimIndent()

    suspend fun analyzeScheduleImage(bitmap: Bitmap): String = withContext(Dispatchers.IO) {
        val response = generativeModel.generateContent(
            content {
                image(bitmap)
                text(prompt)
            }
        )
        response.text ?: "[]"
    }
}
