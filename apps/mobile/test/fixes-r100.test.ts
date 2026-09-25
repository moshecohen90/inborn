import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createEarlyEscape, type EscapeKey, type KeyTarget } from "../src/lib/earlyEscape";

vi.mock("react-native", () => ({ Platform: { OS: "web" } }));

/** A window stand-in: capture listeners by type, dispatched in registration order until one stops propagation. */
function fakeWindow() {
  const listeners: Record<"keydown" | "keyup", ((e: EscapeKey) => void)[]> = { keydown: [], keyup: [] };
  const target: KeyTarget = {
    addEventListener: (type, fn) => void listeners[type].push(fn),
    removeEventListener: (type, fn) => {
      listeners[type] = listeners[type].filter((f) => f !== fn);
    },
  };
  const press = (type: "keydown" | "keyup", key = "Escape") => {
    let stopped = false;
    const e: EscapeKey = { key, preventDefault: () => {}, stopPropagation: () => void (stopped = true) };
    for (const fn of [...listeners[type]]) {
      fn(e);
      if (stopped) break;
    }
    return stopped;
  };
  return { target, press, listeners };
}

describe("F396 · Esc closes a sheet from its first frame", () => {
  it("closes the newest opening sheet only, and swallows the keyup so the one under it stays", () => {
    const w = fakeWindow();
    const early = createEarlyEscape(w.target);
    const lower = vi.fn();
    const upper = vi.fn();
    const offLower = early.add(lower);
    const offUpper = early.add(upper);
    expect(w.press("keydown")).toBe(true);
    expect(upper).toHaveBeenCalledTimes(1);
    expect(lower).not.toHaveBeenCalled();
    expect(w.press("keyup")).toBe(true);
    expect(w.press("keyup")).toBe(false);
    offUpper();
    offLower();
    expect(w.listeners.keydown).toHaveLength(0);
  });

  it("ignores other keys and stops listening once the sheet is shown", () => {
    const w = fakeWindow();
    const early = createEarlyEscape(w.target);
    const close = vi.fn();
    const off = early.add(close);
    expect(w.press("keydown", "Enter")).toBe(false);
    off();
    expect(w.press("keydown")).toBe(false);
    expect(close).not.toHaveBeenCalled();
  });

  /* Round 102 (F401) moved the hook into AppModal, which every modal now renders. */
  it("both sheet primitives render AppModal, which hands the Modal's onShow to the hook", () => {
    for (const f of ["../src/components/chat/Sheet.tsx", "../src/components/shell/Sheet.tsx"]) {
      const src = readFileSync(join(__dirname, f), "utf8");
      expect(src).toMatch(/<AppModal\b[^>]*onRequestClose=\{onClose\}/);
    }
    expect(readFileSync(join(__dirname, "../src/components/shell/AppModal.tsx"), "utf8")).toContain("useEarlyEscape(visible, onRequestClose)");
  });
});

describe("F395 · the Chats footer", () => {
  const chats = readFileSync(join(__dirname, "../src/screens/Chats.tsx"), "utf8");
  it("PRO is a badge inside Folders, not a second Tab stop", () => {
    expect(chats).not.toContain('<ProTag onPress={() => unlock("folders")} />\n        </View>');
    expect(chats).toMatch(/testID="open-folders"[\s\S]{0,400}testID="pro-tag"/);
  });
});

describe("F397 · the lock seal answers the keyboard", () => {
  const lock = readFileSync(join(__dirname, "../src/lock/LockScreen.tsx"), "utf8");
  it("Enter/Space on web and the screen reader's activate on native open the wipe confirm", () => {
    expect(lock).toContain('keyboardPress(e) && setWipeOpen(true)');
    expect(lock).toContain('n?.detail === 0');
    expect(lock).toContain('onAccessibilityAction: () => setWipeOpen(true)');
  });
});

describe("F398 · a browser export confirms itself", () => {
  const sheet = readFileSync(join(__dirname, "../src/screens/chat/ExportSheet.tsx"), "utf8");
  it("every export goes through one delivery that reports the download", () => {
    expect(sheet).not.toContain("afterSheetClose(() => void shareFile(");
    expect(sheet).toContain('onExported?.(t("export.downloaded", { file: file.filename }))');
  });
});
