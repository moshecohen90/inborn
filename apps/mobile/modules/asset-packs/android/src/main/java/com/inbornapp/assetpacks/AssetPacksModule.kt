package com.inbornapp.assetpacks

import com.google.android.play.core.assetpacks.AssetPackManager
import com.google.android.play.core.assetpacks.AssetPackManagerFactory
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

  override fun definition() = ModuleDefinition {
    Name("AssetPacks")

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
  }

  private fun stateOf(packName: String, states: AssetPackStates): Map<String, Any?>? =
    states.packStates()[packName]?.let {
      mapOf(
        "name" to it.name(),
        "status" to it.status(),
        "errorCode" to it.errorCode(),
        "bytesDownloaded" to it.bytesDownloaded().toDouble(),
        "totalBytes" to it.totalBytesToDownload().toDouble(),
      )
    }
}
