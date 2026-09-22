import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Gap #18 (spec conformance, 22.9.2026): the app shipped a 16.4 deployment target while §6.3,
 * `docs/qa/release-checklist.md` T36 and `docs/legal/privacy-policy.md` all declare iOS 17. Nothing failed, because
 * the number lives in generated files (`ios/` is not committed) and in seven podspecs nobody reads together.
 * Every one of those places is checked here against the single declared floor.
 */
const MOBILE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ROOT = path.resolve(MOBILE, "../..");
const FLOOR = "17.0";

const read = (p: string): string => readFileSync(p, "utf8");

/** Every `<module>/ios/*.podspec` we own; a new native module is picked up without touching this test. */
function podspecs(): string[] {
  const modules = path.join(MOBILE, "modules");
  return readdirSync(modules, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .flatMap((d) => {
      const ios = path.join(modules, d.name, "ios");
      let entries: string[];
      try {
        entries = readdirSync(ios);
      } catch {
        return [];
      }
      return entries.filter((f) => f.endsWith(".podspec")).map((f) => path.join(ios, f));
    });
}

describe("iOS deployment target", () => {
  it("is declared once, in app.config.ts, as the floor the docs promise", () => {
    const config = read(path.join(MOBILE, "app.config.ts"));
    expect(config).toMatch(/deploymentTarget:\s*"17\.0"/);
    /* Expo's own key reaches `ios/Podfile.properties.json` and the app target; the project-level pair is this plugin's. */
    expect(config).toContain("./plugins/withProjectDeploymentTarget");
  });

  it("is what every podspec we own declares", () => {
    const specs = podspecs();
    expect(specs.length).toBeGreaterThan(0);
    for (const spec of specs) {
      const platforms = read(spec).match(/s\.platforms\s*=\s*\{\s*:ios\s*=>\s*'([^']+)'/);
      expect(platforms, `${path.relative(ROOT, spec)} declares no :ios platform`).not.toBeNull();
      expect(platforms?.[1], path.relative(ROOT, spec)).toBe(FLOOR);
    }
  });

  it("is the floor the release checklist tests and the privacy policy names", () => {
    expect(read(path.join(ROOT, "docs/qa/release-checklist.md"))).toContain("Minimum OS floor: Android 8 (API 26) and iOS 17");
    expect(read(path.join(ROOT, "docs/legal/privacy-policy.md"))).toContain("Model delivery, iOS 17 to 25");
  });
});
