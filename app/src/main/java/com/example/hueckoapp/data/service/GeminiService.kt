package com.example.hueckoapp.data.service

import android.graphics.Bitmap
import com.example.hueckoapp.BuildConfig
import com.google.firebase.Firebase
import com.google.firebase.ai.ai
import com.google.firebase.ai.type.content
import com.google.firebase.ai.type.generationConfig
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

// Servicio para interactuar con la IA de Gemini con soporte de datos mock
class GeminiService {

    private val generativeModel by lazy {
        Firebase.ai.generativeModel(
            modelName = "gemini-1.5-flash",
            generationConfig = generationConfig {
                responseMimeType = "application/json"
            }
        )
    }

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

    suspend fun analyzeScheduleImage(bitmap: Bitmap? = null): String = withContext(Dispatchers.IO) {
        // Si no hay API Key configurada, retornamos datos mock
        if (BuildConfig.GEMINI_API_KEY.isBlank()) {
            return@withContext getMockScheduleJson()
        }

        try {
            val response = generativeModel.generateContent(
                content {
                    bitmap?.let { image(it) }
                    text(prompt)
                }
            )
            response.text ?: getMockScheduleJson()
        } catch (_: Exception) {
            // Fallback automático a datos mock si falla la red o Firebase AI
            getMockScheduleJson()
        }
    }

    private fun getMockScheduleJson(): String = """
        [
          {
            "dayOfWeek": 1,
            "startTime": "08:00",
            "endTime": "10:00",
            "label": "Matemáticas Discretas"
          },
          {
            "dayOfWeek": 1,
            "startTime": "10:30",
            "endTime": "12:30",
            "label": "Arquitectura de Software"
          },
          {
            "dayOfWeek": 3,
            "startTime": "09:00",
            "endTime": "11:00",
            "label": "Bases de Datos Avanzadas"
          },
          {
            "dayOfWeek": 5,
            "startTime": "14:00",
            "endTime": "16:00",
            "label": "Desarrollo Móvil Android"
          }
        ]
    """.trimIndent()
}
