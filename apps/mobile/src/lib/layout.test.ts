import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ACTION_WIDTH, CARD_WIDTH, COLUMN_WIDTH, DESKTOP_MIN, PANEL_WIDTH, SIDEBAR_WIDTH, WIDE_MIN, actionMaxWidth, cardMaxWidth, contentMaxWidth, hasPanel, isWide, layoutModeFor } from "./layout";

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

  it("lets no Tauri window shrink below the width the desktop shell needs (F63)", () => {
    const conf = JSON.parse(readFileSync(join(__dirname, "../../../desktop/src-tauri/tauri.conf.json"), "utf8")) as { app: { windows: { width: number; height: number; minWidth: number; minHeight: number }[] } };
    for (const w of conf.app.windows) {
      expect(w.minWidth).toBe(DESKTOP_MIN);
      expect(w.minHeight).toBe(720);
      /* A window that opens narrower than its own minimum is a window the shell never sees at its design size. */
      expect(w.width).toBeGreaterThanOrEqual(w.minWidth);
      expect(w.height).toBeGreaterThanOrEqual(w.minHeight);
      expect(layoutModeFor(w.minWidth)).toBe("desktop");
    }
  });

  it("holds the minimum at the narrowest width §8.9's own parts fit in (F47)", () => {
    const conf = JSON.parse(readFileSync(join(__dirname, "../../../desktop/src-tauri/tauri.conf.json"), "utf8")) as { app: { windows: { minWidth: number }[] } };
    for (const w of conf.app.windows) {
      /* The complement of the row above: the minimum is the exact width at which the panel starts fitting. */
      expect(layoutModeFor(w.minWidth - 1)).not.toBe("desktop");
      expect(SIDEBAR_WIDTH + COLUMN_WIDTH).toBeLessThanOrEqual(w.minWidth);
      expect(SIDEBAR_WIDTH + PANEL_WIDTH).toBeLessThanOrEqual(w.minWidth);
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

describe("content, action and card widths", () => {
  it("leaves a phone's own gutters as the whole rule", () => {
    for (const w of [320, 375, 390, 412, 430, WIDE_MIN - 1]) {
      expect(contentMaxWidth(w)).toBeUndefined();
      expect(actionMaxWidth(w)).toBeUndefined();
      expect(cardMaxWidth(w)).toBeUndefined();
    }
  });

  it("caps the reading column and page actions from the wide threshold up (F110)", () => {
    for (const w of [WIDE_MIN, 768, 1024, DESKTOP_MIN, 1440, 1920, 3840]) {
      expect(contentMaxWidth(w)).toBe(COLUMN_WIDTH);
      expect(actionMaxWidth(w)).toBe(ACTION_WIDTH);
      expect(cardMaxWidth(w)).toBe(CARD_WIDTH);
    }
  });

  it("keeps the caps in the order the shell stacks them", () => {
    /* An action sits inside the onboarding card, which sits inside the reading column, which sits inside the message column. */
    expect(ACTION_WIDTH).toBeLessThan(CARD_WIDTH);
    expect(CARD_WIDTH).toBeLessThan(COLUMN_WIDTH);
    expect(COLUMN_WIDTH).toBeLessThanOrEqual(WIDE_MIN);
  });

  it("never returns a cap wider than the window it was asked about", () => {
    for (let w = 200; w <= 2000; w += 1) {
      for (const cap of [contentMaxWidth(w), actionMaxWidth(w), cardMaxWidth(w)]) {
        if (cap !== undefined) expect(cap).toBeLessThanOrEqual(w);
      }
    }
  });

  it("caps the column the sidebar shell leaves for a screen, not the window (F110)", () => {
    /* The hooks read the window width, which is only ever wider than the content area; a cap that only shrinks stays correct. */
    for (const w of [DESKTOP_MIN, 1440, 1920]) {
      const content = w - SIDEBAR_WIDTH;
      expect(Math.min(content, contentMaxWidth(w) ?? content)).toBeLessThanOrEqual(content);
      expect(Math.min(content, contentMaxWidth(w) ?? content)).toBe(COLUMN_WIDTH);
    }
  });
});
