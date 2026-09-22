import ExpoModulesCore
import UIKit

/// iOS suspends the process within seconds of it leaving the screen, which would end a streaming answer long before
/// the §10.3 #21 grace window is up. A UIApplication background task buys real wall-clock time to finish it.
/// `beginBackgroundTask` and `endBackgroundTask` are documented as callable from any thread, so these stay synchronous.
public class BackgroundTaskModule: Module {
  private var tasks: [Int: UIBackgroundTaskIdentifier] = [:]
  /// Tokens handed to JS whose identifier is not stored yet; the expiration handler can fire in that window.
  private var claimed: Set<Int> = []
  private var nextToken = 1
  private let lock = NSLock()

  public func definition() -> ModuleDefinition {
    Name("BackgroundTask")

    Events("onExpire")

    Function("isSupported") { () -> Bool in true }

    /// The token to give back to `end`, or -1 when the OS granted nothing.
    Function("begin") { (name: String) -> Int in
      self.lock.lock()
      let token = self.nextToken
      self.nextToken += 1
      self.claimed.insert(token)
      self.lock.unlock()

      let identifier = UIApplication.shared.beginBackgroundTask(withName: name) { [weak self] in
        guard let self else { return }
        self.sendEvent("onExpire", ["token": token])
        self.finish(token)
      }

      // The handler above may already have run and found nothing to end, so the claim decides who ends this task.
      self.lock.lock()
      let ours = self.claimed.remove(token) != nil
      if ours, identifier != .invalid { self.tasks[token] = identifier }
      self.lock.unlock()

      guard ours, identifier != .invalid else {
        if identifier != .invalid { UIApplication.shared.endBackgroundTask(identifier) }
        return -1
      }
      return token
    }

    Function("end") { (token: Int) -> Void in
      self.finish(token)
    }

    /// Seconds iOS says are left; a foreground app reports .greatestFiniteMagnitude, reported here as -1.
    Function("remaining") { () -> Double in
      let left = UIApplication.shared.backgroundTimeRemaining
      return left > 1e6 ? -1 : left
    }

    OnDestroy {
      self.lock.lock()
      let all = self.tasks
      self.tasks.removeAll()
      self.claimed.removeAll()
      self.lock.unlock()
      for (_, identifier) in all where identifier != .invalid {
        UIApplication.shared.endBackgroundTask(identifier)
      }
    }
  }

  private func finish(_ token: Int) {
    lock.lock()
    claimed.remove(token)
    let identifier = tasks.removeValue(forKey: token)
    lock.unlock()
    if let identifier, identifier != .invalid {
      UIApplication.shared.endBackgroundTask(identifier)
    }
  }
}
