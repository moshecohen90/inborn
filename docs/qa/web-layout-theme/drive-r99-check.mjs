/* Round 99 red/green driver: W2 pseudo sweep, W8 PRO chip row, W1 live Auto theme. OUT=dir TAG=before|after */
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
const WT = process.env.REPO;
const { startServer } = await import(WT + "/scripts/serve-web.mjs");
const pw = createRequire(process.env.PLAYWRIGHT_CORE_DIR + "/")("playwright-core");
const OUT = process.env.OUT; const TAG = process.env.TAG ?? "run"; mkdirSync(OUT, { recursive: true });
const server = await startServer({ port: Number(process.env.PORT_FIXED ?? 0) });
const ctx = await pw.chromium.launchPersistentContext(process.env.PROFILE, { executablePath: process.env.CHROMIUM_PATH, viewport: { width: 390, height: 844 } });
const R = { tag: TAG, pseudo: {}, pro: {}, theme: {} , fail: [] };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let page = await ctx.newPage();
const errs = []; page.on("pageerror", (e) => errs.push(String(e)));
await page.goto(server.url + "/");
const first = await Promise.race([page.getByTestId("download-door").waitFor({ timeout: 60000 }).then(() => "door"), page.getByTestId("composer-input").waitFor({ timeout: 60000 }).then(() => "chat"), page.getByTestId("onboarding-welcome").waitFor({ timeout: 60000 }).then(() => "onb")]);
if (first === "door") { await page.getByTestId("download-model").click(); }
if (first !== "chat") {
  await page.getByTestId("onboarding-welcome").waitFor({ timeout: 300000 }); await page.getByTestId("onboarding-continue").click();
  await page.getByTestId("onboarding-model").waitFor({ timeout: 60000 }); await page.getByTestId("start-chatting").click();
  const s = page.getByTestId("sealed-start"); await s.waitFor({ timeout: 30000 }); for (let i = 0; i < 100 && (await s.isDisabled()); i++) await sleep(100); await s.click();
  await page.getByTestId("lock-start").waitFor({ timeout: 30000 }); await page.getByTestId("lock-start").click();
  await page.getByTestId("composer-input").waitFor({ timeout: 300000 });
}
const setLocale = (lng) => page.evaluate((l) => { const p = JSON.parse(localStorage.getItem("inborn.prefs") ?? "{}"); if (l) p.locale = l; else delete p.locale; localStorage.setItem("inborn.prefs", JSON.stringify({ ...p, onboarded: true })); }, lng);
const SCREENS = [["chat", "/", "composer-input"], ["settings", "/settings", "row-proof"], ["paywall", "/paywall?reason=strictDocuments", "web-price-pro"], ["onboarding", "/onboarding", "onboarding-welcome"], ["proof", "/proof", null], ["vault", "/vault", "vault-web-door"], ["documents", "/documents", null]];
const width = () => page.evaluate(() => ({ sw: document.scrollingElement.scrollWidth, cw: document.scrollingElement.clientWidth }));
/* W2: pseudo at 390, every screen */
await setLocale("pseudo");
for (const [id, p, ready] of SCREENS) {
  await page.goto(server.url + p); if (ready) await page.getByTestId(ready).waitFor({ timeout: 60000 }); else await page.waitForLoadState("networkidle"); await sleep(300);
  const m = await width(); R.pseudo[id] = m; await page.screenshot({ path: `${OUT}/${TAG}-pseudo-${id}-390.png` });
  if (m.sw > m.cw + 1) R.fail.push(`W2 pseudo ${id}: ${m.sw}px in ${m.cw}px`);
}
/* W8: PRO chip on the Folders row, 8 locales + pseudo */
for (const lng of ["en", "de", "fr", "es", "pt-BR", "ja", "ko", "zh-Hant", "pseudo"]) {
  await setLocale(lng); await page.goto(server.url + "/chats"); await page.getByTestId("open-folders").waitFor({ timeout: 60000 }); await sleep(300);
  const b = await page.evaluate(() => { const r = (id) => { const e = document.querySelector(`[data-testid="${id}"]`); if (!e) return null; const x = e.getBoundingClientRect(); return { x: Math.round(x.x), r: Math.round(x.right), cy: Math.round(x.y + x.height / 2) }; }; return { folders: r("open-folders"), pro: r("pro-tag"), personas: r("open-personas"), cw: document.scrollingElement.clientWidth, sw: document.scrollingElement.scrollWidth }; });
  R.pro[lng] = b; await page.screenshot({ path: `${OUT}/${TAG}-chats-${lng}-390.png` });
  if (!b.pro) R.fail.push(`W8 ${lng}: no PRO chip`);
  else if (Math.abs(b.pro.cy - b.folders.cy) > 2 || b.pro.x < b.folders.r - 1 || b.pro.r > b.cw + 1) R.fail.push(`W8 ${lng}: PRO chip off the Folders row ${JSON.stringify(b)}`);
  if (Math.abs(b.personas.cy - b.folders.cy) > 2) R.fail.push(`W8 ${lng}: footer row wrapped ${JSON.stringify(b)}`);
  if (b.sw > b.cw + 1) R.fail.push(`W8 ${lng}: page ${b.sw}px in ${b.cw}px`);
}
await setLocale(null); await page.close();
/* W1: Auto follows a live OS change; the clock rule still wins at night */
const bgOf = (pg) => pg.evaluate(() => window.getComputedStyle(document.querySelector('[data-testid="web-strip"]').parentElement).backgroundColor);
const DARK = "rgb(10, 13, 17)";
for (const hour of [12, 20]) {
  const pg = await ctx.newPage();
  await pg.addInitScript((h) => { const D0 = Date; const t = new D0(); t.setHours(h, 0, 0, 0); const off = t - D0.now(); class D extends D0 { constructor(...a) { if (a.length) super(...a); else super(D0.now() + off); } static now() { return D0.now() + off; } } globalThis.Date = D; }, hour);
  await pg.emulateMedia({ colorScheme: "dark" }); await pg.goto(server.url + "/settings"); await pg.getByTestId("row-proof").waitFor({ timeout: 60000 }); await sleep(400);
  const t = { osDarkLoad: await bgOf(pg) }; await pg.screenshot({ path: `${OUT}/${TAG}-theme-${hour}h-1-os-dark.png` });
  await pg.emulateMedia({ colorScheme: "light" }); await sleep(1000); t.osLightLive = await bgOf(pg); await pg.screenshot({ path: `${OUT}/${TAG}-theme-${hour}h-2-os-light-live.png` });
  await pg.emulateMedia({ colorScheme: "dark" }); await sleep(1000); t.osDarkLive = await bgOf(pg); await pg.screenshot({ path: `${OUT}/${TAG}-theme-${hour}h-3-os-dark-live.png` });
  R.theme[hour] = t;
  const expLight = hour === 12 ? "light" : "dark";
  if (t.osDarkLoad !== DARK) R.fail.push(`W1 ${hour}h: OS dark on load is not dark`);
  if ((t.osLightLive === DARK) !== (expLight === "dark")) R.fail.push(`W1 ${hour}h: live OS light gave ${t.osLightLive}, expected ${expLight}`);
  if (t.osDarkLive !== DARK) R.fail.push(`W1 ${hour}h: live OS dark gave ${t.osDarkLive}`);
  await pg.close();
}
R.pageErrors = errs;
writeFileSync(`${OUT}/${TAG}-result.json`, JSON.stringify(R, null, 2));
console.log(R.fail.length ? `FAIL (${R.fail.length})\n` + R.fail.join("\n") : "PASS");
await ctx.close(); await server.close?.(); process.exit(R.fail.length ? 1 : 0);
