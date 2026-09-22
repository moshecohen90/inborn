#!/usr/bin/env node
/**
 * Static site generator for the Inborn website (spec §13.4, §11.3, §3.3–3.4, §9).
 *
 *   node apps/site/build.mjs            → apps/site/dist
 *
 * Plain HTML + CSS, zero JavaScript in the output, zero third-party requests. privacy.html and terms.html are rendered
 * from docs/legal/*.md and licenses.html from docs/legal/NOTICE.json at build time, so the site cannot drift from the
 * legal sources. `{{PLACEHOLDER}}` tokens in the legal texts are rendered as visible chips until they are filled at launch.
 */
import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../..");
const src = path.join(here, "src");
const dist = path.join(here, "dist");
export const siteOrigin = process.env.SITE_ORIGIN ?? "https://inborn-site.pages.dev";

/** Placeholders we can fill now; everything else stays a visible chip (title attribute explains why). */
const filled = { PRIVACY_URL: "/privacy" };

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

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

/** The first `**Status: …**` paragraph of a legal draft becomes a notice above the text instead of body copy. */
function legalPage(file) {
  const md = readFileSync(path.join(repoRoot, "docs/legal", file), "utf8");
  const status = /^\*\*Status: ([^*]+)\*\*$/m.exec(md);
  const edited = /Last edited ([^.\n]+)\./.exec(md);
  const body = markdownToHtml(md.replace(status?.[0] ?? "", ""));
  const title = /^# (.+)$/m.exec(md)[1];
  const notice = status
    ? `<aside class="notice" role="note"><span class="label">Status</span>${inline(status[1])}${edited ? ` Last edited ${esc(edited[1])}.` : ""}</aside>`
    : "";
  return { title, body: `<article class="prose legal">${notice}${body.replace(/^<h1[^>]*>.*?<\/h1>\n?/, "")}</article>`, h1: title };
}

/* ---------- Licences from NOTICE.json ---------- */

function licensesPage() {
  const notice = JSON.parse(readFileSync(path.join(repoRoot, "docs/legal/NOTICE.json"), "utf8"));
  const groups = [
    ["model", "Models", "Open-weight models bundled with the app or served from our model host. Models you import yourself are shown their own licence in the app."],
    ["engine", "Engines and native components", ""],
    ["library", "Libraries", ""],
    ["font", "Fonts", ""],
  ];
  const row = (c) => `<tr>
  <td><a href="${esc(c.homepage ?? c.licenseUrl)}" rel="noopener">${esc(c.name)}</a>${c.version ? `<div class="mono small">${esc(c.version)}</div>` : ""}${c.tier ? `<div class="mono small">${esc(c.tier)}</div>` : ""}</td>
  <td><a href="${esc(c.licenseUrl)}" rel="noopener">${esc(c.license)}</a></td>
  <td>${esc(c.attribution ?? "")}${c.restrictions?.length ? `<div class="small">Restrictions: ${esc(c.restrictions.join("; "))}</div>` : ""}</td>
  <td class="mono small">${esc(c.scope)}</td>
</tr>`;
  const sections = groups.map(([g, title, intro]) => {
    const items = notice.components.filter((c) => c.group === g);
    if (!items.length) return "";
    return `<h2 id="${g}">${title}</h2>${intro ? `<p>${esc(intro)}</p>` : ""}
<div class="table-wrap"><table>
<thead><tr><th>Component</th><th>Licence</th><th>Attribution</th><th>Scope</th></tr></thead>
<tbody>${items.map(row).join("")}</tbody></table></div>`;
  }).join("\n");
  const excluded = notice.excludedByRule.map((e) => `<li><strong>${esc(e.family)}</strong> (${esc(e.license)}): ${esc(e.reason)}.</li>`).join("");
  const body = `<article class="prose">
<p>${esc(notice.app.name)} itself is not open source: its ${esc(notice.app.coreScope)} core carries the ${esc(notice.app.coreLicense)}, which grants the right to read and verify the code and nothing more. Everything else it ships with is listed here with its licence, exactly as the in-app Licences screen shows it. Inventory dated ${esc(notice.generated)}.</p>
<p class="small"><span class="label">Scope</span> shipped = inside the store build · catalogue = downloadable through the app · planned = in the specification, not yet integrated · build-only = used to build the app, never shipped.</p>
${sections}
<h2 id="excluded">Not in the catalogue, by rule</h2>
<p>These model families are deliberately not bundled or served, because their licences carry obligations we would have to pass on to you:</p>
<ul>${excluded}</ul>
</article>`;
  return { title: "Licences", h1: "Third-party licences", body };
}

/* ---------- Layout ---------- */

const sealSvg = `<svg class="seal" viewBox="0 0 1024 1024" aria-hidden="true" focusable="false"><circle cx="512" cy="512" r="294" fill="none" stroke="var(--sealed)" stroke-width="92"/><path d="M 723.5 307.8 A 294 294 0 0 1 794.6 431" fill="none" stroke="var(--accent-fill)" stroke-width="92" stroke-linecap="round"/><path d="M 723.5 307.8 A 294 294 0 0 1 794.6 431" fill="none" stroke="#FFD9A3" stroke-width="30" stroke-linecap="round"/></svg>`;

const nav = [
  ["/proof", "Proof"],
  ["/support", "Support"],
  ["/privacy", "Privacy"],
  ["/terms", "Terms"],
];

function layout({ title, description, path: p, body, h1, wide = false }) {
  const isHome = p === "/";
  const pageTitle = isHome ? "Inborn — AI that never leaves your phone" : `${title} · Inborn`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(pageTitle)}</title>
<meta name="description" content="${esc(description)}">
<meta name="color-scheme" content="dark light">
<meta name="theme-color" content="#0A0D11">
<link rel="canonical" href="${siteOrigin}${p === "/" ? "/" : p}">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="stylesheet" href="/site.css">
<meta property="og:title" content="${esc(pageTitle)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:type" content="website">
<meta property="og:url" content="${siteOrigin}${p === "/" ? "/" : p}">
<meta property="og:image" content="${siteOrigin}/icon-512.png">
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
<header class="top">
  <a class="brand" href="/" aria-label="Inborn home">${sealSvg}<span>Inborn</span></a>
  <nav aria-label="Main">${nav.map(([href, label]) => `<a href="${href}"${p === href ? ' aria-current="page"' : ""}>${label}</a>`).join("")}</nav>
</header>
<main id="main" class="${wide ? "wide" : "narrow"}">
${h1 ? `<h1>${h1}</h1>` : ""}
${body}
</main>
<footer class="bottom">
  <div class="footer-links">
    <a href="/proof">Proof</a><a href="/support">Support</a><a href="/privacy">Privacy</a><a href="/terms">Terms</a><a href="/licenses">Licences</a>
  </div>
  <p class="mono small">NO COOKIES · NO SCRIPTS · NO THIRD-PARTY REQUESTS</p>
  <p class="small">Responses in the app are generated by AI and can be wrong. Check anything that matters.</p>
</footer>
</body>
</html>
`;
}

/** A page fragment in src/pages: `<!-- meta: {json} -->` on the first line, then body HTML. */
function fragment(name) {
  const raw = readFileSync(path.join(src, "pages", `${name}.html`), "utf8");
  const m = /^<!--\s*meta:\s*(\{.*?\})\s*-->\n?/s.exec(raw);
  const meta = m ? JSON.parse(m[1]) : {};
  return { ...meta, body: raw.slice(m ? m[0].length : 0).replace(/\{\{SEAL\}\}/g, sealSvg) };
}

/* ---------- Build ---------- */

export function build() {
  rmSync(dist, { recursive: true, force: true });
  mkdirSync(dist, { recursive: true });
  cpSync(path.join(here, "public"), dist, { recursive: true });
  writeFileSync(path.join(dist, "site.css"), readFileSync(path.join(src, "site.css")));

  const pages = [];
  const add = (p, page) => { pages.push({ path: p, ...page }); };

  for (const file of readdirSync(path.join(src, "pages"))) {
    const name = file.replace(/\.html$/, "");
    const f = fragment(name);
    add(name === "index" ? "/" : `/${name}`, f);
  }
  const privacy = legalPage("privacy-policy.md");
  add("/privacy", { ...privacy, description: "Inborn privacy policy: conversations, documents and the AI model stay on your device. No accounts, no analytics, no data collection. The complete list of network activity, per platform." });
  const terms = legalPage("terms.md");
  add("/terms", { ...terms, description: "Inborn terms of use and licence: Free, one-time Pro and Work purchases, refunds through the stores, and what you agree to about AI output." });
  add("/licenses", { ...licensesPage(), description: "Every model, engine, library and font Inborn ships with, and its licence." });

  for (const page of pages) {
    const file = page.path === "/" ? "index.html" : `${page.path.slice(1)}.html`;
    writeFileSync(path.join(dist, file), layout(page));
  }

  const urls = pages.filter((p) => p.path !== "/404").map((p) => `  <url><loc>${siteOrigin}${p.path === "/" ? "/" : p.path}</loc></url>`).join("\n");
  writeFileSync(path.join(dist, "sitemap.xml"), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`);
  writeFileSync(path.join(dist, "robots.txt"), `User-agent: *\nAllow: /\nSitemap: ${siteOrigin}/sitemap.xml\n`);
  return pages.map((p) => p.path);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const out = build();
  console.log(`built ${out.length} pages → ${path.relative(process.cwd(), dist)}: ${out.join(" ")}`);
}
