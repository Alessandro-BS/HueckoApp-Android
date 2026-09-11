package com.example.hueckoapp

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.ui.Modifier
import com.example.hueckoapp.ui.navigation.HueckoNavigation
import com.example.hueckoapp.ui.theme.HueckoAppTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        android.util.Log.d("MainActivity", "onCreate called")
        setContent {
            HueckoAppTheme {
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = MaterialTheme.colorScheme.background,
                ) {
                    HueckoNavigation()
                }
            }
        }
    }

    override fun onStart() {
        super.onStart()
        android.util.Log.d("MainActivity", "onStart called")
    }

    override fun onResume() {
        super.onResume()
        android.util.Log.d("MainActivity", "onResume called")
    }

    override fun onPause() {
        super.onPause()
        android.util.Log.d("MainActivity", "onPause called")
    }

    override fun onStop() {
        super.onStop()
        android.util.Log.d("MainActivity", "onStop called")
    }

    override fun onDestroy() {
        super.onDestroy()
        android.util.Log.d("MainActivity", "onDestroy called")
    }
}
