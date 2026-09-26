#!/usr/bin/env node
/**
 * F404: one reload after a deploy must show the new build. The service worker is skipWaiting + clientsClaim, so the
 * reload itself is still answered from the OLD precache while the new worker installs; the page has to hand over.
 *
 *   idle:  build A controls a persistent profile → build B lands (index.html + its precache revision) → ONE reload
 *          → build B on screen without a second reload.
 *   busy:  a model download is running when B takes control → no reload, the "new version is ready" line shows,
 *          and pressing it shows build B.
 *
 * Builds A and B are copies of apps/web/dist in a temp dir; B differs only by a <meta name="inborn-build"> and the
 * index.html revision in sw.js, which is exactly what a deploy changes for the shell.
 *
 *   node scripts/web-update-check.mjs            (standalone; web-smoke.mjs runs it too)
 */
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer, request } from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defaults, startServer } from "./serve-web.mjs";

const BUILD_META = /<meta name="inborn-build" content="[^"]*">/;
const settle = (ms) => new Promise((r) => setTimeout(r, ms));

function stamp(dir, build) {
  const indexPath = path.join(dir, "index.html");
  const html = readFileSync(indexPath, "utf8").replace(BUILD_META, "");
  writeFileSync(indexPath, html.replace("<head>", `<head><meta name="inborn-build" content="${build}">`));
  const swPath = path.join(dir, "sw.js");
  const sw = readFileSync(swPath, "utf8").replace(/(\{url:"index\.html",revision:")[^"]*(")/, `$1build-${build}-${Date.now()}$2`);
  writeFileSync(swPath, sw);
}

/** A front for the static host that trickles the GGUF, so a download is still running when the new worker takes over. */
function throttlingProxy(upstreamPort) {
  const server = createServer((req, res) => {
    const up = request({ host: "127.0.0.1", port: upstreamPort, path: req.url, method: req.method, headers: req.headers }, (u) => {
      res.writeHead(u.statusCode ?? 502, u.headers);
      if (!/\.gguf(\?|$)/.test(req.url ?? "")) return void u.pipe(res);
      u.on("data", (chunk) => {
        u.pause();
        res.write(chunk, () => setTimeout(() => u.resume(), 20));
      });
      u.on("end", () => res.end());
    });
    up.on("error", () => res.destroy());
    req.pipe(up);
    res.on("close", () => up.destroy());
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve({ url: `http://127.0.0.1:${server.address().port}`, close: () => new Promise((r) => (server.closeAllConnections(), server.close(r))) })));
}

const buildOf = (page) => page.evaluate(() => document.querySelector('meta[name="inborn-build"]')?.getAttribute("content") ?? "none").catch(() => "navigating");

async function waitForBuild(page, want, ms) {
  const deadline = Date.now() + ms;
  let seen = await buildOf(page);
  while (seen !== want && Date.now() < deadline) {
    await settle(200);
    seen = await buildOf(page);
  }
  return seen;
}

async function controlledPage(context, url, readyTestId) {
  const page = context.pages()[0] ?? (await context.newPage());
  await page.goto(url);
  await page.waitForFunction(() => !!navigator.serviceWorker?.controller, null, { timeout: 60_000 });
  /* A real returning visitor's page is controlled from its first byte; the first visit only gets there by clientsClaim. */
  await page.reload();
  await page.waitForFunction(() => !!navigator.serviceWorker?.controller, null, { timeout: 60_000 });
  await page.getByTestId(readyTestId).waitFor({ timeout: 60_000 });
  return page;
}

async function pass({ chromium, executablePath, dist, outDir, name, busy }) {
  const root = mkdtempSync(path.join(os.tmpdir(), `inborn-update-${name}-`));
  const site = path.join(root, "site");
  cpSync(dist, site, { recursive: true });
  stamp(site, "A");
  const host = await startServer({ port: 0, dist: site });
  const proxy = await throttlingProxy(host.port);
  const context = await chromium.launchPersistentContext(path.join(root, "profile"), { executablePath, headless: true, viewport: { width: 1440, height: 900 } });
  const out = { name };
  try {
    const page = await controlledPage(context, `${proxy.url}${busy ? "/onboarding/model" : "/"}`, busy ? "download-model" : "onboarding-welcome");
    out.loads = 0;
    page.on("load", () => out.loads++);
    out.before = await buildOf(page);
    if (busy) {
      await page.getByTestId("download-model").click();
      await page.getByTestId("download-cancel").waitFor({ timeout: 30_000 }).catch(async (e) => {
        await page.screenshot({ path: path.join(outDir, `update-${name}-no-download.png`) });
        const shown = await page.locator("[data-testid]").evaluateAll((els) => els.map((el) => el.getAttribute("data-testid")));
        throw new Error(`the download never started; on screen: ${shown.join(", ")} (${e.message.split("\n")[0]})`);
      });
    }
    stamp(site, "B");
    if (busy) {
      /* The tab stays open through the deploy, which is what the visibility re-check is for. */
      await page.evaluate(() => navigator.serviceWorker.getRegistration().then((r) => r?.update()));
      await page.getByTestId("update-ready").waitFor({ timeout: 30_000 }).catch(() => undefined);
      out.lineShown = (await page.getByTestId("update-ready").count()) > 0;
      out.stillDownloading = (await page.getByTestId("download-cancel").count()) > 0;
      out.buildWhileBusy = await buildOf(page);
      await page.screenshot({ path: path.join(outDir, `update-${name}-line.png`) });
      if (out.lineShown) {
        await page.getByTestId("update-ready-refresh").click();
        out.after = await waitForBuild(page, "B", 20_000);
      } else out.after = out.buildWhileBusy;
    } else {
      out.loads = 0;
      await page.reload();
      out.firstPaint = await buildOf(page);
      out.after = await waitForBuild(page, "B", 20_000);
      /* Only for the record: the build a second, manual reload would show. */
      if (out.after !== "B") {
        await page.reload();
        out.afterSecondReload = await waitForBuild(page, "B", 10_000);
      }
    }
    await page.screenshot({ path: path.join(outDir, `update-${name}-after.png`) });
  } finally {
    await context.close();
    await proxy.close();
    await host.close();
    rmSync(root, { recursive: true, force: true });
  }
  out.ok = busy ? out.lineShown === true && out.stillDownloading === true && out.buildWhileBusy === "A" && out.after === "B" : out.before === "A" && out.after === "B";
  return out;
}

/** Runs both passes; resolves with their results and `ok`. */
export async function updateCheck({ chromium, executablePath, dist = defaults.dist, outDir }) {
  const idle = await pass({ chromium, executablePath, dist, outDir, name: "idle", busy: false });
  const busy = await pass({ chromium, executablePath, dist, outDir, name: "busy", busy: true });
  return { ok: idle.ok && busy.ok, idle, busy };
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
  const outDir = process.env.SMOKE_OUT_DIR ?? mkdtempSync(path.join(os.tmpdir(), "inborn-update-out-"));
  const result = await updateCheck({ chromium, executablePath, outDir });
  console.log(JSON.stringify(result, null, 2));
  console.log(result.ok ? "UPDATE CHECK: PASS" : "UPDATE CHECK: FAIL");
  process.exit(result.ok ? 0 : 1);
}
