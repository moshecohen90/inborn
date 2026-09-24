import ExpoModulesCore
import ObjectiveC
import UIKit

/**
 * Enter on a physical keyboard sends, Shift+Enter breaks the line (spec §10 #55, QA F324) — the iOS half of the
 * Android module. A key command is the only hook that beats UITextView's own newline: a press reaches the focused
 * text view first and never travels up the responder chain, while key commands are collected from the whole chain
 * and `wantsPriorityOverSystemBehavior` puts this one ahead of the insertion. The on-screen keyboard's Return is
 * not a key press and never produces one, so it is left alone, and no command is registered for Shift+Return, so
 * that combination stays with the field. Active only while JS says the composer has focus.
 */
public class HardwareKeysModule: Module {
  public func definition() -> ModuleDefinition {
    Name("HardwareKeys")

    Events("onEnter")

    Function("setEnabled") { [weak self] (on: Bool) in
      guard let self else { return }
      DispatchQueue.main.async {
        WindowEnterKey.shared.install()
        WindowEnterKey.shared.onEnter = { [weak self] in self?.sendEvent("onEnter", ["deviceId": 0]) }
        WindowEnterKey.shared.enabled = on
      }
    }

    OnDestroy {
      DispatchQueue.main.async {
        WindowEnterKey.shared.enabled = false
        WindowEnterKey.shared.onEnter = nil
      }
    }
  }
}

/**
 * The window is the last responder above the focused composer, so one command there covers every field the app
 * arms it for. The override is added to `UIWindow` itself rather than to `UIResponder`, which every view inherits
 * from, and the app owns no window class of its own to subclass (Expo builds it).
 */
final class WindowEnterKey {
  static let shared = WindowEnterKey()

  /// Namespaced: it is added to a UIKit class, where a plain name could collide with Apple's own.
  private static let action = NSSelectorFromString("inbornHardwareKeysEnter:")
  private var installed = false
  var enabled = false
  var onEnter: (() -> Void)?

  func install() {
    guard !installed else { return }
    installed = true
    let keyCommands = imp_implementationWithBlock({ (_: AnyObject) -> [UIKeyCommand]? in
      guard WindowEnterKey.shared.enabled else { return nil }
      let enter = UIKeyCommand(input: "\r", modifierFlags: [], action: WindowEnterKey.action)
      enter.wantsPriorityOverSystemBehavior = true
      return [enter]
    } as @convention(block) (AnyObject) -> [UIKeyCommand]?)
    class_addMethod(UIWindow.self, NSSelectorFromString("keyCommands"), keyCommands, "@@:")

    let perform = imp_implementationWithBlock({ (_: AnyObject, _: AnyObject?) in
      WindowEnterKey.shared.onEnter?()
    } as @convention(block) (AnyObject, AnyObject?) -> Void)
    class_addMethod(UIWindow.self, WindowEnterKey.action, perform, "v@:@")
  }
}
