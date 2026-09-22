import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { DESKTOP_MIN, SIDEBAR_WIDTH, COLUMN_WIDTH, PANEL_WIDTH, layoutModeFor } from "../src/lib/layout";

/** The window the Tauri shell actually opens, read from the config that is baked into the built app. */
const config = JSON.parse(readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "desktop", "src-tauri", "tauri.conf.json"), "utf8")) as {
  app: { windows: { width: number; height: number; minWidth: number; minHeight: number }[] };
};
const [main] = config.app.windows;
if (!main) throw new Error("tauri.conf.json declares no window");

/** Spec §9.7: the desktop window may not be smaller than this. */
const SPEC_MIN_HEIGHT = 720;

describe("desktop window minimum (F47)", () => {
  it("cannot be dragged below the §9.7 minimum of 1040x720", () => {
    expect([main.minWidth, main.minHeight]).toEqual([DESKTOP_MIN, SPEC_MIN_HEIGHT]);
  });

  it("opens at or above its own minimum, so the first paint is never the clamped size", () => {
    expect(main.width).toBeGreaterThanOrEqual(main.minWidth);
    expect(main.height).toBeGreaterThanOrEqual(main.minHeight);
  });

  it("gives every allowed window the desktop shell, panel included", () => {
    expect(layoutModeFor(main.minWidth)).toBe("desktop");
    expect(layoutModeFor(main.width)).toBe("desktop");
    /* The complement: one pixel narrower is exactly where the panel stops fitting. */
    expect(layoutModeFor(main.minWidth - 1)).not.toBe("desktop");
  });

  it("leaves room for the §8.9 sidebar, message column and document panel at the narrowest window", () => {
    expect(SIDEBAR_WIDTH + COLUMN_WIDTH).toBeLessThanOrEqual(main.minWidth);
    expect(SIDEBAR_WIDTH + PANEL_WIDTH).toBeLessThanOrEqual(main.minWidth);
  });
});
