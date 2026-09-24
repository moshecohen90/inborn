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
import { COMPARE_APPS, COMPARE_COLUMNS, COMPARE_FAQ_COUNT, EN, FAQ_COUNT, LOCALES, RTL_LOCALES, SIZE_FAST, SIZE_INSTANT, TOKENS, compareCell, siteOrigin, strings } from "./build.mjs";
import { headerProblems } from "./headerCheck.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../..");
const dist = path.join(here, "dist");
const src = path.join(here, "src");
const problems = [];

/* F280/F281: the app and the browser used to quote two different sizes for the same model file (533 MB vs 508 MB,
   1.3 GB vs 1.2 GB) because the size was hand-typed on the site instead of read from the catalog. Pinning the two
   sizes the catalog ships today catches both a formula regression (binary math prints "508 MB"/"1.2 GB") and a
   catalog change nobody updated here for; the page scan below catches a hardcoded number that bypassed the token. */
if (SIZE_INSTANT !== "533 MB") problems.push(`SIZE_INSTANT is "${SIZE_INSTANT}", expected "533 MB" (packages/core/src/catalog/manifest.json, id "instant")`);
if (SIZE_FAST !== "1.3 GB") problems.push(`SIZE_FAST is "${SIZE_FAST}", expected "1.3 GB" (packages/core/src/catalog/manifest.json, id "fast")`);
/* Every place the site names a model's download size, so a future edit cannot quietly hardcode a number again. */
const SIZE_MENTIONS = [
  ["index.html", ["Your browser downloads one model once: {{SIZE_INSTANT}} (Instant) or {{SIZE_FAST}} (Fast, on capable desktops)", "The Instant model, {{SIZE_INSTANT}}, arrives with the app", "the Instant model it runs is {{SIZE_INSTANT}}", "In a browser, one model downloads once into the browser's own storage: {{SIZE_INSTANT}} (Instant) or {{SIZE_FAST}} (Fast, on capable desktops)"]],
  ["download.html", ["The Instant model, {{SIZE_INSTANT}}, arrives with the app", "Your browser downloads one model once into its own storage: {{SIZE_INSTANT}} (Instant) or {{SIZE_FAST}} (Fast, on capable desktops)"]],
  ["blog/why-on-device.html", ["Inborn ships a 0.8B model inside the app, {{SIZE_INSTANT}}, so the first chat works"]],
  ["compare.html", ["Instant, {{SIZE_INSTANT}}, ships inside the app"]],
];
for (const [file, sentences] of SIZE_MENTIONS) {
  const html = readFileSync(path.join(dist, file), "utf8");
  for (const sentence of sentences) {
    const expected = sentence.replace("{{SIZE_INSTANT}}", SIZE_INSTANT).replace("{{SIZE_FAST}}", SIZE_FAST);
    if (!html.includes(expected)) problems.push(`${file}: missing "${expected}" (a model size was hardcoded instead of using {{SIZE_INSTANT}}/{{SIZE_FAST}}?)`);
  }
}

/* F319: /compare states facts about other companies' products. A row must carry every column in every language, and
   every competitor must link its own public page, because that link is where the claim is checked. A question already
   answered on the home page must not be answered here too: two URLs carrying one answer split the citation and
   neither wins. */
for (const [id, name, url] of COMPARE_APPS) {
  const self = url === `${siteOrigin}/`;
  if (!self && !/^https?:\/\//.test(url)) problems.push(`/compare: "${name}" has no link to its own public page`);
  if (!self && url.startsWith(siteOrigin)) problems.push(`/compare: "${name}" links to us instead of to its own page`);
  for (const column of COMPARE_COLUMNS) {
    for (const l of LOCALES) {
      const cell = strings[l.code]?.[compareCell(id, column)] ?? (l === EN ? undefined : strings[EN.code][compareCell(id, column)]);
      if (!cell?.trim()) problems.push(`/compare (${l.code}): row "${name}" leaves "${column}" empty (say "Not verified" instead)`);
    }
  }
}
for (const l of LOCALES) {
  const home = new Set(Array.from({ length: FAQ_COUNT }, (_, i) => (strings[l.code]?.[`faq.${i + 1}.q`] ?? strings[EN.code][`faq.${i + 1}.q`]).toLowerCase()));
  for (let i = 1; i <= COMPARE_FAQ_COUNT; i++) {
    const q = strings[l.code]?.[`compare.faq.${i}.q`] ?? strings[EN.code][`compare.faq.${i}.q`];
    if (home.has(q.toLowerCase())) problems.push(`/compare (${l.code}): "${q}" is already answered on the home page`);
  }
}

/* ---------- The eight languages (F314–F316) ---------- */

/* The site's locale list is not allowed to be its own opinion: packages/i18n decides which languages exist, and a
   language that ships in the app with no page here (or the reverse) is exactly the drift this reads the source for. */
const i18nSrc = readFileSync(path.join(repoRoot, "packages/i18n/src/index.ts"), "utf8");
const declared = (name) => [...(/\[([^\]]*)\]/.exec(new RegExp(`${name}[^=]*=[^[]*(\\[[^\\]]*\\])`).exec(i18nSrc)?.[1] ?? "")?.[1] ?? "").matchAll(/"([^"]+)"/g)].map((m) => m[1]);
const launch = declared("LAUNCH_LOCALES");
const siteCodes = LOCALES.map((l) => l.code);
if (launch.join(",") !== siteCodes.join(",")) problems.push(`the site builds ${siteCodes.join(",")} but packages/i18n launches ${launch.join(",")}`);
const rtl = [...(/RTL_LOCALES[^=]*=\s*new Set\(\[([^\]]*)\]/.exec(i18nSrc)?.[1] ?? "").matchAll(/"([^"]+)"/g)].map((m) => m[1]);
if (rtl.join(",") !== [...RTL_LOCALES].join(",")) problems.push(`the site's RTL set is ${[...RTL_LOCALES].join(",")}, packages/i18n says ${rtl.join(",")}`);

/* Nothing here may be identical to English by accident. A short string legitimately can be (a brand, a licence id,
   "0 B", a model name), so the rule is: a sentence — long, with a space — that came back untouched was not translated. */
const enStrings = strings[EN.code];
const setOf = (s, re) => [...s.matchAll(re)].map((m) => m[0]).sort().join("|");
const tokensOf = (s) => setOf(s, /\{\{[A-Za-z_:.-]+\}\}/g);
const tagsOf = (s) => setOf(s, /<[^>]+>/g);
for (const l of LOCALES) {
  if (l === EN) continue;
  const file = `src/i18n/${l.code}.json`;
  if (!existsSync(path.join(src, `i18n/${l.code}.json`))) { problems.push(`missing ${file}`); continue; }
  const got = strings[l.code];
  for (const key of Object.keys(enStrings)) {
    if (!(key in got)) { problems.push(`${file}: no "${key}"`); continue; }
    if (tokensOf(enStrings[key]) !== tokensOf(got[key])) problems.push(`${file}: "${key}" does not carry the same {{tokens}} as English`);
    if (tagsOf(enStrings[key]) !== tagsOf(got[key])) problems.push(`${file}: "${key}" does not carry the same HTML as English`);
    if (got[key] === enStrings[key] && enStrings[key].length > 45 && /\s/.test(enStrings[key])) problems.push(`${file}: "${key}" is still the English sentence`);
  }
  for (const key of Object.keys(got)) if (!(key in enStrings)) problems.push(`${file}: "${key}" is not a key of en.json`);
}

/** Every .html under dist, including the blog posts in their own directory. */
function htmlFiles(dir, base = dist) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? htmlFiles(path.join(dir, e.name), base) : e.name.endsWith(".html") ? [path.relative(base, path.join(dir, e.name))] : []);
}
const pages = htmlFiles(dist);

/** The English page set is the contract: every other language serves the same paths under its own prefix. */
const localeDirs = LOCALES.filter((l) => l.dir).map((l) => l.dir);
const enPages = pages.filter((f) => !localeDirs.some((d) => f === `${d}` || f.startsWith(`${d}/`)));
for (const l of LOCALES) {
  if (l === EN) continue;
  for (const file of enPages) {
    if (!existsSync(path.join(dist, l.dir, file))) problems.push(`${l.code} is missing ${file}`);
  }
  for (const f of ["llms.txt", "llms-full.txt"]) if (!existsSync(path.join(dist, l.dir, f))) problems.push(`${l.code} is missing ${f}`);
}
if (pages.length !== enPages.length * LOCALES.length) problems.push(`dist holds ${pages.length} pages, expected ${enPages.length} × ${LOCALES.length}`);

/** The path a file serves, e.g. "de/blog/why-on-device.html" → "/de/blog/why-on-device", "ja/index.html" → "/ja/". */
const servedPath = (file) => "/" + file.replace(/index\.html$/, "").replace(/\.html$/, "");
const localeOf = (file) => LOCALES.find((l) => l.dir && (file === `${l.dir}/index.html` || file.startsWith(`${l.dir}/`))) ?? EN;

/* An hreflang set is only useful if it is complete and if every page it names names this one back: a one-way
   alternate is the single most common way a multilingual site tells a search engine the wrong thing. */
const alternatesOf = (html) => new Map([...html.matchAll(/<link rel="alternate" hreflang="([^"]+)" href="([^"]+)">/g)].map((m) => [m[1], m[2]]));
const byUrl = new Map(pages.map((f) => [`${siteOrigin}${servedPath(f)}`, f]));
for (const file of pages) {
  const html = readFileSync(path.join(dist, file), "utf8");
  const l = localeOf(file);
  const alt = alternatesOf(html);
  const expected = [...LOCALES.map((o) => o.code), "x-default"];
  const got = [...alt.keys()];
  if (got.join(",") !== expected.join(",")) { problems.push(`${file}: hreflang set is ${got.join(",") || "empty"}, expected ${expected.join(",")}`); continue; }
  if (alt.get("x-default") !== alt.get(EN.code)) problems.push(`${file}: x-default is ${alt.get("x-default")}, not the English page`);
  if (alt.get(l.code) !== `${siteOrigin}${servedPath(file)}`) problems.push(`${file}: does not name itself as the ${l.code} alternate`);
  const canonical = /<link rel="canonical" href="([^"]+)">/.exec(html)?.[1];
  if (canonical !== `${siteOrigin}${servedPath(file)}`) problems.push(`${file}: canonical is ${canonical}, not its own URL`);
  const lang = /<html lang="([^"]+)" dir="([^"]+)">/.exec(html);
  if (lang?.[1] !== l.code) problems.push(`${file}: <html lang> is ${lang?.[1]}, expected ${l.code}`);
  if (lang?.[2] !== (RTL_LOCALES.has(l.code.split("-")[0]) ? "rtl" : "ltr")) problems.push(`${file}: wrong dir for ${l.code}`);
  for (const [code, url] of alt) {
    if (code === "x-default") continue;
    const target = byUrl.get(url);
    if (!target) { problems.push(`${file}: alternate ${code} points at ${url}, which the site does not build`); continue; }
    const back = alternatesOf(readFileSync(path.join(dist, target), "utf8"));
    if (back.get(l.code) !== `${siteOrigin}${servedPath(file)}`) problems.push(`${file}: ${code} (${target}) does not point back at it`);
  }
  /* The English legal texts are published as English on purpose and carry lang="en"; nothing else may be. */
  if (l !== EN) {
    const outside = html.replace(/<article[^>]*lang="en"[\s\S]*?<\/article>/g, "").replace(/<(script|style)[\s\S]*?<\/\1>/g, "");
    for (const key of Object.keys(enStrings)) {
      const value = enStrings[key];
      if (value.length > 45 && /\s/.test(value) && outside.includes(value.replace(/&/g, "&amp;"))) {
        problems.push(`${file}: still shows the English "${key}"`);
        break;
      }
    }
  }
}

/* One index, eight maps, and each map lists exactly the pages that language serves: a sitemap that promises a URL
   the build does not write is worse than no sitemap, and a page missing from it is a page that stays unindexed. */
const index = readFileSync(path.join(dist, "sitemap.xml"), "utf8");
const listed = [...index.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
const expectedMaps = LOCALES.map((l) => `${siteOrigin}/sitemap-${l.code}.xml`);
if (listed.join(",") !== expectedMaps.join(",")) problems.push(`sitemap.xml lists ${listed.join(",")}, expected ${expectedMaps.join(",")}`);
for (const l of LOCALES) {
  const map = path.join(dist, `sitemap-${l.code}.xml`);
  if (!existsSync(map)) { problems.push(`missing sitemap-${l.code}.xml`); continue; }
  const urls = [...readFileSync(map, "utf8").matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]).sort();
  const want = pages.filter((f) => localeOf(f) === l && !f.endsWith("404.html")).map((f) => `${siteOrigin}${servedPath(f)}`).sort();
  if (urls.join("\n") !== want.join("\n")) problems.push(`sitemap-${l.code}.xml does not list exactly the ${l.code} pages (${urls.length} vs ${want.length})`);
  for (const u of urls) if (!byUrl.has(u)) problems.push(`sitemap-${l.code}.xml lists ${u}, which is not built`);
  const llms = readFileSync(path.join(dist, l.dir, "llms.txt"), "utf8");
  if (!llms.includes(`](${siteOrigin}${l.dir ? `/${l.dir}` : ""}/)`)) problems.push(`${l.dir || "."}/llms.txt does not link its own home page`);
  for (const o of LOCALES) if (!llms.includes(`${siteOrigin}${o.dir ? `/${o.dir}` : ""}/`)) problems.push(`${l.dir || "."}/llms.txt does not name the ${o.code} site`);
}
if (!readFileSync(path.join(dist, "robots.txt"), "utf8").includes(`Sitemap: ${siteOrigin}/sitemap.xml`)) problems.push("robots.txt does not name the sitemap index");

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
      /* A German page whose structured data says inLanguage "en" is a German page a search engine files as English. */
      for (const node of data["@graph"] ?? []) {
        if (node.inLanguage && node.inLanguage !== localeOf(file).code) problems.push(`${file}: ld+json ${node["@type"]} says inLanguage ${node.inLanguage}`);
      }
    } catch (e) {
      problems.push(`${file}: ld+json is not valid JSON (${e.message})`);
    }
  }
  if (/<iframe|<object|<embed/i.test(html)) problems.push(`${file}: embeds content`);
  /* The legal texts render their own {{PLACEHOLDER}} chips on purpose; only the generator's own tokens are a bug. */
  const stray = new RegExp(`\\{\\{(${TOKENS.join("|")})\\}\\}`).exec(html);
  if (stray) problems.push(`${file}: unresolved build token ${stray[0]}`);
  const strayKey = /\{\{t:[^}]*\}\}/.exec(html);
  if (strayKey) problems.push(`${file}: unresolved string key ${strayKey[0]}`);
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
        /* The one string CSS cannot wrap: a placeholder too long for the box is cut mid-word, and four of the eight
           translations were (F317). Measuring it needs the text in the field, so it is put there and taken out again. */
        const input = dom.getElementById("q");
        let placeholder = null;
        if (input) {
          input.value = input.placeholder;
          if (input.scrollWidth > input.clientWidth + 1) placeholder = { need: input.scrollWidth, have: input.clientWidth, text: input.placeholder };
          input.value = "";
        }
        return { doc: dom.documentElement.scrollWidth, win, wide: [...new Set(wide)], placeholder };
      });
      if (out.doc > out.win + 1) problems.push(`${file}: scrolls sideways at ${width} (${out.doc} > ${out.win})${out.wide.length ? ` — ${out.wide.join(", ")}` : ""}`);
      if (out.placeholder) problems.push(`${file}: the composer placeholder is cut off at ${width} (needs ${out.placeholder.need}px in ${out.placeholder.have}px): "${out.placeholder.text}"`);
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
console.log(`✓ ${pages.length} pages in ${LOCALES.length} languages: strings complete, hreflang symmetric, sitemaps exact, no scripts, no external assets, no dead links, CSP present${shell ? `, no sideways scroll at ${WIDTHS.join("/")}` : ""}`);
