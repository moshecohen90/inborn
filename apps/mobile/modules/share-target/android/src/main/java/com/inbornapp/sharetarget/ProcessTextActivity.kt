package com.inbornapp.sharetarget

import android.app.Activity
import android.content.Intent
import android.os.Bundle

/**
 * Receives ACTION_PROCESS_TEXT in the caller's task, hands the text to the app's main task and waits, invisible, for
 * "Replace" (result back to the caller) or a cancel. Returning to the caller before that counts as a cancel.
 */
class ProcessTextActivity : Activity() {
  private var handedOff = false

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    val text = intent?.getCharSequenceExtra(Intent.EXTRA_PROCESS_TEXT)?.toString()
    if (text.isNullOrBlank()) {
      setResult(RESULT_CANCELED)
      finish()
      return
    }
    val readonly = intent.getBooleanExtra(Intent.EXTRA_PROCESS_TEXT_READONLY, false)
    PendingShare.set(mapOf("kind" to "processText", "text" to text, "readonly" to readonly), this)
    val launch = packageManager.getLaunchIntentForPackage(packageName)
    if (launch == null) {
      cancel()
      return
    }
    launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED)
    startActivity(launch)
  }

  override fun onPause() {
    super.onPause()
    handedOff = true
  }

  override fun onResume() {
    super.onResume()
    if (handedOff && !isFinishing) cancel()
  }

  override fun onDestroy() {
    PendingShare.detach(this)
    super.onDestroy()
  }

  fun replaceWith(text: String) {
    runOnUiThread {
      setResult(RESULT_OK, PendingShare.replaceResult(text))
      finish()
    }
  }

  fun cancel() {
    runOnUiThread {
      setResult(RESULT_CANCELED)
      finish()
    }
  }
}
