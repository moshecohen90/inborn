#!/usr/bin/env node
/**
 * Round 93 reproduction: the web app as a user drives it. Door -> Instant -> onboarding -> chat, then each fixture is
 * attached through "+" -> "Add a file…" in a fresh chat and asked about. Records what the screen says and the log.
 *
 *   MODELS_DIR=/path/to/ggufs OUT=docs/qa/web-attach-fix/before node docs/qa/web-attach-fix/attach-repro.mjs
 *
 * NO_EMBED=1 serves the models without the document index GGUF, which is what the CDN does while it answers 404.
 * CDN404=1 answers the index model's URL with 404, as the CDN does while its upload is blocked.
 * BASE=http://127.0.0.1:<port> drives an already running host (another build, or the F1 proxy) instead of starting one.
 * INDEX_ORIGIN / DEPLOYED_LIKE pass through to the host this script starts (see scripts/serve-web.mjs).
 * ASK_DOCS="q1|q2" then opens Documents, selects the first file and asks each question in its Ask sheet (F7).
 * FILES=a.txt,b.pdf limits the run. ACTION=words answers the index-model card with "exact words only" instead of Download.
 */
import { mkdirSync, mkdtempSync, symlinkSync, readdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { URL, fileURLToPath } from "node:url";
import { defaults, startServer } from "../../../scripts/serve-web.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.resolve(process.env.OUT ?? path.join(here, "run"));
mkdirSync(out, { recursive: true });
const QUESTION = "What is this file about? Quote one sentence from it.";
const ALL = ["greenhouse-notes.txt", "ferry-schedule.md", "turbine-report.pdf", "novara-depot.docx", "door.jpg"];
const files = process.env.FILES ? process.env.FILES.split(",") : ALL;

let modelsDir = defaults.modelsDir;
if (process.env.NO_EMBED) {
  /* A models dir holding everything but the document index: what a browser meets while the CDN answers 404. */
  modelsDir = mkdtempSync(path.join(os.tmpdir(), "inborn-noembed-"));
  for (const f of readdirSync(defaults.modelsDir)) if (!/e5|embed/i.test(f)) symlinkSync(path.join(defaults.modelsDir, f), path.join(modelsDir, f));
}

const req = createRequire(path.join(process.env.PLAYWRIGHT_CORE_DIR ?? "/Users/moshecohen/.npm/_npx/9833c18b2d85bc59/node_modules", "/"));
const { chromium } = req("playwright-core");
const cache = path.join(os.homedir(), "Library/Caches/ms-playwright");
const shell = process.env.CHROMIUM_PATH ?? readdirSync(cache).filter((d) => /^chromium_headless_shell-\d+$/.test(d)).sort().reverse().map((d) => path.join(cache, d, "chrome-headless-shell-mac-arm64", "chrome-headless-shell"))[0];

const server = process.env.BASE ? { url: process.env.BASE, close: async () => undefined } : await startServer({ port: 0, modelsDir });
const browser = await chromium.launch({ headless: true, executablePath: shell });
const report = { url: server.url, modelsDir, noEmbed: !!process.env.NO_EMBED, indexOrigin: process.env.INDEX_ORIGIN ?? "", deployedLike: process.env.DEPLOYED_LIKE === "1", modelRequests: [], files: {} };
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  /* CDN404=1: the catalog lists the index model but its host answers 404, which models.inbornapp.com does today. */
  if (process.env.CDN404) await context.route(/multilingual-e5.*\.gguf$/, (route) => route.fulfill({ status: 404, contentType: "text/plain", body: "Not Found" }));
  /* Every request for a GGUF, from the page or its workers: where the index model was fetched from, and what came back. */
  context.on("requestfinished", async (r) => {
    if (!/\.gguf(\?|$)/.test(r.url())) return;
    const res = await r.response().catch(() => null);
    report.modelRequests.push({ method: r.method(), url: r.url(), range: r.headers().range ?? null, status: res?.status() ?? null, type: res?.headers()["content-type"] ?? null });
  });
  context.on("requestfailed", (r) => /\.gguf(\?|$)/.test(r.url()) && report.modelRequests.push({ method: r.method(), url: r.url(), failed: r.failure()?.errorText ?? "failed" }));
  const page = await context.newPage();
  const log = [];
  page.on("console", (m) => log.push(`${m.type()}: ${m.text()}`));
  page.on("pageerror", (e) => log.push(`pageerror: ${e.message}`));
  page.on("framenavigated", (f) => f === page.mainFrame() && log.push(`navigated: ${f.url()}`));
  page.on("worker", (w) => log.push(`worker: ${w.url()}`));
  await page.goto(server.url);
  await page.getByTestId("download-door").waitFor({ timeout: 60_000 });
  /* Instant, as the user in the report chose; the door recommends another model on a desktop. */
  if (!(await page.getByTestId("web-model-choose-instant").count())) await page.getByTestId("web-model-options-toggle").click();
  if (await page.getByTestId("web-model-choose-instant").count()) await page.getByTestId("web-model-choose-instant").click();
  await page.getByTestId("download-model").click();
  await page.getByTestId("onboarding-welcome").waitFor({ timeout: 300_000 });
  await page.getByTestId("onboarding-continue").click();
  await page.getByTestId("start-chatting").click();
  const start = page.getByTestId("sealed-start");
  await start.waitFor({ timeout: 60_000 });
  for (let i = 0; i < 100 && (await start.isDisabled()); i++) await page.waitForTimeout(100);
  await start.click();
  await page.getByTestId("lock-start").click();
  await page.getByTestId("composer-input").waitFor({ timeout: 300_000 });
  for (let i = 0; i < 3000 && !log.some((l) => /\[inborn\] \w+ loaded/.test(l)); i++) await page.waitForTimeout(100);

  /* The hold card at phone width, on its own page, before anything is downloaded. */
  {
    const phone = await context.newPage();
    await phone.setViewportSize({ width: 390, height: 844 });
    await phone.goto(server.url);
    await phone.getByTestId("composer-input").waitFor({ timeout: 120_000 });
    await phone.waitForTimeout(3000);
    await phone.getByTestId("attach").click();
    const [chooser] = await Promise.all([phone.waitForEvent("filechooser", { timeout: 15_000 }), phone.getByTestId("attach-import").click()]);
    await chooser.setFiles(path.join(here, "fixtures", files[0]));
    await phone.waitForTimeout(1500);
    await phone.getByTestId("composer-input").fill(QUESTION);
    await phone.getByTestId("send").click();
    if (await phone.getByTestId("docs-hold").waitFor({ timeout: 8_000 }).then(() => true, () => false)) await phone.screenshot({ path: path.join(out, "hold-390.png") });
    await phone.close();
  }

  for (const name of files) {
    const from = log.length;
    await page.goto(server.url);
    await page.getByTestId("composer-input").waitFor({ timeout: 120_000 });
    for (let i = 0; i < 3000 && !log.slice(from).some((l) => /\[inborn\] \w+ loaded/.test(l)); i++) await page.waitForTimeout(100);
    const before = await page.getByTestId("assistant-text").count();
    await page.getByTestId("attach").click();
    await page.getByTestId("attach-import").waitFor({ timeout: 10_000 });
    const [chooser] = await Promise.all([page.waitForEvent("filechooser", { timeout: 15_000 }), page.getByTestId("attach-import").click()]);
    await chooser.setFiles(path.join(here, "fixtures", name));
    await page.waitForTimeout(1500);
    const r = (report.files[name] = {});
    r.afterPick = (await page.locator("body").innerText()).slice(-900);
    await page.screenshot({ path: path.join(out, `${name}-picked-1440.png`) });
    await page.getByTestId("composer-input").fill(QUESTION);
    if (await page.getByTestId("send").isEnabled()) await page.getByTestId("send").click();
    else r.sendDisabled = true;
    /* Round 93: Send may stop at the index-model card first. ACTION=words sends with the word search, else Download. */
    const held = await page.getByTestId("docs-hold").waitFor({ timeout: 8_000 }).then(() => true, () => false);
    if (held) {
      r.hold = ((await page.getByTestId("docs-hold").textContent()) ?? "").trim();
      /* No resize here: a phone width is another layout, and the remount drops the held draft. */
      await page.screenshot({ path: path.join(out, `${name}-hold-1440.png`) });
      const download = page.getByTestId("docs-hold-download");
      if (process.env.ACTION !== "words" && (await download.count())) {
        await download.click();
        /* Either the card goes (the model landed and the turn went out) or it shows the download's plain error. */
        for (let i = 0; i < 1800 && (await page.getByTestId("docs-hold").count()) && !(await page.getByTestId("docs-hold-error").count()); i++) await page.waitForTimeout(100);
        if (await page.getByTestId("docs-hold-error").count()) {
          r.downloadError = ((await page.getByTestId("docs-hold-error").textContent()) ?? "").trim();
          await page.screenshot({ path: path.join(out, `${name}-download-error-1440.png`) });
        }
      }
      if (await page.getByTestId("docs-hold").count()) await page.getByTestId("docs-hold-words").click();
    }
    /* Done = a new assistant row whose text has not moved for 3 s and no Stop button; or 4 minutes. */
    let last = "";
    let still = 0;
    for (let i = 0; i < 2400 && still < 30; i++) {
      await page.waitForTimeout(100);
      const n = await page.getByTestId("assistant-text").count();
      const text = n > before ? ((await page.getByTestId("assistant-text").last().textContent()) ?? "") : "";
      const stopping = await page.getByTestId("stop").count();
      still = text && text === last && !stopping ? still + 1 : 0;
      last = text;
      if (!text && i > 150 && (await page.getByTestId("vision-hold").count())) break;
    }
    r.answer = last.trim();
    r.citations = (await page.getByTestId("citations").last().textContent({ timeout: 1000 }).catch(() => null))?.trim() ?? null;
    r.notices = {};
    for (const id of ["docs-hold", "docs-lexical", "none-matched", "reading-docs", "vision-hold", "reindexing"]) {
      const c = await page.getByTestId(id).count();
      if (c) r.notices[id] = ((await page.getByTestId(id).first().textContent()) ?? "").trim();
    }
    r.chips = ((await page.getByTestId("attached-docs").textContent({ timeout: 1000 }).catch(() => "")) ?? "").trim();
    r.log = log.slice(from).filter((l) => process.env.ALL_LOG || /\[(documents|rag|inborn|wllama|embed)|error|warn|navigated|worker/i.test(l)).slice(-60);
    await page.screenshot({ path: path.join(out, `${name}-answer-1440.png`), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(out, `${name}-answer-390.png`), fullPage: true });
    await page.setViewportSize({ width: 1440, height: 900 });
    console.log(`${name}: ${JSON.stringify({ hold: r.hold, downloadError: r.downloadError, answer: r.answer.slice(0, 200), citations: r.citations, notices: r.notices, chips: r.chips })}`);
  }
  if (process.env.ASK_DOCS) {
    report.ask = [];
    await page.goto(new URL("/documents", server.url).href);
    await page.locator('[data-testid^="doc-select-"]').first().waitFor({ timeout: 30_000 });
    await page.locator('[data-testid^="doc-select-"]').first().click();
    await page.getByTestId("documents-ask-selected").click();
    for (const [i, q] of process.env.ASK_DOCS.split("|").entries()) {
      await page.getByTestId("ask-input").fill(q);
      await page.getByTestId("ask-send").click();
      await page.getByTestId("ask-stats").waitFor({ timeout: 240_000 });
      /* The stats line is written once the answer has finished streaming. */
      const a = {
        question: q,
        answer: ((await page.getByTestId("ask-answer").textContent({ timeout: 500 }).catch(() => "")) ?? "").trim(),
        noneMatched: ((await page.getByTestId("ask-none-matched").textContent({ timeout: 500 }).catch(() => "")) ?? "").trim(),
        wordsOnly: (await page.getByTestId("ask-lexical").count()) > 0,
        notFound: (await page.getByTestId("ask-not-found").count()) > 0,
        stats: ((await page.getByTestId("ask-stats").textContent()) ?? "").trim(),
        sources: ((await page.getByTestId("citations").last().textContent({ timeout: 500 }).catch(() => "")) ?? "").trim(),
      };
      report.ask.push(a);
      await page.screenshot({ path: path.join(out, `ask-${i + 1}-1440.png`) });
      console.log(`ask ${i + 1}: ${JSON.stringify(a)}`);
    }
    /* Last, because a phone width may lay the sheet out again. */
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(800);
    await page.screenshot({ path: path.join(out, "ask-last-390.png") });
  }
  report.fullLog = log.filter((l) => /\[(documents|rag|embed)|pageerror|error/i.test(l));
} finally {
  writeFileSync(path.join(out, "report.json"), JSON.stringify(report, null, 2));
  await browser.close();
  await server.close();
}
