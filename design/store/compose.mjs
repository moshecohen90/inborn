#!/usr/bin/env node
/**
 * Composes the store screenshot sets from the raw captures (design/store/raw, made by capture.mjs) and the approved copy in
 * docs/store/listing.<locale>.json → design/store/out/<store>/<locale>/<set>/NN-<screen>.png + out/preview.html.
 *
 *   node design/store/compose.mjs [--locale=en,ja,...] [--listings=<dir>] [--style=kuzari|paranoid|light] [--out=<dir>] [--screens=chat,proof,...] [--set=apple-6.9,apple-6.5,apple-ipad-13,play-phone,play-tablet-7,play-tablet-10,play-feature]
 *
 * FARADAY frame (spec §9): graphite ground, IBM Plex Sans headline / Plex Mono eyebrow, the sealed green only as the seal glyph,
 * a hairline bezel around the real capture. One type scale per set (the engine's uniformHeadline rule). Fonts: design/store/fonts.
 * --style renders one of the design-demo directions instead (styles.mjs) and writes out/ai-art-manifest.json.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { findChromium, loadPlaywright } from "./chromium.mjs";
import * as styles from "./styles.mjs";

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dir, "../..");
const RAW = join(__dir, "raw");
const OUT = resolve(process.argv.find((a) => a.startsWith("--out="))?.slice(6) ?? join(__dir, "out"));
const FONTS = join(__dir, "fonts");
const arg0 = (k, d) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split("=").slice(1).join("=") ?? d;
/* the panel order; listing.screenshots[i] is panel i */
const SCREENS = arg0("screens", "chat,proof,documents,paywall,vault,lock").split(",").filter(Boolean);

const arg = (k, d) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split("=").slice(1).join("=") ?? d;
const LOCALES = arg("locale", "en,ja,de,fr,es,pt-BR,ko,zh-Hant").split(",").filter(Boolean);
const APP_ICON = join(ROOT, "apps/mobile/assets/icon.png");

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
const STYLE = arg("style", "");
if (STYLE && !styles.STYLES.includes(STYLE)) throw new Error(`--style: one of ${styles.STYLES.join(", ")}`);
const ONLY = arg("set", Object.keys(SETS).join(",")).split(",").filter(Boolean);

const C = { bg: "#0A0D11", s1: "#12161B", s2: "#181D23", border: "#1F262E", text: "#EEF2F5", text2: "#9AA6B2", text3: "#667380", accent: "#F0B35B", sealed: "#3ECF8E" };
/* --listings=<dir>: copy from another checkout (a copy branch not yet merged into this one) */
const LISTINGS = resolve(arg("listings", join(ROOT, "docs/store")));
const listing = (locale) => JSON.parse(readFileSync(join(LISTINGS, `listing.${locale}.json`), "utf8"));
const fileUrl = (p) => pathToFileURL(p).href;
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const fontCss = () => `
@font-face{font-family:"Plex";src:url("${fileUrl(join(FONTS, "IBMPlexSans-Regular.ttf"))}");font-weight:400}
@font-face{font-family:"Plex";src:url("${fileUrl(join(FONTS, "IBMPlexSans-Medium.ttf"))}");font-weight:500}
@font-face{font-family:"Plex";src:url("${fileUrl(join(FONTS, "IBMPlexSans-SemiBold.ttf"))}");font-weight:600}
@font-face{font-family:"PlexJP";src:url("${fileUrl(join(FONTS, "IBMPlexSansJP-Regular.ttf"))}");font-weight:400}
@font-face{font-family:"PlexJP";src:url("${fileUrl(join(FONTS, "IBMPlexSansJP-Medium.ttf"))}");font-weight:500}
@font-face{font-family:"PlexJP";src:url("${fileUrl(join(FONTS, "IBMPlexSansJP-SemiBold.ttf"))}");font-weight:600}
${["JP", "KR", "TC"].map((k) => [400, 500, 600].map((w) => `@font-face{font-family:"Plex${k}";src:url("${fileUrl(join(FONTS, `IBMPlexSans${k}-${{ 400: "Regular", 500: "Medium", 600: "SemiBold" }[w]}.ttf`))}");font-weight:${w}}`).join("\n")).join("\n")}
@font-face{font-family:"PlexMono";src:url("${fileUrl(join(FONTS, "IBMPlexMono-Medium.ttf"))}");font-weight:500}
@font-face{font-family:"PlexMono";src:url("${fileUrl(join(FONTS, "IBMPlexMono-Regular.ttf"))}");font-weight:400}`;

/* Plex Sans JP / KR / TC carry their own Latin, so a CJK panel is set in one family; everything else in Plex Sans. */
const CJK = { ja: "PlexJP", ko: "PlexKR", "zh-Hant": "PlexTC" };
const familyFor = (locale) => (CJK[locale] ? `"${CJK[locale]}","Plex"` : '"Plex","PlexJP"');
/* Korean breaks between words, Japanese and Chinese by the strict kinsoku rules, never inside a word in Latin scripts. */
/* Japanese and Chinese have no spaces, so a long sentence breaks mid-word; each sentence is kept whole while it fits the line */
const phrased = (locale, text) => (locale === "ja" || locale === "zh-Hant" ? text.split(/(?<=[。！？、，])/).map((p) => `<span style="display:inline-block">${esc(p)}</span>`).join("") : esc(text));
const breakCss = (locale) => (locale === "ko" ? "word-break:keep-all;" : locale === "ja" ? "line-break:strict;word-break:auto-phrase;" : locale === "zh-Hant" ? "line-break:strict;word-break:normal;" : "hyphens:none;");
/* The eyebrow is the app's own onboarding seal label in the panel's language. */
const sealLabel = (locale) => JSON.parse(readFileSync(join(ROOT, "packages/i18n/locales", `${locale}.json`), "utf8"))["onboarding.sealed.label"];

/* The seal: a closed ring, the one place the green lives (spec §9.5). */
const seal = (size) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 28 28" fill="none"><circle cx="14" cy="14" r="11" stroke="${C.sealed}" stroke-width="2.4"/><circle cx="14" cy="14" r="3" fill="${C.sealed}"/></svg>`;

/* One portrait panel: eyebrow + headline + subline, then the device with its bottom running off the panel. */
function panelHtml({ set, locale, headline, subline, image, imgW, imgH }) {
  const { w, h, tablet } = set;
  const family = familyFor(locale);
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
  /* a punch-hole Android phone has far tighter corners than an iPhone; the iPhone radius would cut the clock */
  const radius = Math.round(screenW * (tablet ? 0.045 : set.hole ? 0.07 : 0.128));
  const gap = Math.round(90 * u);
  return `<!doctype html><html><head><meta charset="utf-8"><style>${fontCss()}
html,body{margin:0;width:${w}px;height:${h}px;overflow:hidden;background:${C.bg}}
.panel{position:relative;width:${w}px;height:${h}px;overflow:hidden;font-family:${family};color:${C.text};
  background:radial-gradient(90% 34% at 50% -6%, rgba(240,179,91,.10) 0%, rgba(240,179,91,0) 60%), linear-gradient(180deg,#0B0F14 0%,${C.bg} 60%,#080B0E 100%)}
.copy{position:absolute;left:${padX}px;right:${padX}px;top:${top}px;text-align:center}
.eyebrow{display:inline-flex;align-items:center;gap:${Math.round(12 * u)}px;font-family:"PlexMono",${family};font-weight:500;font-size:${eyePx}px;letter-spacing:.08em;color:${C.sealed};text-transform:uppercase}
h1,p{${breakCss(locale)}}
h1{margin:${Math.round(34 * u)}px 0 0;font-weight:600;font-size:${headPx}px;line-height:1.12;letter-spacing:-0.02em;text-wrap:balance}
p{margin:${Math.round(26 * u)}px 0 0;font-weight:400;font-size:${subPx}px;line-height:1.3;color:${C.text2};text-wrap:balance}
.device{position:absolute;left:50%;transform:translateX(-50%);width:${devW}px;top:var(--dev-top);border-radius:${radius + bezel}px;background:${C.s2};box-shadow:0 0 0 1px ${C.border},0 60px 140px rgba(0,0,0,.6);padding:${bezel}px}
.screen{display:block;width:${screenW}px;height:${screenH}px;border-radius:${radius}px;object-fit:cover;background:${C.bg}}
.island{position:absolute;left:50%;transform:translateX(-50%);top:${bezel + Math.round(screenW * 0.028)}px;width:${Math.round(screenW * 0.29)}px;height:${Math.round(screenW * 0.084)}px;border-radius:999px;background:#000}
.hole{position:absolute;left:50%;transform:translateX(-50%);top:${bezel + Math.round(screenW * 0.022)}px;width:${Math.round(screenW * 0.05)}px;height:${Math.round(screenW * 0.05)}px;border-radius:50%;background:#000}
</style></head><body><div class="panel">
<div class="copy" id="copy"><div class="eyebrow">${seal(Math.round(eyePx * 1.1))}<span>${esc(sealLabel(locale))}</span></div><h1 id="h">${phrased(locale, headline)}</h1><p id="s">${phrased(locale, subline)}</p></div>
<div class="device" id="dev"><img class="screen" src="${fileUrl(image)}">${set.island ? '<div class="island"></div>' : ""}${set.hole ? '<div class="hole"></div>' : ""}</div>
</div><script>
  /* measured once the Plex faces are in: a fallback font is shorter, and the device would then cover the subline */
  document.fonts.ready.then(()=>{
  /* the listing copy is fixed, so a headline past two lines, or a CJK sentence split across lines, steps its size down (to 80% at most) */
  const hh=document.getElementById('h');
  const tooTall=(px)=>hh.offsetHeight>px*1.12*2.5||[...hh.children].some((c)=>c.offsetHeight>px*1.12*1.5);
  for(let px=${headPx};tooTall(px)&&px>${headPx}*0.8;px=Math.round(px*0.96))hh.style.fontSize=Math.round(px*0.96)+'px';
  const copy=document.getElementById('copy');const dev=document.getElementById('dev');
  const devTop=copy.offsetTop+copy.offsetHeight+${gap};
  dev.style.setProperty('--dev-top',devTop+'px');
  ${set.store === "play" ? `/* Play's panels are shorter than the 20:9 capture: the whole screen is shown, scaled to the room under the copy */
  const room=${h}-devTop-${Math.round(60 * u)}-2*${bezel};
  if(room<${screenH}){const k=room/${screenH},img=dev.querySelector('.screen');img.style.width=Math.round(${screenW}*k)+'px';img.style.height=room+'px';img.style.borderRadius=Math.round(${radius}*k)+'px';dev.style.width=(Math.round(${screenW}*k)+2*${bezel})+'px';dev.style.borderRadius=(Math.round(${radius}*k)+${bezel})+'px';}` : ""}
  const h=document.getElementById('h'),s=document.getElementById('s');
  const c=copy.getBoundingClientRect();
  window.__lines={h:Math.round(h.offsetHeight/(parseFloat(getComputedStyle(h).fontSize)*1.12)),s:Math.round(s.offsetHeight/(${subPx}*1.3)),overflow:h.scrollWidth>h.clientWidth+1||s.scrollWidth>s.clientWidth+1||c.left<0||c.right>${w}};
  });
</script></body></html>`;
}

/* Play feature graphic 1024×500: icon, wordmark, the short description as the line. */
function featureHtml(locale, text) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>${fontCss()}
html,body{margin:0;width:1024px;height:500px;overflow:hidden;background:${C.bg}}
.g{position:relative;width:1024px;height:500px;display:flex;align-items:center;gap:56px;padding:0 84px;box-sizing:border-box;font-family:${familyFor(locale)};color:${C.text};
  background:radial-gradient(60% 90% at 18% 50%, rgba(240,179,91,.12) 0%, rgba(240,179,91,0) 70%), linear-gradient(90deg,#0B0F14 0%,${C.bg} 100%)}
.g>div{flex:1;min-width:0}
img{width:236px;height:236px;border-radius:52px;box-shadow:0 0 0 1px ${C.border},0 30px 70px rgba(0,0,0,.55)}
.eyebrow{display:flex;align-items:center;gap:10px;font-family:"PlexMono",${familyFor(locale)};font-weight:500;font-size:19px;letter-spacing:.08em;color:${C.sealed}}
h1{margin:14px 0 0;font-size:88px;line-height:1;font-weight:600;letter-spacing:-0.03em}
p{margin:22px 0 0;font-size:${locale === "ja" || locale === "zh-Hant" ? 28 : 31}px;line-height:1.3;color:${C.text2};max-width:600px;text-wrap:balance;${breakCss(locale)}}
</style></head><body><div class="g"><img src="${fileUrl(APP_ICON)}"><div><div class="eyebrow">${seal(22)}<span>${esc(sealLabel(locale))}</span></div><h1>Inborn</h1><p id="t">${phrased(locale, text)}</p></div></div></body></html>`;
}

async function main() {
  const pw = loadPlaywright();
  if (!pw) throw new Error("playwright-core not found (set PLAYWRIGHT_CORE_DIR)");
  if (STYLE) await styles.ensureFonts();
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
      /* the upload scripts send every NN-*.png in the folder, so panels of an older order must not linger */
      if (!set.feature) for (const f of readdirSync(dir)) if (/^\d\d-.+\.png$/.test(f)) rmSync(join(dir, f));
      await page.setViewportSize({ width: set.w, height: set.h });
      if (set.feature) {
        const text = copy.google.short_description;
        writeFileSync(tmp, STYLE ? styles.feature(STYLE, { locale, text, sealLabel: sealLabel(locale), family: familyFor(locale), fontCss, phrased, breakCss, icon: APP_ICON }) : featureHtml(locale, text));
        await page.goto(fileUrl(tmp));
        await page.evaluate(() => document.fonts.ready);
        if (await page.evaluate(() => document.querySelector(".g").scrollWidth > 1024 || document.querySelector(".g").scrollHeight > 500)) warnings.push(`${locale}/${name}: the feature graphic copy runs outside 1024×500`);
        const file = join(dir, "feature-graphic.png");
        await page.screenshot({ path: file });
        preview.push({ locale, set: name, file, label: "feature graphic" });
        continue;
      }
      for (const [i, screen] of SCREENS.entries()) {
        let platform = set.src;
        let src = join(RAW, platform, locale, `${screen}.png`);
        if (!existsSync(src) && set.fallback) {
          platform = set.fallback;
          src = join(RAW, platform, locale, `${screen}.png`);
          warnings.push(`${locale}/${name}/${screen}: ${set.src === "ipad" ? "iPhone capture on the iPad canvas" : "phone capture on the tablet canvas"}`);
        }
        if (!existsSync(src)) {
          warnings.push(`${locale}/${name}/${screen}: no capture at ${relative(ROOT, src)}`);
          continue;
        }
        /* Android-only wording (e.g. "no internet permission") lives in sublinePlay and never reaches an Apple image */
        const { headline, accent } = copy.screenshots[i];
        const subline = (set.store === "play" && copy.screenshots[i].sublinePlay) || copy.screenshots[i].subline;
        const dims = pngSize(src);
        writeFileSync(
          tmp,
          STYLE
            ? styles.panel(STYLE, { set, locale, i, screen, headline, subline, accent, image: src, imgW: dims.w, imgH: dims.h, src: platform, sealLabel: sealLabel(locale), family: familyFor(locale), fontCss, phrased, breakCss })
            : panelHtml({ set, locale, headline, subline, image: src, imgW: dims.w, imgH: dims.h }),
        );
        await page.goto(fileUrl(tmp));
        await page.evaluate(() => document.fonts.ready);
        const lines = await (await page.waitForFunction(() => globalThis.__lines)).jsonValue();
        if (lines.h > 2) warnings.push(`${locale}/${name}/${screen}: headline wraps to ${lines.h} lines → shorten the copy`);
        if (lines.s > 2) warnings.push(`${locale}/${name}/${screen}: subline wraps to ${lines.s} lines → shorten the copy`);
        if (lines.overflow) warnings.push(`${locale}/${name}/${screen}: copy runs outside the panel`);
        for (const w of lines.warn ?? []) warnings.push(`${locale}/${name}/${screen}: ${w}`);
        const file = join(dir, `${String(i + 1).padStart(2, "0")}-${screen}.png`);
        await page.screenshot({ path: file });
        preview.push({ locale, set: name, file, label: headline, screen });
      }
      console.log(`${locale} ${name} → ${relative(ROOT, dir)}`);
    }
  }
  /* Play hi-res icon: the launcher artwork at 512×512, 32-bit PNG */
  if (ONLY.includes("play-feature")) {
    await page.setViewportSize({ width: 512, height: 512 });
    writeFileSync(tmp, `<!doctype html><html><body style="margin:0;width:512px;height:512px;overflow:hidden"><img src="${fileUrl(APP_ICON)}" style="display:block;width:512px;height:512px"></body></html>`);
    await page.goto(fileUrl(tmp));
    const icon = join(OUT, "play", "icon-512.png");
    mkdirSync(dirname(icon), { recursive: true });
    await page.screenshot({ path: icon, omitBackground: false });
    preview.push({ locale: "all", set: "play-icon", file: icon, label: "Play hi-res icon 512×512" });
  }
  await browser.close();
  try {
    if (readdirSync(OUT).includes(".panel.html")) (await import("node:fs")).rmSync(tmp);
  } catch {
    /* fine */
  }
  writePreview(preview, warnings);
  if (STYLE) writeArtManifest(preview);
  for (const w of warnings) console.warn("WARN", w);
}

/* Play asks whether a listing image carries AI-generated content; the screens are real captures, only the hero art is generated */
function writeArtManifest(items) {
  const art = styles.GENERATED_ART[STYLE];
  const files = items
    .filter((it) => it.set !== "play-icon")
    .map((it) => ({ file: relative(OUT, it.file), generatedArt: it.screen ? art.panels === "all" : art.feature }));
  const file = join(OUT, "ai-art-manifest.json");
  writeFileSync(file, `${JSON.stringify({ style: STYLE, art: STYLE === "kuzari" ? "design/store/art/hero-<screen>.png, generated with Gemini (gemini-3-pro-image-preview), prompts in design/store/art/README.md" : "none", files }, null, 2)}\n`);
  console.log(`AI-art manifest → ${relative(ROOT, file)} (${files.filter((f) => f.generatedArt).length} of ${files.length} files carry generated art)`);
}

function pngSize(file) {
  const b = readFileSync(file);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

/* A single page for the eye: every set per locale as a strip of thumbnails; paths are relative so the folder travels. */
function writePreview(items, warnings) {
  const groups = new Map();
  const order = Object.keys(SETS).concat("play-icon");
  items = [...items].sort((a, b) => order.indexOf(a.set) - order.indexOf(b.set) || LOCALES.indexOf(a.locale) - LOCALES.indexOf(b.locale));
  for (const it of items) {
    const k = `${it.set} · ${it.locale}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(it);
  }
  const rel = (f) => relative(OUT, f).split("/").map(encodeURIComponent).join("/");
  let html = `<!doctype html><html><head><meta charset="utf-8"><title>Inborn store screenshots</title><style>
body{margin:0;background:${C.bg};color:${C.text};font:15px/1.5 -apple-system,"IBM Plex Sans",system-ui,sans-serif;padding:32px}
h1{font-size:22px;margin:0 0 6px}h2{font-size:15px;margin:36px 0 12px;color:${C.text2};font-weight:500;letter-spacing:.06em;text-transform:uppercase}
h2.set{font-size:18px;color:${C.text};margin:56px 0 4px;padding-top:20px;border-top:1px solid ${C.border}}h3{font-size:13px;margin:18px 0 8px;color:${C.text3};font-weight:500}
.strip{display:flex;gap:14px;overflow-x:auto;padding-bottom:10px}.strip figure{margin:0;flex:0 0 auto;width:220px}
.strip img{width:220px;border-radius:12px;box-shadow:0 0 0 1px ${C.border};display:block;background:${C.s1}}
.strip.wide img{width:440px}.strip.wide figure{width:440px}
figcaption{font-size:12px;color:${C.text3};margin-top:6px;white-space:normal}
.warn{background:${C.s1};border:1px solid ${C.border};border-radius:10px;padding:12px 16px;margin:18px 0;color:${C.accent};font-family:"IBM Plex Mono",ui-monospace,monospace;font-size:13px}
a{color:${C.text2}}</style></head><body>
<h1>Inborn · store screenshots</h1><div style="color:${C.text3}">generated ${new Date().toISOString().slice(0, 16).replace("T", " ")} · raw captures from the QA builds (simulators + emulator, driven by the in-app QA bridge) · copy from docs/store/listing.*.json</div>`;
  if (warnings.length) html += `<div class="warn">${warnings.map(esc).join("<br>")}</div>`;
  let lastSet = null;
  for (const list of groups.values()) {
    const set = list[0].set;
    if (set !== lastSet) {
      const dims = SETS[set] ? `${SETS[set].w}×${SETS[set].h}` : "512×512";
      html += `<h2 class="set">${esc(set)} · ${dims}</h2>`;
      lastSet = set;
    }
    const wide = list.some((i) => i.set.includes("feature") || i.set.includes("ipad") || i.set.includes("tablet"));
    html += `<h3>${esc(list[0].locale)}</h3><div class="strip${wide ? " wide" : ""}">${list.map((i) => `<figure><a href="${rel(i.file)}"><img src="${rel(i.file)}" loading="lazy"></a><figcaption>${esc(i.label)}</figcaption></figure>`).join("")}</div>`;
  }
  html += "</body></html>";
  writeFileSync(join(OUT, "preview.html"), html);
  console.log(`preview → ${relative(ROOT, join(OUT, "preview.html"))}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
