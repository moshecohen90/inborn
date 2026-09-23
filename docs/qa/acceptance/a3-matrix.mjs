/** The whole document matrix on one tier: every format, strict mode both ways, the scan, nothing invented. */
import path from "node:path";
import { harness, bootedPage, Shots, report, clean, DOCS, SCRATCH } from "./acc-lib.mjs";

const TIER = process.env.TIER ?? "free";
const DIST = TIER === "free" ? undefined : path.join(SCRATCH, `dist-dev-${TIER}`);
const shots = new Shots("web");
const h = await harness(DIST ? { dist: DIST } : {});
const out = { tier: TIER, dist: DIST ?? "apps/web/dist", url: h.url, files: {}, checks: {} };
const F = (n) => path.join(DOCS, n);
const tag = (n) => `A3-${TIER}-${n}`;

const DOC_RE = /\[documents\] (.+?): (\w+) · (\d+)\/(\d+) pages · (\d+) chunks/;
async function waitDocLine(lines, name, ms = 240_000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const hit = lines.map((l) => DOC_RE.exec(l)).find((m) => m && m[1] === name);
    if (hit) return { status: hit[2], indexedPages: +hit[3], pages: +hit[4], chunks: +hit[5] };
    await new Promise((r) => setTimeout(r, 300));
  }
  return { timedOut: true };
}
const sheetOpen = async (page) => (await page.getByTestId("attach-sheet").count()) > 0;
async function openAttach(page) {
  if (await sheetOpen(page)) return;
  await page.getByTestId("attach").click();
  await page.getByTestId("attach-sheet").waitFor({ timeout: 15_000 });
}
async function closeSheet(page) {
  for (let i = 0; i < 6 && (await sheetOpen(page)); i++) {
    await page.locator('button[aria-label="Close"]').last().click({ position: { x: 6, y: 6 }, timeout: 5_000 }).catch(() => {});
    await page.waitForTimeout(400);
  }
}
async function closePaywall(page) {
  if (await page.getByTestId("close-paywall").count()) {
    await page.getByTestId("close-paywall").click().catch(() => {});
    await page.waitForTimeout(700);
  }
}
async function importFile(page, file, lines) {
  await openAttach(page);
  const chooser = page.waitForEvent("filechooser", { timeout: 8_000 }).catch(() => null);
  await page.getByTestId("attach-import").click();
  const fc = await chooser;
  const name = path.basename(file);
  if (!fc) {
    const r = { chooserOpened: false, paywall: await clean(page, "paywall-title"), why: await clean(page, "paywall-why"), workCard: await clean(page, "office-work-card") };
    await closePaywall(page);
    return r;
  }
  await fc.setFiles(file);
  await page.waitForTimeout(2000);
  const r = { chooserOpened: true, paywall: await clean(page, "paywall-title"), why: await clean(page, "paywall-why"), workCard: await clean(page, "office-work-card") };
  if (!r.paywall && !r.workCard) r.indexing = await waitDocLine(lines, name);
  await closePaywall(page);
  await closeSheet(page);
  return r;
}
async function ask(page, prompt, timeout = 300_000) {
  const before = await page.getByTestId("ledger-toggle").count();
  await page.getByTestId("composer-input").fill(prompt);
  await page.getByTestId("send").click();
  await page.waitForFunction((n) => document.querySelectorAll('[data-testid="ledger-toggle"]').length > n, before, { timeout });
  const texts = await page.getByTestId("assistant-text").allTextContents();
  const cites = await page.getByTestId("citations").allTextContents();
  const nf = await page.getByTestId("not-found").allTextContents();
  return { answer: (texts.at(-1) ?? "").replace(/\s+/g, " ").trim(), citation: (cites.at(-1) ?? "").replace(/\s+/g, " ").trim(), notFound: (nf.at(-1) ?? "").replace(/\s+/g, " ").trim() || null };
}

let dbg = null;
try {
  const { page, obs, ctx } = await bootedPage(h.browser, h.url, { width: 1440 });
  dbg = page;
  const L = obs.console;
  out.tierChip = await clean(page, "tier-chip");

  for (const f of ["turbine-report-3pages.pdf", "scan-no-text-layer.pdf", "novara-depot.docx", "sites.xlsx", "quarterly-note.html"]) {
    out.files[f] = await importFile(page, F(f), L);
    await shots.take(page, tag(`import-${f.replace(/\W+/g, "-")}`), 1440);
  }
  await openAttach(page);
  out.checks.libraryAfterImports = await clean(page, "attach-sheet");
  await shots.take(page, tag("library"), 1440);
  await closeSheet(page);

  /* Every indexed file attached at once: the citation must name the right file AND the right page. */
  out.checks.askTurbine = await ask(page, "What is the Rakovsky turbine serial number? Answer in one short sentence.");
  await shots.take(page, tag("ask-turbine"), 1440);
  out.checks.askDepot = await ask(page, "How many spare bearings does the Novara depot hold?");
  out.checks.askFerry = await ask(page, "How many passengers did the Arendal ferry carry in 2024?");
  out.checks.askScan = await ask(page, "When did the Kessler valve inspection pass?");
  await shots.take(page, tag("ask-scan"), 1440);

  /* Strict mode both ways. */
  await openAttach(page);
  const strict = page.getByTestId("attach-strict");
  const before = await strict.getAttribute("aria-checked");
  await strict.click();
  await page.waitForTimeout(1500);
  const after = (await strict.count()) ? await strict.getAttribute("aria-checked") : null;
  out.checks.strict = { paywall: await clean(page, "paywall-title"), why: await clean(page, "paywall-why"), before, after };
  await shots.take(page, tag("strict"), 1440);
  await closePaywall(page);
  await closeSheet(page);
  if (!out.checks.strict.paywall) {
    out.checks.strictOutside = await ask(page, "Who was the first person to walk on the moon?");
    await shots.take(page, tag("strict-outside"), 1440);
    out.checks.strictInside = await ask(page, "Who manages the Novara depot?");
  }

  out.pageErrors = obs.errors;
  out.documentLines = L.filter((l) => /\[documents\]|no-embedder|needsOcr|ocr/i.test(l)).slice(0, 40);
  out.consoleErrors = L.filter((l) => /^(error|pageerror)/.test(l)).slice(0, 20);
  await ctx.close();
  out.shots = shots.taken;
} catch (e) {
  out.failure = `${e}`.slice(0, 600);
  if (dbg) await shots.take(dbg, tag("failure"), 1440).catch(() => {});
} finally {
  await h.close();
}
report(`a3-matrix-${TIER}`, out);
