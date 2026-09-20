import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { listClipping } from "./listClipping";

const SRC = join(__dirname, "..");

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return sources(p);
    return e.isFile() && p.endsWith(".tsx") ? [p] : [];
  });
}

describe("listClipping (F33: a popped screen re-attaches its whole view tree)", () => {
  it("turns off Android's row recycling", () => {
    expect(listClipping.removeClippedSubviews).toBe(false);
  });

  it("is spread on every virtualized list in the app", () => {
    const offenders = sources(SRC)
      .filter((p) => /<(FlatList|SectionList|VirtualizedList)\b/.test(readFileSync(p, "utf8")))
      .filter((p) => !/\{\.\.\.listClipping\}/.test(readFileSync(p, "utf8")))
      .map((p) => p.slice(SRC.length + 1));
    expect(offenders).toEqual([]);
  });
});
