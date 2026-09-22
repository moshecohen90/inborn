#!/usr/bin/env node
/**
 * Screenshots of the real web export at desktop, wide and phone widths (spec §8.9).
 * One browser, one context: the model is downloaded once into OPFS and every shot is taken against it.
 *
 *   MODELS_DIR=/path/to/ggufs node docs/qa/desktop-layout/shots.mjs
 *
 * Reads the same server and Chromium the web smoke uses (scripts/serve-web.mjs, scripts/web-smoke.mjs).
 */
import { createRequire } from "node:module";
import { existsSync, mkdirSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startServer } from "../../../scripts/serve-web.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = process.env.SHOTS_OUT_DIR ?? here;
const PROMPT = "What is the capital of France? Answer in one sentence.";

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
  return readdirSync(cache)
    .filter((d) => /^chromium_headless_shell-\d+$/.test(d))
    .sort()
    .reverse()
    .flatMap((d) => readdirSync(path.join(cache, d)).map((sub) => path.join(cache, d, sub, "chrome-headless-shell")))
    .find((p) => existsSync(p)) ?? null;
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
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(outDir, name) });
  console.log(`shot ${name}`);
};

try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 });
  await context.addInitScript(() => {
    if (!localStorage.getItem("inborn.prefs")) localStorage.setItem("inborn.prefs", JSON.stringify({ onboarded: true }));
  });
  const page = await context.newPage();
  page.on("pageerror", (e) => console.log(`pageerror: ${e.message}`));
  await page.goto(server.url);
  await page.getByTestId("download-door").waitFor({ timeout: 60_000 });
  await page.getByTestId("download-model").click();
  await page.getByTestId("composer-input").waitFor({ timeout: 5 * 60_000 });

  await page.getByTestId("composer-input").fill(PROMPT);
  await page.getByTestId("send").click();
  await page.getByTestId("ledger-toggle").last().waitFor({ timeout: 3 * 60_000 });
  await shot(page, "01-desktop-1280x800-chat.png");

  await page.keyboard.press("Meta+k");
  await page.getByTestId("command-palette").waitFor({ timeout: 10_000 });
  await shot(page, "02-desktop-1280x800-palette.png");
  await page.keyboard.press("Escape");

  await page.getByTestId("drawer-documents").click();
  await page.getByTestId("wide-panel").waitFor({ timeout: 10_000 });
  await shot(page, "03-desktop-1280x800-document-panel.png");
  await page.getByTestId("documents-close").click();

  await page.keyboard.press("Meta+\\");
  await page.waitForTimeout(300);
  await shot(page, "04-desktop-1280x800-sidebar-hidden.png");
  await page.keyboard.press("Meta+\\");

  await page.setViewportSize({ width: 1440, height: 900 });
  await shot(page, "05-desktop-1440x900-chat.png");

  await page.setViewportSize({ width: 900, height: 800 });
  await shot(page, "06-wide-900x800-chat.png");

  await page.setViewportSize({ width: 390, height: 844 });
  await shot(page, "07-phone-390x844-chat.png");
  await page.getByTestId("open-chats").click();
  await page.getByTestId("close-chats").waitFor({ timeout: 10_000 });
  await shot(page, "08-phone-390x844-chats.png");
} finally {
  await browser.close();
  await server.close();
}
