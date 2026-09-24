import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement, type ReactElement, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { BUNDLED_MANIFEST, type CatalogModel, type InstallState } from "@inborn/core";

/*
 * F346 (round 74 follow-up). The bundled photo projector is a companion of Instant, yet its vault card read
 * "VISION · Qwen3.5 mmproj 0.4B" with a "Use this model" button, and the same pack had two more names elsewhere.
 * The real ModelCard renders on host stubs; `t` echoes the key and its name/defaultValue so the markup shows what is asked for.
 */
vi.mock("react-native", () => {
  const host = (tag: string) => ({ children, testID, accessibilityState }: { children?: ReactNode; testID?: string; accessibilityState?: { selected?: boolean } }) =>
    createElement(tag, { "data-testid": testID, "data-selected": accessibilityState?.selected ? "yes" : undefined }, children);
  return { Pressable: host("button"), View: host("div"), Text: host("span"), StyleSheet: { create: <T>(s: T) => s }, Platform: { OS: "ios", select: (o: Record<string, unknown>) => o.ios ?? o.default } };
});
vi.mock("react-native-svg", () => { const Svg = () => null; return { __esModule: true, default: Svg, Svg, Path: Svg, Circle: Svg, Rect: Svg, G: Svg, Line: Svg }; });
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (k: string, o?: { defaultValue?: string }) => (k.startsWith("models.name.") ? `name(${k.slice(12)})` : o?.defaultValue ?? k), i18n: { language: "en" } }) }));
vi.mock("../../services/type", () => ({ useType: () => new Proxy({}, { get: () => ({}) }), font: () => ({}) }));
vi.mock("../../lib/deviceNoun", () => ({ deviceNoun: () => "phone" }));
vi.mock("./FitMap", () => ({ FitMap: () => null }));

const { ModelCard } = await import("./ModelCard");
const serverRenderer: string = "react-dom/server";
const { renderToStaticMarkup } = (await import(serverRenderer)) as { renderToStaticMarkup: (el: ReactElement) => string };

const byId = (id: string): CatalogModel => BUNDLED_MANIFEST.models.find((m) => m.id === id)!;
const bundled: InstallState = { kind: "ready", via: "bundled", bytes: 1, path: "/x", sha256: "" };
const theme = new Proxy({}, { get: () => "#000" }) as never;
const device = { ramGB: 6, deviceClass: "phone", chip: "ios-mid", os: "ios" } as never;
const card = (id: string, extra: { active?: boolean; highlighted?: boolean; state?: InstallState } = {}) =>
  renderToStaticMarkup(
    createElement(ModelCard, { model: byId(id), state: extra.state ?? bundled, plan: null, device, theme, recommended: false, active: !!extra.active, highlighted: extra.highlighted, onInstall() {}, onCancel() {}, onPause() {}, onResume() {}, onUse() {}, onDetails() {} }),
  );

describe("F346 · a companion's vault card says what it is", () => {
  it("the bundled photo pack has no 'Use this model', says it comes with the app, and goes by its one name", () => {
    const html = card("vision-qwen35");
    expect(html).not.toContain('data-testid="use-vision-qwen35"');
    expect(html).not.toContain("vault.use");
    expect(html).not.toContain("vault.inUse");
    expect(html).toContain("vault.state.bundled");
    expect(html).toContain("NAME(VISION-QWEN35)");
    expect(html).not.toContain("VISION ·");
    /* It generates no text, so a tokens-per-second line (even "not measured") says nothing about it. */
    expect(html).not.toContain("vault.speedUnknown");
  });
  it("the file's technical name moves to the size line, the details line", () => {
    const html = card("vision-qwen35");
    const m = byId("vision-qwen35");
    expect(html).toMatch(new RegExp(`data-testid="model-spec-vision-qwen35">${m.family} ${m.params} · `));
  });
  it("the voice and document companions follow the same rule", () => {
    for (const id of ["speech-whisper-base", "embed-nomic"]) {
      const html = card(id, { state: { kind: "ready", via: "https", bytes: 1, path: "/x", sha256: "" } });
      expect(html, id).not.toContain(`data-testid="use-${id}"`);
      expect(html, id).toContain(`NAME(${id.toUpperCase()})`);
    }
  });
  it("a chat model still offers Use, so the rule is about companions and nothing else", () => {
    expect(card("fast", { state: { kind: "ready", via: "https", bytes: 1, path: "/x", sha256: "" } })).toContain('data-testid="use-fast"');
  });
  it("the card an entry point opened the vault for is marked", () => {
    expect(card("vision-qwen35", { highlighted: true })).toContain('data-testid="model-card-vision-qwen35" data-selected="yes"');
    expect(card("vision-qwen35")).not.toContain("data-selected");
  });
});

describe("F346 · 'install X' lands on X's card", () => {
  const src = (rel: string) => readFileSync(join(__dirname, rel), "utf8");
  it("focusLocation finds the card in any section, and nothing when the list does not show it", async () => {
    const { focusLocation } = await import("./focus");
    const sections = [{ data: [{ model: { id: "instant" } }] }, { data: [{ model: { id: "fast" } }, { model: { id: "sharp" } }] }, { data: [{ model: { id: "speech-whisper-base" } }, { model: { id: "vision-qwen35" } }] }];
    expect(focusLocation(sections, "vision-qwen35")).toEqual({ sectionIndex: 2, itemIndex: 1 });
    expect(focusLocation(sections, "nope")).toBeNull();
    expect(focusLocation(sections, undefined)).toBeNull();
  });
  it("the vault scrolls to the focused card once and marks it", () => {
    const vault = src("VaultScreen.tsx");
    expect(vault).toContain("focusLocation(sections, focus)");
    expect(vault).toContain("listRef.current?.scrollToLocation({ ...focused");
    expect(vault).toContain("onScrollToIndexFailed=");
    expect(vault).toContain("highlighted={item.model.id === focus}");
    expect(src("../../app/vault.tsx")).toContain("focus={typeof focus === \"string\" ? focus : undefined}");
  });
  it("every entry point that offers to install something names it", () => {
    const chat = src("../Chat.tsx");
    expect(chat).toContain("afterSheetClose(() => onOpenVault?.(VISION_MODEL_ID));");
    expect(chat).toContain("onOpenVault?.(companion ? VISION_MODEL_ID : seer.id)");
    expect(chat).toContain("onOpenVault?.(adviceShown.better.model.id);");
    expect(chat).toContain("afterSheetClose(() => onOpenVault?.(EMBED_MODEL_ID));");
    expect(chat).not.toMatch(/onOpenVault\?\.\(\)/);
    expect(src("../../app/voice.tsx")).toContain("params: { focus: WHISPER_MODEL_ID }");
    expect(src("../../app/index.tsx")).toContain('params: { focus } } : "/vault"');
  });
  it("the size in the attach sheet comes from the catalog, not a typed '205 MB'", () => {
    expect(src("../Chat.tsx")).not.toContain('"205 MB"');
  });
});

describe("F346 · one name for the photo pack, in every locale", () => {
  const dir = join(__dirname, "../../../../../packages/i18n/locales");
  const KEYS = ["chat.attach.visionMissing", "chat.vision.companionMissing", "chat.vision.offerCompanion", "chat.attach.installVision"];
  for (const locale of ["en", "de", "es", "fr", "ja", "ko", "pt-BR", "zh-Hant"]) {
    it(`${locale}: every line about the pack uses the name the vault card and the download dialog print`, () => {
      const l = JSON.parse(readFileSync(join(dir, `${locale}.json`), "utf8")) as Record<string, string>;
      const name = l["models.name.vision-qwen35"]!;
      expect(name, locale).toBeTruthy();
      for (const k of KEYS) expect(l[k], `${locale} ${k}`).toContain(name);
    });
  }
  it("the card, the download dialog and the details sheet all print that name", () => {
    const src = (rel: string) => readFileSync(join(__dirname, rel), "utf8");
    expect(src("ModelCard.tsx")).toContain("modelName(t, model)");
    expect(src("VaultScreen.tsx")).toContain('t("vault.confirm.title", { name: confirm ? modelName(t, confirm.entry.model) : "" })');
    expect(src("ModelDetails.tsx")).toContain('{model ? modelName(t, model) : ""}');
  });
});
