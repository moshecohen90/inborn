#!/usr/bin/env node
/**
 * Deployable web origin (spec §4.4, §14.3) from the Expo export:
 *   apps/mobile/dist  →  apps/web/dist  + sw.js (Workbox precache, offline boot) + _headers (Cloudflare Pages: COOP/COEP,
 *   strict CSP) + SRI on the bundle + hashes.json (sha256 of every file, the published hash) + PWA manifest/icons wired
 *   into index.html. No deployment here; `wrangler pages deploy apps/web/dist` is a separate, human step.
 *
 *   node apps/web/build.mjs            # uses the existing export
 *   MODELS_ORIGIN=https://models.inbornapp.com node apps/web/build.mjs   # allow the catalog host in connect-src
 */
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { generateSW } from "workbox-build";
import { pagesHeadersFile } from "./headers.mjs";
import { MANIFEST_REL, webManifest } from "../../scripts/web-manifest.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../..");
const SRC = process.env.SRC ?? path.join(repoRoot, "apps/mobile/dist");
const OUT = process.env.OUT ?? path.join(here, "dist");
/* The catalog host is not optional for a built origin: its models are fetched from there and the CSP must allow it.
   An empty MODELS_ORIGIN used to ship a dist whose own connect-src forbade the download it offers (B1, 24.9.2026). */
const MODELS_ORIGIN = process.env.MODELS_ORIGIN || JSON.parse(readFileSync(path.join(repoRoot, "packages/core/src/site/origins.json"), "utf8")).models;
/** The desktop shell and any embedder must not get a precache from this origin. */
const PRECACHE = ["**/*.{html,js,mjs,css,wasm,json,png,svg,ico,webmanifest,woff2}"];
const NOT_PRECACHED = ["hashes.json", "_headers", "sw.js", "models/**", "metadata.json"];

const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");
const sri = (buf) => `sha384-${createHash("sha384").update(buf).digest("base64")}`;

function* walk(dir, base = dir) {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) yield* walk(full, base);
    else yield "/" + path.relative(base, full).split(path.sep).join("/");
  }
}

if (!existsSync(path.join(SRC, "index.html"))) {
  console.error(`no web export at ${SRC}; run: corepack pnpm --filter @inborn/mobile export:web`);
  process.exit(1);
}
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
cpSync(SRC, OUT, { recursive: true });
/* Type declarations from public/ are for the test suite, not for the origin. */
for (const rel of [...walk(OUT)]) if (rel.endsWith(".d.ts")) rmSync(path.join(OUT, rel));

/* index.html: PWA wiring + SRI. The export has exactly one bundle <script>; anything else would be a surprise worth failing on. */
const indexPath = path.join(OUT, "index.html");
let html = readFileSync(indexPath, "utf8");
const scripts = [...html.matchAll(/<script src="([^"]+)"([^>]*)><\/script>/g)];
if (scripts.length !== 1) throw new Error(`expected one bundle script in index.html, found ${scripts.length}`);
const [tag, src, attrs] = scripts[0];
const bundle = readFileSync(path.join(OUT, src));
html = html.replace(tag, `<script src="${src}" integrity="${sri(bundle)}"${attrs}></script>`);
const head =
  `    <link rel="manifest" href="/manifest.webmanifest" />\n` +
  `    <meta name="theme-color" content="#0A0D11" />\n` +
  `    <link rel="icon" href="/icons/icon-192.png" type="image/png" />\n` +
  `    <link rel="apple-touch-icon" href="/icons/icon-180.png" />\n` +
  `    <meta name="apple-mobile-web-app-capable" content="yes" />\n`;
html = html.replace("</head>", `${head}  </head>`);
writeFileSync(indexPath, html);

writeFileSync(path.join(OUT, "_headers"), pagesHeadersFile(MODELS_ORIGIN));

/* The browser tier's catalog. Without this file the origin answers /models/manifest.json with the SPA shell and the
   app sees no model at all, which is the one thing a fresh browser cannot recover from (B1, 24.9.2026). */
const manifestPath = path.join(OUT, MANIFEST_REL);
mkdirSync(path.dirname(manifestPath), { recursive: true });
const catalog = webManifest(`${MODELS_ORIGIN}/v1`);
if (catalog.models.length === 0) throw new Error("the web catalog would ship with no model; check packages/core/src/catalog/manifest.json");
writeFileSync(manifestPath, JSON.stringify(catalog, null, 2) + "\n");

const sw = await generateSW({
  globDirectory: OUT,
  globPatterns: PRECACHE,
  globIgnores: NOT_PRECACHED,
  swDest: path.join(OUT, "sw.js"),
  inlineWorkboxRuntime: true,
  mode: "production",
  sourcemap: false,
  navigateFallback: "/index.html",
  cleanupOutdatedCaches: true,
  skipWaiting: true,
  clientsClaim: true,
  maximumFileSizeToCacheInBytes: 32 * 1024 * 1024,
  /* No runtimeCaching: anything not precached (the GGUF, a foreign origin) goes straight to the network, or is blocked by CSP. */
});

/* hashes.json last, over everything that ships (sw.js included). */
const files = {};
for (const rel of [...walk(OUT)].sort()) {
  if (rel === "/hashes.json") continue;
  files[rel] = sha256(readFileSync(path.join(OUT, rel)));
}
const hashes = { builtAt: new Date().toISOString(), bundle: src, bundleSha256: files[src], serviceWorker: "/sw.js", files };
writeFileSync(path.join(OUT, "hashes.json"), JSON.stringify(hashes, null, 2) + "\n");

const mb = (n) => (n / 1048576).toFixed(1);
console.log(`built ${OUT}`);
console.log(`bundle ${src} sha256 ${files[src]} (${mb(bundle.length)} MB)`);
console.log(`precache ${sw.count} files, ${mb(sw.size)} MB; ${Object.keys(files).length} files hashed into hashes.json`);
for (const w of sw.warnings) console.warn(`workbox: ${w}`);
