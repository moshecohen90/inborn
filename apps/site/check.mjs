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
import { TOKENS } from "./build.mjs";

const dist = path.join(path.dirname(fileURLToPath(import.meta.url)), "dist");
const problems = [];

/** Every .html under dist, including the blog posts in their own directory. */
function htmlFiles(dir, base = dist) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? htmlFiles(path.join(dir, e.name), base) : e.name.endsWith(".html") ? [path.relative(base, path.join(dir, e.name))] : []);
}
const pages = htmlFiles(dist);

const headers = readFileSync(path.join(dist, "_headers"), "utf8");
if (!/Content-Security-Policy: default-src 'none'/.test(headers)) problems.push("_headers: CSP must start from default-src 'none'");
if (!/script-src 'none'/.test(headers)) problems.push("_headers: script-src must be 'none'");
if (/form-action\s+(?!'none'|https:\/\/)/.test(headers)) problems.push("_headers: form-action must be 'none' or one https origin");

for (const file of pages) {
  const html = readFileSync(path.join(dist, file), "utf8");
  /* JSON-LD is a data block: WHATWG "prepare the script element" returns before the CSP step, so it never executes
     and never trips script-src 'none'. Anything else that looks like a script is still fatal. */
  const ld = [];
  const stripped = html.replace(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g, (_, body) => { ld.push(body); return ""; });
  if (/<script/i.test(stripped)) problems.push(`${file}: contains <script>`);
  if (!ld.length && !file.endsWith("404.html")) problems.push(`${file}: no JSON-LD`);
  for (const body of ld) {
    if (/[<>]/.test(body)) problems.push(`${file}: ld+json contains a raw angle bracket (escape as \\u003c / \\u003e)`);
    try {
      const data = JSON.parse(body);
      if (data["@context"] !== "https://schema.org") problems.push(`${file}: ld+json @context is not https://schema.org`);
    } catch (e) {
      problems.push(`${file}: ld+json is not valid JSON (${e.message})`);
    }
  }
  if (/<iframe|<object|<embed/i.test(html)) problems.push(`${file}: embeds content`);
  /* The legal texts render their own {{PLACEHOLDER}} chips on purpose; only the generator's own tokens are a bug. */
  const stray = new RegExp(`\\{\\{(${TOKENS.join("|")})\\}\\}`).exec(html);
  if (stray) problems.push(`${file}: unresolved build token ${stray[0]}`);
  for (const m of html.matchAll(/\b(?:src|href|action)="([^"]+)"/g)) {
    const ref = m[1];
    if (/^https?:\/\//.test(ref)) {
      // Outbound hyperlinks (stores' refund pages, licence texts) are fine; anything the browser would fetch is not.
      const tag = html.slice(Math.max(0, m.index - 200), m.index);
      const isAsset = /<(link|img|script|source|video|audio|iframe|object|embed)\b[^>]*$/i.test(tag);
      const own = ref.startsWith(process.env.SITE_ORIGIN ?? "https://inbornapp.com");
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
for (const f of ["sitemap.xml", "robots.txt", "llms.txt", "llms-full.txt", "404.html", "favicon.svg", "site.css"]) {
  if (!existsSync(path.join(dist, f))) problems.push(`missing ${f}`);
}

if (problems.length) {
  console.error(problems.map((p) => `✗ ${p}`).join("\n"));
  process.exit(1);
}
console.log(`✓ ${pages.length} pages: no scripts, no external assets, no dead links, CSP present`);
