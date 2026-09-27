/* Round 106 evidence: the site download row. Build the site to a dir, serve it on :8812, then: node siteshot.mjs <out> */
import { createRequire } from "node:module";
import { existsSync, readdirSync } from "node:fs";
import os from "node:os"; import path from "node:path";
const { chromium } = createRequire("/Users/moshecohen/.npm/_npx/9833c18b2d85bc59/node_modules/")("playwright-core");
const cache = path.join(os.homedir(), "Library/Caches/ms-playwright");
const executablePath = readdirSync(cache).filter((d) => /^chromium_headless_shell-\d+$/.test(d)).sort().reverse().flatMap((d) => readdirSync(path.join(cache, d)).map((s) => path.join(cache, d, s, "chrome-headless-shell"))).find((p) => existsSync(p));
const OUT = process.argv[2];
const b = await chromium.launch({ executablePath, headless: true });
const res = {};
try {
  for (const scheme of ["light", "dark"]) for (const w of [1440, 390]) for (const [dir, code] of [["", "en"], ["ja/", "ja"]]) {
    if (code === "ja" && (scheme === "dark" || w === 1440)) continue;
    const c = await b.newContext({ viewport: { width: w, height: 900 }, deviceScaleFactor: 2, colorScheme: scheme });
    const p = await c.newPage();
    await p.goto(`http://127.0.0.1:8812/${dir}download.html`);
    const row = p.locator(".stores").first();
    await row.scrollIntoViewIfNeeded();
    res[`${code}-${w}-${scheme}`] = await p.evaluate(() => ({ sw: document.documentElement.scrollWidth, vw: globalThis.innerWidth, imgs: [...document.querySelectorAll(".store-badge")].map((i) => ({ src: i.getAttribute("src"), ok: i.complete && i.naturalWidth > 0, w: Math.round(i.getBoundingClientRect().width), h: Math.round(i.getBoundingClientRect().height), alt: i.alt })) }));
    await p.screenshot({ path: path.join(OUT, `site-download-${code}-${w}${scheme === "dark" ? "-dark" : ""}.png`) });
    await c.close();
  }
} finally { await b.close(); }
console.log(JSON.stringify(res));
