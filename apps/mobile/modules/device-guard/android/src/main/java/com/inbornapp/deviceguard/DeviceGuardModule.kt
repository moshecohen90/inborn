package com.inbornapp.deviceguard

import android.app.ActivityManager
import android.content.BroadcastReceiver
import android.content.ComponentCallbacks2
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.res.Configuration
import android.os.BatteryManager
import android.os.Build
import android.os.PowerManager
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/** Thermal, memory-pressure and power-source signals for the §6.5 policy; expo-battery carries level and charging. */
class DeviceGuardModule : Module() {
  private val context: Context
    get() = appContext.reactContext?.applicationContext ?: throw Exceptions.ReactContextLost()
  private val power: PowerManager
    get() = context.getSystemService(Context.POWER_SERVICE) as PowerManager
  private var thermalListener: PowerManager.OnThermalStatusChangedListener? = null
  private var trimCallbacks: ComponentCallbacks2? = null
  private var receiver: BroadcastReceiver? = null

  override fun definition() = ModuleDefinition {
    Name("DeviceGuard")
    Events("thermal", "memory", "power")

    Function("getSnapshot") { snapshot() }

    Function("getThermalHeadroom") { seconds: Int ->
      if (Build.VERSION.SDK_INT >= 30) power.getThermalHeadroom(seconds).toDouble().takeIf { !it.isNaN() } else null
    }

    OnStartObserving { start() }
    OnStopObserving { stop() }
    OnDestroy { stop() }
  }

  private fun snapshot(): Map<String, Any?> {
    val memory = ActivityManager.MemoryInfo().also {
      (context.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager).getMemoryInfo(it)
    }
    val battery = context.registerReceiver(null, IntentFilter(Intent.ACTION_BATTERY_CHANGED))
    val size = context.resources.configuration.screenLayout and Configuration.SCREENLAYOUT_SIZE_MASK
    return mapOf(
      "thermalStatus" to if (Build.VERSION.SDK_INT >= 29) power.currentThermalStatus else -1,
      "thermalHeadroom" to if (Build.VERSION.SDK_INT >= 30) power.getThermalHeadroom(10).toDouble().takeIf { !it.isNaN() } else null,
      "availMem" to memory.availMem.toDouble(),
      "totalMem" to memory.totalMem.toDouble(),
      "threshold" to memory.threshold.toDouble(),
      "lowMemory" to memory.lowMemory,
      "powerSaveMode" to power.isPowerSaveMode,
      "plugged" to (battery?.getIntExtra(BatteryManager.EXTRA_PLUGGED, 0) ?: 0),
      "batteryTempC" to battery?.getIntExtra(BatteryManager.EXTRA_TEMPERATURE, -1)?.takeIf { it > 0 }?.let { it / 10.0 },
      "isTablet" to (size >= Configuration.SCREENLAYOUT_SIZE_LARGE),
      "sdk" to Build.VERSION.SDK_INT,
      "model" to Build.MODEL,
    )
  }

  private fun start() {
    if (Build.VERSION.SDK_INT >= 29 && thermalListener == null) {
      val listener = PowerManager.OnThermalStatusChangedListener { status -> sendEvent("thermal", mapOf("thermalStatus" to status)) }
      power.addThermalStatusListener(listener)
      thermalListener = listener
    }
    if (trimCallbacks == null) {
      val callbacks = object : ComponentCallbacks2 {
        override fun onTrimMemory(level: Int) = sendEvent("memory", mapOf("trimLevel" to level))
        override fun onConfigurationChanged(newConfig: Configuration) = Unit
        @Deprecated("Deprecated in Java")
        override fun onLowMemory() = sendEvent("memory", mapOf("trimLevel" to ComponentCallbacks2.TRIM_MEMORY_COMPLETE))
      }
      context.registerComponentCallbacks(callbacks)
      trimCallbacks = callbacks
    }
    if (receiver == null) {
      val r = object : BroadcastReceiver() {
        override fun onReceive(c: Context, intent: Intent) = sendEvent("power", snapshot())
      }
      val filter = IntentFilter().apply {
        addAction(PowerManager.ACTION_POWER_SAVE_MODE_CHANGED)
        addAction(Intent.ACTION_POWER_CONNECTED)
        addAction(Intent.ACTION_POWER_DISCONNECTED)
      }
      // System broadcasts reach a non-exported receiver; the flag is mandatory from API 33 for anything else.
      if (Build.VERSION.SDK_INT >= 33) context.registerReceiver(r, filter, Context.RECEIVER_NOT_EXPORTED) else context.registerReceiver(r, filter)
      receiver = r
    }
  }

  private fun stop() {
    thermalListener?.let { if (Build.VERSION.SDK_INT >= 29) power.removeThermalStatusListener(it) }
    thermalListener = null
    trimCallbacks?.let { context.unregisterComponentCallbacks(it) }
    trimCallbacks = null
    receiver?.let { context.unregisterReceiver(it) }
    receiver = null
  }
}
