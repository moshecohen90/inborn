import { describe, expect, it } from "vitest";
import { IOS_HEADROOM_BYTES, memoryPressureFromIos } from "../src/index";

const MB = 1048576;

/*
 * QA F43: `DispatchSource.makeMemoryPressureSource` reports the whole phone's pressure. The device syslog caught one
 * 4.0 s before Inborn was even launched; read as this app's state it dropped the chosen 1.3 GB model on a phone with
 * 223 MB of footprint and gigabytes of headroom, on every cold launch.
 */
describe("memoryPressureFromIos (QA F43)", () => {
  it("always believes this process's own memory warning", () => {
    expect(memoryPressureFromIos({ source: "app", level: "warning", availableMemory: 3000 * MB })).toBe("warning");
    expect(memoryPressureFromIos({ source: "app", level: "critical", availableMemory: null })).toBe("critical");
  });
  it("ignores a phone-wide event while this process still has headroom", () => {
    expect(memoryPressureFromIos({ source: "system", level: "critical", availableMemory: 3000 * MB })).toBeNull();
    expect(memoryPressureFromIos({ source: "system", level: "warning", availableMemory: IOS_HEADROOM_BYTES + 1 })).toBeNull();
  });
  it("believes a phone-wide event once this process is at its own limit", () => {
    expect(memoryPressureFromIos({ source: "system", level: "warning", availableMemory: IOS_HEADROOM_BYTES })).toBe("warning");
    expect(memoryPressureFromIos({ source: "system", level: "critical", availableMemory: 40 * MB })).toBe("critical");
  });
  it("ignores a phone-wide event where the process limit is unknown (simulator, macOS)", () => {
    expect(memoryPressureFromIos({ source: "system", level: "critical", availableMemory: null })).toBeNull();
  });
});
