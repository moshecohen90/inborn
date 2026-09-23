/**
 * Shared harness for the round-43 acceptance walk: serves apps/web/dist the way scripts/serve-web.mjs does,
 * drives it with the installed headless shell, and writes every screenshot straight into docs/qa/acceptance/.
 */
import { URL } from "node:url";
import { createRequire } from "node:module";
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { defaults, startServer } from "/Users/moshecohen/dev/inborn-wt/acceptance/scripts/serve-web.mjs";

export const REPO = "/Users/moshecohen/dev/inborn-wt/acceptance";
export const SCRATCH = "/private/tmp/claude-501/-Users-moshecohen-dev-bibleapps/e1fec2dd-3831-49ec-a78e-d650b5c0d26b/scratchpad/acceptance";
export const DOCS = path.join(SCRATCH, "docs");
export const PORT = 8643;

export function loadPlaywright() {
  for (const dir of ["/Users/moshecohen/.npm/_npx/9833c18b2d85bc59/node_modules", "/Users/moshecohen/.npm/_npx/86170c4cd1c5da32/node_modules", "/Users/moshecohen/.npm/_npx/e41f203b7505f1fb/node_modules"]) {
    try { return createRequire(path.join(dir, "/"))("playwright-core"); } catch { /* next */ }
  }
  throw new Error("playwright-core not found");
}

export function findChromium(chromium) {
  const wanted = chromium.executablePath();
  if (existsSync(wanted)) return wanted;
  const cache = /^(.*)\/chromium[^/]*-\d+\//.exec(wanted)?.[1];
  const shells = readdirSync(cache).filter((d) => /^chromium_headless_shell-\d+$/.test(d)).sort().reverse();
  return shells.flatMap((d) => readdirSync(path.join(cache, d)).map((s) => path.join(cache, d, s, "chrome-headless-shell"))).find((p) => existsSync(p));
}

export function observe(page) {
  const console_ = [], errors = [], hosts = new Set();
  page.on("console", (m) => console_.push(`${m.type()}: ${m.text()}`));
  page.on("pageerror", (e) => { console_.push(`pageerror: ${e.message}`); errors.push(e.message); });
  page.on("request", (r) => { try { hosts.add(new URL(r.url()).host); } catch { /* blob */ } });
  return { console: console_, errors, hosts };
}

export async function waitConsole(lines, re, ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const hit = lines.map((l) => re.exec(l)).find(Boolean);
    if (hit) return hit;
    await new Promise((r) => setTimeout(r, 100));
  }
  return null;
}

/** A shot goes to docs/qa/acceptance/<sub>/<name>-<width>.png so the report can point at it. */
export class Shots {
  constructor(sub) {
    this.dir = path.join(REPO, "docs/qa/acceptance", sub);
    mkdirSync(this.dir, { recursive: true });
    this.taken = [];
  }
  async take(page, name, width) {
    const w = width ?? page.viewportSize()?.width;
    const file = path.join(this.dir, `${name}-${w}.png`);
    await page.screenshot({ path: file, fullPage: false });
    this.taken.push(path.relative(REPO, file));
    return file;
  }
}

export const ONBOARDED = (ctx) => ctx.addInitScript(() => {
  if (!localStorage.getItem("inborn.prefs")) localStorage.setItem("inborn.prefs", JSON.stringify({ onboarded: true }));
});

export async function harness(overrides = {}) {
  const pw = loadPlaywright();
  const executablePath = findChromium(pw.chromium);
  const server = await startServer({ port: PORT, ...overrides });
  const browser = await pw.chromium.launch({ headless: true, executablePath, args: ["--force-prefers-color-scheme=light"] });
  return { pw, browser, server, url: server.url, close: async () => { await browser.close(); await server.close?.(); } };
}

export function report(name, obj) {
  const file = path.join(SCRATCH, `${name}.json`);
  writeFileSync(file, JSON.stringify(obj, null, 1));
  console.log(JSON.stringify(obj, null, 1));
  console.log(`\n-> ${file}`);
}
export { defaults };

export const UA_DESKTOP = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";

/** A context that has the model in OPFS and is past onboarding, sitting on the chat screen with the engine loaded. */
export async function bootedPage(browser, url, { width = 1440, height = 900, init } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height }, userAgent: UA_DESKTOP, deviceScaleFactor: 1 });
  if (init) await ctx.addInitScript(init);
  const page = await ctx.newPage();
  const obs = observe(page);
  await page.goto(url);
  await page.getByTestId("download-door").waitFor({ timeout: 60_000 });
  await page.getByTestId("download-model").click();
  await page.getByTestId("onboarding-welcome").waitFor({ timeout: 300_000 });
  await page.getByTestId("onboarding-continue").click();
  await page.getByTestId("onboarding-model").waitFor({ timeout: 60_000 });
  await page.getByTestId("start-chatting").click();
  const start = page.getByTestId("sealed-start");
  await start.waitFor({ timeout: 60_000 });
  for (let i = 0; i < 120 && (await start.isDisabled()); i++) await new Promise((r) => setTimeout(r, 100));
  await start.click();
  await page.getByTestId("lock-start").waitFor({ timeout: 60_000 });
  await page.getByTestId("lock-start").click();
  await page.getByTestId("composer-input").waitFor({ timeout: 300_000 });
  await waitConsole(obs.console, /\[inborn\] (\w+) loaded .* in (\d+) ms/, 300_000);
  return { ctx, page, obs };
}

export const clean = async (page, id) => {
  const el = page.getByTestId(id).first();
  return (await el.count()) ? ((await el.textContent()) ?? "").replace(/\s+/g, " ").trim() : null;
};
