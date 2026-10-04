#!/usr/bin/env node
/**
 * Round 128 evidence (brand ring = app icon): the web export at a phone viewport (390 × 844 @3×), dark and light,
 * on the three screens that show the seal: Welcome (open), Sealed (closed, after the animation) and the chat header (28 px).
 *
 *   MODELS_DIR=/path/to/ggufs node docs/qa/brand-ring-128/shots.mjs --tag before --dist /path/to/dist
 *
 * The profile persists (SHOTS_PROFILE) so the model goes into OPFS once; PORT keeps the origin, and so OPFS, stable.
 * CHROMIUM_PATH / PLAYWRIGHT_CORE_DIR as in scripts/web-smoke.mjs.
 */
import { createRequire } from "node:module";
import { existsSync, mkdirSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startServer } from "../../../scripts/serve-web.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const arg = (name, fallback) => (process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : fallback);
const tag = arg("--tag", "shot");
const dist = arg("--dist", undefined);
const schemes = arg("--schemes", "dark,light").split(",");
const outDir = arg("--out", here);
const profile = process.env.SHOTS_PROFILE ?? path.join(process.env.TMPDIR ?? "/tmp", "inborn-brand-ring-profile");
const PORT = Number(process.env.PORT ?? 8497);

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
const server = await startServer({ port: PORT, ...(dist ? { dist } : {}) });
const url = server.url;
console.log(`serving ${server.opts.dist} at ${url} · shots → ${outDir}`);

const context = await playwright.chromium.launchPersistentContext(profile, { headless: true, executablePath, viewport: { width: 390, height: 844 }, deviceScaleFactor: 3 });
/* The full screen, then the topmost seal on it with room around it: the glow reaches past the laid-out box. */
const shot = async (page, name) => {
  const file = path.join(outDir, `${tag}-${name}.png`);
  await page.screenshot({ path: file });
  console.log(`  ${path.relative(here, file)}`);
  const boxes = (await Promise.all((await page.getByTestId("seal").all()).map((l) => l.boundingBox()))).filter(Boolean).sort((a, b) => a.y - b.y);
  if (!boxes.length) return;
  const b = boxes[0];
  const m = Math.round(b.width * 0.6);
  await page.screenshot({ path: path.join(outDir, `${tag}-${name}-mark.png`), clip: { x: b.x - m, y: b.y - m, width: b.width + 2 * m, height: b.height + 2 * m } });
};
/* The theme is pinned, not left on auto: the 18:00 clock rule (D7) would turn a light pass dark after six in the evening. */
const setOnboarded = async (page, done, scheme) => {
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.evaluate(([v, s]) => localStorage.setItem("inborn.prefs", JSON.stringify({ onboarded: v, themeMode: s })), [done, scheme]);
};

try {
  for (const scheme of schemes) {
    const page = await context.newPage();
    page.on("console", (m) => process.env.VERBOSE && console.log(`    ${m.text()}`));
    await page.emulateMedia({ colorScheme: scheme });
    await setOnboarded(page, false, scheme);
    await page.goto(`${url}/onboarding`, { waitUntil: "domcontentloaded" });
    await page.getByTestId("onboarding-welcome").waitFor({ timeout: 60_000 });
    await page.waitForTimeout(800);
    await shot(page, `welcome-${scheme}`);

    await page.getByTestId("onboarding-continue").click();
    await page.getByTestId("onboarding-model").waitFor({ timeout: 60_000 });
    /* First run on this profile: the model step is the download itself; later runs find it stored and only wait for the continue. */
    if (await page.getByTestId("download-model").count()) {
      console.log("  downloading the model into OPFS (once per profile)…");
      await page.getByTestId("download-model").click();
      await page.getByTestId("download-progress").waitFor({ timeout: 30_000 }).catch(() => undefined);
      await page.getByTestId("download-progress").waitFor({ state: "detached", timeout: 10 * 60_000 });
      console.log("  model stored");
    }
    /* A finished download (or a stored model's "use") moves on by itself; only the chrome-nano tier shows a continue. */
    if (await page.getByTestId("use-model").count()) await page.getByTestId("use-model").click();
    for (let i = 0; i < 600 && !(await page.getByTestId("onboarding-sealed").count()); i++) {
      if (await page.getByTestId("start-chatting").count()) await page.getByTestId("start-chatting").click();
      await page.waitForTimeout(100);
    }
    await page.getByTestId("onboarding-sealed").waitFor({ timeout: 60_000 });
    /* The seal animates before its buttons wake up; then the bloom needs its 600 ms to fade. */
    for (let i = 0; i < 100 && (await page.getByTestId("sealed-start").isDisabled()); i++) await page.waitForTimeout(100);
    await page.waitForTimeout(1200);
    await shot(page, `sealed-${scheme}`);

    await setOnboarded(page, true, scheme);
    await page.goto(`${url}/`, { waitUntil: "domcontentloaded" });
    await page.getByTestId("model-chip").waitFor({ timeout: 60_000 });
    await page.waitForTimeout(1500);
    await shot(page, `chat-${scheme}`);
    await page.close();
  }
} finally {
  await context.close();
  await server.close();
  console.log("closed");
}
