// Builds fixtures/visual-page.pdf: one phone-sized page that is mostly pictures (two CC0 photos from the v1 baseline)
// with ~200 characters of short Hebrew and English UI labels as a real text layer, the shape of a shop-page capture.
// Usage: swift make_visual_pdf.swift <photos dir> <out.pdf>
import AppKit
import CoreText

let args = CommandLine.arguments
let photos = URL(fileURLWithPath: args[1])
let out = URL(fileURLWithPath: args[2])
var box = CGRect(x: 0, y: 0, width: 390, height: 680)
let ctx = CGContext(out as CFURL, mediaBox: &box, nil)!
ctx.beginPDFPage(nil)
let g = NSGraphicsContext(cgContext: ctx, flipped: false)
NSGraphicsContext.current = g

/* Top-left coordinates, the way a screen capture reads. */
func rect(_ x: CGFloat, _ y: CGFloat, _ w: CGFloat, _ h: CGFloat) -> CGRect { CGRect(x: x, y: box.height - y - h, width: w, height: h) }
func fill(_ r: CGRect, _ c: NSColor, radius: CGFloat = 0) {
  c.setFill()
  NSBezierPath(roundedRect: r, xRadius: radius, yRadius: radius).fill()
}
func text(_ s: String, _ r: CGRect, size: CGFloat, color: NSColor = .black, bold: Bool = false, align: NSTextAlignment = .center) {
  let p = NSMutableParagraphStyle()
  p.alignment = align
  p.baseWritingDirection = .natural
  let font = bold ? NSFont.boldSystemFont(ofSize: size) : NSFont.systemFont(ofSize: size)
  NSAttributedString(string: s, attributes: [.font: font, .foregroundColor: color, .paragraphStyle: p]).draw(in: r)
}
func photo(_ name: String, _ r: CGRect) {
  let img = NSImage(contentsOf: photos.appendingPathComponent(name))!
  ctx.saveGState()
  NSBezierPath(roundedRect: r, xRadius: 14, yRadius: 14).addClip()
  img.draw(in: r)
  ctx.restoreGState()
}

fill(box, .white)
fill(rect(0, 0, 390, 34), NSColor(calibratedRed: 0.12, green: 0.2, blue: 0.18, alpha: 1))
text("משלוח חינם בהזמנה מעל 150 ₪", rect(10, 9, 370, 18), size: 12, color: .white, bold: true)
text("NORTHWIND", rect(16, 46, 160, 26), size: 20, bold: true, align: .left)
text("Search   Account   Cart", rect(190, 52, 185, 18), size: 11, color: .darkGray, align: .right)
fill(rect(0, 84, 390, 1), .lightGray)
text("1 בחירה  ·  2 התאמה  ·  3 תשלום", rect(20, 96, 350, 18), size: 12, color: .darkGray)
photo("dogs-at-marymoor-park-3618931116.jpg", rect(15, 126, 360, 239))
photo("polka-dot-mug-unsplash.jpg", rect(15, 377, 360, 240))
fill(rect(190, 560, 180, 44), NSColor(calibratedWhite: 0.97, alpha: 1), radius: 12)
text("היי! איך נוכל לעזור?", rect(196, 572, 168, 18), size: 12)
fill(rect(15, 630, 172, 36), NSColor(calibratedWhite: 0.92, alpha: 1), radius: 18)
text("Back", rect(15, 639, 172, 18), size: 13)
fill(rect(203, 630, 172, 36), NSColor(calibratedRed: 0.12, green: 0.2, blue: 0.18, alpha: 1), radius: 18)
text("Continue to checkout", rect(203, 639, 172, 18), size: 13, color: .white, bold: true)

NSGraphicsContext.current = nil
ctx.endPDFPage()
ctx.closePDF()
print("wrote", out.path)
