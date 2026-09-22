import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * F59 is the F42 pattern: policy, guard, an ack and four translated strings, and no screen reading any of them.
 * A unit test cannot render the sheet in node, so this asserts the wiring the audit found missing — a component
 * that shows the guard's `explain`, closes it through ackExplain, uses all four keys, and is mounted in the shell.
 */
const SRC = join(__dirname, "..");
const LOCALES = join(__dirname, "../../../../packages/i18n/locales");

function sources(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) sources(path, out);
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(path);
  }
  return out;
}

const files = sources(SRC).map((path) => ({ path, text: readFileSync(path, "utf8") }));
/* The guard and the hook that exposes it are the machinery, not a reader of it. */
const screens = files.filter((f) => !/src\/device\/(guard|useDeviceState)\.ts$/.test(f.path));
const SHEET_KEYS = ["device.sheet.title", "device.sheet.body", "device.sheet.dontSwitch", "device.sheet.ok"];

describe("the first-automatic-switch explainer is wired to a screen (§8.8 row 4c)", () => {
  it("something outside the guard dismisses it through ackExplain", () => {
    expect(screens.filter((f) => f.text.includes("ackExplain")).map((f) => f.path)).not.toEqual([]);
  });

  it("something outside the guard reads the guard's explain payload", () => {
    expect(screens.filter((f) => /\bexplain\b/.test(f.text) && f.text.includes("useDeviceGuardState")).map((f) => f.path)).not.toEqual([]);
  });

  it("all four shipped device.sheet keys are rendered, none left as dead translation", () => {
    const rendered = files.map((f) => f.text).join("\n");
    for (const key of SHEET_KEYS) expect(rendered, key).toContain(key);
  });

  it("the sheet is mounted app-wide, not inside one screen", () => {
    expect(readFileSync(join(SRC, "app/_layout.tsx"), "utf8")).toContain("<DeviceExplainSheet />");
  });

  it("every locale still ships the four keys", () => {
    for (const file of readdirSync(LOCALES).filter((f) => f.endsWith(".json"))) {
      const dict = JSON.parse(readFileSync(join(LOCALES, file), "utf8")) as Record<string, string>;
      for (const key of SHEET_KEYS) expect(dict[key], `${file} ${key}`).toBeTruthy();
    }
  });
});
