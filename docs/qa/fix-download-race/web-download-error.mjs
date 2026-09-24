#!/usr/bin/env node
// F349 on the browser tier: cut the network, press Download, and record what the door says at every required width.
//   DIST=apps/web/dist OUT=docs/qa/fix-download-race/web-after node docs/qa/fix-download-race/web-download-error.mjs
import { createRequire } from "node:module";
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { startServer } from "../../../scripts/serve-web.mjs";

const out = process.env.OUT ?? "web-out";
mkdirSync(out, { recursive: true });
const pw = createRequire(path.join(process.env.PLAYWRIGHT_CORE_DIR ?? "/Users/moshecohen/.npm/_npx/9833c18b2d85bc59/node_modules", "/"))("playwright-core");
const wanted = pw.chromium.executablePath();
const cache = /^(.*)\/chromium[^/]*-\d+\//.exec(wanted)?.[1];
const shell =
  process.env.CHROMIUM_PATH ??
  (existsSync(wanted)
    ? wanted
    : readdirSync(cache)
        .filter((d) => /^chromium_headless_shell-\d+$/.test(d))
        .sort()
        .reverse()
        .flatMap((d) => readdirSync(path.join(cache, d)).map((s) => path.join(cache, d, s, "chrome-headless-shell")))
        .find((p) => existsSync(p)));
const server = await startServer({ port: 0 });
const browser = await pw.chromium.launch({ headless: true, executablePath: shell });
const result = { url: server.url, widths: {} };
try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addInitScript(() => {
    if (!localStorage.getItem("inborn.prefs")) localStorage.setItem("inborn.prefs", JSON.stringify({ onboarded: true }));
  });
  const page = await ctx.newPage();
  await page.goto(server.url);
  await page.getByTestId("download-model").waitFor({ timeout: 60_000 });
  await ctx.setOffline(true);
  await page.getByTestId("download-model").click();
  await page.getByTestId("download-error").waitFor({ timeout: 60_000 });
  result.error = (await page.getByTestId("download-error").textContent())?.trim();
  result.button = (await page.getByTestId("download-model").textContent())?.trim();
  for (const width of [390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.waitForTimeout(300);
    const shot = path.join(out, `door-error-${width}.png`);
    await page.getByTestId("download-error").scrollIntoViewIfNeeded();
    await page.screenshot({ path: shot, fullPage: true });
    const m = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth }));
    result.widths[width] = { ...m, screenshot: shot };
  }
  const details = page.getByTestId("download-error-details");
  if (await details.count()) {
    await details.click();
    result.raw = (await page.getByTestId("download-error-raw").textContent())?.trim();
    await page.setViewportSize({ width: 390, height: 900 });
    await page.screenshot({ path: path.join(out, "door-error-details-390.png"), fullPage: true });
  }
  await ctx.close();
} finally {
  await browser.close();
  server.close?.();
}
writeFileSync(path.join(out, "result.json"), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
const leaks = /Exception|\.swift|TypeError|Failed to fetch|NetworkError|\(at /;
process.exit(leaks.test(result.error ?? "") ? 1 : 0);
