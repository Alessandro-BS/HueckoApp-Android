package expo.modules.proximity

import android.content.Context
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

private const val CHANGE_EVENT = "onChange"

// Sensor de proximidad (Sensor.TYPE_PROXIMITY). Emite `onChange { near }` solo cuando cambia `near`.
class ProximityModule : Module() {
  // Último valor enviado a JS; null = todavía nada (la primera lectura tras empezar a escuchar siempre se envía).
  private var lastNear: Boolean? = null
  private var listening = false

  private val sensorManager: SensorManager?
    get() = appContext.reactContext?.getSystemService(Context.SENSOR_SERVICE) as? SensorManager

  private val proximitySensor: Sensor?
    get() = sensorManager?.getDefaultSensor(Sensor.TYPE_PROXIMITY)

  private val listener = object : SensorEventListener {
    override fun onSensorChanged(event: SensorEvent?) {
      if (event == null || event.values.isEmpty()) return
      // Muchos sensores son binarios: 0 (cerca) o el máximo (lejos).
      val near = event.values[0] < event.sensor.maximumRange
      if (near == lastNear) return
      lastNear = near
      this@ProximityModule.sendEvent(CHANGE_EVENT, mapOf("near" to near))
    }

    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) = Unit
  }

  private fun startListening() {
    if (listening) return
    val manager = sensorManager ?: return
    val sensor = manager.getDefaultSensor(Sensor.TYPE_PROXIMITY) ?: return
    lastNear = null
    listening = manager.registerListener(listener, sensor, SensorManager.SENSOR_DELAY_NORMAL)
  }

  private fun stopListening() {
    if (!listening) return
    sensorManager?.unregisterListener(listener)
    listening = false
    lastNear = null
  }

  override fun definition() = ModuleDefinition {
    Name("Proximity")

    Events(CHANGE_EVENT)

    Function("isAvailable") {
      proximitySensor != null
    }

    // Primer listener de JS: se registra el SensorEventListener. Último que se va: se quita.
    OnStartObserving(CHANGE_EVENT) {
      startListening()
    }

    OnStopObserving(CHANGE_EVENT) {
      stopListening()
    }

    OnDestroy {
      stopListening()
    }
  }
}
