// Fresh profile: door (instant) + onboarding, then one chat answered from an attached file by words (for Citations).
import { fileURLToPath } from "node:url";
import { persistent, BASE, observe, sleep, has } from "./lib.mjs";
const ctx = await persistent(process.env.PROFILE, { viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage(); const L = observe(page);
await page.goto(BASE);
if (await has(page, "download-door", 30000)) {
  if (!(await page.getByTestId("web-model-choose-instant").count())) { await page.getByTestId("web-model-options-toggle").click().catch(() => {}); await sleep(400); }
  if (await page.getByTestId("web-model-choose-instant").count()) { await page.getByTestId("web-model-choose-instant").click(); await sleep(1500); }
  await page.getByTestId("download-model").click();
}
await page.getByTestId("onboarding-welcome").waitFor({ timeout: 300000 });
await page.getByTestId("onboarding-continue").click();
await page.getByTestId("start-chatting").click();
const s = page.getByTestId("sealed-start"); await s.waitFor();
for (let i = 0; i < 100 && (await s.isDisabled()); i++) await sleep(100);
await s.click(); await page.getByTestId("lock-start").click();
await page.getByTestId("composer-input").waitFor({ timeout: 300000 });
for (let i = 0; i < 600 && !L.some((l) => /wllama loaded model/.test(l)); i++) await sleep(100);
await page.getByTestId("attach").click();
const [chooser] = await Promise.all([page.waitForEvent("filechooser"), page.getByTestId("attach-import").click()]);
await chooser.setFiles(fileURLToPath(import.meta.resolve("../../../scripts/fixtures/attach/greenhouse-notes.txt")));
await page.getByTestId("attached-docs").waitFor({ timeout: 30000 });
await page.getByTestId("composer-input").fill("What is this file about? Quote one sentence from it.");
await page.getByTestId("send").click();
if (await has(page, "docs-hold", 10000)) await page.getByTestId("docs-hold-words").click();
await page.getByTestId("citations").last().waitFor({ timeout: 300000 });
await page.getByTestId("ledger-toggle").last().waitFor({ timeout: 300000 });
console.log("ready", await page.getByTestId("citations").last().textContent());
await ctx.close();
