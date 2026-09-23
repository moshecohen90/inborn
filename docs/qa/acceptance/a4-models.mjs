/** Moshe: "how do I change model? apart from Instant I saw no other models". What the browser tier shows and says. */
import { URL } from "node:url";
import { harness, bootedPage, Shots, report, clean } from "./acc-lib.mjs";

const shots = new Shots("web");
const h = await harness();
const out = { url: h.url, widths: {} };
let dbg = null;
try {
  for (const width of [390, 1440]) {
    const { page, obs, ctx } = await bootedPage(h.browser, h.url, { width });
    dbg = page;
    const w = (out.widths[width] = {});
    w.chip = await clean(page, "model-chip");
    await shots.take(page, "A4-00-chat", width);

    /* The chip is the way in (F150). */
    await page.getByTestId("model-chip").click();
    await page.getByTestId("model-sheet").waitFor({ timeout: 15_000 });
    await shots.take(page, "A4-01-model-sheet", width);
    w.sheet = await clean(page, "model-sheet");
    w.recommended = await clean(page, "model-sheet-recommended");
    w.managed = await clean(page, "model-sheet-managed");
    w.rows = await page.getByTestId("model-sheet").locator('[data-testid^="model-row-"]').allTextContents();
    w.names = (await page.getByTestId("model-sheet").allTextContents()).join(" ").replace(/\s+/g, " ");
    w.mentions = Object.fromEntries(["Instant", "Fast", "Sharp", "Phi"].map((n) => [n, w.names.includes(n)]));
    w.manageLink = await clean(page, "model-sheet-manage");
    await page.locator('button[aria-label="Close"]').last().click({ position: { x: 6, y: 6 } }).catch(() => {});
    await page.waitForTimeout(500);

    /* The vault behind "Manage models": on the web it is a door (spec §8.4). */
    await page.goto(new URL("/vault", h.url).href);
    await page.waitForTimeout(3000);
    w.vaultDoor = await clean(page, "vault-web-door");
    w.vaultStatus = await clean(page, "vault-web-status");
    w.vaultBody = ((await page.locator("body").textContent()) ?? "").replace(/\s+/g, " ").slice(0, 1200);
    await shots.take(page, "A4-02-vault", width);

    /* Settings → Model row: the other route Moshe looked for. */
    await page.goto(new URL("/settings", h.url).href);
    await page.waitForTimeout(2500);
    w.settingsBody = ((await page.locator("body").textContent()) ?? "").replace(/\s+/g, " ").slice(0, 900);
    await shots.take(page, "A4-03-settings", width);
    w.pageErrors = obs.errors;
    await ctx.close();
  }
  out.shots = shots.taken;
} catch (e) {
  out.failure = `${e}`.slice(0, 500);
  if (dbg) await shots.take(dbg, "A4-99-failure", 1440).catch(() => {});
} finally {
  await h.close();
}
report("a4-models", out);
