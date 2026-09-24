#!/usr/bin/env node
/**
 * Gate for the deployed origins: what a browser is actually served, not what we uploaded.
 *
 *   node scripts/check-live.mjs                       # inbornapp.com + app.inbornapp.com
 *   node scripts/check-live.mjs https://example.com/  # any origin
 *
 * `apps/site/check.mjs` proves the built files are clean, and they were: the beacon Cloudflare injected on every
 * HTML response (F275) existed only at the edge, so nothing in dist could have caught it. This asks the public URL
 * with a browser's `Accept: text/html`, which is the condition the injection keys on, and fails on any script the
 * origin did not write.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { URL, fileURLToPath } from "node:url";
import { catalogProblem, MANIFEST_REL } from "./web-manifest.mjs";

/* Overridable so this gate can be pointed at any origin that is meant to carry the model catalog. */
const APP_ORIGIN = process.env.APP_ORIGIN || JSON.parse(readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "../packages/core/src/site/origins.json"), "utf8")).app;
/* The wait between tries is for edge propagation; a caller that serves the answer itself has nothing to wait for. */
const RETRY_MS = Number(process.env.CHECK_LIVE_RETRY_MS ?? 3000);

const ORIGINS = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const TARGETS = ORIGINS.length
  ? ORIGINS
  : ["https://inbornapp.com/", "https://app.inbornapp.com/", "https://inbornapp.com/download", "https://inbornapp.com/privacy"];

/* The injection only happens for a request that looks like a browser asking for a page; a plain curl gets a clean
   document, which is why this has to be spelled out rather than left to fetch's defaults. */
const BROWSER = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
};

const problems = [];
const notes = [];

/** Every `<script src>` in the document, with the raw attribute value. */
function scriptSrcs(html) {
  return [...html.matchAll(/<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi)].map((m) => m[1]);
}

for (const url of TARGETS) {
  let res;
  let html;
  try {
    res = await fetch(url, { headers: BROWSER, redirect: "follow" });
    html = await res.text();
  } catch (e) {
    problems.push(`${url}: request failed (${e.message})`);
    continue;
  }
  if (!res.ok) {
    problems.push(`${url}: HTTP ${res.status}`);
    continue;
  }
  const type = res.headers.get("content-type") ?? "";
  if (!type.includes("text/html")) {
    problems.push(`${url}: content-type ${type || "(none)"}, expected text/html`);
    continue;
  }

  if (/cloudflareinsights/i.test(html)) {
    const tag = /<script\b[^>]*cloudflareinsights[^>]*>/i.exec(html)?.[0] ?? "cloudflareinsights";
    problems.push(`${url}: Cloudflare injected its analytics beacon — ${tag.slice(0, 160)}`);
  }

  const origin = new URL(url).origin;
  for (const src of scriptSrcs(html)) {
    const resolved = new URL(src, url);
    if (resolved.origin !== origin) problems.push(`${url}: third-party <script src> ${resolved.href}`);
  }

  /* The header that stops the edge rewriting the document. Its absence is why the beacon came back once already. */
  const cc = res.headers.get("cache-control") ?? "";
  if (!/\bno-transform\b/.test(cc)) problems.push(`${url}: Cache-Control has no no-transform (${cc || "none"})`);

  notes.push(`${url} -> ${res.status}, ${scriptSrcs(html).length} script src, cache-control: ${cc || "none"}`);
}

/**
 * The app origin's model catalog. It is not HTML, so nothing above looks at it, and its failure mode is a 200: a
 * missing file is answered with the app's own document by `not_found_handling: single-page-application`, which is
 * how an origin whose browser tier could not install a model at all passed every gate there was (B1 / F270).
 */
for (const origin of [...new Set(TARGETS.map((t) => new URL(t).origin))].filter((o) => o === APP_ORIGIN)) {
  const catalog = `${origin}/${MANIFEST_REL}`;
  let problem = "no response";
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(catalog, { headers: { ...BROWSER, Accept: "application/json", "Cache-Control": "no-cache" } });
      problem = catalogProblem({ status: res.status, contentType: res.headers.get("content-type") ?? "", body: await res.text() });
    } catch (e) {
      problem = `request failed (${e.message})`;
    }
    if (!problem) break;
    if (attempt < 3 && RETRY_MS) await new Promise((r) => setTimeout(r, RETRY_MS));
  }
  if (problem) problems.push(`${catalog}: ${problem} — the browser tier cannot install a model (apps/web/build.mjs writes this file into the dist)`);
  else notes.push(`${catalog} -> a JSON catalog the app can read`);
}

console.log(notes.join("\n"));
if (problems.length) {
  console.error(`\n${problems.map((p) => `✗ ${p}`).join("\n")}`);
  process.exit(1);
}
console.log(`\n✓ ${TARGETS.length} live pages: no injected beacon, no off-origin script, no-transform present`);
