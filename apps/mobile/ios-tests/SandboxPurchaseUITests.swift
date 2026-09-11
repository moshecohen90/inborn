import XCTest

/// Real-device sandbox proof (checklist T56, sandbox half): no StoreKit Testing session, so the app reaches Apple's sandbox
/// with the sandbox Apple Account already signed in on the phone. The dev bundle's EXPO_PUBLIC_AUTOBUY=inborn.pro opens the
/// "Sandbox" payment sheet by itself; this test only confirms that sheet with one tap and records what follows. It never types:
/// a password / sign-in prompt ends the test with a screenshot.
final class SandboxPurchaseUITests: XCTestCase {
  private func shot(_ name: String) {
    let a = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
    a.name = name
    a.lifetime = .keepAlways
    add(a)
  }

  /// The payment sheet is a remote view; depending on the iOS release it is exposed through SpringBoard or its own host.
  private func hosts() -> [XCUIApplication] {
    ["com.apple.springboard", "com.apple.PassbookUIService", "com.apple.AppStore"].map { XCUIApplication(bundleIdentifier: $0) }
  }

  private func firstButton(_ labels: [String], in apps: [XCUIApplication]) -> XCUIElement? {
    for app in apps {
      for label in labels {
        let b = app.buttons[label]
        if b.exists { return b }
      }
    }
    return nil
  }

  private func passwordPromptVisible(_ apps: [XCUIApplication]) -> Bool {
    for app in apps where app.secureTextFields.count > 0 || app.alerts.count > 0 { return true }
    return false
  }

  func testConfirmSandboxSheetOnce() throws {
    continueAfterFailure = false
    let app = XCUIApplication()
    app.launch()
    XCTAssertTrue(app.wait(for: .runningForeground, timeout: 60))
    sleep(4)
    XCUIDevice.shared.system.open(URL(string: "inborn://paywall")!)
    XCTAssertTrue(app.staticTexts["paywall-title"].waitForExistence(timeout: 90), "paywall did not appear")
    shot("sandbox-00-paywall")

    let all = hosts() + [app]
    var purchase: XCUIElement?
    let deadline = Date().addingTimeInterval(90)
    while Date() < deadline, purchase == nil {
      purchase = firstButton(["Purchase", "Buy", "Subscribe"], in: all)
      if purchase == nil { sleep(2) }
    }
    shot("sandbox-01-sheet")
    guard let button = purchase else {
      NSLog("[sandbox] no Purchase button found; springboard buttons: %@", hosts()[0].buttons.allElementsBoundByIndex.map { $0.label }.joined(separator: " | "))
      XCTFail("payment sheet not found")
      return
    }
    NSLog("[sandbox] tapping %@", button.label)
    button.tap()

    let end = Date().addingTimeInterval(150)
    while Date() < end {
      if app.otherElements["owned"].exists {
        shot("sandbox-02-owned")
        NSLog("[sandbox] owned")
        return
      }
      if passwordPromptVisible(hosts()) {
        shot("sandbox-03-prompt")
        let labels = hosts().flatMap { $0.alerts.allElementsBoundByIndex.map { $0.label } + $0.staticTexts.allElementsBoundByIndex.prefix(12).map { $0.label } }
        NSLog("[sandbox] prompt visible, not typing: %@", labels.joined(separator: " | "))
        XCTFail("sign-in / password prompt appeared; stopped without typing")
        return
      }
      sleep(3)
    }
    shot("sandbox-04-timeout")
    XCTFail("no owned state within 150 s after the tap")
  }
}
