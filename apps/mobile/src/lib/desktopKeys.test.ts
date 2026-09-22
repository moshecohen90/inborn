import { describe, expect, it } from "vitest";
import { matchKey } from "./desktopKeys";

const cmd = (key: string, extra: { shiftKey?: boolean; altKey?: boolean } = {}) => matchKey({ key, metaKey: true, ...extra });
const ctrl = (key: string, extra: { shiftKey?: boolean; altKey?: boolean } = {}) => matchKey({ key, ctrlKey: true, ...extra });

describe("desktop key map", () => {
  it("maps the five §8.9 shortcuts on both modifiers", () => {
    for (const mod of [cmd, ctrl]) {
      expect(mod("n")).toBe("new-chat");
      expect(mod("k")).toBe("palette");
      expect(mod("f")).toBe("search");
      expect(mod("m")).toBe("model-picker");
      expect(mod("\\")).toBe("toggle-sidebar");
    }
  });

  it("stops generation on Escape with no modifier at all", () => {
    expect(matchKey({ key: "Escape" })).toBe("stop");
    expect(matchKey({ key: "Escape", metaKey: true })).toBe("stop");
  });

  it("reads the same letters whatever case the browser reports", () => {
    expect(cmd("N")).toBe("new-chat");
    expect(cmd("K")).toBe("palette");
  });

  it("keeps Shift+Cmd+N for the incognito chat and leaves the other shifted pairs to the browser", () => {
    expect(cmd("n", { shiftKey: true })).toBe("new-incognito");
    expect(cmd("f", { shiftKey: true })).toBeNull();
    expect(cmd("m", { shiftKey: true })).toBeNull();
  });

  it("claims nothing typed without a modifier, and nothing with Alt", () => {
    for (const key of ["n", "k", "f", "m", "\\", "a", "1", " "]) expect(matchKey({ key })).toBeNull();
    expect(cmd("n", { altKey: true })).toBeNull();
    expect(cmd("k", { altKey: true })).toBeNull();
  });

  it("leaves the browser's own chords alone", () => {
    for (const key of ["t", "w", "r", "l", "s", "p", "c", "v", "z", "+", "-"]) expect(cmd(key)).toBeNull();
  });
});
