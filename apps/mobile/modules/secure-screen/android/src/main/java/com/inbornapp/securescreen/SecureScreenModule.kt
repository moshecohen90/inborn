package com.inbornapp.securescreen

import android.view.WindowManager
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/** FLAG_SECURE (spec §5.7): blanks the recents thumbnail and refuses screenshots/recordings, the user's own included. */
class SecureScreenModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("SecureScreen")

    AsyncFunction("setSecure") { secure: Boolean, promise: Promise ->
      val activity = appContext.currentActivity ?: throw Exceptions.MissingActivity()
      activity.runOnUiThread {
        if (secure) activity.window.addFlags(WindowManager.LayoutParams.FLAG_SECURE)
        else activity.window.clearFlags(WindowManager.LayoutParams.FLAG_SECURE)
        promise.resolve(null)
      }
    }

    Function("isSecure") {
      val activity = appContext.currentActivity ?: return@Function false
      (activity.window.attributes.flags and WindowManager.LayoutParams.FLAG_SECURE) != 0
    }

    Function("isCaptured") { false }
  }
}
