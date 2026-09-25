// F402: a file answered mid re-index; the notice must follow the library once indexing finishes.
import { fileURLToPath } from "node:url";
import { persistent, BASE, observe, check, sleep, dump, shot, has } from "./lib.mjs";
const TAG = process.env.TAG ?? "after";
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
const out = { tag: TAG };
if (await has(page, "docs-hold", 10000)) await page.getByTestId("docs-hold-download").click();
const note = async () => ({ reindexing: ((await page.getByTestId("reindexing").textContent({ timeout: 500 }).catch(() => "")) ?? "").trim(), reindexed: ((await page.getByTestId("reindexed").textContent({ timeout: 500 }).catch(() => "")) ?? "").trim() });
/* The pending line shows while the answer streams; catch it, and the moment it turns into "finished". */
out.timeline = [];
const t0 = Date.now();
for (let i = 0; i < 6000; i++) {
  const n = await note();
  const state = n.reindexing ? "pending" : n.reindexed ? "done" : "none";
  if (state !== (out.timeline.at(-1)?.state ?? "none")) {
    out.timeline.push({ ms: Date.now() - t0, state, text: n.reindexing || n.reindexed, indexed: L.some((l) => /\[documents\] greenhouse-notes\.txt: indexed ·/.test(l)) });
    await shot(page, `F402-${TAG}-0-${state}`, false);
  }
  if ((await page.getByTestId("ledger-toggle").count()) && L.some((l) => /\[documents\] greenhouse-notes\.txt: indexed ·/.test(l)) && Date.now() - t0 > 2000) break;
  await sleep(100);
}
await page.getByTestId("ledger-toggle").last().waitFor({ timeout: 600000 });
out.ragLine = L.find((l) => /\[rag\]/.test(l)) ?? null;
out.atAnswer = await note(); out.indexedAtAnswer = L.some((l) => /\[documents\] greenhouse-notes\.txt: indexed ·/.test(l));
await shot(page, `F402-${TAG}-1-at-answer`, false);
for (let i = 0; i < 1200 && !L.some((l) => /\[documents\] greenhouse-notes\.txt: indexed ·/.test(l)); i++) await sleep(250);
out.indexedLine = L.find((l) => /\[documents\] greenhouse-notes\.txt: indexed ·/.test(l)) ?? null;
await sleep(1500);
out.afterIndexed = await note();
await shot(page, `F402-${TAG}-2-after-indexed`, false);
const answers = await page.getByTestId("ledger-toggle").count();
await page.getByTestId("composer-input").fill("When does the irrigation run?");
await page.getByTestId("send").click();
for (let i = 0; i < 1500 && (await page.getByTestId("ledger-toggle").count()) <= answers; i++) await sleep(200);
out.nextRagLine = L.filter((l) => /\[rag\]/.test(l)).at(-1) ?? null;
out.afterNext = await note();
await shot(page, `F402-${TAG}-3-next-answer`, false);
const ok = out.timeline.some((t) => t.state === "pending" && !t.indexed) && !!out.indexedLine && !out.afterIndexed.reindexing && !!out.afterIndexed.reindexed && !out.afterNext.reindexing && !out.afterNext.reindexed && !/reindexing=/.test(out.nextRagLine ?? "reindexing=");
check(`R102-F402-${TAG}`, "the re-indexing line clears when indexing finishes, says so once, and the next answer uses the index", ok ? "PASS" : "FAIL", JSON.stringify(out));
dump(`REINDEX-${TAG}.json`, out); await ctx.close();
