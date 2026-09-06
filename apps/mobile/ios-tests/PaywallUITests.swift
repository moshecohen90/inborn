import StoreKitTest
import XCTest

/// Headless StoreKit Testing proof of the M6 paywall (spec §14.2 row 10, §10.7 #48–#52): purchase, relaunch,
/// refund, restore — all against Xcode's local StoreKit environment (no network, no App Store Connect).
/// The app is bundled with EXPO_PUBLIC_START_SCREEN=paywall so it boots straight into S60.
/// Screenshots go to $INBORN_SHOTS (pass `TEST_RUNNER_INBORN_SHOTS=…` to xcodebuild).
final class PaywallUITests: XCTestCase {
  var session: SKTestSession!

  override func setUpWithError() throws {
    continueAfterFailure = false
    session = try SKTestSession(configurationFileNamed: "Inborn")
    session.disableDialogs = true
    session.askToBuyEnabled = false
  }

  private func shot(_ app: XCUIApplication, _ name: String) {
    let screenshot = XCUIScreen.main.screenshot()
    let attachment = XCTAttachment(screenshot: screenshot)
    attachment.name = name
    attachment.lifetime = .keepAlways
    add(attachment)
    if let dir = ProcessInfo.processInfo.environment["INBORN_SHOTS"] {
      try? screenshot.pngRepresentation.write(to: URL(fileURLWithPath: dir).appendingPathComponent("\(name).png"))
    }
  }

  private func launch() -> XCUIApplication {
    let app = XCUIApplication()
    app.launch()
    XCTAssertTrue(app.staticTexts["paywall-title"].waitForExistence(timeout: 90), "paywall did not appear")
    return app
  }

  private func waitOwned(_ app: XCUIApplication, _ timeout: TimeInterval = 60) -> Bool {
    app.otherElements["owned"].waitForExistence(timeout: timeout)
  }

  private func waitBuyButton(_ app: XCUIApplication, _ timeout: TimeInterval = 60) -> Bool {
    app.buttons["buy-inborn.pro"].waitForExistence(timeout: timeout)
  }

  /// Fresh account → store price shown → buy → owned → relaunch still owned (currentEntitlements) → refund → locked after relaunch → restore after an external purchase.
  func testPurchaseRelaunchRefundRestore() throws {
    session.clearTransactions()
    var app = launch()
    XCTAssertTrue(waitBuyButton(app), "Pro card missing")
    let price = app.staticTexts["price-inborn.pro"]
    XCTAssertTrue(price.waitForExistence(timeout: 30))
    XCTAssertTrue(price.label.contains("19.99"), "store price expected, got \(price.label)")
    XCTAssertTrue(app.staticTexts["price-inborn.work"].label.contains("69.99"))
    shot(app, "01-paywall-free")

    app.buttons["buy-inborn.pro"].tap()
    XCTAssertTrue(waitOwned(app), "purchase did not unlock Pro")
    XCTAssertEqual(session.allTransactions().count, 1)
    XCTAssertEqual(session.allTransactions().first?.productIdentifier, "inborn.pro")
    shot(app, "02-owned-after-purchase")

    app.terminate()
    app = launch()
    XCTAssertTrue(waitOwned(app), "relaunch lost the entitlement")
    XCTAssertFalse(app.buttons["buy-inborn.pro"].exists)
    XCTAssertTrue(app.buttons["buy-inborn.work.upgrade"].waitForExistence(timeout: 30), "Pro owners should see the Work upgrade")
    shot(app, "03-relaunch-owned")

    let tx = try XCTUnwrap(session.allTransactions().first)
    try session.refundTransaction(identifier: UInt(tx.identifier))
    app.terminate()
    app = launch()
    XCTAssertTrue(waitBuyButton(app), "refund did not lock Pro")
    XCTAssertFalse(app.otherElements["owned"].exists)
    shot(app, "04-after-refund-locked")

    // Bought on another device of the same Apple ID (or by a family member): Restore must find it.
    session.clearTransactions()
    try session.buyProduct(productIdentifier: "inborn.pro")
    app.terminate()
    app = launch()
    if !waitOwned(app, 20) {
      app.buttons["restore"].tap()
    }
    XCTAssertTrue(waitOwned(app), "restore did not find the purchase")
    shot(app, "05-restored")
  }

  /// With the store forced unreachable in the JS bundle (EXPO_PUBLIC_STORE_OFFLINE=1), the sealed cache alone grants Pro and the paywall says so.
  func testOfflineCacheGrantsPro() throws {
    let app = launch()
    XCTAssertTrue(waitOwned(app), "cached entitlement not honoured offline")
    let status = app.staticTexts["paywall-status"]
    XCTAssertTrue(status.waitForExistence(timeout: 30))
    XCTAssertTrue(status.label.lowercased().contains("connection"), "expected the offline line, got \(status.label)")
    shot(app, "06-offline-from-cache")
  }
}
