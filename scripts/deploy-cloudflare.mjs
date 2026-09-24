#!/usr/bin/env node
/**
 * The two public origins, deployed as Cloudflare Workers with static assets (no Pages, no wrangler, no new deps):
 *
 *   node scripts/deploy-cloudflare.mjs --site          # apps/site/dist  -> inbornapp.com      (+ www 301 -> apex)
 *   node scripts/deploy-cloudflare.mjs --app           # apps/web/dist   -> app.inbornapp.com
 *   node scripts/deploy-cloudflare.mjs --site --app    # both, which is the normal deploy
 *   node scripts/deploy-cloudflare.mjs --site --app --dry-run        # full rehearsal: builds, plans, zero network
 *
 * Flags: --no-build (use the dist that is already there), --dry-run (no writes), --no-domains (skip attaching
 * the hostnames), --no-check-live (skip the post-deploy read-back), --verbose.
 *
 * The API token comes from the macOS Keychain, service `inborn-cloudflare-api`, and is never printed. It needs:
 *   Account -> Workers Scripts -> Edit   (upload the script, open the assets upload session, attach custom domains)
 *   Zone    -> DNS -> Edit               (the custom-domain call writes the proxied record)
 *   Zone    -> Zone -> Read              (resolve inbornapp.com to its zone id)
 * A read-only token fails with 403 "No access to the specified resource" on the first write; the error names the
 * endpoint and the permission so the next person does not have to rediscover which one is missing.
 *
 * Both dists ship a Cloudflare `_headers` file. It is sent as `assets.config._headers` rather than uploaded as an
 * asset, so the app's COOP/COEP pair (which the WASM engine needs for SharedArrayBuffer) and the site's CSP survive
 * the move off Pages unchanged; `apps/web/headers.mjs` stays the single definition of those headers.
 */
import { execFileSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { URL, fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const API = "https://api.cloudflare.com/client/v4";
const ACCOUNT_ID = "9de3aac0325f2ec6294e00714a0772b7";
/* The one place the origins are written down, read by the app, the site generator and this deploy alike. */
const { site: SITE_ORIGIN, app: APP_ORIGIN, models: MODELS_ORIGIN } = JSON.parse(readFileSync(path.join(repoRoot, "packages/core/src/site/origins.json"), "utf8"));
const ZONE_NAME = new URL(SITE_ORIGIN).host;
const APP_HOST = new URL(APP_ORIGIN).host;
const COMPATIBILITY_DATE = "2026-09-01";
/* Cloudflare accepts at most 100 files or 50 MiB per upload call; the session already groups them, this is the floor.
   The bodies go up base64 (?base64=true), which is 4/3 of the raw bytes, so the raw cap has to leave room for that. */
const MAX_FILES_PER_CALL = 100;
const MAX_BYTES_PER_CALL = 35 * 1024 * 1024;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".wasm": "application/wasm",
  ".gguf": "application/octet-stream",
};

/** The 301 for www lives in its own Worker: `_redirects` cannot match on hostname, and Bulk Redirects need Rules access. */
const WWW_REDIRECT_MODULE = `export default {
  fetch(request) {
    const url = new URL(request.url);
    url.protocol = "https:";
    url.hostname = ${JSON.stringify(ZONE_NAME)};
    url.port = "";
    return Response.redirect(url.toString(), 301);
  },
};
`;

const TARGETS = {
  site: {
    script: "inborn-site",
    dist: "apps/site/dist",
    hostnames: [ZONE_NAME],
    notFoundHandling: "404-page",
    build: ["--filter", "@inborn/site", "check"],
    buildEnv: { SITE_ORIGIN, APP_ORIGIN },
  },
  app: {
    script: "inborn-app",
    dist: "apps/web/dist",
    hostnames: [APP_HOST],
    notFoundHandling: "single-page-application",
    build: ["run", "web:build"],
    buildEnv: { MODELS_ORIGIN },
  },
};

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(name);
const opts = {
  site: flag("--site"),
  app: flag("--app"),
  build: !flag("--no-build"),
  dryRun: flag("--dry-run"),
  domains: !flag("--no-domains"),
  verbose: flag("--verbose"),
  checkLive: !flag("--no-check-live"),
};
if (!opts.site && !opts.app) {
  console.error("nothing to do: pass --site and/or --app (see the header of this file)");
  process.exit(2);
}

function token() {
  try {
    return execFileSync("security", ["find-generic-password", "-s", "inborn-cloudflare-api", "-w"], {
      encoding: "utf8",
    }).trim();
  } catch {
    throw new Error("no Keychain item `inborn-cloudflare-api`; add one with `security add-generic-password -U -s inborn-cloudflare-api -a inborn -w`");
  }
}
const TOKEN = opts.dryRun ? "" : token();

/** Every failure carries the endpoint and, on 403, the permission that endpoint needs: that is the only hard part of this deploy. */
async function api(method, endpoint, { body, headers = {}, auth = TOKEN } = {}) {
  const res = await fetch(`${API}${endpoint}`, {
    method,
    headers: { Authorization: `Bearer ${auth}`, ...headers },
    body,
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  if (!res.ok || json?.success === false) {
    const why = (json?.errors ?? []).map((e) => `${e.code ?? "-"} ${e.message}`).join("; ") || text.slice(0, 300);
    const hint = res.status === 403 ? " — the token lacks the permission this endpoint needs (see the header of this file)" : "";
    throw new Error(`${method} ${endpoint} -> ${res.status}: ${why}${hint}`);
  }
  return json?.result ?? json;
}

function walk(dir, base = dir, out = []) {
  for (const entry of readdirSync(dir).sort()) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, base, out);
    else out.push("/" + path.relative(base, full).split(path.sep).join("/"));
  }
  return out;
}

/** Cloudflare keys assets by a client-chosen 32-hex digest; sha256 truncated is stable across machines and runs. */
const digest = (buf) => createHash("sha256").update(buf).digest("hex").slice(0, 32);

/* `_headers`/`_redirects` are configuration, not assets: uploaded in the manifest the edge serves them verbatim and
   applies nothing. `_headers` travels in `assets.config` instead (what wrangler does); the web build's
   `_redirects` (`/* /index.html 200`) is Pages-only — Cloudflare rejects it here as a loop, and
   `not_found_handling: single-page-application` is the Workers equivalent — so it is dropped, not forwarded. */
const CONFIG_FILES = ["/_headers", "/_redirects"];

function readDist(distDir) {
  const files = new Map();
  const manifest = {};
  const config = {};
  for (const rel of walk(distDir)) {
    const bytes = readFileSync(path.join(distDir, rel));
    if (CONFIG_FILES.includes(rel)) {
      config[rel] = bytes.toString("utf8");
      continue;
    }
    const hash = digest(bytes);
    files.set(hash, { rel, bytes, type: MIME[path.extname(rel).toLowerCase()] ?? "text/plain; charset=utf-8" });
    manifest[rel] = { hash, size: bytes.length };
  }
  return { manifest, files, config };
}

function buildTarget(target) {
  const env = { ...process.env, ...target.buildEnv, COREPACK_ENABLE_DOWNLOAD_PROMPT: "0" };
  console.log(`build: corepack pnpm ${target.build.join(" ")}`);
  execFileSync("corepack", ["pnpm@10.34.5", ...target.build], { cwd: repoRoot, env, stdio: "inherit" });
}

/** Multipart by hand: Node's FormData would decide each part's filename and content type, and the asset MIME matters. */
function multipart(parts) {
  const boundary = `----inborn${randomBytes(16).toString("hex")}`;
  const chunks = [];
  for (const { name, filename, type, body } of parts) {
    const disposition = filename ? `form-data; name="${name}"; filename="${filename}"` : `form-data; name="${name}"`;
    chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: ${disposition}\r\nContent-Type: ${type}\r\n\r\n`));
    chunks.push(Buffer.isBuffer(body) ? body : Buffer.from(body));
    chunks.push(Buffer.from("\r\n"));
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  return { body: Buffer.concat(chunks), contentType: `multipart/form-data; boundary=${boundary}` };
}

async function uploadAssets(script, { manifest, files }) {
  const session = await api("POST", `/accounts/${ACCOUNT_ID}/workers/scripts/${script}/assets-upload-session`, {
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ manifest }),
  });
  const buckets = (session.buckets ?? []).filter((b) => b.length > 0);
  if (buckets.length === 0) {
    console.log(`  assets: all ${Object.keys(manifest).length} already on the edge`);
    return session.jwt;
  }
  let jwt = session.jwt;
  /* The session's buckets can exceed one call's limits, so each is re-split before it is sent. */
  const calls = [];
  for (const bucket of buckets) {
    let current = [];
    let bytes = 0;
    for (const hash of bucket) {
      const size = files.get(hash).bytes.length;
      if (current.length >= MAX_FILES_PER_CALL || (current.length > 0 && bytes + size > MAX_BYTES_PER_CALL)) {
        calls.push(current);
        current = [];
        bytes = 0;
      }
      current.push(hash);
      bytes += size;
    }
    if (current.length > 0) calls.push(current);
  }
  let done = 0;
  for (const call of calls) {
    const parts = call.map((hash) => {
      const file = files.get(hash);
      if (opts.verbose) console.log(`    ${file.rel} ${file.bytes.length}B ${file.type}`);
      return { name: hash, filename: hash, type: file.type, body: file.bytes.toString("base64") };
    });
    const { body, contentType } = multipart(parts);
    const res = await api("POST", `/accounts/${ACCOUNT_ID}/workers/assets/upload?base64=true`, {
      body,
      headers: { "content-type": contentType },
      auth: jwt,
    });
    done += call.length;
    if (res?.jwt) jwt = res.jwt;
    console.log(`  assets: uploaded ${done}/${calls.reduce((n, c) => n + c.length, 0)}`);
  }
  return jwt;
}

async function putWorker(script, { assetsJwt, notFoundHandling, module, assetsConfig = {} }) {
  const metadata = {
    compatibility_date: COMPATIBILITY_DATE,
    ...(module ? { main_module: "index.mjs" } : {}),
    ...(assetsJwt
      ? {
          assets: {
            jwt: assetsJwt,
            config: { html_handling: "auto-trailing-slash", not_found_handling: notFoundHandling, ...assetsConfig },
          },
        }
      : {}),
  };
  const parts = [{ name: "metadata", type: "application/json", body: JSON.stringify(metadata) }];
  if (module) parts.push({ name: "index.mjs", filename: "index.mjs", type: "application/javascript+module", body: module });
  const { body, contentType } = multipart(parts);
  await api("PUT", `/accounts/${ACCOUNT_ID}/workers/scripts/${script}`, { body, headers: { "content-type": contentType } });
  console.log(`  worker ${script}: uploaded`);
}

let zoneIdCache;
async function zoneId() {
  if (!zoneIdCache) {
    const zones = await api("GET", `/zones?name=${ZONE_NAME}`);
    if (!zones?.length) throw new Error(`zone ${ZONE_NAME} not visible to this token`);
    zoneIdCache = zones[0].id;
  }
  return zoneIdCache;
}

/** Attaching the hostname is what creates the proxied DNS record; there is no separate record to write. */
async function attachDomain(hostname, script) {
  await api("PUT", `/accounts/${ACCOUNT_ID}/workers/domains`, {
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ environment: "production", hostname, service: script, zone_id: await zoneId() }),
  });
  console.log(`  https://${hostname} -> ${script}`);
}

async function deploy(name) {
  const target = TARGETS[name];
  console.log(`\n== ${name} (${target.script})`);
  if (opts.build) buildTarget(target);
  const distDir = path.join(repoRoot, target.dist);
  const dist = readDist(distDir);
  const total = Object.values(dist.manifest).reduce((n, f) => n + f.size, 0);
  console.log(`  ${target.dist}: ${Object.keys(dist.manifest).length} files, ${(total / 1048576).toFixed(1)} MB`);
  if (!dist.config["/_headers"]) throw new Error(`${target.dist} has no _headers; the security headers would be lost`);
  if (opts.dryRun) {
    console.log(`  dry run: would PUT ${target.script} (not_found_handling ${target.notFoundHandling}) and attach ${target.hostnames.join(", ")}`);
    return;
  }
  const jwt = await uploadAssets(target.script, dist);
  await putWorker(target.script, {
    assetsJwt: jwt,
    notFoundHandling: target.notFoundHandling,
    assetsConfig: { _headers: dist.config["/_headers"] },
  });
  if (opts.domains) for (const hostname of target.hostnames) await attachDomain(hostname, target.script);
}

async function deployWwwRedirect() {
  console.log(`\n== www redirect (inborn-www-redirect)`);
  if (opts.dryRun) {
    console.log(`  dry run: would PUT inborn-www-redirect and attach www.${ZONE_NAME}`);
    return;
  }
  await putWorker("inborn-www-redirect", { module: WWW_REDIRECT_MODULE });
  if (opts.domains) await attachDomain(`www.${ZONE_NAME}`, "inborn-www-redirect");
}

if (opts.site) {
  await deploy("site");
  await deployWwwRedirect();
}
if (opts.app) await deploy("app");

/* A deploy that returns 200 is not a deploy that is correct: Cloudflare rewrites HTML at the edge, so what the
   origin serves a browser has to be read back from the public URL (F275). --no-check-live skips it. */
if (!opts.dryRun && opts.checkLive) {
  const urls = [...(opts.site ? [SITE_ORIGIN + "/"] : []), ...(opts.app ? [APP_ORIGIN + "/"] : [])];
  console.log("\n== live check");
  await new Promise((r) => setTimeout(r, 8000));
  try {
    execFileSync(process.execPath, [path.join(repoRoot, "scripts/check-live.mjs"), ...urls], { stdio: "inherit" });
  } catch {
    console.error("\nthe deploy landed but the live check failed (above); the origins are serving something we did not write");
    process.exit(1);
  }
}
console.log(`\ndone${opts.dryRun ? " (dry run)" : ""}`);
