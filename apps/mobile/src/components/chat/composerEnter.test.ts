import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

/** Loads the key module with a platform and an optional fake DOM, since it reads both at import time (F108). */
async function load(os: "web" | "ios" | "android", dom?: { matches?: boolean; noMatchMedia?: boolean }) {
  vi.resetModules();
  vi.doMock("react-native", () => ({ Platform: { OS: os } }));
  vi.doMock("expo", () => ({ requireOptionalNativeModule: () => null }));
  const g = globalThis as { matchMedia?: unknown };
  if (dom?.noMatchMedia) delete g.matchMedia;
  else if (dom) g.matchMedia = () => ({ matches: dom.matches !== false });
  return await import("../../../modules/hardware-keys");
}

afterEach(() => {
  delete (globalThis as { matchMedia?: unknown }).matchMedia;
  delete (globalThis as { document?: unknown }).document;
  vi.doUnmock("react-native");
  vi.doUnmock("expo");
});

describe("F108 · Enter sends from a hardware keyboard", () => {
  it("a bare Enter sends", async () => {
    const { sendsOnEnter } = await load("web");
    expect(sendsOnEnter({ key: "Enter" })).toBe(true);
  });

  it("Shift+Enter breaks the line instead of sending", async () => {
    const { sendsOnEnter } = await load("web");
    expect(sendsOnEnter({ key: "Enter", shiftKey: true })).toBe(false);
  });

  it("no other modifier sends either, so the OS shortcuts keep their meaning", async () => {
    const { sendsOnEnter } = await load("web");
    for (const mod of ["altKey", "ctrlKey", "metaKey"] as const)
      expect(sendsOnEnter({ key: "Enter", [mod]: true }), mod).toBe(false);
  });

  it("another key never sends", async () => {
    const { sendsOnEnter } = await load("web");
    for (const key of ["a", " ", "Escape", "Tab", "NumpadEnter"]) expect(sendsOnEnter({ key }), key).toBe(false);
  });

  it("a keystroke an IME is still composing is a composition, not a send", async () => {
    const { sendsOnEnter } = await load("web");
    expect(sendsOnEnter({ key: "Enter", isComposing: true })).toBe(false);
    expect(sendsOnEnter({ key: "Enter", keyCode: 229 })).toBe(false);
  });

  it("a browser with a fine pointer has a hardware Enter", async () => {
    const { hasHardwareEnter } = await load("web", { matches: true });
    expect(hasHardwareEnter()).toBe(true);
  });

  it("a touch-only browser does not, so a phone keeps Enter as a newline", async () => {
    const { hasHardwareEnter } = await load("web", { matches: false });
    expect(hasHardwareEnter()).toBe(false);
  });

  it("a browser too old for matchMedia is treated as having one rather than losing the key", async () => {
    const { hasHardwareEnter } = await load("web", { noMatchMedia: true });
    expect(hasHardwareEnter()).toBe(true);
  });

  it("a phone with no native module and no DOM reports none", async () => {
    const { hasHardwareEnter, captureHardwareEnter } = await load("ios", { noMatchMedia: true });
    expect(hasHardwareEnter()).toBe(false);
    expect(captureHardwareEnter(() => true)()).toBeUndefined();
  });

  it("the web capture sends on Enter from the field, and stops the newline only then", async () => {
    const { captureHardwareEnter } = await load("web", { matches: true });
    const doc = fakeDoc("TEXTAREA");
    let sent = 0;
    const off = captureHardwareEnter(() => (sent++, true));
    expect(doc.listener).toBeTruthy();
    const e = keyEvent({ key: "Enter" });
    doc.listener!(e);
    expect(sent).toBe(1);
    expect(e.defaultPrevented).toBe(true);
    off();
    expect(doc.listener).toBeNull();
  });

  it("an empty draft keeps Enter as a newline: nothing sent, nothing swallowed", async () => {
    const { captureHardwareEnter } = await load("web", { matches: true });
    const doc = fakeDoc("TEXTAREA");
    captureHardwareEnter(() => false);
    const e = keyEvent({ key: "Enter" });
    doc.listener!(e);
    expect(e.defaultPrevented).toBe(false);
  });

  it("Enter outside a text field is left alone", async () => {
    const { captureHardwareEnter } = await load("web", { matches: true });
    const doc = fakeDoc("BUTTON");
    let sent = 0;
    captureHardwareEnter(() => (sent++, true));
    const e = keyEvent({ key: "Enter" });
    doc.listener!(e);
    expect(sent).toBe(0);
    expect(e.defaultPrevented).toBe(false);
  });

  it("the composer arms the capture while it has focus and reports whether it sent", () => {
    const src = readFileSync(join(__dirname, "Composer.tsx"), "utf8");
    expect(src).toContain("captureHardwareEnter");
    expect(src).toMatch(/if \(!focused\) return;/);
    expect(src).toMatch(/if \(!enter\.current\.canSend\) return false;/);
    expect(src).toMatch(/enter\.current\.onSend\(\);\s*\n\s*return true;/);
  });
});

interface FakeEvent {
  key: string;
  shiftKey?: boolean;
  defaultPrevented: boolean;
  preventDefault(): void;
}

function keyEvent(init: { key: string; shiftKey?: boolean }): FakeEvent {
  const e: FakeEvent = { ...init, defaultPrevented: false, preventDefault: () => void (e.defaultPrevented = true) };
  return e;
}

/** A document with one active element and one keydown listener, which is all the capture touches. */
function fakeDoc(tagName: string) {
  const state: { listener: ((e: FakeEvent) => void) | null } = { listener: null };
  (globalThis as { document?: unknown }).document = {
    activeElement: { tagName },
    addEventListener: (_: string, fn: (e: FakeEvent) => void) => void (state.listener = fn),
    removeEventListener: () => void (state.listener = null),
  };
  return state;
}
