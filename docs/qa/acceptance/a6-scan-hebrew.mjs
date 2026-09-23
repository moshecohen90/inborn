/** Two honesty checks on the shipping build: a scan with no text layer, and Hebrew (never blocked, never gibberish-by-design). */
import path from "node:path";
import { harness, bootedPage, Shots, report, clean, DOCS } from "./acc-lib.mjs";

const shots = new Shots("web");
const h = await harness();
const out = { url: h.url, checks: {} };
const DOC_RE = /\[documents\] (.+?): (\w+) · (\d+)\/(\d+) pages · (\d+) chunks/;
async function waitDocLine(lines, name, ms = 180_000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const hit = lines.map((l) => DOC_RE.exec(l)).find((m) => m && m[1] === name);
    if (hit) return { status: hit[2], indexedPages: +hit[3], pages: +hit[4], chunks: +hit[5] };
    await new Promise((r) => setTimeout(r, 300));
  }
  return { timedOut: true };
}
async function ask(page, prompt, timeout = 300_000) {
  const before = await page.getByTestId("ledger-toggle").count();
  await page.getByTestId("composer-input").fill(prompt);
  await page.getByTestId("send").click();
  await page.waitForFunction((n) => document.querySelectorAll('[data-testid="ledger-toggle"]').length > n, before, { timeout });
  const texts = await page.getByTestId("assistant-text").allTextContents();
  const cites = await page.getByTestId("citations").allTextContents();
  return { answer: (texts.at(-1) ?? "").replace(/\s+/g, " ").trim(), citation: (cites.at(-1) ?? "").replace(/\s+/g, " ").trim() };
}
const closeOverlay = async (page) => {
  for (let i = 0; i < 4 && (await page.locator('button[aria-label="Close"]').count()); i++) {
    await page.locator('button[aria-label="Close"]').last().click({ position: { x: 6, y: 6 }, timeout: 4000 }).catch(() => {});
    await page.waitForTimeout(400);
  }
};
let dbg = null;
try {
  const { page, obs, ctx } = await bootedPage(h.browser, h.url, { width: 1440 });
  dbg = page;
  const L = obs.console;

  /* 1. A scan with no text layer: the state must be honest, and the answer must not invent. */
  await page.getByTestId("attach").click();
  await page.getByTestId("attach-sheet").waitFor({ timeout: 15_000 });
  const chooser = page.waitForEvent("filechooser", { timeout: 8_000 });
  await page.getByTestId("attach-import").click();
  await (await chooser).setFiles(path.join(DOCS, "scan-no-text-layer.pdf"));
  await page.waitForTimeout(3000);
  out.checks.scanLine = await waitDocLine(L, "scan-no-text-layer.pdf", 90_000);
  await page.getByTestId("attach").click().catch(() => {});
  await page.waitForTimeout(1500);
  out.checks.scanSheet = await clean(page, "attach-sheet");
  await shots.take(page, "A6-00-scan-state", 1440);
  out.checks.scanToast = await clean(page, "toast");
  await closeOverlay(page);
  out.checks.scanAsk = await ask(page, "When did the Kessler valve inspection pass, according to the attached file?");
  await shots.take(page, "A6-01-scan-answer", 1440);

  /* 2. Hebrew: the prompt must reach the engine unchanged and the notice must advise, never block. */
  await page.goto(h.url);
  await page.getByTestId("composer-input").waitFor({ timeout: 120_000 });
  await page.waitForTimeout(2000);
  out.checks.hebrew = await ask(page, "כתוב משפט אחד בעברית על מזג האוויר.");
  out.checks.modelWeak = await clean(page, "model-weak");
  out.checks.modelWeakLine = await clean(page, "model-weak-line");
  out.checks.modelWeakAction = await clean(page, "model-weak-action");
  out.checks.modelAdvice = await clean(page, "model-advice");
  await shots.take(page, "A6-02-hebrew", 1440);
  out.checks.hebrewPromptEchoed = await clean(page, "user-message");

  out.pageErrors = obs.errors;
  out.documentLines = L.filter((l) => /\[documents\]/.test(l));
  await ctx.close();
  out.shots = shots.taken;
} catch (e) {
  out.failure = `${e}`.slice(0, 500);
  if (dbg) await shots.take(dbg, "A6-99-failure", 1440).catch(() => {});
} finally {
  await h.close();
}
report("a6-scan-hebrew", out);
