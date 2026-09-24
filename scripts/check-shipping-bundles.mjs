#!/usr/bin/env node
/**
 * Release gate: every shipping artifact present in this tree is free of the QA bridge (F299), and every store build
 * carries the models the catalog says it ships, byte for byte (F341): the iOS archive each `bundled` model as
 * `<App>.app/<id>.gguf`, the Android bundle each `fast-follow` Play pack. Instant's photo projector is one of them, so
 * a build without it would answer a fresh install's first photo with a download offer.
 *
 * scripts/check-qa-bridge.sh was run by hand by whoever remembered, so a future build could ship the bridge and
 * nothing would fail. This walks the artifact paths the builds actually write and runs that gate on each one, so
 * `pnpm check:store` — and therefore `pnpm test` — carries it.
 *
 *   node scripts/check-shipping-bundles.mjs            # gate what is built; say so when nothing is
 *   INBORN_REQUIRE_BUNDLE=1 node scripts/…             # the release form: a tree with nothing built fails
 *   node scripts/check-shipping-bundles.mjs <dir>      # gate one path (how the guard's own test watches it go red)
 *   node scripts/check-shipping-bundles.mjs --models <X.app|X.xcarchive|X.aab>   # the model gate alone, on one build
 *   INBORN_CATALOG=<manifest.json>                     # the catalog to gate against (tests); default: the bundled one
 */
import { execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream, existsSync, readFileSync, readdirSync } from "node:fs";
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

const catalog = JSON.parse(readFileSync(process.env.INBORN_CATALOG || path.join(repo, "packages/core/src/catalog/manifest.json"), "utf8"));

/** What each store build must carry: iOS every `bundled` model at the bundle root, Android every fast-follow pack's file(s). */
function shippedModels() {
  const ios = [];
  const android = [];
  for (const m of catalog.models) {
    const parts = m.parts ?? [{ file: m.file, bytes: m.bytes, sha256: m.sha256 }];
    for (const d of m.delivery) {
      if (d.kind === "bundled") ios.push({ id: m.id, entry: `${m.id}.gguf`, bytes: m.bytes, sha256: m.sha256 });
      if (d.kind === "play-asset-pack" && d.mode === "fast-follow") {
        const part = parts.find((p) => p.file === d.file) ?? parts[0];
        android.push({ id: m.id, entry: `${d.pack}/assets/${d.file}`, bytes: part.bytes, sha256: part.sha256 });
      }
    }
  }
  return { ios, android };
}

function hashStream(stream) {
  return new Promise((resolve, reject) => {
    const h = createHash("sha256");
    let bytes = 0;
    stream.on("data", (c) => {
      bytes += c.length;
      h.update(c);
    });
    stream.on("error", reject);
    stream.on("end", () => resolve({ bytes, sha256: h.digest("hex") }));
  });
}

function appInside(p) {
  if (p.endsWith(".app")) return p;
  const apps = path.join(p, "Products/Applications");
  const app = existsSync(apps) ? readdirSync(apps).find((f) => f.endsWith(".app")) : undefined;
  return app ? path.join(apps, app) : null;
}

/** One line per expected model; returns the number of failures. */
async function checkModels(abs, label) {
  const want = shippedModels();
  const aab = abs.endsWith(".aab");
  const expected = aab ? want.android : want.ios;
  let entries = null;
  let app = null;
  if (aab) entries = new Set(execFileSync("unzip", ["-Z1", abs], { encoding: "utf8", maxBuffer: 64 << 20 }).split("\n"));
  else app = appInside(abs);
  if (!aab && !app) {
    console.log(`  ${label} (models): FAIL no .app inside`);
    return 1;
  }
  let failed = 0;
  for (const m of expected) {
    const present = aab ? entries.has(m.entry) : existsSync(path.join(app, m.entry));
    if (!present) {
      failed++;
      console.log(`  ${label} (models): FAIL ${m.id} missing (${m.entry})`);
      continue;
    }
    const got = aab ? await hashStream(spawn("unzip", ["-p", abs, m.entry]).stdout) : await hashStream(createReadStream(path.join(app, m.entry)));
    if (got.bytes !== m.bytes || got.sha256 !== m.sha256) {
      failed++;
      console.log(`  ${label} (models): FAIL ${m.id} is ${got.bytes} B sha256 ${got.sha256.slice(0, 12)}…, catalog says ${m.bytes} B ${m.sha256.slice(0, 12)}…`);
    } else console.log(`  ${label} (models): OK ${m.id} ${m.entry} ${m.bytes} B sha256 matches the catalog`);
  }
  return failed;
}

if (process.argv[2] === "--models") {
  const target = process.argv[3];
  if (!target || !existsSync(target)) {
    console.log("usage: check-shipping-bundles.mjs --models <X.app|X.xcarchive|X.aab>");
    process.exit(2);
  }
  const failed = await checkModels(path.resolve(target), target);
  console.log(failed ? `\nFAIL: ${failed} shipped model(s) missing or not the catalog's bytes.` : "\nPASS: every model the catalog ships is in the build, byte for byte.");
  process.exit(failed ? 1 : 0);
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

let missing = 0;
if (!explicit) for (const t of targets) if (t.label.endsWith(".xcarchive") || t.label.endsWith(".aab")) missing += await checkModels(t.abs, t.label);
if (missing) {
  console.log(`\nFAIL: ${missing} shipped model(s) missing or not the catalog's bytes.`);
  process.exit(1);
}
