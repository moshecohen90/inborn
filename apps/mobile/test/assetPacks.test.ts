import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { BUNDLED_MANIFEST } from "@inborn/core";

/* Fast's photo pack reaches Android only as a Play pack: the release build has no INTERNET permission. */
const REPO = path.resolve(__dirname, "../../..");
const CONFIG = readFileSync(path.join(REPO, "apps/mobile/app.config.ts"), "utf8");
const plugin = createRequire(__filename)("../plugins/withAssetPacks.js") as {
  resolvePacks: (root: string, packs: Pack[]) => (Pack & { sources: Record<string, string> })[];
  packBuildGradle: (pack: Pack) => string;
};
type Pack = { name: string; deliveryType: string; assets: Record<string, string> };

/** ALL_PACKS read out of app.config.ts the way scripts/check-android-bundle.sh reads it. */
function configPacks(): Pack[] {
  const block = /^const ALL_PACKS = \{([\s\S]*?)^\} as const;/m.exec(CONFIG)?.[1] ?? "";
  return [...block.matchAll(/\{ name: "([a-z0-9_]+)", deliveryType: "([a-z-]+)", assets: \{ "([^"]+)": "([^"]+)" \} \}/g)].map((m) => ({ name: m[1]!, deliveryType: m[2]!, assets: { [m[3]!]: m[4]! } }));
}

const catalogPacks = BUNDLED_MANIFEST.models.flatMap((m) => m.delivery.flatMap((d) => (d.kind === "play-asset-pack" ? [{ id: m.id, ...d }] : [])));

describe("the Play pack catalogue", () => {
  it("Fast's projector is an on-demand Play pack beside its HTTPS route", () => {
    const fast = BUNDLED_MANIFEST.models.find((m) => m.id === "vision-qwen35-2b")!;
    expect(fast.delivery).toEqual([
      { kind: "play-asset-pack", pack: "inborn_model_vision_fast", mode: "on-demand", file: "mmproj-Qwen3.5-2B-F16.gguf" },
      { kind: "https", path: "mmproj-Qwen3.5-2B-F16.gguf" },
    ]);
  });

  it("every catalog Play pack is built by app.config.ts with the same name, delivery type and asset file, and nothing else is", () => {
    const built = configPacks();
    expect(built.map((p) => p.name).sort()).toEqual(catalogPacks.map((p) => p.pack).sort());
    for (const c of catalogPacks) {
      const p = built.find((b) => b.name === c.pack)!;
      expect(p.deliveryType, c.pack).toBe(c.mode);
      expect(Object.keys(p.assets), c.pack).toEqual([c.file]);
    }
  });

  it("the packs stay inside Play's limits: 1.5 GB each, 30 GB for on-demand and fast-follow together, 100 packs", () => {
    const sizeOf = (file: string) => BUNDLED_MANIFEST.models.flatMap((m) => m.parts ?? [{ file: m.file, bytes: m.bytes }]).find((x) => x.file === file)?.bytes ?? 0;
    const sizes = configPacks().map((p) => sizeOf(Object.keys(p.assets)[0]!));
    for (const s of sizes) expect(s).toBeGreaterThan(0);
    expect(Math.max(...sizes)).toBeLessThanOrEqual(1.5e9);
    expect(sizes.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(30e9);
    expect(sizes.length).toBeLessThanOrEqual(100);
  });
});

describe("plugins/withAssetPacks.js output for Fast's photo pack", () => {
  const pack = configPacks().find((p) => p.name === "inborn_model_vision_fast")!;

  it("writes an on-demand asset-pack module named after the pack", () => {
    const gradle = plugin.packBuildGradle(pack);
    expect(gradle).toContain("apply plugin: 'com.android.asset-pack'");
    expect(gradle).toContain('packName = "inborn_model_vision_fast"');
    expect(gradle).toContain('deliveryType = "on-demand"');
  });

  it("links the asset from INBORN_MODELS_DIR under its catalog file name, and skips the pack when the file is absent", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "inborn-packs-"));
    const before = process.env.INBORN_MODELS_DIR;
    process.env.INBORN_MODELS_DIR = dir;
    try {
      expect(plugin.resolvePacks(REPO, [pack])).toEqual([]);
      writeFileSync(path.join(dir, "mmproj-Qwen3.5-2B-F16.gguf"), "x");
      expect(plugin.resolvePacks(REPO, [pack])).toEqual([{ ...pack, sources: { "mmproj-Qwen3.5-2B-F16.gguf": path.join(dir, "mmproj-Qwen3.5-2B-F16.gguf") } }]);
    } finally {
      if (before === undefined) delete process.env.INBORN_MODELS_DIR;
      else process.env.INBORN_MODELS_DIR = before;
    }
  });
});
