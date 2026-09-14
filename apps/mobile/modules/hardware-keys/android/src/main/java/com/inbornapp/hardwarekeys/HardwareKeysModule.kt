package com.inbornapp.hardwarekeys

import android.os.Handler
import android.os.Looper
import android.view.InputDevice
import android.view.KeyEvent
import android.view.Window
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Enter on a physical keyboard sends, Shift+Enter breaks the line (spec §10 #55, QA T28). The window callback sees
 * the key before the focused EditText, so a plain Enter never reaches the multiline field; the on-screen keyboard's
 * Enter (soft-keyboard flag, virtual device) is left alone. Active only while JS says the composer has focus.
 */
class HardwareKeysModule : Module() {
  private var enabled = false
  private var installedOn: Window? = null
  private val main = Handler(Looper.getMainLooper())

  override fun definition() = ModuleDefinition {
    Name("HardwareKeys")

    Events("onEnter")

    Function("setEnabled") { on: Boolean ->
      enabled = on
      if (on) main.post { install() }
    }
  }

  private fun install() {
    val window = appContext.currentActivity?.window ?: return
    if (installedOn === window) return
    val original = window.callback ?: return
    window.callback = object : Window.Callback by original {
      override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        if (enabled && event.keyCode == KeyEvent.KEYCODE_ENTER && !event.isShiftPressed && isHardware(event)) {
          if (event.action == KeyEvent.ACTION_DOWN && event.repeatCount == 0) sendEvent("onEnter", mapOf("deviceId" to event.deviceId))
          return true
        }
        return original.dispatchKeyEvent(event)
      }
    }
    installedOn = window
  }

  private fun isHardware(event: KeyEvent): Boolean {
    if (event.flags and KeyEvent.FLAG_SOFT_KEYBOARD != 0) return false
    val device = InputDevice.getDevice(event.deviceId) ?: return false
    return !device.isVirtual && device.keyboardType == InputDevice.KEYBOARD_TYPE_ALPHABETIC
  }
}
