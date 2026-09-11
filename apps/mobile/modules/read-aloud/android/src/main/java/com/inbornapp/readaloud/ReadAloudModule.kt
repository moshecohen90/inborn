package com.inbornapp.readaloud

import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.Locale

/**
 * Read-aloud on Android with an explicit engine (QA T44): the default synthesiser is bound only when it reports the
 * language, another installed engine otherwise, none when no voice exists. Every engine is asked what it can do
 * (isLanguageAvailable, local voices) before any text goes to it; nothing here opens an activity.
 */
class ReadAloudModule : Module() {
  private var tts: TextToSpeech? = null
  private var boundEngine: String? = null
  private val main = Handler(Looper.getMainLooper())

  override fun definition() = ModuleDefinition {
    Name("ReadAloud")

    Events("onStart", "onDone", "onError")

    /** Installed synthesisers; `isDefault` follows the system setting. */
    Function("engines") {
      val ctx = context()
      val default = try { Settings.Secure.getString(ctx.contentResolver, "tts_default_synth") } catch (_: Exception) { null }
      val pm = ctx.packageManager
      val services = pm.queryIntentServices(Intent(TextToSpeech.Engine.INTENT_ACTION_TTS_SERVICE), 0)
      services.map { r ->
        val pkg = r.serviceInfo.packageName
        mapOf("name" to pkg, "label" to r.loadLabel(pm).toString(), "isDefault" to (pkg == default))
      }
    }

    /** Binds the engine and reports whether it has an installed, offline voice for the language. */
    AsyncFunction("probe") { engine: String, language: String, promise: Promise ->
      bind(engine) { t ->
        if (t == null) return@bind promise.resolve(mapOf("available" to false, "voices" to emptyList<String>()))
        val locale = localeOf(language)
        val availability = try { t.isLanguageAvailable(locale) } catch (_: Exception) { TextToSpeech.LANG_NOT_SUPPORTED }
        val voices = try {
          t.voices.filter { v -> v.locale.language == locale.language && !v.isNetworkConnectionRequired && !v.features.contains(TextToSpeech.Engine.KEY_FEATURE_NOT_INSTALLED) }.map { it.name }
        } catch (_: Exception) { emptyList() }
        val available = availability >= TextToSpeech.LANG_AVAILABLE && (voices.isNotEmpty() || availability >= TextToSpeech.LANG_COUNTRY_AVAILABLE)
        promise.resolve(mapOf("available" to available, "voices" to voices))
      }
    }

    AsyncFunction("speak") { engine: String, text: String, language: String, voice: String?, rate: Float, id: String, promise: Promise ->
      bind(engine) { t ->
        if (t == null) {
          promise.reject(CodedException("ERR_TTS_BIND", "engine $engine did not initialise", null))
          return@bind
        }
        try {
          t.setSpeechRate(rate)
          t.language = localeOf(language)
          if (voice != null) t.voices.firstOrNull { it.name == voice }?.let(t::setVoice)
          val r = t.speak(text, TextToSpeech.QUEUE_ADD, Bundle(), id)
          if (r == TextToSpeech.SUCCESS) promise.resolve(null) else promise.reject(CodedException("ERR_TTS_SPEAK", "speak returned $r", null))
        } catch (e: Exception) {
          promise.reject(CodedException("ERR_TTS_SPEAK", e.message ?: "speak failed", e))
        }
      }
    }

    AsyncFunction("stop") {
      try { tts?.stop() } catch (_: Exception) {}
    }

    OnActivityDestroys { release() }
  }

  private fun context(): Context = appContext.reactContext ?: throw CodedException("ERR_NO_CONTEXT", "no context", null)

  private fun localeOf(tag: String): Locale = Locale.forLanguageTag(tag.replace('_', '-'))

  private fun release() {
    try { tts?.shutdown() } catch (_: Exception) {}
    tts = null
    boundEngine = null
  }

  /** One bound engine at a time; a second engine replaces the first. `ready` runs on the main thread with null when init failed or timed out. */
  private fun bind(engine: String, ready: (TextToSpeech?) -> Unit) {
    main.post {
      val current = tts
      if (current != null && boundEngine == engine) return@post ready(current)
      release()
      var settled = false
      var instance: TextToSpeech? = null
      val timeout = Runnable {
        if (settled) return@Runnable
        settled = true
        try { instance?.shutdown() } catch (_: Exception) {}
        ready(null)
      }
      main.postDelayed(timeout, 6000)
      instance = TextToSpeech(context(), { status ->
        main.post {
          if (settled) return@post
          settled = true
          main.removeCallbacks(timeout)
          if (status != TextToSpeech.SUCCESS) {
            try { instance?.shutdown() } catch (_: Exception) {}
            return@post ready(null)
          }
          val t = instance!!
          t.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
            override fun onStart(utteranceId: String) { sendEvent("onStart", mapOf("id" to utteranceId)) }
            override fun onDone(utteranceId: String) { sendEvent("onDone", mapOf("id" to utteranceId)) }
            override fun onStop(utteranceId: String, interrupted: Boolean) { sendEvent("onDone", mapOf("id" to utteranceId, "stopped" to true)) }
            @Deprecated("Deprecated in Java")
            override fun onError(utteranceId: String) { sendEvent("onError", mapOf("id" to utteranceId)) }
            override fun onError(utteranceId: String, errorCode: Int) { sendEvent("onError", mapOf("id" to utteranceId, "code" to errorCode)) }
          })
          tts = t
          boundEngine = engine
          ready(t)
        }
      }, engine)
    }
  }
}
