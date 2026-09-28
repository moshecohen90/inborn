// Round 123 (F446) proof: node docs/qa/web-polish/shoot.mjs <baseUrl> <outDir> <profileDir>
// Fresh chrome-headless-shell profile; walks onboarding (Instant), a photo, Documents, Settings, Privacy & storage, the wipe sheet.
import { createRequire } from "node:module";
import { readdirSync, mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const req = createRequire("/Users/moshecohen/.npm/_npx/9833c18b2d85bc59/node_modules/");
const { chromium } = req("playwright-core");
const [base = "http://127.0.0.1:8823", outDir = "out", profile = path.join(os.tmpdir(), "wp-profile")] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
const here = path.dirname(fileURLToPath(import.meta.url));
const cache = path.join(os.homedir(), "Library/Caches/ms-playwright");
const shell = readdirSync(cache).filter((d) => /^chromium_headless_shell-\d+$/.test(d)).sort().reverse().map((d) => path.join(cache, d, "chrome-headless-shell-mac-arm64", "chrome-headless-shell"))[0];
const ctx = await chromium.launchPersistentContext(profile, { headless: true, executablePath: shell, viewport: { width: 1280, height: 900 } });
const p = ctx.pages()[0] ?? (await ctx.newPage());
const notes = [];
const note = (s) => { notes.push(s); console.log(s); };
const shot = async (name) => p.screenshot({ path: path.join(outDir, name + ".png") });
const text = async () => (await p.locator("body").innerText()).replace(/\s+/g, " ");
const ids = async () => [...new Set(await p.evaluate(() => [...document.querySelectorAll("[data-testid]")].filter((e) => { const r = e.getBoundingClientRect(); const c = globalThis.getComputedStyle(e); return r.width > 0 && r.height > 0 && c.visibility === "visible" && c.opacity !== "0"; }).map((e) => e.getAttribute("data-testid"))))];
const mouseId = async (id) => { const r = await p.evaluate((id) => { const el = [...document.querySelectorAll(`[data-testid="${id}"]`)].find((e) => e.getBoundingClientRect().width > 0); if (!el) return null; el.scrollIntoView({ block: "center" }); const b = el.getBoundingClientRect(); return [b.x + b.width / 2, b.y + b.height / 2]; }, id); if (!r) { note("no visible " + id); return false; } await p.mouse.click(r[0], r[1]); return true; };
const textOf = async (id) => (await p.locator(`[data-testid="${id}"]`).first().innerText().catch(() => "")).replace(/\s+/g, " ");

await p.goto(base + "/", { waitUntil: "networkidle" });
await p.waitForTimeout(3000);

/* Onboarding: Instant, from the local models folder. */
const t0 = Date.now();
let chose = false;
let downloading = false;
while (Date.now() - t0 < 600000) {
  const cur = await ids();
  if (cur.includes("composer-input")) break;
  if (cur.includes("onboarding-continue")) await mouseId("onboarding-continue");
  else if (cur.includes("lock-start")) await mouseId("lock-start");
  else if (cur.includes("sealed-start")) { await p.waitForTimeout(3000); await mouseId("sealed-start"); }
  else if (!chose && cur.includes("web-model-options-toggle") && !cur.includes("web-model-choose-instant")) await mouseId("web-model-options-toggle");
  else if (!chose && cur.includes("web-model-choose-instant")) { await mouseId("web-model-choose-instant"); chose = true; }
  else if (cur.includes("use-model")) await mouseId("use-model");
  else if (cur.includes("start-chatting")) await mouseId("start-chatting");
  else if (cur.includes("download-model") && !downloading) { await mouseId("download-model"); downloading = true; }
  await p.waitForTimeout(2500);
}
note(`chat ready after ${Math.round((Date.now() - t0) / 1000)} s, chip ${await textOf("model-chip")}`);

/* A photo: the lead's 320x320 test card, the word CAT under a red circle. */
const png = path.join(outDir, "cat.png");
const buf = await p.evaluate(() => { const c = document.createElement("canvas"); c.width = 320; c.height = 320; const x = c.getContext("2d"); x.fillStyle = "#fff"; x.fillRect(0, 0, 320, 320); x.fillStyle = "#d22"; x.beginPath(); x.arc(160, 120, 70, 0, Math.PI * 2); x.fill(); x.fillStyle = "#000"; x.font = "bold 64px sans-serif"; x.textAlign = "center"; x.fillText("CAT", 160, 290); return c.toDataURL("image/png"); });
writeFileSync(png, Buffer.from(buf.split(",")[1], "base64"));
await mouseId("attach");
await p.waitForTimeout(1500);
const [chooser] = await Promise.all([p.waitForEvent("filechooser", { timeout: 8000 }).catch(() => null), mouseId("attach-photo")]);
if (chooser) await chooser.setFiles(png);
else note("no file chooser for attach-photo");
await p.waitForTimeout(2500);
await shot("after-photo-pick");
note("photo hint: " + (await textOf("photo-limit")));
await p.locator('[data-testid="composer-input"]').fill("What colour is the shape in this photo, and what word is written under it?");
await p.keyboard.press("Enter");
await p.waitForTimeout(3000);
const hold = (await ids()).find((i) => /^vision-hold-(download|primary)$/.test(i));
if (hold) { note("photo pack: " + hold); await mouseId(hold); }
const t1 = Date.now();
while (Date.now() - t1 < 600000 && !(await ids()).includes("user-images")) await p.waitForTimeout(3000);
note(`bubble after ${Math.round((Date.now() - t1) / 1000)} s`);
const t2 = Date.now();
while (Date.now() - t2 < 300000) { const cur = await ids(); if (cur.includes("assistant-message") && !cur.some((i) => /stop/.test(i))) break; await p.waitForTimeout(3000); }
await p.evaluate(() => [...document.querySelectorAll('[data-testid="user-images"]')].pop()?.scrollIntoView({ block: "center" }));
await p.waitForTimeout(800);
const measure = async () => p.evaluate(() => { const el = [...document.querySelectorAll('[data-testid="user-images"] [aria-label], [data-testid="user-images"] img')].pop(); const img = document.querySelector('[data-testid="user-images"] img'); const b = el?.getBoundingClientRect(); return { box: b ? [Math.round(b.width), Math.round(b.height)] : null, natural: img ? [img.naturalWidth, img.naturalHeight] : null }; });
await shot("photo-bubble-1280");
note("bubble 1280: " + JSON.stringify(await measure()));
note("answer: " + (await p.locator('[data-testid="assistant-message"]').last().innerText().catch(() => "?")).replace(/\s+/g, " ").slice(0, 300));
await p.setViewportSize({ width: 390, height: 844 });
await p.waitForTimeout(1500);
await p.evaluate(() => [...document.querySelectorAll('[data-testid="user-images"]')].pop()?.scrollIntoView({ block: "center" }));
await p.waitForTimeout(800);
await shot("photo-bubble-390");
note("bubble 390: " + JSON.stringify(await measure()));
await p.setViewportSize({ width: 1280, height: 900 });
await p.waitForTimeout(1500);

/* Documents: the panel, one file, an answer. */
await mouseId("drawer-documents");
await p.waitForTimeout(2000);
await shot("documents-empty");
note("documents empty: " + (await text()).replace(/^.*?Proof /, "").slice(0, 600));
const [ch] = await Promise.all([p.waitForEvent("filechooser", { timeout: 8000 }).catch(() => null), mouseId("documents-add")]);
if (ch) await ch.setFiles(path.join(here, "office.txt"));
else note("no file chooser for documents-add");
await p.waitForTimeout(5000);
await shot("documents-added");
note("documents added: " + (await text()).replace(/^.*?Proof /, "").slice(0, 900));
const sel = (await ids()).find((i) => /^doc-select-/.test(i));
if (sel) await mouseId(sel);
await p.waitForTimeout(800);
await mouseId("documents-ask-selected");
await p.waitForTimeout(2000);
await shot("ask-sheet");
await p.locator('[data-testid="ask-input"]').fill("What is the support phone number and when does the office close?");
await mouseId("ask-send");
const t3 = Date.now();
while (Date.now() - t3 < 240000) { await p.waitForTimeout(3000); const cur = await ids(); if ((cur.includes("ask-answer") || cur.includes("ask-not-found")) && !cur.includes("ask-stop")) break; }
await p.waitForTimeout(1000);
await shot("ask-answer");
const askIds = await ids();
note("ask ids: " + askIds.filter((i) => /ask|pro-tag/.test(i)).join(" "));
note("ask text: " + (await textOf("ask-sheet")).slice(0, 900));
await p.keyboard.press("Escape");
await p.waitForTimeout(800);
if ((await ids()).includes("ask-sheet")) { await p.getByText(/^Close$/).last().click({ force: true }).catch(() => {}); await p.waitForTimeout(800); }
if ((await ids()).includes("documents-close")) { await mouseId("documents-close"); await p.waitForTimeout(1200); }

/* Settings on the web, then Privacy & storage, then the wipe sheet (cancelled). */
await mouseId("drawer-settings");
await p.waitForTimeout(2000);
await shot("settings");
note("settings ids: " + (await ids()).filter((i) => /^row-|wipe-after|lock/.test(i)).join(" "));
note("settings text: " + (await text()).replace(/^.*?Settings /, "").slice(0, 900));
await mouseId("row-storage");
await p.waitForTimeout(2500);
await shot("privacy-storage");
note("storage text: " + (await text()).replace(/^.*?Privacy & storage /, "").slice(0, 900));
await mouseId("storage-delete-all");
await p.waitForTimeout(1500);
await shot("wipe-step1");
await mouseId("wipe-step1");
await p.waitForTimeout(1200);
await shot("wipe-step2-models-kept");
note("wipe step 2, models kept: " + (await textOf("wipe-sheet")));
await p.getByText(/^Cancel$/).last().click({ force: true }).catch(() => {});
await p.waitForTimeout(1200);
await mouseId("storage-delete-all");
await p.waitForTimeout(1500);
await mouseId("wipe-models");
await p.waitForTimeout(500);
await mouseId("wipe-step1");
await p.waitForTimeout(1200);
await shot("wipe-step2-models-ticked");
note("wipe step 2, models ticked: " + (await textOf("wipe-sheet")));
await p.getByText(/^Cancel$/).last().click({ force: true }).catch(() => {});
await p.waitForTimeout(800);

writeFileSync(path.join(outDir, "notes.txt"), notes.join("\n") + "\n");
await ctx.close();
