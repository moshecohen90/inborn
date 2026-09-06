import { describe, expect, it } from "vitest";
import { DISK_RESERVE_BYTES, NOT_INSTALLED, isBusy, isInstalled, requiredFreeBytes, transition, type InstallEvent, type InstallState } from "../src/index";

const GB = 1024 ** 3;
const run = (events: InstallEvent[], from: InstallState = NOT_INSTALLED) => events.reduce(transition, from);
const request = (freeBytes = 10 * GB): InstallEvent => ({ type: "request", via: "https", requiredBytes: requiredFreeBytes(1.28 * GB), freeBytes });

describe("install state machine (spec §8.4, §10.1)", () => {
  it("happy path: request → delivering → verifying → ready", () => {
    let s = run([request()]);
    expect(s).toMatchObject({ kind: "delivering", via: "https", bytes: 0, paused: false });
    s = run([{ type: "progress", bytes: 100, total: 1000 }], s);
    expect(s).toMatchObject({ kind: "delivering", bytes: 100, total: 1000 });
    expect(isBusy(s)).toBe(true);
    s = run([{ type: "delivered", bytes: 1000 }], s);
    expect(s).toMatchObject({ kind: "verifying", bytes: 1000 });
    s = run([{ type: "verified", path: "/vault/fast.gguf", bytes: 1000, sha256: "ab" }], s);
    expect(s).toEqual({ kind: "ready", path: "/vault/fast.gguf", bytes: 1000, sha256: "ab", via: "https" });
    expect(isInstalled(s)).toBe(true);
  });

  it("needs-space blocks before a single byte moves and says how much (size + 2 GB reserve)", () => {
    expect(requiredFreeBytes(1.28 * GB)).toBe(Math.max(Math.ceil(1.28 * GB * 1.1), 1.28 * GB + DISK_RESERVE_BYTES));
    const s = run([request(2 * GB)]);
    expect(s).toMatchObject({ kind: "needs-space", freeBytes: 2 * GB });
    expect(run([{ type: "progress", bytes: 5, total: 10 }], s)).toBe(s);
    expect(run([{ type: "cancel" }], s)).toEqual(NOT_INSTALLED);
  });

  it("a hash mismatch after delivery marks the file corrupt; a retry starts clean", () => {
    let s = run([request(), { type: "progress", bytes: 1000, total: 1000 }, { type: "delivered", bytes: 1000 }, { type: "rejected", reason: "hash-mismatch" }]);
    expect(s).toEqual({ kind: "corrupt", reason: "hash-mismatch", via: "https" });
    expect(run([{ type: "verified", path: "x", bytes: 1, sha256: "y" }], s)).toBe(s);
    s = run([{ type: "removed" }, request()], s);
    expect(s.kind).toBe("delivering");
  });

  it("cancel wins over a late progress tick; pause/resume, Wi-Fi wait and Play confirmation are flags on delivering", () => {
    let s = run([request(), { type: "pause" }]);
    expect(s).toMatchObject({ kind: "delivering", paused: true });
    s = run([{ type: "waiting-for-wifi" }, { type: "needs-confirmation" }], s);
    expect(s).toMatchObject({ waitingForWifi: true, needsConfirmation: true });
    s = run([{ type: "resume" }], s);
    expect(s).toMatchObject({ paused: false, waitingForWifi: false, needsConfirmation: false });
    s = run([{ type: "cancel" }], s);
    expect(s).toEqual(NOT_INSTALLED);
    expect(run([{ type: "progress", bytes: 999, total: 1000 }], s)).toEqual(NOT_INSTALLED);
  });

  it("a model that crashed while loading is quarantined and never auto-loaded again until a load succeeds", () => {
    const ready: InstallState = { kind: "ready", path: "/v/a.gguf", bytes: 1, sha256: "s", via: "import" };
    const q = run([{ type: "load-crashed" }], ready);
    expect(q).toMatchObject({ kind: "quarantined", path: "/v/a.gguf" });
    expect(isInstalled(q)).toBe(true);
    expect(run([{ type: "request", via: "https", requiredBytes: 1, freeBytes: 10 }], q)).toBe(q);
    expect(run([{ type: "load-ok" }], q)).toEqual(ready);
    expect(run([{ type: "removed" }], q)).toEqual(NOT_INSTALLED);
  });

  it("a ready model ignores a second request and a network error is retryable", () => {
    const ready: InstallState = { kind: "ready", path: "p", bytes: 1, sha256: "s", via: "play" };
    expect(run([request()], ready)).toBe(ready);
    const failed = run([request(), { type: "error", error: "ECONNRESET", retryable: true }]);
    expect(failed).toEqual({ kind: "failed", error: "ECONNRESET", via: "https", retryable: true });
    expect(run([{ type: "cancel" }], failed)).toEqual(NOT_INSTALLED);
  });
});
