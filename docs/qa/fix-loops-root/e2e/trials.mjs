/* Round 107 (F415): loop-prone prompts on the web build with Instant (wllama), fresh chat per trial, answer read off the screen.
   usage: node trials.mjs <worktree> <tag> <port> <trials>   e.g. node trials.mjs /…/fix-loops-root-base before 8953 6 */
import { createRequire } from "node:module";
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
const [W, TAG, PORT, N] = [process.argv[2], process.argv[3], Number(process.argv[4]), Number(process.argv[5] ?? 5)];
const PROMPTS = JSON.parse(process.env.PROMPTS ?? "[]");
const Q = "/Users/moshecohen/dev/inborn-wt/fix-loops-root/docs/qa/fix-loops-root";
const SHOTS = path.join(Q, "shots");
mkdirSync(SHOTS, { recursive: true });
const { startServer } = await import(`${W}/scripts/serve-web.mjs`);
const pw = createRequire("/Users/moshecohen/.npm/_npx/86170c4cd1c5da32/node_modules/")("playwright-core");
const cache = "/Users/moshecohen/Library/Caches/ms-playwright";
const shellDir = readdirSync(cache).filter((d) => /^chromium_headless_shell-\d+$/.test(d)).sort().reverse()[0];
const exe = readdirSync(path.join(cache, shellDir)).map((s) => path.join(cache, shellDir, s, "chrome-headless-shell")).find(existsSync);
const server = await startServer({ port: PORT, dist: `${W}/apps/web/dist`, modelsDir: "/Users/moshecohen/dev/inborn/.models", aliases: { "instant.gguf": "Qwen3.5-0.8B-Q4_K_M.gguf", "fast.gguf": "absent-on-purpose.gguf" } });
const browser = await pw.chromium.launch({ headless: true, executablePath: exe, args: ["--force-prefers-color-scheme=light"] });
const out = { tag: TAG, worktree: W, exe, url: server.url, trials: [] };
const L = [];
const file = path.join(Q, `e2e/${TAG}.json`);
const save = () => writeFileSync(file, JSON.stringify({ ...out, console: L.filter((l) => /\[chat\]|error/i.test(l)).slice(0, 300) }, null, 1));

/* The yardstick of the stress harness: 12+ code points (6+ wide) twice back to back, 4-11 three times, a line said before; data lines (JSON, tables) excluded. */
const WIDE = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/gu;
const DATA = /^\s*[[{|<]|"[^"\n]*"\s*:|[;{[(]\s*$|^\s*(?:"[^"\n]*"|[\d.+-]+|true|false|null)\s*,\s*$/u;
const BULLET = /^\s*(?:[-*+•]|\d{1,3}[.)、．])\s+/u;
function repetitions(text) {
  const clean = text.replace(/```[\s\S]*?(?:```|$)/g, "\u0000").split("\n").map((l) => (DATA.test(l) ? "\u0000" : l)).join("\n");
  const s = Array.from(clean.replace(/[ \t]+/g, " "));
  const n = s.length;
  let worst = null;
  const take = (r) => { if (!worst || r.copies > worst.copies) worst = r; };
  for (let p = 4; p <= Math.min(400, Math.floor(n / 2)); p++) {
    let j = 0;
    while (j + p < n) {
      if (s[j] !== s[j + p]) { j++; continue; }
      const a = j;
      while (j + p < n && s[j] === s[j + p]) j++;
      const copies = Math.floor((j - a + p) / p);
      const unit = s.slice(a, a + p).join("");
      if (!/\p{L}/u.test(unit) || unit.includes("\u0000")) continue;
      let prim = true;
      for (let q = 1; q < p && prim; q++) if (p % q === 0 && unit === s.slice(a + q, a + q + p).join("")) prim = false;
      if (!prim) continue;
      const long = p >= 12 || (p >= 6 && (unit.match(WIDE) ?? []).length >= 3);
      if (long && copies > 1) take({ unit: unit.trim(), copies, kind: "long" });
      else if (!long && copies >= 3) take({ unit: unit.trim(), copies, kind: "short" });
    }
  }
  const segs = clean.split(/(?<=[\n.!?。！？])/u).map((x) => x.trim().replace(BULLET, "").replace(/[\s.!?。！？．…]+$/u, "").trim()).filter((x) => Array.from(x).length >= 24 && /\p{L}/u.test(x) && !x.includes("\u0000") && !DATA.test(x));
  const seen = new Map();
  for (const x of segs) seen.set(x, (seen.get(x) ?? 0) + 1);
  for (const [x, c] of seen) if (c > 1) take({ unit: x, copies: c, kind: "segment" });
  return worst;
}

const wait = async (re, ms) => { const end = Date.now() + ms; while (Date.now() < end) { const h = L.find((l) => re.test(l)); if (h) return h; await new Promise((r) => setTimeout(r, 300)); } return null; };
const lastText = async (page) => page.evaluate(() => [...document.querySelectorAll('[data-testid="assistant-text"]')].at(-1)?.innerText ?? "");
try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36", deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on("console", (m) => L.push(`${m.type()}: ${m.text()}`));
  page.on("pageerror", (e) => L.push(`pageerror: ${e.message}`));
  await page.goto(server.url);
  /* Round 103's first run: Welcome, then the Model step carries the download; Instant is chosen, whatever the door recommends. */
  await page.getByTestId("onboarding-welcome").waitFor({ timeout: 60_000 });
  await page.getByTestId("onboarding-continue").click();
  await page.getByTestId("onboarding-model").waitFor({ timeout: 60_000 });
  if (!(await page.getByTestId("web-model-choose-instant").count()) && (await page.getByTestId("web-model-options-toggle").count())) await page.getByTestId("web-model-options-toggle").click();
  out.door = (await page.getByTestId("download-door").textContent()) ?? "";
  if (await page.getByTestId("web-model-choose-instant").count()) await page.getByTestId("web-model-choose-instant").click();
  await page.getByTestId("download-model").click();
  await page.getByTestId("onboarding-sealed").waitFor({ timeout: 300_000 });
  const start = page.getByTestId("sealed-start"); await start.waitFor({ timeout: 60_000 });
  for (let i = 0; i < 120 && (await start.isDisabled()); i++) await page.waitForTimeout(100);
  await start.click();
  await page.getByTestId("lock-start").waitFor({ timeout: 60_000 }); await page.getByTestId("lock-start").click();
  await page.getByTestId("composer-input").waitFor({ timeout: 300_000 });
  out.loaded = await wait(/\[inborn\] \w+ loaded/, 300_000);
  save();
  const newChat = async () => { await page.getByTestId("new-chat").first().click(); await page.getByTestId("start-chat").click(); await page.getByTestId("new-chat-sheet").waitFor({ state: "detached", timeout: 10_000 }).catch(() => {}); await page.waitForTimeout(800); };
  let first = true;
  for (const { id, q } of PROMPTS) {
    for (let i = 1; i <= N; i++) {
      if (!first) await newChat();
      first = false;
      const nChat = L.filter((l) => l.includes("[chat]")).length;
      const before = await page.getByTestId("ledger-toggle").count();
      await page.getByTestId("composer-input").fill(q); await page.getByTestId("send").click();
      /* Every screen state while it streams, so a copy that was shown and then cut still counts. */
      let worstOnScreen = null;
      const t0 = Date.now();
      while (Date.now() - t0 < 900_000) {
        const t = await lastText(page);
        const r = repetitions(t);
        if (r && (!worstOnScreen || r.copies > worstOnScreen.copies)) worstOnScreen = r;
        if ((await page.getByTestId("ledger-toggle").count()) > before) break;
        await page.waitForTimeout(250);
      }
      await page.waitForTimeout(800);
      const answer = await lastText(page);
      const finalRep = repetitions(answer);
      if (finalRep && (!worstOnScreen || finalRep.copies > worstOnScreen.copies)) worstOnScreen = finalRep;
      const trial = { id, trial: i, q, answer, worstOnScreen, loopNotices: await page.getByTestId("loop-notice").count(), chat: L.filter((l) => l.includes("[chat]")).slice(nChat) };
      out.trials.push(trial);
      save();
      await page.getByTestId("assistant-text").last().scrollIntoViewIfNeeded().catch(() => {});
      await page.waitForTimeout(300);
      await page.screenshot({ path: path.join(SHOTS, `${TAG}-${id}-${i}-1440.png`) });
      console.log(`${TAG} ${id}#${i} ${worstOnScreen ? `${worstOnScreen.kind}x${worstOnScreen.copies}` : "-"} notices=${trial.loopNotices} ${trial.chat.join(" | ")}`);
    }
  }
  await ctx.close();
} catch (e) { out.failure = `${e}`; }
finally { save(); await browser.close(); await server.close(); }
console.log("done", out.failure ?? "ok");
