// Window ids for `screencapture -l` — metadata only, no input events, no screen capture here.
import CoreGraphics
import Foundation

let owner = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : ""
// "all" also lists a window the window server currently calls off-screen — a Space switch or a full-screen
// app on another Space does that to a healthy window, and an unattended run must still be able to image it.
let all = CommandLine.arguments.contains("all")
// A second copy of the app leaves its own window on the list, and imaging that one photographs a run that is
// not happening: `pid` keeps every capture on the process the control socket answers for.
let pid = CommandLine.arguments.firstIndex(of: "pid").flatMap { CommandLine.arguments.indices.contains($0 + 1) ? Int(CommandLine.arguments[$0 + 1]) : nil }
let options: CGWindowListOption = all ? [.optionAll, .excludeDesktopElements] : [.optionOnScreenOnly, .excludeDesktopElements]
guard let list = CGWindowListCopyWindowInfo(options, kCGNullWindowID) as? [[String: Any]] else { exit(1) }
for window in list {
  let name = window[kCGWindowOwnerName as String] as? String ?? ""
  guard owner.isEmpty || name.localizedCaseInsensitiveContains(owner) else { continue }
  if let pid, window[kCGWindowOwnerPID as String] as? Int != pid { continue }
  let bounds = window[kCGWindowBounds as String] as? [String: Any] ?? [:]
  let title = window[kCGWindowName as String] as? String ?? ""
  print("\(window[kCGWindowNumber as String] as? Int ?? -1)\t\(title)\t\(bounds["Width"] ?? 0)\t\(bounds["Height"] ?? 0)")
}
