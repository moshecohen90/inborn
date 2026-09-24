import UIKit

// Mirrors expo-file-system 57.0.6 NetworkTaskSessionManager: same configs, delegate queue .main.
final class Probe: NSObject, URLSessionDownloadDelegate {
  let mode: String; let started = Date(); var bytes: Int64 = 0; var events = 0
  var done: (String) -> Void
  init(mode: String, done: @escaping (String) -> Void) { self.mode = mode; self.done = done }
  func session() -> URLSession {
    let c: URLSessionConfiguration
    if mode == "background" {
      c = .background(withIdentifier: "app.harness.dl.bg.\(Int(Date().timeIntervalSince1970))")
      c.sessionSendsLaunchEvents = true
      c.isDiscretionary = false
    } else { c = .default }
    c.requestCachePolicy = .reloadIgnoringLocalCacheData
    c.urlCache = nil
    return URLSession(configuration: c, delegate: self, delegateQueue: .main)
  }
  func urlSession(_ s: URLSession, downloadTask: URLSessionDownloadTask, didWriteData w: Int64, totalBytesWritten t: Int64, totalBytesExpectedToWrite e: Int64) {
    bytes = t; events += 1
  }
  func urlSession(_ s: URLSession, downloadTask: URLSessionDownloadTask, didFinishDownloadingTo location: URL) {
    let sz = (try? FileManager.default.attributesOfItem(atPath: location.path)[.size] as? Int64) ?? -1
    NSLog("HARNESS file size %lld", sz ?? -1)
    try? FileManager.default.removeItem(at: location)
  }
  var handedOver = false; var firstBytes: Int64 = 0; var keep: [URLSession] = []
  func urlSession(_ s: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
    if let e = error as NSError?, e.code == NSURLErrorCancelled, handedOver { return }
    let secs = Date().timeIntervalSince(started)
    let size = task.countOfBytesReceived
    done(String(format: "{\"mode\":\"%@\",\"bytes\":%lld,\"seconds\":%.2f,\"MBps\":%.2f,\"progressEvents\":%d,\"error\":\"%@\"}", mode, size, secs, Double(size)/secs/1e6, events, error.map { "\($0.localizedDescription)" } ?? ""))
    s.finishTasksAndInvalidate()
  }
}

final class AppDelegate: UIResponder, UIApplicationDelegate {
  var window: UIWindow?
  var probes: [Probe] = []
  func application(_ a: UIApplication, didFinishLaunchingWithOptions o: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
    window = UIWindow(frame: UIScreen.main.bounds); window?.rootViewController = UIViewController(); window?.makeKeyAndVisible()
    let args = ProcessInfo.processInfo.arguments
    let url = URL(string: args.count > 1 ? args[1] : "https://models.inbornapp.com/v1/mmproj-Qwen3.5-0.8B-F16.gguf")!
    let modes = Array(args.dropFirst(2))
    let out = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0].appendingPathComponent("results.jsonl")
    try? FileManager.default.removeItem(at: out)
    func run(_ i: Int) {
      guard i < modes.count else { NSLog("HARNESS DONE"); try? "done\n".write(to: out.deletingLastPathComponent().appendingPathComponent("done"), atomically: true, encoding: .utf8); return }
      let p = Probe(mode: modes[i]) { line in
        NSLog("HARNESS %@", line)
        let h = (try? String(contentsOf: out, encoding: .utf8)) ?? ""
        try? (h + line + "\n").write(to: out, atomically: true, encoding: .utf8)
        run(i + 1)
      }
      probes.append(p)
      if modes[i].contains("2") {
        let parts = modes[i].components(separatedBy: "2")
        let a = Probe(mode: parts[0] == "fg" ? "foreground" : "background") { _ in }
        let sa = a.session(); a.keep.append(sa)
        let t = sa.downloadTask(with: url); t.resume()
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) {
          p.handedOver = true
          t.cancel(byProducingResumeData: { data in
            DispatchQueue.main.async {
              p.firstBytes = t.countOfBytesReceived
              NSLog("HARNESS handover after %lld bytes, resumeData %d B", t.countOfBytesReceived, data?.count ?? -1)
              let b = Probe(mode: parts[1] == "fg" ? "foreground" : "background") { _ in }
              p.done = { line in NSLog("HARNESS firstBytes=%lld", p.firstBytes); let h = (try? String(contentsOf: out, encoding: .utf8)) ?? ""; try? (h + "{\"handover\":\"\(modes[i])\",\"firstBytes\":\(p.firstBytes),\"second\":" + line + "}\n").write(to: out, atomically: true, encoding: .utf8); run(i + 1) }
              let sb = (Probe(mode: b.mode) { _ in }).session()
              _ = sb
              let session = URLSession(configuration: b.mode == "background" ? { let c = URLSessionConfiguration.background(withIdentifier: "app.harness.dl.h.\(Date().timeIntervalSince1970)"); c.isDiscretionary = false; return c }() : .default, delegate: p, delegateQueue: .main)
              p.keep.append(session)
              guard let data else { NSLog("HARNESS no resume data"); return }
              session.downloadTask(withResumeData: data).resume()
            }
          })
        }
        return
      }
      p.session().downloadTask(with: url).resume()
    }
    run(0)
    return true
  }
}
UIApplicationMain(CommandLine.argc, CommandLine.unsafeArgv, nil, NSStringFromClass(AppDelegate.self))
