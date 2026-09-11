import { describe, expect, it } from "vitest";
import { keyboardLift, sheetGeometry } from "./keyboardLayout";

describe("keyboardLift", () => {
  it("is zero while the keyboard is hidden", () => {
    expect(keyboardLift(0, 34, "ios")).toBe(0);
    expect(keyboardLift(0, 48, "android")).toBe(0);
    expect(keyboardLift(-1, 48, "android")).toBe(0);
  });
  it("adds the navigation bar on Android only", () => {
    expect(keyboardLift(300, 48, "android")).toBe(348);
    expect(keyboardLift(336, 34, "ios")).toBe(336);
    expect(keyboardLift(200, 0, "web")).toBe(200);
  });
});

describe("sheetGeometry", () => {
  const base = { safeBottom: 34, safeTop: 59, windowHeight: 852, basePadding: 16, share: 0.88 };
  it("rests on the window edge with the safe inset when the keyboard is hidden", () => {
    expect(sheetGeometry({ ...base, lift: 0 })).toEqual({ bottom: 0, paddingBottom: 50, maxHeight: 750 });
  });
  it("sits on the keyboard, drops the safe inset and caps the height to the visible room", () => {
    expect(sheetGeometry({ ...base, lift: 336 })).toEqual({ bottom: 336, paddingBottom: 16, maxHeight: 852 - 336 - 59 - 24 });
  });
  it("never collapses below the minimum height on a short window", () => {
    expect(sheetGeometry({ ...base, windowHeight: 500, lift: 336 }).maxHeight).toBe(160);
  });
});
