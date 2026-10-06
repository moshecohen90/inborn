// A plain multi-page PDF with a text layer from a UTF-8 text file: US Letter, Times 11.5 pt unless given, text flowed over pages
// with CoreText, so each page carries 3,000 to 4,000 characters like the founder's file.
// Usage: swift make_pdf.swift <in.txt> <out.pdf> [points]
import AppKit
import CoreText

let args = CommandLine.arguments
let text = try! String(contentsOfFile: args[1], encoding: .utf8)
var box = CGRect(x: 0, y: 0, width: 612, height: 792)
let ctx = CGContext(URL(fileURLWithPath: args[2]) as CFURL, mediaBox: &box, nil)!
let font = CTFontCreateWithName("Times-Roman" as CFString, args.count > 3 ? CGFloat(Double(args[3])!) : 11.5, nil)
let para = NSMutableParagraphStyle()
para.paragraphSpacing = 6
let attributed = NSAttributedString(string: text, attributes: [.font: font, .paragraphStyle: para])
let setter = CTFramesetterCreateWithAttributedString(attributed)
var at = 0
var pages = 0
while at < attributed.length {
  ctx.beginPDFPage(nil)
  let path = CGPath(rect: box.insetBy(dx: 64, dy: 64), transform: nil)
  let frame = CTFramesetterCreateFrame(setter, CFRange(location: at, length: 0), path, nil)
  CTFrameDraw(frame, ctx)
  ctx.endPDFPage()
  at += CTFrameGetVisibleStringRange(frame).length
  pages += 1
}
ctx.closePDF()
print("\(args[2]): \(pages) pages")
