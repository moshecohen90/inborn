/** .ini items 1-2: onboarding at every width — button stretch, model choice before any download, Wi-Fi wording, airplane placement. */
import { harness, observe, Shots, report, waitConsole } from "./acc-lib.mjs";

const WIDTHS = [390, 768, 1024, 1440];
const UA_DESKTOP = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";
const shots = new Shots("web");
const h = await harness();
const out = { url: h.url, widths: {} };

/** Box of a testID relative to the viewport, plus the fraction of the width it eats (Moshe: "a very very long button"). */
async function box(page, id) {
  const el = page.getByTestId(id).first();
  if (!(await el.count())) return null;
  const b = await el.boundingBox();
  if (!b) return null;
  const vw = page.viewportSize().width;
  return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height), pctOfViewport: Math.round((b.width / vw) * 100) };
}
const txt = async (page, id) => {
  const el = page.getByTestId(id).first();
  return (await el.count()) ? ((await el.textContent()) ?? "").replace(/\s+/g, " ").trim() : null;
};

try {
  for (const width of WIDTHS) {
    const ctx = await h.browser.newContext({ viewport: { width, height: 900 }, userAgent: UA_DESKTOP, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    const obs = observe(page);
    const w = (out.widths[width] = { steps: [] });
    await page.goto(h.url);

    /* The download door comes first on a fresh profile: the browser tier has no bundled model. */
    await page.getByTestId("download-door").waitFor({ timeout: 60_000 });
    w.door = { strip: await txt(page, "web-strip"), text: await txt(page, "download-door"), button: await box(page, "download-model"), wifiOnlyOnDoor: (await page.getByTestId("wifi-only").count()) > 0 };
    await shots.take(page, "A1-00-door", width);
    await page.getByTestId("download-model").click();
    await page.getByTestId("download-progress").waitFor({ timeout: 120_000 });
    await shots.take(page, "A1-01-downloading", width);
    /* The door reloads once the GGUF is in OPFS. */
    await page.getByTestId("onboarding-welcome").waitFor({ timeout: 300_000 });

    w.welcome = { text: await txt(page, "onboarding-welcome"), button: await box(page, "onboarding-continue") };
    await shots.take(page, "A1-02-welcome", width);
    await page.getByTestId("onboarding-continue").click();

    await page.getByTestId("onboarding-model").waitFor({ timeout: 60_000 });
    w.model = {
      text: await txt(page, "onboarding-model"),
      options: await txt(page, "model-options"),
      offersFast: (await page.getByTestId("model-option-fast").count()) > 0,
      wifiOnly: (await page.getByTestId("wifi-only").count()) > 0,
      wifiOnlyText: await txt(page, "wifi-only"),
      wifiOnlyBlock: await txt(page, "wifi-only-block"),
      airplaneMentioned: /airplane|Airplane/.test((await txt(page, "onboarding-model")) ?? ""),
      button: await box(page, "start-chatting"),
    };
    await shots.take(page, "A1-03-model", width);
    await page.getByTestId("start-chatting").click();

    await page.getByTestId("onboarding-sealed").waitFor({ timeout: 60_000 });
    const start = page.getByTestId("sealed-start");
    await start.waitFor({ timeout: 30_000 });
    for (let i = 0; i < 120 && (await start.isDisabled()); i++) await new Promise((r) => setTimeout(r, 100));
    w.sealed = {
      text: await txt(page, "onboarding-sealed"),
      label: await txt(page, "sealed-label"),
      prove: await txt(page, "sealed-prove"),
      proveIsAirplane: /airplane|Airplane|flight/.test((await txt(page, "sealed-prove")) ?? ""),
      button: await box(page, "sealed-start"),
    };
    await shots.take(page, "A1-04-sealed", width);
    await start.click();

    await page.getByTestId("onboarding-lock").waitFor({ timeout: 60_000 });
    w.lock = { text: await txt(page, "onboarding-lock"), button: await box(page, "lock-start"), switch: (await page.getByTestId("lock-switch").count()) > 0 };
    await shots.take(page, "A1-05-lock", width);
    await page.getByTestId("lock-start").click();

    await page.getByTestId("composer-input").waitFor({ timeout: 300_000 });
    const engine = await waitConsole(obs.console, /\[inborn\] (\w+) loaded .* in (\d+) ms/, 300_000);
    w.chat = { engine: engine?.[1] ?? null, loadMs: engine ? Number(engine[2]) : null };
    await shots.take(page, "A1-06-chat", width);
    w.pageErrors = obs.errors;
    /* Keep the storage for the later phases: only the 1440 context is reused, the others are closed. */
    if (width === 1440) out.keep = { done: true };
    await page.close();
    await ctx.close();
  }
  out.shots = shots.taken;
} catch (e) {
  out.failure = `${e}`;
} finally {
  await h.close();
}
report("a1-onboarding", out);
