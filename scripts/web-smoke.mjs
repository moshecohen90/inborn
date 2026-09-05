#!/usr/bin/env node
/**
 * Headless proof of the browser tier (spec §4.4, §14.3), against the deployable build when apps/web/dist exists:
 *   1. first visit: the download door → download into OPFS (cancel + Range resume on the way) → wllama loads from OPFS → one prompt;
 *   2. second visit with the network cut (Playwright setOffline): the service worker boots the page, the model comes from OPFS, chat works;
 *   3. a phone viewport shows the "get the app" door;
 *   4. a browser reporting almost no quota gets the "not enough space" state with the download disabled.
 * Skips (exit 0) when the model or playwright-core is absent.
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
const PROMPT_OFFLINE = "Name one planet of the solar system in one sentence.";
const LOAD_TIMEOUT_MS = 5 * 60_000;
const ANSWER_TIMEOUT_MS = 3 * 60_000;
const STATS_RE = /^wllama · ([\d.]+) tok\/s · TTFT (\d+) ms$/;
const LOADED_RE = /\[wllama\] loaded .* in (\d+) ms · threads=(\d+) isolated=(\w+) gpuLayers=(\d+)/;
const IPHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1";

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
  console.error(`no web export at ${defaults.dist}; run: corepack pnpm web:build`);
  process.exit(1);
}
const playwright = loadPlaywright();
if (!playwright) skip("playwright-core not found (set PLAYWRIGHT_CORE_DIR)");
const executablePath = findChromium(playwright.chromium);
if (!executablePath) skip("no headless chromium installed (set CHROMIUM_PATH)");

const outDir = process.env.SMOKE_OUT_DIR ?? path.join(os.tmpdir(), "inborn-web-smoke");
mkdirSync(outDir, { recursive: true });
const server = await startServer({ port: 0 });
const origin = new URL(server.url).host;
const hasServiceWorker = existsSync(path.join(defaults.dist, "sw.js"));
const result = { model, dist: defaults.dist, url: server.url, isolation: defaults.isolation, serviceWorker: hasServiceWorker, chromium: executablePath, first: {}, offline: {}, phone: {} };
let browser = null;
let failure = null;
let lastPage = null;
let lastConsole = [];

/** Wires request/console capture on a page; hosts are what the page talked to, requests the same-origin URLs (path only). */
function observe(page) {
  const consoleLines = [];
  const hosts = new Set();
  const requests = [];
  const hostOf = (u) => (u.protocol === "blob:" ? hostOf(new URL(u.pathname)) : u.host);
  page.on("request", (r) => {
    const u = new URL(r.url());
    hosts.add(hostOf(u));
    requests.push(`${r.method()} ${u.protocol === "blob:" ? "blob:(worker)" : u.pathname}${r.headers().range ? ` [${r.headers().range}]` : ""}`);
  });
  page.on("console", (msg) => consoleLines.push(`${msg.type()}: ${msg.text()}`));
  page.on("pageerror", (e) => consoleLines.push(`pageerror: ${e.message}`));
  return { consoleLines, hosts, requests };
}

async function waitForEngine(page, out, t0) {
  const engine = page.getByText(/^(wllama|null)$|Could not load/);
  await engine.first().waitFor({ timeout: LOAD_TIMEOUT_MS });
  const header = (await engine.first().textContent()) ?? "";
  if (header !== "wllama") throw new Error(`engine header shows "${header}" instead of wllama`);
  out.readyMs = Date.now() - t0;
}

async function chat(page, out, prompt, loadedLines) {
  const input = page.getByPlaceholder("Message…");
  await input.fill(prompt);
  await input.press("Enter");
  const stats = page.getByText(STATS_RE);
  await stats.waitFor({ timeout: ANSWER_TIMEOUT_MS });
  const [, tps, ttft] = STATS_RE.exec((await stats.textContent()) ?? "") ?? [];
  out.tokPerSec = Number(tps);
  out.ttftMs = Number(ttft);
  out.answer = ((await page.getByTestId("assistant-text").last().textContent()) ?? "").trim();
  const loaded = loadedLines.map((l) => LOADED_RE.exec(l)).find(Boolean);
  if (loaded) Object.assign(out, { engineLoadMs: Number(loaded[1]), threads: Number(loaded[2]), gpuLayers: Number(loaded[4]) });
  if (!out.answer) throw new Error("empty answer");
}

const foreignHosts = (hosts) => [...hosts].filter((h) => h !== origin);

try {
  browser = await playwright.chromium.launch({ headless: true, executablePath });
  const context = await browser.newContext({ viewport: { width: 1180, height: 800 } });

  /* 1. First visit: download door → OPFS → wllama → chat. */
  {
    const page = await context.newPage();
    const { consoleLines, hosts, requests } = observe(page);
    lastPage = page;
    lastConsole = consoleLines;
    const out = result.first;
    const t0 = Date.now();
    await page.goto(server.url);
    await page.getByTestId("download-door").waitFor({ timeout: 60_000 });
    out.gateText = (await page.getByTestId("web-strip").textContent()) ?? "";
    await page.screenshot({ path: path.join(outDir, "web-smoke-door.png") });
    out.storageBefore = await page.evaluate(() => navigator.storage.estimate().then((e) => e.usage ?? null));
    await page.getByTestId("download-model").click();
    await page.getByTestId("download-progress").waitFor({ timeout: 60_000 });
    /* Cancel mid-way, then resume: proves the pause/midstate and the Range request. On a fast disk the file may finish first. */
    const cancel = page.getByTestId("download-cancel");
    if (await cancel.isVisible().catch(() => false)) {
      await cancel.click();
      const resume = page.getByTestId("download-resume");
      if (await resume.waitFor({ timeout: 5_000 }).then(() => true, () => false)) {
        out.resumedFrom = (await resume.textContent()) ?? "";
        await page.screenshot({ path: path.join(outDir, "web-smoke-paused.png") });
        await resume.click();
      }
    }
    await waitForEngine(page, out, t0);
    out.downloadRequests = requests.filter((r) => r.includes("/models/instant.gguf"));
    out.crossOriginIsolated = await page.evaluate(() => globalThis.crossOriginIsolated);
    out.webgpu = await page.evaluate(async () => (navigator.gpu ? !!(await navigator.gpu.requestAdapter()) : false));
    out.storageAfter = await page.evaluate(() => navigator.storage.estimate().then((e) => e.usage ?? null));
    out.persisted = await page.evaluate(() => navigator.storage.persisted());
    await chat(page, out, PROMPT, consoleLines);
    out.offlineState = (await page.getByTestId("web-offline-state").textContent()) ?? "";
    if (hasServiceWorker) {
      await page.evaluate(() => navigator.serviceWorker.ready);
      await page.getByTestId("web-offline-state").filter({ hasText: "Works offline" }).waitFor({ timeout: 30_000 });
      out.offlineState = (await page.getByTestId("web-offline-state").textContent()) ?? "";
    }
    out.memoryMB = await page.evaluate(async () => {
      try {
        return Math.round((await performance.measureUserAgentSpecificMemory()).bytes / 1048576);
      } catch {
        return null;
      }
    });
    out.screenshot = path.join(outDir, "web-smoke.png");
    await page.screenshot({ path: out.screenshot, fullPage: true });
    out.consoleErrors = consoleLines.filter((l) => /^(error|pageerror)/.test(l));
    out.hosts = [...hosts];
    if (foreignHosts(hosts).length) throw new Error(`the page talked to ${foreignHosts(hosts).join(", ")}; only ${origin} is allowed`);
    if (out.crossOriginIsolated !== defaults.isolation) throw new Error(`crossOriginIsolated=${out.crossOriginIsolated} with ISOLATION=${defaults.isolation ? "on" : "off"}`);
    if (!defaults.isolation && out.threads !== 1) throw new Error(`expected the single-thread fallback, got threads=${out.threads}`);
    await page.close();
  }

  /* 2. Second visit, network cut: the service worker serves the app, the model comes from OPFS. */
  if (hasServiceWorker) {
    await context.setOffline(true);
    const page = await context.newPage();
    const { consoleLines, hosts, requests } = observe(page);
    lastPage = page;
    lastConsole = consoleLines;
    const out = result.offline;
    const t0 = Date.now();
    await page.goto(server.url);
    await waitForEngine(page, out, t0);
    await chat(page, out, PROMPT_OFFLINE, consoleLines);
    out.requests = requests;
    out.hosts = [...hosts];
    out.navigatorOnLine = await page.evaluate(() => navigator.onLine);
    out.screenshot = path.join(outDir, "web-smoke-offline.png");
    await page.screenshot({ path: out.screenshot, fullPage: true });
    out.consoleErrors = consoleLines.filter((l) => /^(error|pageerror)/.test(l));
    if (foreignHosts(hosts).length) throw new Error(`offline page talked to ${foreignHosts(hosts).join(", ")}`);
    if (requests.some((r) => r.includes("/models/instant.gguf"))) throw new Error("offline visit fetched the model again instead of reading OPFS");
    await page.close();
    await context.setOffline(false);
  } else {
    result.offline = { skipped: "no sw.js in the served dist; run: corepack pnpm web:build" };
  }
  await context.close();

  /* 3. A phone: the gate says Instant only + get the app (spec §8.9). */
  {
    const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, userAgent: IPHONE_UA, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    const page = await phone.newPage();
    const out = result.phone;
    await page.goto(server.url);
    await page.getByTestId("phone-door").waitFor({ timeout: 60_000 });
    out.door = (await page.getByTestId("phone-door").textContent()) ?? "";
    out.getApp = await page.getByTestId("get-app").isVisible();
    out.screenshot = path.join(outDir, "web-smoke-phone.png");
    await page.screenshot({ path: out.screenshot, fullPage: true });
    if (!/Install the app/.test(out.door)) throw new Error(`phone door text unexpected: ${out.door}`);
    await phone.close();
  }

  /* 4. Not enough space: the estimate says 100 MB free, so the door refuses before a byte moves (spec §10 row 5). */
  {
    const tight = await browser.newContext({ viewport: { width: 1180, height: 800 } });
    await tight.addInitScript(() => {
      navigator.storage.estimate = async () => ({ usage: 0, quota: 100 * 1024 * 1024 });
    });
    const page = await tight.newPage();
    const out = (result.noSpace = {});
    await page.goto(server.url);
    await page.getByTestId("no-space").waitFor({ timeout: 60_000 });
    out.text = (await page.getByTestId("no-space").textContent()) ?? "";
    out.buttonDisabled = await page.getByTestId("download-model").isDisabled();
    out.screenshot = path.join(outDir, "web-smoke-nospace.png");
    await page.screenshot({ path: out.screenshot });
    if (!out.buttonDisabled) throw new Error("download button enabled although space is short");
    await tight.close();
  }
} catch (e) {
  failure = e;
  /* What the page showed when it went wrong: the door/error text, the status line, the console, a screenshot. */
  if (lastPage && !lastPage.isClosed()) {
    result.failure = {
      door: await lastPage.getByTestId("download-door").textContent({ timeout: 1000 }).catch(() => null),
      error: await lastPage.getByTestId("download-error").textContent({ timeout: 1000 }).catch(() => null),
      status: await lastPage.getByTestId("status-line").textContent({ timeout: 1000 }).catch(() => null),
      console: lastConsole.slice(-30),
      screenshot: path.join(outDir, "web-smoke-fail.png"),
    };
    await lastPage.screenshot({ path: result.failure.screenshot }).catch(() => undefined);
  }
} finally {
  await browser?.close();
  await server.close();
}
console.log(JSON.stringify(result, null, 2));
if (failure) {
  console.error(`FAIL: ${failure.message}`);
  process.exit(1);
}
const f = result.first;
const o = result.offline;
console.log(`PASS: first visit ready ${f.readyMs} ms · ${f.tokPerSec} tok/s · TTFT ${f.ttftMs} ms · threads=${f.threads ?? "?"} · isolated=${f.crossOriginIsolated}`);
if (o.readyMs) console.log(`PASS: offline visit ready ${o.readyMs} ms · ${o.tokPerSec} tok/s · TTFT ${o.ttftMs} ms · requests=${o.requests.length} · model fetches=0`);
console.log(`PASS: phone door "${result.phone.door}"`);
console.log(`PASS: no-space door "${result.noSpace.text}"`);
