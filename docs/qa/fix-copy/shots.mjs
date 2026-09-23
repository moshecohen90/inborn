#!/usr/bin/env node
/**
 * Round 48 evidence (docs/qa/fix-copy): the app's Proof screen and the site's home and proof pages at 390 and 1440,
 * before and after. The Proof screen is shot in English and in German, because `proof.outIn` was English in all seven
 * translations (F214) and that is the one change on that screen a browser can show.
 *
 *   node docs/qa/fix-copy/shots.mjs --tag after
 *
 * PORT keeps the web origin stable so OPFS survives between runs. CHROMIUM_PATH / PLAYWRIGHT_CORE_DIR as in web-smoke.
 */
import { createRequire } from "node:module";
import { createReadStream, existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startServer } from "../../../scripts/serve-web.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "../../..");
const tag = process.argv[process.argv.indexOf("--tag") + 1] ?? "shot";
const outDir = path.join(here, tag);
const profile = process.env.SHOTS_PROFILE ?? path.join(process.env.TMPDIR ?? "/tmp", "inborn-fix-copy-shots-profile");
const WEB_PORT = Number(process.env.PORT ?? 8503);
const SITE_PORT = WEB_PORT + 1;
const WIDTHS = [390, 1440];
const MIME = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".xml": "application/xml", ".txt": "text/plain; charset=utf-8", ".ico": "image/x-icon" };

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

/** The site is plain files with absolute asset paths, so it needs an origin rather than file://. */
function serveSite(root, port) {
  const server = createServer((req, res) => {
    const rel = decodeURIComponent(req.url.split("?")[0]).replace(/^\/+/, "") || "index.html";
    for (const candidate of [rel, `${rel}.html`, path.join(rel, "index.html")]) {
      const file = path.join(root, candidate);
      if (existsSync(file) && statSync(file).isFile()) {
        res.writeHead(200, { "content-type": MIME[path.extname(file)] ?? "application/octet-stream" });
        return createReadStream(file).pipe(res);
      }
    }
    res.writeHead(404).end("not found");
  });
  return new Promise((resolve) => server.listen(port, "127.0.0.1", () => resolve({ url: `http://127.0.0.1:${port}`, close: () => new Promise((r) => server.close(r)) })));
}

const playwright = loadPlaywright();
const executablePath = findChromium(playwright.chromium);
mkdirSync(outDir, { recursive: true });
const web = await startServer({ port: WEB_PORT });
const site = await serveSite(path.join(repo, "apps/site/dist"), SITE_PORT);
console.log(`web ${web.url} · site ${site.url} · shots → ${outDir}`);

const context = await playwright.chromium.launchPersistentContext(profile, { headless: true, executablePath, viewport: { width: 1180, height: 900 } });
const shot = async (page, name) => {
  await page.screenshot({ path: path.join(outDir, `${name}.png`), fullPage: true });
  console.log(`  ${tag}/${name}.png`);
};

try {
  /* The download door only shows while OPFS is empty; once the model is stored the page reloads into the app. */
  const boot = await context.newPage();
  await boot.goto(web.url, { waitUntil: "domcontentloaded" });
  await boot.getByTestId("download-model").waitFor({ timeout: 20_000 }).catch(() => undefined);
  if (await boot.getByTestId("download-model").count()) {
    console.log("  downloading the model into OPFS (once per profile)…");
    await boot.getByTestId("download-model").click();
    await boot.getByTestId("download-door").waitFor({ state: "detached", timeout: 10 * 60_000 });
  }
  await boot.close();

  for (const locale of ["en", "de"]) {
    for (const width of WIDTHS) {
      const page = await context.newPage();
      await page.emulateMedia({ colorScheme: "dark" });
      await page.setViewportSize({ width, height: width < 500 ? 844 : 900 });
      await page.goto(web.url, { waitUntil: "domcontentloaded" });
      await page.evaluate((l) => localStorage.setItem("inborn.prefs", JSON.stringify({ onboarded: true, locale: l })), locale);
      await page.goto(`${web.url}/proof`, { waitUntil: "domcontentloaded" });
      await page.getByTestId("proof").waitFor({ timeout: 60_000 });
      await page.waitForTimeout(600);
      await shot(page, `proof-screen-${locale}-${width}`);
      await page.close();
    }
  }

  for (const [name, route] of [["site-home", "/"], ["site-proof", "/proof"]]) {
    for (const width of WIDTHS) {
      const page = await context.newPage();
      await page.setViewportSize({ width, height: width < 500 ? 844 : 900 });
      await page.goto(`${site.url}${route}`, { waitUntil: "load" });
      if (route === "/") await page.locator("section#proof").scrollIntoViewIfNeeded();
      await page.waitForTimeout(300);
      await shot(page, `${name}-${width}`);
      await page.close();
    }
  }
} finally {
  await context.close();
  await site.close();
  await web.close();
  console.log("closed");
}
