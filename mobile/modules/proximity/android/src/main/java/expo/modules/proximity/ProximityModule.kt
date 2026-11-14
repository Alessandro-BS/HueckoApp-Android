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
  // JS tiene listeners (OnStartObserving/OnStopObserving), aunque el sensor esté parado por estar la app en segundo plano.
  private var observing = false
  // El SensorManager con el que se registró el listener: al quitarlo no se vuelve a pedir a reactContext (en OnDestroy
  // puede ser null y el listener quedaría registrado). null = no se está escuchando.
  private var registeredManager: SensorManager? = null

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
    if (registeredManager != null) return
    val manager = sensorManager ?: return
    val sensor = manager.getDefaultSensor(Sensor.TYPE_PROXIMITY) ?: return
    lastNear = null
    if (manager.registerListener(listener, sensor, SensorManager.SENSOR_DELAY_NORMAL)) registeredManager = manager
  }

  private fun stopListening() {
    val manager = registeredManager ?: return
    manager.unregisterListener(listener)
    registeredManager = null
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
      observing = true
      startListening()
    }

    OnStopObserving(CHANGE_EVENT) {
      observing = false
      stopListening()
    }

    // Pantalla bloqueada o app en segundo plano: el sensor no sigue avisando en el bolsillo. Al volver, se reanuda
    // si JS sigue escuchando (la primera lectura vuelve a enviarse: lastNear = null).
    OnActivityEntersBackground {
      stopListening()
    }

    OnActivityEntersForeground {
      if (observing) startListening()
    }

    OnDestroy {
      stopListening()
    }
  }
}
