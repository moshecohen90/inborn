#!/usr/bin/env node
/**
 * Round 101 (F400): the web verifier's F7 drive. Documents -> select one file -> Ask. An on-topic question answers with
 * SOURCES; an off-topic one, and a question the selected file does not hold, must say nothing matched and send
 * nothing to the model (before: "South Korea won the 1998 World Cup").
 *
 *   MODELS_DIR=/path/to/ggufs DIST=apps/web/dist W=1440 OUT=docs/qa/fix-file-persist/f7-after-1440 node docs/qa/fix-file-persist/f7-ask.mjs
 *
 * Deployed-like host; e5 is fetched from the catalog's CDN URL, answered from this machine (see two-visit.mjs).
 */
import { execFileSync } from "node:child_process";
import { createReadStream, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:https";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defaults, startServer } from "../../../scripts/serve-web.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const W = Number(process.env.W ?? 1440);
const out = path.resolve(process.env.OUT ?? path.join(here, `f7-${W}`));
mkdirSync(out, { recursive: true });
const PORT = Number(process.env.PORT ?? 8941);
const CDN = "https://models.inbornapp.com";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const certDir = mkdtempSync(path.join(os.tmpdir(), "inborn-r101-cert-"));
execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", path.join(certDir, "key.pem"), "-out", path.join(certDir, "cert.pem"), "-days", "1", "-subj", "/CN=127.0.0.1"], { stdio: "ignore" });
const cdn = createServer({ key: readFileSync(path.join(certDir, "key.pem")), cert: readFileSync(path.join(certDir, "cert.pem")) }, (req, res) => {
  const file = path.join(defaults.modelsDir, path.basename((req.url ?? "").split("?")[0]));
  if (!existsSync(file)) return res.writeHead(404).end();
  const size = statSync(file).size;
  const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? "");
  const start = m && m[1] ? Number(m[1]) : 0;
  const end = m && m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
  res.writeHead(m ? 206 : 200, { "Access-Control-Allow-Origin": "*", "Cross-Origin-Resource-Policy": "cross-origin", "Content-Type": "application/octet-stream", "Content-Length": end - start + 1, "Accept-Ranges": "bytes", ...(m ? { "Content-Range": `bytes ${start}-${end}/${size}` } : {}) });
  if (req.method === "HEAD") return res.end();
  createReadStream(file, { start, end }).pipe(res);
});
await new Promise((r) => cdn.listen(PORT + 1, "127.0.0.1", r));

const req = createRequire(path.join(process.env.PLAYWRIGHT_CORE_DIR ?? "/Users/moshecohen/.npm/_npx/9833c18b2d85bc59/node_modules", "/"));
const { chromium } = req("playwright-core");
const cache = path.join(os.homedir(), "Library/Caches/ms-playwright");
const shell = process.env.CHROMIUM_PATH ?? readdirSync(cache).filter((d) => /^chromium_headless_shell-\d+$/.test(d)).sort().reverse().map((d) => path.join(cache, d, "chrome-headless-shell-mac-arm64", "chrome-headless-shell"))[0];
const server = await startServer({ port: PORT, deployedLike: true, indexOrigin: CDN, ...(process.env.DIST ? { dist: path.resolve(process.env.DIST) } : {}) });
const browser = await chromium.launch({ headless: true, executablePath: shell });
const report = { width: W, dist: server.opts.dist, runs: [] };
try {
  const ctx = await browser.newContext({ viewport: { width: W, height: W < 500 ? 844 : 900 }, ignoreHTTPSErrors: true });
  ctx.setDefaultTimeout(20_000);
  await ctx.route(`${CDN}/v1/**`, (route) => route.continue({ url: route.request().url().replace(CDN, `https://127.0.0.1:${PORT + 1}`) }));
  const page = await ctx.newPage();
  const log = [];
  page.on("console", (m) => log.push(`${m.type()}: ${m.text()}`));
  await page.goto(server.url);
  await page.getByTestId("download-door").waitFor({ timeout: 60_000 });
  if (!(await page.getByTestId("web-model-choose-instant").count())) await page.getByTestId("web-model-options-toggle").click();
  if (await page.getByTestId("web-model-choose-instant").count()) await page.getByTestId("web-model-choose-instant").click();
  await page.getByTestId("download-model").click();
  await page.getByTestId("onboarding-welcome").waitFor({ timeout: 300_000 });
  await page.getByTestId("onboarding-continue").click();
  await page.getByTestId("start-chatting").click();
  const start = page.getByTestId("sealed-start");
  await start.waitFor({ timeout: 60_000 });
  for (let i = 0; i < 100 && (await start.isDisabled()); i++) await sleep(100);
  await start.click();
  await page.getByTestId("lock-start").click();
  await page.getByTestId("composer-input").waitFor({ timeout: 300_000 });
  for (let i = 0; i < 3000 && !log.some((l) => /\[inborn\] \w+ loaded/.test(l)); i++) await sleep(100);
  /* Each file in its own chat; the first card installs e5 from the CDN URL. */
  for (const [file, q] of [["harbor-report.txt", "What did the new fuel pier cost?"], ["fleet-memo.pdf", "Who was the chief engineer?"]]) {
    await page.goto(server.url);
    await page.getByTestId("composer-input").waitFor({ timeout: 120_000 });
    await sleep(1500);
    if (await page.getByTestId("new-chat").isVisible().catch(() => false)) {
      await page.getByTestId("new-chat").click();
      if (await page.getByTestId("new-chat-sheet").waitFor({ timeout: 1500 }).then(() => true, () => false)) await page.getByTestId("start-chat").click();
      await sleep(600);
    }
    await page.getByTestId("attach").click();
    const [chooser] = await Promise.all([page.waitForEvent("filechooser", { timeout: 15_000 }), page.getByTestId("attach-import").click()]);
    await chooser.setFiles(path.join(here, "fixtures", file));
    await page.getByTestId("attached-docs").filter({ hasText: file }).waitFor({ timeout: 30_000 });
    const before = await page.getByTestId("ledger-toggle").count();
    await page.getByTestId("composer-input").fill(q);
    await page.getByTestId("send").click();
    if (await page.getByTestId("docs-hold").waitFor({ timeout: 8_000 }).then(() => true, () => false)) {
      await page.getByTestId("docs-hold-download").click();
      for (let i = 0; i < 240 && (await page.getByTestId("docs-hold").count()) && !(await page.getByTestId("docs-hold-error").count()); i++) await sleep(1000);
      report.downloadError = (await page.getByTestId("docs-hold-error").count()) ? await page.getByTestId("docs-hold-error").textContent() : null;
    }
    for (let i = 0; i < 900 && (await page.getByTestId("ledger-toggle").count()) <= before; i++) await sleep(200);
  }

  async function askOn(docRe, q, name) {
    await page.goto(`${server.url}/documents`);
    await page.locator('[data-testid^="doc-row-"]').first().waitFor({ timeout: 30_000 });
    await sleep(1500);
    const rows = await page.locator('[data-testid^="doc-row-"]').allTextContents();
    const idx = rows.findIndex((r) => docRe.test(r));
    await page.locator('[data-testid^="doc-select-"]').nth(idx).click();
    await page.getByTestId("documents-ask-selected").click();
    await page.getByTestId("ask-sheet").waitFor({ timeout: 5000 });
    const from = log.length;
    await page.getByTestId("ask-input").fill(q);
    await page.getByTestId("ask-send").click();
    await page.getByTestId("ask-stats").waitFor({ timeout: 240_000 });
    for (let i = 0; i < 480 && (await page.getByTestId("ask-stop").count()); i++) await sleep(500);
    await sleep(800);
    const text = async (id) => ((await page.getByTestId(id).first().textContent({ timeout: 500 }).catch(() => "")) ?? "").trim();
    const r = { name, doc: rows[idx]?.slice(0, 40), q, answer: await text("ask-answer"), notFound: (await page.getByTestId("ask-not-found").count()) ? await text("ask-not-found") : null, noneMatched: await text("ask-none-matched"), stats: await text("ask-stats"), sources: await text("citations"), rag: log.slice(from).filter((l) => /\[rag\]/.test(l)).map((l) => l.slice(0, 220)) };
    await page.screenshot({ path: path.join(out, `ask-${name}-${W}.png`) });
    report.runs.push(r);
    console.log(name, JSON.stringify(r));
    return r;
  }
  const hit = await askOn(/harbor/, "What did the fuel pier cost?", "hit");
  const off1 = await askOn(/harbor/, "Who won the 1998 football World Cup?", "offtopic-worldcup");
  const off2 = await askOn(/fleet/, "What did the fuel pier cost?", "offtopic-wrongfile");
  report.hitOk = /3[.,]2/.test(hit.answer) && !hit.notFound && hit.sources.includes("harbor-report.txt");
  report.missOk = [off1, off2].every((r) => r.notFound && !r.answer);
  report.pass = report.hitOk && report.missOk;
  console.log(JSON.stringify({ hitOk: report.hitOk, missOk: report.missOk, downloadError: report.downloadError }));
} finally {
  writeFileSync(path.join(out, "report.json"), JSON.stringify(report, null, 2));
  await browser.close();
  await server.close();
  cdn.closeAllConnections?.();
  cdn.close();
  rmSync(certDir, { recursive: true, force: true });
}
process.exit(report.pass ? 0 : 1);
