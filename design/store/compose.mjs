#!/usr/bin/env node
/**
 * Composes the store screenshot sets from the raw captures (design/store/raw, made by capture.mjs) and the approved copy in
 * docs/store/listing.<locale>.json → design/store/out/<store>/<locale>/<set>/NN-<screen>.png + out/preview.html.
 *
 *   node design/store/compose.mjs [--locale=en,ja,...] [--set=apple-6.9,apple-6.5,apple-ipad-13,play-phone,play-tablet-7,play-tablet-10,play-feature]
 *
 * FARADAY frame (spec §9): graphite ground, IBM Plex Sans headline / Plex Mono eyebrow, the sealed green only as the seal glyph,
 * a hairline bezel around the real capture. One type scale per set (the engine's uniformHeadline rule). Fonts: design/store/fonts.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { findChromium, loadPlaywright } from "./chromium.mjs";

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dir, "../..");
const RAW = join(__dir, "raw");
const OUT = join(__dir, "out");
const FONTS = join(__dir, "fonts");
const ICON = join(ROOT, "design/icon/store-1024.png");
const SCREENS = ["chat", "proof", "documents", "paywall", "vault", "lock"];

const arg = (k, d) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split("=").slice(1).join("=") ?? d;
const LOCALES = arg("locale", "en,ja,de,fr,es,pt-BR").split(",").filter(Boolean);

/* Store sizes. `src` is the raw platform folder; a missing iPad/tablet capture falls back to the phone capture, centred and noted. */
const SETS = {
  "apple-6.9": { store: "apple", dir: "6.9", w: 1320, h: 2868, src: "ios", island: true },
  "apple-6.5": { store: "apple", dir: "6.5", w: 1284, h: 2778, src: "ios", island: true },
  "apple-ipad-13": { store: "apple", dir: "ipad-13", w: 2064, h: 2752, src: "ipad", fallback: "ios", tablet: true },
  "play-phone": { store: "play", dir: "phone", w: 1080, h: 1920, src: "android", hole: true },
  "play-tablet-7": { store: "play", dir: "tablet-7", w: 1200, h: 1920, src: "android", tablet: true, fallback: "android" },
  "play-tablet-10": { store: "play", dir: "tablet-10", w: 1600, h: 2560, src: "android", tablet: true, fallback: "android" },
  "play-feature": { store: "play", dir: ".", w: 1024, h: 500, feature: true },
};
const ONLY = arg("set", Object.keys(SETS).join(",")).split(",").filter(Boolean);

const C = { bg: "#0A0D11", s1: "#12161B", s2: "#181D23", border: "#1F262E", text: "#EEF2F5", text2: "#9AA6B2", text3: "#667380", accent: "#F0B35B", sealed: "#3ECF8E" };
const listing = (locale) => JSON.parse(readFileSync(join(ROOT, "docs/store", `listing.${locale}.json`), "utf8"));
const fileUrl = (p) => pathToFileURL(p).href;
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const fontCss = () => `
@font-face{font-family:"Plex";src:url("${fileUrl(join(FONTS, "IBMPlexSans-Regular.ttf"))}");font-weight:400}
@font-face{font-family:"Plex";src:url("${fileUrl(join(FONTS, "IBMPlexSans-Medium.ttf"))}");font-weight:500}
@font-face{font-family:"Plex";src:url("${fileUrl(join(FONTS, "IBMPlexSans-SemiBold.ttf"))}");font-weight:600}
@font-face{font-family:"PlexJP";src:url("${fileUrl(join(FONTS, "IBMPlexSansJP-Regular.ttf"))}");font-weight:400}
@font-face{font-family:"PlexJP";src:url("${fileUrl(join(FONTS, "IBMPlexSansJP-Medium.ttf"))}");font-weight:500}
@font-face{font-family:"PlexJP";src:url("${fileUrl(join(FONTS, "IBMPlexSansJP-SemiBold.ttf"))}");font-weight:600}
@font-face{font-family:"PlexMono";src:url("${fileUrl(join(FONTS, "IBMPlexMono-Medium.ttf"))}");font-weight:500}
@font-face{font-family:"PlexMono";src:url("${fileUrl(join(FONTS, "IBMPlexMono-Regular.ttf"))}");font-weight:400}`;

/* The seal: a closed ring, the one place the green lives (spec §9.5). */
const seal = (size) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 28 28" fill="none"><circle cx="14" cy="14" r="11" stroke="${C.sealed}" stroke-width="2.4"/><circle cx="14" cy="14" r="3" fill="${C.sealed}"/></svg>`;

/* One portrait panel: eyebrow + headline + subline, then the device with its bottom running off the panel. */
function panelHtml({ set, locale, headline, subline, image, imgW, imgH, note }) {
  const { w, h, tablet } = set;
  const jp = locale === "ja";
  const family = jp ? '"PlexJP","Plex"' : '"Plex","PlexJP"';
  const u = w / 1320; // type scale relative to the 6.9" panel, identical for every panel of a set
  const headPx = Math.round((tablet ? 66 : 84) * u * (tablet ? 1.55 : 1));
  const subPx = Math.round((tablet ? 36 : 44) * u * (tablet ? 1.55 : 1));
  const eyePx = Math.round(24 * u * (tablet ? 1.4 : 1));
  const padX = Math.round(96 * u);
  const top = Math.round(150 * u);
  /* device: width relative to panel, the rest of the height bleeds below the bottom edge */
  const bezel = Math.round((tablet ? 30 : 26) * u);
  const devW = Math.round(w * (tablet ? 0.84 : 0.82));
  const screenW = devW - 2 * bezel;
  const screenH = Math.round((screenW * imgH) / imgW);
  const radius = Math.round(screenW * (tablet ? 0.045 : 0.128));
  const gap = Math.round(90 * u);
  return `<!doctype html><html><head><meta charset="utf-8"><style>${fontCss()}
html,body{margin:0;width:${w}px;height:${h}px;overflow:hidden;background:${C.bg}}
.panel{position:relative;width:${w}px;height:${h}px;overflow:hidden;font-family:${family};color:${C.text};
  background:radial-gradient(90% 34% at 50% -6%, rgba(240,179,91,.10) 0%, rgba(240,179,91,0) 60%), linear-gradient(180deg,#0B0F14 0%,${C.bg} 60%,#080B0E 100%)}
.copy{position:absolute;left:${padX}px;right:${padX}px;top:${top}px;text-align:center}
.eyebrow{display:inline-flex;align-items:center;gap:${Math.round(12 * u)}px;font-family:"PlexMono";font-weight:500;font-size:${eyePx}px;letter-spacing:.08em;color:${C.sealed};text-transform:uppercase}
h1{margin:${Math.round(34 * u)}px 0 0;font-weight:600;font-size:${headPx}px;line-height:1.12;letter-spacing:-0.02em;text-wrap:balance}
p{margin:${Math.round(26 * u)}px 0 0;font-weight:400;font-size:${subPx}px;line-height:1.3;color:${C.text2};text-wrap:balance}
.device{position:absolute;left:50%;transform:translateX(-50%);width:${devW}px;top:var(--dev-top);border-radius:${radius + bezel}px;background:${C.s2};box-shadow:0 0 0 1px ${C.border},0 60px 140px rgba(0,0,0,.6);padding:${bezel}px}
.screen{display:block;width:${screenW}px;height:${screenH}px;border-radius:${radius}px;object-fit:cover;background:${C.bg}}
.island{position:absolute;left:50%;transform:translateX(-50%);top:${bezel + Math.round(screenW * 0.028)}px;width:${Math.round(screenW * 0.29)}px;height:${Math.round(screenW * 0.084)}px;border-radius:999px;background:#000}
.hole{position:absolute;left:50%;transform:translateX(-50%);top:${bezel + Math.round(screenW * 0.022)}px;width:${Math.round(screenW * 0.05)}px;height:${Math.round(screenW * 0.05)}px;border-radius:50%;background:#000}
.note{position:absolute;left:0;right:0;bottom:${Math.round(40 * u)}px;text-align:center;font-family:"PlexMono";font-size:${Math.round(20 * u)}px;color:${C.text3}}
</style></head><body><div class="panel">
<div class="copy" id="copy"><div class="eyebrow">${seal(Math.round(eyePx * 1.1))}<span>SEALED · ON-DEVICE</span></div><h1 id="h">${esc(headline)}</h1><p id="s">${esc(subline)}</p></div>
<div class="device" id="dev"><img class="screen" src="${fileUrl(image)}">${set.island ? '<div class="island"></div>' : ""}${set.hole ? '<div class="hole"></div>' : ""}</div>
${note ? `<div class="note">${esc(note)}</div>` : ""}
</div><script>
  const copy=document.getElementById('copy');const dev=document.getElementById('dev');
  dev.style.setProperty('--dev-top',(copy.offsetTop+copy.offsetHeight+${gap})+'px');
  const h=document.getElementById('h'),s=document.getElementById('s');
  window.__lines={h:Math.round(h.offsetHeight/(${headPx}*1.12)),s:Math.round(s.offsetHeight/(${subPx}*1.3))};
</script></body></html>`;
}

/* Play feature graphic 1024×500: icon, wordmark, the short description as the line. */
function featureHtml(locale, text) {
  const jp = locale === "ja";
  return `<!doctype html><html><head><meta charset="utf-8"><style>${fontCss()}
html,body{margin:0;width:1024px;height:500px;overflow:hidden;background:${C.bg}}
.g{position:relative;width:1024px;height:500px;display:flex;align-items:center;gap:56px;padding:0 84px;box-sizing:border-box;font-family:${jp ? '"PlexJP","Plex"' : '"Plex","PlexJP"'};color:${C.text};
  background:radial-gradient(60% 90% at 18% 50%, rgba(240,179,91,.12) 0%, rgba(240,179,91,0) 70%), linear-gradient(90deg,#0B0F14 0%,${C.bg} 100%)}
img{width:236px;height:236px;border-radius:52px;box-shadow:0 0 0 1px ${C.border},0 30px 70px rgba(0,0,0,.55)}
.eyebrow{display:flex;align-items:center;gap:10px;font-family:"PlexMono";font-weight:500;font-size:19px;letter-spacing:.08em;color:${C.sealed}}
h1{margin:14px 0 0;font-size:88px;line-height:1;font-weight:600;letter-spacing:-0.03em}
p{margin:22px 0 0;font-size:31px;line-height:1.3;color:${C.text2};max-width:600px;text-wrap:balance}
</style></head><body><div class="g"><img src="${fileUrl(ICON)}"><div><div class="eyebrow">${seal(22)}<span>SEALED · ON-DEVICE</span></div><h1>Inborn</h1><p>${esc(text)}</p></div></div></body></html>`;
}

async function main() {
  const pw = loadPlaywright();
  if (!pw) throw new Error("playwright-core not found (set PLAYWRIGHT_CORE_DIR)");
  const browser = await pw.chromium.launch({ executablePath: findChromium(pw.chromium) });
  const page = await browser.newPage();
  const tmp = join(OUT, ".panel.html");
  mkdirSync(OUT, { recursive: true });
  const preview = [];
  const warnings = [];
  for (const locale of LOCALES) {
    const copy = listing(locale);
    for (const [name, set] of Object.entries(SETS)) {
      if (!ONLY.includes(name)) continue;
      const dir = join(OUT, set.store, locale, set.dir);
      mkdirSync(dir, { recursive: true });
      await page.setViewportSize({ width: set.w, height: set.h });
      if (set.feature) {
        writeFileSync(tmp, featureHtml(locale, copy.google.short_description));
        await page.goto(fileUrl(tmp));
        const file = join(dir, "feature-graphic.png");
        await page.screenshot({ path: file });
        preview.push({ locale, set: name, file, label: "feature graphic" });
        continue;
      }
      for (const [i, screen] of SCREENS.entries()) {
        let src = join(RAW, set.src, locale, `${screen}.png`);
        let note = "";
        if (!existsSync(src) && set.fallback) {
          src = join(RAW, set.fallback, locale, `${screen}.png`);
          note = set.src === "ipad" ? "iPhone capture on the iPad canvas: no iPad capture yet" : "phone capture on the tablet canvas: no Android tablet capture";
        }
        if (!existsSync(src)) {
          warnings.push(`${locale}/${name}/${screen}: no capture at ${relative(ROOT, src)}`);
          continue;
        }
        const { headline, subline } = copy.screenshots[i];
        const dims = pngSize(src);
        writeFileSync(tmp, panelHtml({ set, locale, headline, subline, image: src, imgW: dims.w, imgH: dims.h, note }));
        await page.goto(fileUrl(tmp));
        await page.evaluate(() => document.fonts.ready);
        const lines = await page.evaluate(() => window.__lines);
        if (lines.h > 2) warnings.push(`${locale}/${name}/${screen}: headline wraps to ${lines.h} lines → shorten the copy`);
        if (lines.s > 2) warnings.push(`${locale}/${name}/${screen}: subline wraps to ${lines.s} lines → shorten the copy`);
        const file = join(dir, `${String(i + 1).padStart(2, "0")}-${screen}.png`);
        await page.screenshot({ path: file });
        preview.push({ locale, set: name, file, label: headline, screen });
      }
      console.log(`${locale} ${name} → ${relative(ROOT, dir)}`);
    }
  }
  await browser.close();
  try {
    readdirSync(OUT).includes(".panel.html") && (await import("node:fs")).rmSync(tmp);
  } catch {
    /* fine */
  }
  writePreview(preview, warnings);
  for (const w of warnings) console.warn("WARN", w);
}

function pngSize(file) {
  const b = readFileSync(file);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

/* A single page for the eye: every set per locale as a strip of thumbnails; paths are relative so the folder travels. */
function writePreview(items, warnings) {
  const groups = new Map();
  for (const it of items) {
    const k = `${it.locale} · ${it.set}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(it);
  }
  const rel = (f) => relative(OUT, f).split("/").map(encodeURIComponent).join("/");
  let html = `<!doctype html><html><head><meta charset="utf-8"><title>Inborn store screenshots</title><style>
body{margin:0;background:${C.bg};color:${C.text};font:15px/1.5 -apple-system,"IBM Plex Sans",system-ui,sans-serif;padding:32px}
h1{font-size:22px;margin:0 0 6px}h2{font-size:15px;margin:36px 0 12px;color:${C.text2};font-weight:500;letter-spacing:.06em;text-transform:uppercase}
.strip{display:flex;gap:14px;overflow-x:auto;padding-bottom:10px}.strip figure{margin:0;flex:0 0 auto;width:220px}
.strip img{width:220px;border-radius:12px;box-shadow:0 0 0 1px ${C.border};display:block;background:${C.s1}}
.strip.wide img{width:440px}.strip.wide figure{width:440px}
figcaption{font-size:12px;color:${C.text3};margin-top:6px;white-space:normal}
.warn{background:${C.s1};border:1px solid ${C.border};border-radius:10px;padding:12px 16px;margin:18px 0;color:${C.accent};font-family:"IBM Plex Mono",ui-monospace,monospace;font-size:13px}
a{color:${C.text2}}</style></head><body>
<h1>Inborn · store screenshots</h1><div style="color:${C.text3}">generated ${new Date().toISOString().slice(0, 16).replace("T", " ")} · raw captures from the dev builds (simulator + emulator) · copy from docs/store/listing.*.json</div>`;
  if (warnings.length) html += `<div class="warn">${warnings.map(esc).join("<br>")}</div>`;
  for (const [k, list] of groups) {
    const wide = list.some((i) => i.set.includes("feature") || i.set.includes("ipad") || i.set.includes("tablet"));
    html += `<h2>${esc(k)}</h2><div class="strip${wide ? " wide" : ""}">${list.map((i) => `<figure><a href="${rel(i.file)}"><img src="${rel(i.file)}" loading="lazy"></a><figcaption>${esc(i.label)}</figcaption></figure>`).join("")}</div>`;
  }
  html += "</body></html>";
  writeFileSync(join(OUT, "preview.html"), html);
  console.log(`preview → ${relative(ROOT, join(OUT, "preview.html"))}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
