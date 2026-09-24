/* I03 Work Templates door in headless Chromium: the locked template row, its WORK chip and the banner chip each land on /paywall?reason=templates. */
import { createRequire } from "node:module";
import { existsSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "../../..");
const { startServer } = await import(path.join(REPO, "scripts/serve-web.mjs"));
const OUT = path.join(HERE, "after");
mkdirSync(OUT, { recursive: true });
const require = createRequire(process.env.PLAYWRIGHT_NODE_MODULES ?? "/Users/moshecohen/.npm/_npx/9833c18b2d85bc59/node_modules/");
const { chromium } = require("playwright-core");
function findChromium() {
  const wanted = chromium.executablePath();
  if (existsSync(wanted)) return wanted;
  const cache = /^(.*)\/chromium[^/]*-\d+\//.exec(wanted)?.[1];
  const shells = readdirSync(cache).filter((d) => /^chromium_headless_shell-\d+$/.test(d)).sort().reverse();
  return shells.flatMap((d) => readdirSync(path.join(cache, d)).map((s) => path.join(cache, d, s, "chrome-headless-shell"))).find((p) => existsSync(p));
}
const server = await startServer({ port: 0, modelsDir: process.env.INBORN_MODELS_DIR ?? path.join(REPO, ".models") });
const browser = await chromium.launch({ executablePath: findChromium() });
const out = { url: server.url, widths: [] };
let fail = null;
const paywallState = async (page) => ({
  paywall: (await page.getByTestId("paywall-title").count()) > 0,
  why: (await page.getByTestId("paywall-why").count()) ? await page.getByTestId("paywall-why").textContent() : null,
  url: page.url(),
});
try {
  for (const width of [390, 768, 1024, 1440]) {
    const ctx = await browser.newContext({ viewport: { width, height: 900 }, hasTouch: width === 390 });
    await ctx.addInitScript(() => { if (!localStorage.getItem("inborn.prefs")) localStorage.setItem("inborn.prefs", JSON.stringify({ onboarded: true })); });
    const page = await ctx.newPage();
    const w = { width, pageErrors: [] };
    page.on("pageerror", (e) => w.pageErrors.push(e.message));
    out.widths.push(w);
    const ids = async () => await page.locator("[data-testid]").evaluateAll((els) => els.map((e) => e.getAttribute("data-testid")));
    const toComposer = async () => {
      await page.goto(server.url, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(2500);
      for (let i = 0; i < 90; i++) {
        const now = await ids();
        if (now.includes("composer-input")) break;
        if (now.includes("download-model")) await page.getByTestId("download-model").click();
        else if (now.includes("new-chat")) await page.getByTestId("new-chat").first().click({ force: true });
        await page.waitForTimeout(4000);
      }
      await page.getByTestId("composer-input").waitFor({ timeout: 60_000 });
    };
    const openTemplates = async () => {
      await toComposer();
      await page.getByTestId("attach").click();
      await page.getByTestId("attach-sheet").waitFor({ timeout: 15_000 });
      await page.waitForTimeout(600);
      await page.getByTestId("attach-templates").click();
      await page.getByTestId("templates-sheet").waitFor({ timeout: 15_000 });
      await page.waitForTimeout(800);
    };
    const enterPack = async () => {
      const packs = await page.locator('[data-testid^="pack-"]').evaluateAll((els) => els.map((e) => e.getAttribute("data-testid")));
      await page.getByTestId(packs.find((p) => p !== "pack-declaration")).click();
      await page.waitForTimeout(1200);
      return await page.locator('[data-testid^="template-"]').evaluateAll((els) => els.map((e) => e.getAttribute("data-testid")));
    };

    await openTemplates();
    await page.screenshot({ path: path.join(OUT, `templates-sheet-w${width}.png`) });
    w.bannerTag = await page.getByTestId("work-tag").count();
    await page.getByTestId("work-tag").first().click();
    await page.waitForTimeout(1800);
    Object.assign(w, Object.fromEntries(Object.entries(await paywallState(page)).map(([k, v]) => [`banner${k[0].toUpperCase()}${k.slice(1)}`, v])));
    await page.screenshot({ path: path.join(OUT, `templates-banner-tag-w${width}.png`) });

    await openTemplates();
    const tmpl = await enterPack();
    w.templates = tmpl.join(",");
    w.rowAriaDisabled = await page.getByTestId(tmpl[0]).getAttribute("aria-disabled");
    w.workTagOnRow = await page.getByTestId("work-tag").count();
    await page.screenshot({ path: path.join(OUT, `templates-pack-w${width}.png`) });
    await page.getByTestId(tmpl[0]).click();
    await page.waitForTimeout(1800);
    const row = await paywallState(page);
    w.afterRowTapPaywall = row.paywall;
    w.afterRowTapWhy = row.why;
    w.afterRowTapUrl = row.url;
    w.templatesSheetGone = (await page.getByTestId("templates-sheet").count()) === 0;
    await page.screenshot({ path: path.join(OUT, `templates-row-tap-w${width}.png`) });

    await openTemplates();
    await enterPack();
    await page.getByTestId("work-tag").first().click();
    await page.waitForTimeout(1800);
    const chip = await paywallState(page);
    w.tagPaywall = chip.paywall;
    w.tagWhy = chip.why;
    w.tagUrl = chip.url;
    await page.screenshot({ path: path.join(OUT, `templates-worktag-w${width}.png`) });

    for (const [route, key] of [["/work/audit", "audit"], ["/work/statement", "statement"]]) {
      await toComposer();
      await page.goto(server.url + route, { waitUntil: "domcontentloaded" });
      await page.getByTestId("work-tag").first().waitFor({ timeout: 30_000 });
      await page.getByTestId("work-tag").first().click();
      await page.waitForTimeout(1800);
      const s = await paywallState(page);
      w[`${key}TagWhy`] = s.why;
      w[`${key}TagUrl`] = s.url;
      await page.screenshot({ path: path.join(OUT, `${key}-tag-w${width}.png`) });
    }
    await ctx.close();
  }
} catch (e) { fail = `${e.message}`; }
await browser.close();
await server.close();
out.failure = fail;
console.log(JSON.stringify(out, null, 2));
writeFileSync(path.join(HERE, "i03-templates-after.json"), JSON.stringify(out, null, 2));
process.exit(fail ? 1 : 0);
