#!/usr/bin/env node
/**
 * Headless proof of the browser tier (spec §4.4, §14.3), against the deployable build when apps/web/dist exists:
 *   1. first visit: the download door → download into OPFS (cancel + Range resume on the way) → onboarding S01-S05
 *      (F40: the model step used to crash the page) → wllama loads from OPFS → one prompt;
 *   2. second visit with the network cut (Playwright setOffline): the service worker boots the page, the model comes from OPFS, chat works;
 *   3. a phone viewport shows the "get the app" door;
 *   4. a browser reporting almost no quota gets the "not enough space" state with the download disabled; one with
 *      900 MB free is offered Instant, the model that fits, with one line saying Fast does not (F13);
 *   5. an origin that answers the catalog with its own index.html (B1, 24.9.2026) lands on the catalog door with a
 *      retry, instead of a silent empty catalog that reads as "no model on this browser".
 *   1b. <html lang> in every locale (F384), and the passcode lock walked by keyboard and accessibility tree (F381);
 *   7. the development export (apps/mobile/web-build/dev, made by web:build) walks the same first run with zero React
 *      warnings: React only reports props it cannot put on an element in development builds (F371).
 *   8. round 93: a .txt and a .pdf attached through "+" -> "Add a file…" reach the model. The .txt is sent past the
 *      index-model card with the word search, the .pdf after Download installs the document index model from this
 *      host; both answers carry SOURCES naming the file.

 *   9. F1: the same host turned deployed-like (every missing path, /models/<e5> included, answers the SPA shell, and the
 *      catalog points the index model at such a path). Download must fail as "not on the download server", nothing
 *      may load the shell as a model, and the file still answers with SOURCES on the word search.
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
const ATTACH_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures/attach");
const ATTACH_QUESTION = "What is this file about? Quote one sentence from it.";
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

/** Widths the Chats footer is checked at: the phone, and the 280 px sidebar at the narrowest and a middle window (F395). */
const FOOTER_WIDTHS = [390, 768, 1180];

/**
 * The Chats footer at the current width (F395): Personas, Memory and Folders inside the footer's own box and not
 * covered at their centres, PRO inside Folders and visible to its last pixel, one row, no ellipsized text, and the
 * three buttons the only Tab stops.
 */
async function checkFooter(page, where) {
  const f = await page.evaluate(() => {
    const el = (id) => document.querySelector(`[data-testid="${id}"]`);
    const box = (e) => {
      if (!e) return null;
      const r = e.getBoundingClientRect();
      return { x: Math.round(r.x), right: Math.round(r.right), cy: Math.round(r.y + r.height / 2) };
    };
    const hits = (e, x, y) => {
      const hit = document.elementFromPoint(x, y);
      return !!hit && (hit === e || e.contains(hit));
    };
    const footer = el("chats-footer");
    const ids = ["open-personas", "open-memory", "open-folders"];
    const out = { footer: box(footer), buttons: {}, covered: [], clientWidth: document.scrollingElement.clientWidth };
    for (const id of ids) {
      const e = el(id);
      out.buttons[id] = box(e);
      if (!e) continue;
      const r = e.getBoundingClientRect();
      if (!hits(e, r.x + r.width / 2, r.y + r.height / 2)) out.covered.push(id);
      out.buttons[id].name = e.getAttribute("aria-label") ?? "";
    }
    const pro = el("pro-tag");
    out.pro = box(pro);
    if (pro) {
      const r = pro.getBoundingClientRect();
      out.proInsideFolders = el("open-folders")?.contains(pro) ?? false;
      if (!hits(pro, r.right - 2, r.y + r.height / 2)) out.covered.push("pro-tag");
    }
    const leaves = footer ? [...footer.querySelectorAll("*")].filter((x) => !x.children.length && x.textContent.trim()) : [];
    out.ellipsized = leaves.filter((x) => x.scrollWidth > x.clientWidth + 1).map((x) => x.textContent.trim());
    out.tabStops = footer ? [...footer.querySelectorAll("*")].filter((x) => x.tabIndex >= 0).map((x) => x.getAttribute("data-testid") ?? x.tagName) : [];
    return out;
  });
  const b = f.buttons;
  const missing = ["open-personas", "open-memory", "open-folders"].filter((id) => !b[id]);
  if (!f.footer || missing.length || !f.pro) throw new Error(`${where}: the Chats footer is missing ${[...missing, f.pro ? null : "pro-tag", f.footer ? null : "chats-footer"].filter(Boolean).join(", ")}`);
  const outside = [...Object.entries(b), ["pro-tag", f.pro]].filter(([, x]) => x.x < f.footer.x - 1 || x.right > f.footer.right + 1).map(([id]) => id);
  if (outside.length) throw new Error(`${where}: ${outside.join(", ")} past the footer's edge ${JSON.stringify(f)}`);
  if (f.covered.length) throw new Error(`${where}: ${f.covered.join(", ")} clipped or covered ${JSON.stringify(f)}`);
  if (!f.proInsideFolders) throw new Error(`${where}: PRO is not part of the Folders button ${JSON.stringify(f)}`);
  if (Object.values(b).some((x) => Math.abs(x.cy - b["open-folders"].cy) > 2)) throw new Error(`${where}: the Chats footer wrapped onto two rows ${JSON.stringify(f)}`);
  if (f.ellipsized.length) throw new Error(`${where}: the footer ellipsizes ${f.ellipsized.join(", ")}`);
  if (f.tabStops.join() !== "open-personas,open-memory,open-folders") throw new Error(`${where}: the footer's Tab stops are ${f.tabStops.join(", ")}`);
  if (Object.values(b).some((x) => !x.name.trim())) throw new Error(`${where}: a footer button has no name ${JSON.stringify(f)}`);
  return f;
}

/** Init script: the page's clock reads `hour`:00 today, so the Auto clock rule is tested at a known side of 18:00. */
function pinHour(hour) {
  const RealDate = Date;
  const at = new RealDate();
  at.setHours(hour, 0, 0, 0);
  const offset = at - RealDate.now();
  globalThis.Date = class extends RealDate {
    constructor(...args) {
      if (args.length) super(...args);
      else super(RealDate.now() + offset);
    }
    static now() {
      return RealDate.now() + offset;
    }
  };
}

/** Which palette the browser shell painted: its background is the theme's bg token, and the two palettes differ in lightness. */
async function shellScheme(page) {
  const rgb = await page.evaluate(() => document.defaultView.getComputedStyle(document.querySelector('[data-testid="web-strip"]').parentElement).backgroundColor);
  const [r, g, b] = (rgb.match(/\d+/g) ?? []).map(Number);
  return (r + g + b) / 3 < 128 ? "dark" : "light";
}

/** Waits up to 3 s for the palette to settle on `want`, and returns what it settled on. */
async function settleScheme(page, want) {
  let seen = await shellScheme(page);
  for (let i = 0; i < 30 && seen !== want; i++) {
    await new Promise((r) => setTimeout(r, 100));
    seen = await shellScheme(page);
  }
  return seen;
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

async function waitForEngineAfter(lines, from) {
  for (let i = 0; i < LOAD_TIMEOUT_MS / 100; i++) {
    if (lines.slice(from).some((l) => ENGINE_RE.test(l))) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("the engine never loaded");
}

/**
 * Round 93: attaches `file` in a fresh chat, asks about it, answers the index-model card with `onHold` when it shows,
 * and returns what the reader saw. The answer is done when its ledger row appears (rendered once streaming ends).
 */
async function attachAndAsk(page, consoleLines, file, onHold) {
  const from = consoleLines.length;
  await page.goto(server.url);
  await page.getByTestId("composer-input").waitFor({ timeout: LOAD_TIMEOUT_MS });
  /* Send does nothing until the engine is up; the Chat screen logs the load. */
  await waitForEngineAfter(consoleLines, from);
  const answers = await page.getByTestId("ledger-toggle").count();
  await page.getByTestId("attach").click();
  const [chooser] = await Promise.all([page.waitForEvent("filechooser", { timeout: 15_000 }), page.getByTestId("attach-import").click()]);
  await chooser.setFiles(path.join(ATTACH_DIR, file));
  await page.getByTestId("attached-docs").filter({ hasText: file }).waitFor({ timeout: 30_000 });
  await page.getByTestId("composer-input").fill(ATTACH_QUESTION);
  await page.getByTestId("send").click();
  const seen = { file };
  if (await page.getByTestId("docs-hold").waitFor({ timeout: 10_000 }).then(() => true, () => false)) {
    seen.hold = ((await page.getByTestId("docs-hold").textContent()) ?? "").trim();
    seen.holdScreenshot = path.join(outDir, `web-smoke-attach-hold-${file}.png`);
    await page.screenshot({ path: seen.holdScreenshot });
    await onHold(page, seen);
  }
  const ledger = page.getByTestId("ledger-toggle");
  for (let i = 0; i < ANSWER_TIMEOUT_MS / 200 && (await ledger.count()) <= answers; i++) await page.waitForTimeout(200);
  if ((await ledger.count()) <= answers) throw new Error(`${file}: no answer arrived`);
  seen.answer = ((await page.getByTestId("assistant-text").last().textContent()) ?? "").trim();
  seen.sources = ((await page.getByTestId("citations").last().textContent({ timeout: 2_000 }).catch(() => "")) ?? "").trim();
  seen.wordsOnly = (await page.getByTestId("docs-lexical").count()) > 0;
  seen.noneMatched = (await page.getByTestId("none-matched").count()) > 0;
  seen.screenshot = path.join(outDir, `web-smoke-attach-${file}.png`);
  await page.screenshot({ path: seen.screenshot, fullPage: true });
  if (!seen.answer) throw new Error(`${file}: empty answer`);
  if (seen.noneMatched) throw new Error(`${file}: the answer says nothing in the file matched a question about the file`);
  if (!seen.sources.includes(file)) throw new Error(`${file}: the answer carries no SOURCES naming the file (sources: "${seen.sources}", answer: "${seen.answer.slice(0, 160)}")`);
  return seen;
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
      /* W8/F393, F395: the footer fits, with PRO inside Folders, at the phone width here and in the sidebar below. */
      result.labels[locale].footer = { 390: await checkFooter(page, `${locale} at 390`) };
      await page.screenshot({ path: path.join(outDir, `web-smoke-chats-${locale}-390.png`) });
      /* W2/F392: the pseudo-locale is the longest any string may get; every screen must still fit the narrowest window. */
      if (locale === "pseudo") {
        result.pseudoLayout = {};
        for (const screen of LAYOUT_SCREENS) {
          await page.goto(new URL(screen.path, server.url).href);
          if (screen.ready) await page.getByTestId(screen.ready).waitFor({ timeout: 60_000 });
          else await page.waitForLoadState("networkidle");
          noPageErrors(pageErrors, `pseudo ${screen.id} at 390`);
          const shot = path.join(outDir, `web-smoke-pseudo-${screen.id}-390.png`);
          await page.screenshot({ path: shot, fullPage: true });
          const m = await measureLayout(page);
          result.pseudoLayout[screen.id] = { scrollWidth: m.scrollWidth, clientWidth: m.clientWidth, screenshot: shot };
          if (m.scrollWidth > m.clientWidth + 1) throw new Error(`pseudo ${screen.id} at 390: the page is ${m.scrollWidth}px wide in a ${m.clientWidth}px window`);
        }
        const missed = LAYOUT_SCREENS.filter((sc) => !result.pseudoLayout[sc.id]);
        if (missed.length) throw new Error(`pseudo sweep skipped ${missed.map((sc) => sc.id).join(", ")}`);
      }
      for (const width of FOOTER_WIDTHS.filter((w) => w !== 390)) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(new URL("/", server.url).href);
        await page.getByTestId("open-folders").waitFor({ timeout: 60_000 });
        result.labels[locale].footer[width] = await checkFooter(page, `${locale} at ${width}`);
        if (locale === "pseudo" || locale === "de") await page.screenshot({ path: path.join(outDir, `web-smoke-chats-${locale}-${width}.png`) });
      }
      await page.setViewportSize({ width: 390, height: 900 });
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

    /* W1/F394: Auto follows the OS while the page is open, and the clock rule still wins at night (S01, answer 8). */
    result.theme = {};
    for (const hour of [12, 20]) {
      const tp = await context.newPage();
      const tpErrors = observe(tp).pageErrors;
      await tp.addInitScript(pinHour, hour);
      await tp.setViewportSize({ width: 390, height: 844 });
      await tp.emulateMedia({ colorScheme: "dark" });
      await tp.goto(new URL("/settings", server.url).href);
      await tp.getByTestId("row-proof").waitFor({ timeout: 60_000 });
      const seen = { osDarkOnLoad: await shellScheme(tp) };
      await tp.screenshot({ path: path.join(outDir, `web-smoke-theme-${hour}h-1-os-dark.png`) });
      await tp.emulateMedia({ colorScheme: "light" });
      seen.osLightLive = await settleScheme(tp, hour === 12 ? "light" : "dark");
      await tp.screenshot({ path: path.join(outDir, `web-smoke-theme-${hour}h-2-os-light-live.png`) });
      await tp.emulateMedia({ colorScheme: "dark" });
      seen.osDarkLive = await settleScheme(tp, "dark");
      await tp.screenshot({ path: path.join(outDir, `web-smoke-theme-${hour}h-3-os-dark-live.png`) });
      noPageErrors(tpErrors, `theme at ${hour}:00`);
      result.theme[hour] = seen;
      const want = { osDarkOnLoad: "dark", osLightLive: hour === 12 ? "light" : "dark", osDarkLive: "dark" };
      for (const [k, v] of Object.entries(want)) if (seen[k] !== v) throw new Error(`Auto at ${hour}:00: ${k} was ${seen[k]}, expected ${v}`);
      await tp.close();
    }
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

  /* 8. Round 93: attached files reach the model, with and without the document index model. Round 101 (F399): the
     .txt is read by its words in one page load and the index model lands in the next, as a user's second visit. */
  {
    let page = await context.newPage();
    let { consoleLines, pageErrors, hosts } = observe(page);
    lastPage = page;
    lastConsole = consoleLines;
    const out = (result.attach = {});
    const manifest = await (await page.request.get(new URL("/models/manifest.json", server.url).href)).json();
    out.indexModelServed = !!manifest.companions?.some((c) => c.id === "embed-e5");
    /* The .txt goes out on the word search: the card must offer it, and the answer must say it was a word search. */
    out.txt = await attachAndAsk(page, consoleLines, "greenhouse-notes.txt", async (p) => p.getByTestId("docs-hold-words").click());
    if (!out.txt.hold) throw new Error("a file with no index model behind it was sent without the index-model card");
    if (!out.txt.wordsOnly) throw new Error("a word-search answer does not say it was a word search");
    noPageErrors(pageErrors, "attach pass, first visit");
    const firstHosts = [...hosts];
    await page.close();
    /* The next visit: nothing of the first page's memory is left, only what the browser stored. */
    page = await context.newPage();
    ({ consoleLines, pageErrors, hosts } = observe(page));
    for (const h of firstHosts) hosts.add(h);
    lastPage = page;
    lastConsole = consoleLines;
    /* The .pdf installs the index model from this host (the card's Download), then goes out by itself. */
    out.pdf = await attachAndAsk(page, consoleLines, "turbine-report.pdf", async (p, seen) => {
      if (!out.indexModelServed) return p.getByTestId("docs-hold-words").click();
      await p.getByTestId("docs-hold-download").click();
      await p.getByTestId("docs-hold").waitFor({ state: "detached", timeout: LOAD_TIMEOUT_MS }).catch(async () => {
        seen.downloadError = await p.getByTestId("docs-hold-error").textContent({ timeout: 1000 }).catch(() => null);
        throw new Error(`the index-model download did not finish: ${seen.downloadError ?? "card still up"}`);
      });
    });
    if (out.indexModelServed && out.pdf.wordsOnly) throw new Error("the index model was installed but the answer still used the word search");
    /* F399: the first visit's .txt is rebuilt from the bytes the browser kept, never "damaged", and answers again. */
    await page.goto(new URL("/documents", server.url).href);
    const txtRow = page.locator('[data-testid^="doc-row-"]').filter({ hasText: "greenhouse-notes.txt" });
    for (let i = 0; i < 300 && !/Indexed/.test((await txtRow.textContent({ timeout: 30_000 })) ?? ""); i++) await page.waitForTimeout(200);
    out.txtRowNextVisit = ((await txtRow.textContent()) ?? "").trim();
    await page.screenshot({ path: path.join(outDir, "web-smoke-attach-next-visit-documents.png"), fullPage: true });
    if (!/Indexed/.test(out.txtRowNextVisit)) throw new Error(`a file read by its words in the first visit is not readable in the next: "${out.txtRowNextVisit}"`);
    out.txtAgain = await attachAndAsk(page, consoleLines, "greenhouse-notes.txt", async (p) => p.getByTestId("docs-hold-words").click());
    if (out.indexModelServed && out.txtAgain.wordsOnly) throw new Error("the first visit's file still answers by its words after the index model landed");
    const deadKeys = consoleLines.filter((l) => /blob:inborn|Content Security Policy/.test(l));
    if (deadKeys.length) throw new Error(`the next visit reached for a file of the first one: ${deadKeys[0]}`);
    out.ragLines = consoleLines.filter((l) => /\[(rag|documents)\]/.test(l));
    noPageErrors(pageErrors, "attach pass");
    if (foreignHosts(hosts).length) throw new Error(`the attach pass talked to ${foreignHosts(hosts).join(", ")}`);
    await page.close();
  }


  /* 9. F1: app.inbornapp.com answered /models/<e5> with its SPA shell; a HEAD probe took that for the model and wllama died on '<!DO'. */
  {
    /* A browser that has never had the index model: its own context, so pass 8's install and library are not in it. */
    const fresh = await browser.newContext({ viewport: { width: 1180, height: 800 } });
    await skipOnboarding(fresh);
    const page = await fresh.newPage();
    const { consoleLines, pageErrors } = observe(page);
    lastPage = page;
    lastConsole = consoleLines;
    const out = (result.deployedLike = {});
    const saved = { deployedLike: server.opts.deployedLike, indexOrigin: server.opts.indexOrigin };
    server.opts.deployedLike = true;
    server.opts.indexOrigin = server.url;
    try {
      await page.goto(server.url);
      await page.getByTestId("download-door").waitFor({ timeout: 60_000 });
      if (!(await page.getByTestId("web-model-choose-instant").count())) await page.getByTestId("web-model-options-toggle").click();
      if (await page.getByTestId("web-model-choose-instant").count()) await page.getByTestId("web-model-choose-instant").click();
      await page.getByTestId("download-model").click();
      await page.getByTestId("composer-input").waitFor({ timeout: LOAD_TIMEOUT_MS });
      const probe = await page.request.get(new URL("/models/multilingual-e5-large-instruct-Q6_K.gguf", server.url).href);
      out.shellForIndexModel = `${probe.status()} ${probe.headers()["content-type"]}`;
      if (!/^200 text\/html/.test(out.shellForIndexModel)) throw new Error(`the deployed-like host did not answer the shell: ${out.shellForIndexModel}`);
      out.txt = await attachAndAsk(page, consoleLines, "greenhouse-notes.txt", async (p, seen) => {
        await p.getByTestId("docs-hold-download").click();
        seen.downloadError = ((await p.getByTestId("docs-hold-error").textContent({ timeout: 60_000 }).catch(() => "")) ?? "").trim();
        await p.screenshot({ path: path.join(outDir, "web-smoke-deployed-like-hold-error.png") });
        await p.getByTestId("docs-hold-words").click();
      });
      if (!/not on the download server/i.test(out.txt.downloadError ?? "")) throw new Error(`a shell served as the index model did not fail as "not on the download server": "${out.txt.downloadError}"`);
      if (!out.txt.wordsOnly) throw new Error("the word-search answer on the deployed-like host does not say so");
      const bad = consoleLines.filter((l) => /\[wllama\] embedder .* loaded|invalid magic|run OCR/i.test(l));
      if (bad.length) throw new Error(`the shell was taken for a model: ${bad[0]}`);
      out.modelLines = consoleLines.filter((l) => /not a model file|\[(rag|documents)\]/.test(l));
      noPageErrors(pageErrors, "deployed-like pass");
    } finally {
      Object.assign(server.opts, saved);
    }
    await fresh.close();
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
  /* 4b. Room for Instant only (F13): the door leads with the model that fits, says why Fast is not the pick, and can download. */
  {
    const fits = await browser.newContext({ viewport: { width: 1180, height: 800 } });
    await skipOnboarding(fits);
    await fits.addInitScript(() => {
      navigator.storage.estimate = async () => ({ usage: 0, quota: 900 * 1024 * 1024 });
    });
    const page = await fits.newPage();
    lastPage = page;
    const out = (result.roomForInstant = {});
    await page.goto(server.url);
    await page.getByTestId("download-door").waitFor({ timeout: 60_000 });
    await page.getByTestId("room-note").waitFor({ timeout: 30_000 });
    out.note = (await page.getByTestId("room-note").textContent()) ?? "";
    out.door = (await page.getByTestId("download-door").textContent()) ?? "";
    out.noSpaceShown = await page.getByTestId("no-space").isVisible();
    out.buttonDisabled = await page.getByTestId("download-model").isDisabled();
    out.buttonText = (await page.getByTestId("download-model").textContent()) ?? "";
    out.screenshot = path.join(outDir, "web-smoke-room-instant.png");
    await page.screenshot({ path: out.screenshot });
    if (!/^Fast needs .+; you have .+, so Instant is recommended\.$/.test(out.note)) throw new Error(`room note unexpected: ${out.note}`);
    if (!/Download Instant/.test(out.door) || out.noSpaceShown || out.buttonDisabled) throw new Error(`900 MB free still leads with a model that does not fit: ${out.door}`);
    await fits.close();
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
console.log(`PASS: 900 MB free leads with the model that fits: "${result.roomForInstant.note}" · button "${result.roomForInstant.buttonText}"`);
console.log(`PASS: catalog ${result.first.catalog.type} · models ${result.first.catalog.models.join(", ")}`);
console.log(`PASS: no React Native prop on the DOM, composer icons aria-hidden (${f.a11yProps.icons.map((i) => i.id).join(", ")})`);
if (result.dev.skipped) console.log(`SKIP: development export pass (${result.dev.skipped})`);
else console.log(`PASS: development export walked door -> onboarding -> chat with 0 React warnings, 0 LogBox reports (${result.dev.failedRequests.length} failed requests: ${result.dev.failedRequests.join(", ") || "none"})`);
console.log(`PASS: broken catalog door "${result.brokenCatalog.text}"`);
console.log(`PASS: attached .txt answered on the word search with SOURCES "${result.attach.txt.sources}"; .pdf answered ${result.attach.indexModelServed ? "after installing the index model from this host" : "on the word search (no index model served)"} with SOURCES "${result.attach.pdf.sources}"; in the next page load the .txt row reads "${result.attach.txtRowNextVisit}" and answers again with SOURCES "${result.attach.txtAgain.sources}"${result.attach.txtAgain.wordsOnly ? " (words only)" : " by meaning"}`);
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
console.log(`PASS: pseudo-locale at 390 on ${LAYOUT_SCREENS.map((s) => s.id).join(", ")} — no horizontal scroll; the PRO chip stays on the Folders row in ${LOCALES.length} locales`);
console.log(`PASS: Auto follows a live OS change at 12:00 (dark → light → dark) and stays dark at 20:00 under a light OS`);
console.log(`PASS: layout swept ${LAYOUT_SCREENS.map((s) => s.id).join(", ")} at ${REQUIRED_WIDTHS.join(" / ")} in ${REQUIRED_THEMES.join(" + ")} — no horizontal scroll, composer row aligned, every control >= ${MIN_TOUCH_PX}px`);
console.log(`PASS: <html lang> follows the UI language in ${Object.keys(result.labels).length} locales (ja = "${result.labels.ja.html.lang}", pseudo = "${result.labels.pseudo.html.lang}")`);
console.log(`PASS: locked, Tab reaches only ${result.lock.stops.join(", ")}; no chat title in the accessibility tree, no palette, no answer in the DOM; unlocked cleanly`);
console.log(`PASS: ${Object.keys(result.labels).length} locales at 390, no clipped sidebar label (fr incognito = "${result.labels.fr.incognito}")`);
console.log(`PASS: no model, the price list still reads ${result.paywallWithoutModel.pro.replace(/\n/g, " · ")} / ${result.paywallWithoutModel.work.replace(/\n/g, " · ")}`);
