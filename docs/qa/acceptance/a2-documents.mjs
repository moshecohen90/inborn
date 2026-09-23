/**
 * Moshe's core ask: "if they asked to index their documents it must work well — find several documents, play with
 * them, investigate from every direction". Free tier unless INBORN_TIER names a dev build.
 */
import path from "node:path";
import { harness, bootedPage, Shots, report, clean, DOCS, SCRATCH } from "./acc-lib.mjs";

const TIER = process.env.TIER ?? "free";
const DIST = TIER === "free" ? undefined : path.join(SCRATCH, `dist-dev-${TIER}`);
const shots = new Shots("web");
const h = await harness(DIST ? { dist: DIST } : {});
const out = { tier: TIER, dist: DIST ?? "apps/web/dist", url: h.url, checks: {} };
const F = (n) => path.join(DOCS, n);
const tag = (n) => `${TIER === "free" ? "A2" : "A6-" + TIER}-${n}`;

/** The library prints one line per document when indexing ends: "[documents] <name>: <status> · p/p pages · n chunks · ms". */
const DOC_RE = /\[documents\] (.+?): (\w+) · (\d+)\/(\d+) pages · (\d+) chunks/;
async function waitDocLine(lines, name, ms = 240_000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const hit = lines.map((l) => DOC_RE.exec(l)).find((m) => m && m[1] === name);
    if (hit) return { name: hit[1], status: hit[2], indexedPages: +hit[3], pages: +hit[4], chunks: +hit[5] };
    await new Promise((r) => setTimeout(r, 300));
  }
  return { timedOut: true, tail: lines.filter((l) => /documents|embed/i.test(l)).slice(-8) };
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

const sheetOpen = async (page) => (await page.getByTestId("attach-sheet").count()) > 0;
async function openAttach(page) {
  if (await sheetOpen(page)) return;
  await page.getByTestId("attach").click();
  await page.getByTestId("attach-sheet").waitFor({ timeout: 15_000 });
}
async function closeSheet(page) {
  for (let i = 0; i < 6 && (await sheetOpen(page)); i++) {
    /* The backdrop fills the viewport and the card sits in its middle: the corner is the only part that is backdrop. */
    await page.locator('button[aria-label="Close"]').last().click({ position: { x: 6, y: 6 }, timeout: 5_000 }).catch(() => {});
    await page.waitForTimeout(400);
  }
  await page.waitForTimeout(300);
}

/** Imports one file through the real browser chooser; returns what the chooser and the sheet did. */
async function importFile(page, file) {
  await openAttach(page);
  const chooser = page.waitForEvent("filechooser", { timeout: 10_000 }).catch(() => null);
  await page.getByTestId("attach-import").click();
  const fc = await chooser;
  if (!fc) return { chooserOpened: false, sheetStillUp: await sheetOpen(page), paywall: await clean(page, "paywall-title") };
  await fc.setFiles(file);
  await page.waitForTimeout(1500);
  return { chooserOpened: true, sheetStillUp: await sheetOpen(page), paywall: await clean(page, "paywall-title"), sheetText: await clean(page, "attach-sheet") };
}

let dbg = null;
try {
  const { page, obs, ctx } = await bootedPage(h.browser, h.url, { width: 1440 });
  const L = obs.console;
  dbg = page;

  /* 1. A real chooser opens and the 3-page PDF lands in the library and gets indexed. */
  const c = (out.checks.pdf3 = await importFile(page, F("turbine-report-3pages.pdf")));
  await shots.take(page, tag("01-attach-sheet"), 1440);
  c.indexing = await waitDocLine(L, "turbine-report-3pages.pdf");
  await openAttach(page);
  c.rowAfterIndex = await clean(page, "attach-sheet");
  await shots.take(page, tag("02-indexed"), 1440);
  await closeSheet(page);

  /* 2. Does the answer come from the right page, with a citation, and nothing invented? */
  out.checks.askPage2 = await ask(page, "According to the attached document, when was the Belmont warehouse roof replaced? Answer in one short sentence.");
  await shots.take(page, tag("03-answer-page2"), 1440);
  out.checks.askPage3 = await ask(page, "According to the attached document, what is the annual maintenance budget for the Halden plant?");
  await shots.take(page, tag("04-answer-page3"), 1440);

  /* 3. Strict mode: Free must show PRO and open the paywall; Pro/Work must turn it on. */
  await openAttach(page);
  const strict = page.getByTestId("attach-strict");
  out.checks.strict = { present: (await strict.count()) > 0, proTagInSheet: /PRO/.test((await clean(page, "attach-sheet")) ?? "") };
  await strict.click();
  await page.waitForTimeout(1200);
  out.checks.strict.paywallTitle = await clean(page, "paywall-title");
  out.checks.strict.paywallWhy = await clean(page, "paywall-why");
  await shots.take(page, tag("05-strict-tap"), 1440);
  if (out.checks.strict.paywallTitle) {
    await page.getByTestId("close-paywall").click().catch(() => {});
    await page.waitForTimeout(600);
  } else {
    out.checks.strict.on = await strict.getAttribute("aria-checked");
    await closeSheet(page);
    /* Strict on: an outside question must say "not found", not invent. */
    out.checks.strictOutside = await ask(page, "Who was the first person to walk on the moon?");
    await shots.take(page, tag("06-strict-outside"), 1440);
    out.checks.strictInside = await ask(page, "What is the Rakovsky turbine serial number?");
  }
  await closeSheet(page);

  /* 4. A second file on Free must be the Pro moment; on Pro/Work it must just import. */
  out.checks.secondFile = await importFile(page, F("novara-depot.docx"));
  await shots.take(page, tag("07-second-file"), 1440);
  if (out.checks.secondFile.paywall) {
    out.checks.secondFile.why = await clean(page, "paywall-why");
    await page.getByTestId("close-paywall").click().catch(() => {});
    await page.waitForTimeout(600);
  } else {
    out.checks.secondFile.indexing = await waitDocLine(L, "novara-depot.docx");
  }
  await closeSheet(page);

  out.pageErrors = obs.errors;
  out.documentLines = L.filter((l) => /\[documents\]|\[embed|no-embedder/.test(l)).slice(0, 40);
  out.consoleErrors = L.filter((l) => /^(error|pageerror)/.test(l)).slice(0, 20);
  await ctx.close();
  out.shots = shots.taken;
} catch (e) {
  out.failure = `${e}`;
  if (dbg) {
    await shots.take(dbg, tag("99-failure"), 1440).catch(() => {});
    out.overlays = await dbg.evaluate(() => [...document.querySelectorAll('[aria-label="Close"]')].map((b) => {
      const r = b.getBoundingClientRect();
      return { rect: [r.x, r.y, r.width, r.height].map(Math.round), parent: (b.parentElement?.textContent ?? "").slice(0, 120) };
    })).catch(() => null);
  }
} finally {
  await h.close();
}
report(`a2-documents-${TIER}`, out);
