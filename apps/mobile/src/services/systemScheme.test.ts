import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { systemSchemeWatch, type SchemeQuery } from "./systemScheme";

function fakeQuery(initial: boolean, legacy = false) {
  let handler: ((e: { matches: boolean }) => void) | null = null;
  const q: SchemeQuery & { matches: boolean } = { matches: initial };
  if (legacy) q.addListener = (h) => (handler = h);
  else q.addEventListener = (_t, h) => (handler = h);
  return { q, flip: (dark: boolean) => { q.matches = dark; handler?.({ matches: dark }); } };
}

describe("Auto follows a live OS scheme change on the web (W1, F394)", () => {
  it("a dark to light flip reaches every subscriber and the snapshot", () => {
    const { q, flip } = fakeQuery(true);
    const watch = systemSchemeWatch(q);
    const seen = vi.fn();
    watch.subscribe(seen);
    expect(watch.get()).toBe("dark");
    flip(false);
    expect(seen).toHaveBeenCalledTimes(1);
    expect(watch.get()).toBe("light");
    flip(true);
    expect(watch.get()).toBe("dark");
  });

  it("works with the addListener-only query of older Safari, and unsubscribes", () => {
    const { q, flip } = fakeQuery(false, true);
    const watch = systemSchemeWatch(q);
    const seen = vi.fn();
    const off = watch.subscribe(seen);
    flip(true);
    off();
    flip(false);
    expect(seen).toHaveBeenCalledTimes(1);
  });

  it("useTheme reads the web store, so the hook re-renders on the OS change", () => {
    const src = readFileSync(join(__dirname, "theme.ts"), "utf8");
    expect(src).toContain("systemSchemeWatch(");
    expect(src).toMatch(/useSyncExternalStore\(webSystem/);
  });
});
