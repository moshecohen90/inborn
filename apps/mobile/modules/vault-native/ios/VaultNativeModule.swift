import CryptoKit
import ExpoModulesCore
import Foundation

/** Vault helpers that JS cannot do fast enough: SHA-256 over a multi-GB file, physical RAM, backup exclusion (spec §5.3). */
public class VaultNativeModule: Module {
  public func definition() -> ModuleDefinition {
    Name("VaultNative")

    Function("totalMemoryBytes") { () -> Double in
      Double(ProcessInfo.processInfo.physicalMemory)
    }

    /* Streams in 4 MB slices so a 2.7 GB model never sits in memory; runs off the JS thread. */
    AsyncFunction("sha256File") { (path: String) -> String in
      let url = URL(fileURLWithPath: path.replacingOccurrences(of: "file://", with: ""))
      let handle = try FileHandle(forReadingFrom: url)
      defer { try? handle.close() }
      var hasher = SHA256()
      while autoreleasepool(invoking: {
        let chunk = handle.readData(ofLength: 4 * 1024 * 1024)
        if chunk.isEmpty { return false }
        hasher.update(data: chunk)
        return true
      }) {}
      return hasher.finalize().map { String(format: "%02x", $0) }.joined()
    }

    /* Models are public bytes, so they stay out of iCloud/iTunes backups (spec §10.6 #42). */
    Function("excludeFromBackup") { (path: String) -> Bool in
      var url = URL(fileURLWithPath: path.replacingOccurrences(of: "file://", with: ""))
      var values = URLResourceValues()
      values.isExcludedFromBackup = true
      do {
        try url.setResourceValues(values)
        return true
      } catch {
        return false
      }
    }
  }
}
