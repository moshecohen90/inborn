#!/usr/bin/env node
/**
 * Onboarding screenshots for round 36 (docs/qa/onboarding-rework): the web export walked at 390 / 768 / 1440
 * in both colour schemes. The model has to be in OPFS before the app boots, so the browser profile is persistent
 * and the download door is walked once; later runs reuse the profile and start straight on the onboarding.
 *
 *   MODELS_DIR=/path/to/ggufs node docs/qa/onboarding-rework/shots.mjs --tag before
 *
 * PORT keeps the origin stable across runs (OPFS is per origin). CHROMIUM_PATH / PLAYWRIGHT_CORE_DIR as in scripts/web-smoke.mjs.
 */
import { createRequire } from "node:module";
import { existsSync, mkdirSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startServer } from "../../../scripts/serve-web.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const tag = process.argv[process.argv.indexOf("--tag") + 1] ?? "shot";
const only = process.argv.includes("--only") ? process.argv[process.argv.indexOf("--only") + 1] : null;
const pick = process.argv.includes("--pick") ? process.argv[process.argv.indexOf("--pick") + 1] : null;
/** `--route /proof` skips the onboarding walk and opens one screen of the onboarded app instead. */
const route = process.argv.includes("--route") ? process.argv[process.argv.indexOf("--route") + 1] : null;
const reveal = process.argv.includes("--reveal") ? process.argv[process.argv.indexOf("--reveal") + 1] : null;
const outDir = path.join(here, tag);
const profile = process.env.SHOTS_PROFILE ?? path.join(process.env.TMPDIR ?? "/tmp", "inborn-onboarding-shots-profile");
const PORT = Number(process.env.PORT ?? 8496);
const WIDTHS = [390, 768, 1440];
const SCHEMES = ["dark", "light"];

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

/** [screen testID, testID to click to leave it]. `before` still walks through the onboarding airplane step, which round 36 removes. */
const STEPS = () =>
  process.argv.includes("--legacy-flow")
    ? [
        ["onboarding-welcome", "onboarding-continue"],
        ["onboarding-model", "start-chatting"],
        ["airplane-test", null],
      ]
    : [
        ["onboarding-welcome", "onboarding-continue"],
        ["onboarding-model", "start-chatting"],
        ["onboarding-sealed", null],
      ];

const playwright = loadPlaywright();
const executablePath = findChromium(playwright.chromium);
mkdirSync(outDir, { recursive: true });
const server = await startServer({ port: PORT });
const url = server.url;
console.log(`serving ${url} · shots → ${outDir}`);

const context = await playwright.chromium.launchPersistentContext(profile, { headless: true, executablePath, viewport: { width: 1180, height: 900 } });
const shot = async (page, name) => {
  const file = path.join(outDir, `${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  console.log(`  ${path.relative(here, file)}`);
};

try {
  /* The door only appears while OPFS is empty; once the model is stored the page reloads into the app itself. */
  const boot = await context.newPage();
  boot.on("console", (m) => process.env.VERBOSE && console.log(`    ${m.text()}`));
  await boot.goto(url, { waitUntil: "domcontentloaded" });
  /* React mounts after domcontentloaded; asking for the door before it renders always answers "no door". */
  await boot.getByTestId("download-model").waitFor({ timeout: 20_000 }).catch(() => undefined);
  if (await boot.getByTestId("download-model").count()) {
    console.log("  downloading the model into OPFS (once per profile)…");
    await boot.getByTestId("download-model").click();
    await boot.getByTestId("download-door").waitFor({ state: "detached", timeout: 10 * 60_000 });
    console.log("  model stored");
  }
  await boot.close();

  for (const scheme of SCHEMES) {
    for (const width of WIDTHS) {
      const page = await context.newPage();
      await page.emulateMedia({ colorScheme: scheme });
      await page.setViewportSize({ width, height: width < 500 ? 844 : 900 });
      await page.goto(url, { waitUntil: "domcontentloaded" });
      await page.evaluate((done) => localStorage.setItem("inborn.prefs", JSON.stringify({ onboarded: done })), !!route);
      await page.reload({ waitUntil: "domcontentloaded" });
      const suffix = `${width}-${scheme}`;
      if (route) {
        await page.goto(`${url}${route}`, { waitUntil: "domcontentloaded" });
        const screen = route === "/proof" ? "proof" : "airplane-test";
        await page.getByTestId(screen).waitFor({ timeout: 60_000 });
        /* The screens scroll inside a ScrollView, so a full-page shot still only holds the viewport. */
        if (reveal) await page.getByTestId(reveal).scrollIntoViewIfNeeded();
        await shot(page, `${screen}-${suffix}`);
        await page.close();
        continue;
      }
      const steps = STEPS();
      for (const [screen, next] of steps) {
        await page.getByTestId(screen).waitFor({ timeout: 60_000 });
        /* The seal animates before its buttons wake up; shooting on arrival catches the disabled state. */
        if (screen === "onboarding-sealed") for (let i = 0; i < 100 && (await page.getByTestId("sealed-start").isDisabled()); i++) await page.waitForTimeout(100);
        if (!only || only === screen) await shot(page, `${screen}-${suffix}`);
        /* A second shot after one tap: the choice a screenshot of the resting state cannot show. */
        if (pick && (!only || only === screen) && (await page.getByTestId(pick).count())) {
          await page.getByTestId(pick).click();
          await shot(page, `${screen}-${pick}-${suffix}`);
          /* Picking changes the footer button, so the walk ends here rather than clicking a control that is gone. */
          break;
        }
        if (next) await page.getByTestId(next).click();
      }
      await page.close();
    }
  }
} finally {
  await context.close();
  await server.close();
  console.log("closed");
}
