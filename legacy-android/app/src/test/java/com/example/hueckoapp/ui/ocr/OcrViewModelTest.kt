package com.example.hueckoapp.ui.ocr

import com.example.hueckoapp.data.service.GeminiService
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class OcrViewModelTest {

    private val testDispatcher = StandardTestDispatcher()

    @Before
    fun setUp() {
        Dispatchers.setMain(testDispatcher)
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    @Test
    fun geminiService_returnsMockScheduleWhenApiKeyBlank() = runTest {
        val service = GeminiService()
        val jsonResult = service.analyzeScheduleImage(null)
        assertTrue(jsonResult.contains("Matemáticas Discretas"))
    }
}
