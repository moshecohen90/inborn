import ExpoModulesCore
import Foundation
import UIKit
import os

/// Thermal, memory-pressure and power signals for the §6.5 policy; expo-battery carries level and charging.
public class DeviceGuardModule: Module {
  private var memorySource: DispatchSourceMemoryPressure?
  private var observers: [NSObjectProtocol] = []

  public func definition() -> ModuleDefinition {
    Name("DeviceGuard")
    Events("thermal", "memory", "power")

    Function("getSnapshot") { () -> [String: Any?] in
      return self.snapshot()
    }

    // iOS has no headroom API; thermalState is the whole signal.
    Function("getThermalHeadroom") { (_ seconds: Int) -> Double? in
      return nil
    }

    OnStartObserving { self.start() }
    OnStopObserving { self.stop() }
    OnDestroy { self.stop() }
  }

  // os_proc_available_memory() is 0 where the limit is unknown (simulator, macOS): report null rather than "no memory left".
  private func availableMemory() -> Double? {
    let bytes = os_proc_available_memory()
    return bytes > 0 ? Double(bytes) : nil
  }

  private func snapshot() -> [String: Any?] {
    let info = ProcessInfo.processInfo
    return [
      "thermalState": info.thermalState.rawValue,
      "lowPowerMode": info.isLowPowerModeEnabled,
      "availableMemory": availableMemory(),
      "physicalMemory": Double(info.physicalMemory),
      "isTablet": UIDevice.current.userInterfaceIdiom == .pad,
      "model": UIDevice.current.model,
      "system": info.operatingSystemVersionString,
    ]
  }

  private func start() {
    guard observers.isEmpty else { return }
    let center = NotificationCenter.default
    observers.append(center.addObserver(forName: ProcessInfo.thermalStateDidChangeNotification, object: nil, queue: .main) { [weak self] _ in
      self?.sendEvent("thermal", ["thermalState": ProcessInfo.processInfo.thermalState.rawValue])
    })
    observers.append(center.addObserver(forName: .NSProcessInfoPowerStateDidChange, object: nil, queue: .main) { [weak self] _ in
      guard let self else { return }
      self.sendEvent("power", self.snapshot())
    })
    observers.append(center.addObserver(forName: UIApplication.didReceiveMemoryWarningNotification, object: nil, queue: .main) { [weak self] _ in
      self?.sendEvent("memory", ["source": "app", "level": "warning", "availableMemory": self?.availableMemory()])
    })
    // Phone-wide, not this process: the JS side weighs it against os_proc_available_memory() before believing it (QA F43).
    let source = DispatchSource.makeMemoryPressureSource(eventMask: [.warning, .critical], queue: .main)
    source.setEventHandler { [weak self, weak source] in
      guard let source, !source.isCancelled else { return }
      let level = source.data.contains(.critical) ? "critical" : "warning"
      self?.sendEvent("memory", ["source": "system", "level": level, "availableMemory": self?.availableMemory()])
    }
    source.activate()
    memorySource = source
  }

  private func stop() {
    observers.forEach { NotificationCenter.default.removeObserver($0) }
    observers = []
    memorySource?.cancel()
    memorySource = nil
  }
}
