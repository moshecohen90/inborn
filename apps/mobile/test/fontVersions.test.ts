import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const repo = join(__dirname, "../../..");
const fontDir = join(repo, "apps/mobile/assets/fonts");

/** The version string the TTF's own `name` table carries, e.g. "Version 3.005". Read from the bytes, not from a doc. */
function ttfVersion(file: string): string {
  /* The name table stores UTF-16BE for the Windows platform, so the ASCII form appears with NULs between the letters. */
  const raw = readFileSync(join(fontDir, file)).toString("latin1").replace(/\0/g, "");
  const hit = /Version (\d+\.\d+)/.exec(raw);
  if (!hit) throw new Error(`${file} carries no version string`);
  return hit[1]!;
}

/**
 * F297. `NOTICE.json` and `licenses.md` said "Plex Sans 1.1.0 · Plex Mono 2.5.0" while the packaged files report
 * 3.005 and 2.005. The attribution is served live on /licenses and inside the app, so it states the version of the
 * files that actually ship, and this reads those files to say so.
 */
describe("F297 · the third-party notice quotes the font versions the app ships", () => {
  const notice = JSON.parse(readFileSync(join(repo, "docs/legal/NOTICE.json"), "utf8")) as { components: { id: string; version: string }[] };
  const plex = notice.components.find((e) => e.id === "ibm-plex")!;

  it("every packaged face reports one of two versions: one for Sans, one for Mono", () => {
    const files = readdirSync(fontDir).filter((f) => f.endsWith(".ttf"));
    expect(files.length).toBe(5);
    const sans = new Set(files.filter((f) => f.startsWith("IBMPlexSans")).map(ttfVersion));
    const mono = new Set(files.filter((f) => f.startsWith("IBMPlexMono")).map(ttfVersion));
    expect([...sans], "the Sans faces disagree with each other").toHaveLength(1);
    expect([...mono], "the Mono faces disagree with each other").toHaveLength(1);
  });

  it("NOTICE.json names those two versions", () => {
    const sans = ttfVersion("IBMPlexSans-Regular.ttf");
    const mono = ttfVersion("IBMPlexMono-Regular.ttf");
    expect(plex.version, `the files report Sans ${sans} / Mono ${mono}`).toContain(`Plex Sans ${sans}`);
    expect(plex.version, `the files report Sans ${sans} / Mono ${mono}`).toContain(`Plex Mono ${mono}`);
  });

  it("the licence inventory the site renders says the same", () => {
    const md = readFileSync(join(repo, "docs/legal/licenses.md"), "utf8");
    expect(md).toContain(`Plex Sans ${ttfVersion("IBMPlexSans-Regular.ttf")}, Plex Mono ${ttfVersion("IBMPlexMono-Regular.ttf")}`);
  });
});
