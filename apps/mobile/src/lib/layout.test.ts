import { describe, expect, it } from "vitest";
import { DESKTOP_MIN, WIDE_MIN, hasPanel, isWide, layoutModeFor } from "./layout";

describe("layout mode", () => {
  it("keeps every phone width on the phone shell", () => {
    /* Portrait-locked (app.config.ts): the widest phone point size ships well under the threshold. */
    for (const w of [320, 375, 390, 412, 430, 440, WIDE_MIN - 1]) expect(layoutModeFor(w)).toBe("phone");
  });

  it("gives tablet and split-browser widths the sidebar shell without the panel", () => {
    for (const w of [WIDE_MIN, 820, 1024, DESKTOP_MIN - 1]) {
      expect(layoutModeFor(w)).toBe("wide");
      expect(isWide(layoutModeFor(w))).toBe(true);
      expect(hasPanel(layoutModeFor(w))).toBe(false);
    }
  });

  it("gives the desktop window its document panel from the §9.7 minimum up", () => {
    for (const w of [DESKTOP_MIN, 1120, 1280, 1440, 1920]) {
      expect(layoutModeFor(w)).toBe("desktop");
      expect(hasPanel(layoutModeFor(w))).toBe(true);
    }
  });

  it("is monotonic and never returns a mode between the thresholds", () => {
    const order = { phone: 0, wide: 1, desktop: 2 };
    let last = -1;
    for (let w = 200; w <= 2000; w += 1) {
      const step = order[layoutModeFor(w)];
      expect(step).toBeGreaterThanOrEqual(last);
      last = step;
    }
    expect(last).toBe(2);
  });
});
