#!/usr/bin/env node
/**
 * Replaces the Google Play listing graphics of Inborn with design/store/out/play/: per language phone, 7" and 10"
 * screenshots, the feature graphic, and the hi-res icon (out/play/icon-512.png, the same for every language).
 *
 *   INBORN_PLAY_SA_KEYCHAIN=store-reviews:play-service-account node design/store/upload-play.mjs --dry-run [--locale ja]
 *   INBORN_PLAY_SA_KEYCHAIN=store-reviews:play-service-account node design/store/upload-play.mjs [--locale ja]
 *
 * One edit for the whole run: per language images.deleteall then images.upload for each image type, then one commit.
 * A language with no listing in the app is skipped with a line (Play only accepts images for an existing listing).
 * `--dry-run` authenticates, opens an edit, reads the listings and the current image counts, prints the plan, and
 * deletes the edit without committing, so nothing changes.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { API, UPLOAD, accessToken, client, commitEdit, loadServiceAccount } from "../../scripts/lib/play-api.mjs";

const __dir = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dir, "out/play");
const PKG = "com.inbornapp.mobile";

const argv = process.argv.slice(2);
const DRY = argv.includes("--dry-run");
const ONLY = argv.includes("--locale") ? argv[argv.indexOf("--locale") + 1] : null;

/* our listing locale → Play language code */
const LANGS = { en: "en-US", ja: "ja-JP", de: "de-DE", fr: "fr-FR", es: "es-ES", "pt-BR": "pt-BR", ko: "ko-KR", "zh-Hant": "zh-TW" };
/* Play image type → where our PNGs are, and the size each must have */
const TYPES = [
  { type: "phoneScreenshots", dir: "phone", w: 1080, h: 1920 },
  { type: "sevenInchScreenshots", dir: "tablet-7", w: 1200, h: 1920 },
  { type: "tenInchScreenshots", dir: "tablet-10", w: 1600, h: 2560 },
  { type: "featureGraphic", file: "feature-graphic.png", w: 1024, h: 500 },
  { type: "icon", shared: "icon-512.png", w: 512, h: 512 },
];

const log = (...a) => console.log(...a);
const pngSize = (f) => {
  const b = readFileSync(f);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
};

function filesFor(locale, t) {
  if (t.shared) return existsSync(join(OUT, t.shared)) ? [join(OUT, t.shared)] : [];
  if (t.file) return existsSync(join(OUT, locale, t.file)) ? [join(OUT, locale, t.file)] : [];
  const dir = join(OUT, locale, t.dir);
  return existsSync(dir) ? readdirSync(dir).filter((f) => /^\d\d-.*\.png$/.test(f)).sort().map((f) => join(dir, f)) : [];
}

async function main() {
  const token = await accessToken(loadServiceAccount());
  /* Play answers 503 "currently unavailable" now and then on reads and writes alike; three tries with a pause cover it */
  const raw = client(token);
  const retry = (fn) => async (...a) => {
    for (let i = 1; ; i++) {
      try {
        return await fn(...a);
      } catch (e) {
        if (i >= 3 || !/→ 5\d\d/.test(String(e.message))) throw e;
        await new Promise((r) => setTimeout(r, 4000 * i));
      }
    }
  };
  const api = { get: retry(raw.get), post: retry(raw.post), put: retry(raw.put), patch: retry(raw.patch), del: retry(raw.del) };
  const edit = await api.post(`${API}/${PKG}/edits`, {});
  log(`auth ok · ${PKG} · edit ${edit.id} · ${DRY ? "DRY RUN, the edit is deleted uncommitted" : "LIVE"}`);
  let problems = 0;
  try {
    const listings = (await api.get(`${API}/${PKG}/edits/${edit.id}/listings`)).listings ?? [];
    const have = new Set(listings.map((l) => l.language));
    log(`listings in the app: ${[...have].join(", ")}`);
    for (const [ours, lang] of Object.entries(LANGS)) {
      if (ONLY && ONLY !== ours && ONLY !== lang) continue;
      if (!have.has(lang)) {
        log(`SKIP ${lang}: the app has no ${lang} store listing yet (add it in Play Console, then rerun with --locale ${ours})`);
        continue;
      }
      log(`\n${lang}`);
      for (const t of TYPES) {
        const files = filesFor(ours, t);
        const bad = files.filter((f) => {
          const d = pngSize(f);
          return d.w !== t.w || d.h !== t.h;
        });
        const current = (await api.get(`${API}/${PKG}/edits/${edit.id}/listings/${lang}/${t.type}`)).images ?? [];
        if (!files.length || bad.length) {
          log(`  ! ${t.type}: ${files.length ? `wrong size: ${bad.join(", ")}` : "no PNGs"}; left as it is (${current.length} on Play)`);
          problems++;
          continue;
        }
        log(`  ${t.type}: ${current.length} on Play → ${files.length} × ${t.w}×${t.h}: ${files.map((f) => f.split("/").pop()).join(", ")}`);
        if (DRY) continue;
        await api.del(`${API}/${PKG}/edits/${edit.id}/listings/${lang}/${t.type}`);
        for (const f of files) {
          const res = await fetch(`${UPLOAD}/${PKG}/edits/${edit.id}/listings/${lang}/${t.type}?uploadType=media`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "image/png" },
            body: readFileSync(f),
          });
          if (!res.ok) throw new Error(`upload ${lang}/${t.type}/${f.split("/").pop()} → ${res.status} ${await res.text()}`);
        }
      }
    }
    if (DRY) {
      await api.del(`${API}/${PKG}/edits/${edit.id}`);
      log("\n(dry run) edit deleted, nothing committed");
    } else {
      await commitEdit(api, PKG, edit.id, { log });
      log("\ncommitted");
    }
  } catch (e) {
    await api.del(`${API}/${PKG}/edits/${edit.id}`).catch(() => {});
    throw e;
  }
  if (problems) {
    log(`${problems} set(s) left out, see the lines above`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
