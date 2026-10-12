package com.inbornapp.mobile

import android.content.Intent
import android.media.MediaScannerConnection
import android.os.SystemClock
import android.util.Log
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.uiautomator.By
import androidx.test.uiautomator.BySelector
import androidx.test.uiautomator.UiDevice
import androidx.test.uiautomator.UiObject2
import androidx.test.uiautomator.Until
import org.junit.Assert.fail
import org.junit.FixMethodOrder
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.MethodSorters
import java.io.File
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

/**
 * Test Lab walk: Play local-testing packs -> first run on Instant -> photo + "What do you see?" -> answer.
 * Runs inside the app process, so a native crash of the app ends the instrumentation itself.
 */
@RunWith(AndroidJUnit4::class)
@FixMethodOrder(MethodSorters.NAME_ASCENDING)
class PhotoWalkTest {
  private val instr = InstrumentationRegistry.getInstrumentation()
  private val device = UiDevice.getInstance(instr)
  private val pkg = "com.inbornapp.mobile"
  private val question = "What do you see in this photo?"

  private fun log(msg: String) {
    msg.chunked(3000).forEach { Log.i(TAG, it) }
  }

  private fun sh(cmd: String): String {
    val out = try { device.executeShellCommand(cmd) } catch (e: Exception) { "ERR ${e.message}" }
    log("sh> $cmd\n${out.trim()}")
    return out
  }

  private fun dump(step: String) {
    try {
      val f = File("/sdcard/Download/walk/dump-$step.xml")
      val tmp = File(instr.targetContext.getExternalFilesDir("walk"), "dump-$step.xml")
      device.dumpWindowHierarchy(tmp)
      sh("mkdir -p /sdcard/Download/walk")
      sh("cp ${tmp.absolutePath} ${f.absolutePath}")
      sh("screencap -p /sdcard/Download/walk/shot-$step.png")
      val xml = tmp.readText()
      log("dump $step (${xml.length} chars): " + Regex("resource-id=\"([^\"]+)\"").findAll(xml).map { it.groupValues[1] }.filter { it.isNotEmpty() }.toList().distinct().joinToString(","))
      log("dump $step texts: " + Regex(" text=\"([^\"]+)\"").findAll(xml).map { it.groupValues[1] }.toList().distinct().take(60).joinToString(" | "))
    } catch (e: Exception) {
      log("dump $step failed: $e")
    }
  }

  private fun stepFail(step: String, why: String): Nothing {
    dump(step)
    log("FAIL $step: $why")
    fail("$step: $why")
    throw IllegalStateException()
  }

  private fun find(res: String): UiObject2? = device.findObject(By.res(res))

  private fun waitRes(res: String, ms: Long): UiObject2? = device.wait(Until.findObject(By.res(res)), ms)

  /** RN Markdown nests its words in child views; the answer is every text below the node. */
  private fun allText(o: UiObject2?): String {
    if (o == null) return ""
    val own = try { o.text ?: "" } catch (e: Exception) { "" }
    val kids = try { o.children } catch (e: Exception) { emptyList<UiObject2>() }
    return (listOf(own) + kids.map { allText(it) }).filter { it.isNotBlank() }.joinToString(" ")
  }

  private fun rnllamaMaps() {
    val maps = try { File("/proc/self/maps").readLines() } catch (e: Exception) { listOf("ERR $e") }
    val libs = maps.mapNotNull { l -> Regex("(lib(rn)?llama[^/\\s]*\\.so)").find(l)?.value }.distinct()
    log("LOADED_LIBS pid=${android.os.Process.myPid()} ${libs.joinToString(",")}")
  }

  private fun pid(): String = sh("pidof $pkg").trim()

  @Test
  fun a_photoFromLibrary() {
    val t0 = SystemClock.elapsedRealtime()
    log("START build=${BuildConfig.VERSION_CODE} pid=${android.os.Process.myPid()} model=${android.os.Build.MODEL} sdk=${android.os.Build.VERSION.SDK_INT} soc=${android.os.Build.SOC_MODEL}")
    sh("getprop ro.hardware.egl")
    sh("getprop ro.soc.model")

    // a. Packs into Play Core's local-testing directory.
    instr.targetContext.getExternalFilesDir(null)
    val lt = "/sdcard/Android/data/$pkg/files/local_testing"
    sh("ls -la /sdcard/Download")
    sh("mkdir -p $lt")
    sh("cp /sdcard/Download/inborn_model-master.apk /sdcard/Download/inborn_model_vision-master.apk $lt/")
    var listing = sh("ls -la $lt")
    if (!listing.contains("inborn_model_vision-master.apk")) {
      sh("mv /sdcard/Download/inborn_model-master.apk /sdcard/Download/inborn_model_vision-master.apk $lt/")
      listing = sh("ls -la $lt")
    }
    if (!listing.contains("inborn_model_vision-master.apk")) stepFail("packs", "local_testing dir has no packs")

    // b. The photo must be in MediaStore for the system picker.
    val photo = "/sdcard/Download/inborn-test-photo.jpg"
    sh("am broadcast -a android.intent.action.MEDIA_SCANNER_SCAN_FILE -d file://$photo")
    val latch = CountDownLatch(1)
    MediaScannerConnection.scanFile(instr.targetContext, arrayOf(photo), arrayOf("image/jpeg")) { p, uri -> log("scanned $p -> $uri"); latch.countDown() }
    latch.await(20, TimeUnit.SECONDS)
    sh("content query --uri content://media/external/images/media --projection _id:_display_name:date_added")

    // c. First run.
    val launch = instr.targetContext.packageManager.getLaunchIntentForPackage(pkg)!!.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK)
    instr.targetContext.startActivity(launch)
    log("pid at launch: ${pid()}")
    rnllamaMaps()
    walkFirstRun()
    log("CHAT_READY after ${(SystemClock.elapsedRealtime() - t0) / 1000}s")
    rnllamaMaps()

    // d. Photo from the library.
    openAttach()
    val photoRow = waitRes("attach-photo", 10_000) ?: stepFail("attach-photo", "no attach-photo row")
    photoRow.click()
    pickFirstImage()
    askAndWait("library", t0)
  }

  @Test
  fun b_photoFromCamera() {
    val t0 = SystemClock.elapsedRealtime()
    log("CAMERA start pid=${pid()}")
    if (waitRes("composer-input", 30_000) == null) {
      instr.targetContext.startActivity(instr.targetContext.packageManager.getLaunchIntentForPackage(pkg)!!.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
      waitRes("composer-input", 60_000) ?: stepFail("camera-chat", "chat not up")
    }
    openAttach()
    (waitRes("attach-camera", 10_000) ?: stepFail("attach-camera", "no attach-camera row")).click()
    // Runtime camera permission, then the OEM camera.
    val deadline = SystemClock.elapsedRealtime() + 60_000
    var shot = false
    var confirmed = false
    while (SystemClock.elapsedRealtime() < deadline && !confirmed) {
      val allow = device.findObject(By.res("com.android.permissioncontroller:id/permission_allow_foreground_only_button"))
        ?: device.findObject(By.res("com.android.permissioncontroller:id/permission_allow_one_time_button"))
        ?: device.findObject(By.res("com.android.permissioncontroller:id/permission_allow_button"))
      if (allow != null) { log("camera: allow permission"); allow.click(); SystemClock.sleep(1500); continue }
      if (!shot) {
        val shutter = device.findObject(By.res(java.util.regex.Pattern.compile("(?i).*shutter.*")))
          ?: device.findObject(By.desc(java.util.regex.Pattern.compile("(?i).*(shutter|take photo|capture).*")))
        if (shutter != null) { log("camera: shutter ${shutter.resourceName}"); shutter.click(); shot = true; SystemClock.sleep(3000); continue }
      } else {
        val done = device.findObject(By.res(java.util.regex.Pattern.compile("(?i).*(done|confirm|ok|btn_done|review_done).*")))
          ?: device.findObject(By.desc(java.util.regex.Pattern.compile("(?i)(done|ok|confirm|use photo|save)")))
          ?: device.findObject(By.text(java.util.regex.Pattern.compile("(?i)(done|ok|confirm|use photo|save)")))
        if (done != null) { log("camera: confirm ${done.resourceName} ${done.contentDescription}"); done.click(); confirmed = true; break }
      }
      SystemClock.sleep(1500)
    }
    if (!confirmed) stepFail("camera", "shutter=$shot, no confirm control")
    askAndWait("camera", t0)
  }

  private fun openAttach() {
    for (i in 0 until 40) {
      (waitRes("attach", 15_000) ?: stepFail("attach", "no attach button")).click()
      waitRes("attach-sheet", 5_000)
      val photo = waitRes("attach-photo", 5_000)
      val install = find("attach-install-vision")
      if (photo != null && photo.isEnabled && install == null) { log("attach sheet: photo row enabled"); return }
      if (install != null) {
        log("attach sheet: installing the photo pack")
        install.click()
        waitRes("confirm-download", 4_000)?.let { log("confirm-download"); it.click() }
      } else {
        log("attach sheet: photo row disabled, waiting (${i})")
      }
      device.pressBack()
      SystemClock.sleep(5_000)
    }
    stepFail("attach-ready", "photo row never enabled")
  }

  private fun pickFirstImage() {
    val deadline = SystemClock.elapsedRealtime() + 45_000
    while (SystemClock.elapsedRealtime() < deadline) {
      device.waitForIdle(2_000)
      val thumb = device.findObject(By.res(java.util.regex.Pattern.compile(".*:id/icon_thumbnail")))
        ?: device.findObject(By.res(java.util.regex.Pattern.compile(".*:id/(thumbnail|image|icon_image|preview_image)")))
      if (thumb != null) {
        log("picker: tap ${thumb.resourceName} in ${thumb.applicationPackage}")
        thumb.click()
        SystemClock.sleep(2_000)
        val add = device.findObject(By.res(java.util.regex.Pattern.compile(".*:id/button_add")))
          ?: device.findObject(By.text(java.util.regex.Pattern.compile("(?i)(add|done|select)( \\(1\\))?")))
        if (add != null && add.applicationPackage != pkg) { log("picker: tap ${add.resourceName ?: add.text}"); add.click() }
        if (waitRes("pending-images", 20_000) != null || waitRes("composer-input", 1_000) != null) { log("picker: back in app"); return }
      }
      SystemClock.sleep(1_500)
    }
    stepFail("picker", "no thumbnail found in the photo picker")
  }

  private fun askAndWait(tag: String, t0: Long) {
    if (waitRes("pending-images", 15_000) == null) log("$tag: pending-images not seen (continuing)")
    dump("$tag-attached")
    val input = waitRes("composer-input", 10_000) ?: stepFail("$tag-input", "no composer-input")
    input.click()
    input.text = question
    SystemClock.sleep(800)
    if (allText(find("composer-input")).isBlank()) {
      sh("input text " + question.replace(" ", "%s").replace("?", "\\?"))
    }
    val answersBefore = device.findObjects(By.res("assistant-text")).size
    val ledgersBefore = device.findObjects(By.res("ledger-toggle")).size
    val pidBefore = pid()
    val send = device.wait(Until.findObject(By.res("send").enabled(true)), 10_000) ?: stepFail("$tag-send", "send never enabled")
    val tSend = SystemClock.elapsedRealtime()
    log("$tag: SEND pid=$pidBefore answers=$answersBefore")
    send.click()
    val deadline = tSend + 6 * 60_000
    var last = ""
    var lastChange = SystemClock.elapsedRealtime()
    while (SystemClock.elapsedRealtime() < deadline) {
      SystemClock.sleep(2_000)
      val p = pid()
      if (p.isEmpty() || p != pidBefore) stepFail("$tag-crash", "app process gone (before=$pidBefore now='$p')")
      device.findObject(By.res(java.util.regex.Pattern.compile("vision-hold-(download|resume)")))?.let { log("$tag: vision-hold download"); it.click() }
      find("confirm-download")?.let { log("$tag: confirm-download"); it.click() }
      val answers = device.findObjects(By.res("assistant-text"))
      val text = if (answers.size > answersBefore) allText(answers.last()) else ""
      if (text != last) { last = text; lastChange = SystemClock.elapsedRealtime() }
      val done = device.findObjects(By.res("ledger-toggle")).size > ledgersBefore
      if (text.isNotBlank() && (done || SystemClock.elapsedRealtime() - lastChange > 20_000)) {
        rnllamaMaps()
        log("ANSWER[$tag] after ${(SystemClock.elapsedRealtime() - tSend) / 1000}s (walk ${(SystemClock.elapsedRealtime() - t0) / 1000}s) pid=${pid()}: $text")
        dump("$tag-answer")
        return
      }
    }
    stepFail("$tag-answer", "no answer in 6 min (last='$last')")
  }

  private fun walkFirstRun() {
    val deadline = SystemClock.elapsedRealtime() + 10 * 60_000
    var pickedInstant = false
    var lastLog = 0L
    while (SystemClock.elapsedRealtime() < deadline) {
      if (find("composer-input") != null && find("onboarding-model") == null) return
      val now = SystemClock.elapsedRealtime()
      when {
        find("onboarding-welcome") != null && find("onboarding-continue") != null -> { log("welcome: continue"); find("onboarding-continue")?.click() }
        find("onboarding-model") != null -> {
          if (!pickedInstant) find("model-option-instant")?.let { log("model: pick instant"); it.click(); pickedInstant = true; SystemClock.sleep(1_000) }
          val dl = find("download-model")
          val start = find("start-chatting")
          if (dl != null) { log("model: download '${dl.text ?: allText(dl)}'"); dl.click(); SystemClock.sleep(3_000) }
          else if (start != null && start.isEnabled) { log("model: start-chatting '${allText(start)}'"); start.click() }
          else if (now - lastLog > 15_000) { lastLog = now; log("model: waiting: " + listOf("model-progress", "download-failed", "play-notice", "model-needed").filter { find(it) != null }.joinToString(",") + " " + allText(find("model-source-instant"))) }
        }
        find("confirm-download") != null -> { log("confirm-download"); find("confirm-download")?.click() }
        find("onboarding-sealed") != null -> find("sealed-start")?.let { if (it.isEnabled) { log("sealed: start"); it.click() } }
        find("onboarding-lock") != null -> {
          val ls = find("lock-start")
          if (ls != null) { log("lock: start"); ls.click() } else find("lock-switch")?.let { log("lock: switch off"); it.click() }
        }
        else -> if (now - lastLog > 15_000) { lastLog = now; dump("firstrun-${now / 1000}") }
      }
      SystemClock.sleep(1_500)
    }
    stepFail("firstrun", "chat not usable within 10 min")
  }

  companion object {
    const val TAG = "InbornWalk"
  }
}
