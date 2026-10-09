#!/usr/bin/env node
/**
 * Rebuilds the images of the design demo (out/demo-inborn.html): each compose.mjs --style on the EN 6.9" set plus its Play
 * feature graphic, into out/demo/<style>/.
 *
 *   node design/store/demo.mjs [--dest=<dir>] [--listings=<dir>]
 */
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { STYLES } from "./styles.mjs";

const __dir = dirname(fileURLToPath(import.meta.url));
const DEST = resolve(process.argv.find((a) => a.startsWith("--dest="))?.slice(7) ?? join(__dir, "out"));
const pass = process.argv.filter((a) => a.startsWith("--listings="));
const tmp = mkdtempSync(join(tmpdir(), "inborn-demo-"));
try {
  for (const style of STYLES) {
    const r = spawnSync(process.execPath, [join(__dir, "compose.mjs"), `--style=${style}`, "--locale=en", "--set=apple-6.9,play-feature", `--out=${join(tmp, style)}`, ...pass], { stdio: "inherit" });
    if (r.status !== 0) process.exit(r.status ?? 1);
    const dir = join(DEST, "demo", style);
    mkdirSync(dir, { recursive: true });
    const phone = join(tmp, style, "apple/en/6.9");
    for (const f of readdirSync(phone)) copyFileSync(join(phone, f), join(dir, f));
    copyFileSync(join(tmp, style, "play/en/feature-graphic.png"), join(dir, "feature-graphic.png"));
  }
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
console.log(`demo images → ${join(DEST, "demo")}`);
