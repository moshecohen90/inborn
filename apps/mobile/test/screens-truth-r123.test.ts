import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const APP = join(__dirname, "..");
const REPO = join(APP, "../..");
const read = (rel: string) => readFileSync(join(APP, "src", rel), "utf8");
const LOCALE_DIR = join(REPO, "packages/i18n/locales");
const locale = (file: string) => JSON.parse(readFileSync(join(LOCALE_DIR, file), "utf8")) as Record<string, string>;
const en = locale("en.json");
const files = readdirSync(LOCALE_DIR).filter((f) => f.endsWith(".json"));

/**
 * Round 123 (F446), MosheAI on the lead's journey screenshots of main e61f222a: screens that said something the app
 * did not do, a developer line on a consumer screen, a photo cut in half, and dead toggles on the web.
 */
describe("F446 · Documents says what search does today", () => {
  it("the index model card says exact-word search already works and what the model adds", () => {
    const line = en["documents.embedder.explain"]!;
    expect(line).not.toMatch(/needs a small/);
    expect(line).toMatch(/exact-word search works now/i);
    expect(line).toMatch(/meaning/);
    expect(line).toContain("{size}");
  });

  it("the footer says where, not which storage engine", () => {
    for (const f of files) expect(locale(f)["documents.onDevice"], f).not.toContain("{store}");
    expect(en["documents.onDevice"]).toBe("Indexed on this device");
    const docs = read("screens/documents/DocumentsScreen.tsx");
    expect(docs).toContain('t("documents.onDevice")');
    expect(docs).not.toContain("store: state.storeKind");
  });

  it("the Ask sheet's timing line shows only with Pro's detailed stats, the chat's own gate", async () => {
    const { askStatsLine } = await import("../src/lib/docsGate");
    expect(askStatsLine("search 1 ms · 1 passages", false)).toBeNull();
    expect(askStatsLine("search 1 ms · 1 passages", true)).toBe("search 1 ms · 1 passages");
    expect(askStatsLine(null, true)).toBeNull();
    const ask = read("screens/documents/AskDocuments.tsx");
    expect(ask).toContain('can("detailedStats")');
    expect(ask).toMatch(/askStatsLine\(stats, detailed\)/);
  });

  it("the Free limit is said before the Pro tag is met, from the licence's own numbers", async () => {
    const { freeDocumentLimit } = await import("../src/documents/freeLimit");
    expect(freeDocumentLimit("free", 20)).toEqual({ count: 1, pages: 20 });
    expect(freeDocumentLimit("pro", 20)).toBeNull();
    expect(freeDocumentLimit("work", 20)).toBeNull();
    expect(en["documents.freeLimit"]).toBe("Free: {count, plural, one {# document} other {# documents}} of up to {pages} pages · Pro: no limit");
    const docs = read("screens/documents/DocumentsScreen.tsx");
    expect(docs).toContain("freeDocumentLimit(tier, FREE_PAGE_CAP)");
    expect(docs).toContain('testID="documents-free-limit"');
  });

  it("the Ask sheet wears the same PRO tag and gate on \"Answer only from my documents\" as the panel", () => {
    const ask = read("screens/documents/AskDocuments.tsx");
    expect(ask).toContain('<ProTag onPress={() => onUnlock?.("strictDocuments")} />');
    expect(ask).toMatch(/value=\{strict && !strictLocked\}/);
    expect(ask).toMatch(/strict: strict && !strictLocked/);
    expect(read("screens/documents/DocumentsScreen.tsx")).toMatch(/<AskDocuments[\s\S]{0,400}strictLocked=\{strictLocked/);
  });
});

describe("F446 · a sent photo is shown whole", () => {
  it("the bubble fits the photo in a fixed box and keeps its shape", async () => {
    const { fitThumb, THUMB_MAX } = await import("../src/components/chat/bubbleImage");
    expect(fitThumb(320, 320)).toEqual({ width: 180, height: 180 });
    expect(fitThumb(1024, 512)).toEqual({ width: 240, height: 120 });
    expect(fitThumb(512, 1024)).toEqual({ width: 90, height: 180 });
    /* A small picture is not blown up past its own pixels. */
    expect(fitThumb(100, 50)).toEqual({ width: 100, height: 50 });
    for (const [w, h] of [[4000, 3000], [3000, 4000], [1080, 1920], [700, 90]] as const) {
      const box = fitThumb(w, h);
      expect(box.width).toBeLessThanOrEqual(THUMB_MAX.width);
      expect(box.height).toBeLessThanOrEqual(THUMB_MAX.height);
      expect(Math.abs(box.width / box.height - w / h) / (w / h)).toBeLessThan(0.03);
    }
  });

  it("the bubble draws the photo with contain, never cover", () => {
    const bubble = read("components/chat/UserMessage.tsx");
    expect(bubble).not.toContain('resizeMode="cover"');
    expect(bubble).toContain('resizeMode="contain"');
    expect(bubble).toContain("fitThumb(");
  });

  it("the Free hint under the photo reads as a sentence", () => {
    expect(en["chat.attach.photoLimit"]).toBe("Free: one photo per message");
    expect(read("screens/Chat.tsx")).not.toMatch(/type\.monoLabel[^}]*\}\]\}>\{t\("chat\.attach\.photoLimit"\)/);
  });
});

describe("F446 · Settings on the web shows no dead switch", () => {
  it("hide-in-switcher and screenshot protection are left out in a browser, kept on phones", async () => {
    const { securityRows } = await import("../src/screens/Settings/securityRows");
    expect(securityRows("web", false)).toEqual({ hideInSwitcher: false, screenshots: false, panicWipe: false });
    expect(securityRows("web", true)).toEqual({ hideInSwitcher: false, screenshots: false, panicWipe: true });
    expect(securityRows("ios", false)).toEqual({ hideInSwitcher: true, screenshots: true, panicWipe: false });
    expect(securityRows("android", true)).toEqual({ hideInSwitcher: true, screenshots: true, panicWipe: true });
    const settings = read("screens/Settings/Settings.tsx");
    expect(settings).toContain("securityRows(Platform.OS, prefs.lock.enabled)");
    expect(settings).not.toContain("settings.security.hideInSwitcher.web");
    expect(settings).not.toContain("settings.security.screenshots.web");
  });

  it("the \"Not available in a browser\" lines left the locales with their rows", () => {
    for (const f of files) {
      expect(locale(f)["settings.security.hideInSwitcher.web"], f).toBeUndefined();
      expect(locale(f)["settings.security.screenshots.web"], f).toBeUndefined();
    }
  });

  it("Privacy & storage gives Browser cleanup a state and Reports a line saying what they are", async () => {
    const { durableStateKey } = await import("../src/web/durable");
    expect(durableStateKey(true)).toBe("storage.durable.state.protected");
    expect(durableStateKey(false)).toBe("storage.durable.state.notProtected");
    expect(durableStateKey(null)).toBe("storage.durable.state.unknown");
    expect(en["storage.durable.state.protected"]).toBe("Protected");
    expect(en["storage.durable.state.notProtected"]).toBe("May be cleared");
    expect(read("web/DurableStorage.tsx")).toContain("value={t(durableStateKey(kept))}");
    expect(read("screens/Settings/Storage.tsx")).toMatch(/label=\{t\("storage\.reports"\)\} sub=\{t\("reports\.row"\)\}/);
  });
});

describe("F446 · Delete everything says what it deletes", () => {
  it("the last step no longer promises a fresh install while the models stay", () => {
    expect(en["wipe.confirmExplain"]).not.toMatch(/as if just installed/);
    expect(en["wipe.confirmExplain"]).toMatch(/models stay/i);
    expect(en["wipe.confirmExplain.models"]).toMatch(/downloaded models are deleted/);
    expect(read("screens/Settings/WipeSheet.tsx")).toContain('t(models ? "wipe.confirmExplain.models" : "wipe.confirmExplain")');
  });
});
