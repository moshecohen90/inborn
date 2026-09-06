#!/usr/bin/env node
/**
 * Gate for the built site (spec §13.4: zero cookies, zero third-party JS): every page must reference nothing off-origin,
 * carry no <script>, and every link/asset it references must exist in dist. Also checks the CSP in _headers.
 *
 *   node apps/site/check.mjs   (after build.mjs)
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dist = path.join(path.dirname(fileURLToPath(import.meta.url)), "dist");
const problems = [];
const pages = readdirSync(dist).filter((f) => f.endsWith(".html"));

const headers = readFileSync(path.join(dist, "_headers"), "utf8");
if (!/Content-Security-Policy: default-src 'none'/.test(headers)) problems.push("_headers: CSP must start from default-src 'none'");
if (/script-src\s+(?!'none')/.test(headers)) problems.push("_headers: script-src must be 'none'");

for (const file of pages) {
  const html = readFileSync(path.join(dist, file), "utf8");
  if (/<script/i.test(html)) problems.push(`${file}: contains <script>`);
  if (/<iframe|<object|<embed/i.test(html)) problems.push(`${file}: embeds content`);
  for (const m of html.matchAll(/\b(?:src|href|action)="([^"]+)"/g)) {
    const ref = m[1];
    if (/^https?:\/\//.test(ref)) {
      // Outbound hyperlinks (stores' refund pages, licence texts) are fine; anything the browser would fetch is not.
      const tag = html.slice(Math.max(0, m.index - 200), m.index);
      const isAsset = /<(link|img|script|source|video|audio|iframe|object|embed)\b[^>]*$/i.test(tag);
      const own = ref.startsWith(process.env.SITE_ORIGIN ?? "https://inborn-site.pages.dev");
      if (isAsset && !own) problems.push(`${file}: loads external asset ${ref}`);
      continue;
    }
    if (/^(mailto:|#|data:)/.test(ref)) continue;
    const local = ref.replace(/[#?].*$/, "");
    const candidates = [local, `${local}.html`, local.replace(/\/$/, "/index.html")].map((p) => path.join(dist, p));
    if (!candidates.some((p) => existsSync(p))) problems.push(`${file}: dead link ${ref}`);
  }
  if (!/<meta name="description"/.test(html)) problems.push(`${file}: no meta description`);
  if (!/<html lang="/.test(html)) problems.push(`${file}: no lang attribute`);
}
for (const f of ["sitemap.xml", "robots.txt", "404.html", "favicon.svg", "site.css"]) {
  if (!existsSync(path.join(dist, f))) problems.push(`missing ${f}`);
}

if (problems.length) {
  console.error(problems.map((p) => `✗ ${p}`).join("\n"));
  process.exit(1);
}
console.log(`✓ ${pages.length} pages: no scripts, no external assets, no dead links, CSP present`);
