import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { PAYWALL_REASONS } from "@inborn/core";

const root = join(__dirname, "../src");

function* walk(dir: string): Generator<string> {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (/\.tsx?$/.test(f)) yield p;
  }
}

const sources = [...walk(root)].map((p) => ({ path: p.slice(root.length + 1), src: readFileSync(p, "utf8") }));
const read = (rel: string) => sources.find((s) => s.path === rel)!.src;
const all = sources.map((s) => s.src).join("\n");

/**
 * F145. Round 39: every locked tap opens S60 saying why. A refusal that pushes a bare "/paywall" is the bug — the
 * person meets a price list that never mentions the thing they just tried.
 */
describe("F145 · every paywall door carries its reason", () => {
  it("no screen pushes the route by hand any more: `openPaywall` is the only door", () => {
    const byHand = sources.filter((s) => s.path !== "licence/openPaywall.ts" && /push\(\s*["'`]\/paywall/.test(s.src));
    expect(byHand.map((s) => s.path)).toEqual([]);
  });
  it("no refusal calls the host with an empty reason", () => {
    const bare = sources.filter((s) => /onOpenPaywall\?\.\(\)/.test(s.src) || /onUnlock\?\.\(\)/.test(s.src));
    expect(bare.map((s) => s.path)).toEqual([]);
  });
  it("every reason a screen passes is one the paywall knows", () => {
    const passed = new Set<string>();
    for (const { src } of sources) for (const m of src.matchAll(/(?:onOpenPaywall|onUnlock)\?\.\(\s*"([a-zA-Z]+)"/g)) passed.add(m[1]!);
    for (const m of all.matchAll(/openPaywall\(\s*"([a-zA-Z]+)"/g)) passed.add(m[1]!);
    expect([...passed].filter((r) => !(PAYWALL_REASONS as readonly string[]).includes(r))).toEqual([]);
    expect(passed.size).toBeGreaterThan(8);
  });
  it("the route turns ?reason= into the line, and refuses anything not on the list", () => {
    const route = read("app/paywall.tsx");
    expect(route).toContain("readReason(reason, PAYWALL_REASONS)");
    expect(read("licence/openPaywall.ts")).toContain("known: readonly PaywallReason[]");
    expect(read("screens/paywall/PaywallScreen.tsx")).toContain("paywall.why.${reason}");
  });
  it("/voice keeps its own gate and states the reason on the redirect (F53 stays fixed)", () => {
    expect(read("app/voice.tsx")).toContain('/paywall?reason=voiceConversation');
  });
});

/**
 * F146. The attach sheet ticked a second document straight into the chat: `onAttach` went to the library with no
 * tier question at all, while the picker and the share target both asked `fileIntake`. Free carries one file (§7.3).
 */
describe("F146 · the second file in the attach sheet is a gate, not a free tick", () => {
  const chat = read("screens/Chat.tsx");
  const sheet = read("components/chat/AttachSheet.tsx");
  it("Chat asks the document moment before attaching", () => {
    expect(chat).toContain('const attachLocked = paywallFor(tier, { kind: "document", existing: docs.documents.length });');
    expect(chat).toContain("if (!attachLocked) return docs.attach(id);");
    expect(chat).toContain('onOpenPaywall?.("document")');
  });
  it("Chat hands the sheet the lock, so the rows can show it before the tap", () => {
    expect(chat).toContain("attachLocked={attachLocked}");
  });
  it("a locked row stays tappable, wears the PRO tag and says why", () => {
    expect(sheet).toContain("const locked = !!attachLocked && !on;");
    expect(sheet).toContain("disabled={!ready && !on && !locked}");
    expect(sheet).toContain('onPress={() => (locked ? onUnlock?.("document")');
    expect(sheet).toContain('hint={locked ? t("quick.filePro")');
    expect(sheet).toContain('<ProTag onPress={() => onUnlock?.("document")} />');
  });
  it("the strict switch names its own reason rather than the sheet's", () => {
    expect(sheet).toContain('onUnlock?.("strictDocuments")');
  });
  it("the Free photo cap says what happened before it opens the paywall", () => {
    expect(chat).toContain('flash(t("chat.attach.photoLimit"));');
    expect(chat).toContain('onOpenPaywall?.("photos")');
  });
});

/** F147. Nothing in the app said Pro existed until something was refused. */
describe("F147 · Pro has a visible front door", () => {
  it("Settings opens with the Inborn Pro row: tier badge, sub-line per tier, and the way in", () => {
    const settings = read("screens/Settings/Settings.tsx");
    expect(settings).toContain('<Section title={t("paywall.entry.title")}>');
    expect(settings).toContain('testID="row-pro"');
    expect(settings).toContain("t(`paywall.entry.sub.${tier}`)");
    expect(settings).toContain("t(`paywall.tier.${tier}`)");
    expect(settings).toContain("onPress={() => openPaywall()}");
  });
  it("the sheet the chat header opens carries the tier chip and the same link", () => {
    /* Round 40 moved the header chip from Chat settings to the model sheet; the entry follows the header, not the file. */
    expect(read("screens/Chat.tsx")).toContain('testID="model-chip"');
    expect(read("screens/Chat.tsx")).toContain("onPress={() => setModelSheetOpen(true)}");
    for (const file of ["components/chat/ModelSheet.tsx", "components/chat/ChatSettingsSheet.tsx"]) {
      const sheet = read(file);
      expect(sheet, file).toContain('testID="tier-chip"');
      expect(sheet, file).toContain("t(`paywall.tier.${tier}`)");
      expect(sheet, file).toContain('testID="see-whats-in-pro"');
      expect(sheet, file).toContain('t("paywall.seeWhatsIn")');
    }
    expect(read("components/chat/ChatModelSheet.tsx")).toContain("tier={tier}");
  });
  it("both entries open S60 with no reason, because nothing was refused", () => {
    expect(read("screens/Settings/Settings.tsx")).not.toMatch(/openPaywall\("/);
    expect(read("components/chat/ChatSettingsSheet.tsx")).not.toMatch(/openPaywall\("/);
    expect(read("components/chat/ChatModelSheet.tsx")).toMatch(/onSeePro=\{\(\) => \{\s*onClose\(\);\s*openPaywall\(\);/);
  });
});

/** F148. The paywall priced two tiers and never said what separates them. */
describe("F148 · the paywall shows the Free / Pro / Work table", () => {
  const table = read("screens/paywall/CompareTable.tsx");
  it("every cell is computed by the gates, never written out by hand", () => {
    expect(table).toContain("compareCell(row, tier)");
    expect(table).toContain("COMPARE_ROWS.map");
    expect(table).toContain("COMPARE_TIERS.map");
  });
  it("the screen shows it and marks the column the person is on", () => {
    const screen = read("screens/paywall/PaywallScreen.tsx");
    expect(screen).toContain("<CompareTable theme={theme} owned={owned ? tier : undefined} />");
  });
});

/**
 * F149. In a browser the paywall said only "Pro is sold in the apps" and named no price: the reader could not tell
 * what Pro costs or where to get it.
 */
describe("F149 · the browser paywall names the price and the way to buy", () => {
  const block = read("screens/paywall/WebStoreBlock.tsx");
  it("replaces the bare no-store line", () => {
    const screen = read("screens/paywall/PaywallScreen.tsx");
    expect(screen).toContain("{store === null ? (\n          <WebStoreBlock theme={theme} />");
  });
  it("prices both tiers from the catalogue, never from a literal in the page", () => {
    expect(block).toContain("offersFor(\"free\", Date.now(), null)");
    expect(block).toContain("fallbackPrice(offer.productId).display");
    expect(block).not.toMatch(/\$\s?\d/);
    expect(block).toContain('t("paywall.web.priceNote")');
  });
  it("offers all three ways to the app", () => {
    expect(block).toContain('(["appStore", "play", "desktop"] as const)');
    expect(block).toContain("testID={`web-get-${where}`}");
    expect(block).toContain("STORE_LINKS[where]");
  });
  it("keeps the promise that the browser stays free", () => {
    expect(block).toContain('testID="web-stays-free"');
    expect(block).toContain('t("paywall.noStore")');
  });
  it("every store link is a real https URL on our own origin until a listing is live", () => {
    const links = read("web/links.ts");
    const urls = [...links.matchAll(/(appStore|play|desktop):\s*`?([^,\n]+)/g)].map((m) => m[2]!);
    expect(urls.length).toBe(3);
    for (const u of urls) expect(u).toContain("GET_APP_URL");
  });
});
