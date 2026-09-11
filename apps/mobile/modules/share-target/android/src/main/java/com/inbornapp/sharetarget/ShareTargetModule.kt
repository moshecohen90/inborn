package com.inbornapp.sharetarget

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.OpenableColumns
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.io.FileOutputStream

/**
 * Share target (spec §7.7): ACTION_SEND text or one file into the app, ACTION_PROCESS_TEXT through ProcessTextActivity.
 * Files are copied into the app cache while the intent's URI grant is alive; nothing is read later.
 */
class ShareTargetModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("ShareTarget")

    Events("onShare")

    /** The item that launched the app (cold start), consumed once. */
    Function("consumePending") {
      PendingShare.take() ?: appContext.currentActivity?.let { activity ->
        val intent = activity.intent ?: return@let null
        payloadOf(activity, intent)?.also { activity.intent = Intent(Intent.ACTION_MAIN) }
      }
    }

    /** "Replace" hands the text back to the app that selected it and steps aside; null cancels and stays. */
    Function("finishProcessText") { text: String? ->
      val done = PendingShare.finishProcessText(text)
      if (done && text != null) appContext.currentActivity?.moveTaskToBack(true)
      done
    }

    Function("hasProcessText") { PendingShare.hasProcessText() }

    OnNewIntent { intent ->
      val activity = appContext.currentActivity
      val payload = (if (activity != null) payloadOf(activity, intent) else null) ?: PendingShare.take()
      if (payload != null) sendEvent("onShare", payload)
    }
  }

  private fun payloadOf(activity: Activity, intent: Intent): Map<String, Any?>? {
    if (intent.action != Intent.ACTION_SEND) return null
    val text = intent.getCharSequenceExtra(Intent.EXTRA_TEXT)?.toString()?.takeIf { it.isNotBlank() }
    val stream: Uri? = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) intent.getParcelableExtra(Intent.EXTRA_STREAM, Uri::class.java) else @Suppress("DEPRECATION") intent.getParcelableExtra(Intent.EXTRA_STREAM)
    val file = stream?.let { copyIntoCache(activity, it, intent.type) }
    return when {
      file != null -> mapOf("kind" to "files", "files" to listOf(file), "text" to text)
      text != null -> mapOf("kind" to "text", "text" to text)
      else -> null
    }
  }

  private fun copyIntoCache(activity: Activity, uri: Uri, intentType: String?): Map<String, Any?>? {
    val resolver = activity.contentResolver
    var name: String? = null
    var size: Long = -1
    try {
      resolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE), null, null, null)?.use { c ->
        if (c.moveToFirst()) {
          val n = c.getColumnIndex(OpenableColumns.DISPLAY_NAME)
          val s = c.getColumnIndex(OpenableColumns.SIZE)
          if (n >= 0) name = c.getString(n)
          if (s >= 0 && !c.isNull(s)) size = c.getLong(s)
        }
      }
    } catch (_: Exception) {
    }
    val safeName = (name ?: uri.lastPathSegment ?: "shared").substringAfterLast('/').replace(Regex("[^A-Za-z0-9._ -]"), "_").ifBlank { "shared" }
    val dir = File(activity.cacheDir, "shared").apply { mkdirs() }
    val target = File(dir, "${System.currentTimeMillis()}-$safeName")
    return try {
      val input = resolver.openInputStream(uri) ?: return null
      input.use { i -> FileOutputStream(target).use { o -> i.copyTo(o) } }
      mapOf("uri" to Uri.fromFile(target).toString(), "name" to safeName, "mimeType" to (resolver.getType(uri) ?: intentType), "bytes" to (if (size >= 0) size.toDouble() else target.length().toDouble()))
    } catch (_: Exception) {
      target.delete()
      null
    }
  }
}
