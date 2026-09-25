// F401: Esc closes each modal at 0/50/150/300 ms after it appears, 15 trials per modal.
import { persistent, BASE, observe, check, sleep, dump, shot } from "./lib.mjs";
const W = Number(process.env.W ?? 1440), TAG = process.env.TAG ?? "after";
const ctx = await persistent(process.env.PROFILE ?? "main", { viewport: { width: W, height: W < 800 ? 844 : 900 } }); const page = await ctx.newPage(); const L = observe(page);
const DELAYS = [0, 0, 0, 0, 50, 50, 50, 50, 150, 150, 150, 150, 300, 300, 300];
const home = W < 800 ? "/chats" : "/";
const openChat = async () => { await page.goto(BASE + home); await sleep(2500); await page.locator('[data-testid^="chat-row-"]').first().click(); await sleep(1500); await page.getByTestId("citations").last().waitFor({ timeout: 15000 }); };
const MODALS = {
  menu: { id: "menu-rename", prep: async () => { await page.goto(BASE + home); await sleep(2500); }, open: async () => { await page.locator('[data-testid^="chat-more-"]').first().click(); } },
  ...(W >= 800 ? { palette: { id: "palette-input", prep: openChat, open: async () => { await page.keyboard.press("Control+k"); } } } : {}),
  /* A wide window shows the passage in the side panel, not a modal (§8.9). */
  ...(W < 800 ? { citations: { id: "passage-sheet", prep: openChat, open: async () => { await page.getByTestId("citation-1").last().click(); } } } : {}),
  docDetails: { id: "doc-details", prep: async () => { await page.goto(BASE + "/documents"); await sleep(3000); }, open: async () => { await page.locator('[data-testid^="doc-row-"]').first().click(); } },
  askDocs: { id: "ask-sheet", prep: async () => { await page.goto(BASE + "/documents"); await sleep(3000); }, open: async () => { await page.locator('[data-testid^="doc-row-"]').first().click(); await page.getByTestId("doc-ask").click(); } },
};
const R = {};
for (const [name, m] of Object.entries(MODALS)) {
  if (process.env.ONLY && !process.env.ONLY.split(",").includes(name)) continue;
  await m.prep(); R[name] = [];
  for (const d of DELAYS) {
    const url0 = page.url();
    let opened = true;
    await m.open().then(() => page.getByTestId(m.id).first().waitFor({ timeout: 3000 })).catch(() => (opened = false));
    if (d) await sleep(d);
    await page.keyboard.press("Escape"); await sleep(900);
    const stuck = await page.getByTestId(m.id).first().isVisible().catch(() => false);
    const urlSame = page.url() === url0;
    R[name].push({ d, opened, stuck, urlSame });
    if (!urlSame) await m.prep();
    if (stuck && R[name].filter((r) => r.stuck).length === 1) await shot(page, `${TAG}-${name}-stuck-${W}`, false);
    for (let i = 0; i < 3 && (await page.getByTestId(m.id).first().isVisible().catch(() => false)); i++) { await page.keyboard.press("Escape"); await sleep(800); }
  }
  const bad = R[name].filter((r) => r.stuck || !r.opened || !r.urlSame);
  check(`R102-F401-${TAG}-${name}-${W}`, `Esc closes ${name} at 0/50/150/300 ms, 15 trials`, bad.length ? "FAIL" : "PASS", `stuck ${R[name].filter((r) => r.stuck).length}/15 (delays ${R[name].filter((r) => r.stuck).map((r) => r.d)}) · not opened ${R[name].filter((r) => !r.opened).length} · navigated away ${R[name].filter((r) => !r.urlSame).length} · pageerrors ${L.filter((l) => /^pageerror/.test(l)).length}`);
}
dump(`ESC-${TAG}-${W}.json`, R); await ctx.close();
