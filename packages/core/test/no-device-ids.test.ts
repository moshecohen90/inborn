import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { join, extname } from "node:path";
import { describe, expect, it } from "vitest";

const repo = join(__dirname, "../../..");

/** Built from fragments so this guard file cannot trip its own guard. */
const FORBIDDEN: Record<string, string> = {
  "iPhone 13 Pro UDID (Moshe's device)": ["00008110", "001465382661801E"].join("-"),
  "OnePlus 6T adb serial (Moshe's device)": ["9867", "7cba"].join(""),
  "App Store Connect key id": ["H2SHY", "VHQ23"].join(""),
};

const MAX_BYTES = 2 * 1024 * 1024;
const BINARY_EXT = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".pdf", ".zip", ".gz", ".tgz",
  ".woff", ".woff2", ".ttf", ".otf", ".mp3", ".mp4", ".mov", ".wav", ".m4a",
  ".aab", ".apk", ".ipa", ".p8", ".p12", ".keystore", ".jar", ".so", ".db", ".sqlite",
]);

function trackedFiles(): string[] {
  const out = execFileSync("git", ["ls-files", "-z"], { cwd: repo, encoding: "utf8" });
  return out.split("\0").filter(Boolean);
}

/**
 * Repo is public (moshecohen90/inborn): a device UDID/serial or ASC key id landing in a tracked
 * file identifies Moshe's personal hardware/account, so this fails the build the moment one comes back.
 */
describe("no personal device identifiers or ASC key ids in tracked files", () => {
  it("scans every tracked text file for the forbidden literals", () => {
    const hits: string[] = [];
    for (const rel of trackedFiles()) {
      if (BINARY_EXT.has(extname(rel).toLowerCase())) continue;
      const abs = join(repo, rel);
      let size: number;
      try {
        size = statSync(abs).size;
      } catch {
        continue; // deleted-but-staged edge case; nothing to scan
      }
      if (size > MAX_BYTES) continue;
      let content: string;
      try {
        content = readFileSync(abs, "utf8");
      } catch {
        continue; // not readable as utf8 text (binary without a recognised extension)
      }
      for (const [label, literal] of Object.entries(FORBIDDEN)) {
        if (content.includes(literal)) hits.push(`${rel}: ${label}`);
      }
    }
    expect(hits).toEqual([]);
  });
});
