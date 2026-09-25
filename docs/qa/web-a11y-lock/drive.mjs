// R95 proof: F381 lock inert, F382 message actions by keyboard, F383 row actions, F384 <html lang>.
// DIST=<web dist> OUT=<dir> LABEL=red|green node drive.mjs
import { createRequire } from "node:module";
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
const WT = "/Users/moshecohen/dev/inborn-wt/web-a11y-lock";
process.env.MODELS_DIR ??= "/Users/moshecohen/dev/inborn/.models";
const { startServer } = await import(WT + "/scripts/serve-web.mjs");
const pw = createRequire("/Users/moshecohen/.npm/_npx/9833c18b2d85bc59/node_modules/")("playwright-core");
const OUT = process.env.OUT; const LABEL = process.env.LABEL ?? "run"; const DIST = process.env.DIST;
mkdirSync(OUT, { recursive: true });
function chromiumPath() {
  const wanted = pw.chromium.executablePath();
  if (existsSync(wanted)) return wanted;
  const cache = /^(.*)\/chromium[^/]*-\d+\//.exec(wanted)?.[1];
  const shells = readdirSync(cache).filter((d) => /^chromium_headless_shell-\d+$/.test(d)).sort().reverse();
  return shells.flatMap((d) => readdirSync(path.join(cache, d)).map((s) => path.join(cache, d, s, "chrome-headless-shell"))).find((p) => existsSync(p));
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const server = await startServer({ port: 0, dist: DIST });
const browser = await pw.chromium.launch({ headless: true, executablePath: chromiumPath() });
const R = { label: LABEL, dist: DIST, verdict: {} };
const lines = [];
const shot = (page, n) => page.screenshot({ path: path.join(OUT, `${LABEL}-${n}.png`) });
const active = (page) => page.evaluate(() => {
  const a = document.activeElement;
  const tid = a?.closest("[data-testid]")?.getAttribute("data-testid") ?? a?.tagName;
  const inLock = !!a?.closest('[data-testid="lock-screen"]');
  const inModal = !!a?.closest('[aria-modal="true"]');
  const modalId = a?.closest('[aria-modal="true"]')?.querySelector("[data-testid]")?.getAttribute("data-testid") ?? null;
  return { tid, own: a?.getAttribute("data-testid") ?? null, inLock, inModal, modalId, label: (a?.getAttribute("aria-label") ?? a?.textContent ?? "").trim().slice(0, 30) };
});
const visible = (page, id, t = 1500) => page.getByTestId(id).first().waitFor({ state: "visible", timeout: t }).then(() => true, () => false);
try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  page.on("console", (m) => lines.push(`${m.type()}: ${m.text()}`));
  page.on("pageerror", (e) => lines.push(`pageerror: ${e.message}`));
  await page.goto(server.url);
  await page.getByTestId("download-door").waitFor({ timeout: 60_000 });
  await page.getByTestId("download-model").click();
  await page.getByTestId("onboarding-welcome").waitFor({ timeout: 300_000 });
  await page.getByTestId("onboarding-continue").click();
  await page.getByTestId("start-chatting").click();
  const start = page.getByTestId("sealed-start");
  await start.waitFor({ timeout: 60_000 });
  for (let i = 0; i < 100 && (await start.isDisabled()); i++) await sleep(100);
  await start.click();
  await page.getByTestId("lock-start").click();
  await page.getByTestId("composer-input").waitFor({ timeout: 300_000 });
  for (let i = 0; i < 600 && !lines.some((l) => /\[inborn\] \w+ loaded/.test(l)); i++) await sleep(200);
  await page.getByTestId("composer-input").fill("What is the capital of France? Answer in one sentence.");
  await page.getByTestId("send").click();
  await page.getByTestId("ledger-toggle").last().waitFor({ timeout: 180_000 });
  R.answer = ((await page.getByTestId("assistant-text").last().textContent()) ?? "").trim();
  R.chatTitle = await page.locator('[data-testid^="chat-row-"]').first().textContent().catch(() => null);

  /* F382: keyboard and right-click open the message actions; the sheet traps focus; Esc closes it back onto the answer. */
  R.f382 = {};
  const answer = page.getByTestId("assistant-message").last();
  for (const [name, act] of [
    ["Enter", () => page.keyboard.press("Enter")],
    ["Space", () => page.keyboard.press("Space")],
    ["ContextMenu", () => page.keyboard.press("ContextMenu")],
    ["Shift+F10", () => page.keyboard.press("Shift+F10")],
    ["right-click", () => answer.click({ button: "right", position: { x: 20, y: 10 } })],
  ]) {
    await answer.focus();
    const focused = await active(page);
    await act();
    const opened = await visible(page, "message-actions");
    const row = { focused: focused.own, opened };
    if (opened) {
      for (let i = 0; i < 20 && !(await active(page)).inModal; i++) await sleep(100);
      row.focusIn = (await active(page)).own;
      if (name === "Enter") await shot(page, "F382-actions-open");
      const stops = [];
      for (let i = 0; i < 12; i++) { await page.keyboard.press("Tab"); stops.push(await active(page)); }
      row.trapped = stops.every((s) => s.inModal);
      row.stops = [...new Set(stops.map((s) => s.own ?? s.tid))];
      await page.keyboard.press("Escape");
      row.closedByEsc = await page.getByTestId("message-actions").waitFor({ state: "detached", timeout: 3000 }).then(() => true, () => false);
      await sleep(300);
      row.focusBack = (await active(page)).own;
    }
    R.f382[name] = row;
  }
  R.verdict.F382 = Object.values(R.f382).every((r) => r.opened && r.trapped && r.closedByEsc && r.focusBack === "assistant-message") ? "PASS" : "FAIL";

  /* F383: the sidebar's tab order carries no invisible swipe buttons; a visible row menu gives Pin / Archive / Delete. */
  R.f383 = {};
  await page.goto(server.url + "/");
  await page.getByTestId("composer-input").waitFor({ timeout: 60_000 });
  await page.locator("body").focus();
  await page.evaluate(() => document.activeElement?.blur());
  const seq = [];
  for (let i = 0; i < 20; i++) { await page.keyboard.press("Tab"); const a = await active(page); seq.push(a.own ?? a.tid); }
  R.f383.tabSeq = seq;
  R.f383.swipeStops = seq.filter((s) => /^swipe-/.test(s ?? ""));
  const more = page.locator('[data-testid^="chat-more-"]').first();
  R.f383.moreInTabOrder = seq.some((s) => /^chat-more-/.test(s ?? ""));
  if ((await more.count()) > 0) {
    R.f383.moreVisible = await more.isVisible();
    R.f383.moreLabel = await more.getAttribute("aria-label");
    await more.focus();
    await shot(page, "F383-row-more-focused");
    await page.keyboard.press("Enter");
    R.f383.menuOpened = await visible(page, "menu-delete");
    for (let i = 0; i < 20 && !(await active(page)).inModal; i++) await sleep(100);
    R.f383.focusIn = (await active(page)).own;
    R.f383.menuItems = await page.locator('[data-testid^="menu-"]').evaluateAll((els) => els.map((e) => e.getAttribute("data-testid")));
    await shot(page, "F383-row-menu");
    await page.keyboard.press("Escape");
    R.f383.menuClosed = await page.getByTestId("menu-delete").waitFor({ state: "detached", timeout: 3000 }).then(() => true, () => false);
    R.f383.focusBack = (await active(page)).own;
  }
  R.verdict.F383 = R.f383.swipeStops.length === 0 && R.f383.moreInTabOrder && R.f383.moreVisible && R.f383.menuOpened && ["menu-pin", "menu-archive", "menu-delete"].every((m) => R.f383.menuItems?.includes(m)) ? "PASS" : "FAIL";

  /* F384: <html lang> follows the language on load and on a live switch. */
  R.f384 = { onLoad: {}, onSwitch: {} };
  for (const loc of ["en", "de", "fr", "es", "pt-BR", "ja", "ko", "zh-Hant", "pseudo"]) {
    await page.evaluate((l) => { const p = JSON.parse(localStorage.getItem("inborn.prefs") ?? "{}"); localStorage.setItem("inborn.prefs", JSON.stringify({ ...p, locale: l })); }, loc);
    await page.goto(server.url + "/settings");
    await page.getByTestId("row-lock").waitFor({ timeout: 60_000 });
    R.f384.onLoad[loc] = await page.evaluate(() => ({ lang: document.documentElement.lang, dir: document.documentElement.dir }));
  }
  await page.evaluate(() => { const p = JSON.parse(localStorage.getItem("inborn.prefs") ?? "{}"); localStorage.setItem("inborn.prefs", JSON.stringify({ ...p, locale: "en" })); });
  await page.goto(server.url + "/settings/language");
  for (const loc of ["ja", "de", "en"]) {
    await page.getByTestId(`lang-${loc}`).click();
    await sleep(400);
    R.f384.onSwitch[loc] = await page.evaluate(() => ({ lang: document.documentElement.lang, dir: document.documentElement.dir }));
  }
  const expect = { en: "en", de: "de", fr: "fr", es: "es", "pt-BR": "pt-BR", ja: "ja", ko: "ko", "zh-Hant": "zh-Hant", pseudo: "en-XA" };
  R.verdict.F384 = Object.entries(R.f384.onLoad).every(([l, v]) => v.lang === expect[l] && v.dir === "ltr") && Object.entries(R.f384.onSwitch).every(([l, v]) => v.lang === expect[l]) ? "PASS" : "FAIL";

  /* F381: turn the passcode lock on, reload, and walk the locked page with the keyboard and the accessibility tree. */
  R.f381 = {};
  await page.goto(server.url + "/settings");
  await page.getByTestId("row-lock").getByRole("switch").click();
  for (let i = 0; i < 2; i++) {
    await page.getByTestId("passcode-input").fill("2468");
    await page.getByTestId("passcode-submit").click();
    await sleep(400);
  }
  R.f381.enabled = await page.evaluate(() => JSON.parse(localStorage.getItem("inborn.prefs") ?? "{}").lock?.enabled);
  await page.goto(server.url + "/");
  await page.getByTestId("lock-screen").waitFor({ timeout: 60_000 });
  await sleep(1500);
  const title = (R.chatTitle ?? "").replace(/\d{1,2}:\d{2}.*$/, "").trim().slice(0, 20) || "capital of France";
  R.f381.titleProbe = title;
  R.f381.ariaWithSheet = await page.locator("body").ariaSnapshot();
  await shot(page, "F381-locked-sheet");
  /* The sheet: Tab stays inside it. */
  const sheetStops = [];
  for (let i = 0; i < 8; i++) { await page.keyboard.press("Tab"); sheetStops.push(await active(page)); }
  R.f381.sheetTrapped = sheetStops.every((s) => s.inModal);
  await page.keyboard.press("Escape");
  await sleep(500);
  R.f381.sheetClosed = (await page.getByTestId("passcode-input").count()) === 0;
  R.f381.ariaLocked = await page.locator("body").ariaSnapshot();
  const lockStops = [];
  for (let i = 0; i < 30; i++) { await page.keyboard.press("Tab"); lockStops.push(await active(page)); }
  R.f381.lockStops = [...new Set(lockStops.map((s) => `${s.own ?? s.tid}${s.inLock ? "" : " (OUTSIDE)"}`))];
  R.f381.escaped = lockStops.filter((s) => !s.inLock && s.tid !== "BODY" && s.tid !== "HTML");
  /* The shortcuts must not reach the app behind the lock either (the palette lists every chat title). */
  await page.keyboard.press("Control+k");
  await sleep(400);
  R.f381.paletteWhileLocked = (await page.getByTestId("palette-input").count()) > 0;
  if (R.f381.paletteWhileLocked) await page.keyboard.press("Escape");
  R.f381.enterOnEveryStop = [];
  for (const s of lockStops.filter((x) => !x.inLock && /^chat-row-/.test(x.own ?? ""))) {
    await page.getByTestId(s.own).focus().catch(() => {});
    await page.keyboard.press("Enter");
  }
  await sleep(800);
  R.f381.answersInDom = await page.getByTestId("assistant-message").count();
  R.f381.answerTextInDom = R.answer ? await page.evaluate((a) => document.body.textContent.includes(a.slice(0, 25)), R.answer) : null;
  R.f381.titleInAria = R.f381.ariaLocked.includes(title) || R.f381.ariaWithSheet.includes(title);
  await shot(page, "F381-locked-after-walk");
  /* Unlock: the app comes back whole, focusable again. */
  await page.getByTestId("unlock-passcode").click();
  await page.getByTestId("passcode-input").fill("2468");
  await page.getByTestId("passcode-submit").click();
  await page.getByTestId("lock-screen").waitFor({ state: "detached", timeout: 10_000 });
  await sleep(500);
  R.f381.inertLeftAfterUnlock = await page.evaluate(() => document.querySelectorAll("[inert]").length);
  R.f381.ariaAfterUnlockHasTitle = (await page.locator("body").ariaSnapshot()).includes(title);
  const after = [];
  await page.evaluate(() => document.activeElement?.blur());
  for (let i = 0; i < 12; i++) { await page.keyboard.press("Tab"); after.push((await active(page)).own); }
  R.f381.afterUnlockStops = after;
  await shot(page, "F381-unlocked");
  R.verdict.F381 = R.f381.enabled && R.f381.sheetTrapped && R.f381.escaped.length === 0 && !R.f381.titleInAria && !R.f381.paletteWhileLocked && R.f381.answersInDom === 0 && R.f381.inertLeftAfterUnlock === 0 && R.f381.ariaAfterUnlockHasTitle && after.some((s) => /^chat-row-/.test(s ?? "")) ? "PASS" : "FAIL";
  R.pageErrors = lines.filter((l) => /^pageerror/.test(l));
  await ctx.close();
} catch (e) {
  R.error = String(e?.stack ?? e);
} finally {
  await browser.close();
  await server.close();
}
writeFileSync(path.join(OUT, `${LABEL}-result.json`), JSON.stringify(R, null, 2));
console.log(JSON.stringify({ verdict: R.verdict, error: R.error ?? null }, null, 1));
