#!/usr/bin/env node
/**
 * Browser evidence for the model-switch stream (round 40): the chat header's model chip, the Model sheet it opens,
 * and the weak-language notice after a Hebrew prompt, at 390 and 1440.
 *
 *   MODELS_DIR=/path/to/ggufs node docs/qa/model-switch/shots.mjs
 *
 * SHOTS_STAGE=before takes only the shots the branch can take before the sheet exists.
 * Same server and Chromium the web smoke uses (scripts/serve-web.mjs, docs/qa/desktop-layout/shots.mjs).
 */
import { createRequire } from "node:module";
import { existsSync, mkdirSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startServer } from "../../../scripts/serve-web.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const stage = process.env.SHOTS_STAGE ?? "after";
const outDir = process.env.SHOTS_OUT_DIR ?? path.join(here, stage);
const HEBREW = "מה בירת צרפת? ענה במשפט אחד.";

function loadPlaywright() {
  for (const dir of [process.env.PLAYWRIGHT_CORE_DIR, "/Users/moshecohen/.npm/_npx/9833c18b2d85bc59/node_modules"].filter(Boolean)) {
    try {
      return createRequire(path.join(dir, "/"))("playwright-core");
    } catch {
      /* next */
    }
  }
  return null;
}

function findChromium(chromium) {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  const wanted = chromium.executablePath();
  if (existsSync(wanted)) return wanted;
  const cache = /^(.*)\/chromium[^/]*-\d+\//.exec(wanted)?.[1];
  if (!cache || !existsSync(cache)) return null;
  return (
    readdirSync(cache)
      .filter((d) => /^chromium_headless_shell-\d+$/.test(d))
      .sort()
      .reverse()
      .flatMap((d) => readdirSync(path.join(cache, d)).map((sub) => path.join(cache, d, sub, "chrome-headless-shell")))
      .find((p) => existsSync(p)) ?? null
  );
}

const playwright = loadPlaywright();
const executablePath = playwright && findChromium(playwright.chromium);
if (!playwright || !executablePath) {
  console.log("SKIP: no playwright-core / headless chromium");
  process.exit(0);
}

mkdirSync(outDir, { recursive: true });
const server = await startServer({ port: 0 });
const browser = await playwright.chromium.launch({ headless: true, executablePath });
const shot = async (page, name) => {
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(outDir, name) });
  console.log(`shot ${name}`);
};

try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await context.addInitScript(() => {
    if (!localStorage.getItem("inborn.prefs")) localStorage.setItem("inborn.prefs", JSON.stringify({ onboarded: true }));
  });
  const page = await context.newPage();
  page.on("pageerror", (e) => console.log(`pageerror: ${e.message}`));
  await page.goto(server.url);
  await page.getByTestId("download-door").waitFor({ timeout: 60_000 });
  await page.getByTestId("download-model").click();
  await page.getByTestId("composer-input").waitFor({ timeout: 5 * 60_000 });

  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    await shot(page, `01-${width}-chat-header.png`);
    await page.getByTestId("model-chip").click();
    await page.getByTestId(stage === "before" ? "chat-settings" : "model-sheet").waitFor({ timeout: 10_000 });
    await shot(page, `02-${width}-model-chip-opens.png`);
    await page.getByTestId(stage === "before" ? "settings-done" : "model-sheet-close").click();
    await page.waitForTimeout(600);
  }

  /* The Hebrew turn: every shipped model rates Hebrew none/basic, so the notice must name the better model, never block the prompt. */
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByTestId("composer-input").click();
  await page.keyboard.insertText(HEBREW);
  await page.getByTestId("send").click();
  await page.getByTestId("ledger-toggle").last().waitFor({ timeout: 3 * 60_000 });
  await shot(page, "03-390-hebrew-answer.png");
  await page.setViewportSize({ width: 1440, height: 900 });
  await shot(page, "04-1440-hebrew-answer.png");

  /* The sheet after a Hebrew turn: every row now rates Hebrew, and the line names the closest model instead of claiming a fit. */
  if (stage !== "before") {
    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
      await page.getByTestId("model-chip").click();
      await page.getByTestId("model-sheet").waitFor({ timeout: 10_000 });
      await shot(page, `05-${width}-model-sheet-hebrew.png`);
      /* The sheet is taller than the window at both widths: the footer (vault, chat settings, close) is reached by scrolling. */
      await page.getByTestId("model-sheet-manage").scrollIntoViewIfNeeded();
      await shot(page, `06-${width}-model-sheet-footer.png`);
      await page.getByTestId("model-sheet-close").click();
      await page.waitForTimeout(600);
    }
  }
} finally {
  await browser.close();
  await server.close();
}
