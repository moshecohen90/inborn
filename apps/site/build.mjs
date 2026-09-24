#!/usr/bin/env node
/**
 * Static site generator for the Inborn website (spec §13.4, §11.3, §3.3–3.4, §9).
 *
 *   node apps/site/build.mjs            → apps/site/dist
 *
 * Plain HTML + CSS, zero JavaScript in the output, zero third-party requests. privacy.html and terms.html are rendered
 * from docs/legal/*.md and licenses.html from docs/legal/NOTICE.json at build time, so the site cannot drift from the
 * legal sources. `{{PLACEHOLDER}}` tokens in the legal texts are rendered as visible chips until they are filled at launch.
 *
 * Every page is built once per launch locale: English at the root, the other seven under /<locale>/. The page
 * fragments hold structure only — every string lives in src/i18n/<locale>.json under the same key, so one source
 * produces eight sites and a missing translation is a gate failure, not a silently English page.
 *
 * Environment:
 *   SITE_ORIGIN   canonical origin for links, sitemap and JSON-LD (default packages/core/src/site/origins.json)
 *   APP_ORIGIN    where the hero composer posts the first message (the deployed web app); also the only
 *                 host allowed in the CSP `form-action`
 *   STORES_LIVE   "1" once the two store listings actually resolve; until then the download row says so
 */
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../..");
const src = path.join(here, "src");
const dist = path.join(here, "dist");
/* The one place the origins are written down; the deploy passes the same values as env (packages/core/src/site/origins.json). */
const origins = JSON.parse(readFileSync(path.join(repoRoot, "packages/core/src/site/origins.json"), "utf8"));
export const siteOrigin = process.env.SITE_ORIGIN ?? origins.site;
/** The web app is its own Worker; `app.inbornapp.com` is the subdomain reserved for it on our own zone. */
export const appOrigin = process.env.APP_ORIGIN ?? origins.app;
/** Neither listing resolved on 23.9.2026 (App Store version PREPARE_FOR_SUBMISSION, Play on the internal track only). */
export const storesLive = process.env.STORES_LIVE === "1";

/* ---------- Locales ---------- */

/**
 * The eight launch locales of packages/i18n, in that order, English first because the root of the site is English
 * (check.mjs asserts the two lists match). `dir` is the URL segment: lowercase, because a static host is the one
 * place where `/pt-BR/` and `/pt-br/` are two different pages.
 */
export const LOCALES = [
  { code: "en", dir: "", name: "English", og: "en_US" },
  { code: "ja", dir: "ja", name: "日本語", og: "ja_JP" },
  { code: "de", dir: "de", name: "Deutsch", og: "de_DE" },
  { code: "fr", dir: "fr", name: "Français", og: "fr_FR" },
  { code: "es", dir: "es", name: "Español", og: "es_ES" },
  { code: "pt-BR", dir: "pt-br", name: "Português (Brasil)", og: "pt_BR" },
  { code: "ko", dir: "ko", name: "한국어", og: "ko_KR" },
  { code: "zh-Hant", dir: "zh-hant", name: "繁體中文", og: "zh_TW" },
];
/** Same set as packages/i18n RTL_LOCALES: none of them launches today, and the layout must already be right when one does. */
export const RTL_LOCALES = new Set(["he", "ar", "fa", "ur"]);
export const EN = LOCALES[0];
/** The writing direction a locale renders in. None of the eight launches RTL; the layout must already be right when one does. */
export const htmlDir = (code) => (RTL_LOCALES.has(code.split("-")[0]) ? "rtl" : "ltr");
const root = (l) => (l.dir ? `/${l.dir}` : "");
/** A page's path inside a locale: "/" is the locale's home, everything else keeps the English path. */
const href = (l, p) => (p === "/" ? `${root(l)}/` : `${root(l)}${p}`);
const abs = (l, p) => `${siteOrigin}${href(l, p)}`;

export const strings = Object.fromEntries(
  LOCALES.map((l) => {
    const file = path.join(src, `i18n/${l.code}.json`);
    if (!existsSync(file)) {
      if (l !== EN) console.warn(`· no src/i18n/${l.code}.json yet: that locale falls back to English (check.mjs fails on it)`);
      return [l.code, {}];
    }
    return [l.code, JSON.parse(readFileSync(file, "utf8"))];
  }),
);
/** A missing key falls back to English so a half-finished translation still builds; check.mjs is what refuses to ship it. */
export function t(l, key) {
  const value = strings[l.code][key] ?? strings[EN.code][key];
  if (value === undefined) throw new Error(`no string "${key}" in src/i18n/en.json`);
  return value;
}

/** "533 MB", "1.3 GB": must read exactly like packages/core's formatModelBytes (catalog-resume.test.ts), or the app and the site quote two different sizes for the same file (F281). */
function formatModelBytes(bytes) {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(bytes >= 10e9 ? 0 : 1)} GB`;
  if (bytes >= 1e6) return `${Math.round(bytes / 1e6)} MB`;
  return `${Math.round(bytes / 1e3)} kB`;
}
const catalog = JSON.parse(readFileSync(path.join(repoRoot, "packages/core/src/catalog/manifest.json"), "utf8"));
const bytesOf = (id) => catalog.models.find((m) => m.id === id)?.bytes ?? (() => { throw new Error(`catalog has no model "${id}"`); })();
/** The two sizes the site quotes: what the app bundles (Instant) and the largest the browser tier offers (Fast) — spec §14.3, §6.1 (F280). */
export const SIZE_INSTANT = formatModelBytes(bytesOf("instant"));
export const SIZE_FAST = formatModelBytes(bytesOf("fast"));

export const stores = {
  ios: { name: "App Store", href: "https://apps.apple.com/app/id6809165161", note: "ui.store.ios-note" },
  android: { name: "Google Play", href: "https://play.google.com/store/apps/details?id=com.inbornapp.mobile", note: "ui.store.android-note" },
};

/** Placeholders we can fill now; everything else stays a visible chip (title attribute explains why). */
const filled = { PRIVACY_URL: "/privacy" };

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

/** JSON-LD is a data block, never executed: the three characters that could close the element early are escaped, not entity-encoded. */
const ldjson = (obj) =>
  `<script type="application/ld+json">${JSON.stringify(obj)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029")}</script>`;

/** Google only trusts <lastmod> if it matches the real change date, so it comes from git, never from build time. */
function lastmod(relPath) {
  try {
    const out = execFileSync("git", ["log", "-1", "--format=%ad", "--date=short", "--", relPath], { cwd: repoRoot, stdio: ["ignore", "pipe", "ignore"] });
    const date = out.toString().trim();
    if (date) return date;
  } catch {
    /* not a git checkout, or the file is new: fall through */
  }
  return new Date().toISOString().slice(0, 10);
}

/* ---------- Markdown (the subset docs/legal uses: headings, paragraphs, lists, hr, bold, code, bare URLs) ---------- */

function inline(text) {
  let out = esc(text);
  out = out.replace(/`\{\{([^}`]+)\}\}`/g, (_, k) => placeholder(k)).replace(/\{\{([^}]+)\}\}/g, (_, k) => placeholder(k));
  out = out.replace(/`([^`]+)`/g, (_, c) => `<code>${c}</code>`);
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/(^|[\s(])(https?:\/\/[^\s<)]+[^\s<).,;])/g, (_, pre, url) => `${pre}<a href="${url}" rel="noopener">${url}</a>`);
  return out;
}

function placeholder(key) {
  const name = key.trim();
  if (filled[name]) return `<a href="${filled[name]}">${esc(siteOrigin + filled[name])}</a>`;
  return `<mark class="ph" title="Filled at launch">{{${esc(name)}}}</mark>`;
}

export function markdownToHtml(md) {
  const lines = md.replace(/\r/g, "").split("\n");
  const html = [];
  let para = [];
  let list = null;
  const flush = () => {
    if (para.length) { html.push(`<p>${inline(para.join(" "))}</p>`); para = []; }
    if (list) { html.push(`<ul>${list.map((i) => `<li>${inline(i)}</li>`).join("")}</ul>`); list = null; }
  };
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (/^### Notes for the maintainer/.test(line)) break; // internal notes never ship
    if (/^Spec basis:/.test(line)) continue;
    const h = /^(#{1,3}) (.+)$/.exec(line);
    if (h) { flush(); const lvl = h[1].length; const t = h[2]; html.push(`<h${lvl} id="${slug(t)}">${inline(t)}</h${lvl}>`); continue; }
    if (/^---+$/.test(line)) { flush(); html.push("<hr>"); continue; }
    const li = /^[-*] (.+)$/.exec(line);
    if (li) { if (para.length) flush(); (list ??= []).push(li[1]); continue; }
    if (line === "") { flush(); continue; }
    if (list) { list[list.length - 1] += " " + line.trim(); continue; }
    para.push(line.trim());
  }
  flush();
  return html.join("\n");
}

/**
 * The first `**Status: …**` paragraph of a legal draft becomes a notice above the text instead of body copy.
 * The text itself is only ever published in English: a policy is the document a reader can be held to, and a
 * translated one would be a second, unreviewed contract. Outside English the page says so above the text.
 */
function legalPage(file) {
  const md = readFileSync(path.join(repoRoot, "docs/legal", file), "utf8");
  const status = /^\*\*Status: ([^*]+)\*\*$/m.exec(md);
  const edited = /Last edited ([^.\n]+)\./.exec(md);
  const body = markdownToHtml(md.replace(status?.[0] ?? "", ""));
  const notice = status
    ? `<aside class="notice" role="note"><span class="label">Status</span>${inline(status[1])}${edited ? ` Last edited ${esc(edited[1])}.` : ""}</aside>`
    : "";
  return (l) => `${l === EN ? "" : `<aside class="notice" role="note"><span class="label">${esc(t(l, "ui.legal.english-label"))}</span>${esc(t(l, "ui.legal.english-only"))}</aside>\n`}<article class="prose legal"${l === EN ? "" : ' lang="en" dir="ltr"'}>${notice}${body.replace(/^<h1[^>]*>.*?<\/h1>\n?/, "")}</article>`;
}

/* ---------- Licenses from NOTICE.json ---------- */

function licensesPage(l) {
  const notice = JSON.parse(readFileSync(path.join(repoRoot, "docs/legal/NOTICE.json"), "utf8"));
  const groups = [
    ["model", "ui.licenses.models", "ui.licenses.models-intro"],
    ["engine", "ui.licenses.engines", null],
    ["library", "ui.licenses.libraries", null],
    ["font", "ui.licenses.fonts", null],
  ];
  const row = (c) => `<tr>
  <td><a href="${esc(c.homepage ?? c.licenseUrl)}" rel="noopener">${esc(c.name)}</a>${c.version ? `<div class="mono small">${esc(c.version)}</div>` : ""}${c.tier ? `<div class="mono small">${esc(c.tier)}</div>` : ""}</td>
  <td><a href="${esc(c.licenseUrl)}" rel="noopener">${esc(c.license)}</a></td>
  <td>${esc(c.attribution ?? "")}${c.restrictions?.length ? `<div class="small">${esc(t(l, "ui.licenses.restrictions"))} ${esc(c.restrictions.join("; "))}</div>` : ""}</td>
  <td class="mono small">${esc(c.scope)}</td>
</tr>`;
  const sections = groups.map(([g, title, intro]) => {
    const items = notice.components.filter((c) => c.group === g);
    if (!items.length) return "";
    return `<h2 id="${g}">${esc(t(l, title))}</h2>${intro ? `<p>${esc(t(l, intro))}</p>` : ""}
<div class="table-wrap"><table>
<thead><tr><th>${esc(t(l, "ui.licenses.component"))}</th><th>${esc(t(l, "ui.licenses.license"))}</th><th>${esc(t(l, "ui.licenses.attribution"))}</th><th>${esc(t(l, "ui.licenses.scope"))}</th></tr></thead>
<tbody>${items.map(row).join("")}</tbody></table></div>`;
  }).join("\n");
  const excluded = notice.excludedByRule.map((e) => `<li><strong>${esc(e.family)}</strong> (${esc(e.license)}): ${esc(e.reason)}.</li>`).join("");
  return `<article class="prose">
<p>${t(l, "ui.licenses.lede")
  .replace("{{APP_NAME}}", esc(notice.app.name))
  .replace("{{CORE_SCOPE}}", esc(notice.app.coreScope))
  .replace("{{CORE_LICENSE}}", esc(notice.app.coreLicense))
  .replace("{{GENERATED}}", esc(notice.generated))}</p>
<p class="small"><span class="label">${esc(t(l, "ui.licenses.scope"))}</span> ${esc(t(l, "ui.licenses.scope-key"))}</p>
${sections}
<h2 id="excluded">${esc(t(l, "ui.licenses.excluded"))}</h2>
<p>${esc(t(l, "ui.licenses.excluded-intro"))}</p>
<ul>${excluded}</ul>
</article>`;
}

/* ---------- Layout ---------- */

const sealSvg = `<svg class="seal" viewBox="0 0 1024 1024" aria-hidden="true" focusable="false"><circle cx="512" cy="512" r="294" fill="none" stroke="var(--sealed)" stroke-width="92"/><path d="M 723.5 307.8 A 294 294 0 0 1 794.6 431" fill="none" stroke="var(--accent-fill)" stroke-width="92" stroke-linecap="round"/><path d="M 723.5 307.8 A 294 294 0 0 1 794.6 431" fill="none" stroke="#FFD9A3" stroke-width="30" stroke-linecap="round"/></svg>`;

const nav = [
  ["/proof", "ui.nav.proof"],
  ["/blog", "ui.nav.blog"],
  ["/support", "ui.nav.support"],
  ["https://github.com/moshecohen90/inborn", "ui.nav.github"],
];

/* Every legal page the app links out to, so the footer and the app's Legal screen cannot drift apart. */
export const legalRoutes = ["/privacy", "/terms", "/licenses", "/accessibility"];

const legalLabel = (l, route) => t(l, `ui.legal.${route.slice(1)}`);

/** Every `{{TOKEN}}` the generator fills. Anything else left in a page is an unfilled placeholder and a bug. */
export const TOKENS = ["SEAL", "APP_ORIGIN", "STORE_ROW", "STORE_STATE", "FAQ", "SIZE_INSTANT", "SIZE_FAST"];

/** Tokens the page fragments may use, so a price or a store link is written in exactly one place. */
function tokens(l) {
  const storeRow = Object.values(stores).map((s) => `<a class="store" href="${s.href}" rel="noopener">
  <span class="store-k">${esc(s.name)}</span>
  <span class="store-v">${esc(t(l, storesLive ? "ui.store.download" : "ui.store.at-launch"))}</span>
  <span class="store-n">${esc(t(l, s.note))}</span>
</a>`).join("");
  return {
    SEAL: sealSvg,
    APP_ORIGIN: appOrigin,
    STORE_ROW: storeRow,
    /* Prose that stops being true on launch day belongs on the flag that already switches the buttons (F214). */
    STORE_STATE: esc(t(l, storesLive ? "ui.store.state-live" : "ui.store.state-pending")),
    FAQ: faqHtml(l),
    SIZE_INSTANT,
    SIZE_FAST,
  };
}

/** Resolves a fragment: strings first (their values may quote a size token), then the generator's own tokens. */
function fill(l, html) {
  const vars = tokens(l);
  return html
    .replace(/\{\{t:([A-Za-z0-9.-]+)\}\}/g, (_, k) => t(l, k))
    .replace(/\{\{([A-Z_]+)\}\}/g, (m, k) => (k in vars ? vars[k] : m));
}

/** Files that exist once, at the root, in every language; every other absolute path is a page that exists per locale. */
const ROOT_FILES = /^\/(site\.css|favicon\.svg|apple-touch-icon\.png|icon-512\.png|robots\.txt|sitemap|og\/|fonts\/)/;

/**
 * A link written inside a fragment or a translated string names the English path ("/proof"). On a localized page it
 * has to stay inside that language, or a reader who followed one sentence lands on the English site (F314).
 */
export function localizeLinks(l, html) {
  if (l === EN) return html;
  return html.replace(/\b(href|action)="(\/[^"]*)"/g, (m, attr, p) =>
    ROOT_FILES.test(p) || p === root(l) || p.startsWith(`${root(l)}/`) ? m : `${attr}="${root(l)}${p}"`);
}

/** Plain links, no JavaScript: the same page in every language, marked so a crawler reads it as the alternate set. */
function langSwitch(l, p, place) {
  const links = LOCALES.map((other) => `<a href="${href(other, p)}" hreflang="${other.code}" lang="${other.code}"${other === l ? ' aria-current="true"' : ""}>${esc(other.name)}</a>`).join("");
  if (place === "footer") return `<nav class="lang-list" aria-label="${esc(t(l, "ui.lang.label"))}" id="languages"><span class="label">${esc(t(l, "ui.lang.label"))}</span>${links}</nav>`;
  return `<details class="lang"><summary aria-label="${esc(t(l, "ui.lang.label"))}"><span class="mono">${esc(l.code.toUpperCase())}</span></summary><div class="lang-menu">${links}</div></details>`;
}

function layout(l, { title, description, path: p, body, h1, wide = false, jsonld = [], ogImage = "/og/default.png", ogAlt, ogType = "website" }) {
  const isHome = p === "/";
  const pageTitle = isHome ? t(l, "ui.home-title") : `${title} · Inborn`;
  const url = abs(l, p);
  const alt = ogAlt ?? t(l, "ui.og-alt");
  const graph = [orgGraph(), ...jsonld].flat();
  const alternates = LOCALES.map((other) => `<link rel="alternate" hreflang="${other.code}" href="${abs(other, p)}">`).join("\n") +
    `\n<link rel="alternate" hreflang="x-default" href="${abs(EN, p)}">`;
  return `<!doctype html>
<html lang="${l.code}" dir="${htmlDir(l.code)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(pageTitle)}</title>
<meta name="description" content="${esc(description)}">
<meta name="color-scheme" content="dark light">
<meta name="theme-color" content="#0A0D11">
<link rel="canonical" href="${url}">
${alternates}
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="stylesheet" href="/site.css">
<meta property="og:site_name" content="Inborn">
<meta property="og:locale" content="${l.og}">
${LOCALES.filter((o) => o !== l).map((o) => `<meta property="og:locale:alternate" content="${o.og}">`).join("\n")}
<meta property="og:type" content="${ogType}">
<meta property="og:title" content="${esc(pageTitle)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${siteOrigin}${ogImage}">
<meta property="og:image:type" content="image/png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${esc(alt)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(pageTitle)}">
<meta name="twitter:description" content="${esc(description)}">
<meta name="twitter:image" content="${siteOrigin}${ogImage}">
<meta name="twitter:image:alt" content="${esc(alt)}">
${ldjson({ "@context": "https://schema.org", "@graph": graph })}
</head>
<body>
<a class="skip" href="#main">${esc(t(l, "ui.skip"))}</a>
<header class="top">
  <a class="brand" href="${href(l, "/")}" aria-label="${esc(t(l, "ui.brand-home"))}">${sealSvg}<span>Inborn</span></a>
  <nav aria-label="${esc(t(l, "ui.nav.main"))}">${nav.map(([link, label]) => `<a href="${/^https?:/.test(link) ? link : href(l, link)}"${p === link ? ' aria-current="page"' : ""}${/^https?:/.test(link) ? ' rel="noopener"' : ""}>${esc(t(l, label))}</a>`).join("")}</nav>
  ${langSwitch(l, p, "header")}
  <a class="btn primary compact" href="${href(l, "/")}#get">${esc(t(l, "ui.get-inborn"))}</a>
</header>
<main id="main" class="${wide ? "wide" : "narrow"}">
${h1 ? `<h1>${h1}</h1>` : ""}
${body}
</main>
<footer class="bottom">
  <div class="footer-grid">
    <div>
      <a class="brand" href="${href(l, "/")}" aria-label="${esc(t(l, "ui.brand-home"))}">${sealSvg}<span>Inborn</span></a>
      <p class="small">${esc(t(l, "ui.footer.tagline"))}</p>
    </div>
    <nav aria-label="${esc(t(l, "ui.nav.footer"))}">
      <span class="label">${esc(t(l, "ui.footer.product"))}</span>
      <a href="${href(l, "/")}">${esc(t(l, "ui.footer.home"))}</a><a href="${href(l, "/proof")}">${esc(t(l, "ui.nav.proof"))}</a><a href="${href(l, "/blog")}">${esc(t(l, "ui.nav.blog"))}</a><a href="${href(l, "/support")}">${esc(t(l, "ui.nav.support"))}</a>
    </nav>
    <nav aria-label="${esc(t(l, "ui.nav.legal"))}">
      <span class="label">${esc(t(l, "ui.nav.legal"))}</span>
      ${legalRoutes.map((r) => `<a href="${href(l, r)}">${esc(legalLabel(l, r))}</a>`).join("")}
    </nav>
  </div>
  ${langSwitch(l, p, "footer")}
  <p class="mono small readout-line">${esc(t(l, "ui.footer.readout"))}</p>
  <p class="small">${esc(t(l, "ui.footer.ai-notice"))}</p>
  <p class="small">${t(l, "ui.footer.source")}</p>
</footer>
</body>
</html>
`;
}

/* ---------- Structured data ---------- */

/* The publisher and the brand are one entity in every language, so they keep one id at the root. A page is not:
   each locale's WebSite, app description, FAQ and articles are their own nodes, in their own language. */
const ID = {
  org: `${siteOrigin}/#organization`,
  brand: `${siteOrigin}/#brand`,
  logo: `${siteOrigin}/#logo`,
  site: (l) => `${abs(l, "/")}#website`,
  app: (l) => `${abs(l, "/")}#app`,
};

const baseGraph = (l) => ({
  "@type": "WebSite",
  "@id": ID.site(l),
  url: abs(l, "/"),
  name: "Inborn",
  description: t(l, "ld.site-description"),
  inLanguage: l.code,
  publisher: { "@id": ID.org },
});

const orgGraph = () => [
  {
    "@type": "Organization",
    "@id": ID.org,
    name: "Cohen Apps",
    url: `${siteOrigin}/`,
    email: "support@inbornapp.com",
    logo: { "@type": "ImageObject", "@id": ID.logo, url: `${siteOrigin}/icon-512.png`, width: 512, height: 512, caption: "Inborn" },
    brand: { "@id": ID.brand },
  },
  {
    "@type": "Brand",
    "@id": ID.brand,
    name: "Inborn",
    url: `${siteOrigin}/`,
    logo: { "@id": ID.logo },
    slogan: "Turn the internet off. Keep chatting.",
    description: "Inborn is an on-device AI chat app: the model runs on the user's own phone or computer, so no conversation is sent to a server. No account, no cloud, no analytics, no subscription.",
  },
];

const breadcrumb = (l, p, trail) => ({
  "@type": "BreadcrumbList",
  "@id": `${abs(l, p)}#breadcrumb`,
  itemListElement: trail.map(([name, item], i) => ({ "@type": "ListItem", position: i + 1, name, ...(item ? { item: abs(l, item) } : {}) })),
});

/**
 * The landing FAQ, in one place: the visible `<h3>` list and the FAQPage graph are both rendered from it, so an
 * answer an engine quotes can never differ from the answer a reader sees. First sentence answers it outright.
 */
export const FAQ_COUNT = 10;
/* Sizes only, not fill(): the FAQ is itself one of the tokens fill() resolves. */
const sizes = (s) => s.replace(/\{\{SIZE_INSTANT\}\}/g, SIZE_INSTANT).replace(/\{\{SIZE_FAST\}\}/g, SIZE_FAST);
const faq = (l) => Array.from({ length: FAQ_COUNT }, (_, i) => [t(l, `faq.${i + 1}.q`), sizes(t(l, `faq.${i + 1}.a`))]);

const faqHtml = (l) => faq(l).map(([q, a]) => `<div class="qa"><h3>${esc(q)}</h3><p>${esc(a)}</p></div>`).join("");

const homeGraph = (l) => [
  {
    "@type": "SoftwareApplication",
    "@id": ID.app(l),
    name: "Inborn",
    alternateName: "Inborn: Private Local AI Chat",
    url: abs(l, "/"),
    applicationCategory: "UtilitiesApplication",
    applicationSubCategory: "On-device AI chat assistant",
    operatingSystem: "iOS, iPadOS, Android, Windows, macOS, Web browser",
    isAccessibleForFree: true,
    inLanguage: l.code,
    softwareVersion: "1.0",
    permissions: t(l, "ld.permissions"),
    featureList: Array.from({ length: 8 }, (_, i) => t(l, `ld.feature.${i + 1}`)),
    publisher: { "@id": ID.org },
    brand: { "@id": ID.brand },
    offers: [
      ["free", "0"],
      ["pro", "19.99"],
      ["work", "69.99"],
    ].map(([id, price]) => ({
      "@type": "Offer", "@id": `${abs(l, "/")}#offer-${id}`, name: t(l, `ld.offer.${id}.name`), description: t(l, `ld.offer.${id}.description`), price, priceCurrency: "USD",
      availability: "https://schema.org/InStock", category: id === "free" ? "free" : "one-time purchase",
    })),
  },
  {
    "@type": "FAQPage",
    "@id": `${abs(l, "/")}#faq`,
    mainEntity: faq(l).map(([name, text]) => ({ "@type": "Question", name, acceptedAnswer: { "@type": "Answer", text } })),
  },
];

/* ---------- Pages ---------- */

/** A page fragment in src/pages: `<!-- meta: {json} -->` on the first line, then body HTML whose strings are keys. */
function fragment(dir, name) {
  const raw = readFileSync(path.join(src, dir, `${name}.html`), "utf8");
  const m = /^<!--\s*meta:\s*(\{.*?\})\s*-->\n?/s.exec(raw);
  const meta = m ? JSON.parse(m[1]) : {};
  return { ...meta, tpl: raw.slice(m ? m[0].length : 0), source: `apps/site/src/${dir}/${name}.html` };
}

/** The three answer-engine posts. Order here is the order on /blog and in llms.txt. */
const POSTS = ["why-on-device", "how-the-proof-works", "choosing-a-model"];

const metaOf = (id, field, l, fallback) => {
  const key = `${id}.meta.${field}`;
  if (strings[EN.code][key] === undefined) return fallback;
  return t(l, key);
};

function postPages() {
  return POSTS.map((name) => {
    const f = fragment("posts", name);
    const p = `/blog/${name}`;
    const id = `post.${name}`;
    return {
      ...f,
      id,
      path: p,
      ogImage: "/og/blog.png",
      ogType: "article",
      jsonld: (l) => [
        {
          "@type": "BlogPosting",
          "@id": `${abs(l, p)}#article`,
          isPartOf: { "@id": ID.site(l) },
          mainEntityOfPage: abs(l, p),
          url: abs(l, p),
          headline: metaOf(id, "h1", l, metaOf(id, "title", l)),
          description: metaOf(id, "description", l),
          inLanguage: l.code,
          datePublished: f.published,
          dateModified: lastmod(f.source),
          author: { "@id": ID.org },
          publisher: { "@id": ID.org },
          about: { "@id": ID.app(l) },
        },
        breadcrumb(l, p, [["Inborn", "/"], [metaOf("blog", "h1", l), "/blog"], [metaOf(id, "h1", l, metaOf(id, "title", l)), null]]),
      ],
    };
  });
}

function blogIndex(posts) {
  return {
    id: "blog",
    path: "/blog",
    wide: true,
    source: "apps/site/build.mjs",
    body: (l) => {
      const items = posts.map((post) => `<li class="post">
  <a class="post-link" href="${href(l, post.path)}">
    <span class="label">${esc(metaOf(post.id, "kicker", l, t(l, "blog.article")))}</span>
    <h2>${esc(metaOf(post.id, "h1", l, metaOf(post.id, "title", l)))}</h2>
    <p>${esc(metaOf(post.id, "excerpt", l))}</p>
    <span class="more">${esc(t(l, "blog.read-it"))}</span>
  </a>
</li>`).join("");
      return `<p class="lede">${esc(t(l, "blog.lede"))}</p>
<ul class="posts">${items}</ul>`;
    },
    jsonld: (l) => [
      { "@type": "Blog", "@id": `${abs(l, "/blog")}#blog`, url: abs(l, "/blog"), name: metaOf("blog", "h1", l), inLanguage: l.code, publisher: { "@id": ID.org }, blogPost: posts.map((p) => ({ "@id": `${abs(l, p.path)}#article` })) },
      breadcrumb(l, "/blog", [["Inborn", "/"], [metaOf("blog", "h1", l), null]]),
    ],
  };
}

/* ---------- Answer-engine files ---------- */

/**
 * One llms.txt per language, each listing that language's own URLs, plus a Languages section so an engine that
 * fetched the root file (the only path the convention fixes) can find the rest.
 */
function llmsTxt(l, pages) {
  const link = (p) => {
    const page = pages.find((x) => x.path === p);
    return page ? `- [${page.h1 ?? page.title}](${abs(l, p)}): ${page.description}` : null;
  };
  const group = (paths) => paths.map(link).filter(Boolean).join("\n");
  const languages = LOCALES.map((other) => `- ${other.name} (${other.code}): ${abs(other, "/")}`).join("\n");
  return `# Inborn

> ${t(l, "llms.summary")}

- ${t(l, "llms.platforms")}
- ${t(l, "llms.price")}
- ${t(l, "llms.models")}
- ${t(l, "llms.privacy-label")}
- ${t(l, "llms.egress")}
- ${t(l, "llms.verification")}
- ${t(l, "llms.limit")}
- ${t(l, "llms.source")}

## ${t(l, "llms.languages")}

${languages}

## ${t(l, "llms.product")}

${group(["/", "/download", "/proof", "/support"])}

## ${t(l, "llms.writing")}

${group(["/blog", ...POSTS.map((p) => `/blog/${p}`)])}

## ${t(l, "llms.legal")}

${group(["/privacy", "/terms", "/licenses", "/accessibility"])}
`;
}

/** One fetch instead of twelve. Not a spec, a convenience: the whole site as text, never truncated. */
function llmsFull(l, pages) {
  const text = (html) => html
    .replace(/<script[\s\S]*?<\/script>/g, "")
    .replace(/<h2[^>]*>/g, "\n## ").replace(/<h3[^>]*>/g, "\n### ")
    .replace(/<li[^>]*>/g, "\n- ").replace(/<\/(p|div|section|article|tr|ul|ol|h\d)>/g, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&nbsp;/g, " ")
    .replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  const body = pages.filter((p) => p.path !== "/404").map((p) => `# ${p.h1 ?? p.title}
URL: ${abs(l, p.path)}
> ${p.description}

${text(p.html)}

---
`).join("\n");
  return `${llmsTxt(l, pages).split("\n## ")[0]}\n\n---\n\n${body}`;
}

/** We want answer engines to read and cite us; the block list is data resellers and training-only scrapers. */
function robotsTxt() {
  const allow = ["Googlebot", "Google-Extended", "Bingbot", "OAI-SearchBot", "ChatGPT-User", "GPTBot", "ClaudeBot", "Claude-SearchBot", "Claude-User", "anthropic-ai", "PerplexityBot", "Perplexity-User", "Applebot", "Applebot-Extended", "DuckAssistBot", "MistralAI-User", "MistralAI-Index", "meta-externalagent", "meta-externalfetcher", "Amazonbot", "YouBot", "CCBot", "cohere-ai", "facebookexternalhit"];
  const deny = ["Bytespider", "TikTokSpider", "omgili", "omgilibot", "Webzio-Extended", "Timpibot", "VelenPublicWebCrawler", "Diffbot", "ImagesiftBot", "ISSCyberRiskCrawler", "SemrushBot-OCOB"];
  return `# ${siteOrigin}/robots.txt
# Inborn is an on-device AI chat app. We want search and answer engines to read and cite this site.
# The same site is published in ${LOCALES.length} languages: English at the root, the others under /<locale>/.

${allow.map((ua) => `User-agent: ${ua}\nAllow: /`).join("\n\n")}

# Data resellers and training-only scrapers with no answer surface we can reach.
# robots.txt is a request, not a control; enforcement would be at the CDN.

${deny.map((ua) => `User-agent: ${ua}\nDisallow: /`).join("\n\n")}

User-agent: *
Allow: /

Content-Signal: search=yes, ai-input=yes, ai-train=yes

Sitemap: ${siteOrigin}/sitemap.xml
`;
}

/* ---------- Build ---------- */

/** The locale-independent page set: path, id, template or body function, and the structured data each one adds. */
function pageSet() {
  const pages = [];
  for (const file of readdirSync(path.join(src, "pages"))) {
    const name = file.replace(/\.html$/, "");
    const id = name === "index" ? "home" : name;
    pages.push({ ...fragment("pages", name), id, path: name === "index" ? "/" : `/${name}`, jsonld: (l) => (name === "index" ? homeGraph(l) : []) });
  }
  const posts = postPages();
  pages.push(...posts, blogIndex(posts));
  pages.push({ id: "privacy", path: "/privacy", source: "docs/legal/privacy-policy.md", body: legalPage("privacy-policy.md") });
  pages.push({ id: "terms", path: "/terms", source: "docs/legal/terms.md", body: legalPage("terms.md") });
  pages.push({ id: "licenses", path: "/licenses", source: "docs/legal/NOTICE.json", body: licensesPage });
  pages.push({ id: "accessibility", path: "/accessibility", source: "docs/legal/accessibility-policy.md", body: legalPage("accessibility-policy.md") });
  return pages;
}

/** The page as one locale sees it: every string resolved, ready for the layout, llms-full.txt and the sitemap. */
function render(l, page) {
  const html = localizeLinks(l, page.body ? page.body(l) : fill(l, page.tpl));
  return {
    ...page,
    html,
    title: metaOf(page.id, "title", l),
    h1: metaOf(page.id, "h1", l),
    description: metaOf(page.id, "description", l),
  };
}

/** `out` exists so two test files can build at once without wiping each other's dist (they run in parallel workers). */
export function build({ out = dist } = {}) {
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  cpSync(path.join(here, "public"), out, { recursive: true });
  writeFileSync(path.join(out, "site.css"), readFileSync(path.join(src, "site.css")));
  /* The hero composer is the one form on the site; form-action names exactly where it may post and nothing else. */
  const headers = readFileSync(path.join(here, "public/_headers"), "utf8").replace(/\{\{APP_ORIGIN\}\}/g, appOrigin);
  writeFileSync(path.join(out, "_headers"), headers);

  const set = pageSet();
  const built = [];
  for (const l of LOCALES) {
    const pages = set.map((page) => render(l, page));
    for (const page of pages) {
      const jsonld = [baseGraph(l), ...(page.jsonld?.(l) ?? [])];
      const rel = page.path === "/" ? "index.html" : `${page.path.slice(1)}.html`;
      const file = path.join(root(l).slice(1), rel);
      mkdirSync(path.dirname(path.join(out, file)), { recursive: true });
      writeFileSync(path.join(out, file), layout(l, { ...page, body: page.html, jsonld }));
      built.push(href(l, page.path));
    }
    const indexed = pages.filter((p) => p.path !== "/404");
    const urls = indexed.map((p) => `  <url><loc>${abs(l, p.path)}</loc><lastmod>${lastmod(p.source ?? "apps/site")}</lastmod></url>`).join("\n");
    writeFileSync(path.join(out, `sitemap-${l.code}.xml`), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`);
    const dir = path.join(out, root(l).slice(1));
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, "llms.txt"), llmsTxt(l, pages));
    writeFileSync(path.join(dir, "llms-full.txt"), llmsFull(l, pages));
  }
  /* One index, so a search engine finds all eight language maps from the one path robots.txt names. */
  const maps = LOCALES.map((l) => `  <sitemap><loc>${siteOrigin}/sitemap-${l.code}.xml</loc><lastmod>${lastmod("apps/site")}</lastmod></sitemap>`).join("\n");
  writeFileSync(path.join(out, "sitemap.xml"), `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${maps}\n</sitemapindex>\n`);
  writeFileSync(path.join(out, "robots.txt"), robotsTxt());
  return built;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const out = build();
  console.log(`built ${out.length} pages in ${LOCALES.length} languages → ${path.relative(process.cwd(), dist)}`);
  if (!storesLive) console.log("store links render as \"Opens at launch\" (STORES_LIVE=1 once both listings resolve)");
}
