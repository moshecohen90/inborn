import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { FEATURE_LIST, UNBUILT_FEATURES } from "@inborn/core";

const root = join(__dirname, "../src");

function* walk(dir: string): Generator<string> {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (/\.tsx?$/.test(f)) yield p;
  }
}

const sources = [...walk(root)].map((p) => ({ path: p.slice(root.length + 1), src: readFileSync(p, "utf8") }));
/* `unlimitedPersonas`, `proModels` and `documents` are asked by name inside the value moments, on a screen's behalf. */
const moments = ["moments.ts", "intake.ts"].map((f) => readFileSync(join(__dirname, "../../../packages/core/src/licence", f), "utf8")).join("\n");
const all = [...sources.map((s) => s.src), moments].join("\n");

/**
 * F42's shape: a mechanism built, translated and wired to the edge, that no screen ever asks. A gate key nobody calls
 * is a §7 row nobody enforces, so every key must either be asked somewhere or be declared unbuilt on purpose.
 */
describe("every gate key is asked by a screen", () => {
  it("no key in FEATURES is dead, and no key in UNBUILT_FEATURES is secretly live", () => {
    const asked = (f: string) => new RegExp(`["']${f}["']`).test(all);
    const dead = FEATURE_LIST.filter((f) => !UNBUILT_FEATURES.includes(f) && !asked(f));
    expect(dead).toEqual([]);
    const live = UNBUILT_FEATURES.filter((f) => asked(f));
    expect(live, "a key that is now enforced should leave UNBUILT_FEATURES").toEqual([]);
  });

  it("the moments the keys hide behind are themselves reached from a screen", () => {
    const screens = sources.map((s) => s.src).join("\n");
    for (const moment of ["persona", "model", "document", "feature"]) expect(screens, moment).toContain(`kind: "${moment}"`);
  });
});

/**
 * Every door into the document library asks the same question. The share target used to call `importFile` directly and
 * walked past both the Free file cap and the Work formats (QA F72).
 */
describe("the document intake doors", () => {
  const doors = ["documents/importPicker.ts", "documents/pickPlan.ts", "screens/Chat.tsx", "screens/documents/DocumentsScreen.tsx"];

  it("every file that reaches importFile came through fileIntake", () => {
    for (const door of doors) {
      const file = sources.find((s) => s.path === door);
      expect(file, door).toBeDefined();
      /* A door may ask the gate itself or hand the file to `runPick`, which asks it (documents/pickPlan.ts). */
      expect(file!.src, `${door} imports a file without asking fileIntake`).toMatch(/fileIntake|runPick\(/);
    }
  });

  it("no other module calls library.importFile behind the gate's back", () => {
    /* A test drives the library directly on purpose (documents/incognito.test.ts); a door is production code. */
    const callers = sources.filter((s) => !/\.test\.tsx?$/.test(s.path) && /\.importFile\(/.test(s.src) && !/\bDEV_|devFileUri/.test(s.src)).map((s) => s.path);
    for (const c of callers) expect(doors, `${c} calls importFile`).toContain(c);
  });
});
