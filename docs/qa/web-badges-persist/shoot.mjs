/* Round 106 evidence: badges at 1440/390, light/dark, per locale, in a 280 px column; the F411 row and Safari hint.
   MODELS_DIR=… node docs/qa/web-badges-persist/shoot.mjs docs/qa/web-badges-persist/badges (serves on :8811) */
import { createRequire } from "node:module";
import { mkdtempSync, rmSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
const WT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const { startServer } = await import(`${WT}/scripts/serve-web.mjs`);
const { chromium } = createRequire("/Users/moshecohen/.npm/_npx/9833c18b2d85bc59/node_modules/")("playwright-core");
const cache = path.join(os.homedir(), "Library/Caches/ms-playwright");
const shells = readdirSync(cache).filter((d) => /^chromium_headless_shell-\d+$/.test(d)).sort().reverse();
const executablePath = shells.flatMap((d) => readdirSync(path.join(cache, d)).map((s) => path.join(cache, d, s, "chrome-headless-shell"))).find((p) => existsSync(p));
const OUT = process.argv[2];
const SAFARI = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15";
const host = await startServer({ port: 8811 });
const url = host.url.replace(/\/$/, "");
const root = mkdtempSync(path.join(os.tmpdir(), "inborn-shoot-"));
const report = {};
const ctx = await chromium.launchPersistentContext(path.join(root, "p"), { executablePath, headless: true, viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
const setPrefs = (page, extra) => page.evaluate((x) => localStorage.setItem("inborn.prefs", JSON.stringify({ ...JSON.parse(localStorage.getItem("inborn.prefs") ?? "{}"), onboarded: true, ...x })), extra);
try {
  const page = ctx.pages()[0];
  await page.goto(`${url}/onboarding/model`);
  await page.getByTestId("download-model").waitFor({ timeout: 60000 });
  if ((await page.getByTestId("web-model-choose-instant").count()) === 0) await page.getByTestId("web-model-options-toggle").click();
  await page.getByTestId("web-model-choose-instant").click();
  await page.getByTestId("download-model").click();
  await page.getByTestId("onboarding-sealed").waitFor({ timeout: 180000 });
  await setPrefs(page, {});
  /* the badge bitmaps are decoded at their device pixel ratio: count the loaded ones */
  const measure = async (tid) =>
    page.evaluate((tid) => {
      const box = document.querySelector(`[data-testid="${tid}"]`);
      if (!box) return null;
      const r = box.getBoundingClientRect();
      const kids = [...box.querySelectorAll('[data-testid^="' + tid + '-"]')].map((k) => {
        const b = k.getBoundingClientRect();
        const img = k.querySelector("img");
        return { id: k.getAttribute("data-testid"), label: k.getAttribute("aria-label"), role: k.getAttribute("role"), x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height), src: img?.getAttribute("src"), loaded: img ? img.complete && img.naturalWidth > 0 : null };
      });
      return { box: { x: Math.round(r.x), w: Math.round(r.width), h: Math.round(r.height) }, vw: globalThis.innerWidth, sw: document.documentElement.scrollWidth, kids };
    }, tid);
  for (const scheme of ["light", "dark"]) {
    await page.emulateMedia({ colorScheme: scheme });
    for (const w of [1440, 390]) {
      await page.setViewportSize({ width: w, height: 900 });
      for (const [name, p, tid, ready] of [
        ["chat", "/", "get-app", "composer-input"],
        ["paywall", "/paywall?reason=strictDocuments", "web-get", "web-price-pro"],
        ["vault", "/vault", "vault-get-app", "vault-web-door"],
      ]) {
        await page.goto(url + p);
        await page.getByTestId(ready).waitFor({ timeout: 120000 });
        await page.getByTestId(`${tid}-play`).waitFor({ timeout: 30000 });
        await page.waitForFunction((t) => [...document.querySelectorAll(`[data-testid^="${t}-"] img`)].every((i) => i.complete && i.naturalWidth > 0), tid, { timeout: 15000 }).catch(() => undefined);
        await page.getByTestId(tid).scrollIntoViewIfNeeded();
        await page.waitForTimeout(300);
        report[`${name}-${w}-${scheme}`] = await measure(tid);
        await page.screenshot({ path: path.join(OUT, `badges-${name}-${w}${scheme === "dark" ? "-dark" : ""}.png`) });
      }
    }
  }
  await page.emulateMedia({ colorScheme: "light" });
  /* 280 px: the width of the chat sidebar, the narrowest column the pair may sit in */
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(url + "/");
  await page.getByTestId("composer-input").waitFor({ timeout: 120000 });
  await page.evaluate(() => {
    const b = document.querySelector('[data-testid="get-app"]');
    const box = document.createElement("div");
    box.id = "col280";
    box.style.cssText = "position:fixed;left:0;top:120px;width:280px;padding:0;background:#fff;outline:1px dashed #f0f;z-index:99999;";
    box.appendChild(b.cloneNode(true));
    document.body.appendChild(box);
  });
  report.col280 = await page.evaluate(() => {
    const box = document.getElementById("col280").getBoundingClientRect();
    return [...document.querySelectorAll('#col280 [data-testid^="get-app-"]')].map((k) => { const b = k.getBoundingClientRect(); return { id: k.getAttribute("data-testid"), right: Math.round(b.right), bottom: Math.round(b.bottom), within: b.right <= box.right + 0.5 }; });
  });
  await page.locator("#col280").screenshot({ path: path.join(OUT, "badges-in-280.png") });
  /* Locales at 390 on the paywall: each language's own badges */
  await page.setViewportSize({ width: 390, height: 900 });
  for (const lng of ["ja", "de", "fr", "es", "pt-BR", "ko", "zh-Hant"]) {
    await setPrefs(page, { locale: lng });
    await page.goto(url + "/paywall?reason=strictDocuments");
    await page.getByTestId("web-get-play").waitFor({ timeout: 60000 });
    await page.waitForFunction(() => [...document.querySelectorAll('[data-testid^="web-get-"] img')].every((i) => i.complete && i.naturalWidth > 0), null, { timeout: 15000 }).catch(() => undefined);
    report[`paywall-390-${lng}`] = await measure("web-get");
    await page.getByTestId("web-get").screenshot({ path: path.join(OUT, `badges-paywall-390-${lng}.png`) });
  }
  await setPrefs(page, { locale: "en" });
  /* F411 Settings row (headless refuses persist) */
  await page.goto(url + "/settings/storage");
  await page.getByTestId("storage-durable").waitFor({ timeout: 60000 });
  report.settingsChromium = { row: await page.getByTestId("storage-durable").textContent(), hint: await page.getByTestId("install-hint").count() };
  await page.screenshot({ path: path.join(OUT, "storage-durable-chromium-390.png"), fullPage: true });
} finally {
  await ctx.close();
}
/* Safari UA: the install hint in the Model step and in Settings; installed (standalone) hides it */
try {
  for (const standalone of [false, true]) {
    const c = await chromium.launchPersistentContext(path.join(root, "p"), { executablePath, headless: true, userAgent: SAFARI, viewport: { width: 390, height: 900 }, deviceScaleFactor: 2 });
    if (standalone) await c.addInitScript(() => { const mm = globalThis.matchMedia.bind(globalThis); globalThis.matchMedia = (q) => (q.includes("display-mode: standalone") ? { matches: true, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} } : mm(q)); });
    const p = c.pages()[0] ?? (await c.newPage());
    await p.goto(url + "/onboarding/model");
    await p.getByTestId("download-door").waitFor({ timeout: 60000 });
    const key = standalone ? "safariInstalled" : "safari";
    report[key] = { modelStepHint: (await p.getByTestId("install-hint").count()) ? await p.getByTestId("install-hint").textContent() : null };
    if (!standalone) await p.getByTestId("install-hint").scrollIntoViewIfNeeded();
    await p.screenshot({ path: path.join(OUT, `install-hint-model-step-${standalone ? "installed" : "safari"}-390.png`), fullPage: true });
    await p.goto(url + "/settings/storage");
    await p.getByTestId("storage-durable").waitFor({ timeout: 60000 }).catch(() => undefined);
    report[key].settingsHint = (await p.getByTestId("install-hint").count()) ? await p.getByTestId("install-hint").textContent() : null;
    await p.screenshot({ path: path.join(OUT, `install-hint-settings-${standalone ? "installed" : "safari"}-390.png`), fullPage: true });
    await c.close();
  }
} finally {
  await host.close();
  rmSync(root, { recursive: true, force: true });
}
writeFileSync(path.join(OUT, "badges-report.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 1).slice(0, 4000));
