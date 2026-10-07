import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createElement, type ReactElement, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { BUNDLED_MANIFEST, type CatalogModel, type InstallState } from "@inborn/core";

/*
 * Round 126 (F456). Build 28 on the iPhone, Fast selected, Sharp not installed: the vault's Extensions list offered
 * "PHOTO PACK FOR SHARP · Install · 672 MB from models.inbornapp.com". Moshe (28.9): the app never offers a download the
 * current selection cannot use. A pack whose model is not on the device offers none and says "Install Sharp first".
 */
const web = vi.hoisted(() => ({ installed: { instant: false, fast: true } as Record<string, boolean> }));

vi.mock("react-native", () => {
  const host = (tag: string) => ({ children, testID }: { children?: ReactNode; testID?: string }) => createElement(tag, { "data-testid": testID }, children);
  return { Pressable: host("button"), View: host("div"), Text: host("span"), StyleSheet: { create: <T>(s: T) => s }, Platform: { OS: "ios", select: (o: Record<string, unknown>) => o.ios ?? o.default } };
});
vi.mock("react-native-svg", () => { const Svg = () => null; return { __esModule: true, default: Svg, Svg, Path: Svg, Circle: Svg, Rect: Svg, G: Svg, Line: Svg }; });
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (k: string, o?: { defaultValue?: string; model?: string; size?: string }) =>
      k.startsWith("models.name.") ? `name(${k.slice(12)})` : o?.model !== undefined ? `${k}(${o.model})` : o?.size !== undefined ? `${k}(${o.size})` : (o?.defaultValue ?? k),
    i18n: { language: "en" },
  }),
}));
vi.mock("../src/services/type", () => ({ useType: () => new Proxy({}, { get: () => ({}) }), font: () => ({}) }));
vi.mock("../src/lib/deviceNoun", () => ({ deviceNoun: () => "phone" }));
vi.mock("../src/screens/vault/FitMap", () => ({ FitMap: () => null }));
vi.mock("../src/adapters/tauri", () => ({ isTauri: () => false }));
/* A browser that offers Instant and Fast and holds Fast only: step 1 of the lead's walk. */
vi.mock("../src/web/boot", () => ({
  ALLOWED_MODEL_ORIGINS: ["https://models.inbornapp.com"],
  webBoot: () => ({
    engine: "wllama",
    choices: [
      { source: { id: "instant", tier: "instant", name: "Instant", file: "Qwen3.5-0.8B-Q4_K_M.gguf", bytes: 532_517_120, url: "/models/instant.gguf" }, installed: web.installed.instant },
      { source: { id: "fast", tier: "fast", name: "Fast", file: "Qwen3.5-2B-Q4_K_M.gguf", bytes: 1_280_835_840, url: "/models/fast.gguf" }, installed: web.installed.fast },
    ],
  }),
  chooseWebModel: async () => null,
  onStoredModels: () => () => undefined,
  refreshStoredModels: async () => undefined,
}));

const { packOffer, packNeedsModel } = await import("../src/vault/packOffer");
const { ModelCard } = await import("../src/screens/vault/ModelCard");
const { ExtensionsSection } = await import("../src/components/ExtensionsSection");
const serverRenderer: string = "react-dom/server";
const { renderToStaticMarkup } = (await import(serverRenderer)) as { renderToStaticMarkup: (el: ReactElement) => string };

const byId = (id: string): CatalogModel => BUNDLED_MANIFEST.models.find((m) => m.id === id)!;
const absent: InstallState = { kind: "not-installed" };
const bundled: InstallState = { kind: "ready", via: "bundled", bytes: 1, path: "/x", sha256: "" };
const downloaded: InstallState = { kind: "ready", via: "https", bytes: 1, path: "/x", sha256: "" };
/* Build 28's phone: Instant bundled, Fast downloaded, Sharp not installed. */
const onPhone = (extra: string[] = []) => (id: string) => ["instant", "fast", ...extra].includes(id);

describe("F456 · the resolver: a pack offers a download only when its model is here", () => {
  it("Sharp's pack with Sharp absent needs the model; with Sharp installed it is an install", () => {
    expect(packOffer(byId("vision-qwen35-4b"), absent, onPhone())).toBe("needs-model");
    expect(packNeedsModel("vision-qwen35-4b", onPhone())).toBe("sharp");
    expect(packOffer(byId("vision-qwen35-4b"), absent, onPhone(["sharp"]))).toBe("install");
    expect(packNeedsModel("vision-qwen35-4b", onPhone(["sharp"]))).toBeNull();
  });
  it("the bundled Instant pack on iOS is included, and Fast's pack after its install is installed", () => {
    expect(packOffer(byId("vision-qwen35"), bundled, onPhone())).toBe("included");
    expect(packOffer(byId("vision-qwen35-2b"), downloaded, onPhone())).toBe("installed");
  });
  it("a failed or corrupt pack for an absent model is not offered again either; one for a present model is", () => {
    const failed: InstallState = { kind: "failed", error: "HTTP 500", via: "https", retryable: true };
    expect(packOffer(byId("vision-qwen35-4b"), failed, onPhone())).toBe("needs-model");
    expect(packOffer(byId("vision-qwen35-2b"), failed, onPhone())).toBe("install");
  });
  it("an extension that serves every model (the document index) never waits for one", () => {
    expect(packOffer(byId("embed-e5"), absent, () => false)).toBe("install");
    expect(packNeedsModel("embed-e5", () => false)).toBeNull();
  });
});

const theme = new Proxy({}, { get: () => "#000" }) as never;
const device = { ramGB: 6, deviceClass: "phone", chip: "ios-mid", os: "ios" } as never;
const plan = { via: "https" as const, origin: "models.inbornapp.com", host: "models.inbornapp.com", bytes: 672_423_616 };
const card = (id: string, state: InstallState, modelReady: (id: string) => boolean) =>
  renderToStaticMarkup(
    createElement(ModelCard, { model: byId(id), state, plan, device, theme, recommended: false, active: false, lockedForTier: false, modelReady, onInstall() {}, onCancel() {}, onPause() {}, onResume() {}, onUse() {}, onDetails() {} }),
  );

describe("F456 · the phone's vault card (J6-02: Fast selected, Sharp not installed)", () => {
  it("Sharp's pack has no Install button and reads 'Install Sharp first'; its size stays on the detail line", () => {
    const html = card("vision-qwen35-4b", absent, onPhone());
    expect(html).not.toContain('data-testid="install-vision-qwen35-4b"');
    expect(html).not.toContain("vault.installFrom");
    expect(html).not.toContain('data-testid="import-vision-qwen35-4b"');
    expect(html).toMatch(/data-testid="model-status-vision-qwen35-4b">vault\.state\.needsModel\(Sharp\)</);
    expect(html).toMatch(/data-testid="model-spec-vision-qwen35-4b">[^<]*672 MB/);
    expect(html).toContain('data-testid="details-vision-qwen35-4b"');
  });
  it("once Sharp is installed, the same card offers its Install exactly as before", () => {
    const html = card("vision-qwen35-4b", absent, onPhone(["sharp"]));
    expect(html).toContain('data-testid="install-vision-qwen35-4b"');
    expect(html).not.toContain("vault.state.needsModel");
  });
  it("the Instant pack stays 'Included with the app' and Fast's pack 'Installed'", () => {
    expect(card("vision-qwen35", bundled, onPhone())).toMatch(/data-testid="model-status-vision-qwen35">vault\.state\.bundled</);
    expect(card("vision-qwen35-2b", downloaded, onPhone())).toMatch(/data-testid="model-status-vision-qwen35-2b">vault\.installed</);
  });
  it("a chat model's card is untouched by the rule", () => {
    expect(card("sharp", absent, onPhone())).toContain('data-testid="install-sharp"');
  });
  it("the vault passes each card whether a chat model is on the device", () => {
    const vault = readFileSync(join(__dirname, "../src/screens/vault/VaultScreen.tsx"), "utf8");
    expect(vault).toContain("modelReady={modelReady}");
    expect(vault).toContain('vault.state(id).kind === "ready"');
  });
});

describe("F456 · the browser's Extensions rows follow the same rule", () => {
  it("with Fast stored and Instant not, Instant's pack offers no Download and names Instant; Fast's pack keeps Download", () => {
    const html = renderToStaticMarkup(createElement(ExtensionsSection, { theme }));
    expect(html).not.toContain('data-testid="ext-download-vision-qwen35"');
    expect(html).toMatch(/data-testid="ext-state-vision-qwen35">vault\.state\.needsModel\(Instant\)</);
    expect(html).toContain('data-testid="ext-download-vision-qwen35-2b"');
    expect(html).toContain('data-testid="ext-download-embed-e5"');
    /* Sharp is not offered in a browser, so its pack stays off the list (round 117). */
    expect(html).not.toContain("ext-row-vision-qwen35-4b");
  });
  it("once Instant is stored, its pack offers Download again", () => {
    web.installed.instant = true;
    try {
      const html = renderToStaticMarkup(createElement(ExtensionsSection, { theme }));
      expect(html).toContain('data-testid="ext-download-vision-qwen35"');
      expect(html).not.toContain("vault.state.needsModel");
    } finally {
      web.installed.instant = false;
    }
  });
});

describe("F456 · 'Install {model} first' in every locale", () => {
  const dir = join(__dirname, "../../../packages/i18n/locales");
  const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
  it("English says exactly that, and every locale has the line with the model's name in it", () => {
    for (const f of files) {
      const l = JSON.parse(readFileSync(join(dir, f), "utf8")) as Record<string, string>;
      expect(l["vault.state.needsModel"], f).toContain("{model}");
      if (f !== "en.json" && f !== "pseudo.json") expect(l["vault.state.needsModel"], f).not.toMatch(/\binstall\b/i);
    }
    expect(JSON.parse(readFileSync(join(dir, "en.json"), "utf8"))["vault.state.needsModel"]).toBe("Install {model} first");
  });
});

describe("F457 · both screens that show a documents answer drop the copied passage header", () => {
  const src = (rel: string) => readFileSync(join(__dirname, "../src", rel), "utf8");
  it("Ask your documents: held back while streaming, dropped from the final answer that the chips read", () => {
    const ask = src("screens/documents/AskDocuments.tsx");
    expect(ask).toContain("setAnswer(withoutEchoedLabels(withoutEchoedInstructions(reply, instructions, { streaming: true }), { streaming: true, citations: prompt.citations }));");
    expect(ask).toContain("reply = withoutEchoedLabels(withoutEchoedInstructions(reply, instructions));");
    expect(ask.indexOf("reply = withoutEchoedLabels(withoutEchoedInstructions(reply, instructions));")).toBeLessThan(ask.indexOf("library.citationsFor(reply,"));
  });
  it("the chat with attached files: the row, its stored copy and Continue all read the same text", () => {
    const chat = src("screens/Chat.tsx");
    expect(chat).toContain("const bare = sources && !prefix ? withoutEchoedLabels(text, { streaming: live, citations: sources }) : text;");
    expect(chat).toContain("sources = rag.prompt.citations;");
    expect(chat).not.toMatch(/role: "assistant",\n\s+content: reply,/);
  });
});
