/* Round 100 red/green driver: F395 footer fit + chip focus, F396 early Esc, F397 lock seal by keyboard, F398 export closes + confirms.
   REPO=worktree PLAYWRIGHT_CORE_DIR=… CHROMIUM_PATH=… PROFILE=dir OUT=dir TAG=before|after [WIDTHS=390,768,1180,1440,1920] [ONLY=footer,esc,lock,export] */
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
const WT = process.env.REPO;
const { startServer } = await import(WT + "/scripts/serve-web.mjs");
const pw = createRequire(process.env.PLAYWRIGHT_CORE_DIR + "/")("playwright-core");
const OUT = process.env.OUT; const TAG = process.env.TAG ?? "run"; mkdirSync(OUT, { recursive: true });
const ONLY = (process.env.ONLY ?? "footer,esc,lock,export").split(",");
const WIDTHS = (process.env.WIDTHS ?? "390,768,1180,1440,1920").split(",").map(Number);
const LOCALES = ["en", "de", "fr", "es", "pt-BR", "ja", "ko", "zh-Hant", "pseudo"];
const server = await startServer({ port: Number(process.env.PORT_FIXED ?? 0) });
const ctx = await pw.chromium.launchPersistentContext(process.env.PROFILE, { executablePath: process.env.CHROMIUM_PATH, viewport: { width: 1440, height: 900 }, acceptDownloads: true });
const R = { tag: TAG, footer: {}, esc: [], lock: {}, export: [], fail: [] };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const page = await ctx.newPage();
const errs = []; page.on("pageerror", (e) => errs.push(String(e)));
const size = (w) => page.setViewportSize({ width: w, height: w < 800 ? 844 : 900 });

/* Setup: download → onboarding → one answered chat, once per profile. */
await page.goto(server.url + "/");
const first = await Promise.race([page.getByTestId("download-door").waitFor({ timeout: 60000 }).then(() => "door"), page.getByTestId("composer-input").waitFor({ timeout: 60000 }).then(() => "chat"), page.getByTestId("onboarding-welcome").waitFor({ timeout: 60000 }).then(() => "onb")]);
if (first === "door") await page.getByTestId("download-model").click();
if (first !== "chat") {
  await page.getByTestId("onboarding-welcome").waitFor({ timeout: 300000 }); await page.getByTestId("onboarding-continue").click();
  await page.getByTestId("onboarding-model").waitFor({ timeout: 60000 }); await page.getByTestId("start-chatting").click();
  const s = page.getByTestId("sealed-start"); await s.waitFor({ timeout: 30000 }); for (let i = 0; i < 100 && (await s.isDisabled()); i++) await sleep(100); await s.click();
  await page.getByTestId("lock-start").waitFor({ timeout: 30000 }); await page.getByTestId("lock-start").click();
  await page.getByTestId("composer-input").waitFor({ timeout: 300000 });
}
await sleep(1500);
if ((await page.locator('[data-testid^="chat-row-"]').count()) === 0) {
  await page.getByTestId("composer-input").fill("What is the capital of France? Answer in one sentence.");
  await page.getByTestId("send").click();
  await page.getByTestId("ledger-toggle").last().waitFor({ timeout: 300000 });
}
const setLocale = (lng) => page.evaluate((l) => { const p = JSON.parse(localStorage.getItem("inborn.prefs") ?? "{}"); if (l) p.locale = l; else delete p.locale; localStorage.setItem("inborn.prefs", JSON.stringify({ ...p, onboarded: true })); }, lng);

/* F395: every footer item inside the pane, visible at its own centre, PRO right after Folders on one row, no ellipsized label, no Tab stop that is not a control. */
if (ONLY.includes("footer")) for (const w of WIDTHS) {
  await size(w);
  for (const lng of LOCALES) {
    await setLocale(lng); await page.goto(server.url + (w < 800 ? "/chats" : "/")); await page.getByTestId("open-folders").waitFor({ timeout: 60000 }); await sleep(400);
    const f = await page.evaluate(() => {
      const el = (id) => document.querySelector(`[data-testid="${id}"]`);
      const box = (e) => { if (!e) return null; const r = e.getBoundingClientRect(); return { x: Math.round(r.x), right: Math.round(r.right), cy: Math.round(r.y + r.height / 2), w: Math.round(r.width) }; };
      const pro = el("pro-tag"); const folders = el("open-folders");
      /* The pane edge: the footer's own box when it has one, else the widest ancestor still narrower than the window. */
      let pane = folders?.parentElement; while (pane?.parentElement && pane.parentElement.getBoundingClientRect().width < document.scrollingElement.clientWidth - 1) pane = pane.parentElement;
      const clipBox = box(el("chats-footer") ?? pane ?? document.body);
      const seen = (e, edge) => { if (!e) return false; const r = e.getBoundingClientRect(); const hit = document.elementFromPoint(edge ? r.right - 2 : r.x + r.width / 2, r.y + r.height / 2); return !!hit && (e === hit || e.contains(hit)); };
      const footer = folders?.parentElement?.closest("[data-testid='chats-footer']") ?? folders?.parentElement;
      const leaves = footer ? [...footer.querySelectorAll("*")].filter((x) => !x.children.length && x.textContent.trim()) : [];
      const ellipsized = leaves.filter((x) => x.scrollWidth > x.clientWidth + 1).map((x) => x.textContent.trim());
      const tabbable = footer ? [...footer.querySelectorAll("*")].filter((x) => x.tabIndex >= 0 && !x.hasAttribute("disabled")).map((x) => x.getAttribute("data-testid") ?? x.tagName) : [];
      return { personas: box(el("open-personas")), memory: box(el("open-memory")), folders: box(folders), pro: box(pro), clip: clipBox, proSeen: seen(pro, true), foldersSeen: seen(folders), personasSeen: seen(el("open-personas")), memorySeen: seen(el("open-memory")), ellipsized, tabbable, names: ["open-personas", "open-memory", "open-folders"].map((id) => el(id)?.getAttribute("aria-label") ?? el(id)?.textContent), sw: document.scrollingElement.scrollWidth, cw: document.scrollingElement.clientWidth };
    });
    const k = `${lng}-${w}`; R.footer[k] = f;
    const bad = [];
    if (!f.pro) bad.push("no PRO");
    else {
      if (f.pro.right > f.clip.right + 1) bad.push(`PRO ends at ${f.pro.right} past the pane edge ${f.clip.right}`);
      if (!f.proSeen) bad.push("PRO not visible at its centre");
      if (f.pro.x < f.folders.x) bad.push("PRO before Folders");
      if (Math.abs(f.pro.cy - f.folders.cy) > 12) bad.push("PRO off the Folders row");
    }
    if (!f.personasSeen || !f.memorySeen || !f.foldersSeen) bad.push("a footer button is covered/clipped");
    if (Math.abs(f.personas.cy - f.folders.cy) > 2) bad.push("footer wrapped");
    if (f.ellipsized.length) bad.push(`ellipsized: ${f.ellipsized.join("|")}`);
    const extra = f.tabbable.filter((id) => !["open-personas", "open-memory", "open-folders"].includes(id));
    if (extra.length) bad.push(`Tab stops that are not the three controls: ${extra.join(",")}`);
    if (f.names.some((n) => !n || !n.trim())) bad.push("a footer button has no name");
    if (f.sw > f.cw + 1) bad.push(`page ${f.sw}px in ${f.cw}px`);
    if (bad.length) R.fail.push(`F395 ${k}: ${bad.join("; ")}`);
    if (["en", "de", "pseudo", "ja"].includes(lng) || bad.length) {
      const fb = await page.getByTestId("open-folders").boundingBox();
      await page.screenshot({ path: `${OUT}/${TAG}-footer-${k}.png`, clip: fb ? { x: 0, y: Math.max(0, fb.y - 50), width: Math.min(w, 420), height: 100 } : undefined });
    }
  }
}
await setLocale(null); await size(1440);

/* F396: Esc right after the message-actions sheet shows. */
if (ONLY.includes("esc")) {
  await page.goto(server.url + "/"); await page.getByTestId("composer-input").waitFor({ timeout: 120000 }); await sleep(1500);
  await page.locator('[data-testid^="chat-row-"]').first().click(); await page.getByTestId("assistant-message").last().waitFor({ timeout: 30000 }); await sleep(800);
  const open = () => page.getByTestId("message-actions").isVisible().catch(() => false);
  for (const d of [0, 0, 0, 0, 0, 50, 50, 50, 150, 150, 150, 600]) {
    await page.getByTestId("assistant-message").last().click({ button: "right" });
    await page.getByTestId("message-actions").waitFor({ timeout: 3000 }).catch(() => {}); if (d) await sleep(d);
    await page.keyboard.press("Escape"); await sleep(700);
    const stuck = await open(); R.esc.push({ d, stuck });
    if (stuck) { await page.keyboard.press("Escape"); await sleep(800); if (await open()) { await page.mouse.click(10, 10); await sleep(600); } }
  }
  const s = R.esc.filter((r) => r.stuck);
  if (s.length) R.fail.push(`F396: Esc ignored at delays ${s.map((r) => r.d).join(",")} of ${R.esc.length}`);
  if (await page.getByTestId("composer-input").count() === 0) R.fail.push("F396: Esc left the chat");
}

/* F398: the export sheet closes after the download and says so. */
if (ONLY.includes("export")) for (const w of [1440, 390]) {
  await size(w); await page.goto(server.url + (w < 800 ? "/chats" : "/")); await page.locator('[data-testid^="chat-more-"]').first().waitFor({ timeout: 60000 }); await sleep(800);
  for (const fmt of ["markdown", "json"]) {
    await page.locator('[data-testid^="chat-more-"]').first().click(); await page.getByTestId("menu-export").click();
    await page.getByTestId(`export-${fmt}`).waitFor({ timeout: 5000 });
    const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 15000 }).catch(() => null), page.getByTestId(`export-${fmt}`).click()]);
    await sleep(900);
    const r = { w, fmt, file: dl?.suggestedFilename() ?? null, sheetOpen: await page.getByTestId("export-sheet").isVisible().catch(() => false), toast: ((await page.getByTestId("export-toast").textContent({ timeout: 500 }).catch(() => null)) ?? "").trim() };
    await page.screenshot({ path: `${OUT}/${TAG}-export-${fmt}-${w}.png` });
    R.export.push(r);
    if (!r.file) R.fail.push(`F398 ${w} ${fmt}: no download`);
    if (r.sheetOpen) R.fail.push(`F398 ${w} ${fmt}: the sheet is still open 900 ms after the download`);
    if (!r.toast) R.fail.push(`F398 ${w} ${fmt}: no confirmation line`);
    if (r.sheetOpen) { await page.keyboard.press("Escape"); await sleep(600); }
    await sleep(3500);
  }
  await size(1440);
}

/* F397: the lock seal by keyboard: a Tab stop must do what its name says (open the wipe confirm), or not be one. */
if (ONLY.includes("lock")) {
  await page.goto(server.url + "/settings"); await page.getByTestId("row-lock").waitFor({ timeout: 60000 });
  await page.getByTestId("row-lock").getByRole("switch").click();
  for (let i = 0; i < 2; i++) { await page.getByTestId("passcode-input").fill("2468"); await page.getByTestId("passcode-submit").click(); await sleep(300); }
  await page.goto(server.url + "/"); await page.getByTestId("lock-screen").waitFor({ timeout: 60000 });
  await page.getByTestId("passcode-input").waitFor({ timeout: 10000 }); await sleep(800);
  await page.keyboard.press("Escape"); await page.getByTestId("passcode-input").waitFor({ state: "detached", timeout: 5000 }); await sleep(400);
  const L = R.lock; L.stops = [];
  let sealStop = null;
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press("Tab");
    const a = await page.evaluate(() => { const e = document.activeElement; return { id: e?.getAttribute("data-testid") ?? e?.tagName, label: e?.getAttribute("aria-label") ?? "", role: e?.getAttribute("role") ?? "", text: (e?.textContent ?? "").trim().slice(0, 30) }; });
    L.stops.push(a);
    if (!sealStop && a.id !== "unlock-passcode" && a.id !== "BODY") sealStop = a;
  }
  await page.screenshot({ path: `${OUT}/${TAG}-lock-tab.png` });
  L.sealStop = sealStop;
  if (sealStop) {
    /* Focus the seal again and press Enter, then Space. */
    for (const key of ["Enter", "Space"]) {
      await page.evaluate(() => document.activeElement?.blur()); await page.locator("body").focus();
      for (let i = 0; i < 6; i++) { await page.keyboard.press("Tab"); const id = await page.evaluate(() => document.activeElement?.getAttribute("data-testid") ?? document.activeElement?.tagName); if (id === sealStop.id) break; }
      await page.keyboard.press(key); await sleep(700);
      const wipe = await page.getByTestId("wipe-sheet").isVisible().catch(() => false);
      L[key] = { wipeSheet: wipe };
      await page.screenshot({ path: `${OUT}/${TAG}-lock-${key}.png` });
      if (!wipe) R.fail.push(`F397: the seal is a Tab stop ("${sealStop.label || sealStop.text}") and ${key} does nothing`);
      else { await page.keyboard.press("Escape"); await sleep(700); if (await page.getByTestId("wipe-sheet").isVisible().catch(() => false)) R.fail.push(`F397: Esc left the wipe sheet open`); }
      if (!(await page.getByTestId("lock-screen").count())) R.fail.push("F397: the lock screen went away");
    }
  }
  /* The pointer path is unchanged: a click does nothing, a 1.2 s hold opens the same confirm. */
  const sb = await page.getByTestId("lock-screen").getByTestId("seal").first().boundingBox({ timeout: 5000 }).catch(() => null);
  if (sb) {
    await page.mouse.click(sb.x + sb.width / 2, sb.y + sb.height / 2); await sleep(700);
    L.clickOpens = await page.getByTestId("wipe-sheet").isVisible().catch(() => false);
    if (L.clickOpens) { R.fail.push("F397: a plain click on the seal opened the wipe sheet"); await page.keyboard.press("Escape"); await sleep(700); }
    await page.mouse.move(sb.x + sb.width / 2, sb.y + sb.height / 2); await page.mouse.down(); await sleep(1500); await page.mouse.up(); await sleep(700);
    L.holdOpens = await page.getByTestId("wipe-sheet").isVisible().catch(() => false);
    if (!L.holdOpens) R.fail.push("F397: holding the seal no longer opens the wipe sheet");
    else { await page.screenshot({ path: `${OUT}/${TAG}-lock-hold.png` }); await page.keyboard.press("Escape"); await sleep(700); }
  }
  if (sealStop && !/delete|wipe|everything/i.test(sealStop.label)) R.fail.push(`F397: the seal's Tab stop is labelled "${sealStop.label}"`);
  L.stillLocked = (await page.getByTestId("lock-screen").count()) > 0;
  L.chatsKept = null;
  await page.getByTestId("unlock-passcode").click(); await page.getByTestId("passcode-input").fill("2468"); await page.getByTestId("passcode-submit").click();
  await page.getByTestId("lock-screen").waitFor({ state: "detached", timeout: 10000 });
  L.chatsKept = await page.locator('[data-testid^="chat-row-"]').count();
  if (!L.chatsKept) R.fail.push("F397: chats are gone after the keyboard pass (nothing may be wiped without the confirm)");
  await page.evaluate(() => { const p = JSON.parse(localStorage.getItem("inborn.prefs") ?? "{}"); localStorage.setItem("inborn.prefs", JSON.stringify({ ...p, lock: { ...p.lock, enabled: false } })); localStorage.removeItem("inborn.lock.passcode"); });
}
R.pageErrors = errs;
writeFileSync(`${OUT}/${TAG}-result.json`, JSON.stringify(R, null, 2));
console.log(R.fail.length ? `FAIL (${R.fail.length})\n` + R.fail.join("\n") : "PASS");
await ctx.close(); await server.close?.(); process.exit(R.fail.length ? 1 : 0);
