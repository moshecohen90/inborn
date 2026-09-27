#!/usr/bin/env node
/**
 * F411 + F412: a reader who downloaded the model once never meets the Model step or a second download again.
 *
 *   first:    a fresh persistent profile downloads the offered model in the Model step; the page asks navigator.storage.persist()
 *             after the download completes and records the answer (Settings -> Privacy & storage shows it).
 *   granted:  the durable-storage permission granted through CDP (what Chrome grants a bookmarked / installed / engaged
 *             site); the next load's request comes back granted and Settings says the storage is protected.
 *   restart:  the browser is closed and relaunched on the same profile.
 *   8 days:   the page's clock is pinned 8 days ahead (past Safari's 7-day line, which Chromium does not apply).
 *   update:   a new build is deployed and the service worker hands over (round 104 path).
 *   Each of the last three must reach the chat on wllama with no GGUF request and no Model step on screen.
 *
 *   node scripts/web-return-check.mjs            (standalone; web-smoke.mjs runs it too)
 */
import { cpSync, mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { URL, fileURLToPath } from "node:url";
import { defaults, startServer } from "./serve-web.mjs";
import { buildOf, stamp, waitForBuild } from "./web-update-check.mjs";

const ENGINE_RE = /\[inborn\] (\w+) loaded .* in (\d+) ms/;
const PERSIST_RE = /\[storage\] persist after (download|onboarded): (granted|refused)/;
const DAY_MS = 86_400_000;
const LOAD_TIMEOUT_MS = 3 * 60_000;

/** Flags any Model step that shows at all on a page. */
function watchModelStep() {
  const seen = () => {
    if (document.querySelector('[data-testid="download-door"], [data-testid="onboarding-model"], [data-testid="download-model"]')) globalThis.__inbornSawModelStep = true;
  };
  new globalThis.MutationObserver(seen).observe(document, { childList: true, subtree: true });
}

/** The page's own clock, `days` ahead; the browser's cookie and storage clocks are untouched (that is the point of F412). */
function pinClockAhead(days) {
  const shift = days * 86_400_000;
  const RealDate = Date;
  class Shifted extends RealDate {
    constructor(...args) {
      if (args.length) super(...args);
      else super(RealDate.now() + shift);
    }
    static now() {
      return RealDate.now() + shift;
    }
  }
  globalThis.Date = Shifted;
}

function watch(page) {
  const lines = [];
  const models = [];
  page.on("console", (m) => lines.push(m.text()));
  page.on("request", (r) => {
    if (/\/models\/[^?]*\.gguf/.test(r.url())) models.push(`${r.method()} ${new URL(r.url()).pathname}${r.headers().range ? ` [${r.headers().range}]` : ""}`);
  });
  return { lines, models };
}

async function waitFor(lines, re, ms) {
  const deadline = Date.now() + ms;
  for (;;) {
    const hit = lines.map((l) => re.exec(l)).find(Boolean);
    if (hit) return hit;
    if (Date.now() > deadline) throw new Error(`console never matched ${re}`);
    await new Promise((r) => setTimeout(r, 100));
  }
}

/** A returning visit: the chat on wllama, the model read from OPFS, and no Model step at any point. */
async function returning(page, w, url, name, outDir) {
  const t0 = Date.now();
  await page.goto(url);
  await page.getByTestId("composer-input").waitFor({ timeout: LOAD_TIMEOUT_MS });
  const [, engine] = await waitFor(w.lines, ENGINE_RE, LOAD_TIMEOUT_MS);
  const r = {
    engine,
    ms: Date.now() - t0,
    ggufRequests: [...w.models],
    sawModelStep: await page.evaluate(() => globalThis.__inbornSawModelStep === true),
    pageNow: await page.evaluate(() => new Date().toISOString()),
    path: new URL(page.url()).pathname,
  };
  await page.screenshot({ path: path.join(outDir, `return-${name}.png`) });
  r.ok = engine === "wllama" && r.ggufRequests.length === 0 && !r.sawModelStep && r.path === "/";
  return r;
}

async function durableRow(page, url, outDir, name) {
  await page.goto(`${url}/settings/storage`);
  await page.getByTestId("storage-durable").waitFor({ timeout: 60_000 });
  const text = ((await page.getByTestId("storage-durable").textContent()) ?? "").trim();
  await page.screenshot({ path: path.join(outDir, `return-settings-${name}.png`), fullPage: true });
  return text;
}

export async function returnCheck({ chromium, executablePath, dist = defaults.dist, outDir }) {
  const root = mkdtempSync(path.join(os.tmpdir(), "inborn-return-"));
  const site = path.join(root, "site");
  cpSync(dist, site, { recursive: true });
  stamp(site, "A");
  const host = await startServer({ port: 0, dist: site });
  const url = host.url.replace(/\/$/, "");
  const profile = path.join(root, "profile");
  const launch = () => chromium.launchPersistentContext(profile, { executablePath, headless: true, viewport: { width: 1440, height: 900 } });
  const out = { t0: Date.now() };
  let context = null;
  try {
    /* first: the download, and the persist request that follows it */
    context = await launch();
    await context.addInitScript(watchModelStep);
    let page = context.pages()[0] ?? (await context.newPage());
    let w = watch(page);
    await page.goto(`${url}/onboarding/model`);
    await page.getByTestId("download-model").waitFor({ timeout: 60_000 });
    /* Instant, the smallest model, keeps this under the smoke's budget; which model is offered is not what this checks. */
    if (await page.getByTestId("web-model-choose-instant").count() === 0) await page.getByTestId("web-model-options-toggle").click();
    if (await page.getByTestId("web-model-choose-instant").count()) {
      await page.getByTestId("web-model-choose-instant").click();
      await page.getByTestId("download-model").waitFor({ timeout: 30_000 });
    }
    const atClick = w.lines.length;
    await page.getByTestId("download-model").click();
    /* The step reloads onto Sealed once the file is in OPFS; the rest of onboarding is not what this checks. */
    await page.getByTestId("onboarding-sealed").waitFor({ timeout: LOAD_TIMEOUT_MS });
    const downloadRecord = await page.evaluate(() => localStorage.getItem("inborn.storage.persist"));
    out.downloadMs = Date.now() - out.t0;
    await page.evaluate(() => localStorage.setItem("inborn.prefs", JSON.stringify({ ...JSON.parse(localStorage.getItem("inborn.prefs") ?? "{}"), onboarded: true })));
    await page.goto(`${url}/`);
    await page.getByTestId("composer-input").waitFor({ timeout: LOAD_TIMEOUT_MS });
    await waitFor(w.lines, ENGINE_RE, LOAD_TIMEOUT_MS);
    const persistIdx = w.lines.findIndex((l, i) => i >= atClick && PERSIST_RE.test(l) && l.includes("after download"));
    out.first = {
      ggufRequests: w.models.length,
      persistLine: persistIdx >= 0 ? w.lines[persistIdx] : null,
            record: downloadRecord,
      persistedHeadless: await page.evaluate(() => navigator.storage.persisted()),
    };
    out.first.settings = await durableRow(page, url, outDir, "first");
    await page.waitForFunction(() => !!navigator.serviceWorker?.controller, null, { timeout: 60_000 });

    /* granted: Chrome's own grant, then the app's onboarded request records it and Settings says so */
    const cdp = await context.newCDPSession(page);
    await cdp.send("Browser.grantPermissions", { origin: url, permissions: ["durableStorage"] });
    w = watch(page);
    await page.goto(`${url}/`);
    await page.getByTestId("composer-input").waitFor({ timeout: LOAD_TIMEOUT_MS });
    const [line] = await waitFor(w.lines, /\[storage\] persist after onboarded: \w+/, 30_000);
    out.granted = { line, persisted: await page.evaluate(() => navigator.storage.persisted()) };
    out.granted.settings = await durableRow(page, url, outDir, "granted");
    await context.close();
    context = null;

    /* restart: same profile, new browser process */
    context = await launch();
    await context.addInitScript(watchModelStep);
    page = context.pages()[0] ?? (await context.newPage());
    out.restart = await returning(page, watch(page), `${url}/`, "restart", outDir);
    out.restart.persisted = await page.evaluate(() => navigator.storage.persisted());

    /* 8 days later by the page's clock */
    const later = await context.newPage();
    await later.addInitScript(pinClockAhead, 8);
    out.eightDays = await returning(later, watch(later), `${url}/`, "8-days", outDir);
    out.eightDays.ok = out.eightDays.ok && Date.parse(out.eightDays.pageNow) - Date.now() > 7 * DAY_MS;
    await later.close();

    /* update: a deploy lands and the page's own hand-over (F404) reloads it onto the new build; the model stays */
    stamp(site, "B");
    const tu = Date.now();
    await page.evaluate(() => navigator.serviceWorker.getRegistration().then((r) => r?.update()));
    const handedOver = await waitForBuild(page, "B", 30_000);
    out.update = { handedOver, handOverMs: Date.now() - tu, ...(await returning(page, watch(page), `${url}/`, "update", outDir)) };
    out.update.buildAfter = await buildOf(page);
    out.update.ok = out.update.ok && handedOver === "B" && out.update.buildAfter === "B";
  } finally {
    await context?.close();
    await host.close();
    rmSync(root, { recursive: true, force: true });
  }
  out.ms = Date.now() - out.t0;
  delete out.t0;
  out.ok =
    out.first.ggufRequests > 0 &&
    !!out.first.persistLine &&
    !!out.first.record &&
    /granted/.test(out.granted.line) &&
    out.granted.persisted === true &&
    out.restart.ok &&
    out.eightDays.ok &&
    out.update.ok;
  return out;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { createRequire } = await import("node:module");
  const dir = process.env.PLAYWRIGHT_CORE_DIR ?? "/Users/moshecohen/.npm/_npx/9833c18b2d85bc59/node_modules";
  const { chromium } = createRequire(path.join(dir, "/"))("playwright-core");
  const { existsSync, readdirSync } = await import("node:fs");
  const cache = path.join(os.homedir(), "Library/Caches/ms-playwright");
  const shells = existsSync(cache) ? readdirSync(cache).filter((d) => /^chromium_headless_shell-\d+$/.test(d)).sort().reverse() : [];
  const found = shells.flatMap((d) => readdirSync(path.join(cache, d)).map((sub) => path.join(cache, d, sub, "chrome-headless-shell"))).find((p) => existsSync(p));
  const executablePath = process.env.CHROMIUM_PATH ?? found ?? chromium.executablePath();
  const outDir = process.env.SMOKE_OUT_DIR ?? mkdtempSync(path.join(os.tmpdir(), "inborn-return-out-"));
  const result = await returnCheck({ chromium, executablePath, outDir });
  console.log(JSON.stringify(result, null, 2));
  console.log(result.ok ? "RETURN CHECK: PASS" : "RETURN CHECK: FAIL");
  process.exit(result.ok ? 0 : 1);
}
