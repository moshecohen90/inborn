package com.inbornapp.sharetarget

import android.content.Intent

/** One shared item waiting for JS, plus the PROCESS_TEXT activity that expects a result back. */
object PendingShare {
  @Volatile private var payload: Map<String, Any?>? = null
  @Volatile private var processText: ProcessTextActivity? = null

  @Synchronized fun set(p: Map<String, Any?>, activity: ProcessTextActivity?) {
    payload = p
    processText?.takeIf { it !== activity }?.cancel()
    processText = activity
  }

  @Synchronized fun take(): Map<String, Any?>? = payload.also { payload = null }

  @Synchronized fun attach(activity: ProcessTextActivity) {
    processText = activity
  }

  @Synchronized fun detach(activity: ProcessTextActivity) {
    if (processText === activity) processText = null
  }

  /** `text` null = the user closed the sheet: the caller gets RESULT_CANCELED and keeps its selection. */
  @Synchronized fun finishProcessText(text: String?): Boolean {
    val a = processText ?: return false
    processText = null
    if (text == null) a.cancel() else a.replaceWith(text)
    return true
  }

  fun hasProcessText(): Boolean = processText != null

  fun replaceResult(text: String): Intent = Intent().putExtra(Intent.EXTRA_PROCESS_TEXT, text)
}
