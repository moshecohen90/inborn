import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { WEB_ASSETS, copyWebAssets } from "../scripts/copy-web-assets.mjs";

const mobile = join(__dirname, "..");
const tauriConf = JSON.parse(readFileSync(join(mobile, "..", "desktop", "src-tauri", "tauri.conf.json"), "utf8"));
const assets = WEB_ASSETS as [string, string][];

describe("web assets fetched by URL ship in every web export (desktop included)", () => {
  it("copies each asset from node_modules into public/", () => {
    const dir = mkdtempSync(join(tmpdir(), "inborn-web-assets-"));
    try {
      for (const [from] of assets) {
        mkdirSync(dirname(join(dir, "node_modules", from)), { recursive: true });
        writeFileSync(join(dir, "node_modules", from), from);
      }
      copyWebAssets(dir);
      for (const [from, to] of assets) expect(readFileSync(join(dir, "public", to), "utf8")).toBe(from);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("covers every path the bundle fetches, and each source exists in node_modules", () => {
    const shipped = assets.map(([, to]) => `/${to}`);
    const wllama = readFileSync(join(mobile, "src", "adapters", "wllama.ts"), "utf8");
    const extract = readFileSync(join(mobile, "src", "documents", "extract.ts"), "utf8");
    const fetched = [...`${wllama}\n${extract}`.matchAll(/"(\/(?:wllama|pdfjs)\/[^"]+)"/g)].map((m) => m[1]);
    expect(fetched.length).toBeGreaterThanOrEqual(4);
    for (const url of fetched) expect(shipped).toContain(url);
    for (const [from] of assets) expect(existsSync(join(mobile, "node_modules", from))).toBe(true);
  });

  it("the Tauri build copies them before exporting, and neither Tauri command needs a POSIX shell", () => {
    const { beforeBuildCommand = "", beforeDevCommand = "" } = tauriConf.build as Record<string, string | undefined>;
    expect(beforeBuildCommand.indexOf("copy-web-assets.mjs")).toBeGreaterThan(-1);
    expect(beforeBuildCommand.indexOf("copy-web-assets.mjs")).toBeLessThan(beforeBuildCommand.indexOf("expo export"));
    /* cmd.exe runs these on Windows: no `VAR=value cmd`, no mkdir -p, no cp. */
    for (const command of [beforeBuildCommand, beforeDevCommand]) {
      expect(command).not.toMatch(/(^|&&\s*)[A-Z_]+=\S+\s/);
      expect(command).not.toMatch(/\bmkdir -p\b|\bcp\b|\brm -/);
    }
  });
});
