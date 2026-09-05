import ExpoModulesCore
import UIKit

/// iOS cannot refuse a screenshot (spec §5.7); it can tell when the screen is mirrored or recorded, and the app hides content then.
public class SecureScreenModule: Module {
  public func definition() -> ModuleDefinition {
    Name("SecureScreen")

    Events("onCapturedChange")

    OnStartObserving {
      NotificationCenter.default.addObserver(self, selector: #selector(self.capturedChanged), name: UIScreen.capturedDidChangeNotification, object: nil)
    }

    OnStopObserving {
      NotificationCenter.default.removeObserver(self, name: UIScreen.capturedDidChangeNotification, object: nil)
    }

    Function("isCaptured") { () -> Bool in
      UIScreen.main.isCaptured
    }

    Function("isSecure") { () -> Bool in false }

    AsyncFunction("setSecure") { (_: Bool) in }
  }

  @objc private func capturedChanged() {
    sendEvent("onCapturedChange", ["captured": UIScreen.main.isCaptured])
  }
}
