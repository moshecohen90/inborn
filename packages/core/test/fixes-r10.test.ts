import { describe, expect, it } from "vitest";
import { guardVaultAction, type VaultAction } from "../src/work/vault";
import { DevicePolicy, defaultOverride, type DeviceSignals } from "../src/device";
import { NOT_INSTALLED, isNoSpaceError, requiredFreeBytes, transition, type InstallEvent, type InstallState } from "../src/index";

const ACTIONS: VaultAction[] = ["open", "move-in", "move-out", "rename", "delete", "unvault", "change-code"];

describe("guardVaultAction (QA F17, §7.8)", () => {
  it("a plain folder allows everything", () => {
    for (const a of ACTIONS) expect(guardVaultAction({ isVault: false, isOpen: false }, a)).toBe("allow");
  });
  it("an open vault allows everything", () => {
    for (const a of ACTIONS) expect(guardVaultAction({ isVault: true, isOpen: true }, a)).toBe("allow");
  });
  it("a locked vault asks for the code before any read or change, including Unvault", () => {
    for (const a of ACTIONS.filter((x) => x !== "move-in")) expect(guardVaultAction({ isVault: true, isOpen: false }, a)).toBe("verify");
  });
  it("a locked vault refuses a move in outright", () => {
    expect(guardVaultAction({ isVault: true, isOpen: false }, "move-in")).toBe("deny");
  });
});


describe("isNoSpaceError (QA R4-F13/F14)", () => {
  it("matches the platform's full-disk texts at any depth of the cause chain", () => {
    expect(isNoSpaceError(new Error("Call to function 'FileSystemFile.write' has been rejected.", { cause: new Error("java.io.IOException: write failed: ENOSPC (No space left on device)") }))).toBe(true);
    expect(isNoSpaceError(new Error("database or disk is full"))).toBe(true);
    expect(isNoSpaceError("SQLITE_FULL")).toBe(true);
  });
  it("leaves every other error alone", () => {
    expect(isNoSpaceError(new Error("cannot rollback - no transaction is active"))).toBe(false);
    expect(isNoSpaceError(null)).toBe(false);
  });
});

describe("install: the disk fills mid-download (QA R4-F14)", () => {
  const GB = 1024 ** 3;
  const run = (events: InstallEvent[], from: InstallState = NOT_INSTALLED) => events.reduce(transition, from);
  const delivering = run([{ type: "request", via: "https", requiredBytes: requiredFreeBytes(1.28 * GB), freeBytes: 10 * GB }, { type: "progress", bytes: 264_000_000, total: 1.28 * GB }]);
  it("a delivering model reports how much to free instead of the raw error", () => {
    expect(run([{ type: "no-space", requiredBytes: 3 * GB, freeBytes: 32 * 1024 }], delivering)).toEqual({ kind: "needs-space", requiredBytes: 3 * GB, freeBytes: 32 * 1024 });
  });
  it("and a later request with room resumes; a ready model ignores the event", () => {
    const needs = run([{ type: "no-space", requiredBytes: 3 * GB, freeBytes: 0 }], delivering);
    expect(run([{ type: "request", via: "https", requiredBytes: 3 * GB, freeBytes: 5 * GB }], needs)).toMatchObject({ kind: "delivering" });
    const ready: InstallState = { kind: "ready", path: "/x", bytes: 1, sha256: "a", via: "https" };
    expect(run([{ type: "no-space", requiredBytes: 1, freeBytes: 0 }], ready)).toBe(ready);
  });
});

describe("policy: the row's Continue clears the paused strip (QA R4-F17)", () => {
  const signals = (over: Partial<DeviceSignals> = {}): DeviceSignals => ({
    battery: { level: 0.8, state: "unplugged", lowPowerMode: false },
    thermal: "nominal",
    memoryPressure: "normal",
    powerSource: "battery",
    deviceClass: "phone",
    ramGB: 8,
    currentTier: "fast",
    generating: false,
    backgroundedForMs: null,
    throttling: false,
    baseThreads: 4,
    ...over,
  });
  it("a generation started in the foreground ends the paused status without the strip's button", () => {
    const p = new DevicePolicy();
    const o = defaultOverride("phone");
    expect(p.update(signals({ generating: true, backgroundedForMs: 15_000 }), o, 1).status).toBe("paused");
    expect(p.update(signals({ generating: false }), o, 2).status).toBe("paused");
    expect(p.update(signals({ generating: true }), o, 3).status).toBe("normal");
    expect(p.update(signals({ generating: false }), o, 4).status).toBe("normal");
  });
  it("still pauses when the run is the one being cut in the background", () => {
    const p = new DevicePolicy();
    const o = defaultOverride("phone");
    expect(p.update(signals({ generating: true, backgroundedForMs: 16_000 }), o, 1).status).toBe("paused");
    expect(p.update(signals({ generating: true, backgroundedForMs: 17_000 }), o, 2).status).toBe("paused");
  });
});
