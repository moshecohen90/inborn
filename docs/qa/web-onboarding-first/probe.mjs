/* global window */
// Round 103 proof: a first visit on the web opens on onboarding (Welcome → Model with the download → Sealed → Lock → chat),
// a returning visit opens on the chat, a vanished model brings back the Model step alone, deep links wait for onboarding.
// usage: node probe.mjs <base-url> <outdir> [widths=1440,1024,390]   (serve with: DIST=... MODELS_DIR=... PORT=88xx node scripts/serve-web.mjs)
import { createRequire } from "node:module";
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { URL } from "node:url";
const [base, out, widthArg] = process.argv.slice(2);
const WIDTHS = (widthArg ?? "1440,1024,390").split(",").map(Number);
const pw = createRequire("/Users/moshecohen/.npm/_npx/9833c18b2d85bc59/node_modules/")("playwright-core");
const cache = "/Users/moshecohen/Library/Caches/ms-playwright";
const exe = readdirSync(cache).filter((d) => /^chromium_headless_shell-\d+$/.test(d)).sort().reverse()
  .flatMap((d) => readdirSync(path.join(cache, d)).map((s) => path.join(cache, d, s, "chrome-headless-shell"))).find((p) => existsSync(p));
mkdirSync(out, { recursive: true });
const summary = { base, checks: [], widths: {}, pageErrors: [] };
const check = (name, ok, seen) => summary.checks.push({ name, ok: !!ok, seen });
const SCREENS = ["onboarding-welcome", "onboarding-model", "onboarding-sealed", "onboarding-lock", "download-door", "catalog-door", "composer-input", "web-price-pro"];
const firstScreen = async (page, timeout = 60000) => {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    for (const id of SCREENS) if (await page.getByTestId(id).first().isVisible().catch(() => false)) return id;
    await page.waitForTimeout(200);
  }
  return null;
};
const shot = (page, name) => page.screenshot({ path: path.join(out, `${name}.png`), fullPage: true });
const hscroll = (page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
const browser = await pw.chromium.launch({ headless: true, executablePath: exe, args: ["--disable-dev-shm-usage"] });
const fresh = async (width) => {
  const ctx = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 900 }, deviceScaleFactor: 1 });
  await ctx.addInitScript(() => {
    if (!localStorage.getItem("inborn.prefs")) localStorage.setItem("inborn.prefs", JSON.stringify({ onboarded: false, locale: "en" }));
  });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => summary.pageErrors.push(`${width}: ${e.message}`));
  return { ctx, page };
};
try {
  for (const w of WIDTHS) {
    const row = (summary.widths[w] = {});
    const { ctx, page } = await fresh(w);
    await page.goto(base + "/");
    row.first = await firstScreen(page);
    await shot(page, `${w}-1-first-screen`);
    check(`${w}: the first screen of a first visit is Welcome`, row.first === "onboarding-welcome", row.first);
    if (row.first !== "onboarding-welcome") {
      await ctx.close();
      continue;
    }
    row.welcomeScroll = await hscroll(page);
    await page.getByTestId("onboarding-continue").click();
    await page.getByTestId("onboarding-model").waitFor({ timeout: 60000 });
    await page.getByTestId("download-door").waitFor({ timeout: 60000 });
    await page.waitForTimeout(500);
    await shot(page, `${w}-2-model-step`);
    row.step = {
      why: await page.getByTestId("web-download-why").count(),
      speed: await page.getByTestId("web-download-speed").innerText().catch(() => null),
      languages: await page.getByTestId("web-download-languages").innerText().catch(() => null),
      getApp: await page.getByTestId("get-app").isVisible(),
      scroll: await hscroll(page),
    };
    check(`${w}: the Model step carries the door's offer (recommendation, speed, get the app)`, row.step.why && row.step.speed && row.step.getApp, row.step);
    await page.getByTestId("download-model").click();
    await page.getByTestId("download-progress").waitFor({ timeout: 60000 }).catch(() => undefined);
    await shot(page, `${w}-3-model-step-downloading`);
    row.inStep = await page.getByTestId("onboarding-model").isVisible().catch(() => false);
    check(`${w}: the download runs inside the Model step`, row.inStep, row.inStep);
    await page.getByTestId("onboarding-sealed").waitFor({ timeout: 600000 });
    const start = page.getByTestId("sealed-start");
    for (let i = 0; i < 100 && (await start.isDisabled()); i++) await page.waitForTimeout(100);
    await shot(page, `${w}-4-sealed`);
    row.sealedProve = await page.getByTestId("sealed-prove").innerText();
    await start.click();
    await page.getByTestId("onboarding-lock").waitFor({ timeout: 60000 });
    await shot(page, `${w}-5-lock`);
    await page.getByTestId("lock-start").click();
    await page.getByTestId("composer-input").waitFor({ timeout: 300000 });
    await page.getByTestId("composer-input").fill("What is the capital of France? Answer in one sentence.");
    await page.getByTestId("send").click();
    await page.getByTestId("ledger-toggle").last().waitFor({ timeout: 300000 });
    row.answer = (await page.getByTestId("assistant-text").last().innerText()).trim();
    await shot(page, `${w}-6-first-chat`);
    check(`${w}: the first chat answers`, /paris/i.test(row.answer), row.answer);
    await page.reload();
    row.returning = await firstScreen(page);
    await shot(page, `${w}-7-returning`);
    check(`${w}: a returning visit opens on the chat`, row.returning === "composer-input", row.returning);
    if (w === WIDTHS[0]) {
      /* The model vanishes (Safari's 7-day eviction of script storage, a cleared site) while the prefs survive. */
      await page.evaluate(async () => (await navigator.storage.getDirectory()).removeEntry("models", { recursive: true }));
      await page.reload();
      row.modelGone = await firstScreen(page);
      row.modelGoneWhy = await page.getByTestId("model-gone-why").innerText().catch(() => null);
      row.modelGoneWelcome = await page.getByTestId("onboarding-welcome").count();
      await shot(page, `${w}-8-model-gone`);
      check(`${w}: a vanished model brings back the Model step alone, with why`, row.modelGone === "download-door" && row.modelGoneWhy && !row.modelGoneWelcome, row);
      await page.getByTestId("download-model").click();
      await page.getByTestId("composer-input").waitFor({ timeout: 600000 });
      await shot(page, `${w}-9-model-back-chat`);
      /* The wipe with models: everything goes, onboarding included (§5.7 "ends in onboarding"). */
      await page.goto(base + "/settings");
      await page.getByTestId("row-wipe").click();
      await page.getByTestId("wipe-models").click();
      await page.getByTestId("wipe-step1").click();
      await page.getByTestId("wipe-step2").click();
      row.afterWipe = await firstScreen(page);
      await page.waitForTimeout(500);
      await shot(page, `${w}-10-after-wipe-with-models`);
      await page.getByTestId("onboarding-continue").click().catch(() => undefined);
      await page.getByTestId("download-door").waitFor({ timeout: 60000 }).catch(() => undefined);
      row.afterWipeStep = { useButton: await page.getByTestId("use-model").count(), download: await page.getByTestId("download-model").count() };
      await shot(page, `${w}-11-after-wipe-model-step`);
      check(`${w}: the wipe with models ends on Welcome, and the step offers the download again`, row.afterWipe === "onboarding-welcome" && row.afterWipeStep.download === 1 && row.afterWipeStep.useButton === 0, row);
    }
    await ctx.close();
  }
  /* Deep links before onboarding is completed. */
  const { ctx, page } = await fresh(1440);
  summary.deepLinks = {};
  for (const p of ["/settings", "/documents", "/chats", "/vault", "/onboarding/sealed", "/paywall", "/legal/privacy"]) {
    await page.goto(base + p);
    summary.deepLinks[p] = { screen: await firstScreen(page, 30000), path: new URL(page.url()).pathname };
  }
  await shot(page, "deeplink-last");
  for (const p of ["/settings", "/documents", "/chats", "/vault", "/onboarding/sealed"]) check(`deep link ${p} before onboarding lands on onboarding`, /^\/onboarding/.test(summary.deepLinks[p].path), summary.deepLinks[p]);
  check("the price list stays reachable before onboarding", summary.deepLinks["/paywall"].screen === "web-price-pro", summary.deepLinks["/paywall"]);
  await ctx.close();
} catch (e) {
  summary.error = String(e?.stack ?? e);
} finally {
  await browser.close();
}
summary.failed = summary.checks.filter((c) => !c.ok).map((c) => c.name);
writeFileSync(path.join(out, "summary.json"), JSON.stringify(summary, null, 2));
for (const c of summary.checks) console.log(`${c.ok ? "PASS" : "FAIL"} ${c.name}`);
if (summary.error) console.log(`ERROR ${summary.error}`);
if (summary.pageErrors.length) console.log(`PAGE ERRORS ${summary.pageErrors.length}: ${summary.pageErrors.slice(0, 3).join(" | ")}`);
process.exit(summary.failed.length || summary.error ? 1 : 0);
