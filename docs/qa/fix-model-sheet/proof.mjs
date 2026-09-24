// usage: node proof.mjs <base-url> <tag> <outdir>
import { createRequire } from "node:module";
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
const [base, tag, out] = process.argv.slice(2);
const req = createRequire("/Users/moshecohen/.npm/_npx/9833c18b2d85bc59/node_modules/");
const pw = req("playwright-core");
const cache = "/Users/moshecohen/Library/Caches/ms-playwright";
const exe = readdirSync(cache).filter((d) => /^chromium_headless_shell-\d+$/.test(d)).sort().reverse()
  .flatMap((d) => readdirSync(path.join(cache, d)).map((s) => path.join(cache, d, s, "chrome-headless-shell"))).find((p) => existsSync(p));
mkdirSync(out, { recursive: true });
const summary = { tag, base, door: {}, sheet: {}, vault: {}, spanish: {} };
const browser = await pw.chromium.launch({ headless: true, executablePath: exe, args: ["--disable-dev-shm-usage"] });
console.log("browser pid", browser.process?.()?.pid ?? "n/a");
try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  await ctx.addInitScript(() => { if (!localStorage.getItem("inborn.prefs")) localStorage.setItem("inborn.prefs", JSON.stringify({ onboarded: true, locale: "en" })); });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log("pageerror:", e.message));
  const shot = (name) => page.screenshot({ path: `${out}/${tag}-${name}.png` });
  const recommendedIn = async (scope, prefix) => {
    const el = scope.locator(`[data-testid^="${prefix}"]`);
    const ids = await el.evaluateAll((els) => els.map((e) => e.getAttribute("data-testid")));
    return ids.map((id) => id.slice(prefix.length));
  };
  await page.goto(base + "/");
  await page.getByTestId("download-door").waitFor({ timeout: 60000 });
  for (const w of [390, 1440]) {
    await page.setViewportSize({ width: w, height: w === 390 ? 844 : 900 });
    await page.waitForTimeout(400);
    await shot(`door-${w}`);
    const text = await page.getByTestId("download-door").innerText();
    const m = /Download (\w+) to this browser/.exec(text);
    summary.door[w] = { offers: m?.[1] ?? null, recommendedLine: /RECOMMENDED FOR THIS BROWSER/i.test(text) };
  }
  console.log("door", JSON.stringify(summary.door));
  await page.setViewportSize({ width: 1440, height: 900 });
  // take the model the door does NOT recommend (Instant), as the reader in I14 did
  await page.getByTestId("web-model-options-toggle").first().click();
  await page.waitForTimeout(300);
  await page.getByTestId("web-model-choose-instant").click();
  await page.waitForTimeout(800);
  await page.getByTestId("download-model").click();
  await page.getByTestId("composer-input").waitFor({ timeout: 600000 });
  console.log("chat up, chip:", (await page.getByTestId("model-chip").innerText()).trim());
  for (const w of [390, 1440]) {
    await page.setViewportSize({ width: w, height: w === 390 ? 844 : 900 });
    await page.waitForTimeout(400);
    await page.getByTestId("model-chip").click();
    const sheet = page.getByTestId("model-sheet").last();
    await sheet.waitFor({ timeout: 10000 });
    await page.waitForTimeout(600);
    await shot(`sheet-${w}`);
    const text = await sheet.innerText();
    summary.sheet[w] = { recommended: await recommendedIn(sheet, "model-sheet-recommended-"), choose: await recommendedIn(sheet, "model-sheet-choose-"), inTheAppHeader: /IN THE APP/i.test(text), text: text.replace(/\s+/g, " ").slice(0, 900) };
    console.log(`sheet ${w}`, JSON.stringify(summary.sheet[w]));
    await sheet.getByTestId("model-sheet-manage").click();
    await page.getByTestId("vault-web-door").last().waitFor({ timeout: 10000 });
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${out}/${tag}-vault-${w}.png`, fullPage: true });
    const vault = page.getByTestId("vault-web-door").last();
    const rows = await vault.locator('[data-testid^="web-model-"]').evaluateAll((els) => els.filter((e) => /^web-model-(instant|fast|sharp)/.test(e.getAttribute("data-testid"))).map((e) => ({ id: e.getAttribute("data-testid").replace("web-model-", ""), recommended: /RECOMMENDED/i.test(e.innerText) })));
    summary.vault[w] = { recommended: rows.filter((r) => r.recommended).map((r) => r.id), rows: rows.map((r) => r.id) };
    console.log(`vault ${w}`, JSON.stringify(summary.vault[w]));
    await page.getByTestId("close-vault").last().click();
    await page.getByTestId("composer-input").waitFor({ timeout: 10000 });
    await page.waitForTimeout(400);
  }
  // F346: a Spanish turn on Instant, then the notice and the sheet
  await page.setViewportSize({ width: 390, height: 844 });
  const line = "Escríbeme una frase corta que hable de Madrid, por favor, con el nombre de una calle.";
  for (let i = 0; i < 5; i++) {
    await page.waitForTimeout(1000);
    await page.getByTestId("composer-input").click();
    await page.getByTestId("composer-input").fill(line);
    await page.waitForTimeout(800);
    if ((await page.getByTestId("composer-input").inputValue()) === line) break;
  }
  console.log("composer before send:", await page.getByTestId("composer-input").inputValue());
  await page.getByTestId("send").click({ timeout: 10000 }).catch(async () => { console.log("send click failed, pressing Enter"); await page.getByTestId("composer-input").press("Enter"); });
  await page.getByTestId("assistant-text").last().waitFor({ timeout: 180000 });
  await page.waitForFunction(() => !document.querySelector('[data-testid="stop"]'), null, { timeout: 180000 }).catch(() => {});
  await page.waitForTimeout(2000);
  await shot("spanish-chat-390");
  const notice = async (id) => ((await page.getByTestId(id).count()) ? (await page.getByTestId(id).first().innerText()).trim() : null);
  summary.spanish.weakLine = await notice("model-weak-line");
  summary.spanish.noneLine = await notice("model-none-line");
  summary.spanish.action = await notice("model-weak-action");
  await page.getByTestId("model-chip").click();
  const sheet = page.getByTestId("model-sheet").last();
  await sheet.waitFor({ timeout: 10000 });
  await page.waitForTimeout(600);
  await shot("spanish-sheet-390");
  const text = await sheet.innerText();
  summary.spanish.sheetRecommended = await recommendedIn(sheet, "model-sheet-recommended-");
  summary.spanish.sheetLine = (await sheet.getByTestId("model-sheet-recommended").count()) ? (await sheet.getByTestId("model-sheet-recommended").innerText()).trim() : null;
  summary.spanish.sheetText = text.replace(/\s+/g, " ").slice(0, 900);
  console.log("spanish", JSON.stringify(summary.spanish));
  if (tag === "after") {
    await sheet.getByTestId("model-sheet-choose-fast").click();
    await page.getByTestId("download-door").waitFor({ timeout: 60000 });
    await page.waitForTimeout(800);
    await shot("choose-door-390");
    summary.choose = { doorAfterChoose: (await page.getByTestId("download-door").innerText()).split(String.fromCharCode(10)).slice(0, 2).join(" | ") };
    await page.getByTestId("download-model").click();
    await page.getByTestId("composer-input").waitFor({ timeout: 900000 });
    await page.waitForTimeout(800);
    summary.choose.chip = (await page.getByTestId("model-chip").innerText()).trim();
    await shot("choose-chat-390");
    console.log("choose", JSON.stringify(summary.choose));
  }
} finally {
  writeFileSync(`${out}/${tag}-summary.json`, JSON.stringify(summary, null, 2));
  await browser.close();
}
