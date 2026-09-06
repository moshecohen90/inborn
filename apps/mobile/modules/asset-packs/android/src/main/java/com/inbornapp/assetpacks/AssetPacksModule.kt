package com.inbornapp.assetpacks

import com.google.android.play.core.assetpacks.AssetPackManager
import com.google.android.play.core.assetpacks.AssetPackManagerFactory
import com.google.android.play.core.assetpacks.AssetPackState
import com.google.android.play.core.assetpacks.AssetPackStateUpdateListener
import com.google.android.play.core.assetpacks.AssetPackStates
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/** Play Asset Delivery bridge: packs arrive through Play, never through a socket the app opens (spec §5.1). */
class AssetPacksModule : Module() {
  private val manager: AssetPackManager by lazy {
    val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
    AssetPackManagerFactory.getInstance(context.applicationContext)
  }

  /* Play pushes progress here; polling would miss WAITING_FOR_WIFI / REQUIRES_USER_CONFIRMATION between ticks. */
  private val listener = AssetPackStateUpdateListener { state -> sendEvent(PACK_STATE, stateOf(state)) }
  private var listening = false

  override fun definition() = ModuleDefinition {
    Name("AssetPacks")
    Events(PACK_STATE)

    OnStartObserving {
      if (!listening) {
        manager.registerListener(listener)
        listening = true
      }
    }
    OnStopObserving {
      if (listening) {
        manager.unregisterListener(listener)
        listening = false
      }
    }
    OnDestroy {
      if (listening) manager.unregisterListener(listener)
    }

    Function("getPackPath") { packName: String ->
      manager.getPackLocation(packName)?.assetsPath()
    }

    AsyncFunction("fetch") { packName: String, promise: Promise ->
      manager.fetch(listOf(packName))
        .addOnSuccessListener { promise.resolve(stateOf(packName, it)) }
        .addOnFailureListener { promise.reject("ERR_ASSET_PACK_FETCH", it.message, it) }
    }

    AsyncFunction("getPackState") { packName: String, promise: Promise ->
      manager.getPackStates(listOf(packName))
        .addOnSuccessListener { promise.resolve(stateOf(packName, it)) }
        .addOnFailureListener { promise.reject("ERR_ASSET_PACK_STATE", it.message, it) }
    }

    Function("cancel") { packName: String ->
      stateOf(packName, manager.cancel(listOf(packName)))
    }

    AsyncFunction("removePack") { packName: String, promise: Promise ->
      manager.removePack(packName)
        .addOnSuccessListener { promise.resolve(null) }
        .addOnFailureListener { promise.reject("ERR_ASSET_PACK_REMOVE", it.message, it) }
    }

    /* Play's own dialog for cellular / large downloads (spec S32); resolves with the Activity result code. */
    AsyncFunction("showConfirmationDialog") { promise: Promise ->
      val activity = appContext.currentActivity ?: run {
        promise.reject("ERR_NO_ACTIVITY", "no foreground activity", null)
        return@AsyncFunction
      }
      manager.showConfirmationDialog(activity)
        .addOnSuccessListener { promise.resolve(it) }
        .addOnFailureListener { promise.reject("ERR_ASSET_PACK_CONFIRM", it.message, it) }
    }
  }

  private fun stateOf(packName: String, states: AssetPackStates): Map<String, Any?>? =
    states.packStates()[packName]?.let { stateOf(it) }

  private fun stateOf(it: AssetPackState): Map<String, Any?> =
    mapOf(
      "name" to it.name(),
      "status" to it.status(),
      "errorCode" to it.errorCode(),
      "bytesDownloaded" to it.bytesDownloaded().toDouble(),
      "totalBytes" to it.totalBytesToDownload().toDouble(),
    )

  companion object {
    const val PACK_STATE = "onPackState"
  }
}
