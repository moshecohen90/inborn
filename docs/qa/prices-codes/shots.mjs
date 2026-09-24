#!/usr/bin/env node
/**
 * Round 64 evidence (docs/qa/prices-codes): S60 in the browser at 390, 768, 1024 and 1440.
 *
 *   node docs/qa/prices-codes/shots.mjs --tag before
 *
 * Two passes. `--tag web-*` shoots the shipping web build, where the paywall sells nothing and the code row must not
 * appear. `--tag store-*` shoots a build whose `provider.web.ts` was locally patched to answer as a Play store, which
 * is the only way a browser can render the row at all: the row is gated on a store having a redemption screen.
 *
 * PORT keeps the web origin stable so OPFS survives between runs. CHROMIUM_PATH / PLAYWRIGHT_CORE_DIR as in web-smoke.
 */
import { createRequire } from "node:module";
import { existsSync, mkdirSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startServer } from "../../../scripts/serve-web.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const tag = process.argv[process.argv.indexOf("--tag") + 1] ?? "shot";
const outDir = path.join(here, tag);
const profile = process.env.SHOTS_PROFILE ?? path.join(process.env.TMPDIR ?? "/tmp", "inborn-prices-codes-shots-profile");
const WEB_PORT = Number(process.env.PORT ?? 8519);
const WIDTHS = [390, 768, 1024, 1440];

function loadPlaywright() {
  for (const dir of [process.env.PLAYWRIGHT_CORE_DIR, "/Users/moshecohen/.npm/_npx/9833c18b2d85bc59/node_modules"].filter(Boolean)) {
    try {
      return createRequire(path.join(dir, "/"))("playwright-core");
    } catch {
      /* try the next location */
    }
  }
  throw new Error("playwright-core not found (set PLAYWRIGHT_CORE_DIR)");
}

function findChromium(chromium) {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  const wanted = chromium.executablePath();
  if (existsSync(wanted)) return wanted;
  const cache = /^(.*)\/chromium[^/]*-\d+\//.exec(wanted)?.[1];
  if (!cache || !existsSync(cache)) throw new Error("no chromium (set CHROMIUM_PATH)");
  return (
    readdirSync(cache)
      .filter((d) => /^chromium_headless_shell-\d+$/.test(d))
      .sort()
      .reverse()
      .flatMap((d) => readdirSync(path.join(cache, d)).map((sub) => path.join(cache, d, sub, "chrome-headless-shell")))
      .find((p) => existsSync(p)) ?? (() => { throw new Error("no chromium (set CHROMIUM_PATH)"); })()
  );
}

const playwright = loadPlaywright();
const executablePath = findChromium(playwright.chromium);
mkdirSync(outDir, { recursive: true });
const web = await startServer({ port: WEB_PORT });
console.log(`web ${web.url} · shots → ${outDir}`);

const context = await playwright.chromium.launchPersistentContext(profile, { headless: true, executablePath, viewport: { width: 1180, height: 900 } });

try {
  const boot = await context.newPage();
  await boot.goto(web.url, { waitUntil: "domcontentloaded" });
  await boot.evaluate(() => localStorage.setItem("inborn.prefs", JSON.stringify({ onboarded: true, locale: "en" })));
  await boot.getByTestId("download-model").waitFor({ timeout: 20_000 }).catch(() => undefined);
  if (await boot.getByTestId("download-model").count()) {
    console.log("  downloading the model into OPFS (once per profile)…");
    await boot.getByTestId("download-model").click();
    await boot.getByTestId("download-door").waitFor({ state: "detached", timeout: 10 * 60_000 });
  }
  await boot.close();

  for (const width of WIDTHS) {
    const page = await context.newPage();
    await page.emulateMedia({ colorScheme: "dark" });
    await page.setViewportSize({ width, height: width < 500 ? 844 : 900 });
    await page.goto(`${web.url}/paywall`, { waitUntil: "domcontentloaded" });
    await page.getByTestId("paywall-title").waitFor({ timeout: 60_000 });
    await page.waitForTimeout(600);
    const row = await page.getByTestId("redeem-code").count();
    console.log(`  ${width}: redeem-code row ${row ? "present" : "absent"}`);
    await page.screenshot({ path: path.join(outDir, `paywall-${width}.png`), fullPage: true });
    /* S60 scrolls inside a ScrollView, so the links row is below the fold at every width: shoot it where it lives. */
    const anchor = row ? page.getByTestId("redeem-code") : page.getByTestId("paywall-title");
    await anchor.scrollIntoViewIfNeeded();
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(outDir, `paywall-links-${width}.png`) });
    await page.close();
  }
} finally {
  await context.close();
  await web.close();
  console.log("closed");
}
