/* Round 97: F389 (requested repetition stays) and F390 (Continue joins with the right separator) on the web build, local Instant. */
import { createRequire } from "node:module";
import { existsSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
const W = "/Users/moshecohen/dev/inborn-wt/fix-loop-continue";
const { startServer } = await import(`${W}/scripts/serve-web.mjs`);
const Q = `${W}/docs/qa/fix-loop-continue`;
const SHOTS = path.join(Q, "shots");
const pw = createRequire("/Users/moshecohen/.npm/_npx/86170c4cd1c5da32/node_modules/")("playwright-core");
const cache = "/Users/moshecohen/Library/Caches/ms-playwright";
const shellDir = readdirSync(cache).filter((d) => /^chromium_headless_shell-\d+$/.test(d)).sort().reverse()[0];
const exe = readdirSync(path.join(cache, shellDir)).map((s) => path.join(cache, shellDir, s, "chrome-headless-shell")).find(existsSync);
const server = await startServer({ port: 8597, dist: `${W}/apps/web/dist`, modelsDir: "/Users/moshecohen/dev/inborn/.models", aliases: { "instant.gguf": "Qwen3.5-0.8B-Q4_K_M.gguf", "fast.gguf": "absent-on-purpose.gguf" } });
const browser = await pw.chromium.launch({ headless: true, executablePath: exe, args: ["--force-prefers-color-scheme=light"] });
const out = { exe, url: server.url, steps: [] };
const L = [];
const save = () => writeFileSync(path.join(Q, "e2e/after.json"), JSON.stringify({ ...out, console: L.filter((l) => /\[chat\]|\[inborn\]|error/i.test(l)).slice(0, 200) }, null, 1));
const wait = async (re, ms) => { const end = Date.now() + ms; while (Date.now() < end) { const h = L.find((l) => re.test(l)); if (h) return h; await new Promise((r) => setTimeout(r, 300)); } return null; };
const shot = async (page, name) => { for (const w of [1440, 390]) { await page.setViewportSize({ width: w, height: w === 390 ? 844 : 900 }); await page.waitForTimeout(700); await page.getByTestId("assistant-text").last().scrollIntoViewIfNeeded().catch(() => {}); await page.waitForTimeout(400); await page.screenshot({ path: path.join(SHOTS, `after-${name}-${w}.png`) }); } await page.setViewportSize({ width: 1440, height: 900 }); await page.waitForTimeout(300); };
const lastText = async (page) => page.evaluate(() => [...document.querySelectorAll('[data-testid="assistant-text"]')].at(-1)?.innerText ?? "");
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
  save();
  const finished = async (before) => { await page.waitForFunction((n) => document.querySelectorAll('[data-testid="ledger-toggle"]').length > n, before, { timeout: 600_000 }); await page.waitForTimeout(800); };
  const newChat = async () => { await page.getByTestId("new-chat").first().click(); await page.getByTestId("start-chat").click(); await page.getByTestId("new-chat-sheet").waitFor({ state: "detached", timeout: 10_000 }).catch(() => {}); await page.waitForTimeout(800); };
  const ask = async (q, name) => {
    const nChat = L.filter((l) => l.includes("[chat]")).length;
    const before = await page.getByTestId("ledger-toggle").count();
    await page.getByTestId("composer-input").fill(q); await page.getByTestId("send").click();
    await finished(before);
    const answer = await lastText(page);
    const step = { kind: "repeat", q, answer, lines: answer.split("\n").filter((l) => l.trim()).length, loopNotices: await page.getByTestId("loop-notice").count(), chat: L.filter((l) => l.includes("[chat]")).slice(nChat) };
    out.steps.push(step); save(); await shot(page, name); return step;
  };
  /* The model does not always write every copy; up to 5 fresh chats, each recorded, until it does. */
  const askUntilFive = async (q, name) => { for (let i = 1; i <= 5; i++) { if (i > 1) await newChat(); const st = await ask(q, `${name}-try${i}`); st.trial = i; save(); if (st.lines >= 5 || st.loopNotices) return st; } };
  /* Stop while the last streamed character is a letter, i.e. mid-sentence, then Continue. */
  const stopContinue = async (q, name, letter) => {
    const before = await page.getByTestId("ledger-toggle").count();
    await page.getByTestId("composer-input").fill(q); await page.getByTestId("send").click();
    let stoppedAt = "";
    for (let i = 0; i < 6000; i++) {
      /* A streaming row ends with the caret glyph. */
      const t = (await lastText(page)).replace(/[\u2580-\u259F|▍\s]+$/u, "");
      if (Array.from(t).length > 60 && letter.test(Array.from(t).at(-1) ?? "")) { await page.getByTestId("stop").click(); stoppedAt = t; break; }
      await page.waitForTimeout(40);
    }
    await finished(before);
    const stopped = await lastText(page);
    await shot(page, `${name}-stopped`);
    const before2 = await page.getByTestId("ledger-toggle").count();
    await page.getByTestId("continue").last().click();
    void before2;
    await page.getByTestId("stop").waitFor({ timeout: 30_000 }).catch(() => {});
    await page.waitForFunction(() => !document.querySelector('[data-testid="stop"]'), null, { timeout: 600_000 });
    await page.waitForTimeout(1500);
    const joined = await lastText(page);
    const cut = stopped.length;
    const step = { kind: "continue", q, stoppedAtPoll: stoppedAt.slice(-40), stoppedTail: stopped.slice(-40), joinedAtCut: `${joined.slice(Math.max(0, cut - 30), cut)}⟦JOIN⟧${joined.slice(cut, cut + 30)}`, prefixKept: joined.startsWith(stopped), joined };
    out.steps.push(step); save(); await shot(page, `${name}-continued`); return step;
  };
  await askUntilFive("Repeat exactly this sentence five times, each on its own line: The quick brown fox jumps over the lazy dog.", "01-repeat-en");
  await newChat();
  await askUntilFive("請把這句話重複五遍，每遍一行：今天天氣很好，我們去公園散步吧。", "02-repeat-zh");
  await newChat();
  await stopContinue("Write a long essay about how the spice trade shaped medieval Europe, its trade routes and its cooking.", "03-continue-en", /\p{Script=Latin}/u);
  await newChat();
  await stopContinue("請寫一篇長文，介紹香料貿易如何影響中世紀歐洲的貿易路線和飲食。", "04-continue-zh", /\p{Script=Han}/u);
  await ctx.close();
} catch (e) { out.failure = `${e}`; }
finally { save(); await browser.close(); await server.close(); }
console.log("done", out.failure ?? "ok");
