/** F163: tapping a library row in the attach sheet on the web — the F129 gate only exists in the native picker. */
import path from "node:path";
import { harness, bootedPage, Shots, report, DOCS } from "./acc-lib.mjs";
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
  await (await chooser).setFiles(path.join(DOCS, "turbine-report-3pages.pdf"));
  await page.waitForTimeout(8000);
  /* The file imports attached; detach it, then attach it again from the library row — the door round 37 gated. */
  await page.getByTestId("attach").click().catch(() => {});
  await page.waitForTimeout(1200);
  const KNOWN = ["attach-sheet", "attach-import", "attach-manage", "attach-strict", "attach-photo", "attach-camera", "attach-templates", "attach-use-vision"];
  const rowId = await page.evaluate((known) => [...document.querySelectorAll('[data-testid^="attach-"]')].map((e) => e.getAttribute("data-testid")).find((id) => id && !known.includes(id)) ?? null, KNOWN);
  out.rowId = rowId;
  const row = page.getByTestId(rowId);
  out.rowFound = (await row.count()) > 0;
  const ticked = () => page.locator('[data-testid^="attached-"]:not([data-testid="attached-docs"])').count();
  out.tickedBefore = await ticked();
  await row.click();
  await page.waitForTimeout(1500);
  out.afterDetach = { errors: [...obs.errors], ticked: await ticked(), chip: await page.locator('[data-testid="attached-docs"]').count() };
  await row.click();
  await page.waitForTimeout(1500);
  out.afterReattach = { errors: [...obs.errors], ticked: await ticked(), chip: await page.locator('[data-testid="attached-docs"]').count() };
  await shots.take(page, "A9-00-library-row", 1440);
  out.pageErrors = obs.errors;
  out.consoleErrors = obs.console.filter((l) => /^(error|pageerror)/.test(l)).slice(0, 10);
  await ctx.close();
  out.shots = shots.taken;
} catch (e) {
  out.failure = `${e}`.slice(0, 400);
  if (dbg) { out.pageErrors = dbg ? undefined : undefined; await shots.take(dbg, "A9-99-failure", 1440).catch(() => {}); }
} finally { await h.close(); }
report("a9-libattach", out);
