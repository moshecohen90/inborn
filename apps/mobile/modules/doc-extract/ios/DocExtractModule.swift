import ExpoModulesCore
import Foundation
import PDFKit
import UIKit
import Vision

/** PDF text + page images through PDFKit and OCR through Vision, all on the device (spec §5.5, §10.4 #30–31). */
public class DocExtractModule: Module {
  private var opened: [String: PDFDocument] = [:]
  private let queue = DispatchQueue(label: "app.inborn.doc-extract", qos: .userInitiated)

  private func url(_ uri: String) -> URL {
    if let u = URL(string: uri), u.isFileURL { return u }
    return URL(fileURLWithPath: uri.replacingOccurrences(of: "file://", with: ""))
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

    AsyncFunction("ocrLanguages") { () -> [String] in
      let request = VNRecognizeTextRequest()
      request.recognitionLevel = .accurate
      return (try? request.supportedRecognitionLanguages()) ?? []
    }

    Function("ocrEngine") { "vision" }

    /* Vision runs entirely on the device; languages outside supportedRecognitionLanguages are dropped so the request never fails on them. */
    AsyncFunction("recognizeText") { (imageUri: String, languages: [String], promise: Promise) in
      self.queue.async {
        guard let image = UIImage(contentsOfFile: self.url(imageUri).path), let cg = image.cgImage else {
          promise.reject("ERR_IMAGE", "cannot decode image")
          return
        }
        let request = VNRecognizeTextRequest { req, error in
          if let error = error {
            promise.reject("ERR_OCR", error.localizedDescription)
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
          promise.resolve(["text": lines.joined(separator: "\n"), "confidence": Double(mean)])
        }
        request.recognitionLevel = .accurate
        request.usesLanguageCorrection = true
        let supported = (try? request.supportedRecognitionLanguages()) ?? []
        let wanted = languages.filter { supported.contains($0) }
        if !wanted.isEmpty { request.recognitionLanguages = wanted }
        do {
          try VNImageRequestHandler(cgImage: cg, options: [:]).perform([request])
        } catch {
          promise.reject("ERR_OCR", error.localizedDescription)
        }
      }
    }
  }
}
