#!/usr/bin/env node
/**
 * Builds every Inborn icon asset from design/icon/inborn-icon.svg (spec §9.8).
 *
 *   node design/icon/build.mjs            # all targets
 *   node design/icon/build.mjs --no-tauri # skip the desktop set (needs the Tauri CLI in apps/desktop)
 *
 * The master has three layers by id: base (graphite), glow (filament), ring (the seal). Everything below is sliced
 * from those three groups so the icon is the same object everywhere. Rasters go through sharp (installed on first run
 * into design/icon/node_modules, outside the pnpm workspace). ictool (ships with Xcode 26's Icon Composer) renders
 * the Liquid Glass renditions for preview.html when present; without it the preview falls back to flat renders.
 */
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const require = createRequire(import.meta.url);
const SKIP_TAURI = process.argv.includes("--no-tauri");

function loadSharp() {
  try {
    return require("sharp");
  } catch {
    console.log("sharp missing, installing into design/icon/node_modules");
    const r = spawnSync("npm", ["install", "--no-audit", "--no-fund", "--no-package-lock", "--loglevel=error"], { cwd: HERE, stdio: "inherit" });
    if (r.status !== 0) throw new Error("npm install sharp failed");
    return require("sharp");
  }
}
const sharp = loadSharp();

// ---------- master ----------
const SIZE = 1024;
const master = fs.readFileSync(path.join(HERE, "inborn-icon.svg"), "utf8");
function layer(id) {
  const m = master.match(new RegExp(`<g id="${id}">([\\s\\S]*?)</g>`));
  if (!m) throw new Error(`layer ${id} missing in inborn-icon.svg`);
  return m[1].trim();
}
const L = { base: layer("base"), glow: layer("glow"), ring: layer("ring") };
const ringGeometry = (() => {
  const m = L.ring.match(/<circle cx="(\d+)" cy="(\d+)" r="([\d.]+)"[^>]*stroke-width="([\d.]+)"/);
  return { cx: +m[1], cy: +m[2], r: +m[3], stroke: +m[4], outer: 2 * (+m[3] + +m[4] / 2) };
})();

const scaled = (inner, scale, size = SIZE) => {
  const t = (size - SIZE * scale) / 2;
  return `<g transform="translate(${t} ${t}) scale(${scale})">${inner}</g>`;
};
const doc = (inner, size = SIZE) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">${inner}</svg>`;
const flatSvg = doc(L.base + L.glow + L.ring);
const roundedMask = (size, pct = 0.2237) => Buffer.from(`<svg width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${size * pct}"/></svg>`);
const raster = (svg, size, opts = {}) => {
  let p = sharp(Buffer.from(svg), { density: (72 * size) / SIZE }).resize(size, size, { kernel: "lanczos3" });
  if (opts.round) p = p.composite([{ input: roundedMask(size, opts.round), blend: "dest-in" }]);
  if (opts.opaque) p = p.flatten({ background: "#0D1115" }).removeAlpha();
  return p.png({ compressionLevel: 9 }).toBuffer();
};
const write = (rel, buf) => {
  const abs = path.join(ROOT, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, buf);
  console.log("wrote", rel);
};
// Recolour the ring layer to a single flat colour (Android monochrome, silhouette tests).
const mono = (color) => L.ring.replace(/stroke="#[0-9A-Fa-f]{6}"/g, `stroke="${color}"`);

// ---------- 1. master rasters + store artwork ----------
const flat1024 = await raster(flatSvg, 1024, { opaque: true });
write("design/icon/inborn-icon-1024.png", flat1024);
write("design/icon/store-1024.png", flat1024);
write("design/icon/play-512.png", await raster(flatSvg, 512, { opaque: true }));

// ---------- 2. Expo mobile assets ----------
write("apps/mobile/assets/icon.png", flat1024);
// Android adaptive: 108 dp canvas, 72 dp visible, 66 dp safe. Ring outer = 540 px of 1024 keeps it inside the safe circle (626 px).
const ANDROID_SCALE = 540 / ringGeometry.outer;
write("apps/mobile/assets/android-icon-background.png", await raster(doc(L.base), 1024, { opaque: true }));
write("apps/mobile/assets/android-icon-foreground.png", await raster(doc(scaled(L.glow + L.ring, ANDROID_SCALE)), 1024));
write("apps/mobile/assets/android-icon-monochrome.png", await raster(doc(scaled(mono("#FFFFFF"), ANDROID_SCALE)), 1024));
// Splash: ring only on transparent; pair with backgroundColor #0A0D11 (spec bg) in expo-splash-screen.
write("apps/mobile/assets/splash-icon.png", await raster(doc(L.glow + L.ring), 1024));
write("apps/mobile/assets/favicon.png", await raster(flatSvg, 48, { round: 0.2237 }));

// ---------- 3. PWA icons ----------
for (const s of [180, 192, 512]) write(`apps/mobile/public/icons/icon-${s}.png`, await raster(flatSvg, s, { opaque: true }));
// Maskable: content must sit inside the central 80 % circle.
const MASKABLE_SCALE = (0.72 * SIZE) / ringGeometry.outer;
write("apps/mobile/public/icons/maskable-512.png", await raster(doc(L.base + scaled(L.glow + L.ring, MASKABLE_SCALE)), 512, { opaque: true }));
write("apps/mobile/public/icons/icon.svg", Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">\n` +
  `  <!-- Generated by design/icon/build.mjs from inborn-icon.svg (spec §9.8). Web favicon: corners pre-rounded 22%. -->\n` +
  `  <defs><clipPath id="corner"><rect width="1024" height="1024" rx="229"/></clipPath></defs>\n` +
  `  <g clip-path="url(#corner)">${L.base}${L.glow}${L.ring}</g>\n</svg>\n`,
));

// ---------- 4. iOS 26 Liquid Glass bundle (Icon Composer format) ----------
const ICON_BUNDLE = "design/icon/Inborn.icon";
const rgb = (hex) => `srgb:${[1, 3, 5].map((i) => (parseInt(hex.slice(i, i + 2), 16) / 255).toFixed(5)).join(",")},1.00000`;
write(`${ICON_BUNDLE}/Assets/ring.svg`, Buffer.from(doc(L.ring) + "\n"));
write(`${ICON_BUNDLE}/Assets/glow.svg`, Buffer.from(doc(L.glow) + "\n"));
// Groups render top-down: the seal sits above the glow; the graphite base is the canvas fill so Clear/Tinted modes can drop it.
write(`${ICON_BUNDLE}/icon.json`, Buffer.from(JSON.stringify({
  fill: { "linear-gradient": [rgb("#1B2129"), rgb("#0D1115")], orientation: { start: { x: 0.5, y: 0 }, stop: { x: 0.5, y: 1 } } },
  "fill-specializations": [
    { appearance: "dark", value: { "linear-gradient": [rgb("#12161B"), rgb("#0A0D11")], orientation: { start: { x: 0.5, y: 0 }, stop: { x: 0.5, y: 1 } } } },
  ],
  groups: [
    {
      name: "seal",
      layers: [{ "image-name": "ring.svg", name: "ring", glass: true }],
      lighting: "individual",
      specular: true,
      shadow: { kind: "neutral", opacity: 0.5 },
      translucency: { enabled: true, value: 0.35 },
      "blur-material": null,
    },
    {
      name: "glow",
      layers: [{ "image-name": "glow.svg", name: "filament", glass: false, "blend-mode": "plus-lighter" }],
      specular: false,
      shadow: { kind: "none", opacity: 0 },
      translucency: { enabled: false, value: 0 },
      "blur-material": null,
      "hidden-specializations": [{ appearance: "tinted", value: true }],
    },
  ],
  "supported-platforms": { squares: "shared" },
}, null, 2) + "\n"));

// ---------- 5. Tauri desktop set ----------
if (!SKIP_TAURI) {
  const desktop = path.join(ROOT, "apps/desktop");
  const localTauri = path.join(desktop, "node_modules/.bin/tauri");
  const iconsDir = path.join(desktop, "src-tauri/icons");
  {
    const [cmd, pre] = fs.existsSync(localTauri) ? [localTauri, []] : ["npx", ["--yes", "@tauri-apps/cli@2"]];
    const r = spawnSync(cmd, [...pre, "icon", path.join(HERE, "inborn-icon-1024.png"), "-o", iconsDir], { cwd: desktop, stdio: "inherit" });
    if (r.status !== 0) throw new Error("tauri icon failed");
    for (const extra of ["android", "ios"]) fs.rmSync(path.join(iconsDir, extra), { recursive: true, force: true });
    // macOS (12–15) expects the squircle + 10 % margin baked into the icns; Tahoe re-masks it anyway.
    if (process.platform === "darwin") {
      const inset = 824;
      const macSvg = doc(`<g clip-path="url(#c)">${scaled(L.base + L.glow + L.ring, inset / SIZE)}</g><defs><clipPath id="c"><rect x="${(SIZE - inset) / 2}" y="${(SIZE - inset) / 2}" width="${inset}" height="${inset}" rx="${inset * 0.2237}"/></clipPath></defs>`);
      const iconset = fs.mkdtempSync(path.join(os.tmpdir(), "inborn-iconset-")) + "/icon.iconset";
      fs.mkdirSync(iconset);
      for (const [name, px] of [["16x16", 16], ["16x16@2x", 32], ["32x32", 32], ["32x32@2x", 64], ["128x128", 128], ["128x128@2x", 256], ["256x256", 256], ["256x256@2x", 512], ["512x512", 512], ["512x512@2x", 1024]]) {
        fs.writeFileSync(path.join(iconset, `icon_${name}.png`), await raster(macSvg, px));
      }
      const u = spawnSync("iconutil", ["-c", "icns", iconset, "-o", path.join(iconsDir, "icon.icns")], { stdio: "inherit" });
      if (u.status !== 0) throw new Error("iconutil failed");
      fs.rmSync(path.dirname(iconset), { recursive: true, force: true });
      console.log("wrote apps/desktop/src-tauri/icons/icon.icns (macOS squircle variant)");
    }
  }
}

// ---------- 6. preview.html ----------
const b64 = (buf) => `data:image/png;base64,${buf.toString("base64")}`;
const ICTOOL = ["/Applications/Icon Composer.app/Contents/Executables/ictool", "/Applications/Xcode.app/Contents/Applications/Icon Composer.app/Contents/Executables/ictool"].find((p) => fs.existsSync(p));
const glass = {};
if (ICTOOL) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "inborn-ictool-"));
  for (const rendition of ["Default", "Dark", "TintedLight", "TintedDark", "ClearLight", "ClearDark"]) {
    const out = path.join(tmp, `${rendition}.png`);
    const args = [path.join(ROOT, ICON_BUNDLE), "--export-image", "--output-file", out, "--platform", "iOS", "--rendition", rendition, "--width", "512", "--height", "512", "--scale", "1"];
    if (rendition.startsWith("Tinted")) args.push("--tint-color", "0.42", "--tint-strength", "0.7");
    const r = spawnSync(ICTOOL, args, { stdio: "pipe" });
    if (r.status === 0 && fs.existsSync(out)) glass[rendition] = fs.readFileSync(out);
    else console.warn(`ictool ${rendition} failed: ${r.stderr}`);
  }
  fs.rmSync(tmp, { recursive: true, force: true });
} else {
  console.warn("ictool not found (Xcode 26 / Icon Composer); preview shows flat renders instead of Liquid Glass");
}

const previewSizes = [180, 120, 60, 48, 29];
const home = {};
for (const s of previewSizes) home[s] = b64(await raster(flatSvg, s, { opaque: true }));
const big = b64(await raster(flatSvg, 512, { opaque: true }));
const androidComposite = b64(await raster(doc(L.base + scaled(L.glow + L.ring, ANDROID_SCALE)), 324, { opaque: true })); // 108 dp @3x
const androidMono = b64(await raster(doc(scaled(mono("#1F3D2A"), ANDROID_SCALE)), 324));
const sil48 = b64(await sharp(await raster(flatSvg, 48, { opaque: true })).grayscale().threshold(110).png().toBuffer());
const sil29 = b64(await sharp(await raster(flatSvg, 29, { opaque: true })).grayscale().threshold(110).png().toBuffer());
const mono48 = b64(await raster(doc(mono("#000000")), 48));
const maskable = b64(await raster(doc(L.base + scaled(L.glow + L.ring, MASKABLE_SCALE)), 192, { opaque: true }));
const legacy = {
  light: home[180],
  dark: b64(await raster(doc(`<rect width="1024" height="1024" fill="#000"/>` + L.glow + L.ring), 180, { opaque: true })),
  tinted: b64(await raster(doc(`<rect width="1024" height="1024" fill="#000"/>` + mono("#FFFFFF")), 180, { opaque: true })),
};
const g = (k) => (glass[k] ? b64(glass[k]) : null);

const tile = (src, size, cls = "") => `<img class="app ${cls}" src="${src}" width="${size}" height="${size}" alt="">`;
const iosRow = (cls) => previewSizes.map((s) => `<figure><div class="cell">${tile(home[s], s, cls)}</div><figcaption>${s} px</figcaption></figure>`).join("");
const glassCard = (k, label, bg) => `<figure class="${bg}"><div class="cell">${g(k) ? tile(g(k), 120, "ios") : `<div class="app ios missing" style="width:120px;height:120px">ictool</div>`}</div><figcaption>${label}</figcaption></figure>`;

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Inborn icon preview</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  :root{color-scheme:light}
  body{margin:0;font:14px/1.5 -apple-system,"IBM Plex Sans",system-ui,sans-serif;background:#F3F5F7;color:#12161B}
  main{max-width:1180px;margin:0 auto;padding:32px 24px 80px}
  h1{font-size:22px;margin:0 0 4px}h2{font-size:16px;margin:40px 0 12px;padding-top:16px;border-top:1px solid #DDE3E9}
  .sub{color:#4A5560;margin:0 0 24px}
  .mono{font-family:"IBM Plex Mono",ui-monospace,Menlo,monospace;font-size:12px;color:#6B7682;letter-spacing:.06em;text-transform:uppercase}
  .row{display:flex;flex-wrap:wrap;gap:24px;align-items:flex-end}
  figure{margin:0;text-align:center}figcaption{font-size:12px;color:#4A5560;margin-top:8px}
  .cell{display:flex;align-items:center;justify-content:center}
  .app{display:block}
  .ios{border-radius:22.37%}
  .screen{border-radius:28px;padding:28px 22px;display:inline-flex;gap:22px;align-items:flex-end;flex-wrap:wrap}
  .screen.light{background:linear-gradient(160deg,#dfe7f2,#f6e9dc 55%,#c9d9ea)}
  .screen.dark{background:linear-gradient(160deg,#101418,#1b2230 55%,#0a0d11)}
  .screen figcaption{color:#fff;text-shadow:0 1px 2px rgba(0,0,0,.5);font-size:11px}
  .screen.light figcaption{color:#12161B;text-shadow:none}
  .wall{border-radius:20px;padding:22px;display:inline-flex;gap:22px;flex-wrap:wrap}
  .wall.light{background:linear-gradient(160deg,#e9eef5,#f7efe6)}.wall.dark{background:linear-gradient(160deg,#0f1319,#1a2130)}
  .wall.dark figcaption{color:#c9d2dc}
  .circle{border-radius:50%}
  .rsq{border-radius:20%}
  .squircle{clip-path:path("M 54 0 C 12 0 0 12 0 54 C 0 96 12 108 54 108 C 96 108 108 96 108 54 C 108 12 96 0 54 0 Z")}
  .adaptive{width:108px;height:108px;overflow:hidden;position:relative;background:#0D1115}
  .adaptive img{position:absolute;width:162px;height:162px;left:-27px;top:-27px;max-width:none}
  .themed{width:108px;height:108px;position:relative;overflow:hidden;background:#D8E6D0}
  .themed img{position:absolute;width:162px;height:162px;left:-27px;top:-27px;max-width:none}
  .small .adaptive,.small .themed{width:48px;height:48px}.small .adaptive img,.small .themed img{width:72px;height:72px;left:-12px;top:-12px}
  .small .squircle{clip-path:path("M 24 0 C 5.3 0 0 5.3 0 24 C 0 42.7 5.3 48 24 48 C 42.7 48 48 42.7 48 24 C 48 5.3 42.7 0 24 0 Z")}
  .sil{image-rendering:pixelated;border:1px solid #DDE3E9;background:#fff}
  .store{display:flex;gap:14px;align-items:center;padding:14px 16px;border-radius:14px;background:#fff;border:1px solid #DDE3E9;width:360px}
  .store.dark{background:#12161B;border-color:#1F262E;color:#EEF2F5}
  .store .t{font-weight:600}.store .s{font-size:12px;color:#6B7682}.store .btn{margin-left:auto;font-size:13px;font-weight:600;padding:6px 16px;border-radius:999px;background:#E9EDF1;color:#0A66C2}
  .store.dark .btn{background:#1F262E;color:#6db4ff}
  .missing{display:flex;align-items:center;justify-content:center;background:#e0e4e8;color:#6B7682;font-size:12px}
  .note{background:#fff;border:1px solid #DDE3E9;border-radius:10px;padding:12px 16px;margin:12px 0;font-size:13px}
  ul{margin:8px 0 0;padding-left:20px}
</style></head><body><main>
<h1>Inborn app icon</h1>
<p class="sub">Spec §9.8 (approved 3.9.2026): a closed seal ring on graphite, one filament highlight at 2 o'clock. Generated by <code>design/icon/build.mjs</code>; nothing here is hand exported.</p>

<div class="row">
  <figure><div class="cell">${tile(big, 256, "ios")}</div><figcaption>1024 px master (shown at 256)</figcaption></figure>
  <figure><div class="cell"><img class="sil" src="${sil48}" width="96" height="96" alt=""></div><figcaption>48 px silhouette (threshold)</figcaption></figure>
  <figure><div class="cell"><img class="sil" src="${sil29}" width="87" height="87" alt=""></div><figcaption>29 px silhouette</figcaption></figure>
  <figure><div class="cell"><img class="sil" src="${mono48}" width="96" height="96" alt=""></div><figcaption>48 px monochrome layer</figcaption></figure>
</div>

<h2>iOS home screen, light and dark</h2>
<p class="mono">180 · 120 · 60 · 48 · 29</p>
<div class="screen light">${iosRow("ios")}</div>
<div class="screen dark">${iosRow("ios")}</div>

<h2>iOS 26 Liquid Glass renditions (Icon Composer bundle <code>design/icon/Inborn.icon</code>)</h2>
<p class="sub">${ICTOOL ? "Rendered by ictool from the layered bundle: the ring is a glass layer, the filament glow is a plain additive layer, the graphite is the canvas fill." : "ictool was not found on this machine, so these are the flat fallbacks. Install Xcode 26 (Icon Composer) and rerun build.mjs for real renders."}</p>
<div class="row">
  <div class="wall light">${glassCard("Default", "Default (light)")}${glassCard("TintedLight", "Tinted light")}${glassCard("ClearLight", "Clear light")}</div>
  <div class="wall dark">${glassCard("Dark", "Dark")}${glassCard("TintedDark", "Tinted dark")}${glassCard("ClearDark", "Clear dark")}</div>
</div>
<p class="sub" style="margin-top:12px">iOS 18 fallbacks Xcode derives when the bundle is used (light / dark / tinted source art):</p>
<div class="row"><div class="wall dark"><figure><div class="cell">${tile(legacy.light, 90, "ios")}</div><figcaption>light</figcaption></figure><figure><div class="cell">${tile(legacy.dark, 90, "ios")}</div><figcaption>dark</figcaption></figure><figure><div class="cell">${tile(legacy.tinted, 90, "ios")}</div><figcaption>tinted source</figcaption></figure></div></div>

<h2>Android adaptive icon (108 dp canvas, 72 dp visible, 66 dp safe zone)</h2>
<div class="row">
  <figure><div class="adaptive circle"><img src="${androidComposite}" alt=""></div><figcaption>circle</figcaption></figure>
  <figure><div class="adaptive squircle"><img src="${androidComposite}" alt=""></div><figcaption>squircle</figcaption></figure>
  <figure><div class="adaptive rsq"><img src="${androidComposite}" alt=""></div><figcaption>rounded square</figcaption></figure>
  <figure><div class="themed circle"><img src="${androidMono}" alt=""></div><figcaption>themed (monochrome)</figcaption></figure>
  <div class="small row" style="gap:12px;margin-left:16px">
    <figure><div class="adaptive circle"><img src="${androidComposite}" alt=""></div><figcaption>48</figcaption></figure>
    <figure><div class="adaptive squircle"><img src="${androidComposite}" alt=""></div><figcaption>48</figcaption></figure>
    <figure><div class="adaptive rsq"><img src="${androidComposite}" alt=""></div><figcaption>48</figcaption></figure>
    <figure><div class="themed circle"><img src="${androidMono}" alt=""></div><figcaption>48</figcaption></figure>
  </div>
  <figure><div class="cell">${tile(maskable, 96, "circle")}</div><figcaption>PWA maskable</figcaption></figure>
</div>

<h2>Store rows</h2>
<div class="row">
  <div class="store">${tile(home[60], 60, "ios")}<div><div class="t">Inborn: Private Local AI Chat</div><div class="s">AI that never leaves your phone</div></div><div class="btn">GET</div></div>
  <div class="store dark">${tile(home[48], 48, "rsq")}<div><div class="t">Inborn - Offline AI Chat</div><div class="s">Inborn · Productivity</div></div><div class="btn">Install</div></div>
  <div class="store">${tile(home[48], 48, "rsq")}<div><div class="t">Inborn - Offline AI Chat</div><div class="s">Inborn · Productivity</div></div><div class="btn">Install</div></div>
</div>

<h2>Checklist</h2>
<div class="note"><ul>
  <li>One idea: a closed ring. Nameable in under 5 seconds; the 48 px and 29 px silhouettes above are the whole icon.</li>
  <li>Ring stroke ${ringGeometry.stroke} px on a ${ringGeometry.r} px radius (outer ${ringGeometry.outer} px = ${Math.round((100 * ringGeometry.outer) / SIZE)} % of the canvas); 3.9 px at 48 px, 2.6 px at 29 px.</li>
  <li>Sealed green #3ECF8E = the SEALED state of the in-app seal; filament #F0B35B = the accent; graphite #1B2129 to #0D1115, never pure black (§9.9).</li>
  <li>Not a shield, not a lock, not a spark; no text; no baked corners or shadows (iOS, Play and the launchers apply their own masks).</li>
  <li>Android foreground scaled to ${Math.round(ANDROID_SCALE * 100)} % so the ring stays inside the 66 dp safe zone; monochrome layer is the ring alone.</li>
</ul></div>
</main></body></html>
`;
write("design/icon/preview.html", Buffer.from(html));

// Moshe reviews HTML in Chrome with his comment layer; optional, only when the skill is installed on this machine.
const inject = path.join(os.homedir(), ".claude/skills/doc-comments/inject.py");
if (fs.existsSync(inject)) spawnSync("python3", [inject, path.join(ROOT, "design/icon/preview.html"), "--doc", "inborn-icon-preview"], { stdio: "inherit" });

console.log("done");
