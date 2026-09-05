#!/usr/bin/env node
/**
 * Headless proof of the browser tier: serve the web export, let wllama load the dev GGUF, send one prompt through the
 * real Chat screen and read the header's stats line. Skips (exit 0) when the model or playwright-core is absent.
 *
 *   MODELS_DIR=/path/to/ggufs SMOKE_OUT_DIR=/tmp node scripts/web-smoke.mjs
 *
 * PLAYWRIGHT_CORE_DIR: a node_modules dir holding playwright-core (default: the npx cache used on this machine).
 * CHROMIUM_PATH: the headless shell binary (default: Playwright's registry, or any chromium_headless_shell-* in its cache).
 * ISOLATION=off serves without COOP/COEP, which must land on the single-thread fallback.
 */
import { createRequire } from "node:module";
import { existsSync, mkdirSync, readdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { URL } from "node:url";
import { defaults, resolveFile, startServer } from "./serve-web.mjs";

const PROMPT = "What is the capital of France? Answer in one sentence.";
const LOAD_TIMEOUT_MS = 5 * 60_000;
const ANSWER_TIMEOUT_MS = 3 * 60_000;
const STATS_RE = /^wllama · ([\d.]+) tok\/s · TTFT (\d+) ms$/;
const LOADED_RE = /\[wllama\] loaded .* in (\d+) ms · threads=(\d+) isolated=(\w+) gpuLayers=(\d+)/;

const skip = (why) => {
  console.log(`SKIP: ${why}`);
  process.exit(0);
};

function loadPlaywright() {
  const dirs = [process.env.PLAYWRIGHT_CORE_DIR, "/Users/moshecohen/.npm/_npx/9833c18b2d85bc59/node_modules"].filter(Boolean);
  for (const dir of dirs) {
    try {
      return createRequire(path.join(dir, "/"))("playwright-core");
    } catch {
      /* try the next location */
    }
  }
  return null;
}

/* An alpha playwright-core asks for a newer revision than the cache holds; any installed headless shell drives this page. */
function findChromium(chromium) {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  const wanted = chromium.executablePath();
  if (existsSync(wanted)) return wanted;
  const cache = /^(.*)\/chromium[^/]*-\d+\//.exec(wanted)?.[1];
  if (!cache || !existsSync(cache)) return null;
  const shells = readdirSync(cache).filter((d) => /^chromium_headless_shell-\d+$/.test(d)).sort().reverse();
  return shells
    .flatMap((d) => readdirSync(path.join(cache, d)).map((sub) => path.join(cache, d, sub, "chrome-headless-shell")))
    .find((p) => existsSync(p)) ?? null;
}

const model = resolveFile("/models/instant.gguf", defaults);
if (!model) skip(`no instant.gguf under ${defaults.modelsDir} (set MODELS_DIR / INSTANT_GGUF)`);
if (!existsSync(path.join(defaults.dist, "index.html"))) {
  console.error(`no web export at ${defaults.dist}; run: corepack pnpm --filter @inborn/mobile export:web`);
  process.exit(1);
}
const playwright = loadPlaywright();
if (!playwright) skip("playwright-core not found (set PLAYWRIGHT_CORE_DIR)");
const executablePath = findChromium(playwright.chromium);
if (!executablePath) skip("no headless chromium installed (set CHROMIUM_PATH)");

const outDir = process.env.SMOKE_OUT_DIR ?? path.join(os.tmpdir(), "inborn-web-smoke");
mkdirSync(outDir, { recursive: true });
const server = await startServer({ port: 0 });
const result = { model, url: server.url, isolation: defaults.isolation, prompt: PROMPT, chromium: executablePath };
let browser = null;
let failure = null;
try {
  browser = await playwright.chromium.launch({ headless: true, executablePath });
  const page = await browser.newPage({ viewport: { width: 480, height: 800 } });
  const consoleLines = [];
  const hosts = new Set();
  /* blob: URLs (wllama's workers) carry the creating origin in their path. */
  const hostOf = (u) => (u.protocol === "blob:" ? hostOf(new URL(u.pathname)) : u.host);
  page.on("request", (r) => hosts.add(hostOf(new URL(r.url()))));
  page.on("console", (msg) => consoleLines.push(`${msg.type()}: ${msg.text()}`));
  page.on("pageerror", (e) => consoleLines.push(`pageerror: ${e.message}`));
  const t0 = Date.now();
  await page.goto(server.url);
  const engine = page.getByText(/^(wllama|null)$|Could not load/);
  await engine.first().waitFor({ timeout: LOAD_TIMEOUT_MS });
  const header = (await engine.first().textContent()) ?? "";
  if (header !== "wllama") throw new Error(`engine header shows "${header}" instead of wllama`);
  result.loadMs = Date.now() - t0;
  result.crossOriginIsolated = await page.evaluate(() => globalThis.crossOriginIsolated);
  result.webgpu = await page.evaluate(async () => (navigator.gpu ? !!(await navigator.gpu.requestAdapter()) : false));
  const loaded = consoleLines.map((l) => LOADED_RE.exec(l)).find(Boolean);
  if (loaded) Object.assign(result, { engineLoadMs: Number(loaded[1]), threads: Number(loaded[2]), gpuLayers: Number(loaded[4]) });

  const input = page.getByPlaceholder("Message…");
  await input.fill(PROMPT);
  await input.press("Enter");
  const stats = page.getByText(STATS_RE);
  await stats.waitFor({ timeout: ANSWER_TIMEOUT_MS });
  const [, tps, ttft] = STATS_RE.exec((await stats.textContent()) ?? "") ?? [];
  result.tokPerSec = Number(tps);
  result.ttftMs = Number(ttft);
  result.answer = ((await page.getByTestId("assistant-text").last().textContent()) ?? "").trim();
  result.memoryMB = await page.evaluate(async () => {
    try {
      return Math.round((await performance.measureUserAgentSpecificMemory()).bytes / 1048576);
    } catch {
      return null;
    }
  });
  result.screenshot = path.join(outDir, "web-smoke.png");
  await page.screenshot({ path: result.screenshot, fullPage: true });
  result.consoleErrors = consoleLines.filter((l) => /^(error|pageerror)/.test(l));
  result.hosts = [...hosts];
  const foreign = result.hosts.filter((h) => h !== new URL(server.url).host);
  if (foreign.length) throw new Error(`the page talked to ${foreign.join(", ")}; only ${server.url} is allowed`);
  if (result.crossOriginIsolated !== defaults.isolation) throw new Error(`crossOriginIsolated=${result.crossOriginIsolated} with ISOLATION=${defaults.isolation ? "on" : "off"}`);
  if (!defaults.isolation && result.threads !== 1) throw new Error(`expected the single-thread fallback, got threads=${result.threads}`);
} catch (e) {
  failure = e;
} finally {
  await browser?.close();
  await server.close();
}
console.log(JSON.stringify(result, null, 2));
if (failure) {
  console.error(`FAIL: ${failure.message}`);
  process.exit(1);
}
if (!result.answer) {
  console.error("FAIL: empty answer");
  process.exit(1);
}
console.log(`PASS: load ${result.loadMs} ms · ${result.tokPerSec} tok/s · TTFT ${result.ttftMs} ms · threads=${result.threads ?? "?"} · isolated=${result.crossOriginIsolated}`);
