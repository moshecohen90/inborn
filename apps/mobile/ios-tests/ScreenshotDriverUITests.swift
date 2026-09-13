import StoreKitTest
import XCTest

/// Store-screenshot driver for design/store/capture.mjs: the simulator has no other way to tap (idb's HID does not land on
/// iOS 17 under Xcode 26), so the capture script runs this test once per locale with a step list read from
/// /tmp/inborn-ss-driver-<SIMULATOR_UDID>.json (TEST_RUNNER_ variables do not reach a test-without-building run):
///   { "steps": ["launch", "waitfile:dev-run.json:reply:300", "tap:Dismiss", "dragup", "shot:chat", "open:inborn://proof", …],
///     "out": "<dir that receives <name>.png at the device's native pixel size>",
///     "docs": "<the app container's Documents directory; waitfile polls files there>" }
/// Steps: launch · terminate · open:<url> · tap:<identifier or label> · type:<text> · typein:<identifier>:<text> · key:return|shift-return · value:<identifier> · home · activate · dragup · sleep:<s> ·
/// waitfile:<file>:<key>:<s> · shot:<name>. A missing tap target is logged, not fatal (the passcode row exists only once).
/// The StoreKit Testing session is opened like PaywallUITests does, so the paywall shows the configured prices.
final class ScreenshotDriverUITests: XCTestCase {
  var session: SKTestSession?

  override func setUpWithError() throws {
    continueAfterFailure = true
    session = try? SKTestSession(configurationFileNamed: "Inborn")
    session?.disableDialogs = true
    session?.askToBuyEnabled = false
  }

  func testDrive() throws {
    let udid = ProcessInfo.processInfo.environment["SIMULATOR_UDID"] ?? "unknown"
    let cfgPath = "/tmp/inborn-ss-driver-\(udid).json"
    guard let data = FileManager.default.contents(atPath: cfgPath),
      let cfg = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
    else { XCTFail("no driver file at \(cfgPath)"); return }
    let steps = cfg["steps"] as? [String] ?? []
    let out = cfg["out"] as? String ?? NSTemporaryDirectory()
    let docs = cfg["docs"] as? String ?? ""
    NSLog("[ss] %d steps from %@", steps.count, cfgPath)
    let app = XCUIApplication()
    let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")
    for step in steps {
      let parts = step.split(separator: ":", maxSplits: 1).map(String.init)
      let cmd = parts[0]
      let arg = parts.count > 1 ? parts[1] : ""
      NSLog("[ss] %@", step)
      switch cmd {
      case "launch":
        app.launch()
        XCTAssertTrue(app.wait(for: .runningForeground, timeout: 60))
        sleep(3)
      case "terminate":
        app.terminate()
      case "home":
        /* Backgrounds the app (checklist T13: the 15 s grace, then "paused" with the partial answer kept). */
        XCUIDevice.shared.press(.home)
      case "activate":
        app.activate()
        XCTAssertTrue(app.wait(for: .runningForeground, timeout: 30))
      case "open":
        XCUIDevice.shared.system.open(URL(string: arg)!)
        let open = springboard.buttons["Open"]
        if open.waitForExistence(timeout: 2) { open.tap() }
      case "tap":
        let q = NSPredicate(format: "identifier == %@ OR label == %@ OR label BEGINSWITH %@", arg, arg, arg + ",")
        let el = app.descendants(matching: .any).matching(q).firstMatch
        if el.waitForExistence(timeout: 6) { el.tap() } else { NSLog("[ss] no element %@", arg) }
      case "type":
        app.typeText(arg)
      case "typein":
        /* Taps the field first: a RN TextInput tapped one step earlier may not yet report keyboard focus to XCTest. */
        let p = arg.split(separator: ":", maxSplits: 1).map(String.init)
        let field = app.descendants(matching: .any).matching(NSPredicate(format: "identifier == %@", p[0])).firstMatch
        if field.waitForExistence(timeout: 6) {
          var focused = false
          for _ in 0..<8 {
            field.tap(); sleep(2)
            if (field.value(forKey: "hasKeyboardFocus") as? Bool) == true { focused = true; break }
          }
          NSLog("[ss] typein focus=%d", focused ? 1 : 0)
          if focused { field.typeText(p.count > 1 ? p[1] : "") }
        } else { NSLog("[ss] no element %@", p[0]) }
      case "key":
        /* Hardware-keyboard proof (checklist T28): "return" or "shift-return" into the focused field. */
        let flags: XCUIElement.KeyModifierFlags = arg.hasPrefix("shift-") ? [.shift] : []
        app.typeKey(XCUIKeyboardKey.return, modifierFlags: flags)
      case "value":
        let q = NSPredicate(format: "identifier == %@", arg)
        let el = app.descendants(matching: .any).matching(q).firstMatch
        NSLog("[ss] value %@ = %@ | label = %@", arg, el.exists ? String(describing: el.value ?? "") : "<missing>", el.exists ? el.label : "")
      case "dragup":
        let from = app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.82))
        let to = app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.28))
        from.press(forDuration: 0.05, thenDragTo: to, withVelocity: .slow, thenHoldForDuration: 0.3)
      case "sleep":
        usleep(UInt32((Double(arg) ?? 1) * 1_000_000))
      case "waitfile":
        let p = arg.split(separator: ":").map(String.init)
        let file = docs + "/" + p[0]
        let key = "\"" + p[1] + "\""
        let deadline = Date().addingTimeInterval(Double(p[2]) ?? 120)
        var found = false
        while Date() < deadline {
          if let txt = try? String(contentsOfFile: file, encoding: .utf8), txt.contains(key) { found = true; break }
          sleep(2)
        }
        XCTAssertTrue(found, "timed out waiting for \(key) in \(p[0])")
      case "shot":
        let png = XCUIScreen.main.screenshot().pngRepresentation
        try? png.write(to: URL(fileURLWithPath: out).appendingPathComponent(arg + ".png"))
      default:
        NSLog("[ss] unknown step %@", step)
      }
    }
  }
}
