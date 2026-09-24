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
import { URL } from "node:url";

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

console.log(notes.join("\n"));
if (problems.length) {
  console.error(`\n${problems.map((p) => `✗ ${p}`).join("\n")}`);
  process.exit(1);
}
console.log(`\n✓ ${TARGETS.length} live pages: no injected beacon, no off-origin script, no-transform present`);
