#!/usr/bin/env node
/* global Navigator, URL, window */
/**
 * Round 105 headless proof: a photo attached in the browser → the photo-pack hold card → Download from this host →
 * the held message goes out by itself → Instant answers about the fixture (a red circle over the word CAT).
 * Also shoots the vault's Extensions section and the onboarding Model step's "extensions later" line.
 *
 *   MODELS_DIR=… GPU=off|on WIDTH=1440 PORT=8931 OUT=docs/qa/extensions-web-vision/after node probe.mjs
 */
import { createRequire } from "node:module";
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "../../..");
const { startServer } = await import(path.join(repo, "scripts/serve-web.mjs"));
const PHOTO = path.join(repo, "scripts/fixtures/photo/red-circle-cat.png");
const QUESTION = "What colour is the shape in this photo, what shape is it, and what word is written under it?";
const WIDTH = Number(process.env.WIDTH ?? 1440);
const GPU = process.env.GPU ?? "off";
const OUT = path.resolve(process.env.OUT ?? path.join(here, `after-${GPU}-${WIDTH}`));
const TIMEOUT = 10 * 60_000;
mkdirSync(OUT, { recursive: true });

const pw = createRequire(path.join(process.env.PLAYWRIGHT_CORE_DIR ?? "/Users/moshecohen/.npm/_npx/9833c18b2d85bc59/node_modules", "/"))("playwright-core");
function chromium() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  const wanted = pw.chromium.executablePath();
  if (existsSync(wanted)) return wanted;
  const cache = /^(.*)\/chromium[^/]*-\d+\//.exec(wanted)?.[1];
  const shells = readdirSync(cache).filter((d) => /^chromium_headless_shell-\d+$/.test(d)).sort().reverse();
  return shells.flatMap((d) => readdirSync(path.join(cache, d)).map((s) => path.join(cache, d, s, "chrome-headless-shell"))).find((p) => existsSync(p));
}

const server = await startServer({ port: Number(process.env.PORT ?? 8931) });
const browser = await pw.chromium.launch({ headless: true, executablePath: chromium(), args: GPU === "on" ? ["--enable-unsafe-webgpu", "--enable-features=WebGPU", "--use-angle=metal"] : [] });
const result = { width: WIDTH, gpu: GPU, server: server.url };
const lines = [];
const shot = (page, name) => page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: false });
try {
  const ctx = await browser.newContext({ viewport: { width: WIDTH, height: WIDTH < 600 ? 844 : 900 }, ...(WIDTH < 600 ? { isMobile: false, hasTouch: false } : {}) });
  if (GPU === "off") await ctx.addInitScript(() => Object.defineProperty(Navigator.prototype, "gpu", { get: () => undefined, configurable: true }));
  const page = await ctx.newPage();
  page.on("console", (m) => lines.push(`${m.type()}: ${m.text()}`));
  page.on("pageerror", (e) => lines.push(`pageerror: ${e.message}`));
  await page.goto(server.url);
  result.webgpu = await page.evaluate(async () => !!(navigator.gpu && (await navigator.gpu.requestAdapter().catch(() => null))));
  /* A first visit is onboarding (round 103); the Model step is the download door. */
  await page.getByTestId("onboarding-welcome").waitFor({ timeout: 60_000 });
  await page.getByTestId("onboarding-continue").click();
  await page.getByTestId("download-door").waitFor({ timeout: 60_000 });
  result.onboardingLine = ((await page.getByTestId("web-extensions-later").textContent()) ?? "").trim();
  await page.getByTestId("web-extensions-later").scrollIntoViewIfNeeded();
  await shot(page, "00-onboarding-model-step");
  if (!(await page.getByTestId("web-model-choose-instant").count()) && (await page.getByTestId("web-model-options-toggle").count())) await page.getByTestId("web-model-options-toggle").click();
  if (await page.getByTestId("web-model-choose-instant").count()) await page.getByTestId("web-model-choose-instant").click();
  await page.getByTestId("download-model").click();
  const start = page.getByTestId("sealed-start");
  await start.waitFor({ timeout: TIMEOUT });
  for (let i = 0; i < 100 && (await start.isDisabled()); i++) await page.waitForTimeout(100);
  await start.click();
  await page.getByTestId("lock-start").click();
  await page.getByTestId("composer-input").waitFor({ timeout: TIMEOUT });
  for (let i = 0; i < 3000 && !lines.some((l) => /\[inborn\] wllama loaded/.test(l)); i++) await page.waitForTimeout(100);

  /* The Photo row is open in a browser, and says the first photo brings the pack. */
  await page.getByTestId("attach").click();
  await page.getByTestId("attach-photo").waitFor();
  result.photoRow = ((await page.getByTestId("attach-photo").textContent()) ?? "").trim();
  result.photoRowDisabled = (await page.getByTestId("attach-photo").getAttribute("aria-disabled")) === "true";
  await shot(page, "01-attach-sheet");
  const [chooser] = await Promise.all([page.waitForEvent("filechooser", { timeout: 15_000 }), page.getByTestId("attach-photo").click()]);
  await chooser.setFiles(PHOTO);
  await page.getByTestId("pending-images").waitFor({ timeout: 30_000 });
  await page.getByTestId("composer-input").fill(QUESTION);
  await page.getByTestId("send").click();
  await page.getByTestId("vision-hold").waitFor({ timeout: 30_000 });
  result.hold = ((await page.getByTestId("vision-hold").textContent()) ?? "").trim();
  await shot(page, "02-hold-card");
  const answers = await page.getByTestId("ledger-toggle").count();
  const t0 = Date.now();
  await page.getByTestId("vision-hold-download").click();
  await page.getByTestId("vision-hold-body").filter({ hasText: /%/ }).waitFor({ timeout: 60_000 }).catch(() => undefined);
  await shot(page, "03-downloading");
  await page.getByTestId("vision-hold").waitFor({ state: "detached", timeout: TIMEOUT });
  result.downloadMs = Date.now() - t0;
  const t1 = Date.now();
  const ledger = page.getByTestId("ledger-toggle");
  for (let i = 0; i < TIMEOUT / 250 && (await ledger.count()) <= answers && !lines.some((l) => /pageerror|violates the following Content Security/.test(l)); i++) await page.waitForTimeout(250);
  result.sendToAnswerMs = Date.now() - t1;
  result.answer = ((await page.getByTestId("assistant-text").last().textContent().catch(() => "")) ?? "").trim();
  result.errorRow = ((await page.getByTestId("assistant-error").last().textContent({ timeout: 1000 }).catch(() => "")) ?? "").trim();
  result.photoTurn = lines.find((l) => /\[wllama\] photo turn/.test(l)) ?? null;
  result.projectorLoad = lines.find((l) => /\+ projector in/.test(l)) ?? null;
  result.userImage = await page.locator("img").evaluateAll((els) => els.filter((e) => e.src.startsWith("data:image/jpeg")).length);
  await shot(page, "04-photo-answer");
  const a = result.answer.toLowerCase();
  result.namesColour = /\bred\b/.test(a);
  result.namesShape = /circle|circular|round|dot|ball|sphere|disc|disk/.test(a);
  result.namesWord = /\bcat\b/.test(a);

  await page.goto(new URL("/vault", server.url).href);
  await page.getByTestId("vault-extensions").waitFor({ timeout: 60_000 });
  await page.getByTestId("ext-state-vision-qwen35").filter({ hasText: /Installed/ }).waitFor({ timeout: 30_000 }).catch(() => undefined);
  await page.getByTestId("vault-extensions").scrollIntoViewIfNeeded();
  result.vault = ((await page.getByTestId("vault-extensions").textContent()) ?? "").trim();
  await page.getByTestId("vault-extensions").screenshot({ path: path.join(OUT, "05-vault-extensions.png") });

  result.hScroll = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  await ctx.close();
} catch (e) {
  result.error = e.message;
} finally {
  result.console = lines.filter((l) => /wllama|photo|projector|pageerror|error/i.test(l)).slice(-40);
  writeFileSync(path.join(OUT, "result.json"), JSON.stringify(result, null, 2));
  await browser.close();
  await server.close();
}
console.log(JSON.stringify({ ...result, console: undefined }, null, 2));
if (result.error) process.exit(1);
