/* Round 110 (F421): the final round-107 guard, live on main's web export, Instant (wllama), fresh chat per trial.
   usage: node guard-trials.mjs <worktree> <port>   (resumes: trials already in the result file are skipped) */
import { createRequire } from "node:module";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
const [W, PORT] = [process.argv[2], Number(process.argv[3])];
const Q = path.join(W, "docs/qa/web-guard-verify");
const SHOTS = path.join(process.env.SHOTS_DIR ?? "/tmp", "shots");
mkdirSync(SHOTS, { recursive: true });
mkdirSync(Q, { recursive: true });
const FOX = "The quick brown fox jumps over the lazy dog.";
const PLAN = [
  ["A", "ja-nenji", "年次報告書の書き方を詳しく教えてください。", 4],
  ["A", "es-list", "Escribe 30 frases motivadoras cortas.", 4],
  ["B", "es-list", "Escribe 30 frases motivadoras cortas.", 5],
  ["B", "poem", "Write a long poem about the sea with many stanzas.", 5],
  ["B", "he-explain", "הסבר לי בפירוט מה זה פוטוסינתזה.", 5],
  ["B", "verbs-de", "Nenne 25 deutsche Verben mit ihrer Bedeutung auf Englisch.", 5],
  ["C", "fox-5", `Repeat exactly this sentence five times, each on its own line: ${FOX}`, 5],
  ["C", "animals-40", "List 40 animals, one per line, numbered.", 5],
];
const { startServer } = await import(`${W}/scripts/serve-web.mjs`);
const pw = createRequire("/Users/moshecohen/.npm/_npx/9833c18b2d85bc59/node_modules/")("playwright-core");
const cache = "/Users/moshecohen/Library/Caches/ms-playwright";
const shellDir = readdirSync(cache).filter((d) => /^chromium_headless_shell-\d+$/.test(d)).sort().reverse()[0];
const exe = readdirSync(path.join(cache, shellDir)).map((s) => path.join(cache, shellDir, s, "chrome-headless-shell")).find(existsSync);
const file = path.join(Q, "result.json");
const prior = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : null;
const out = { build: "origin/main 5490c77b, apps/web/dist", model: "Instant (Qwen3.5-0.8B-Q4_K_M)", viewport: "1440x900", exe, trials: prior?.trials ?? [], runs: [...(prior?.runs ?? [])] };
const done = new Set(out.trials.map((t) => `${t.batch}/${t.id}/${t.trial}`));
const server = await startServer({ port: PORT, dist: `${W}/apps/web/dist`, modelsDir: "/Users/moshecohen/dev/inborn/.models", aliases: { "instant.gguf": "Qwen3.5-0.8B-Q4_K_M.gguf", "fast.gguf": "absent-on-purpose.gguf" } });
const browser = await pw.chromium.launch({ headless: true, executablePath: exe, args: ["--force-prefers-color-scheme=light"] });
const run = { node: process.pid, started: new Date().toISOString(), url: server.url };
out.runs.push(run);
console.log(`node pid ${process.pid} url ${server.url}`);
const L = [];
const save = () => writeFileSync(file, JSON.stringify(out, null, 1));

/* The yardstick of round 107's e2e/trials.mjs, unchanged, so the columns compare. */
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

const ITEM = /^\s*(?:(\d{1,3})[.)]|[-*•+])\s+(.*)$/u;
/* A list's items, its numbering, and any item said twice (case, markdown, a gloss in brackets and a final full stop aside). */
function listShape(text) {
  const items = [];
  for (const line of text.split("\n")) {
    const m = ITEM.exec(line);
    if (m) items.push({ n: m[1] ? Number(m[1]) : null, body: m[2] });
  }
  const key = (b) => b.replace(/[*_`]/g, "").replace(/\s*[(（][^)）]*[)）]/g, "").replace(/\s+[-–—:].*$/u, "").replace(/[.!?。]+$/u, "").trim().toLowerCase();
  const seen = new Map();
  for (const it of items) { const k = key(it.body); if (k) seen.set(k, (seen.get(k) ?? 0) + 1); }
  const dupes = [...seen].filter(([, c]) => c > 1).map(([k, c]) => `${k} x${c}`);
  const nums = items.map((i) => i.n).filter((n) => n !== null);
  const gaps = nums.slice(1).map((n, i) => (n === nums[i] + 1 ? null : `${nums[i]}->${n}`)).filter(Boolean);
  return { items: items.length, first: nums[0] ?? null, last: nums.at(-1) ?? null, gaps, dupes };
}

const wait = async (re, ms) => { const end = Date.now() + ms; while (Date.now() < end) { const h = L.find((l) => re.test(l)); if (h) return h; await new Promise((r) => setTimeout(r, 300)); } return null; };
const lastText = async (page) => page.evaluate(() => [...document.querySelectorAll('[data-testid="assistant-text"]')].at(-1)?.innerText ?? "");
/* The stored answer, markdown and all: what the guard let through, before rendering. */
const lastStored = async (page) => page.evaluate(() => new Promise((resolve) => {
  const r = indexedDB.open("inborn");
  r.onerror = () => resolve(null);
  r.onsuccess = () => {
    const db = r.result;
    const c = db.transaction("messages", "readonly").objectStore("messages").openCursor(null, "prev");
    c.onsuccess = () => { const cur = c.result; if (!cur) { db.close(); resolve(null); return; } if (cur.value.role === "assistant") { db.close(); resolve(cur.value.content ?? null); return; } cur.continue(); };
    c.onerror = () => { db.close(); resolve(null); };
  };
}));
try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36", deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on("console", (m) => L.push(`${m.type()}: ${m.text()}`));
  page.on("pageerror", (e) => L.push(`pageerror: ${e.message}`));
  await page.goto(server.url);
  await page.getByTestId("onboarding-welcome").waitFor({ timeout: 60_000 });
  await page.getByTestId("onboarding-continue").click();
  await page.getByTestId("onboarding-model").waitFor({ timeout: 60_000 });
  if (!(await page.getByTestId("web-model-choose-instant").count()) && (await page.getByTestId("web-model-options-toggle").count())) await page.getByTestId("web-model-options-toggle").click();
  if (await page.getByTestId("web-model-choose-instant").count()) await page.getByTestId("web-model-choose-instant").click();
  await page.getByTestId("download-model").click();
  await page.getByTestId("onboarding-sealed").waitFor({ timeout: 300_000 });
  const start = page.getByTestId("sealed-start"); await start.waitFor({ timeout: 60_000 });
  for (let i = 0; i < 120 && (await start.isDisabled()); i++) await page.waitForTimeout(100);
  await start.click();
  await page.getByTestId("lock-start").waitFor({ timeout: 60_000 }); await page.getByTestId("lock-start").click();
  await page.getByTestId("composer-input").waitFor({ timeout: 300_000 });
  run.loaded = await wait(/\[inborn\] \w+ loaded/, 300_000);
  run.engineLines = L.filter((l) => /wllama|thread|\[inborn\]/i.test(l)).slice(0, 20);
  save();
  const newChat = async () => { await page.getByTestId("new-chat").first().click(); await page.getByTestId("start-chat").click(); await page.getByTestId("new-chat-sheet").waitFor({ state: "detached", timeout: 10_000 }).catch(() => {}); await page.waitForTimeout(800); };
  let first = true;
  for (const [batch, id, q, n] of PLAN) {
    for (let i = 1; i <= n; i++) {
      if (done.has(`${batch}/${id}/${i}`)) continue;
      if (!first) await newChat();
      first = false;
      const nChat = L.filter((l) => l.includes("[chat]")).length;
      const before = await page.getByTestId("ledger-toggle").count();
      await page.getByTestId("composer-input").fill(q); await page.getByTestId("send").click();
      let worstOnScreen = null;
      const t0 = Date.now();
      while (Date.now() - t0 < 900_000) {
        const t = await lastText(page);
        const r = repetitions(t);
        if (r && (!worstOnScreen || r.copies > worstOnScreen.copies)) worstOnScreen = r;
        if ((await page.getByTestId("ledger-toggle").count()) > before) break;
        await page.waitForTimeout(250);
      }
      const ms = Date.now() - t0;
      await page.waitForTimeout(800);
      const answer = await lastText(page);
      const finalRep = repetitions(answer);
      if (finalRep && (!worstOnScreen || finalRep.copies > worstOnScreen.copies)) worstOnScreen = finalRep;
      const raw = await lastStored(page);
      const chat = L.filter((l) => l.includes("[chat]")).slice(nChat);
      const retries = chat.filter((l) => l.includes("loop retry")).map((l) => { const m = /kept (\d+) chars, unit (\d+) cp x(\d+)/.exec(l); return m ? { kept: +m[1], unitCp: +m[2], copies: +m[3] } : { line: l }; });
      const cuts = chat.filter((l) => l.includes("loop cut"));
      const trial = { batch, id, trial: i, q, ms, answer, raw, worstOnScreen, loopNotices: await page.getByTestId("loop-notice").count(), retries, cuts, chat };
      if (retries[0]?.kept !== undefined && raw) {
        const kept = raw.slice(0, retries[0].kept);
        trial.retryAt = { keptTail: Array.from(kept).slice(-Math.max(retries[0].unitCp, 60)).join(""), continuation: raw.slice(retries[0].kept, retries[0].kept + 400), keptList: listShape(kept), continuationList: listShape(raw.slice(retries[0].kept)) };
      }
      if (raw && (id === "animals-40" || id === "es-list" || id === "verbs-de")) trial.list = listShape(raw);
      if (id === "fox-5") {
        const norm = (s) => s.replace(/^\s*(?:\d{1,3}[.)]|[-*•+])\s+/u, "").replace(/[*_`"“”]/g, "").trim().toLowerCase();
        const lines = (raw ?? answer).split("\n").map(norm).filter(Boolean);
        trial.fox = { foxLines: lines.filter((l) => l === FOX.toLowerCase()).length, otherLines: lines.filter((l) => l !== FOX.toLowerCase()) };
      }
      out.trials.push(trial);
      save();
      await page.getByTestId("assistant-text").last().scrollIntoViewIfNeeded().catch(() => {});
      await page.waitForTimeout(300);
      await page.screenshot({ path: path.join(SHOTS, `${batch}-${id}-${i}-1440.png`) });
      const extra = trial.fox ? ` fox=${trial.fox.foxLines}` : trial.list ? ` items=${trial.list.items} last=${trial.list.last} dupes=${trial.list.dupes.length} gaps=${trial.list.gaps.join(",")}` : "";
      console.log(`${batch} ${id}#${i} ${Math.round(ms / 1000)}s ${worstOnScreen ? `${worstOnScreen.kind}x${worstOnScreen.copies} "${worstOnScreen.unit.slice(0, 40)}"` : "-"} retries=${retries.length} cuts=${cuts.length} notices=${trial.loopNotices}${extra}`);
    }
  }
  run.console = L.filter((l) => /\[chat\]|error/i.test(l)).slice(0, 300);
  await ctx.close();
} catch (e) { run.failure = `${e}`; console.log("FAIL", e); }
finally { run.ended = new Date().toISOString(); save(); await browser.close(); await server.close(); }
console.log("done", run.failure ?? "ok");
