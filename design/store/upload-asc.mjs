#!/usr/bin/env node
/**
 * Replaces the App Store screenshots of Inborn 1.0 with design/store/out/apple/<locale>/{6.9,ipad-13}/NN-*.png.
 *
 *   node design/store/upload-asc.mjs --dry-run [--locale ja] [--with-6.5]
 *   node design/store/upload-asc.mjs [--locale ja] [--with-6.5]
 *
 * Per appStoreVersionLocalization of the version: delete every existing appScreenshotSet, create one set per display type,
 * then reserve → PUT each upload operation → commit (uploaded + MD5) every screenshot, and poll assetDeliveryState until
 * Apple has processed it. `--dry-run` authenticates and reads the version and its localizations (proving the key works),
 * prints the plan, and changes nothing.
 *
 * Display types (official enum, developer.apple.com/documentation/appstoreconnectapi/screenshotdisplaytype): there is no
 * 6.9" value; the 1320×2868 set goes to APP_IPHONE_67, which App Store Connect shows as the 6.9" slot. The 13" iPad
 * (2064×2752) goes to APP_IPAD_PRO_3GEN_129. 6.5" (APP_IPHONE_65) is optional: without it Apple scales the 6.9" set.
 *
 * Auth: the ES256 key in the Keychain JSON `security find-generic-password -s store-reviews -a appstore-analytics-config -w`
 * (key_id, issuer_id, private_key), the entry scripts/asc-key-env.sh reads. Override with INBORN_ASC_KEYCHAIN=<service>:<account>.
 * The key is held in memory only and never printed.
 */
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dir = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dir, "out/apple");
const API = "https://api.appstoreconnect.apple.com/v1";
const APP_ID = "6809165161";
const VERSION_ID = "15462083-093b-44c1-8bbd-fe06e00d0c36";

const argv = process.argv.slice(2);
const DRY = argv.includes("--dry-run");
const WITH_65 = argv.includes("--with-6.5");
const ONLY = argv.includes("--locale") ? argv[argv.indexOf("--locale") + 1] : null;

/* our listing locale → App Store Connect locale */
const LOCALES = { en: "en-US", ja: "ja", de: "de-DE", fr: "fr-FR", es: "es-ES", "pt-BR": "pt-BR", ko: "ko", "zh-Hant": "zh-Hant" };
const SETS = [
  { dir: "6.9", type: "APP_IPHONE_67", w: 1320, h: 2868 },
  ...(WITH_65 ? [{ dir: "6.5", type: "APP_IPHONE_65", w: 1284, h: 2778 }] : []),
  { dir: "ipad-13", type: "APP_IPAD_PRO_3GEN_129", w: 2064, h: 2752 },
];

const log = (...a) => console.log(...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function credentials() {
  const [service, account] = (process.env.INBORN_ASC_KEYCHAIN || "store-reviews:appstore-analytics-config").split(":");
  const raw = execFileSync("security", ["find-generic-password", "-s", service, "-a", account, "-w"], { encoding: "utf8" }).trim();
  /* the private key may sit in the JSON with literal newlines */
  const c = JSON.parse(raw.replace(/\r?\n/g, "\\n"));
  if (!c.key_id || !c.issuer_id || !c.private_key) throw new Error(`${service}:${account} lacks key_id/issuer_id/private_key`);
  return c;
}

function jwt({ key_id, issuer_id, private_key }) {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${b64({ alg: "ES256", kid: key_id, typ: "JWT" })}.${b64({ iss: issuer_id, iat: now, exp: now + 15 * 60, aud: "appstoreconnect-v1" })}`;
  const sig = crypto.sign("sha256", Buffer.from(unsigned), { key: private_key, dsaEncoding: "ieee-p1363" }).toString("base64url");
  return `${unsigned}.${sig}`;
}

let creds = null;
let token = null;
let tokenAt = 0;
async function asc(method, path, body) {
  if (!token || Date.now() - tokenAt > 10 * 60e3) {
    token = jwt(creds);
    tokenAt = Date.now();
  }
  const res = await fetch(path.startsWith("http") ? path : `${API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}\n${text.slice(0, 1500)}`);
  return text ? JSON.parse(text) : {};
}

function pngSize(file) {
  const b = readFileSync(file);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

function filesFor(locale, set) {
  const dir = join(OUT, locale, set.dir);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => /^\d\d-.*\.png$/.test(f))
    .sort()
    .map((f) => join(dir, f));
}

async function uploadOne(setId, file) {
  const bytes = readFileSync(file);
  const fileName = file.split("/").pop();
  const reserved = await asc("POST", "/appScreenshots", {
    data: { type: "appScreenshots", attributes: { fileName, fileSize: bytes.length }, relationships: { appScreenshotSet: { data: { type: "appScreenshotSets", id: setId } } } },
  });
  const shot = reserved.data;
  for (const op of shot.attributes.uploadOperations) {
    const headers = Object.fromEntries((op.requestHeaders ?? []).map((h) => [h.name, h.value]));
    const res = await fetch(op.url, { method: op.method, headers, body: bytes.subarray(op.offset, op.offset + op.length) });
    if (!res.ok) throw new Error(`upload part of ${fileName} → ${res.status} ${await res.text()}`);
  }
  const md5 = crypto.createHash("md5").update(bytes).digest("hex");
  await asc("PATCH", `/appScreenshots/${shot.id}`, { data: { type: "appScreenshots", id: shot.id, attributes: { uploaded: true, sourceFileChecksum: md5 } } });
  for (let i = 0; i < 60; i++) {
    const s = (await asc("GET", `/appScreenshots/${shot.id}?fields[appScreenshots]=assetDeliveryState`)).data.attributes.assetDeliveryState;
    if (s?.state === "COMPLETE") return "COMPLETE";
    if (s?.state === "FAILED") throw new Error(`${fileName}: ${JSON.stringify(s.errors ?? s)}`);
    await sleep(2000);
  }
  return "still processing (Apple finishes it on its side)";
}

async function main() {
  creds = credentials();
  const version = await asc("GET", `/appStoreVersions/${VERSION_ID}?include=app`);
  const appId = version.data.relationships?.app?.data?.id;
  if (appId && appId !== APP_ID) throw new Error(`version ${VERSION_ID} belongs to app ${appId}, not ${APP_ID}`);
  log(`auth ok · app ${APP_ID} · version ${version.data.attributes.versionString} (${version.data.attributes.appStoreState ?? version.data.attributes.appVersionState}) · ${DRY ? "DRY RUN, nothing changes" : "LIVE"}`);
  const locs = (await asc("GET", `/appStoreVersions/${VERSION_ID}/appStoreVersionLocalizations?limit=50`)).data;
  const byLocale = new Map(locs.map((l) => [l.attributes.locale, l]));
  log(`localizations on the version: ${[...byLocale.keys()].join(", ")}`);
  let failed = 0;
  for (const [ours, ascLocale] of Object.entries(LOCALES)) {
    if (ONLY && ONLY !== ours && ONLY !== ascLocale) continue;
    const loc = byLocale.get(ascLocale);
    if (!loc) {
      log(`SKIP ${ascLocale}: version ${VERSION_ID} has no ${ascLocale} localization yet (create it in App Store Connect, then rerun with --locale ${ours})`);
      continue;
    }
    const existing = (await asc("GET", `/appStoreVersionLocalizations/${loc.id}/appScreenshotSets?include=appScreenshots&limit=50`)).data;
    log(`\n${ascLocale}: ${existing.length} existing set(s): ${existing.map((s) => `${s.attributes.screenshotDisplayType}(${s.relationships?.appScreenshots?.data?.length ?? "?"})`).join(", ") || "none"}`);
    for (const set of SETS) {
      const files = filesFor(ours, set);
      const bad = files.filter((f) => {
        const d = pngSize(f);
        return d.w !== set.w || d.h !== set.h;
      });
      if (!files.length || bad.length) {
        log(`  ! ${set.type}: ${files.length ? `wrong size: ${bad.join(", ")}` : `no PNGs in out/apple/${ours}/${set.dir}`}; this set is left out`);
        failed++;
        continue;
      }
      log(`  ${set.type} ← ${files.length} × ${set.w}×${set.h}: ${files.map((f) => f.split("/").pop()).join(", ")}`);
    }
    if (DRY) {
      log(`  (dry run) would delete ${existing.length} set(s) and create ${SETS.map((s) => s.type).join(" + ")}`);
      continue;
    }
    for (const s of existing) {
      await asc("DELETE", `/appScreenshotSets/${s.id}`);
      log(`  deleted ${s.attributes.screenshotDisplayType}`);
    }
    for (const set of SETS) {
      const files = filesFor(ours, set);
      if (!files.length) continue;
      const created = await asc("POST", "/appScreenshotSets", {
        data: { type: "appScreenshotSets", attributes: { screenshotDisplayType: set.type }, relationships: { appStoreVersionLocalization: { data: { type: "appStoreVersionLocalizations", id: loc.id } } } },
      });
      for (const f of files) {
        try {
          log(`  ${set.type} ${f.split("/").pop()}: ${await uploadOne(created.data.id, f)}`);
        } catch (e) {
          failed++;
          log(`  FAIL ${set.type} ${f.split("/").pop()}: ${e.message}`);
        }
      }
    }
  }
  if (failed) {
    log(`\n${failed} problem(s) above`);
    process.exit(1);
  }
  log("\ndone");
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
