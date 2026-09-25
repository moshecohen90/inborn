#!/usr/bin/env node
/**
 * Round 101 (F399): a file read by its words in one visit must still be the user's file in the next.
 *
 * Visit 1: four files (.txt .md .pdf .docx) are attached in chats and the index-model card is answered with
 * "exact words only". The browser closes.
 * Visit 2: same profile, same origin (deployed-like: the host answers /models/<e5> with its shell, e5 is on a CDN origin). A fifth file's card downloads e5; the page
 * is reloaded while the old files are being rebuilt; then every old file is asked about in Documents -> Ask and one is
 * attached again in a chat. Every answer must carry SOURCES naming its file, and no row may say "damaged".
 *
 *   MODELS_DIR=/path/to/ggufs W=1440 OUT=docs/qa/fix-file-persist/after-1440 node docs/qa/fix-file-persist/two-visit.mjs
 */
import { createReadStream, existsSync, readFileSync, mkdirSync, mkdtempSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createServer } from "node:https";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defaults, startServer } from "../../../scripts/serve-web.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const W = Number(process.env.W ?? 1440);
const H = W < 500 ? 844 : 900;
const out = path.resolve(process.env.OUT ?? path.join(here, `run-${W}`));
mkdirSync(out, { recursive: true });
const PORT = Number(process.env.PORT ?? 8931);
const FILES = {
  "harbor-report.txt": { q: "What did the new fuel pier cost?", want: /3[.,]2/ },
  "orchard-log.md": { q: "Who rebuilt the cider press?", want: /Fenwarth/i },
  "fleet-memo.pdf": { q: "How much did the Morning Wren overhaul cost?", want: /412/ },
  "glassworks-memo.docx": { q: "Who led the furnace relining crew?", want: /Ivell/i },
};
const REATTACH = "orchard-log.md";
/* A file long enough that e5 is still reading it when the page reloads; its one fact sits in the last section. */
const LONG = "long-ledger.md";
const LONG_Q = "What is the name of the lighthouse keeper's cat?";
const longDir = mkdtempSync(path.join(os.tmpdir(), "inborn-r101-long-"));
{
  const towns = ["Ardel", "Brissow", "Calloway", "Dunmere", "Eskridge", "Farrow", "Glenholt", "Harrowgate"];
  let md = "# Harbour ledger, 2026\n\n";
  for (let i = 0; i < 40; i++) {
    md += `## Entry ${i + 1}\n\n`;
    for (let j = 0; j < 6; j++) md += `On day ${i * 6 + j + 1} the ${towns[(i + j) % towns.length]} tender unloaded ${120 + i * 7 + j} crates of slate, ${30 + j} barrels of tar and ${i + j + 4} coils of rope at the east quay, and the tally clerk signed the manifest before the evening bell. `;
    md += "\n\n";
  }
  md += "## Last entry\n\nThe lighthouse keeper's cat is named Pemberton, and it sleeps on the lamp-room stairs.\n";
  writeFileSync(path.join(longDir, LONG), md);
}
const fixture = (file) => path.join(file === LONG ? longDir : path.join(here, "fixtures"), file);

const noEmbedDir = mkdtempSync(path.join(os.tmpdir(), "inborn-r101-noembed-"));
for (const f of readdirSync(defaults.modelsDir)) if (!/e5|embed/i.test(f)) symlinkSync(path.join(defaults.modelsDir, f), path.join(noEmbedDir, f));
const profile = mkdtempSync(path.join(os.tmpdir(), "inborn-r101-profile-"));

const req = createRequire(path.join(process.env.PLAYWRIGHT_CORE_DIR ?? "/Users/moshecohen/.npm/_npx/9833c18b2d85bc59/node_modules", "/"));
const { chromium } = req("playwright-core");
const cache = path.join(os.homedir(), "Library/Caches/ms-playwright");
const shell = process.env.CHROMIUM_PATH ?? readdirSync(cache).filter((d) => /^chromium_headless_shell-\d+$/.test(d)).sort().reverse().map((d) => path.join(cache, d, "chrome-headless-shell-mac-arm64", "chrome-headless-shell"))[0];

const report = { width: W, visit1: {}, visit2: {} };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const t0 = Date.now();
const step = (m) => console.log(`[${Math.round((Date.now() - t0) / 1000)}s] ${m}`);

function observe(page, log) {
  page.on("console", (m) => log.push(`${m.type()}: ${m.text()}`));
  page.on("pageerror", (e) => log.push(`pageerror: ${e.message}`));
}

async function openChat(page, log) {
  const from = log.length;
  await page.goto(`http://127.0.0.1:${PORT}/`);
  await page.getByTestId("composer-input").waitFor({ timeout: 300_000 });
  for (let i = 0; i < 3000 && !log.slice(from).some((l) => /\[inborn\] \w+ loaded/.test(l)); i++) await sleep(100);
  if (await page.getByTestId("new-chat").isVisible().catch(() => false)) {
    await page.getByTestId("new-chat").click();
    if (await page.getByTestId("new-chat-sheet").waitFor({ timeout: 1500 }).then(() => true, () => false)) await page.getByTestId("start-chat").click();
    await sleep(600);
  }
}

/** Attaches `file` in a fresh chat, asks `q`, answers the index-model card with `onHold`, returns what the reader saw. */
async function attachAsk(page, log, file, q, onHold) {
  step(`attach ${file}`);
  await openChat(page, log);
  await page.getByTestId("attach").click();
  const [chooser] = await Promise.all([page.waitForEvent("filechooser", { timeout: 15_000 }), page.getByTestId("attach-import").click()]);
  await chooser.setFiles(fixture(file));
  await page.getByTestId("attached-docs").filter({ hasText: file }).waitFor({ timeout: 30_000 });
  const before = await page.getByTestId("ledger-toggle").count();
  await page.getByTestId("composer-input").fill(q);
  await page.getByTestId("send").click();
  const r = { file, q };
  if (await page.getByTestId("docs-hold").waitFor({ timeout: 8_000 }).then(() => true, () => false)) {
    r.hold = ((await page.getByTestId("docs-hold").textContent()) ?? "").trim();
    step(`hold card: ${r.hold.slice(0, 80)}`);
    await onHold(page, r);
  }
  for (let i = 0; i < 900 && (await page.getByTestId("ledger-toggle").count()) <= before; i++) await sleep(200);
  step(`answered ${file}`);
  r.answer = ((await page.getByTestId("assistant-text").last().textContent({ timeout: 2000 }).catch(() => "")) ?? "").trim();
  r.sources = ((await page.getByTestId("assistant-message").last().getByTestId("citations").textContent({ timeout: 1500 }).catch(() => "")) ?? "").trim();
  r.notices = {};
  for (const id of ["docs-lexical", "none-matched", "reindexing"]) if (await page.getByTestId(id).count()) r.notices[id] = ((await page.getByTestId(id).last().textContent()) ?? "").trim();
  await page.screenshot({ path: path.join(out, `chat-${file}-${W}.png`) });
  return r;
}

async function docRows(page) {
  await page.goto(`http://127.0.0.1:${PORT}/documents`);
  await page.locator('[data-testid^="doc-row-"]').first().waitFor({ timeout: 30_000 });
  await sleep(1500);
  return (await page.locator('[data-testid^="doc-row-"]').allTextContents()).map((s) => s.slice(0, 140));
}

async function askInDocuments(page, file, q) {
  const rows = await docRows(page);
  const idx = rows.findIndex((r) => r.includes(file));
  await page.locator('[data-testid^="doc-select-"]').nth(idx).click();
  if (await page.getByTestId("documents-ask-selected").isDisabled()) {
    await page.screenshot({ path: path.join(out, `ask-${file}-${W}.png`) });
    return { file, q, answer: "", sources: "", wordsOnly: false, notFound: false, stats: "", askDisabled: rows[idx] };
  }
  await page.getByTestId("documents-ask-selected").click();
  await page.getByTestId("ask-sheet").waitFor({ timeout: 5000 });
  await page.getByTestId("ask-input").fill(q);
  await page.getByTestId("ask-send").click();
  await page.getByTestId("ask-stats").waitFor({ timeout: 240_000 });
  const r = {
    file,
    q,
    answer: ((await page.getByTestId("ask-answer").textContent({ timeout: 500 }).catch(() => "")) ?? "").trim(),
    sources: ((await page.getByTestId("citations").last().textContent({ timeout: 500 }).catch(() => "")) ?? "").trim(),
    wordsOnly: (await page.getByTestId("ask-lexical").count()) > 0,
    notFound: (await page.getByTestId("ask-not-found").count()) > 0,
    stats: ((await page.getByTestId("ask-stats").textContent()) ?? "").trim(),
  };
  await page.screenshot({ path: path.join(out, `ask-${file}-${W}.png`) });
  return r;
}

const launch = async () => {
  const ctx = await chromium.launchPersistentContext(profile, { headless: true, executablePath: shell, viewport: { width: W, height: H }, ignoreHTTPSErrors: true });
  ctx.setDefaultTimeout(20_000);
  await ctx.route(`${CDN}/v1/**`, async (route) => {
    const req = route.request();
    report.cdnRequests = [...(report.cdnRequests ?? []), `${req.method()} ${req.url().split("/").pop()} ${req.headers().range ?? ""}`];
    /* Same URL to the page (and its CSP); the bytes come from this machine. */
    await route.continue({ url: req.url().replace(CDN, `https://127.0.0.1:${CDN_PORT}`) });
  });
  return ctx;
};
/* The deployed host answers /models/<e5> with its shell; e5 comes from the catalog's CDN, played here by a second local origin. */
const CDN_PORT = PORT + 1;
/* The app only fetches models from its own catalog host; the browser's requests for it are answered from this machine. */
const CDN = "https://models.inbornapp.com";
const certDir = mkdtempSync(path.join(os.tmpdir(), "inborn-r101-cert-"));
execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", path.join(certDir, "key.pem"), "-out", path.join(certDir, "cert.pem"), "-days", "1", "-subj", "/CN=127.0.0.1"], { stdio: "ignore" });
const cdn = createServer({ key: readFileSync(path.join(certDir, "key.pem")), cert: readFileSync(path.join(certDir, "cert.pem")) }, (req, res) => {
  const file = path.join(defaults.modelsDir, path.basename((req.url ?? "").split("?")[0]));
  const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Expose-Headers": "Content-Length, Content-Range", "Cross-Origin-Resource-Policy": "cross-origin" };
  if (req.method === "OPTIONS") return res.writeHead(204, { ...cors, "Access-Control-Allow-Headers": "Range" }).end();
  if (!(req.url ?? "").startsWith("/v1/") || !existsSync(file)) return res.writeHead(404, cors).end();
  const size = statSync(file).size;
  const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? "");
  const start = m && m[1] ? Number(m[1]) : 0;
  const end = m && m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
  res.writeHead(m ? 206 : 200, { ...cors, "Content-Type": "application/octet-stream", "Content-Length": end - start + 1, "Accept-Ranges": "bytes", ...(m ? { "Content-Range": `bytes ${start}-${end}/${size}` } : {}) });
  if (req.method === "HEAD") return res.end();
  createReadStream(file, { start, end }).pipe(res);
});
await new Promise((r) => cdn.listen(CDN_PORT, "127.0.0.1", r));
report.cdn = `https://127.0.0.1:${CDN_PORT} (answers ${CDN}/v1/*)`;
/* Visit 1 is offered e5 too and answers the card with "exact words only", as the verifier did. */
let server = await startServer({ port: PORT, modelsDir: noEmbedDir, deployedLike: true, indexOrigin: CDN });
try {
  /* ---- visit 1: no index model on the host; every file goes out on the word search ---- */
  {
    const ctx = await launch();
    const page = await ctx.newPage();
    const log = [];
    observe(page, log);
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
    report.visit1.chats = [];
    for (const [file, { q }] of Object.entries(FILES)) report.visit1.chats.push(await attachAsk(page, log, file, q, (p) => p.getByTestId("docs-hold-words").click()));
    report.visit1.rows = await docRows(page);
    await page.screenshot({ path: path.join(out, `visit1-documents-${W}.png`) });
    report.visit1.log = log.filter((l) => /\[(documents|rag)\]|blob:|Content Security|pageerror/.test(l)).map((l) => l.slice(0, 240));
    await ctx.close();
  }
  await server.close();

  /* ---- visit 2: the host now serves e5; install it from a new file's card, reload mid-rebuild, ask every old file ---- */
  server = await startServer({ port: PORT, deployedLike: true, indexOrigin: CDN });
  {
    const ctx = await launch();
    const page = await ctx.newPage();
    const log = [];
    observe(page, log);
    report.visit2.rowsBefore = await docRows(page);
    await page.screenshot({ path: path.join(out, `visit2-documents-before-${W}.png`) });
    report.visit2.install = await attachAsk(page, log, "ferry-schedule.md", "What does a single crossing cost?", async (p, r) => {
      await p.getByTestId("docs-hold-download").click();
      for (let i = 0; i < 120 && (await p.getByTestId("docs-hold").count()) && !(await p.getByTestId("docs-hold-error").count()); i++) {
        await sleep(2500);
        if (i % 8 === 0) {
          step(`downloading: ${(((await p.getByTestId("docs-hold").first().innerText({ timeout: 3000 }).catch((e) => e.message)) ?? "").trim()).slice(-160)}`);
          await p.screenshot({ path: path.join(out, `visit2-download-progress-${W}.png`), timeout: 5000 }).catch((e) => step(`screenshot failed: ${e.message.slice(0, 80)}`));
        }
      }
      await p.screenshot({ path: path.join(out, `visit2-download-${W}.png`) });
      if (await p.getByTestId("docs-hold-error").count()) r.downloadError = await p.getByTestId("docs-hold-error").textContent();
      else if (await p.getByTestId("docs-hold").count()) r.downloadError = "card still up after 5 minutes";
    });
    /* The old files are being rebuilt for e5 now: a reload in the middle must not leave any of them "damaged". */
    const rebuilding = log.filter((l) => /re-embedded|\[documents\]/.test(l)).length;
    await page.reload();
    await page.getByTestId("composer-input").waitFor({ timeout: 120_000 }).catch(() => undefined);
    report.visit2.reloadedAfterDocLines = rebuilding;
    await sleep(15_000);
    report.visit2.rowsAfter = await docRows(page);
    await page.screenshot({ path: path.join(out, `visit2-documents-after-${W}.png`) });
    report.visit2.ask = [];
    for (const [file, { q }] of Object.entries(FILES)) report.visit2.ask.push(await askInDocuments(page, file, q));
    /* Reload while e5 is reading a new long file: its first page is not committed yet, so only its bytes can resume it. */
    step(`attach ${LONG} and reload mid-read`);
    await openChat(page, log);
    await page.getByTestId("attach").click();
    const [longChooser] = await Promise.all([page.waitForEvent("filechooser", { timeout: 15_000 }), page.getByTestId("attach-import").click()]);
    await longChooser.setFiles(fixture(LONG));
    await page.getByTestId("attached-docs").filter({ hasText: LONG }).waitFor({ timeout: 30_000 });
    await sleep(3000);
    await page.reload();
    await sleep(3000);
    const longRow = page.locator('[data-testid^="doc-row-"]').filter({ hasText: LONG });
    report.visit2.longAfterReload = (await docRows(page)).find((r) => r.includes(LONG));
    await page.screenshot({ path: path.join(out, `visit2-long-after-reload-${W}.png`) });
    const resume = longRow.locator('[data-testid^="doc-resume-"]');
    if (await resume.count()) await resume.click();
    for (let i = 0; i < 600; i++) {
      const t = (await longRow.textContent().catch(() => "")) ?? "";
      if (/Indexed ·|damaged|could not|Paused/.test(t) && !(await longRow.locator('[data-testid^="doc-cancel-"]').count())) break;
      await sleep(500);
    }
    report.visit2.longAfterResume = ((await longRow.textContent()) ?? "").slice(0, 140);
    await page.screenshot({ path: path.join(out, `visit2-long-after-resume-${W}.png`) });
    step(`long file after resume: ${report.visit2.longAfterResume}`);
    await sleep(1500);
    /* What the browser stored for it: the passages in the index snapshot and the bytes in the files store. */
    report.visit2.longStored = await page.evaluate(async (name) => {
      const db = await new Promise((res, rej) => { const r = globalThis.indexedDB.open("inborn-documents"); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
      const get = (store, key) => new Promise((res) => { const tx = db.transaction(store, "readonly"); const q = key === undefined ? tx.objectStore(store).getAllKeys() : tx.objectStore(store).get(key); q.onsuccess = () => res(q.result); q.onerror = () => res(null); });
      const snap = await get("snapshot", "v1");
      const doc = (snap?.documents ?? []).find((d) => d.name === name);
      const chunks = (snap?.chunks ?? []).filter((c) => c.docId === doc?.id);
      const files = db.objectStoreNames.contains("files") ? await get("files") : [];
      db.close();
      return { snapshotKeys: Object.keys(snap ?? {}), docUri: doc?.uri, status: doc?.status, chunks: chunks.length, hasFact: chunks.some((c) => /Pemberton/.test(c.text)), storedFiles: files };
    }, LONG).catch((e) => ({ error: e.message }));
    step(`long file stored: ${JSON.stringify(report.visit2.longStored).slice(0, 400)}`);
    report.visit2.longAsk = await askInDocuments(page, LONG, LONG_Q);
    report.visit2.reattach = await attachAsk(page, log, REATTACH, FILES[REATTACH].q, (p) => p.getByTestId("docs-hold-words").click());
    report.visit2.rowsEnd = await docRows(page);
    report.visit2.log = log.filter((l) => /\[(documents|rag)\]|blob:|Content Security|pageerror/.test(l)).map((l) => l.slice(0, 260));
    await ctx.close();
  }

  const damaged = [...report.visit2.rowsAfter, ...report.visit2.rowsEnd, report.visit2.longAfterReload ?? "", report.visit2.longAfterResume ?? ""].filter((r) => /damaged/i.test(r));
  const checks = {
    visit1WordsWithSources: report.visit1.chats.every((c) => c.sources.includes(c.file) && c.notices["docs-lexical"]),
    visit2InstallOk: !report.visit2.install.downloadError && report.visit2.install.sources.includes("ferry-schedule.md"),
    noDamagedRow: damaged.length === 0,
    everyOldFileAnswersWithSources: report.visit2.ask.every((a) => a.sources.includes(a.file) && a.answer && !a.wordsOnly && !a.notFound),
    longFileResumedFromBytes: /Indexed ·/.test(report.visit2.longAfterResume) && /Pemberton/.test(report.visit2.longAsk.answer) && report.visit2.longAsk.sources.includes(LONG),
    reattachAnswersWithSources: report.visit2.reattach.sources.includes(REATTACH) && FILES[REATTACH].want.test(report.visit2.reattach.answer) && !report.visit2.reattach.notices["docs-lexical"],
    noBlobFetch: !report.visit2.log.some((l) => /blob:|Content Security/.test(l)),
    vectorsUsed: report.visit2.log.some((l) => /\[rag\] strict=\w+ (?!words-only).*cos=0\.[1-9]/.test(l)),
  };
  report.checks = checks;
  /* Instant paraphrases; whether it quoted the fact is reported, not gated (README round 93 "Open"). */
  report.factInAnswer = Object.fromEntries(report.visit2.ask.map((a) => [a.file, FILES[a.file].want.test(a.answer)]));
  report.pass = Object.values(checks).every(Boolean);
  console.log(JSON.stringify({ checks, factInAnswer: report.factInAnswer, damaged, rowsAfter: report.visit2.rowsAfter, ask: report.visit2.ask.map((a) => ({ file: a.file, answer: a.answer.slice(0, 90), sources: a.sources, wordsOnly: a.wordsOnly })), long: { afterReload: report.visit2.longAfterReload, afterResume: report.visit2.longAfterResume, answer: report.visit2.longAsk.answer.slice(0, 90), sources: report.visit2.longAsk.sources }, reattach: { answer: report.visit2.reattach.answer.slice(0, 90), sources: report.visit2.reattach.sources, notices: report.visit2.reattach.notices } }, null, 1));
} finally {
  writeFileSync(path.join(out, "report.json"), JSON.stringify(report, null, 2));
  await server.close();
  cdn.closeAllConnections?.();
  cdn.close();
  rmSync(noEmbedDir, { recursive: true, force: true });
  rmSync(profile, { recursive: true, force: true });
  rmSync(certDir, { recursive: true, force: true });
  rmSync(longDir, { recursive: true, force: true });
}
process.exit(report.pass ? 0 : 1);
