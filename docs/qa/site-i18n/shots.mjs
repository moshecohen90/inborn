#!/usr/bin/env node
/**
 * Round 67 evidence (F314–F318): the site in English, German and Japanese at 390 and 1440, with the language
 * switcher open, so the eight-language build is judged in a browser and not from the HTML (Moshe, 23.9).
 *
 *   node apps/site/build.mjs && node docs/qa/site-i18n/shots.mjs --tag after
 *
 * PORT picks the private port to serve apps/site/dist on. CHROMIUM_PATH / PLAYWRIGHT_CORE_DIR as in web-smoke.
 */
import { createRequire } from "node:module";
import { createReadStream, existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "../../..");
const tag = process.argv[process.argv.indexOf("--tag") + 1] ?? "shot";
const outDir = path.join(here, tag);
const PORT = Number(process.env.PORT ?? 8529);
const WIDTHS = [390, 1440];
const LOCALES = (process.env.LOCALES ?? "en,de,ja").split(",");
const PAGES = [["", "home"], ["download", "download"], ["proof", "proof"], ["compare", "compare"]];
const MIME = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".xml": "application/xml", ".txt": "text/plain; charset=utf-8", ".woff2": "font/woff2" };

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
const site = await serveSite(path.join(repo, "apps/site/dist"), PORT);
const browser = await playwright.chromium.launch({ headless: true, executablePath, args: ["--disable-gpu", "--hide-scrollbars"] });
console.log(`site ${site.url} · shots → ${path.relative(repo, outDir)}`);

try {
  for (const width of WIDTHS) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    for (const locale of LOCALES) {
      const base = locale === "en" ? "" : `/${locale}`;
      for (const [route, name] of PAGES) {
        await page.goto(`${site.url}${base}/${route}`, { waitUntil: "load" });
        const file = `${name}-${locale}-${width}.png`;
        await page.screenshot({ path: path.join(outDir, file), fullPage: true });
        console.log(`  ${tag}/${file}`);
      }
      /* The switcher is a <details>: open it, so the shot shows the menu a reader actually gets. */
      await page.goto(`${site.url}${base}/`, { waitUntil: "load" });
      await page.locator(".lang > summary").click();
      const file = `switcher-${locale}-${width}.png`;
      await page.screenshot({ path: path.join(outDir, file), clip: { x: 0, y: 0, width, height: Math.min(560, 900) } });
      console.log(`  ${tag}/${file}`);
    }
    await context.close();
  }
} finally {
  await browser.close();
  await site.close();
}
