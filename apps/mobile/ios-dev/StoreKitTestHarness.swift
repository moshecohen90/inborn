import Foundation

/// Device proof of the paywall without a UI-automation approval on the phone: when the app is launched with
/// `INBORN_SKTEST=<ops>` (devicectl `--environment-variables`), StoreKitTest.framework is loaded from the developer disk image
/// and a local StoreKit session (Inborn.storekit, bundled by scripts/ios-add-storekit-harness.rb) runs the ops before React starts.
/// Ops, `;`-separated: `clear` · `buy:<productId>` (external purchase, for Restore) · `refund:<index>` · `dialogs:on` (keep the
/// purchase sheet). Outcome lands in Documents/sktest.json. Never part of a store build: the file only exists in proof builds.
enum StoreKitTestHarness {
  private static var session: AnyObject?
  private typealias InitFn = @convention(c) (AnyObject, Selector, NSURL, UnsafeMutablePointer<NSError?>?) -> AnyObject?
  private typealias BuyFn = @convention(c) (AnyObject, Selector, NSString, UnsafeMutablePointer<NSError?>?) -> Bool
  private typealias RefundFn = @convention(c) (AnyObject, Selector, UInt, UnsafeMutablePointer<NSError?>?) -> Bool

  static func start() {
    guard let plan = ProcessInfo.processInfo.environment["INBORN_SKTEST"], !plan.isEmpty else { return }
    var report: [String: Any] = ["plan": plan, "steps": [String]()]
    var steps: [String] = []
    defer { report["steps"] = steps; report["transactions"] = transactions(); write(report) }

    /* iOS 17+ mounts the personalized DDI cryptex at /System/Developer; older releases at /Developer. */
    let candidates = ["/System/Developer/Library/Frameworks/StoreKitTest.framework/StoreKitTest", "/Developer/Library/Frameworks/StoreKitTest.framework/StoreKitTest"]
    var loaded: String?
    for p in candidates {
      steps.append("exists \(p): \(FileManager.default.fileExists(atPath: p))")
      if dlopen(p, RTLD_NOW) != nil { loaded = p; break }
      steps.append("dlopen \(p): \(String(cString: dlerror()))")
    }
    guard let path = loaded else { return }
    steps.append("loaded \(path)")
    guard let cls = NSClassFromString("SKTestSession") as? NSObject.Type else { steps.append("SKTestSession class missing"); return }
    guard let url = Bundle.main.url(forResource: "Inborn", withExtension: "storekit") else { steps.append("Inborn.storekit missing from bundle"); return }
    let initSel = NSSelectorFromString("initWithContentsOfURL:error:")
    guard let raw = (cls as AnyObject).perform(NSSelectorFromString("alloc"))?.takeRetainedValue() else { steps.append("alloc failed"); return }
    guard let initImp = raw.method(for: initSel) else { steps.append("no initWithContentsOfURL:"); return }
    var err: NSError?
    guard let s = unsafeBitCast(initImp, to: InitFn.self)(raw, initSel, url as NSURL, &err) else { steps.append("init failed: \(err?.localizedDescription ?? "?")"); return }
    session = s
    s.setValue(!plan.contains("dialogs:on"), forKey: "disableDialogs")
    s.setValue(false, forKey: "askToBuyEnabled")
    steps.append("session ready, disableDialogs=\(!plan.contains("dialogs:on"))")

    for op in plan.split(separator: ";").map({ $0.trimmingCharacters(in: .whitespaces) }) where !op.isEmpty {
      let parts = op.split(separator: ":", maxSplits: 1).map(String.init)
      switch parts[0] {
      case "clear":
        _ = s.perform(NSSelectorFromString("clearTransactions"))
        steps.append("cleared")
      case "buy":
        let sel = NSSelectorFromString("buyProductWithIdentifier:error:")
        guard parts.count == 2, let imp = s.method(for: sel) else { steps.append("buy: bad op"); continue }
        var e: NSError?
        let ok = unsafeBitCast(imp, to: BuyFn.self)(s, sel, parts[1] as NSString, &e)
        steps.append("buy \(parts[1]): \(ok ? "ok" : "failed \(e?.localizedDescription ?? "?")")")
      case "refund":
        let sel = NSSelectorFromString("refundTransactionWithIdentifier:error:")
        let list = transactions()
        guard let imp = s.method(for: sel), let idx = Int(parts.count == 2 ? parts[1] : "0"), idx < list.count, let id = list[idx]["identifier"] as? UInt else { steps.append("refund: nothing at \(parts.dropFirst().first ?? "0")"); continue }
        var e: NSError?
        let ok = unsafeBitCast(imp, to: RefundFn.self)(s, sel, id, &e)
        steps.append("refund \(id): \(ok ? "ok" : "failed \(e?.localizedDescription ?? "?")")")
      case "dialogs":
        break
      default:
        steps.append("unknown op \(op)")
      }
    }
  }

  private static func transactions() -> [[String: Any]] {
    guard let s = session, let list = s.perform(NSSelectorFromString("allTransactions"))?.takeUnretainedValue() as? [NSObject] else { return [] }
    return list.map { t in
      let id: UInt = (t.value(forKey: "identifier") as? UInt) ?? 0
      let product: String = (t.value(forKey: "productIdentifier") as? String) ?? ""
      let state: Int = (t.value(forKey: "state") as? Int) ?? -1
      return ["identifier": id, "productIdentifier": product, "state": state]
    }
  }

  private static func write(_ report: [String: Any]) {
    guard let dir = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first, let data = try? JSONSerialization.data(withJSONObject: report, options: [.prettyPrinted]) else { return }
    try? data.write(to: dir.appendingPathComponent("sktest.json"))
  }
}
