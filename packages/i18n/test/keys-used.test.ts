import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const en = JSON.parse(readFileSync(join(__dirname, "../locales/en.json"), "utf8")) as Record<string, string>;
const root = join(__dirname, "../../../apps/mobile/src");

function* walk(dir: string): Generator<string> {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (/\.tsx?$/.test(f)) yield p;
  }
}

/** Every literal t("…") key in the app exists in en.json, so a typo never ships as a raw key. */
describe("keys used by apps/mobile", () => {
  it("all exist in en.json", () => {
    const missing = new Set<string>();
    for (const file of walk(root)) {
      const src = readFileSync(file, "utf8");
      for (const m of src.matchAll(/\bt\(\s*"([^"]+)"/g)) if (!(m[1]! in en)) missing.add(`${m[1]} (${file.slice(root.length + 1)})`);
    }
    expect([...missing]).toEqual([]);
  });
});
