/* global window */
// F13 proof: the door, onboarding, the Model sheet and the vault lead with the model that fits the browser's free space.
// usage: node proof.mjs <base-url> <outdir>   (serve with: MODELS_DIR=... PORT=... node scripts/serve-web.mjs)
import { createRequire } from "node:module";
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
const [base, out] = process.argv.slice(2);
const pw = createRequire("/Users/moshecohen/.npm/_npx/9833c18b2d85bc59/node_modules/")("playwright-core");
const cache = "/Users/moshecohen/Library/Caches/ms-playwright";
const exe = readdirSync(cache).filter((d) => /^chromium_headless_shell-\d+$/.test(d)).sort().reverse()
  .flatMap((d) => readdirSync(path.join(cache, d)).map((s) => path.join(cache, d, s, "chrome-headless-shell"))).find((p) => existsSync(p));
mkdirSync(out, { recursive: true });
const MB = 1024 * 1024;
const WIDTHS = [390, 1440];
const summary = { base, door: {}, onboarding: {}, sheet: {}, vault: {}, pageErrors: [] };
const browser = await pw.chromium.launch({ headless: true, executablePath: exe, args: ["--disable-dev-shm-usage"] });
const text = async (scope, id) => ((await scope.getByTestId(id).count()) ? (await scope.getByTestId(id).first().innerText()).trim() : null);
const context = async (freeMB, onboarded) => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  await ctx.addInitScript(([free, done]) => {
    navigator.storage.estimate = async () => ({ usage: 0, quota: free });
    if (!localStorage.getItem("inborn.prefs")) localStorage.setItem("inborn.prefs", JSON.stringify({ onboarded: done, locale: "en" }));
  }, [freeMB * MB, onboarded]);
  const page = await ctx.newPage();
  page.on("pageerror", (e) => summary.pageErrors.push(e.message));
  return { ctx, page };
};
const atWidths = async (page, name, read) => {
  const rows = {};
  for (const w of WIDTHS) {
    await page.setViewportSize({ width: w, height: w === 390 ? 844 : 900 });
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${out}/after-${name}-${w}.png` });
    const scroll = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    rows[w] = { ...(await read()), horizontalScroll: scroll };
  }
  return rows;
};
try {
  for (const free of [900, 105]) {
    const { ctx, page } = await context(free, true);
    await page.goto(base + "/");
    await page.getByTestId("download-door").waitFor({ timeout: 60000 });
    await page.waitForTimeout(800);
    summary.door[free] = await atWidths(page, `door-${free}MB`, async () => {
      const door = await page.getByTestId("download-door").innerText();
      return { offers: /Download (\w+) to this browser/.exec(door)?.[1] ?? null, roomNote: await text(page, "room-note"), noSpace: await text(page, "no-space"), buttonDisabled: await page.getByTestId("download-model").isDisabled() };
    });
    await ctx.close();
  }
  /* 900 MB free, first visit: take the door's pick, then walk into onboarding, the chat's Model sheet and the vault. */
  const { ctx, page } = await context(900, false);
  await page.goto(base + "/");
  await page.getByTestId("download-model").click();
  await page.getByTestId("onboarding-welcome").waitFor({ timeout: 600000 });
  await page.getByTestId("onboarding-continue").click();
  await page.getByTestId("onboarding-model").waitFor({ timeout: 60000 });
  summary.onboarding = await atWidths(page, "onboarding-900MB", async () => ({
    options: await page.locator('[data-testid^="model-option-"]').evaluateAll((els) => els.map((e) => ({ id: e.getAttribute("data-testid").slice(13), recommended: /RECOMMENDED/.test(e.textContent) }))),
    roomNote: await text(page, "room-note"),
  }));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByTestId("start-chatting").click();
  const start = page.getByTestId("sealed-start");
  await start.waitFor({ timeout: 30000 });
  for (let i = 0; i < 100 && (await start.isDisabled()); i++) await page.waitForTimeout(100);
  await start.click();
  await page.getByTestId("lock-start").click();
  await page.getByTestId("composer-input").waitFor({ timeout: 600000 });
  await page.waitForFunction(() => !/Loading /.test(document.body.innerText), null, { timeout: 600000 });
  /* A resize swaps the sheet's layout and closes it, so it is opened at each width. */
  for (const w of WIDTHS) {
    await page.setViewportSize({ width: w, height: w === 390 ? 844 : 900 });
    await page.waitForTimeout(400);
    await page.getByTestId("model-chip").filter({ visible: true }).first().click();
    const sheet = page.getByTestId("model-sheet").filter({ visible: true }).last();
    await sheet.getByTestId("model-sheet-recommended").waitFor({ timeout: 30000 });
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${out}/after-sheet-900MB-${w}.png` });
    summary.sheet[w] = {
      recommendedLine: await text(sheet, "model-sheet-recommended"),
      recommendedRow: await sheet.locator('[data-testid^="model-sheet-recommended-"]').evaluateAll((els) => els.map((e) => e.getAttribute("data-testid").slice(24))),
      roomNote: await text(sheet, "room-note"),
    };
    await page.keyboard.press("Escape");
    await page.waitForTimeout(400);
  }
  await page.goto(base + "/vault");
  await page.getByTestId("vault-web-door").waitFor({ timeout: 60000 });
  await page.waitForTimeout(600);
  summary.vault = await atWidths(page, "vault-900MB", async () => ({ roomNote: await text(page, "room-note"), recommended: await page.locator('[data-testid^="web-model-recommended-"], [data-testid*="recommended"]').evaluateAll((els) => els.map((e) => e.getAttribute("data-testid"))) }));
  await ctx.close();
} finally {
  await browser.close();
}
writeFileSync(`${out}/after-summary.json`, JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
