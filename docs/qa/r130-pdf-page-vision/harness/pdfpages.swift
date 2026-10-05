// What the iPhone's DocExtract module sees of a PDF: each page's PDFKit text (pageText), its ink (pageInk, the same
// 128 px render and cut at 96) and a scale-2 render (renderPage). Writes <out>/<name>.json and <out>/<name>-p<n>.png.
// Usage: swift pdfpages.swift <out dir> <file.pdf>...
import AppKit
import PDFKit

func ink(_ page: PDFPage) -> Double {
  let bounds = page.bounds(for: .mediaBox)
  let s = 128 / max(bounds.width, bounds.height, 1)
  let w = max(1, Int((bounds.width * s).rounded())), h = max(1, Int((bounds.height * s).rounded()))
  guard let cg = page.thumbnail(of: CGSize(width: w, height: h), for: .mediaBox).cgImage(forProposedRect: nil, context: nil, hints: nil),
        let ctx = CGContext(data: nil, width: w, height: h, bitsPerComponent: 8, bytesPerRow: w * 4, space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue),
        let data = ctx.data else { return 0 }
  ctx.setFillColor(CGColor(red: 1, green: 1, blue: 1, alpha: 1))
  ctx.fill(CGRect(x: 0, y: 0, width: w, height: h))
  ctx.draw(cg, in: CGRect(x: 0, y: 0, width: w, height: h))
  let px = data.bindMemory(to: UInt8.self, capacity: w * h * 4)
  var inked = 0
  for i in 0..<(w * h) where 255 - Int(min(px[i * 4], px[i * 4 + 1], px[i * 4 + 2])) > 96 { inked += 1 }
  return Double(inked) / Double(w * h)
}

let out = URL(fileURLWithPath: CommandLine.arguments[1])
for path in CommandLine.arguments.dropFirst(2) {
  let url = URL(fileURLWithPath: path)
  let name = url.deletingPathExtension().lastPathComponent
  let doc = PDFDocument(url: url)!
  var pages: [[String: Any]] = []
  for i in 0..<doc.pageCount {
    let page = doc.page(at: i)!
    let b = page.bounds(for: .mediaBox)
    let img = page.thumbnail(of: CGSize(width: b.width * 2, height: b.height * 2), for: .mediaBox)
    let rep = NSBitmapImageRep(cgImage: img.cgImage(forProposedRect: nil, context: nil, hints: nil)!)
    let png = out.appendingPathComponent("\(name)-p\(i + 1).png")
    try! rep.representation(using: .png, properties: [:])!.write(to: png)
    pages.append(["page": i + 1, "text": page.string ?? "", "ink": ink(page), "render": png.path])
  }
  let json = try! JSONSerialization.data(withJSONObject: ["name": name, "pages": pages], options: [.prettyPrinted])
  try! json.write(to: out.appendingPathComponent("\(name).json"))
  print(name, pages.map { String(format: "p%d ink=%.3f", $0["page"] as! Int, $0["ink"] as! Double) }.joined(separator: " "))
}
