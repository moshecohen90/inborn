import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BUNDLED_MANIFEST, modelChoices, type CatalogModel, type DeviceProfile } from "@inborn/core";
import { goodAtUses, recommendationKey } from "../../lib/modelSheetLines";

/**
 * F150: Moshe could not find how to change model — the header chip opened Chat settings, where the model was a dead chip.
 * The chip now opens the Model sheet. A unit test cannot render it in node, so the lines it prints are tested pure and
 * the wiring that puts it under the chip is asserted on the source.
 */
const catalog = BUNDLED_MANIFEST.models;
const byId = (id: string): CatalogModel => catalog.find((m) => m.id === id)!;
const phone = (ramGB: number): DeviceProfile => ({ ramGB, deviceClass: "phone" });
const choices = (over: { languageCode?: string | null; use?: "chat" | "code"; installed?: string[]; ramGB?: number } = {}) =>
  modelChoices({ use: over.use ?? "chat", languageCode: over.languageCode === undefined ? "en" : over.languageCode, device: phone(over.ramGB ?? 8), installed: over.installed ?? ["instant"], currentId: "instant", catalog });

const read = (rel: string) => readFileSync(join(__dirname, rel), "utf8");
const sheet = read("ModelSheet.tsx");
const container = read("ChatModelSheet.tsx");
const chat = read("../../screens/Chat.tsx");

describe("the Model sheet's recommendation line", () => {
  it("names the use and the language when the chat has one", () => {
    expect(recommendationKey(choices(), "en")).toBe("models.recommendedFor");
  });
  it("says plainly that nothing here is good at it, instead of recommending, when the top pick is weak", () => {
    const c = choices({ languageCode: "he" });
    expect(c.recommendedWeak).toBe(true);
    expect(recommendationKey(c, "he")).toBe("models.recommendedNone");
    /* …and the same sheet in English recommends normally, so the weak line is a verdict and not the default. */
    expect(recommendationKey(choices(), "en")).toBe("models.recommendedFor");
  });
  it("falls back to the device-only line when nothing names a language", () => {
    expect(recommendationKey(choices({ languageCode: null }), null)).toBe("models.recommended");
  });
  it("says nothing at all when this device can recommend nothing", () => {
    expect(recommendationKey({ recommended: null, recommendedWeak: false }, "en")).toBeNull();
  });
  it("uses the three lines the vault's picker already ships, so the two never disagree", () => {
    for (const key of ["models.recommended", "models.recommendedFor", "models.recommendedNone"]) expect(read("../../screens/vault/ModelCard.tsx") + read("../../screens/vault/VaultScreen.tsx"), key).toContain(key.replace("models.", ""));
  });
});

describe("what a row claims the model is good at", () => {
  it("lists the uses the fit map rates best or good, in catalog order", () => {
    expect(goodAtUses(byId("fast"))).toEqual(["chat", "writing", "summarize", "translate", "documents", "voice"]);
  });
  it("adds photos only for the model that can see them", () => {
    expect(goodAtUses(byId("instant"))).toContain("photos");
    expect(goodAtUses(byId("sharp"))).not.toContain("photos");
  });
  it("never claims a weak use: Instant is weak at code, so code is not on its list", () => {
    expect(goodAtUses(byId("instant"))).not.toContain("code");
    expect(goodAtUses(byId("sharp-phi"))).toContain("code");
  });
  it("claims nothing for a model with no fit block (an import)", () => {
    expect(goodAtUses({ vision: false })).toEqual([]);
  });
});

describe("the sheet's sections follow modelChoices", () => {
  it("installed first, then downloadable, then what will not run, each in the ranking's order", () => {
    const c = choices({ installed: ["instant", "fast"] });
    expect(c.installed.map((x) => x.model.id)).toEqual(["fast", "instant"]);
    expect(c.available.map((x) => x.model.id)).toEqual(["sharp", "sharp-phi"]);
    expect(choices({ ramGB: 4 }).unavailable.map((x) => x.model.id)).toEqual(["fast", "sharp", "sharp-phi"]);
  });
  it("renders each section from its own list and nothing else", () => {
    expect(sheet).toContain("choices.installed.map(row)");
    expect(sheet).toContain("choices.available.map(row)");
    expect(sheet).toContain("choices.unavailable.map(row)");
  });
  it("offers Use on an installed row, a download on an available one, and no action on an unavailable one", () => {
    expect(sheet).toContain("model-sheet-use-");
    expect(sheet).toContain("model-sheet-download-");
    expect(sheet).toMatch(/dim \|\| \(managed && !choice\.current\) \? null :/);
  });
  it("names the size and the host before a byte moves, and keeps the Wi-Fi-only switch on that confirmation (§5.1)", () => {
    expect(sheet).toContain("vault.confirm.https");
    expect(sheet).toContain("vault.confirm.wifiOnly");
    expect(container).toContain("wifiOnly={prefs.wifiOnly}");
    expect(container).toContain("updatePrefs({ wifiOnly })");
  });
  it("a Pro model shows the tag and opens the paywall instead of downloading", () => {
    expect(sheet).toMatch(/onPress=\{locked \? onUnlock : onAskDownload\}/);
    expect(container).toContain("paywallFor(tier, { kind: \"model\", proOnly: !!model.proOnly })");
  });
});

describe("the sheet is where the user is (F150)", () => {
  it("the chat header's model chip opens it, not Chat settings", () => {
    expect(chat).toMatch(/testID="model-chip"[^>]*onPress=\{\(\) => setModelSheetOpen\(true\)\}/);
    expect(chat).toContain("<ChatModelSheet");
  });
  it("Chat settings stays reachable, from the sheet's own footer", () => {
    expect(sheet).toContain("model-sheet-chat-settings");
    expect(chat).toContain("onChatSettings={() => setSettingsOpen(true)}");
  });
  it("the full vault is still one tap away, behind Manage", () => {
    expect(sheet).toContain("model-sheet-manage");
    expect(container).toContain("onOpenVault?.()");
  });
  it("the recommendation follows this chat: its detected language, else the app's own", () => {
    expect(chat).toContain("languageCode={adviceLanguage ?? uiLanguageCode}");
    expect(chat).toContain("use={use}");
  });
});

describe("the weak-language notice names the model that does better (F151)", () => {
  it("the notice carries a switch or a download, not just a verdict", () => {
    expect(chat).toContain("chat.modelWeakBetter");
    expect(chat).toContain('testID="model-weak-action"');
    expect(chat).toMatch(/languageUpgrade\.better\.reason\.installed \? onSwitchModel\?\.\(languageUpgrade\.better\.model\.id\) : setModelSheetOpen\(true\)/);
  });
  it("it comes from betterForLanguage, not from a second opinion of its own", () => {
    expect(chat).toContain("betterForLanguage({");
  });
  it("it stands down when the advice card is already making the same point", () => {
    expect(chat).toContain("!adviceShown?.language");
  });
});
