import { createRequire } from "node:module";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
const req = createRequire("/Users/moshecohen/.npm/_npx/9833c18b2d85bc59/node_modules/");
const pw = req("playwright-core");
const cache = "/Users/moshecohen/Library/Caches/ms-playwright";
const exe = readdirSync(cache).filter((d) => /^chromium_headless_shell-\d+$/.test(d)).sort().reverse().flatMap((d) => readdirSync(path.join(cache, d)).map((s) => path.join(cache, d, s, "chrome-headless-shell"))).find((p) => existsSync(p));
const browser = await pw.chromium.launch({ headless: true, executablePath: exe });
try {
  for (const f of readdirSync("/private/tmp/claude-501/-Users-moshecohen-dev-bibleapps/e1fec2dd-3831-49ec-a78e-d650b5c0d26b/scratchpad/fix-model-sheet/cards")) for (const w of [390, 1440]) {
    const page = await browser.newPage({ viewport: { width: w, height: 900 } });
    await page.goto("file:///private/tmp/claude-501/-Users-moshecohen-dev-bibleapps/e1fec2dd-3831-49ec-a78e-d650b5c0d26b/scratchpad/fix-model-sheet/cards/" + f, { waitUntil: "networkidle" }).catch(() => {});
    await page.waitForTimeout(300);
    await page.screenshot({ path: "/Users/moshecohen/dev/inborn-wt/fix-model-sheet/docs/qa/fix-model-sheet/vault-card-" + f.replace(".html", "") + "-" + w + ".png", fullPage: true });
    await page.close();
  }
} finally { await browser.close(); }
