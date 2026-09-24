import { describe, expect, it } from "vitest";
import type { InstallState } from "@inborn/core";
import { keepOpenNote } from "./keepOpen";

const moving: InstallState = { kind: "delivering", via: "https", bytes: 10, total: 100, paused: false, waitingForWifi: false, needsConfirmation: false };

/* Round 91: the iPhone download parks when the app leaves the screen (F370), so the card says so while bytes move. */
describe("keepOpenNote", () => {
  it("shows on the iPhone while the download moves", () => {
    expect(keepOpenNote("ios", moving)).toBe(true);
  });

  it("never shows on the web or the desktop", () => {
    expect(keepOpenNote("web", moving)).toBe(false);
    expect(keepOpenNote("macos", moving)).toBe(false);
    expect(keepOpenNote("windows", moving)).toBe(false);
  });

  it("does not show on Android, whose download keeps going in the background", () => {
    expect(keepOpenNote("android", moving)).toBe(false);
  });

  it("does not show once the download is paused, waiting, or over", () => {
    expect(keepOpenNote("ios", { ...moving, paused: true })).toBe(false);
    expect(keepOpenNote("ios", { ...moving, waitingForWifi: true })).toBe(false);
    expect(keepOpenNote("ios", { ...moving, needsConfirmation: true })).toBe(false);
    expect(keepOpenNote("ios", { kind: "verifying", via: "https", bytes: 100 })).toBe(false);
    expect(keepOpenNote("ios", { kind: "not-installed" })).toBe(false);
  });
});
