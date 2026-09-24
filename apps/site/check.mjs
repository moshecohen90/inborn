#!/usr/bin/env node
/**
 * Gate for the built site (spec §13.4: zero cookies, zero third-party JS): every page must reference nothing off-origin,
 * carry no <script>, and every link/asset it references must exist in dist. Also checks the CSP in _headers.
 *
 *   node apps/site/check.mjs   (after build.mjs)
 */
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SIZE_FAST, SIZE_INSTANT, TOKENS, siteOrigin } from "./build.mjs";
import { headerProblems } from "./headerCheck.mjs";

const dist = path.join(path.dirname(fileURLToPath(import.meta.url)), "dist");
const problems = [];

/* F280/F281: the app and the browser used to quote two different sizes for the same model file (533 MB vs 508 MB,
   1.3 GB vs 1.2 GB) because the size was hand-typed on the site instead of read from the catalog. Pinning the two
   sizes the catalog ships today catches both a formula regression (binary math prints "508 MB"/"1.2 GB") and a
   catalog change nobody updated here for; the page scan below catches a hardcoded number that bypassed the token. */
if (SIZE_INSTANT !== "533 MB") problems.push(`SIZE_INSTANT is "${SIZE_INSTANT}", expected "533 MB" (packages/core/src/catalog/manifest.json, id "instant")`);
if (SIZE_FAST !== "1.3 GB") problems.push(`SIZE_FAST is "${SIZE_FAST}", expected "1.3 GB" (packages/core/src/catalog/manifest.json, id "fast")`);
/* Every place the site names a model's download size, so a future edit cannot quietly hardcode a number again. */
const SIZE_MENTIONS = [
  ["index.html", ["Your browser downloads one model once, from {{SIZE_INSTANT}} (Instant) to {{SIZE_FAST}} (Fast, offered on capable desktops)", "The Instant model, {{SIZE_INSTANT}}, arrives with the app", "the Instant model it runs is {{SIZE_INSTANT}}", "In a browser, one model downloads once, from {{SIZE_INSTANT}} (Instant) to {{SIZE_FAST}} (Fast, offered on capable desktops)"]],
  ["download.html", ["The Instant model, {{SIZE_INSTANT}}, arrives with the app", "Your browser downloads one model once, from {{SIZE_INSTANT}} (Instant) to {{SIZE_FAST}} (Fast, offered on capable desktops)"]],
  ["blog/why-on-device.html", ["Inborn ships a 0.8B model inside the app, {{SIZE_INSTANT}}, so the first chat works"]],
];
for (const [file, sentences] of SIZE_MENTIONS) {
  const html = readFileSync(path.join(dist, file), "utf8");
  for (const sentence of sentences) {
    const expected = sentence.replace("{{SIZE_INSTANT}}", SIZE_INSTANT).replace("{{SIZE_FAST}}", SIZE_FAST);
    if (!html.includes(expected)) problems.push(`${file}: missing "${expected}" (a model size was hardcoded instead of using {{SIZE_INSTANT}}/{{SIZE_FAST}}?)`);
  }
}

/** Every .html under dist, including the blog posts in their own directory. */
function htmlFiles(dir, base = dist) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? htmlFiles(path.join(dir, e.name), base) : e.name.endsWith(".html") ? [path.relative(base, path.join(dir, e.name))] : []);
}
const pages = htmlFiles(dist);

problems.push(...headerProblems(readFileSync(path.join(dist, "_headers"), "utf8")));

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
      const own = ref.startsWith(siteOrigin);
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

/* A page that pans sideways on a phone is unreadable there, and CSS alone cannot say whether it does: the home band
   held a 760px table and overflowed by 388px at 390 with every rule looking correct (QA F240). So: measure it. */
const WIDTHS = [390, 768];
function headlessShell() {
  const dirs = [process.env.PLAYWRIGHT_CORE_DIR, "/Users/moshecohen/.npm/_npx/9833c18b2d85bc59/node_modules"].filter(Boolean);
  let playwright = null;
  for (const dir of dirs) {
    try {
      playwright = createRequire(path.join(dir, "/"))("playwright-core");
      break;
    } catch {
      /* try the next location */
    }
  }
  if (!playwright) return null;
  if (process.env.CHROMIUM_PATH) return { playwright, executablePath: process.env.CHROMIUM_PATH };
  const wanted = playwright.chromium.executablePath();
  if (existsSync(wanted)) return { playwright, executablePath: wanted };
  const cache = /^(.*)\/chromium[^/]*-\d+\//.exec(wanted)?.[1];
  if (!cache || !existsSync(cache)) return null;
  const found = readdirSync(cache)
    .filter((d) => /^chromium_headless_shell-\d+$/.test(d))
    .sort()
    .reverse()
    .flatMap((d) => readdirSync(path.join(cache, d)).map((sub) => path.join(cache, d, sub, "chrome-headless-shell")))
    .find((p) => existsSync(p));
  return found ? { playwright, executablePath: found } : null;
}

const MIME = { ".html": "text/html", ".css": "text/css", ".svg": "image/svg+xml", ".txt": "text/plain", ".xml": "application/xml", ".woff2": "font/woff2", ".png": "image/png" };
/* Over file:// the pages' absolute /site.css never loads and every unstyled table "overflows": the gate has to serve dist. */
function serve() {
  const server = createServer((req, res) => {
    const rel = decodeURIComponent(req.url.split("?")[0]).replace(/^\/+/, "") || "index.html";
    const file = [rel, `${rel}.html`, path.join(rel, "index.html")].map((p) => path.join(dist, p)).find((p) => p.startsWith(dist) && existsSync(p) && statSync(p).isFile());
    if (!file) return res.writeHead(404).end();
    res.writeHead(200, { "content-type": MIME[path.extname(file)] ?? "application/octet-stream" }).end(readFileSync(file));
  });
  return new Promise((ok) => server.listen(0, "127.0.0.1", () => ok({ server, port: server.address().port })));
}

const shell = headlessShell();
if (!shell) {
  console.log("· no headless chromium: the sideways-scroll measurement was skipped (set CHROMIUM_PATH)");
} else {
  const { server, port } = await serve();
  const browser = await shell.playwright.chromium.launch({ headless: true, executablePath: shell.executablePath, args: ["--disable-gpu", "--hide-scrollbars"] });
  for (const width of WIDTHS) {
    const ctx = await browser.newContext({ viewport: { width, height: 900 } });
    const page = await ctx.newPage();
    for (const file of pages) {
      await page.goto(`http://127.0.0.1:${port}/${file}`, { waitUntil: "load" });
      const out = await page.evaluate(() => {
        const dom = globalThis.document;
        const win = globalThis.innerWidth;
        const wide = [...dom.querySelectorAll("*")]
          .filter((el) => el.getBoundingClientRect().right > win + 1)
          .map((el) => `${el.tagName.toLowerCase()}.${(el.className || "").toString().split(" ")[0]}`)
          .slice(0, 4);
        return { doc: dom.documentElement.scrollWidth, win, wide: [...new Set(wide)] };
      });
      if (out.doc > out.win + 1) problems.push(`${file}: scrolls sideways at ${width} (${out.doc} > ${out.win})${out.wide.length ? ` — ${out.wide.join(", ")}` : ""}`);
    }
    await ctx.close();
  }
  await browser.close();
  server.close();
}

if (problems.length) {
  console.error(problems.map((p) => `✗ ${p}`).join("\n"));
  process.exit(1);
}
console.log(`✓ ${pages.length} pages: no scripts, no external assets, no dead links, CSP present${shell ? `, no sideways scroll at ${WIDTHS.join("/")}` : ""}`);
