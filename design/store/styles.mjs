/**
 * The three store-screenshot directions from the design demo (out/demo-inborn.html), for compose.mjs --style=<name>:
 *   kuzari   — generated hero art behind every panel (art/hero-<screen>.png), a two-line headline with one green word, the device
 *              filling the rest of the panel so the screen reads at store size
 *   paranoid — pure black, one thin sealed ring, a proof-chip row, the screen cropped to the part that matters
 *   light    — warm paper, a big friendly headline, one flat icon per panel, the screen cropped to the answer
 * Each panel sets window.__lines like compose's own frame, so the same fit checks run.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { inflateSync } from "node:zlib";

const __dir = dirname(fileURLToPath(import.meta.url));
const FONTS = join(__dir, "fonts");
const ART = join(__dir, "art");
const url = (p) => pathToFileURL(p).href;
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export const STYLES = ["kuzari", "paranoid", "light"];
/* which outputs carry generated art (Play's "AI-generated" declaration); the screens themselves are always real captures */
export const GENERATED_ART = { kuzari: { panels: "all", feature: true }, paranoid: { panels: "none", feature: false }, light: { panels: "none", feature: false } };

const G = "#3ECF8E";
/* Plex Sans 700 and 300 are not among the TTFs compose uses; fetched once from @fontsource (OFL) */
const EXTRA_FONTS = { "IBMPlexSans-Bold.woff2": "ibm-plex-sans-latin-700-normal.woff2", "IBMPlexSans-Light.woff2": "ibm-plex-sans-latin-300-normal.woff2" };
export async function ensureFonts() {
  for (const [file, src] of Object.entries(EXTRA_FONTS)) {
    if (existsSync(join(FONTS, file))) continue;
    const res = await fetch(`https://cdn.jsdelivr.net/npm/@fontsource/ibm-plex-sans/files/${src}`);
    if (!res.ok) throw new Error(`font ${src}: ${res.status}`);
    mkdirSync(FONTS, { recursive: true });
    writeFileSync(join(FONTS, file), Buffer.from(await res.arrayBuffer()));
  }
}
const extraFontCss = () =>
  `@font-face{font-family:"Plex";src:url("${url(join(FONTS, "IBMPlexSans-Bold.woff2"))}");font-weight:700}@font-face{font-family:"Plex";src:url("${url(join(FONTS, "IBMPlexSans-Light.woff2"))}");font-weight:300}`;

/* the one word the eye lands on, per locale and screen, taken verbatim from the approved headline; a listing entry's own
   `accent` wins */
const ACCENT = {
  en: { chat: "airplane", proof: "Verify", documents: "Offline", paywall: "once", vault: "fits", lock: "Wipe" },
  ja: { chat: "機内モード", proof: "確かめて", documents: "オフライン", paywall: "買い切り", vault: "モデル", lock: "消去" },
  de: { chat: "Flugmodus", proof: "Prüf", documents: "Offline", paywall: "Einmal", vault: "Modell", lock: "Löschen" },
  fr: { chat: "avion", proof: "Vérifiez", documents: "Hors ligne", paywall: "une fois", vault: "adapté", lock: "Effacez" },
  es: { chat: "avión", proof: "Compruébalo", documents: "Sin conexión", paywall: "una vez", vault: "modelo", lock: "Bórralo" },
  "pt-BR": { chat: "avião", proof: "Verifique", documents: "Offline", paywall: "uma vez", vault: "ideal", lock: "Apague" },
  ko: { chat: "비행기 모드", proof: "없습니다", documents: "오프라인", paywall: "한 번", vault: "모델", lock: "지우세요" },
  "zh-Hant": { chat: "飛航模式", proof: "驗證", documents: "離線", paywall: "買一次", vault: "模型", lock: "清乾淨" },
};
/* wraps the accent in the already-phrased headline HTML; a word the copy no longer contains just stays plain */
const accented = (html, ctx, cls, inner = "") => {
  const word = esc(ctx.accent ?? ACCENT[ctx.locale]?.[ctx.screen] ?? "");
  const at = word ? html.indexOf(word) : -1;
  return at < 0 ? html : `${html.slice(0, at)}<span class="${cls}">${word}${inner}</span>${html.slice(at + word.length)}`;
};

/* ---------- reading the capture: status-bar colour and where the content starts ---------- */
const pngCache = new Map();
function png(file) {
  if (pngCache.has(file)) return pngCache.get(file);
  const b = readFileSync(file);
  const w = b.readUInt32BE(16), h = b.readUInt32BE(20), depth = b[24], type = b[25];
  if (depth !== 8 || (type !== 2 && type !== 6) || b[28] !== 0) throw new Error(`${file}: only 8-bit RGB/RGBA non-interlaced PNGs`);
  const bpp = type === 6 ? 4 : 3;
  const idat = [];
  for (let o = 8; o < b.length; ) {
    const len = b.readUInt32BE(o), kind = b.toString("ascii", o + 4, o + 8);
    if (kind === "IDAT") idat.push(b.subarray(o + 8, o + 8 + len));
    o += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat)), stride = w * bpp, px = Buffer.alloc(h * stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], src = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)), row = px.subarray(y * stride, (y + 1) * stride), prev = y ? px.subarray((y - 1) * stride, y * stride) : null;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? row[x - bpp] : 0, up = prev ? prev[x] : 0, c = prev && x >= bpp ? prev[x - bpp] : 0;
      const p = a + up - c, pa = Math.abs(p - a), pb = Math.abs(p - up), pc = Math.abs(p - c);
      row[x] = (src[x] + [0, a, up, (a + up) >> 1, pa <= pb && pa <= pc ? a : pb <= pc ? up : c][f]) & 255;
    }
  }
  const img = { w, h, at: (x, y) => [0, 1, 2].map((k) => px[(Math.round(y) * w + Math.round(x)) * bpp + k]) };
  pngCache.set(file, img);
  return img;
}
const hex = (rgb) => `#${rgb.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
/* first row under the header that is not empty background: a chat starts its conversation there */
function contentTop(img, from, to) {
  const bg = img.at(img.w * 0.5, from);
  for (let y = Math.round(from); y < to; y += 4)
    for (let x = img.w * 0.03; x < img.w * 0.97; x += 6) if (img.at(x, y).some((v, k) => Math.abs(v - bg[k]) > 14)) return y;
  return from;
}

/* The simulator draws Wi-Fi even with every radio off; that glyph is painted over with the airplane one. Android's demo mode
   already shows the airplane. Capture pixels: [x, y, w, h] of the patch and the glyph size. */
const WIFI = { ios: { box: [976, 66, 70, 60], glyph: 46 }, ipad: { box: [1912, 14, 42, 36], glyph: 30 } };
const PLANE = "M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5z";
function airplanePatch(src, image, s) {
  const p = WIFI[src];
  if (!p) return "";
  const [x, y, w, h] = p.box, col = hex(png(image).at(x - 8, y + h / 2));
  return `<div style="position:absolute;left:${x * s}px;top:${y * s}px;width:${w * s}px;height:${h * s}px;background:${col}"></div><svg viewBox="0 0 24 24" style="position:absolute;left:${(x + (w - p.glyph) / 2) * s}px;top:${(y + (h - p.glyph) / 2) * s}px;width:${p.glyph * s}px;height:${p.glyph * s}px;transform:rotate(90deg)"><path fill="#fff" d="${PLANE}"/></svg>`;
}

/* The part of each phone screen that matters, as fractions of the capture height (full width). `gap` starts at the first
   content under the header instead, for the chats whose upper part can be empty. Tablets show the whole screen. */
const REGION = {
  ios: { chat: { gap: 0.09, end: 0.927 }, proof: [0.061, 0.73], documents: { gap: 0.09, end: 0.997 }, paywall: [0.15, 0.851], vault: [0.237, 0.718], lock: [0.384, 0.969] },
  android: { chat: { gap: 0.09, end: 0.91 }, proof: [0.035, 0.8], documents: { gap: 0.09, end: 0.97 }, paywall: [0.24, 0.96], vault: [0.2, 0.75], lock: [0.36, 0.96] },
};
function region(ctx) {
  const { src, screen, image, imgW, imgH, set } = ctx;
  if (set.tablet || !REGION[src]) return [0, 0, imgW, imgH];
  const r = REGION[src][screen];
  if (Array.isArray(r)) return [0, Math.round(r[0] * imgH), imgW, Math.round(r[1] * imgH)];
  const top = contentTop(png(image), r.gap * imgH, r.end * imgH);
  return [0, Math.max(Math.round(r.gap * imgH), top - Math.round(0.02 * imgH)), imgW, Math.round(r.end * imgH)];
}

const ICON = {
  plane: `<path fill="#fff" d="${PLANE}"/>`,
  shield: `<path fill="#fff" d="M12 2 4 5.2v6.1c0 5 3.4 9.4 8 10.7 4.6-1.3 8-5.7 8-10.7V5.2z"/><path d="m8.4 12.2 2.5 2.5 4.8-5" stroke="var(--ic)" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`,
  doc: `<path fill="#fff" d="M6 2h8.5L20 7.5V22H6z"/><path d="M9 12h8M9 15.5h8M9 19h5" stroke="var(--ic)" stroke-width="1.6" stroke-linecap="round"/>`,
  coin: `<circle cx="12" cy="12" r="10" fill="#fff"/><circle cx="12" cy="12" r="7" fill="none" stroke="var(--ic)" stroke-opacity=".55" stroke-width="1.4"/><path d="M12 8v8M10 10.2h3.2a1.4 1.4 0 0 1 0 2.8h-2.4a1.4 1.4 0 0 0 0 2.8H14" stroke="var(--ic)" stroke-width="1.5" fill="none" stroke-linecap="round"/>`,
  chip: `<rect x="5" y="5" width="14" height="14" rx="2.5" fill="#fff"/><rect x="9" y="9" width="6" height="6" rx="1" fill="var(--ic)" fill-opacity=".6"/><path d="M9 2v3M12 2v3M15 2v3M9 19v3M12 19v3M15 19v3M2 9h3M2 12h3M2 15h3M19 9h3M19 12h3M19 15h3" stroke="#fff" stroke-width="1.6" stroke-linecap="round"/>`,
  lock: `<path d="M7.5 10V7.5a4.5 4.5 0 0 1 9 0V10" stroke="#fff" stroke-width="2.2" fill="none"/><rect x="4.5" y="10" width="15" height="12" rx="2.5" fill="#fff"/><circle cx="12" cy="15.4" r="1.6" fill="var(--ic)"/>`,
};
const ICONS = { chat: "plane", proof: "shield", documents: "doc", photo: "doc", paywall: "coin", vault: "chip", lock: "lock" };
const seal = (s, c = G) => `<svg width="${s}" height="${s}" viewBox="0 0 28 28" fill="none"><circle cx="14" cy="14" r="11" stroke="${c}" stroke-width="2.4"/><circle cx="14" cy="14" r="3" fill="${c}"/></svg>`;
/* Apple's sets say what the proof screen shows on iOS; "no internet permission" is an Android manifest fact */
const chips = (store) => ["OUT <b>0 B</b>", "IN <b>0 B</b>", store === "apple" ? "<b>0</b> CONNECTIONS" : "NO INTERNET PERMISSION"];
const cloudOff = (s) => `<svg viewBox="0 0 32 32" width="${s}" height="${s}" fill="none"><path d="M9 24h14a5.5 5.5 0 0 0 .7-10.95A8 8 0 0 0 8.3 12.4 5.8 5.8 0 0 0 9 24z" stroke="#8C98A4" stroke-width="2"/><path d="M5 4l22 24" stroke="#FF5A4E" stroke-width="2.6" stroke-linecap="round"/></svg>`;

/* a full device frame around the capture */
function device(ctx, dw, extra, fit = false) {
  const { set, image, imgW, imgH, src } = ctx;
  const bz = Math.round(dw * (set.tablet && src === "ipad" ? 0.018 : 0.022)), sw = dw - 2 * bz, s = sw / imgW, sh = Math.round(imgH * s);
  const r = Math.round(sw * (src === "ipad" ? 0.045 : src === "android" ? 0.07 : 0.128));
  const notch = src === "ios" ? `<div style="position:absolute;left:50%;transform:translateX(-50%);top:${bz + Math.round(sw * 0.028)}px;width:${Math.round(sw * 0.29)}px;height:${Math.round(sw * 0.084)}px;border-radius:99px;background:#000"></div>` : src === "android" ? `<div style="position:absolute;left:50%;transform:translateX(-50%);top:${bz + Math.round(sw * 0.022)}px;width:${Math.round(sw * 0.05)}px;height:${Math.round(sw * 0.05)}px;border-radius:50%;background:#000"></div>` : "";
  return `<div class="device" id="dev"${fit ? ' data-fit="1"' : ""} style="width:${dw}px;border-radius:${r + bz}px;padding:${bz}px;${extra}"><div style="position:relative;width:${sw}px;height:${sh}px;border-radius:${r}px;overflow:hidden"><img src="${url(image)}" style="display:block;width:${sw}px;height:${sh}px">${airplanePatch(src, image, s)}</div>${notch}</div>`;
}
/* the region that matters, sized by the layout script into the room under the copy */
function crop(ctx, cls) {
  const [x0, y0, x1, y1] = region(ctx);
  return `<div class="${cls}" id="card" data-w="${x1 - x0}" data-h="${y1 - y0}"><div class="win" style="position:relative"><div id="cimg" data-x0="${x0}" data-y0="${y0}" data-iw="${ctx.imgW}" style="position:relative;transform-origin:0 0;width:${ctx.imgW}px;height:${ctx.imgH}px"><img src="${url(ctx.image)}" style="display:block;width:${ctx.imgW}px;height:${ctx.imgH}px">${y0 < 140 ? airplanePatch(ctx.src, ctx.image, 1) : ""}</div></div></div>`;
}
/* headline to two lines at most (down to 68%), the card into the room left, then compose's __lines contract */
const layout = ({ w, h, maxW, gap, bottom, lh, devTop = 0 }) => `<script>
document.fonts.ready.then(()=>{
  const h=document.getElementById('h'),s=document.getElementById('s'),copy=document.getElementById('copy');
  const fs0=parseFloat(getComputedStyle(h).fontSize);let fs=fs0;
  const lines=()=>Math.round(h.offsetHeight/(fs*${lh}));
  const split=()=>[...h.querySelectorAll('span[style*=inline-block]')].some((c)=>c.offsetHeight>fs*${lh}*1.5);
  while((lines()>2||split())&&fs>fs0*0.68){fs=Math.round(fs*0.96);h.style.fontSize=fs+'px'}
  const warn=[];
  const card=document.getElementById('card');
  if(card){const cw=+card.dataset.w,ch=+card.dataset.h,top=copy.getBoundingClientRect().bottom+${gap},avail=${h}-${bottom}-top;
    const k=Math.min(${maxW}/cw,avail/ch),im=document.getElementById('cimg');
    im.style.transform='scale('+k+')';im.style.marginLeft=(-im.dataset.x0*k)+'px';im.style.marginTop=(-im.dataset.y0*k)+'px';
    const win=card.querySelector('.win');win.style.width=(cw*k)+'px';win.style.height=(ch*k)+'px';
    card.style.top=(top+Math.max(0,(avail-ch*k)/2))+'px';card.style.left=((${w}-card.offsetWidth)/2)+'px';
    if(k<0.5)warn.push('screen shown at '+Math.round(k*100)+'%')}
  const dev=document.getElementById('dev');
  if(dev&&dev.dataset.fit){/* the device takes all the room under the copy, as large as the width allows */
    const top=Math.max(copy.getBoundingClientRect().bottom+${gap},${devTop}),room=${h}-${bottom}-top,k=Math.min(room/dev.offsetHeight,${maxW}/dev.offsetWidth);
    dev.style.top=top+'px';dev.style.transform='translateX(-50%) scale('+k+')';
    if(dev.offsetHeight*k<${h}*0.7)warn.push('device '+Math.round(dev.offsetHeight*k/${h}*100)+'% of the panel height')}
  if(dev&&dev.getBoundingClientRect().top<copy.getBoundingClientRect().bottom-${Math.round(h * 0.01)})warn.push('device covers the copy');
  const c=copy.getBoundingClientRect();
  window.__lines={h:lines(),s:Math.round(s.offsetHeight/parseFloat(getComputedStyle(s).lineHeight)),overflow:h.scrollWidth>h.clientWidth+1||s.scrollWidth>s.clientWidth+1||c.left<0||c.right>${w}||c.bottom>${h},warn};
});
</script>`;

/* ---------- panels ---------- */
export function panel(style, ctx) {
  const { set, locale, i } = ctx;
  const { w, h } = set;
  /* one type scale per set: the 6.9" panel's sizes, bounded by the shorter side of the panel */
  const U = set.tablet ? (h / 2868) * 1.12 : Math.min(w / 1320, h / 2868);
  const cjk = ["ja", "ko", "zh-Hant"].includes(locale);
  const head = ctx.phrased(locale, ctx.headline), sub = ctx.phrased(locale, ctx.subline);
  const base = `<!doctype html><html><head><meta charset="utf-8"><style>${ctx.fontCss()}${extraFontCss()}
html,body{margin:0;width:${w}px;height:${h}px;overflow:hidden}*{box-sizing:border-box}
h1,p{${ctx.breakCss(locale)}}
.device{position:absolute;background:linear-gradient(160deg,#2A313A,#12161B 40%,#0C0F13);box-shadow:0 0 0 ${Math.max(1, Math.round(2 * U))}px #2B323B inset,0 0 0 1px #000,0 ${Math.round(80 * U)}px ${Math.round(160 * U)}px rgba(0,0,0,.75)}
.win{overflow:hidden}`;
  const family = ctx.family;
  const copyW = set.tablet ? Math.round(w * 0.8) : w - Math.round(180 * U);

  if (style === "kuzari") {
    /* every device of a set starts at the same height: room for a two-line headline and a two-line subline */
    /* the art covers the panel with its subject between the copy and the device top, where it shows around the frame */
    const artH = Math.max(h * 1.15, (w * 1376) / 768), artW = (artH * 768) / 1376;
    const ax = (w - artW) / 2, ay = 0.3 * h - 0.65 * artH;
    const swash = `<svg class="sw" viewBox="0 0 300 24" preserveAspectRatio="none"><path d="M4 16 C 70 6, 160 4, 296 12" stroke="${G}" stroke-width="10" stroke-linecap="round" fill="none"/></svg>`;
    const dw = set.tablet ? Math.round(w * 0.8) : Math.round(w * 0.86);
    return `${base}
.art{position:absolute;inset:0;background:url(${url(join(ART, `hero-${ctx.screen}.png`))}) ${ax}px ${ay}px/${artW}px ${artH}px no-repeat,#07090B}
.fade{position:absolute;inset:0;background:linear-gradient(180deg,rgba(5,7,9,.95) 0%,rgba(5,7,9,.55) 13%,rgba(5,7,9,.05) 26%,rgba(5,7,9,.35) 60%,rgba(5,7,9,.85) 100%)}
#copy{position:absolute;left:${(w - copyW) / 2}px;width:${copyW}px;top:${Math.round(130 * U)}px;text-align:center;z-index:3;font-family:${family}}
h1{margin:0;font-weight:${cjk ? 600 : 700};font-size:${Math.round((cjk ? 100 : 112) * U)}px;line-height:1.1;letter-spacing:${cjk ? 0 : -0.025}em;color:#F3F6F8;text-wrap:balance;text-shadow:0 4px 40px rgba(0,0,0,.7)}
.acc{position:relative;color:${G};white-space:nowrap}
.sw{position:absolute;left:-3%;width:106%;bottom:-${Math.round(16 * U)}px;height:${Math.round(30 * U)}px}
p{margin:${Math.round(36 * U)}px 0 0;font-weight:400;font-size:${Math.round(54 * U)}px;line-height:1.3;color:#C3CCD4;text-wrap:balance;text-shadow:0 2px 20px rgba(0,0,0,.8)}
.device{transform-origin:50% 0}
</style></head><body><div class="art"></div><div class="fade"></div>
<div id="copy"><h1 id="h">${accented(head, ctx, "acc", swash)}</h1><p id="s">${sub}</p></div>
${device(ctx, dw, "left:50%;top:0;z-index:2", true)}
${layout({ w, h, maxW: set.tablet ? w * 0.86 : w * 0.88, gap: Math.round(56 * U), bottom: Math.round(36 * U), lh: 1.1, devTop: Math.round((130 + 112 * 1.1 * 2 + 36 + 54 * 1.3 * 2 + 56) * U) })}</body></html>`;
  }

  if (style === "paranoid") {
    const pad = Math.round(96 * U);
    return `${base}
body{background:#000}
.ring{position:absolute;width:${Math.round(2200 * U)}px;height:${Math.round(2200 * U)}px;left:${i % 2 ? -Math.round(1500 * U) : w - Math.round(700 * U)}px;top:-${Math.round(900 * U)}px;border-radius:50%;border:${Math.max(2, Math.round(3 * U))}px solid rgba(62,207,142,.55);box-shadow:0 0 ${Math.round(80 * U)}px rgba(62,207,142,.18),inset 0 0 ${Math.round(80 * U)}px rgba(62,207,142,.12)}
#copy{position:absolute;left:${pad}px;right:${set.tablet ? Math.round(w * 0.2) : pad}px;top:${Math.round(150 * U)}px;z-index:3;font-family:${family}}
.tag{display:flex;align-items:center;gap:${Math.round(20 * U)}px;font:500 ${Math.round(34 * U)}px "PlexMono",${family};letter-spacing:.2em;color:${G};text-transform:uppercase}
h1{margin:${Math.round(44 * U)}px 0 0;font-weight:600;font-size:${Math.round((cjk ? 108 : 118) * U)}px;line-height:1.08;letter-spacing:${cjk ? 0 : -0.03}em;color:#fff}
.acc{color:${G}}
p{margin:${Math.round(30 * U)}px 0 0;font-weight:400;font-size:${Math.round(44 * U)}px;line-height:1.4;color:#8C98A4;font-family:${cjk ? family : `"PlexMono",${family}`}}
.chips{display:flex;flex-wrap:wrap;gap:${Math.round(16 * U)}px;margin-top:${Math.round(44 * U)}px;align-items:center}
.chip{font:500 ${Math.round(33 * U)}px "PlexMono";letter-spacing:.06em;color:#E6EBEF;border:${Math.max(1, Math.round(2 * U))}px solid #2A3138;border-radius:${Math.round(12 * U)}px;padding:${Math.round(12 * U)}px ${Math.round(20 * U)}px;background:#07090B}
.chip b{color:${G};font-weight:500}
.card{position:absolute;z-index:2;padding:${Math.round(6 * U)}px;border-radius:${Math.round(58 * U)}px;background:linear-gradient(180deg,rgba(62,207,142,.6),rgba(62,207,142,.08) 60%);box-shadow:0 0 ${Math.round(120 * U)}px rgba(62,207,142,.16)}
.win{border-radius:${Math.round(52 * U)}px;background:#0A0D11}
</style></head><body><div class="ring"></div>
<div id="copy"><div class="tag">${seal(Math.round(40 * U))}<span>${esc(ctx.sealLabel)}</span></div><h1 id="h">${accented(head, ctx, "acc")}</h1><p id="s">${sub}</p>
<div class="chips">${cloudOff(Math.round(44 * U))}${chips(set.store).map((c) => `<span class="chip">${c}</span>`).join("")}</div></div>
${crop(ctx, "card")}
${layout({ w, h, maxW: set.tablet ? w * 0.86 : w - Math.round(160 * U), gap: Math.round(70 * U), bottom: Math.round(90 * U), lh: 1.08 })}</body></html>`;
  }

  /* light */
  const GD = "#13965E";
  return `${base}
body{background:#F4EEE5}
.bg{position:absolute;inset:0;background:radial-gradient(80% 40% at 50% 0%,#FFFBF5,rgba(255,251,245,0) 70%),radial-gradient(70% 40% at 50% 100%,#EADFCF,rgba(234,223,207,0) 70%),#F4EEE5}
#copy{position:absolute;left:${(w - copyW) / 2}px;width:${copyW}px;top:${Math.round(150 * U)}px;text-align:center;z-index:3;font-family:${family}}
.ico{display:inline-flex;width:${Math.round(150 * U)}px;height:${Math.round(150 * U)}px;border-radius:${Math.round(44 * U)}px;background:${GD};align-items:center;justify-content:center;box-shadow:0 ${Math.round(18 * U)}px ${Math.round(40 * U)}px rgba(19,150,94,.28);--ic:${GD}}
.ico svg{width:${Math.round(84 * U)}px;height:${Math.round(84 * U)}px}
h1{margin:${Math.round(52 * U)}px 0 0;font-weight:600;font-size:${Math.round((cjk ? 112 : 124) * U)}px;line-height:1.08;letter-spacing:${cjk ? 0 : -0.03}em;color:#1B2228;text-wrap:balance}
.acc{color:${GD}}
p{margin:${Math.round(34 * U)}px 0 0;font-weight:400;font-size:${Math.round(54 * U)}px;line-height:1.35;color:#5F6A73;text-wrap:balance}
.card{position:absolute;z-index:2;padding:${Math.round(22 * U)}px;border-radius:${Math.round(78 * U)}px;background:#fff;box-shadow:0 2px 0 rgba(0,0,0,.04),0 ${Math.round(50 * U)}px ${Math.round(120 * U)}px rgba(80,60,30,.22)}
.win{border-radius:${Math.round(58 * U)}px;background:#0A0D11}
</style></head><body><div class="bg"></div>
<div id="copy"><div class="ico"><svg viewBox="0 0 24 24">${ICON[ICONS[ctx.screen] ?? "shield"]}</svg></div><h1 id="h">${accented(head, ctx, "acc")}</h1><p id="s">${sub}</p></div>
${crop(ctx, "card")}
${layout({ w, h, maxW: set.tablet ? w * 0.86 : w - Math.round(180 * U), gap: Math.round(80 * U), bottom: Math.round(100 * U), lh: 1.08 })}</body></html>`;
}

/* ---------- Play feature graphic 1024×500 (no status bar, so nothing to patch) ---------- */
export function feature(style, { locale, text, sealLabel, family, fontCss, phrased, breakCss, icon }) {
  const cjk = ["ja", "zh-Hant"].includes(locale);
  /* family carries double quotes, so it only goes into the stylesheet, never into a style attribute */
  const copy = (color, sub, green = G) => `<style>.t{font-family:${family}}.t .eb{font-family:"PlexMono",${family}}</style><div class="t" style="position:absolute;left:480px;right:50px;top:0;bottom:0;display:flex;flex-direction:column;justify-content:center;z-index:3">
    <div class="eb" style="display:flex;align-items:center;gap:10px;font-weight:500;font-size:18px;letter-spacing:.2em;color:${green}">${seal(22, green)}<span>${esc(sealLabel)}</span></div>
    <div style="font:700 100px/1 Plex;letter-spacing:-.03em;color:${color};margin-top:10px">Inborn</div>
    <div style="font-size:${cjk ? 25 : 27}px;line-height:1.3;color:${sub};margin-top:14px;text-wrap:balance;${breakCss(locale)}">${phrased(locale, text)}</div></div>`;
  const head = `<!doctype html><html><head><meta charset="utf-8"><style>${fontCss()}${extraFontCss()}html,body{margin:0;width:1024px;height:500px;overflow:hidden}.g{position:relative;width:1024px;height:500px;overflow:hidden}</style></head><body><div class="g">`;
  if (style === "kuzari")
    return `${head}<div style="position:absolute;inset:0;background:#07090B"></div><div style="position:absolute;left:-20px;top:0;width:540px;height:500px;background:url(${url(join(ART, "hero-chat.png"))}) center 70%/cover;mask-image:linear-gradient(90deg,#000 62%,transparent)"></div>${copy("#F3F6F8", "#B3BDC6")}</div></body></html>`;
  if (style === "paranoid")
    return `${head}<div style="position:absolute;inset:0;background:#000"></div><div style="position:absolute;inset:0;overflow:hidden"><div style="position:absolute;width:760px;height:760px;left:-300px;top:-130px;border-radius:50%;border:2px solid rgba(62,207,142,.6);box-shadow:0 0 50px rgba(62,207,142,.2),inset 0 0 50px rgba(62,207,142,.12)"></div></div>
      <div style="position:absolute;left:60px;top:150px;display:flex;flex-direction:column;gap:14px;font:500 24px PlexMono;letter-spacing:.06em;color:#E6EBEF;z-index:3">
      ${["OUT <b>0 B</b>", "IN <b>0 B</b>", "NO INTERNET<br>PERMISSION"].map((c) => `<span style="border:2px solid #2A3138;border-radius:10px;padding:8px 14px;background:#07090B;align-self:flex-start">${c.replace(/<b>/g, `<b style="color:${G};font-weight:500">`)}</span>`).join("")}</div>${copy("#FFFFFF", "#8C98A4")}</div></body></html>`;
  return `${head}<div style="position:absolute;inset:0;background:radial-gradient(70% 90% at 22% 50%,#FFFBF5,#F1E9DD 70%)"></div>
    <img src="${url(icon)}" style="position:absolute;left:130px;top:132px;width:236px;height:236px;border-radius:52px;box-shadow:0 30px 70px rgba(80,60,30,.3);z-index:3">${copy("#1B2228", "#5F6A73", "#13965E")}</div></body></html>`;
}
