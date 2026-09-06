package com.inbornapp.docextract

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.pdf.PdfRenderer
import android.os.ParcelFileDescriptor
import com.googlecode.tesseract.android.TessBaseAPI
import com.tom_roush.pdfbox.android.PDFBoxResourceLoader
import com.tom_roush.pdfbox.pdmodel.PDDocument
import com.tom_roush.pdfbox.pdmodel.encryption.InvalidPasswordException
import com.tom_roush.pdfbox.text.PDFTextStripper
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.io.FileOutputStream
import java.util.UUID
import java.util.concurrent.Executors

/**
 * PDF text + page images + OCR, all on the device (spec §5.5, §10.4 #30–31). pdfbox-android reads the text layer,
 * PdfRenderer rasterizes pages for OCR, Tesseract reads scans with the traineddata bundled in the APK.
 */
class DocExtractModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  private class Opened(val file: File, val doc: PDDocument)

  private val opened = HashMap<String, Opened>()
  private val worker = Executors.newSingleThreadExecutor { r -> Thread(r, "doc-extract") }
  private var tess: TessBaseAPI? = null
  private var tessLangs: String? = null

  private fun path(uri: String): File = File(uri.removePrefix("file://"))

  override fun definition() = ModuleDefinition {
    Name("DocExtract")

    OnCreate { PDFBoxResourceLoader.init(context) }

    OnDestroy {
      for (o in opened.values) runCatching { o.doc.close() }
      opened.clear()
      tess?.recycle()
      tess = null
    }

    AsyncFunction("openPdf") { uri: String, promise: Promise ->
      worker.execute {
        try {
          val file = path(uri)
          if (!file.exists() || file.length() == 0L) throw ExtractException("ERR_EMPTY", "file is empty")
          val doc = try {
            PDDocument.load(file)
          } catch (e: InvalidPasswordException) {
            throw ExtractException("ERR_ENCRYPTED", "password-protected PDF")
          } catch (e: Exception) {
            throw ExtractException("ERR_CORRUPT", e.message ?: "cannot parse PDF")
          }
          if (doc.isEncrypted) {
            doc.close()
            throw ExtractException("ERR_ENCRYPTED", "encrypted PDF")
          }
          val id = UUID.randomUUID().toString()
          opened[id] = Opened(file, doc)
          promise.resolve(mapOf("id" to id, "pages" to doc.numberOfPages))
        } catch (e: ExtractException) {
          promise.reject(e.code, e.message, e)
        } catch (e: Throwable) {
          promise.reject("ERR_CORRUPT", e.message, e)
        }
      }
    }

    AsyncFunction("pageText") { id: String, index: Int, promise: Promise ->
      worker.execute {
        try {
          val o = opened[id] ?: throw ExtractException("ERR_CLOSED", "document not open")
          val stripper = PDFTextStripper()
          stripper.startPage = index + 1
          stripper.endPage = index + 1
          stripper.sortByPosition = true
          val text = stripper.getText(o.doc)
          promise.resolve(mapOf("text" to text, "needsOcr" to text.isBlank()))
        } catch (e: ExtractException) {
          promise.reject(e.code, e.message, e)
        } catch (e: Throwable) {
          promise.reject("ERR_PAGE", e.message, e)
        }
      }
    }

    /* PdfRenderer opens the file by descriptor, independent of the pdfbox handle, so both can stay open. */
    AsyncFunction("renderPage") { id: String, index: Int, scale: Double, promise: Promise ->
      worker.execute {
        try {
          val o = opened[id] ?: throw ExtractException("ERR_CLOSED", "document not open")
          val pfd = ParcelFileDescriptor.open(o.file, ParcelFileDescriptor.MODE_READ_ONLY)
          val renderer = PdfRenderer(pfd)
          val page = renderer.openPage(index)
          val w = (page.width * scale).toInt().coerceIn(64, 4096)
          val h = (page.height * scale).toInt().coerceIn(64, 4096)
          val bitmap = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
          Canvas(bitmap).drawColor(Color.WHITE)
          page.render(bitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
          page.close()
          renderer.close()
          pfd.close()
          val out = File(context.cacheDir, "doc-extract-${id.take(8)}-$index.png")
          FileOutputStream(out).use { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }
          bitmap.recycle()
          promise.resolve("file://${out.absolutePath}")
        } catch (e: ExtractException) {
          promise.reject(e.code, e.message, e)
        } catch (e: Throwable) {
          promise.reject("ERR_RENDER", e.message, e)
        }
      }
    }

    AsyncFunction("closePdf") { id: String, promise: Promise ->
      worker.execute {
        opened.remove(id)?.let { runCatching { it.doc.close() } }
        promise.resolve(null)
      }
    }

    AsyncFunction("ocrLanguages") { promise: Promise ->
      promise.resolve(bundledLanguages())
    }

    Function("ocrEngine") { "tesseract" }

    AsyncFunction("recognizeText") { imageUri: String, languages: List<String>, promise: Promise ->
      worker.execute {
        try {
          val available = bundledLanguages()
          val langs = languages.map { toTess(it) }.filter { available.contains(it) }.ifEmpty { available.take(1) }
          if (langs.isEmpty()) throw ExtractException("ERR_NO_OCR", "no OCR language data bundled")
          val api = tessFor(langs.joinToString("+"))
          val bitmap = android.graphics.BitmapFactory.decodeFile(path(imageUri).absolutePath) ?: throw ExtractException("ERR_IMAGE", "cannot decode image")
          api.setImage(bitmap)
          val text = api.utF8Text ?: ""
          val confidence = api.meanConfidence()
          api.clear()
          bitmap.recycle()
          promise.resolve(mapOf("text" to text, "confidence" to confidence / 100.0))
        } catch (e: ExtractException) {
          promise.reject(e.code, e.message, e)
        } catch (e: Throwable) {
          promise.reject("ERR_OCR", e.message, e)
        }
      }
    }
  }

  private fun toTess(tag: String): String = when (tag.lowercase().split("-")[0]) {
    "he", "iw" -> "heb"
    "en" -> "eng"
    else -> tag.lowercase()
  }

  /* Language files ship as APK assets (never downloaded); Tesseract needs them on disk, so they are copied once. */
  private fun tessDataDir(): File {
    val dir = File(context.filesDir, "tessdata")
    if (!dir.exists()) dir.mkdirs()
    val names = context.assets.list("tessdata") ?: emptyArray()
    for (name in names) {
      val target = File(dir, name)
      if (!target.exists()) {
        context.assets.open("tessdata/$name").use { input -> FileOutputStream(target).use { input.copyTo(it) } }
      }
    }
    return dir
  }

  private fun bundledLanguages(): List<String> =
    (context.assets.list("tessdata") ?: emptyArray()).filter { it.endsWith(".traineddata") }.map { it.removeSuffix(".traineddata") }.sorted()

  private fun tessFor(langs: String): TessBaseAPI {
    val current = tess
    if (current != null && tessLangs == langs) return current
    current?.recycle()
    val api = TessBaseAPI()
    val dataDir = tessDataDir()
    if (!api.init(dataDir.parentFile!!.absolutePath, langs)) throw ExtractException("ERR_NO_OCR", "tesseract init failed for $langs")
    api.pageSegMode = TessBaseAPI.PageSegMode.PSM_AUTO
    tess = api
    tessLangs = langs
    return api
  }
}

class ExtractException(val code: String, message: String) : Exception(message)
