package com.inbornapp.vault

import android.app.ActivityManager
import android.content.Context
import android.os.Build
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.io.FileInputStream
import java.security.MessageDigest
import kotlin.concurrent.thread

/** Vault helpers that JS cannot do fast enough: SHA-256 over a multi-GB file and physical RAM (spec §5.3). */
class VaultNativeModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("VaultNative")

    Function("totalMemoryBytes") {
      val info = ActivityManager.MemoryInfo()
      (context.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager).getMemoryInfo(info)
      info.totalMem.toDouble()
    }

    /* Streams in 4 MB slices on its own thread so a 2.7 GB model never sits in memory or blocks JS. */
    AsyncFunction("sha256File") { path: String, promise: Promise ->
      thread(name = "vault-sha256") {
        try {
          val digest = MessageDigest.getInstance("SHA-256")
          FileInputStream(File(path.removePrefix("file://"))).use { input ->
            val buffer = ByteArray(4 * 1024 * 1024)
            while (true) {
              val n = input.read(buffer)
              if (n <= 0) break
              digest.update(buffer, 0, n)
            }
          }
          promise.resolve(digest.digest().joinToString("") { "%02x".format(it) })
        } catch (e: Exception) {
          promise.reject("ERR_SHA256", e.message, e)
        }
      }
    }

    /* Marketing chip names come from the SoC id (S01 "Runs on"); older Android has no public field, so null. */
    /* f_bavail, not expo's File.getFreeSpace (f_bfree): the root reserve is not the app's to write, and it read as 144 MB on a disk the app found full (QA R4-F13). */
    Function("usableDiskBytes") { context.filesDir.usableSpace.toDouble() }

    Function("socModel") { if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) Build.SOC_MODEL else null }

    /* Android excludes app files from backup through dataExtractionRules in the manifest, not per file. */
    Function("excludeFromBackup") { _: String -> true }
  }
}
