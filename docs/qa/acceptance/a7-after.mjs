/** After F160 + F161: the scan says it is a scan, and an off-topic question carries no SOURCES. */
import path from "node:path";
import { harness, bootedPage, Shots, report, clean, DOCS } from "./acc-lib.mjs";

const shots = new Shots("web");
const h = await harness();
const out = { url: h.url, checks: {} };
async function ask(page, prompt, timeout = 300_000) {
  const before = await page.getByTestId("ledger-toggle").count();
  await page.getByTestId("composer-input").fill(prompt);
  await page.getByTestId("send").click();
  await page.waitForFunction((n) => document.querySelectorAll('[data-testid="ledger-toggle"]').length > n, before, { timeout });
  const texts = await page.getByTestId("assistant-text").allTextContents();
  const cites = await page.getByTestId("citations").allTextContents();
  return { answer: (texts.at(-1) ?? "").replace(/\s+/g, " ").trim(), citation: (cites.at(-1) ?? "").replace(/\s+/g, " ").trim(), citationBlocks: cites.length };
}
const closeOverlay = async (page) => {
  for (let i = 0; i < 5 && (await page.locator('button[aria-label="Close"]').count()); i++) {
    await page.locator('button[aria-label="Close"]').last().click({ position: { x: 6, y: 6 }, timeout: 4000 }).catch(() => {});
    await page.waitForTimeout(400);
  }
};
let dbg = null;
try {
  const { page, obs, ctx } = await bootedPage(h.browser, h.url, { width: 1440 });
  dbg = page;

  /* F160: the scan's state line. */
  await page.getByTestId("attach").click();
  await page.getByTestId("attach-sheet").waitFor({ timeout: 15_000 });
  const chooser = page.waitForEvent("filechooser", { timeout: 8_000 });
  await page.getByTestId("attach-import").click();
  await (await chooser).setFiles(path.join(DOCS, "scan-no-text-layer.pdf"));
  await page.waitForTimeout(6000);
  await page.getByTestId("attach").click().catch(() => {});
  await page.waitForTimeout(1500);
  out.checks.scanSheet = await clean(page, "attach-sheet");
  await shots.take(page, "A7-00-scan-state-after", 1440);
  await closeOverlay(page);

  /* F161: the same question that used to come back invented under a SOURCES list. */
  out.checks.scanAsk = await ask(page, "When did the Kessler valve inspection pass, according to the attached file?");
  await shots.take(page, "A7-01-scan-answer-after", 1440);

  /* And a document that IS indexed still cites, so the floor did not silence honest citations. */
  await page.goto(h.url);
  await page.getByTestId("composer-input").waitFor({ timeout: 120_000 });
  await page.waitForTimeout(2000);
  await page.getByTestId("attach").click();
  await page.getByTestId("attach-sheet").waitFor({ timeout: 15_000 });
  const c2 = page.waitForEvent("filechooser", { timeout: 8_000 });
  await page.getByTestId("attach-import").click();
  await (await c2).setFiles(path.join(DOCS, "turbine-report-3pages.pdf"));
  await page.waitForTimeout(8000);
  await closeOverlay(page);
  out.checks.onTopic = await ask(page, "According to the attached document, when was the Belmont warehouse roof replaced?");
  await shots.take(page, "A7-02-on-topic-after", 1440);
  out.checks.offTopic = await ask(page, "How many passengers did the Arendal ferry carry in 2024?");
  await shots.take(page, "A7-03-off-topic-after", 1440);

  out.documentLines = obs.console.filter((l) => /\[documents\]/.test(l));
  out.pageErrors = obs.errors;
  await ctx.close();
  out.shots = shots.taken;
} catch (e) {
  out.failure = `${e}`.slice(0, 500);
  if (dbg) await shots.take(dbg, "A7-99-failure", 1440).catch(() => {});
} finally {
  await h.close();
}
report("a7-after", out);
