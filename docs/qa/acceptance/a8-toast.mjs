/** The F161 notice itself: it is a flash, so it has to be caught while the answer is still streaming. */
import path from "node:path";
import { harness, bootedPage, Shots, report, clean, DOCS } from "./acc-lib.mjs";
const shots = new Shots("web");
const h = await harness();
const out = { url: h.url };
let dbg = null;
try {
  const { page, obs, ctx } = await bootedPage(h.browser, h.url, { width: 1440 });
  dbg = page;
  await page.getByTestId("attach").click();
  await page.getByTestId("attach-sheet").waitFor({ timeout: 15_000 });
  const chooser = page.waitForEvent("filechooser", { timeout: 8_000 });
  await page.getByTestId("attach-import").click();
  await (await chooser).setFiles(path.join(DOCS, "scan-no-text-layer.pdf"));
  await page.waitForTimeout(5000);
  for (let i = 0; i < 5 && (await page.locator('button[aria-label="Close"]').count()); i++) {
    await page.locator('button[aria-label="Close"]').last().click({ position: { x: 6, y: 6 }, timeout: 4000 }).catch(() => {});
    await page.waitForTimeout(400);
  }
  await page.getByTestId("composer-input").fill("When did the Kessler valve inspection pass, according to the attached file?");
  await page.getByTestId("send").click();
  await page.getByTestId("toast").waitFor({ timeout: 30_000 });
  out.toast = await clean(page, "toast");
  await shots.take(page, "A8-00-none-matched-toast", 1440);
  await ctx.close();
  out.shots = shots.taken;
  out.pageErrors = obs.errors;
} catch (e) {
  out.failure = `${e}`.slice(0, 300);
  if (dbg) await shots.take(dbg, "A8-99-failure", 1440).catch(() => {});
} finally { await h.close(); }
report("a8-toast", out);
