// Window ids for `screencapture -l` — metadata only, no input events, no screen capture here.
import CoreGraphics
import Foundation

let owner = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : ""
let options: CGWindowListOption = [.optionOnScreenOnly, .excludeDesktopElements]
guard let list = CGWindowListCopyWindowInfo(options, kCGNullWindowID) as? [[String: Any]] else { exit(1) }
for window in list {
  let name = window[kCGWindowOwnerName as String] as? String ?? ""
  guard owner.isEmpty || name.localizedCaseInsensitiveContains(owner) else { continue }
  let bounds = window[kCGWindowBounds as String] as? [String: Any] ?? [:]
  let title = window[kCGWindowName as String] as? String ?? ""
  print("\(window[kCGWindowNumber as String] as? Int ?? -1)\t\(title)\t\(bounds["Width"] ?? 0)\t\(bounds["Height"] ?? 0)")
}
