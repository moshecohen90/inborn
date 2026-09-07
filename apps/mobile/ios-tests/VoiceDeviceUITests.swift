import StoreKitTest
import XCTest

/// Real-phone voice driver (M5b verification): the step list comes from the VOICE_STEPS environment variable
/// (";"-separated, written into the .xctestrun EnvironmentVariables), because a device runner has no shared /tmp.
///   launch · terminate · sleep:<s> · open:<url> · tap:<id|label> · longpress:<id>[:<s>] · type:<text> · shot:<name> ·
///   allow:<s> (taps Allow/OK on system permission alerts for up to <s> seconds) · waitexist:<id>:<s> ·
///   waitlabel:<id>:<substring>:<s> · value:<id> (logs label + value) · log:<text>
/// Everything is logged into the attachment driver-log.txt; screenshots are attachments too (xcresulttool export).
final class VoiceDeviceUITests: XCTestCase {
  var session: SKTestSession?
  var lines: [String] = []

  override func setUpWithError() throws {
    continueAfterFailure = true
    session = try? SKTestSession(configurationFileNamed: "Inborn")
    session?.disableDialogs = true
    session?.askToBuyEnabled = false
  }

  private func log(_ s: String) {
    let line = "\(Int(Date().timeIntervalSince1970 * 1000)) \(s)"
    lines.append(line)
    NSLog("[voice] %@", s)
  }

  private func find(_ app: XCUIApplication, _ arg: String) -> XCUIElement {
    let q = NSPredicate(format: "identifier == %@ OR label == %@ OR label BEGINSWITH %@", arg, arg, arg + ",")
    return app.descendants(matching: .any).matching(q).firstMatch
  }

  func testDrive() throws {
    let raw = ProcessInfo.processInfo.environment["VOICE_STEPS"] ?? ""
    let steps = raw.split(separator: ";").map { String($0).trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }
    let app = XCUIApplication()
    let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")
    log("\(steps.count) steps; storekit session \(session == nil ? "absent" : "open")")
    for step in steps {
      let parts = step.split(separator: ":", maxSplits: 1).map(String.init)
      let cmd = parts[0]
      let arg = parts.count > 1 ? parts[1] : ""
      log("> \(step)")
      switch cmd {
      case "launch":
        app.launch()
        XCTAssertTrue(app.wait(for: .runningForeground, timeout: 60))
        sleep(3)
      case "terminate":
        app.terminate()
      case "open":
        XCUIDevice.shared.system.open(URL(string: arg)!)
        let open = springboard.buttons["Open"]
        if open.waitForExistence(timeout: 2) { open.tap() }
      case "tap":
        let el = find(app, arg)
        if el.waitForExistence(timeout: 8) { el.tap() } else { log("no element \(arg)") }
      case "longpress":
        let p = arg.split(separator: ":").map(String.init)
        let el = find(app, p[0])
        if el.waitForExistence(timeout: 8) { el.press(forDuration: Double(p.count > 1 ? p[1] : "1.2") ?? 1.2) } else { log("no element \(p[0])") }
      case "type":
        app.typeText(arg)
      case "sleep":
        usleep(UInt32((Double(arg) ?? 1) * 1_000_000))
      case "allow":
        let deadline = Date().addingTimeInterval(Double(arg) ?? 6)
        while Date() < deadline {
          var hit = false
          for label in ["Allow", "OK", "Allow While Using App"] {
            let b = springboard.buttons[label]
            if b.exists { b.tap(); log("alert: tapped \(label)"); hit = true; usleep(700_000) }
          }
          if !hit { usleep(500_000) }
        }
      case "waitexist":
        let p = arg.split(separator: ":").map(String.init)
        let ok = find(app, p[0]).waitForExistence(timeout: Double(p.count > 1 ? p[1] : "30") ?? 30)
        log(ok ? "exists \(p[0])" : "TIMEOUT waiting for \(p[0])")
      case "waitlabel":
        let p = arg.split(separator: ":").map(String.init)
        let el = find(app, p[0])
        let deadline = Date().addingTimeInterval(Double(p.count > 2 ? p[2] : "30") ?? 30)
        var ok = false
        while Date() < deadline {
          if el.exists && (el.label.contains(p[1]) || (el.value as? String ?? "").contains(p[1])) { ok = true; break }
          usleep(400_000)
        }
        log(ok ? "label \(p[0]) contains '\(p[1])': \(el.label)" : "TIMEOUT \(p[0]) never contained '\(p[1])' (label='\(el.exists ? el.label : "-")')")
      case "value":
        let el = find(app, arg)
        if el.waitForExistence(timeout: 5) { log("value \(arg): label='\(el.label)' value='\(el.value as? String ?? "")'") } else { log("no element \(arg)") }
      case "shot":
        let screenshot = XCUIScreen.main.screenshot()
        let a = XCTAttachment(screenshot: screenshot)
        a.name = arg
        a.lifetime = .keepAlways
        add(a)
      case "log":
        log(arg)
      default:
        log("unknown step \(step)")
      }
    }
    let a = XCTAttachment(string: lines.joined(separator: "\n"))
    a.name = "driver-log"
    a.lifetime = .keepAlways
    add(a)
  }
}
