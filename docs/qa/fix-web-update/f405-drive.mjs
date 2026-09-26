#!/usr/bin/env node
/**
 * F405 headless proof: onboarded earlier, model gone.
 *   empty:  no chat, no document in IndexedDB → the whole onboarding (Welcome first, prefs.onboarded cleared).
 *   kept:   one chat in IndexedDB → the Model step alone, with the "browsers can clear files" line.
 * At 1440 and 390, against apps/web/dist on a free port.
 *   node docs/qa/fix-web-update/f405-drive.mjs
 */
import { createRequire } from "node:module";
import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { URL, fileURLToPath } from "node:url";
import { startServer } from "../../../scripts/serve-web.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const { chromium } = createRequire(path.join(process.env.PLAYWRIGHT_CORE_DIR ?? "/Users/moshecohen/.npm/_npx/9833c18b2d85bc59/node_modules", "/"))("playwright-core");
const cache = path.join(os.homedir(), "Library/Caches/ms-playwright");
const executablePath =
  process.env.CHROMIUM_PATH ??
  readdirSync(cache)
    .filter((d) => /^chromium_headless_shell-\d+$/.test(d))
    .sort()
    .reverse()
    .flatMap((d) => readdirSync(path.join(cache, d)).map((s) => path.join(cache, d, s, "chrome-headless-shell")))
    .find((p) => existsSync(p));

const server = await startServer({ port: 0 });
const results = [];
try {
  for (const width of [1440, 390]) {
    for (const kept of [false, true]) {
      const root = mkdtempSync(path.join(os.tmpdir(), "inborn-f405-"));
      const context = await chromium.launchPersistentContext(root, { executablePath, headless: true, viewport: { width, height: width > 500 ? 900 : 844 } });
      try {
        const page = context.pages()[0] ?? (await context.newPage());
        /* Onboarded weeks ago; the app's own boot creates the IndexedDB schema, then the chat (or nothing) goes in. */
        await page.goto(`${server.url}/legal`);
        await page.evaluate(async (withChat) => {
          const prefs = JSON.parse(localStorage.getItem("inborn.prefs") ?? "{}");
          localStorage.setItem("inborn.prefs", JSON.stringify({ ...prefs, onboarded: true }));
          if (!withChat) return;
          await new Promise((resolve, reject) => {
            /* The app's schema (storage/web/idbRepository.ts, v3), in case its boot has not opened the database yet. */
            const r = globalThis.indexedDB.open("inborn", 3);
            r.onupgradeneeded = () => {
              const db = r.result;
              if (!db.objectStoreNames.contains("chats")) db.createObjectStore("chats", { keyPath: "id" });
              if (!db.objectStoreNames.contains("messages")) {
                const m = db.createObjectStore("messages", { keyPath: "seq", autoIncrement: true });
                m.createIndex("byChat", "chatId", { unique: false });
                m.createIndex("byId", "id", { unique: true });
                m.createIndex("byChatSeq", ["chatId", "seq"], { unique: true });
              }
            };
            r.onsuccess = () => {
              const tx = r.result.transaction("chats", "readwrite");
              tx.objectStore("chats").put({ id: "c1", title: "Kept chat", createdAt: 1, updatedAt: 1, modelId: "fast", incognito: false });
              tx.oncomplete = () => (r.result.close(), resolve(undefined));
              tx.onerror = () => reject(tx.error);
            };
            r.onerror = () => reject(r.error);
            r.onblocked = () => reject(new Error("blocked"));
          });
        }, kept);
        await page.goto(`${server.url}/`);
        const want = kept ? "download-door" : "onboarding-welcome";
        const shown = await page
          .getByTestId(want)
          .waitFor({ timeout: 30_000 })
          .then(() => want)
          .catch(() => "missing");
        const onboarded = await page.evaluate(() => JSON.parse(localStorage.getItem("inborn.prefs") ?? "{}").onboarded);
        const note = await page.getByText(/no longer has the model/).count();
        const shot = path.join(here, `f405-${width}-${kept ? "chat-kept" : "nothing-kept"}.png`);
        await page.screenshot({ path: shot });
        let walk = null;
        if (!kept && shown === want) {
          /* Welcome's next step is the Model step inside onboarding, not the framed door. */
          await page.getByTestId("onboarding-continue").click().catch(() => undefined);
          walk = await page.waitForURL(/\/onboarding\/model/, { timeout: 15_000 }).then(() => new URL(page.url()).pathname).catch(() => new URL(page.url()).pathname);
          await page.screenshot({ path: path.join(here, `f405-${width}-nothing-kept-model-step.png`) });
        }
        const ok = shown === want && (kept ? onboarded === true && note === 1 : onboarded === false && walk === "/onboarding/model");
        results.push({ width, kept, shown, onboarded, modelGoneNote: note, walk, ok });
      } finally {
        await context.close();
        rmSync(root, { recursive: true, force: true });
      }
    }
  }
} finally {
  await server.close();
}
console.log(JSON.stringify(results, null, 2));
const ok = results.every((r) => r.ok);
console.log(ok ? "F405 DRIVE: PASS" : "F405 DRIVE: FAIL");
process.exit(ok ? 0 : 1);
