import { createRequire } from "node:module";
import { existsSync, readdirSync, appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
/* OUT holds profiles/, shots/, drive/ results and checks.jsonl; BASE is a `pn web:serve` host with a model in MODELS_DIR. */
export const P = process.env.OUT ?? path.join(process.cwd(), "r102-out");
mkdirSync(path.join(P, "drive"), { recursive: true });
mkdirSync(path.join(P, "shots"), { recursive: true });
export const BASE = process.env.BASE ?? "http://127.0.0.1:8761";
export const SHOTS = path.join(P, "shots");
const pw = createRequire((process.env.PLAYWRIGHT_CORE_DIR ?? "/Users/moshecohen/.npm/_npx/9833c18b2d85bc59/node_modules") + "/")("playwright-core");
export const chromium = pw.chromium;
export function chromiumPath() {
  const wanted = chromium.executablePath();
  if (existsSync(wanted)) return wanted;
  const cache = /^(.*)\/chromium[^/]*-\d+\//.exec(wanted)?.[1];
  const shells = readdirSync(cache).filter((d) => /^chromium_headless_shell-\d+$/.test(d)).sort().reverse();
  return shells.flatMap((d) => readdirSync(path.join(cache, d)).map((s) => path.join(cache, d, s, "chrome-headless-shell"))).find((p) => existsSync(p));
}
export async function persistent(profile, opts = {}) {
  const dir = path.join(P, "profiles", profile);
  mkdirSync(dir, { recursive: true });
  return chromium.launchPersistentContext(dir, { headless: true, executablePath: chromiumPath(), viewport: { width: 1440, height: 900 }, ...opts });
}
export function observe(page) {
  const lines = [];
  page.on("console", (m) => lines.push(`${m.type()}: ${m.text()}`));
  page.on("pageerror", (e) => lines.push(`pageerror: ${e.message}`));
  page.on("requestfailed", (r) => lines.push(`reqfail: ${r.url()} ${r.failure()?.errorText}`));
  page.on("response", (r) => { if (r.status() >= 400) lines.push(`http${r.status()}: ${r.url()}`); });
  return lines;
}
const LOG = path.join(P, "checks.jsonl");
export function check(id, claim, verdict, evidence) {
  const row = { id, claim, verdict, evidence, at: new Date().toISOString() };
  appendFileSync(LOG, JSON.stringify(row) + "\n");
  console.log(`${verdict}\t${id}\t${claim}\t${evidence}`);
}
export async function shot(page, name, full = true) {
  const f = path.join(SHOTS, `${name}.png`);
  await page.screenshot({ path: f, fullPage: full }).catch((e) => console.log("shot fail", name, e.message));
  return f;
}
export const tid = (page, id) => page.getByTestId(id);
export async function has(page, id, timeout = 3000) {
  return page.getByTestId(id).first().waitFor({ timeout }).then(() => true, () => false);
}
export async function text(page, id) {
  return ((await page.getByTestId(id).first().textContent({ timeout: 3000 }).catch(() => null)) ?? "").trim();
}
export async function hscroll(page) {
  return page.evaluate(() => ({ sw: document.scrollingElement.scrollWidth, cw: document.scrollingElement.clientWidth }));
}
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const errs = (lines) => lines.filter((l) => /^(error|pageerror)/.test(l));
export const REACT_WARNING_RE = /React does not recognize the|for a non-boolean attribute|Invalid DOM property|Invalid value for prop|Unknown event handler property|is using incorrect casing|unique "key" prop|Cannot update a component|cannot be a child of|cannot contain a nested|React Components must start with an uppercase|Warning:/;
export function dump(name, obj) { writeFileSync(path.join(P, "drive", name), JSON.stringify(obj, null, 2)); }
