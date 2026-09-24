/* Walks a web export's first run (door → download → onboarding → chat → one prompt) and records what the console,
   the failed requests and the DOM say about the icons. DIST=<export> VARIANT=<name> node probe.mjs */
import { createRequire } from "node:module";
import { existsSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { URL, fileURLToPath } from "node:url";
import { startServer } from "../../../scripts/serve-web.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const VARIANT = process.env.VARIANT ?? "after";
const pw = createRequire(path.join(process.env.PLAYWRIGHT_CORE_DIR ?? "/Users/moshecohen/.npm/_npx/9833c18b2d85bc59/node_modules", "/"))("playwright-core");
const cache = path.join(process.env.HOME, "Library/Caches/ms-playwright");
const shellDir = readdirSync(cache).filter((d) => /^chromium_headless_shell-\d+$/.test(d)).sort().reverse()[0];
const exe = readdirSync(path.join(cache, shellDir)).map((s) => path.join(cache, shellDir, s, "chrome-headless-shell")).find(existsSync);
const server = await startServer({ port: 0, dist: process.env.DIST });
const browser = await pw.chromium.launch({ headless: true, executablePath: exe });
const out = { variant: VARIANT, dist: process.env.DIST, console: [], failed: [] };
try {
  const page = await (await browser.newContext({ viewport: { width: 1180, height: 800 } })).newPage();
  page.on("console", (m) => out.console.push(`${m.type()}: ${m.text()}`));
  page.on("pageerror", (e) => out.console.push(`pageerror: ${e.message}`));
  page.on("response", (r) => { if (r.status() >= 400) out.failed.push({ status: r.status(), method: r.request().method(), url: new URL(r.url()).pathname, initiator: r.request().resourceType() }); });
  await page.goto(server.url);
  await page.getByTestId("download-door").waitFor({ timeout: 60_000 });
  await page.getByTestId("download-model").click();
  await page.getByTestId("onboarding-welcome").waitFor({ timeout: 300_000 });
  await page.getByTestId("onboarding-continue").click();
  await page.getByTestId("start-chatting").click();
  const start = page.getByTestId("sealed-start");
  await start.waitFor({ timeout: 60_000 });
  for (let i = 0; i < 120 && (await start.isDisabled()); i++) await page.waitForTimeout(100);
  await start.click();
  await page.getByTestId("lock-start").click();
  await page.getByTestId("composer-input").waitFor({ timeout: 300_000 });
  await page.getByTestId("composer-input").fill("What is the capital of France? Answer in one sentence.");
  await page.getByTestId("send").click();
  await page.getByTestId("ledger-toggle").last().waitFor({ timeout: 180_000 });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(1500);
  out.dom = await page.evaluate(() => {
    const svgs = [...document.querySelectorAll("svg")];
    const attrs = (el) => Object.fromEntries([...el.attributes].filter((a) => /aria|access|important|collapsable/i.test(a.name)).map((a) => [a.name, a.value]));
    return {
      svgCount: svgs.length,
      svgAriaHidden: svgs.filter((s) => s.getAttribute("aria-hidden") === "true").length,
      leakedAttributes: [...document.querySelectorAll("[importantforaccessibility],[accessibilityelementshidden],[collapsable]")].map((e) => ({ tag: e.tagName, ...attrs(e) })),
      composerIcons: ["attach", "mic", "send"].map((id) => ({ id, svg: [...document.querySelectorAll(`[data-testid="${id}"] svg`)].map(attrs) })),
      liveRegions: [...document.querySelectorAll("[aria-live]")].map((e) => ({ testid: e.getAttribute("data-testid"), live: e.getAttribute("aria-live") })),
    };
  });
  await page.screenshot({ path: path.join(HERE, `${VARIANT}-chat-390.png`) });
} catch (e) {
  out.error = String(e);
} finally {
  writeFileSync(path.join(HERE, `${VARIANT}.json`), JSON.stringify(out, null, 1));
  await browser.close();
  server.close();
}
console.log(JSON.stringify({ variant: VARIANT, error: out.error, dom: out.dom, failed: out.failed, react: out.console.filter((l) => /React|Received `|deprecated|Warning/.test(l)).length }, null, 1));
