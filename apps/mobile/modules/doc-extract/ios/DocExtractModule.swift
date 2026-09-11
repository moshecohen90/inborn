import ExpoModulesCore
import Foundation
import PDFKit
import UIKit
import Vision
#if canImport(libtesseract)
import libtesseract
#endif

/** PDF text + page images through PDFKit and OCR through Vision, all on the device (spec §5.5, §10.4 #30–31). */
public class DocExtractModule: Module {
  private var opened: [String: PDFDocument] = [:]
  private let queue = DispatchQueue(label: "app.inborn.doc-extract", qos: .userInitiated)

  private func url(_ uri: String) -> URL {
    if let u = URL(string: uri), u.isFileURL { return u }
    return URL(fileURLWithPath: uri.replacingOccurrences(of: "file://", with: ""))
  }

  private func visionLanguages() -> [String] {
    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    return (try? request.supportedRecognitionLanguages()) ?? []
  }

  /* Vision speaks "en-US"; the library asks with whatever it got back or a bare "he". Match on the language subtag. */
  private func base(_ tag: String) -> String {
    return tag.lowercased().split(separator: "-").first.map(String.init) ?? tag.lowercased()
  }

  private func visionRead(_ cg: CGImage, languages: [String]) throws -> (text: String, confidence: Double) {
    var out: (String, Double) = ("", 0)
    var failure: Error?
    let request = VNRecognizeTextRequest { req, error in
      if let error = error {
        failure = error
        return
      }
      let observations = (req.results as? [VNRecognizedTextObservation]) ?? []
      var lines: [String] = []
      var confidence: Float = 0
      for o in observations {
        if let top = o.topCandidates(1).first {
          lines.append(top.string)
          confidence += top.confidence
        }
      }
      let mean = observations.isEmpty ? 0 : confidence / Float(observations.count)
      out = (lines.joined(separator: "\n"), Double(mean))
    }
    request.recognitionLevel = .accurate
    request.usesLanguageCorrection = true
    if !languages.isEmpty { request.recognitionLanguages = languages }
    try VNImageRequestHandler(cgImage: cg, options: [:]).perform([request])
    if let failure = failure { throw failure }
    return out
  }

  public func definition() -> ModuleDefinition {
    Name("DocExtract")

    OnDestroy { self.opened.removeAll() }

    AsyncFunction("openPdf") { (uri: String, promise: Promise) in
      self.queue.async {
        let fileUrl = self.url(uri)
        let size = (try? FileManager.default.attributesOfItem(atPath: fileUrl.path)[.size] as? NSNumber)?.intValue ?? 0
        if size == 0 {
          promise.reject("ERR_EMPTY", "file is empty")
          return
        }
        guard let doc = PDFDocument(url: fileUrl) else {
          promise.reject("ERR_CORRUPT", "cannot parse PDF")
          return
        }
        if doc.isLocked || doc.isEncrypted {
          promise.reject("ERR_ENCRYPTED", "password-protected PDF")
          return
        }
        let id = UUID().uuidString
        self.opened[id] = doc
        promise.resolve(["id": id, "pages": doc.pageCount])
      }
    }

    AsyncFunction("pageText") { (id: String, index: Int, promise: Promise) in
      self.queue.async {
        guard let doc = self.opened[id] else {
          promise.reject("ERR_CLOSED", "document not open")
          return
        }
        guard let page = doc.page(at: index) else {
          promise.reject("ERR_PAGE", "no page \(index)")
          return
        }
        let text = page.string ?? ""
        let blank = text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        promise.resolve(["text": text, "needsOcr": blank])
      }
    }

    AsyncFunction("renderPage") { (id: String, index: Int, scale: Double, promise: Promise) in
      self.queue.async {
        guard let doc = self.opened[id], let page = doc.page(at: index) else {
          promise.reject("ERR_CLOSED", "document not open")
          return
        }
        let bounds = page.bounds(for: .mediaBox)
        let size = CGSize(width: min(4096, max(64, bounds.width * scale)), height: min(4096, max(64, bounds.height * scale)))
        let image = page.thumbnail(of: size, for: .mediaBox)
        guard let png = image.pngData() else {
          promise.reject("ERR_RENDER", "cannot encode page")
          return
        }
        let out = FileManager.default.temporaryDirectory.appendingPathComponent("doc-extract-\(id.prefix(8))-\(index).png")
        do {
          try png.write(to: out)
          promise.resolve(out.absoluteString)
        } catch {
          promise.reject("ERR_RENDER", error.localizedDescription)
        }
      }
    }

    AsyncFunction("closePdf") { (id: String) in
      self.opened.removeValue(forKey: id)
    }

    /* Vision's list plus the scripts only the bundled Tesseract data can read (Hebrew: Vision has none as of iOS 26). */
    AsyncFunction("ocrLanguages") { () -> [String] in
      var langs = self.visionLanguages()
      for code in TessOcr.bundledLanguages() {
        let tag = TessOcr.bcp47(code)
        if !langs.contains(where: { self.base($0) == tag }) { langs.append(tag) }
      }
      return langs
    }

    Function("ocrEngine") { TessOcr.available() ? "vision+tesseract" : "vision" }

    /* Vision reads what it supports; a requested script it lacks goes to Tesseract, and the read that carries the page wins. */
    AsyncFunction("recognizeText") { (imageUri: String, languages: [String], promise: Promise) in
      self.queue.async {
        guard let image = UIImage(contentsOfFile: self.url(imageUri).path), let cg = image.cgImage else {
          promise.reject("ERR_IMAGE", "cannot decode image")
          return
        }
        let supported = self.visionLanguages()
        let forVision = supported.filter { s in languages.contains { self.base($0) == self.base(s) } }
        let bundled = TessOcr.bundledLanguages()
        let forTess = languages.map { TessOcr.tessCode($0) }.filter { code in bundled.contains(code) && !supported.contains { self.base($0) == TessOcr.bcp47(code) } }
        var vision: (text: String, confidence: Double) = ("", 0)
        var visionError: Error?
        do {
          vision = try self.visionRead(cg, languages: forVision)
        } catch {
          visionError = error
        }
        var best: (text: String, confidence: Double, engine: String) = (vision.text, vision.confidence, "vision")
        if !forTess.isEmpty {
          /* English rides along so a mixed page keeps its Latin words in the same pass. */
          let langs = (forTess + (bundled.contains("eng") ? ["eng"] : [])).joined(separator: "+")
          if let tess = TessOcr.recognize(cg, languages: langs) {
            let script = TessOcr.scriptShare(tess.text, languages: forTess)
            let visionEmpty = vision.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            if visionEmpty || (tess.confidence >= 0.5 && script >= 0.3) || tess.confidence > vision.confidence {
              best = (tess.text, tess.confidence, "tesseract")
            }
          }
        }
        if let visionError = visionError, best.engine == "vision" {
          promise.reject("ERR_OCR", visionError.localizedDescription)
          return
        }
        promise.resolve(["text": best.text, "confidence": best.confidence, "engine": best.engine])
      }
    }
  }
}

/** Tesseract 4.1 (libtesseract.xcframework) with the traineddata bundled at build time from INBORN_MODELS_DIR/ocr; absent in a build without them. */
enum TessOcr {
  static func tessCode(_ tag: String) -> String {
    switch tag.lowercased().split(separator: "-").first.map(String.init) ?? tag.lowercased() {
    case "he", "iw": return "heb"
    case "en": return "eng"
    case let other: return other
    }
  }

  static func bcp47(_ code: String) -> String {
    switch code {
    case "heb": return "he"
    case "eng": return "en"
    default: return code
    }
  }

  static func scriptShare(_ text: String, languages: [String]) -> Double {
    let letters = text.unicodeScalars.filter { CharacterSet.letters.contains($0) }
    guard !letters.isEmpty else { return 0 }
    let hebrew = languages.contains("heb")
    let hits = letters.filter { s in hebrew && (0x0590...0x05FF).contains(s.value) }
    return Double(hits.count) / Double(letters.count)
  }

  static var dataDir: URL? {
    guard let bundle = Bundle.main.url(forResource: "DocExtractOcr", withExtension: "bundle") else { return nil }
    let dir = bundle.appendingPathComponent("tessdata")
    return FileManager.default.fileExists(atPath: dir.path) ? dir : nil
  }

  static func available() -> Bool {
    #if canImport(libtesseract)
    return dataDir != nil
    #else
    return false
    #endif
  }

  static func bundledLanguages() -> [String] {
    guard available(), let dir = dataDir, let names = try? FileManager.default.contentsOfDirectory(atPath: dir.path) else { return [] }
    return names.filter { $0.hasSuffix(".traineddata") }.map { String($0.dropLast(".traineddata".count)) }.sorted()
  }

  static func recognize(_ cg: CGImage, languages: String) -> (text: String, confidence: Double)? {
    #if canImport(libtesseract)
    guard let dir = dataDir, let api = TessBaseAPICreate() else { return nil }
    defer {
      TessBaseAPIEnd(api)
      TessBaseAPIDelete(api)
    }
    guard TessBaseAPIInit3(api, dir.path, languages) == 0 else { return nil }
    TessBaseAPISetPageSegMode(api, PSM_AUTO)
    let width = cg.width
    let height = cg.height
    var pixels = [UInt8](repeating: 0, count: width * height * 4)
    let drawn = pixels.withUnsafeMutableBytes { buf -> Bool in
      guard let ctx = CGContext(data: buf.baseAddress, width: width, height: height, bitsPerComponent: 8, bytesPerRow: width * 4, space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { return false }
      ctx.draw(cg, in: CGRect(x: 0, y: 0, width: width, height: height))
      return true
    }
    guard drawn else { return nil }
    return pixels.withUnsafeBufferPointer { buf -> (String, Double)? in
      TessBaseAPISetImage(api, buf.baseAddress, Int32(width), Int32(height), 4, Int32(width * 4))
      guard let raw = TessBaseAPIGetUTF8Text(api) else { return nil }
      defer { TessDeleteText(raw) }
      let text = String(cString: raw).trimmingCharacters(in: .whitespacesAndNewlines)
      return (text, Double(TessBaseAPIMeanTextConf(api)) / 100)
    }
    #else
    return nil
    #endif
  }
}
