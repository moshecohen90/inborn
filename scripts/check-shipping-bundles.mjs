#!/usr/bin/env node
/**
 * Release gate: every shipping artifact present in this tree is free of the QA bridge (F299).
 *
 * scripts/check-qa-bridge.sh was run by hand by whoever remembered, so a future build could ship the bridge and
 * nothing would fail. This walks the artifact paths the builds actually write and runs that gate on each one, so
 * `pnpm check:store` — and therefore `pnpm test` — carries it.
 *
 *   node scripts/check-shipping-bundles.mjs            # gate what is built; say so when nothing is
 *   INBORN_REQUIRE_BUNDLE=1 node scripts/…             # the release form: a tree with nothing built fails
 *   node scripts/check-shipping-bundles.mjs <dir>      # gate one path (how the guard's own test watches it go red)
 */
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const repo = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const gate = path.join(repo, "scripts/check-qa-bridge.sh");

/** Where each build writes what it ships. A glob dir is expanded to the files in it with those extensions. */
const ARTIFACTS = [
  { path: "apps/web/dist", what: "browser app" },
  { path: "apps/mobile/dist", what: "expo web export" },
  { path: "apps/mobile/ios/build/Inborn.xcarchive", what: "iOS archive" },
  { path: "apps/mobile/android/app/build/outputs/bundle/release", what: "Android bundle", ext: [".aab"] },
  { path: "apps/mobile/android/app/build/outputs/apk/release", what: "Android APK", ext: [".apk"] },
];

function expand({ path: rel, what, ext }) {
  const abs = path.join(repo, rel);
  if (!existsSync(abs)) return [];
  if (!ext) return [{ abs, what, label: rel }];
  return readdirSync(abs)
    .filter((f) => ext.some((e) => f.endsWith(e)))
    .map((f) => ({ abs: path.join(abs, f), what, label: `${rel}/${f}` }));
}

const explicit = process.argv[2];
const targets = explicit ? [{ abs: path.resolve(explicit), what: "given path", label: explicit }] : ARTIFACTS.flatMap(expand);

if (!targets.length) {
  const required = process.env.INBORN_REQUIRE_BUNDLE === "1";
  console.log(`${required ? "FAIL" : "SKIP"}: no shipping artifact in this tree (${ARTIFACTS.map((a) => a.path).join(", ")})`);
  if (required) console.log("  build one first: corepack pnpm web:build, or expo export:embed / xcodebuild / gradlew bundleRelease");
  process.exit(required ? 1 : 0);
}

let failed = 0;
for (const t of targets) {
  try {
    const out = execFileSync("bash", [gate, t.abs], { encoding: "utf8" });
    console.log(`  ${t.label} (${t.what}): ${out.trim().split("\n")[0]}`);
  } catch (e) {
    failed++;
    console.log(`  ${t.label} (${t.what}): ${String(e.stdout ?? e.message).trim()}`);
  }
}
if (failed) {
  console.log(`\nFAIL: ${failed} shipping artifact(s) carry the QA bridge.`);
  process.exit(1);
}
console.log(`\nPASS: ${targets.length} shipping artifact(s) carry no QA bridge.`);
