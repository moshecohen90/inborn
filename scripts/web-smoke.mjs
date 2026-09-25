#!/usr/bin/env node
/**
 * Headless proof of the browser tier (spec §4.4, §14.3), against the deployable build when apps/web/dist exists:
 *   1. first visit: the download door → download into OPFS (cancel + Range resume on the way) → onboarding S01-S05
 *      (F40: the model step used to crash the page) → wllama loads from OPFS → one prompt;
 *   2. second visit with the network cut (Playwright setOffline): the service worker boots the page, the model comes from OPFS, chat works;
 *   3. a phone viewport shows the "get the app" door;
 *   4. a browser reporting almost no quota gets the "not enough space" state with the download disabled;
 *   5. an origin that answers the catalog with its own index.html (B1, 24.9.2026) lands on the catalog door with a
 *      retry, instead of a silent empty catalog that reads as "no model on this browser".
 *   1b. <html lang> in every locale (F384), and the passcode lock walked by keyboard and accessibility tree (F381);
 *   7. the development export (apps/mobile/web-build/dev, made by web:build) walks the same first run with zero React
 *      warnings: React only reports props it cannot put on an element in development builds (F371).
 * Skips (exit 0) when the model or playwright-core is absent.
 *
 *   MODELS_DIR=/path/to/ggufs SMOKE_OUT_DIR=/tmp node scripts/web-smoke.mjs
 *
 * PLAYWRIGHT_CORE_DIR: a node_modules dir holding playwright-core (default: the npx cache used on this machine).
 * CHROMIUM_PATH: the headless shell binary (default: Playwright's registry, or any chromium_headless_shell-* in its cache).
 * ISOLATION=off serves without COOP/COEP, which must land on the single-thread fallback.
 * DEV_DIST: the development export for pass 7 (default apps/mobile/web-build/dev); DEV_CONSOLE=off skips that pass.
 */
import { createRequire } from "node:module";
import { existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { URL, fileURLToPath } from "node:url";
import { defaults, resolveFile, startServer } from "./serve-web.mjs";

const PROMPT = "What is the capital of France? Answer in one sentence.";
const PROMPT_OFFLINE = "Name one planet of the solar system in one sentence.";
const LOAD_TIMEOUT_MS = 5 * 60_000;
const ANSWER_TIMEOUT_MS = 3 * 60_000;
/* The Chat screen logs which engine loaded (`[inborn] <engine> loaded <uri> in <ms> ms`); the header itself shows the model, not the engine. */
const ENGINE_RE = /\[inborn\] (\w+) loaded .* in (\d+) ms/;
const LOADED_RE = /\[wllama\] loaded .* in (\d+) ms · threads=(\d+) isolated=(\w+) gpuLayers=(\d+)/;
/**
 * Spec §14.9: anything visual is checked in the BROWSER at these widths before a Mac or a phone is touched.
 * The sweep below is that rule as a gate — a run that covers fewer than all of them on all the screens fails.
 * 820 / 1180 / 1366 are the iPad's own widths (F322): 10th-gen portrait, 10th-gen landscape, 12.9" landscape.
 */
const REQUIRED_WIDTHS = [390, 768, 820, 1024, 1180, 1366, 1440];
/* Drives the sweep. It is checked against REQUIRED_WIDTHS at the end, so narrowing it here fails the run. */
const LAYOUT_WIDTHS = [...REQUIRED_WIDTHS];
/* Both themes, because a colour token that is only wrong in the dark palette is invisible to a light-only sweep (F322). */
const REQUIRED_THEMES = ["light", "dark"];
const LAYOUT_SCREENS = [
  { id: "chat", path: "/", ready: "composer-input" },
  { id: "settings", path: "/settings", ready: "row-proof" },
  { id: "paywall", path: "/paywall?reason=strictDocuments", ready: "web-price-pro" },
  { id: "onboarding", path: "/onboarding", ready: "onboarding-welcome" },
  { id: "proof", path: "/proof", ready: null },
  { id: "vault", path: "/vault", ready: "vault-web-door" },
  { id: "documents", path: "/documents", ready: null },
];
/** Apple HIG / Android: the smallest a control may be on a touch screen. `MIN_TOUCH` in @inborn/ui is the same number. */
const MIN_TOUCH_PX = 44;
/** Every shipped locale, plus the pseudo-locale, which is the longest any string is allowed to get. */
const LOCALES = ["en", "de", "fr", "es", "pt-BR", "ja", "ko", "zh-Hant", "pseudo"];
/** What `<html lang>` must say per UI locale (F384): screen readers pick their voice from it. */
const HTML_LANG = { en: "en", de: "de", fr: "fr", es: "es", "pt-BR": "pt-BR", ja: "ja", ko: "ko", "zh-Hant": "zh-Hant", pseudo: "en-XA" };
const LOCK_PASSCODE = "2468";
/** The two sidebar buttons that share one row: the narrowest place a translated label has to fit (QA F103, F304). */
const LABEL_BUTTONS = ["new-chat", "new-incognito"];
/* React DOM's development warnings about what it was handed (F371). Production builds print none of them. */
const REACT_WARNING_RE = /React does not recognize the|for a non-boolean attribute|Invalid DOM property|Invalid value for prop|Unknown event handler property|is using incorrect casing|unique "key" prop|Cannot update a component|cannot be a child of|cannot contain a nested|React Components must start with an uppercase/;
/* React Native prop names that mean nothing to a browser: on the DOM they are junk, and what they asked for is not done. */
const RN_ONLY_ATTR_RE = /^(accessibility[a-z]+|importantforaccessibility|collapsable)$/i;
const DEV_DIST = process.env.DEV_DIST ?? path.join(path.dirname(fileURLToPath(import.meta.url)), "../apps/mobile/web-build/dev");
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
  const pageErrors = [];
  const hosts = new Set();
  const requests = [];
  const hostOf = (u) => (u.protocol === "blob:" ? hostOf(new URL(u.pathname)) : u.host);
  page.on("request", (r) => {
    const u = new URL(r.url());
    hosts.add(hostOf(u));
    requests.push(`${r.method()} ${u.protocol === "blob:" ? "blob:(worker)" : u.pathname}${r.headers().range ? ` [${r.headers().range}]` : ""}`);
  });
  page.on("console", (msg) => consoleLines.push(`${msg.type()}: ${msg.text()}`));
  page.on("pageerror", (e) => {
    consoleLines.push(`pageerror: ${e.message}`);
    pageErrors.push(e.message);
  });
  return { consoleLines, pageErrors, hosts, requests };
}

/** F40 crashed on a click, so every step of the walk is checked; a dead page must not be waited out for five minutes. */
function noPageErrors(pageErrors, step) {
  if (pageErrors.length) throw new Error(`${step}: the page threw ${pageErrors.join(" | ")}`);
}

/** Polls the captured console for the first line matching `re` (the line may already be there when the wait starts). */

/* The door contexts (phone, no-space) never get past the door, so they arrive onboarded; the first visit walks S01-S05 itself. */
const skipOnboarding = (ctx) =>
  ctx.addInitScript(() => {
    if (!localStorage.getItem("inborn.prefs")) localStorage.setItem("inborn.prefs", JSON.stringify({ onboarded: true }));
  });

async function waitForConsole(lines, re, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const hit = lines.map((l) => re.exec(l)).find(Boolean);
    if (hit) return hit;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`console never matched ${re}`);
}

/**
 * S01 Welcome -> S02 model -> S04 sealed -> S05 lock -> chat (spec §8.1). Round 36 took the airplane test out of the
 * onboarding chain: it lives on S50 Proof, which is the screen that proves things (F122).
 * F40 (22.9.2026) died on the very first click here: the model step pulled llama.rn's TurboModule into the browser
 * bundle. The old smoke set `onboarded` and never opened these screens, so the gate stayed green through the bug.
 */
async function walkOnboarding(page, out, pageErrors) {
  const steps = [];
  const step = async (screen, action) => {
    await page.getByTestId(screen).waitFor({ timeout: 60_000 });
    noPageErrors(pageErrors, screen);
    steps.push(screen);
    await action();
    noPageErrors(pageErrors, `${screen} (after the click)`);
  };
  await step("onboarding-welcome", () => page.getByTestId("onboarding-continue").click());
  await step("onboarding-model", async () => {
    out.modelStepOptions = (await page.getByTestId("model-options").textContent()) ?? "";
    /* F312: the step reads the web boot's list, so it offers exactly what the door offers — no more, no fewer. */
    out.modelStepIds = await page.locator('[data-testid^="model-option-"]').evaluateAll((els) => els.map((e) => e.getAttribute("data-testid").replace("model-option-", "")));
    if (out.modelStepIds.join() !== out.doorOptionIds.join()) throw new Error(`the model step offers ${out.modelStepIds.join(", ")} but the door offers ${out.doorOptionIds.join(", ")}`);
    out.screenshotOnboarding = path.join(outDir, "web-smoke-onboarding.png");
    await page.screenshot({ path: out.screenshotOnboarding });
    await page.getByTestId("start-chatting").click();
  });
  await step("onboarding-sealed", async () => {
    const start = page.getByTestId("sealed-start");
    await start.waitFor({ timeout: 30_000 });
    /* The ring animates before the button enables; the seal is the screen's whole point, so it is waited for, not forced. */
    for (let i = 0; i < 100 && (await start.isDisabled()); i++) await new Promise((r) => setTimeout(r, 100));
    await start.click();
  });
  await step("onboarding-lock", () => page.getByTestId("lock-start").click());
  out.onboarding = steps;
}

/** The ids the door's option list offers, in its own order. */
const chooseIds = (page) =>
  page.locator('[data-testid^="web-model-choose-"]').evaluateAll((els) => els.map((e) => e.getAttribute("data-testid").replace("web-model-choose-", "")));

/** Which model the door is offering: the one catalog id the option list does not repeat. */
async function offeredId(page, catalogIds) {
  /* The door folds the list away; the vault opens it. Only open what is closed, or the toggle closes it again. */
  if ((await chooseIds(page)).length === 0 && (await page.getByTestId("web-model-options-toggle").count()) > 0) await page.getByTestId("web-model-options-toggle").click();
  const others = new Set(await chooseIds(page));
  const offered = catalogIds.filter((id) => !others.has(id));
  if (offered.length !== 1) throw new Error(`the door offers ${offered.length} models of ${catalogIds.join(", ")}`);
  return offered[0];
}

/** Ready = the Chat screen is up and the console says which engine loaded (the status line stays visible with the engine name). */
async function waitForEngine(page, out, consoleLines, t0) {
  await page.getByTestId("composer-input").waitFor({ timeout: LOAD_TIMEOUT_MS });
  const [, engine, loadMs] = await waitForConsole(consoleLines, ENGINE_RE, LOAD_TIMEOUT_MS);
  if (engine !== "wllama") throw new Error(`engine "${engine}" loaded instead of wllama`);
  out.readyMs = Date.now() - t0;
  out.sessionLoadMs = Number(loadMs);
}

/** Types a prompt, sends it, waits for the ledger under the answer (only rendered once streaming ends), reads the Free ledger rows from it. */
async function chat(page, out, prompt, loadedLines) {
  const input = page.getByTestId("composer-input");
  await input.fill(prompt);
  await page.getByTestId("send").click();
  const ledgerToggle = page.getByTestId("ledger-toggle").last();
  await ledgerToggle.waitFor({ timeout: ANSWER_TIMEOUT_MS });
  await ledgerToggle.click();
  await page.getByTestId("ledger").last().waitFor({ timeout: 10_000 });
  // Free shows §7.1's four rows only (model, quant, context, ms/token); tok/s is derived, TTFT is not shown.
  const msPerToken = Number.parseInt((await page.getByTestId("ledger-msPerToken").last().textContent()) ?? "", 10);
  out.tokPerSec = msPerToken > 0 ? Math.round(10_000 / msPerToken) / 10 : 0;
  out.tokens = ((await page.getByTestId("ledger-context").last().textContent()) ?? "").trim();
  if ((await page.getByTestId("ledger-detail-pro").count()) === 0) throw new Error("free ledger is missing the Pro detail row");
  out.answer = ((await page.getByTestId("assistant-text").last().textContent()) ?? "").trim();
  out.modelChip = ((await page.getByTestId("model-chip").textContent()) ?? "").trim();
  const loaded = loadedLines.map((l) => LOADED_RE.exec(l)).find(Boolean);
  if (loaded) Object.assign(out, { engineLoadMs: Number(loaded[1]), threads: Number(loaded[2]), gpuLayers: Number(loaded[4]) });
  if (!out.answer) throw new Error("empty answer");
  if (!(out.tokPerSec > 0)) throw new Error(`ledger did not report usage: ms/token=${msPerToken}`);
}

/* The catalog host is not a foreign host when the run points the manifest at it: that download IS what is being proven.
   The offline pass keeps the stricter rule, since a cached model must need no network at all. */
const catalogHost = defaults.modelsOrigin ? new URL(defaults.modelsOrigin).host : "";
const foreignHosts = (hosts, allowCatalog = false) => [...hosts].filter((h) => h !== origin && !(allowCatalog && h === catalogHost));

/**
 * Reads one screen at one width: is anything wider than the window, and does the composer row still line up.
 * Measured in the page, from the boxes the browser actually laid out — not from a screenshot anyone has to squint at.
 */
async function measureLayout(page) {
  return page.evaluate(() => {
    const doc = document.scrollingElement;
    const box = (id) => {
      const el = document.querySelector(`[data-testid="${id}"]`);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), cy: Math.round(r.y + r.height / 2) };
    };
    return {
      scrollWidth: doc.scrollWidth,
      clientWidth: doc.clientWidth,
      attach: box("attach"),
      input: box("composer-input"),
      mic: box("mic"),
      send: box("send"),
    };
  });
}

/**
 * Every control the user can hit that is smaller than a fingertip (F322). A control the layout has collapsed to
 * 30 px on a tablet is still clickable with a mouse, so only a measurement finds it.
 */
async function undersizedControls(page, min) {
  return page.evaluate((minPx) => {
    const out = [];
    for (const el of document.querySelectorAll('button,[role="button"],[role="link"],[role="switch"],[role="tab"],[role="checkbox"],[role="radio"]')) {
      const r = el.getBoundingClientRect();
      /* Nothing with no box on screen: a closed sheet's children stay in the DOM. */
      if (r.width < 1 || r.height < 1) continue;
      /* visibility:hidden keeps the box, so the rectangle alone would count a control nobody can see. */
      if (el.checkVisibility && !el.checkVisibility({ visibilityProperty: true })) continue;
      /* A control nested inside another control is measured once, on the outer box the finger actually lands on. */
      if (el.parentElement?.closest('button,[role="button"],[role="link"],[role="switch"],[role="tab"]')) continue;
      if (r.width >= minPx && r.height >= minPx) continue;
      out.push({
        id: el.getAttribute("data-testid") ?? "",
        text: (el.textContent ?? "").trim().slice(0, 40),
        w: Math.round(r.width),
        h: Math.round(r.height),
      });
    }
    return out;
  }, min);
}

/**
 * F371: every React Native prop that reached the DOM as an attribute, and the composer's icons, which are decoration
 * next to a labelled button and must be aria-hidden, or a screen reader reads the button twice.
 */
async function rnPropLeaks(page) {
  return page.evaluate((reSource) => {
    const re = new RegExp(reSource, "i");
    const leaks = [];
    for (const el of document.querySelectorAll("*")) {
      const names = [...el.attributes].map((a) => a.name).filter((n) => re.test(n));
      if (names.length) leaks.push({ tag: el.tagName.toLowerCase(), testid: el.closest("[data-testid]")?.getAttribute("data-testid") ?? "", attributes: names });
    }
    const icons = ["attach", "mic", "send"].map((id) => {
      const svg = document.querySelector(`[data-testid="${id}"] svg`);
      return { id, svg: !!svg, ariaHidden: svg?.getAttribute("aria-hidden") ?? null };
    });
    return { leaks, icons };
  }, RN_ONLY_ATTR_RE.source);
}

function assertA11yProps(where, found) {
  if (found.leaks.length) throw new Error(`${where}: React Native props reached the DOM: ${found.leaks.map((l) => `<${l.tag}> in ${l.testid || "?"} ${l.attributes.join(",")}`).join("; ")}`);
  const shown = found.icons.filter((i) => i.svg && i.ariaHidden !== "true");
  if (shown.length) throw new Error(`${where}: composer icons not hidden from screen readers: ${shown.map((i) => i.id).join(", ")}`);
  if (!found.icons.some((i) => i.svg)) throw new Error(`${where}: no composer icon found to check`);
}

/** Any element whose text is cut off by its own box (RNW numberOfLines={1} clips with an ellipsis, silently). */
async function truncatedLabels(page, testIds) {
  return page.evaluate((ids) => {
    const out = [];
    for (const id of ids) {
      const btn = document.querySelector(`[data-testid="${id}"]`);
      if (!btn) continue;
      for (const el of [btn, ...btn.querySelectorAll("*")]) {
        const text = (el.textContent ?? "").trim();
        if (!text || el.children.length) continue;
        if (el.scrollWidth > el.clientWidth + 1) out.push({ id, text, scrollWidth: el.scrollWidth, clientWidth: el.clientWidth });
      }
    }
    return out;
  }, testIds);
}

/**
 * F381: turns the passcode lock on, reloads, and walks the locked page. Every Tab stop must sit in the lock screen or
 * its passcode sheet, the accessibility tree must hold no chat title, the command palette must stay shut, and no
 * answer may reach the DOM. Then it unlocks, checks the app is reachable again, and turns the lock off for the
 * passes after it.
 */
async function lockedWalk(page, base, answer) {
  const out = {};
  const title = ((await page.locator('[data-testid^="chat-row-"]').first().locator("div[dir]").first().textContent({ timeout: 10_000 })) ?? "").trim();
  if (!title) throw new Error("lock walk: no chat row to hide");
  out.title = title;
  const where = () =>
    page.evaluate(() => {
      const a = document.activeElement;
      return { id: a?.closest("[data-testid]")?.getAttribute("data-testid") ?? a?.tagName ?? null, inLock: !!a?.closest('[data-testid="lock-screen"]'), inDialog: !!a?.closest('[aria-modal="true"]'), body: a === document.body };
    });
  await page.goto(new URL("/settings", base).href);
  await page.getByTestId("row-lock").getByRole("switch").click();
  for (let i = 0; i < 2; i++) {
    await page.getByTestId("passcode-input").fill(LOCK_PASSCODE);
    await page.getByTestId("passcode-submit").click();
    await page.waitForTimeout(300);
  }
  await page.goto(base);
  await page.getByTestId("lock-screen").waitFor({ timeout: 60_000 });
  await page.getByTestId("passcode-input").waitFor({ timeout: 10_000 });
  await page.waitForTimeout(800);
  const sheetStops = [];
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press("Tab");
    sheetStops.push(await where());
  }
  if (!sheetStops.every((s) => s.inDialog)) throw new Error(`lock walk: Tab left the passcode sheet (${sheetStops.map((s) => s.id).join(", ")})`);
  out.ariaWithSheet = await page.locator("body").ariaSnapshot();
  await page.keyboard.press("Escape");
  await page.getByTestId("passcode-input").waitFor({ state: "detached", timeout: 5_000 });
  out.aria = await page.locator("body").ariaSnapshot();
  const stops = [];
  for (let i = 0; i < 25; i++) {
    await page.keyboard.press("Tab");
    stops.push(await where());
  }
  out.stops = [...new Set(stops.map((s) => s.id))];
  const outside = stops.filter((s) => !s.inLock && !s.body);
  if (outside.length) throw new Error(`lock walk: Tab reached ${[...new Set(outside.map((s) => s.id))].join(", ")} behind the lock`);
  if (!stops.some((s) => s.id === "unlock-passcode")) throw new Error(`lock walk: the keyboard never reached "Use passcode" (${out.stops.join(", ")})`);
  for (const tree of [out.ariaWithSheet, out.aria]) if (tree.includes(title)) throw new Error(`lock walk: the accessibility tree reads the chat title "${title}" while locked`);
  await page.keyboard.press("Control+k");
  await page.waitForTimeout(400);
  if (await page.getByTestId("palette-input").count()) throw new Error("lock walk: Ctrl+K opened the command palette behind the lock");
  if (await page.getByTestId("assistant-message").count()) throw new Error("lock walk: an answer is in the DOM while locked");
  if (answer && (await page.evaluate((a) => document.body.innerText.includes(a), answer.slice(0, 20)))) throw new Error("lock walk: answer text is on the page while locked");
  out.screenshot = path.join(outDir, "web-smoke-locked.png");
  await page.screenshot({ path: out.screenshot });
  await page.getByTestId("unlock-passcode").click();
  await page.getByTestId("passcode-input").fill(LOCK_PASSCODE);
  await page.getByTestId("passcode-submit").click();
  await page.getByTestId("lock-screen").waitFor({ state: "detached", timeout: 10_000 });
  out.inertAfterUnlock = await page.evaluate(() => document.querySelectorAll("[inert]").length);
  if (out.inertAfterUnlock) throw new Error(`lock walk: ${out.inertAfterUnlock} element(s) still inert after unlocking`);
  if (!(await page.locator("body").ariaSnapshot()).includes(title)) throw new Error("lock walk: the chat list is not back in the accessibility tree after unlocking");
  await page.evaluate(() => {
    const prefs = JSON.parse(localStorage.getItem("inborn.prefs") ?? "{}");
    localStorage.setItem("inborn.prefs", JSON.stringify({ ...prefs, lock: { ...prefs.lock, enabled: false } }));
    localStorage.removeItem("inborn.lock.passcode");
  });
  await page.goto(base);
  await page.getByTestId("composer-input").waitFor({ timeout: 60_000 });
  if (await page.getByTestId("lock-screen").count()) throw new Error("lock walk: the lock is still on after turning it off");
  return out;
}

try {
  browser = await playwright.chromium.launch({ headless: true, executablePath });
  const context = await browser.newContext({ viewport: { width: 1180, height: 800 } });

  /* 1. First visit: download door → OPFS → onboarding S01-S05 → wllama → chat. */
  {
    const page = await context.newPage();
    const { consoleLines, pageErrors, hosts, requests } = observe(page);
    lastPage = page;
    lastConsole = consoleLines;
    const out = result.first;
    const t0 = Date.now();
    /* The catalog is what the whole first run hangs on: it is read as the app reads it, before anything is clicked. */
    const manifest = await page.request.get(new URL("/models/manifest.json", server.url).href);
    out.catalog = { status: manifest.status(), type: manifest.headers()["content-type"] ?? "", models: (await manifest.json()).models.map((m) => m.id) };
    if (!/\bjson\b/i.test(out.catalog.type) || out.catalog.models.length === 0) throw new Error(`the origin does not serve a model catalog: ${JSON.stringify(out.catalog)}`);
    await page.goto(server.url);
    await page.getByTestId("download-door").waitFor({ timeout: 60_000 });
    out.gateText = (await page.getByTestId("web-strip").textContent()) ?? "";
    /* F311: what the door offers first is the recommendation for THIS browser, and the others are one tap below it. */
    if ((await page.getByTestId("web-download-why").count()) === 0) throw new Error("the door offered a model without saying it is the recommended one");
    out.doorOffer = (await page.getByTestId("download-door").textContent()) ?? "";
    out.doorSpeed = (await page.getByTestId("web-download-speed").textContent()) ?? "";
    await page.getByTestId("web-model-options-toggle").click();
    out.doorOtherIds = await chooseIds(page);
    /* The door's own list, in its order: the offered model first, then the rest — what the onboarding step must repeat. */
    out.doorOptionIds = [await offeredId(page, out.catalog.models), ...out.doorOtherIds];
    if (out.doorOtherIds.length !== out.catalog.models.length - 1) throw new Error(`the door listed ${out.doorOtherIds.length} other models of ${out.catalog.models.length - 1} in the catalog`);
    await page.screenshot({ path: path.join(outDir, "web-smoke-door.png"), fullPage: true });
    /* §14.9 for the screen the round changed: the door with its option list open, at all four widths, before a byte moves. */
    out.doorLayout = {};
    for (const width of REQUIRED_WIDTHS) {
      await page.setViewportSize({ width, height: 900 });
      const shot = path.join(outDir, `web-smoke-door-${width}.png`);
      await page.screenshot({ path: shot, fullPage: true });
      const m = await measureLayout(page);
      out.doorLayout[width] = { scrollWidth: m.scrollWidth, clientWidth: m.clientWidth, screenshot: shot };
      if (m.scrollWidth > m.clientWidth + 1) throw new Error(`the download door at ${width}: the page is ${m.scrollWidth}px wide in a ${m.clientWidth}px window`);
    }
    await page.setViewportSize({ width: 1180, height: 800 });
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
    /* The door reloads the page once the file is in OPFS; onboarding is what the reloaded app opens on. */
    await walkOnboarding(page, out, pageErrors);
    await waitForEngine(page, out, consoleLines, t0);
    out.downloadedFile = `/models/${out.doorOptionIds[0]}.gguf`;
    out.downloadRequests = requests.filter((r) => r.includes(out.downloadedFile));
    if (!out.downloadRequests.length) throw new Error(`nothing was fetched for ${out.downloadedFile}`);
    out.crossOriginIsolated = await page.evaluate(() => globalThis.crossOriginIsolated);
    out.webgpu = await page.evaluate(async () => (navigator.gpu ? !!(await navigator.gpu.requestAdapter()) : false));
    out.storageAfter = await page.evaluate(() => navigator.storage.estimate().then((e) => e.usage ?? null));
    out.persisted = await page.evaluate(() => navigator.storage.persisted());
    await chat(page, out, PROMPT, consoleLines);
    out.a11yProps = await rnPropLeaks(page);
    assertA11yProps("first visit, chat", out.a11yProps);
    /* The strip shows one line and folds the rest (MosheAI item 6, 24.9); the offline state is inside that disclosure. */
    await page.getByTestId("web-strip-details").click();
    await page.getByTestId("web-strip-detail").waitFor({ timeout: 30_000 });
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
    /* S30 on the web is a door, not a vault: it must render without an on-device engine (design review 6.9.2026). */
    await page.goto(new URL("/vault", server.url).href);
    await page.getByTestId("vault-web-door").waitFor({ timeout: 30_000 });
    out.vaultDoor = ((await page.getByTestId("vault-web-status").textContent()) ?? "").trim();
    out.vaultScreenshot = path.join(outDir, "web-smoke-vault.png");
    await page.screenshot({ path: out.vaultScreenshot });
    /* F303/F322: every width, on every screen, in both themes, with a model in OPFS — the browser-first rule as a gate. */
    result.layout = {};
    for (const theme of REQUIRED_THEMES) {
      await page.emulateMedia({ colorScheme: theme });
      for (const width of LAYOUT_WIDTHS) {
        /* The iPad's landscape heights are shorter than its portrait width: a short window is where a footer collapses. */
        await page.setViewportSize({ width, height: width >= 1180 ? 820 : 900 });
        for (const screen of LAYOUT_SCREENS) {
          await page.goto(new URL(screen.path, server.url).href);
          if (screen.ready) await page.getByTestId(screen.ready).waitFor({ timeout: 60_000 });
          else await page.waitForLoadState("networkidle");
          noPageErrors(pageErrors, `${screen.id} at ${width} (${theme})`);
          const shot = path.join(outDir, `web-smoke-layout-${screen.id}-${width}${theme === "dark" ? "-dark" : ""}.png`);
          await page.screenshot({ path: shot, fullPage: true });
          const m = await measureLayout(page);
          const small = await undersizedControls(page, MIN_TOUCH_PX);
          ((result.layout[screen.id] ??= {})[width] ??= {})[theme] = { ...m, small, screenshot: shot };
          if (m.scrollWidth > m.clientWidth + 1) throw new Error(`${screen.id} at ${width} (${theme}): the page is ${m.scrollWidth}px wide in a ${m.clientWidth}px window`);
          if (small.length) {
            throw new Error(`${screen.id} at ${width} (${theme}): ${small.length} control(s) under ${MIN_TOUCH_PX}px — ${small.map((c) => `${c.id || JSON.stringify(c.text)} ${c.w}x${c.h}`).join("; ")}`);
          }
          if (screen.id !== "chat") continue;
          for (const id of ["attach", "input", "mic", "send"]) if (!m[id]) throw new Error(`${screen.id} at ${width} (${theme}): no ${id} in the composer`);
          /* One row: the three round controls share a centre line, and the field sits between them. */
          for (const id of ["mic", "send"]) if (Math.abs(m[id].cy - m.attach.cy) > 2) throw new Error(`${screen.id} at ${width} (${theme}): ${id} is ${Math.abs(m[id].cy - m.attach.cy)}px off the composer's centre line`);
          if (!(m.attach.x < m.input.x && m.input.x + m.input.w <= m.mic.x + 1 && m.mic.x < m.send.x)) {
            throw new Error(`${screen.id} at ${width} (${theme}): the composer row is out of order ${JSON.stringify({ attach: m.attach.x, input: m.input.x, mic: m.mic.x, send: m.send.x })}`);
          }
          if (m.send.x + m.send.w > m.clientWidth + 1) throw new Error(`${screen.id} at ${width} (${theme}): send runs ${m.send.x + m.send.w - m.clientWidth}px past the window`);
        }
      }
    }
    await page.emulateMedia({ colorScheme: null });
    for (const screen of LAYOUT_SCREENS) {
      for (const theme of REQUIRED_THEMES) {
        const missing = LAYOUT_WIDTHS.filter((w) => !result.layout[screen.id]?.[w]?.[theme]);
        if (missing.length) throw new Error(`layout sweep skipped ${screen.id} (${theme}) at ${missing.join(", ")}`);
      }
    }

    /* F304: the narrowest window, every shipped language: a translated label that does not fit is clipped silently. */
    result.labels = {};
    await page.setViewportSize({ width: 390, height: 900 });
    for (const locale of LOCALES) {
      await page.evaluate((lng) => {
        const prefs = JSON.parse(localStorage.getItem("inborn.prefs") ?? "{}");
        localStorage.setItem("inborn.prefs", JSON.stringify({ ...prefs, onboarded: true, locale: lng }));
      }, locale);
      await page.goto(new URL("/chats", server.url).href);
      await page.getByTestId("new-incognito").waitFor({ timeout: 60_000 });
      const clipped = await truncatedLabels(page, LABEL_BUTTONS);
      const html = await page.evaluate(() => ({ lang: document.documentElement.lang, dir: document.documentElement.dir }));
      if (html.lang !== HTML_LANG[locale] || html.dir !== "ltr") throw new Error(`${locale}: <html lang="${html.lang}" dir="${html.dir}">, expected lang="${HTML_LANG[locale]}" dir="ltr"`);
      result.labels[locale] = {
        html,
        newChat: ((await page.getByTestId("new-chat").textContent()) ?? "").trim(),
        incognito: ((await page.getByTestId("new-incognito").textContent()) ?? "").trim(),
        clipped,
      };
      if (locale === "fr") await page.screenshot({ path: path.join(outDir, "web-smoke-labels-fr-390.png") });
      if (clipped.length) throw new Error(`${locale} at 390: ${clipped.map((c) => `${c.id} "${c.text}" needs ${c.scrollWidth}px in ${c.clientWidth}px`).join("; ")}`);
    }
    const sweptLocales = Object.keys(result.labels);
    if (sweptLocales.length !== LOCALES.length) throw new Error(`label sweep covered ${sweptLocales.length} of ${LOCALES.length} locales`);
    /* Back to the language and the window the rest of the run expects. */
    await page.evaluate(() => {
      const prefs = JSON.parse(localStorage.getItem("inborn.prefs") ?? "{}");
      delete prefs.locale;
      localStorage.setItem("inborn.prefs", JSON.stringify(prefs));
    });
    await page.setViewportSize({ width: 1180, height: 800 });

    /* F381: the passcode lock is a wall for the keyboard and a screen reader too, not only a picture over the app. */
    result.lock = await lockedWalk(page, server.url, out.answer);
    await page.setViewportSize({ width: 1180, height: 800 });

    out.consoleErrors = consoleLines.filter((l) => /^(error|pageerror)/.test(l));
    if (out.consoleErrors.some((l) => /^pageerror/.test(l))) throw new Error(`page errors: ${out.consoleErrors.join(" | ")}`);
    out.reactWarnings = consoleLines.filter((l) => REACT_WARNING_RE.test(l));
    if (out.reactWarnings.length) throw new Error(`React warned: ${out.reactWarnings.join(" | ")}`);
    out.hosts = [...hosts];
    if (foreignHosts(hosts, true).length) throw new Error(`the page talked to ${foreignHosts(hosts, true).join(", ")}; only ${[origin, catalogHost].filter(Boolean).join(" and ")} is allowed`);
    if (out.crossOriginIsolated !== defaults.isolation) throw new Error(`crossOriginIsolated=${out.crossOriginIsolated} with ISOLATION=${defaults.isolation ? "on" : "off"}`);
    if (!defaults.isolation && out.threads !== 1) throw new Error(`expected the single-thread fallback, got threads=${out.threads}`);
    await page.close();
  }

  /* 2. Second visit, network cut: the service worker serves the app, the model comes from OPFS. */
  if (hasServiceWorker) {
    await context.setOffline(true);
    const page = await context.newPage();
    const { consoleLines, pageErrors, hosts, requests } = observe(page);
    lastPage = page;
    lastConsole = consoleLines;
    const out = result.offline;
    const t0 = Date.now();
    await page.goto(server.url);
    await waitForEngine(page, out, consoleLines, t0);
    await chat(page, out, PROMPT_OFFLINE, consoleLines);
    noPageErrors(pageErrors, "offline visit");
    out.requests = requests;
    out.hosts = [...hosts];
    out.navigatorOnLine = await page.evaluate(() => navigator.onLine);
    out.screenshot = path.join(outDir, "web-smoke-offline.png");
    await page.screenshot({ path: out.screenshot, fullPage: true });
    out.consoleErrors = consoleLines.filter((l) => /^(error|pageerror)/.test(l));
    if (foreignHosts(hosts).length) throw new Error(`offline page talked to ${foreignHosts(hosts).join(", ")}`);
    if (requests.some((r) => r.includes(result.first.downloadedFile))) throw new Error("offline visit fetched the model again instead of reading OPFS");
    await page.close();
    await context.setOffline(false);
  } else {
    result.offline = { skipped: "no sw.js in the served dist; run: corepack pnpm web:build" };
  }

  /* 2b. F312: the reader takes another model. The vault lists what the door listed, the pick lands in the door, and
     the chat comes up on the model that was chosen — the second half of "default = recommended, choose a different one". */
  {
    const page = await context.newPage();
    const { consoleLines, pageErrors, hosts } = observe(page);
    lastPage = page;
    lastConsole = consoleLines;
    const out = (result.switched = {});
    const t0 = Date.now();
    await page.goto(new URL("/vault", server.url).href);
    await page.getByTestId("vault-web-door").waitFor({ timeout: 60_000 });
    out.vaultOtherIds = await chooseIds(page);
    if (out.vaultOtherIds.join() !== result.first.doorOtherIds.join()) throw new Error(`the vault offers ${out.vaultOtherIds.join(", ")} and the door offered ${result.first.doorOtherIds.join(", ")}`);
    out.chosen = out.vaultOtherIds[0];
    await page.screenshot({ path: path.join(outDir, "web-smoke-vault-options.png"), fullPage: true });
    await page.getByTestId(`web-model-choose-${out.chosen}`).click();
    await page.getByTestId("download-door").waitFor({ timeout: 60_000 });
    out.door = (await page.getByTestId("download-door").textContent()) ?? "";
    out.doorOffers = await offeredId(page, result.first.catalog.models);
    if (out.doorOffers !== out.chosen) throw new Error(`chose ${out.chosen} and the door offered ${out.doorOffers}`);
    await page.getByTestId("download-model").click();
    await waitForEngine(page, out, consoleLines, t0);
    out.modelChip = ((await page.getByTestId("model-chip").textContent()) ?? "").trim();
    if (!out.modelChip.toLowerCase().includes(out.chosen.split("-")[0])) throw new Error(`the chat runs ${out.modelChip} after choosing ${out.chosen}`);
    await chat(page, out, PROMPT, consoleLines);
    noPageErrors(pageErrors, "after choosing another model");
    out.screenshot = path.join(outDir, "web-smoke-switched.png");
    await page.screenshot({ path: out.screenshot, fullPage: true });
    out.hosts = [...hosts];
    if (foreignHosts(hosts).length) throw new Error(`the switched page talked to ${foreignHosts(hosts).join(", ")}`);
    await page.close();
  }
  await context.close();

  /* 3. A phone: the gate says Instant only + get the app (spec §8.9). */
  {
    const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, userAgent: IPHONE_UA, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    await skipOnboarding(phone);
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
    await skipOnboarding(tight);
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
  /* 5. The B1 shape: 200, text/html, the app's own document where the catalog should be. */
  {
    const broken = await browser.newContext({ viewport: { width: 1180, height: 800 } });
    await broken.route("**/models/manifest.json", (route) => route.fulfill({ status: 200, contentType: "text/html", body: readFileSync(path.join(defaults.dist, "index.html"), "utf8") }));
    const page = await broken.newPage();
    lastPage = page;
    const out = (result.brokenCatalog = {});
    await page.goto(server.url);
    await page.getByTestId("catalog-door").waitFor({ timeout: 60_000 });
    out.text = ((await page.getByTestId("catalog-door").textContent()) ?? "").trim();
    out.retry = await page.getByTestId("catalog-retry").isVisible();
    out.screenshot = path.join(outDir, "web-smoke-catalog-broken.png");
    await page.screenshot({ path: out.screenshot });
    if (!out.retry) throw new Error("the catalog door offers no retry");
    if (/No model (on|for) this/i.test(out.text)) throw new Error(`the catalog door blames the browser: ${out.text}`);
    if (await page.getByTestId("composer-input").count()) throw new Error("a browser with no catalog walked into a chat it cannot answer in");
    await broken.close();
  }
  /* 6. F293: a browser with no model at all still reaches the price list; only a chat needs the download door. */
  {
    const fresh = await browser.newContext({ viewport: { width: 1180, height: 800 } });
    await skipOnboarding(fresh);
    const page = await fresh.newPage();
    lastPage = page;
    const out = (result.paywallWithoutModel = {});
    await page.goto(new URL("/paywall?reason=strictDocuments", server.url).href);
    await page.getByTestId("web-price-pro").waitFor({ timeout: 60_000 });
    out.pro = ((await page.getByTestId("web-price-pro").textContent()) ?? "").trim();
    out.work = ((await page.getByTestId("web-price-work").textContent()) ?? "").trim();
    out.why = ((await page.getByTestId("paywall-why").textContent({ timeout: 5_000 }).catch(() => "")) ?? "").trim();
    out.door = await page.getByTestId("download-door").count();
    out.screenshot = path.join(outDir, "web-smoke-paywall-no-model.png");
    await page.screenshot({ path: out.screenshot, fullPage: true });
    if (out.door) throw new Error("the download door stands in front of the price list");
    for (const [tier, text] of [["pro", out.pro], ["work", out.work]]) {
      if (!/\d/.test(text)) throw new Error(`the ${tier} price is not on the page without a model: "${text}"`);
    }
    /* The chat is the screen that needs the model: the same browser must still meet the door there. */
    await page.goto(server.url);
    await page.getByTestId("download-door").waitFor({ timeout: 60_000 });
    await fresh.close();
  }
  /* 7. F371: the development export. React names the props it cannot put on an element only here, and LogBox turns
     each one into a red toast over the composer plus a POST /symbolicate that this static host answers 405. */
  if (process.env.DEV_CONSOLE === "off") {
    result.dev = { skipped: "DEV_CONSOLE=off" };
  } else {
    if (!existsSync(path.join(DEV_DIST, "index.html"))) throw new Error(`no development export at ${DEV_DIST}; run: corepack pnpm web:build`);
    const devServer = await startServer({ port: 0, dist: DEV_DIST });
    const dev = await browser.newContext({ viewport: { width: 1180, height: 800 } });
    try {
      const page = await dev.newPage();
      const { consoleLines, pageErrors } = observe(page);
      const failed = [];
      page.on("response", (r) => {
        if (r.status() >= 400) failed.push(`${r.status()} ${r.request().method()} ${new URL(r.url()).pathname}`);
      });
      lastPage = page;
      lastConsole = consoleLines;
      const out = (result.dev = { dist: DEV_DIST });
      const t0 = Date.now();
      await page.goto(devServer.url);
      await page.getByTestId("download-door").waitFor({ timeout: 60_000 });
      await page.getByTestId("download-model").click();
      await page.getByTestId("onboarding-welcome").waitFor({ timeout: LOAD_TIMEOUT_MS });
      await page.getByTestId("onboarding-continue").click();
      await page.getByTestId("start-chatting").click();
      const start = page.getByTestId("sealed-start");
      await start.waitFor({ timeout: 60_000 });
      for (let i = 0; i < 100 && (await start.isDisabled()); i++) await new Promise((r) => setTimeout(r, 100));
      await start.click();
      await page.getByTestId("lock-start").click();
      await waitForEngine(page, out, consoleLines, t0);
      await chat(page, out, PROMPT, consoleLines);
      noPageErrors(pageErrors, "development export");
      await page.setViewportSize({ width: 390, height: 844 });
      await page.waitForTimeout(1_000);
      out.screenshot = path.join(outDir, "web-smoke-dev-chat-390.png");
      await page.screenshot({ path: out.screenshot });
      out.a11yProps = await rnPropLeaks(page);
      out.reactWarnings = consoleLines.filter((l) => REACT_WARNING_RE.test(l));
      out.failedRequests = failed;
      if (out.reactWarnings.length) throw new Error(`development export: React warned ${out.reactWarnings.length}x: ${[...new Set(out.reactWarnings)].join(" | ")}`);
      assertA11yProps("development export, chat", out.a11yProps);
      const symbolicate = failed.filter((f) => f.includes("/symbolicate"));
      if (symbolicate.length) throw new Error(`development export: LogBox reported ${symbolicate.length} console error(s) (${symbolicate[0]})`);
    } finally {
      await dev.close();
      await devServer.close();
    }
  }
} catch (e) {
  failure = e;
  /* What the page showed when it went wrong: the door/error text, the status line, the console, a screenshot. */
  if (lastPage && !lastPage.isClosed()) {
    result.failure = {
      door: await lastPage.getByTestId("download-door").textContent({ timeout: 1000 }).catch(() => null),
      error: await lastPage.getByTestId("download-error").textContent({ timeout: 1000 }).catch(() => null),
      status: await lastPage.getByTestId("status-line").textContent({ timeout: 1000 }).catch(() => null),
      modelChip: await lastPage.getByTestId("model-chip").textContent({ timeout: 1000 }).catch(() => null),
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
console.log(`PASS: first visit ready ${f.readyMs} ms · ${f.tokPerSec} tok/s · context ${f.tokens} · threads=${f.threads ?? "?"} · isolated=${f.crossOriginIsolated}`);
if (o.readyMs) console.log(`PASS: offline visit ready ${o.readyMs} ms · ${o.tokPerSec} tok/s · context ${o.tokens} · requests=${o.requests.length} · model fetches=0`);
console.log(`PASS: onboarding walked ${f.onboarding.join(" -> ")} -> chat`);
console.log(`PASS: vault door "${f.vaultDoor}"`);
console.log(`PASS: phone door "${result.phone.door}"`);
console.log(`PASS: no-space door "${result.noSpace.text}"`);
console.log(`PASS: catalog ${result.first.catalog.type} · models ${result.first.catalog.models.join(", ")}`);
console.log(`PASS: no React Native prop on the DOM, composer icons aria-hidden (${f.a11yProps.icons.map((i) => i.id).join(", ")})`);
if (result.dev.skipped) console.log(`SKIP: development export pass (${result.dev.skipped})`);
else console.log(`PASS: development export walked door -> onboarding -> chat with 0 React warnings, 0 LogBox reports (${result.dev.failedRequests.length} failed requests: ${result.dev.failedRequests.join(", ") || "none"})`);
console.log(`PASS: broken catalog door "${result.brokenCatalog.text}"`);
for (const screen of LAYOUT_SCREENS) {
  for (const width of REQUIRED_WIDTHS) {
    for (const theme of REQUIRED_THEMES) {
      if (!result.layout?.[screen.id]?.[width]?.[theme]) {
        console.error(`FAIL: the layout sweep never ran ${screen.id} at ${width} in ${theme}`);
        process.exit(1);
      }
    }
  }
}
console.log(`PASS: layout swept ${LAYOUT_SCREENS.map((s) => s.id).join(", ")} at ${REQUIRED_WIDTHS.join(" / ")} in ${REQUIRED_THEMES.join(" + ")} — no horizontal scroll, composer row aligned, every control >= ${MIN_TOUCH_PX}px`);
console.log(`PASS: <html lang> follows the UI language in ${Object.keys(result.labels).length} locales (ja = "${result.labels.ja.html.lang}", pseudo = "${result.labels.pseudo.html.lang}")`);
console.log(`PASS: locked, Tab reaches only ${result.lock.stops.join(", ")}; no chat title in the accessibility tree, no palette, no answer in the DOM; unlocked cleanly`);
console.log(`PASS: ${Object.keys(result.labels).length} locales at 390, no clipped sidebar label (fr incognito = "${result.labels.fr.incognito}")`);
console.log(`PASS: no model, the price list still reads ${result.paywallWithoutModel.pro.replace(/\n/g, " · ")} / ${result.paywallWithoutModel.work.replace(/\n/g, " · ")}`);
