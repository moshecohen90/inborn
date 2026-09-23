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
 * Environment:
 *   SITE_ORIGIN   canonical origin for links, sitemap and JSON-LD (default the Pages staging host)
 *   APP_ORIGIN    where the hero composer posts the first message (the deployed web app); also the only
 *                 host allowed in the CSP `form-action`
 *   STORES_LIVE   "1" once the two store listings actually resolve; until then the download row says so
 */
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../..");
const src = path.join(here, "src");
const dist = path.join(here, "dist");
export const siteOrigin = process.env.SITE_ORIGIN ?? "https://inborn-site.pages.dev";
/** The web app is a separate Pages project; `app.inbornapp.com` is the subdomain reserved for it on our own zone. */
export const appOrigin = process.env.APP_ORIGIN ?? "https://app.inbornapp.com";
/** Neither listing resolved on 23.9.2026 (App Store version PREPARE_FOR_SUBMISSION, Play on the internal track only). */
export const storesLive = process.env.STORES_LIVE === "1";

export const stores = {
  ios: { name: "App Store", href: "https://apps.apple.com/app/id6809165161", note: "iPhone and iPad" },
  android: { name: "Google Play", href: "https://play.google.com/store/apps/details?id=com.inbornapp.mobile", note: "Android phones and tablets" },
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
  return { title, body: `<article class="prose legal">${notice}${body.replace(/^<h1[^>]*>.*?<\/h1>\n?/, "")}</article>`, h1: title, source: `docs/legal/${file}` };
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
  return { title: "Licences", h1: "Third-party licences", body, source: "docs/legal/NOTICE.json" };
}

/* ---------- Layout ---------- */

const sealSvg = `<svg class="seal" viewBox="0 0 1024 1024" aria-hidden="true" focusable="false"><circle cx="512" cy="512" r="294" fill="none" stroke="var(--sealed)" stroke-width="92"/><path d="M 723.5 307.8 A 294 294 0 0 1 794.6 431" fill="none" stroke="var(--accent-fill)" stroke-width="92" stroke-linecap="round"/><path d="M 723.5 307.8 A 294 294 0 0 1 794.6 431" fill="none" stroke="#FFD9A3" stroke-width="30" stroke-linecap="round"/></svg>`;

const nav = [
  ["/proof", "Proof"],
  ["/blog", "Blog"],
  ["/support", "Support"],
];

/* Every legal page the app links out to, so the footer and the app's Legal screen cannot drift apart. */
export const legalRoutes = ["/privacy", "/terms", "/licenses", "/accessibility"];

const legalLabel = (route) => ({ "/privacy": "Privacy", "/terms": "Terms", "/licenses": "Licences", "/accessibility": "Accessibility" })[route] ?? route.slice(1);

/** Every `{{TOKEN}}` the generator fills. Anything else left in a page is an unfilled placeholder and a bug. */
export const TOKENS = ["SEAL", "APP_ORIGIN", "STORE_ROW", "FAQ"];

/** Tokens the page fragments may use, so a price or a store link is written in exactly one place. */
function tokens() {
  const storeRow = Object.values(stores).map((s) => `<a class="store" href="${s.href}" rel="noopener">
  <span class="store-k">${esc(s.name)}</span>
  <span class="store-v">${storesLive ? "Download Inborn" : "Opens at launch"}</span>
  <span class="store-n">${esc(s.note)}</span>
</a>`).join("");
  return {
    SEAL: sealSvg,
    APP_ORIGIN: appOrigin,
    STORE_ROW: storeRow,
    FAQ: faqHtml(),
  };
}

function layout({ title, description, path: p, body, h1, wide = false, jsonld = [], ogImage = "/og/default.png", ogAlt, ogType = "website" }) {
  const isHome = p === "/";
  const pageTitle = isHome ? "Inborn: private AI chat that runs on your device" : `${title} · Inborn`;
  const url = `${siteOrigin}${p === "/" ? "/" : p}`;
  const alt = ogAlt ?? "Inborn, an AI chat app that runs on your own device. The network readout reads OUT 0 B, CONNECTIONS 0, SEALED, ON-DEVICE.";
  const graph = [baseGraph(), ...jsonld];
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(pageTitle)}</title>
<meta name="description" content="${esc(description)}">
<meta name="color-scheme" content="dark light">
<meta name="theme-color" content="#0A0D11">
<link rel="canonical" href="${url}">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="stylesheet" href="/site.css">
<meta property="og:site_name" content="Inborn">
<meta property="og:locale" content="en_US">
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
<a class="skip" href="#main">Skip to content</a>
<header class="top">
  <a class="brand" href="/" aria-label="Inborn home">${sealSvg}<span>Inborn</span></a>
  <nav aria-label="Main">${nav.map(([href, label]) => `<a href="${href}"${p === href ? ' aria-current="page"' : ""}>${label}</a>`).join("")}</nav>
  <a class="btn primary compact" href="/#get">Get Inborn</a>
</header>
<main id="main" class="${wide ? "wide" : "narrow"}">
${h1 ? `<h1>${h1}</h1>` : ""}
${body}
</main>
<footer class="bottom">
  <div class="footer-grid">
    <div>
      <a class="brand" href="/" aria-label="Inborn home">${sealSvg}<span>Inborn</span></a>
      <p class="small">Private AI chat that runs on your own device. Published by Cohen Apps.</p>
    </div>
    <nav aria-label="Footer">
      <span class="label">Product</span>
      <a href="/">Home</a><a href="/proof">Proof</a><a href="/blog">Blog</a><a href="/support">Support</a>
    </nav>
    <nav aria-label="Legal">
      <span class="label">Legal</span>
      ${legalRoutes.map((r) => `<a href="${r}">${legalLabel(r)}</a>`).join("")}
    </nav>
  </div>
  <p class="mono small readout-line">NO COOKIES · NO TRACKING · NO THIRD-PARTY REQUESTS</p>
  <p class="small">Responses in the app are generated by AI and can be wrong. Check anything that matters.</p>
  <p class="small">Inborn's source code is not public. App Store is a trademark of Apple Inc., registered in the U.S. and other countries. Google Play and the Google Play logo are trademarks of Google LLC.</p>
</footer>
</body>
</html>
`;
}

/* ---------- Structured data ---------- */

const ID = {
  site: `${siteOrigin}/#website`,
  org: `${siteOrigin}/#organization`,
  brand: `${siteOrigin}/#brand`,
  logo: `${siteOrigin}/#logo`,
  app: `${siteOrigin}/#app`,
};

const baseGraph = () => ({
  "@type": "WebSite",
  "@id": ID.site,
  url: `${siteOrigin}/`,
  name: "Inborn",
  description: "Inborn is an AI chat app that runs entirely on your own device. No account, no cloud, no analytics. Works in airplane mode. One-time purchase.",
  inLanguage: "en",
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

const breadcrumb = (p, trail) => ({
  "@type": "BreadcrumbList",
  "@id": `${siteOrigin}${p}#breadcrumb`,
  itemListElement: trail.map(([name, item], i) => ({ "@type": "ListItem", position: i + 1, name, ...(item ? { item: `${siteOrigin}${item}` } : {}) })),
});

/**
 * The landing FAQ, in one place: the visible `<h3>` list and the FAQPage graph are both rendered from it, so an
 * answer an engine quotes can never differ from the answer a reader sees. First sentence answers it outright.
 */
const FAQ = [
  ["Is Inborn really offline?",
    "Yes. Inborn runs the AI model on your own device, so it answers with every radio switched off, and the Android release build does not declare the INTERNET permission, which means it cannot open a connection. Turn on airplane mode and ask it something: the answer arrives at the same speed, because there is no server in the path."],
  ["Do you see my chats?",
    "No. Your messages never leave the device, and Inborn has no account system, no server, no analytics and no crash reporting, so there is nothing for us to see, store, sell or hand to anyone. Conversations live in an encrypted database whose key the operating system holds. We could not recover them for you even if you asked."],
  ["How big is the download?",
    "The app is a normal store download and the Instant model it runs is 533 MB, which ships inside the app on iPhone and arrives from Google Play as an asset pack on Android. Larger models are optional: Fast is 1.28 GB and Sharp is 2.74 GB, and you choose when to install them. In a browser the same 533 MB is downloaded once into the browser's own storage."],
  ["Which AI models does Inborn run?",
    "Inborn runs open-weight models in GGUF format: Qwen3.5 at 0.8B, 2B and 4B under Apache-2.0, and Microsoft's Phi-4-mini 3.8B under MIT. Instant and Fast are free; the Sharp models come with Pro. You can also import any GGUF file you already have, including Gemma, Mistral and Llama."],
  ["Will it work on my phone?",
    "Inborn measures your device and recommends a model that fits it, and the built-in Instant model runs on every supported device. Measured on our own hardware: Instant reaches about 36 tokens a second on an iPhone 13 Pro and 12 to 15 on a 2018 Android flagship. On that 2018 phone the Sharp models are too slow to be worth installing, and the app says so on the card before you install."],
  ["Is Inborn a subscription?",
    "No. Inborn is a one-time purchase: Free is the complete app with unlimited chat, Pro is 19.99 USD once and Work is 69.99 USD once, with no renewal, no monthly fee and no message quota. List prices are in US dollars and local prices vary. A purchase belongs to the store account that bought it."],
  ["How good is a small on-device model compared with ChatGPT?",
    "A model that fits on a phone is genuinely weaker than a frontier cloud model at hard reasoning, long code, current facts and rare languages, and it is the better choice for anything you would rather not upload. Expect solid short answers, rewrites, summaries and translation into the major languages. Expect mistakes elsewhere, and check anything that matters."],
  ["Can Inborn read my own documents?",
    "Yes, with Pro. Inborn indexes your PDFs and documents on the device and answers questions about them with the passage it took the answer from, and nothing is uploaded because there is no cloud index. A file you add inside an incognito chat is removed when the session ends."],
  ["Can I use Inborn for client work?",
    "Yes. Work is a one-time 69.99 USD purchase that adds client vaults, an audit log with signed export, and an architecture statement you can hand to whoever at your firm has to approve software. Because there is no server, client material never leaves the machine you typed it on. You stay responsible for checking AI output under your own professional rules."],
  ["Is Inborn open source?",
    "No. Inborn is not open source and its source code is not public, which is why none of the checks we publish asks you to read code: every one of them is made from outside the app, on the build you installed. The Proof screen names the exact build you are running."],
];

const faqHtml = () => FAQ.map(([q, a]) => `<div class="qa"><h3>${esc(q)}</h3><p>${esc(a)}</p></div>`).join("");

const homeGraph = () => [
  {
    "@type": "SoftwareApplication",
    "@id": ID.app,
    name: "Inborn",
    alternateName: "Inborn: Private Local AI Chat",
    url: `${siteOrigin}/`,
    applicationCategory: "UtilitiesApplication",
    applicationSubCategory: "On-device AI chat assistant",
    operatingSystem: "iOS, iPadOS, Android, Windows, macOS, Web browser",
    isAccessibleForFree: true,
    inLanguage: "en",
    softwareVersion: "1.0",
    permissions: "None on Android: the release build does not declare android.permission.INTERNET, so the app cannot open a network connection.",
    featureList: [
      "Unlimited AI chat with an open-weight model that runs entirely on the device",
      "Works with no internet connection, including airplane mode",
      "No account, no email, no sign-in",
      "Ask questions about your own PDFs and documents, indexed on the device",
      "Speech in and out with voices that run locally",
      "Screen lock, an incognito mode that saves nothing and ends with the session, one-tap wipe",
      "Proof screen showing bytes out, bytes in and open connections from the operating system's own counters",
      "Import any GGUF model file, including Gemma, Mistral and Llama",
    ],
    publisher: { "@id": ID.org },
    brand: { "@id": ID.brand },
    offers: [
      ["free", "Free", "0", "A complete app, not a trial: unlimited chat with the built-in model, no message cap, no watermark, no ads."],
      ["pro", "Pro", "19.99", "One-time purchase, no subscription: your own documents, voice in and out, the larger Sharp models, unlimited personas, folders and full export."],
      ["work", "Work", "69.99", "One-time purchase for people whose notes must not leave the room: client vaults, an audit log with signed export, and an architecture statement. 49.99 USD as an upgrade from Pro."],
    ].map(([id, name, price, description]) => ({
      "@type": "Offer", "@id": `${siteOrigin}/#offer-${id}`, name, description, price, priceCurrency: "USD",
      availability: "https://schema.org/InStock", category: id === "free" ? "free" : "one-time purchase",
    })),
  },
  {
    "@type": "FAQPage",
    "@id": `${siteOrigin}/#faq`,
    mainEntity: FAQ.map(([name, text]) => ({ "@type": "Question", name, acceptedAnswer: { "@type": "Answer", text } })),
  },
];

/* ---------- Pages ---------- */

/** A page fragment in src/pages: `<!-- meta: {json} -->` on the first line, then body HTML. */
function fragment(dir, name) {
  const raw = readFileSync(path.join(src, dir, `${name}.html`), "utf8");
  const m = /^<!--\s*meta:\s*(\{.*?\})\s*-->\n?/s.exec(raw);
  const meta = m ? JSON.parse(m[1]) : {};
  return { ...meta, body: raw.slice(m ? m[0].length : 0), source: `apps/site/src/${dir}/${name}.html` };
}

/** The three answer-engine posts. Order here is the order on /blog and in llms.txt. */
const POSTS = ["why-on-device", "how-the-proof-works", "choosing-a-model"];

function postPages() {
  return POSTS.map((name) => {
    const f = fragment("posts", name);
    const p = `/blog/${name}`;
    return {
      ...f,
      path: p,
      ogImage: "/og/blog.png",
      ogType: "article",
      jsonld: [
        {
          "@type": "BlogPosting",
          "@id": `${siteOrigin}${p}#article`,
          isPartOf: { "@id": ID.site },
          mainEntityOfPage: `${siteOrigin}${p}`,
          url: `${siteOrigin}${p}`,
          headline: f.h1 ?? f.title,
          description: f.description,
          inLanguage: "en",
          datePublished: f.published,
          dateModified: lastmod(f.source),
          author: { "@id": ID.org },
          publisher: { "@id": ID.org },
          about: { "@id": ID.app },
        },
        breadcrumb(p, [["Inborn", "/"], ["Blog", "/blog"], [f.h1 ?? f.title, null]]),
      ],
    };
  });
}

function blogIndex(posts) {
  const items = posts.map((post) => `<li class="post">
  <a class="post-link" href="${post.path}">
    <span class="label">${esc(post.kicker ?? "Article")}</span>
    <h2>${esc(post.h1 ?? post.title)}</h2>
    <p>${esc(post.excerpt)}</p>
    <span class="more">Read it</span>
  </a>
</li>`).join("");
  return {
    title: "Blog",
    h1: "Writing",
    description: "Short pieces on running AI on your own hardware: why on-device, how to check that an app sends nothing, and how to pick a model your device can run.",
    wide: true,
    body: `<p class="lede">Three questions we get asked constantly, answered properly. No newsletter, no pop-up, no tracking.</p>
<ul class="posts">${items}</ul>`,
    source: "apps/site/build.mjs",
    jsonld: [
      { "@type": "Blog", "@id": `${siteOrigin}/blog#blog`, url: `${siteOrigin}/blog`, name: "Inborn writing", inLanguage: "en", publisher: { "@id": ID.org }, blogPost: posts.map((p) => ({ "@id": `${siteOrigin}${p.path}#article` })) },
      breadcrumb("/blog", [["Inborn", "/"], ["Blog", null]]),
    ],
  };
}

/* ---------- Answer-engine files ---------- */

function llmsTxt(pages) {
  const link = (p) => {
    const page = pages.find((x) => x.path === p);
    return page ? `- [${page.h1 ?? page.title}](${siteOrigin}${p}): ${page.description}` : null;
  };
  const group = (paths) => paths.map(link).filter(Boolean).join("\n");
  return `# Inborn

> Inborn is a private AI chat app that runs entirely on the user's own device. There is no account, no cloud, no server, no analytics and no tracking. It works in airplane mode because the AI model is stored on the device. On Android the release build does not declare the INTERNET permission, so the app cannot open a network connection at all. Inborn is sold as a one-time purchase, never a subscription. Published by Cohen Apps; support@inbornapp.com.

- Platforms: iPhone, iPad, Android, web browser, Windows, macOS. iPhone and Android first; desktop after.
- Price: Free 0 USD (a complete app: unlimited chat, no message cap, no ads, no watermark). Pro 19.99 USD one time. Work 69.99 USD one time, or 49.99 USD as an upgrade from Pro. List prices in US dollars; local prices vary.
- Models: open-weight models in GGUF format. Instant is Qwen3.5 0.8B (533 MB, Apache-2.0) and ships inside the app. Fast is Qwen3.5 2B (1.28 GB, Apache-2.0). Sharp is Qwen3.5 4B (2.74 GB) or Phi-4-mini 3.8B (2.49 GB, MIT) and needs Pro. Any GGUF file can be imported, including Gemma, Mistral and Llama.
- Privacy label: Data Not Collected. No account, no email, no sign-in, no analytics, no ads, no crash reporting in the app.
- The four situations in which any bytes leave the device: model delivery (Google Play asset packs on Android, one HTTPS file fetch from models.inbornapp.com on iOS and desktop), a store purchase, an optional Hugging Face import the user starts, and a support email the user writes.
- Verification, all from outside the app: the airplane-mode test; the Google Play permissions page shows no "full network access"; aapt2 dump permissions on the APK shows no android.permission.INTERNET; the iOS App Privacy Report row stays empty; the in-app Proof screen reads OUT 0 B and CONNECTIONS 0 from the operating system's own counters; a firewall such as NetGuard, Little Snitch or LuLu has nothing to block.
- Honest limit: a small model on a phone is not a large cloud model. Responses are generated by AI and can be wrong.
- Inborn's source code is not public, so no check we publish asks anyone to read it.

## Product

${group(["/", "/proof", "/support"])}

## Writing

${group(["/blog", ...POSTS.map((p) => `/blog/${p}`)])}

## Legal

${group(["/privacy", "/terms", "/licenses", "/accessibility"])}
`;
}

/** One fetch instead of twelve. Not a spec, a convenience: the whole site as text, never truncated. */
function llmsFull(pages) {
  const text = (html) => html
    .replace(/<script[\s\S]*?<\/script>/g, "")
    .replace(/<h2[^>]*>/g, "\n## ").replace(/<h3[^>]*>/g, "\n### ")
    .replace(/<li[^>]*>/g, "\n- ").replace(/<\/(p|div|section|article|tr|ul|ol|h\d)>/g, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&nbsp;/g, " ")
    .replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  const body = pages.filter((p) => p.path !== "/404").map((p) => `# ${p.h1 ?? p.title}
URL: ${siteOrigin}${p.path === "/" ? "/" : p.path}
> ${p.description}

${text(p.body)}

---
`).join("\n");
  return `${llmsTxt(pages).split("\n## ")[0]}\n\n---\n\n${body}`;
}

/** We want answer engines to read and cite us; the block list is data resellers and training-only scrapers. */
function robotsTxt() {
  const allow = ["Googlebot", "Google-Extended", "Bingbot", "OAI-SearchBot", "ChatGPT-User", "GPTBot", "ClaudeBot", "Claude-SearchBot", "Claude-User", "anthropic-ai", "PerplexityBot", "Perplexity-User", "Applebot", "Applebot-Extended", "DuckAssistBot", "MistralAI-User", "MistralAI-Index", "meta-externalagent", "meta-externalfetcher", "Amazonbot", "YouBot", "CCBot", "cohere-ai", "facebookexternalhit"];
  const deny = ["Bytespider", "TikTokSpider", "omgili", "omgilibot", "Webzio-Extended", "Timpibot", "VelenPublicWebCrawler", "Diffbot", "ImagesiftBot", "ISSCyberRiskCrawler", "SemrushBot-OCOB"];
  return `# ${siteOrigin}/robots.txt
# Inborn is an on-device AI chat app. We want search and answer engines to read and cite this site.

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

export function build() {
  rmSync(dist, { recursive: true, force: true });
  mkdirSync(dist, { recursive: true });
  cpSync(path.join(here, "public"), dist, { recursive: true });
  writeFileSync(path.join(dist, "site.css"), readFileSync(path.join(src, "site.css")));
  /* The hero composer is the one form on the site; form-action names exactly where it may post and nothing else. */
  const headers = readFileSync(path.join(here, "public/_headers"), "utf8").replace(/\{\{APP_ORIGIN\}\}/g, appOrigin);
  writeFileSync(path.join(dist, "_headers"), headers);

  const pages = [];
  const add = (p, page) => { pages.push({ path: p, ...page }); };

  for (const file of readdirSync(path.join(src, "pages"))) {
    const name = file.replace(/\.html$/, "");
    add(name === "index" ? "/" : `/${name}`, fragment("pages", name));
  }
  const posts = postPages();
  for (const post of posts) pages.push(post);
  add("/blog", blogIndex(posts));

  const privacy = legalPage("privacy-policy.md");
  add("/privacy", { ...privacy, description: "Inborn privacy policy: conversations, documents and the AI model stay on your device. No accounts, no analytics, no data collection. The complete list of network activity, per platform." });
  const terms = legalPage("terms.md");
  add("/terms", { ...terms, description: "Inborn terms of use and licence: Free, one-time Pro and Work purchases, refunds through the stores, and what you agree to about AI output." });
  add("/licenses", { ...licensesPage(), description: "Every model, engine, library and font Inborn ships with, and its licence." });
  const accessibility = legalPage("accessibility-policy.md");
  add("/accessibility", { ...accessibility, description: "Inborn accessibility statement: the standard we work to, what the app and this site do today for text size, contrast, motion, screen readers and keyboards, the gaps we have measured, and how to report one." });

  const built = pages.map((p) => p.path);
  const vars = tokens();
  const fill = (html) => html.replace(/\{\{([A-Z_]+)\}\}/g, (m, k) => (k in vars ? vars[k] : m));

  for (const page of pages) {
    const jsonld = [...orgGraph(), ...(page.path === "/" ? homeGraph() : []), ...(page.jsonld ?? [])];
    const file = page.path === "/" ? "index.html" : `${page.path.slice(1)}.html`;
    mkdirSync(path.dirname(path.join(dist, file)), { recursive: true });
    writeFileSync(path.join(dist, file), fill(layout({ ...page, jsonld })));
  }

  const indexed = pages.filter((p) => p.path !== "/404");
  const urls = indexed.map((p) => `  <url><loc>${siteOrigin}${p.path === "/" ? "/" : p.path}</loc><lastmod>${lastmod(p.source ?? "apps/site")}</lastmod></url>`).join("\n");
  writeFileSync(path.join(dist, "sitemap.xml"), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`);
  writeFileSync(path.join(dist, "robots.txt"), robotsTxt());
  writeFileSync(path.join(dist, "llms.txt"), fill(llmsTxt(pages)));
  writeFileSync(path.join(dist, "llms-full.txt"), fill(llmsFull(pages)));
  return built;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const out = build();
  console.log(`built ${out.length} pages → ${path.relative(process.cwd(), dist)}: ${out.join(" ")}`);
  if (!storesLive) console.log("store links render as \"Opens at launch\" (STORES_LIVE=1 once both listings resolve)");
}
