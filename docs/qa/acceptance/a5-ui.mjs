/** The remaining .ini items in the browser: paywall prices, "New chat", composer alignment, locked controls → paywall, sheets that stay. */
import { URL } from "node:url";
import { harness, bootedPage, Shots, report, clean } from "./acc-lib.mjs";

const shots = new Shots("web");
const h = await harness();
const out = { url: h.url, widths: {} };
const box = async (page, id) => {
  const el = page.getByTestId(id).first();
  if (!(await el.count())) return null;
  const b = await el.boundingBox();
  return b ? { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height), bottom: Math.round(b.y + b.height), centerY: Math.round(b.y + b.height / 2) } : null;
};
const closeOverlay = async (page) => {
  for (let i = 0; i < 4; i++) {
    const n = await page.locator('button[aria-label="Close"]').count();
    if (!n) break;
    await page.locator('button[aria-label="Close"]').last().click({ position: { x: 6, y: 6 }, timeout: 4000 }).catch(() => {});
    await page.waitForTimeout(400);
  }
};
let dbg = null;
try {
  for (const width of [390, 768, 1024, 1440]) {
    const { page, obs, ctx } = await bootedPage(h.browser, h.url, { width });
    dbg = page;
    const w = (out.widths[width] = {});

    /* 1. The composer: +, field and send on one baseline (Moshe: "not the same height, ugly on large screens"). */
    w.composer = { plus: await box(page, "attach"), input: await box(page, "composer-input"), send: await box(page, "send"), mic: await box(page, "mic") };
    await shots.take(page, "A5-00-chat", width);
    /* Two lines of text is the state he complained about. */
    await page.getByTestId("composer-input").fill("A message long enough to wrap onto a second line in the composer at this width, which is what Moshe was looking at when he said the row is not aligned.");
    await page.waitForTimeout(600);
    w.composerTwoLines = { plus: await box(page, "attach"), input: await box(page, "composer-input"), send: await box(page, "send") };
    await shots.take(page, "A5-01-composer-2lines", width);
    await page.getByTestId("composer-input").fill("");

    /* 2. "New chat" on one line. */
    w.newChat = await box(page, "new-chat");
    w.newChatText = await clean(page, "new-chat");

    /* 3. The model sheet, with a moment to paint. */
    await page.getByTestId("model-chip").first().click();
    await page.getByTestId("model-sheet").waitFor({ timeout: 15_000 });
    await page.waitForTimeout(1200);
    await shots.take(page, "A5-02-model-sheet", width);
    w.modelSheetSeeWhatsInPro = (await page.getByTestId("see-whats-in-pro").count()) > 0;
    await closeOverlay(page);

    /* 4. Locked controls: every one must open the paywall with its reason, not go quiet. */
    w.locked = {};
    for (const id of ["open-folders", "attach-strict"]) {
      if (id === "attach-strict") {
        await page.getByTestId("attach").click();
        await page.getByTestId("attach-sheet").waitFor({ timeout: 10_000 });
      }
      const el = page.getByTestId(id).first();
      if (!(await el.count())) { w.locked[id] = "absent"; continue; }
      await el.click().catch(() => {});
      await page.waitForTimeout(1200);
      w.locked[id] = { paywall: await clean(page, "paywall-title"), why: await clean(page, "paywall-why"), status: await clean(page, "paywall-status") };
      await shots.take(page, `A5-03-locked-${id}`, width);
      await page.getByTestId("close-paywall").click().catch(() => {});
      await page.waitForTimeout(500);
      await closeOverlay(page);
    }

    /* 5. A sheet item must act, not make the sheet vanish silently (Moshe: "the popup disappears without doing anything"). */
    await page.getByTestId("attach").click();
    await page.getByTestId("attach-sheet").waitFor({ timeout: 10_000 });
    await page.getByTestId("attach-templates").click().catch(() => {});
    await page.waitForTimeout(1200);
    w.templatesSheet = { opened: (await page.getByTestId("templates-sheet").count()) > 0, paywall: await clean(page, "paywall-title"), why: await clean(page, "paywall-why") };
    await shots.take(page, "A5-04-templates", width);
    await closeOverlay(page);

    /* 6. /paywall itself: prices (Moshe: "where are all the prices? the screen is naked"). */
    await page.goto(new URL("/paywall", h.url).href);
    await page.waitForTimeout(3500);
    w.paywall = {
      title: await clean(page, "paywall-title"),
      webTitle: await clean(page, "web-paywall-title"),
      priceNote: await clean(page, "web-price-note"),
      staysFree: await clean(page, "web-stays-free"),
      storeBlock: await clean(page, "web-store-block"),
      compare: await clean(page, "compare-table"),
      body: ((await page.locator("body").textContent()) ?? "").replace(/\s+/g, " ").slice(0, 1600),
    };
    await shots.take(page, "A5-05-paywall", width);
    w.pageErrors = obs.errors;
    await ctx.close();
  }
  out.shots = shots.taken;
} catch (e) {
  out.failure = `${e}`.slice(0, 500);
  if (dbg) await shots.take(dbg, "A5-99-failure", 1440).catch(() => {});
} finally {
  await h.close();
}
report("a5-ui", out);
