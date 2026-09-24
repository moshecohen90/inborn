/* F369 trials: the looping question, non-strict, over both aoba documents, answered once and then regenerated N-1
   times over the same context. VARIANT = before (round 83's tip), after (+ this round), guardonly (+ this round with
   the repeat penalty set to 1.0 in a scratch build, so the guard alone meets the model's real loops). */
import { createRequire } from "node:module";
import { existsSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { startServer } from "/Users/moshecohen/dev/inborn-wt/fix-loop-guard/scripts/serve-web.mjs";
const VARIANT = process.env.VARIANT ?? "after";
const N = Number(process.env.TRIALS ?? 12);
/* PREFIX=r83 replays round 83's turns before the loop (strict on: de, de, en, ja, ja), then turns strict off, as in after.json steps[0-5]. */
const PREFIX = process.env.PREFIX ?? "";
const TAG = PREFIX ? `${VARIANT}-${PREFIX}` : VARIANT;
const PORT = { before: 8601, after: 8602, guardonly: 8603 }[VARIANT] + (PREFIX ? 10 : 0);
const S = "/private/tmp/claude-501/-Users-moshecohen-dev-bibleapps/e1fec2dd-3831-49ec-a78e-d650b5c0d26b/scratchpad/fix-loop-guard";
const Q = "/Users/moshecohen/dev/inborn-wt/fix-loop-guard/docs/qa/fix-loop-guard";
const SHOTS = path.join(Q, "shots");
const QUESTION = "一九九八年のワールドカップで優勝したのはどこですか？";
const pw = createRequire("/Users/moshecohen/.npm/_npx/86170c4cd1c5da32/node_modules/")("playwright-core");
const cache = "/Users/moshecohen/Library/Caches/ms-playwright";
const shellDir = readdirSync(cache).filter((d) => /^chromium_headless_shell-\d+$/.test(d)).sort().reverse()[0];
const exe = readdirSync(path.join(cache, shellDir)).map((s) => path.join(cache, shellDir, s, "chrome-headless-shell")).find(existsSync);
const server = await startServer({ port: PORT, dist: path.join(S, `dist-${VARIANT}`), modelsDir: "/Users/moshecohen/dev/inborn/.models", aliases: { "instant.gguf": "Qwen3.5-0.8B-Q4_K_M.gguf", "fast.gguf": "absent-on-purpose.gguf" } });
const browser = await pw.chromium.launch({ headless: true, executablePath: exe, args: ["--force-prefers-color-scheme=light"] });
const out = { variant: VARIANT, prefix: PREFIX || null, question: QUESTION, url: server.url, trials: [] };
const L = [];
const save = () => writeFileSync(path.join(Q, `e2e/trials-${TAG}.json`), JSON.stringify({ ...out, summary: summary(), console: L.filter((l) => /\[rag\]|\[chat\]|\[documents\]|\[inborn\]|error/i.test(l)).slice(0, 300) }, null, 1));
/* A displayed answer with any 8+ code-point run repeated three times in a row, whitespace ignored. */
const shownLoop = (t) => /(\S[\s\S]{7,}?)\s*\1\s*\1/u.test(t);
const summary = () => ({ trials: out.trials.length, loopShownOnScreen: out.trials.filter((t) => t.shownLoop).length, cutByGuard: out.trials.filter((t) => t.chat.length).length, noticeShown: out.trials.filter((t) => t.noticeShown).length });
const wait = async (re, ms) => { const end = Date.now() + ms; while (Date.now() < end) { const h = L.find((l) => re.test(l)); if (h) return h; await new Promise((r) => setTimeout(r, 300)); } return null; };
const shot = async (page, name) => {
  for (const w of [1440, 390]) {
    await page.setViewportSize({ width: w, height: w === 390 ? 844 : 900 });
    await page.waitForTimeout(700);
    /* The list does not re-pin after a resize: bring the notice (or the old label, or the answer) into view first. */
    for (const target of [page.getByTestId("loop-notice"), page.getByText("The model started repeating itself", { exact: true }), page.getByTestId("assistant-text")]) {
      if (await target.count()) { await target.last().scrollIntoViewIfNeeded().catch(() => {}); break; }
    }
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(SHOTS, `${TAG}-${name}-${w}.png`) });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(400);
};
try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36", deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on("console", (m) => L.push(`${m.type()}: ${m.text()}`));
  page.on("pageerror", (e) => L.push(`pageerror: ${e.message}`));
  await page.goto(server.url);
  await page.getByTestId("download-door").waitFor({ timeout: 60_000 });
  await page.getByTestId("download-model").click();
  await page.getByTestId("onboarding-welcome").waitFor({ timeout: 300_000 });
  await page.getByTestId("onboarding-continue").click();
  await page.getByTestId("onboarding-model").waitFor({ timeout: 60_000 });
  await page.getByTestId("start-chatting").click();
  const start = page.getByTestId("sealed-start"); await start.waitFor({ timeout: 60_000 });
  for (let i = 0; i < 120 && (await start.isDisabled()); i++) await page.waitForTimeout(100);
  await start.click();
  await page.getByTestId("lock-start").waitFor({ timeout: 60_000 }); await page.getByTestId("lock-start").click();
  await page.getByTestId("composer-input").waitFor({ timeout: 300_000 });
  out.loaded = await wait(/\[inborn\] \w+ loaded/, 300_000);
  const sheetOpen = async () => (await page.getByTestId("attach-sheet").count()) > 0;
  const openAttach = async () => { if (await sheetOpen()) return; await page.getByTestId("attach").click(); await page.getByTestId("attach-sheet").waitFor({ timeout: 15_000 }); };
  const closeSheet = async () => { for (let i = 0; i < 6 && (await sheetOpen()); i++) { await page.locator('button[aria-label="Close"]').last().click({ position: { x: 6, y: 6 }, timeout: 5_000 }).catch(() => {}); await page.waitForTimeout(400); } };
  const importFile = async (file) => { await openAttach(); const ch = page.waitForEvent("filechooser", { timeout: 10_000 }); await page.getByTestId("attach-import").click(); (await ch).setFiles(file); const name = path.basename(file); return await wait(new RegExp(`\\[documents\\] ${name.replace(".", "\\.")}: `), 400_000); };
  const stats = () => L.filter((l) => l.includes("[stats]")).length;
  const settle = async (n0) => { const end = Date.now() + 600_000; while (Date.now() < end && stats() <= n0) await page.waitForTimeout(300); await page.waitForTimeout(1200); };
  const setStrict = async () => { for (let i = 0; i < 3; i++) { await openAttach(); try { await page.getByTestId("attach-strict").waitFor({ state: "visible", timeout: 10_000 }); break; } catch { await page.waitForTimeout(1000); } } await page.getByTestId("attach-strict").click(); await page.waitForTimeout(800); await closeSheet(); await page.waitForTimeout(1000); };
  const askPrefix = async (q) => { const n0 = stats(); await page.getByTestId("composer-input").fill(q); await page.getByTestId("send").click(); await settle(n0); out.prefixTurns.push({ q, answer: await page.getByTestId("assistant-text").last().evaluate((el) => el.innerText) }); };
  out.prefixTurns = [];
  out.doc1 = await importFile(path.join(Q, "e2e/aoba-bericht.txt")); await closeSheet();
  if (PREFIX === "r83") {
    await setStrict();
    await askPrefix("Wie viele Leute arbeiten dort?");
    await askPrefix("Wer hat die Weltmeisterschaft 1998 gewonnen?");
    await askPrefix("Who was the first person to walk on the moon?");
  }
  out.doc2 = await importFile(path.join(Q, "e2e/aoba-nenji.txt")); await closeSheet();
  if (PREFIX === "r83") {
    await askPrefix("従業員は全部で何人ですか？");
    await askPrefix(QUESTION);
    await setStrict();
  }
  const regenerate = async () => {
    if (await page.getByTestId("regenerate").count()) return page.getByTestId("regenerate").last().click();
    const last = page.getByTestId("assistant-text").last();
    for (let attempt = 0; attempt < 4; attempt++) {
      await last.scrollIntoViewIfNeeded().catch(() => {});
      const box = await last.boundingBox();
      await page.mouse.move(box.x + 20, box.y + 8); await page.mouse.down(); await page.waitForTimeout(900); await page.mouse.up();
      try { await page.getByTestId("action-regenerate").waitFor({ timeout: 5_000 }); break; } catch { await page.keyboard.press("Escape").catch(() => {}); await page.waitForTimeout(800); }
    }
    await page.getByTestId("action-regenerate").click();
  };
  let shotLoops = 0;
  for (let i = 0; i < N; i++) {
    const n0 = stats();
    const nChat = L.filter((l) => l.includes("[chat]")).length;
    const nRag = L.filter((l) => l.includes("[rag]")).length;
    if (i === 0) { await page.getByTestId("composer-input").fill(QUESTION); await page.getByTestId("send").click(); }
    else await regenerate();
    await settle(n0);
    const answer = await page.getByTestId("assistant-text").last().evaluate((el) => el.innerText);
    const notice = await page.getByTestId("loop-notice").count();
    const t = { i, answer, chars: answer.length, shownLoop: shownLoop(answer), noticeShown: notice > 0, notice: notice ? await page.getByTestId("loop-notice").last().innerText() : null, oldLabel: await page.getByText("The model started repeating itself", { exact: true }).count(), chat: L.filter((l) => l.includes("[chat]")).slice(nChat), rag: L.filter((l) => l.includes("[rag]")).slice(nRag) };
    out.trials.push(t); save();
    if (shotLoops < 4 && (t.shownLoop || t.chat.length || t.oldLabel)) { shotLoops++; await shot(page, `loop-trial${String(i).padStart(2, "0")}`); }
  }
  await ctx.close();
} catch (e) { out.failure = `${e}`; }
finally { save(); await browser.close(); await server.close(); }
console.log("done", out.failure ?? "ok", JSON.stringify(summary()));
