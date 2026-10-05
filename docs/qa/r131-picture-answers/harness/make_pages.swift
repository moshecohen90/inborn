// Builds the two round-131 fixtures from CC0 photos of the v1 baseline (licences in its fixtures/SOURCES.md):
// slide-chart.pdf (a 16:9 slide: title, the Titanic bar charts, one caption line) and receipt-photo.pdf (the
// Alexander's Supermarket receipt photographed on a table, with a short OCR-like text layer as a searchable scan has).
// Usage: swift make_pages.swift <photos dir> <out dir>
import AppKit
import CoreText

let args = CommandLine.arguments
let photos = URL(fileURLWithPath: args[1])
let outDir = URL(fileURLWithPath: args[2])

func page(_ name: String, width: CGFloat, height: CGFloat, draw: (CGContext, CGRect) -> Void) {
  var box = CGRect(x: 0, y: 0, width: width, height: height)
  let ctx = CGContext(outDir.appendingPathComponent(name) as CFURL, mediaBox: &box, nil)!
  ctx.beginPDFPage(nil)
  NSGraphicsContext.current = NSGraphicsContext(cgContext: ctx, flipped: false)
  draw(ctx, box)
  NSGraphicsContext.current = nil
  ctx.endPDFPage()
  ctx.closePDF()
  print("wrote", name)
}
func rect(_ box: CGRect, _ x: CGFloat, _ y: CGFloat, _ w: CGFloat, _ h: CGFloat) -> CGRect { CGRect(x: x, y: box.height - y - h, width: w, height: h) }
func fill(_ r: CGRect, _ c: NSColor) {
  c.setFill()
  NSBezierPath(rect: r).fill()
}
func text(_ s: String, _ r: CGRect, size: CGFloat, color: NSColor = .black, bold: Bool = false, align: NSTextAlignment = .left) {
  let p = NSMutableParagraphStyle()
  p.alignment = align
  let font = bold ? NSFont.boldSystemFont(ofSize: size) : NSFont.systemFont(ofSize: size)
  NSAttributedString(string: s, attributes: [.font: font, .foregroundColor: color, .paragraphStyle: p]).draw(in: r)
}
func image(_ name: String) -> NSImage { NSImage(contentsOf: photos.appendingPathComponent(name))! }

page("slide-chart.pdf", width: 960, height: 540) { _, box in
  fill(box, .white)
  fill(rect(box, 0, 0, 960, 8), NSColor(calibratedRed: 0.1, green: 0.25, blue: 0.5, alpha: 1))
  text("Who survived the Titanic?", rect(box, 48, 28, 600, 44), size: 32, bold: true)
  text("Passengers and crew by class, 1912", rect(box, 48, 74, 600, 24), size: 16, color: .darkGray)
  /* The top two charts of the source image: count by class, and survived/died stacked by class. */
  let chart = image("titanic-survivor-by-class-bar-charts.jpg")
  let src = NSRect(x: 0, y: chart.size.height * (1 - 345 / 1024), width: chart.size.width, height: chart.size.height * (345 / 1024))
  chart.draw(in: rect(box, 60, 112, 840, 352), from: src, operation: .sourceOver, fraction: 1)
  text("Crew and third class had the most deaths.", rect(box, 48, 490, 700, 24), size: 16)
  text("7", rect(box, 880, 500, 40, 20), size: 12, color: .gray, align: .right)
}

page("receipt-photo.pdf", width: 600, height: 800) { ctx, box in
  fill(box, NSColor(calibratedRed: 0.36, green: 0.25, blue: 0.17, alpha: 1))
  let receipt = image("alexander-s-supermarket-receipt-late-twentieth-cen.jpg")
  ctx.saveGState()
  ctx.translateBy(x: 300, y: 400)
  ctx.rotate(by: -0.05)
  receipt.draw(in: CGRect(x: -175, y: -355, width: 350, height: 710))
  ctx.restoreGState()
  /* A searchable scan's OCR layer: drawn as invisible text, the way scanner apps lay it over the photo. */
  ctx.setTextDrawingMode(.invisible)
  for (i, line) in ["ALEXANDER'S HANOVER ST", "THE SUPER MARKET", "GROCERY .60", "TUNA SALAD SAND 1.99", "TOTAL $ 39.99", "CASH TEND 40.00", "TAX PAID .14"].enumerated() {
    let attr = NSAttributedString(string: line, attributes: [.font: NSFont.systemFont(ofSize: 10)])
    ctx.textPosition = CGPoint(x: 150, y: 700 - CGFloat(i) * 90)
    CTLineDraw(CTLineCreateWithAttributedString(attr), ctx)
  }
}
