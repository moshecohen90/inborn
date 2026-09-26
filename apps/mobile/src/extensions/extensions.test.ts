import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement, type ReactElement, type ReactNode } from "react";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { BUNDLED_MANIFEST, MODELS_ORIGIN, extensions, findExtension, registerExtension, type Extension } from "@inborn/core";
import type { ExtensionState } from "./state";

/*
 * F406 (round 105): one registry drives the hold card, the vault's Extensions section and the downloader. A third
 * extension must light all three up with one registry entry and one locale block: registered here as `ocr-fake`.
 */
vi.mock("react-native", () => {
  const host = (tag: string) => ({ children, testID }: { children?: ReactNode; testID?: string }) => createElement(tag, { "data-testid": testID }, children);
  return { Pressable: host("button"), View: host("div"), Text: host("span"), StyleSheet: { create: <T>(s: T) => s }, Platform: { OS: "web", select: (o: Record<string, unknown>) => o.web ?? o.default } };
});
vi.mock("react-native-svg", () => { const Svg = () => null; return { __esModule: true, default: Svg, Svg, Path: Svg, Circle: Svg, Rect: Svg, G: Svg, Line: Svg }; });
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (k: string) => k, i18n: { language: "en" } }) }));
vi.mock("../services/type", () => ({ useType: () => new Proxy({}, { get: () => ({}) }), font: () => ({}) }));
vi.mock("../adapters/tauri", () => ({ isTauri: () => false }));
vi.mock("../web/boot", () => ({ ALLOWED_MODEL_ORIGINS: ["https://models.inbornapp.com"] }));

const downloads: { url: string; file: string; bytes: number; sha256?: string }[] = [];
let manifest: unknown = { companions: [] };
type Delivery = { parseCompanion: (m: never, id: string, allowed: string[], origin: string) => unknown };
vi.mock("../web/modelDelivery", async (orig) => {
  const real = (await orig()) as Delivery;
  return {
    ...real,
    fetchCompanion: async (id: string, allowed: string[]) => real.parseCompanion(manifest as never, id, allowed, "https://app.inbornapp.com"),
    WebModelDelivery: class {
      async download(src: { url: string; file: string; bytes: number; sha256?: string }, on: (e: unknown) => void) {
        downloads.push(src);
        on({ type: "progress", have: 1, total: src.bytes });
        return { type: "done", have: src.bytes, sha256: src.sha256 ?? "", verified: true };
      }
      cancel() {}
    },
  };
});
const onDisk = new Set<string>();
vi.mock("../web/opfs", () => ({
  opfsSupported: () => true,
  opfsUri: (f: string) => `opfs://models/${f}`,
  modelStatus: async (f: string) => (onDisk.has(f) ? { kind: "ready", meta: {} } : { kind: "missing" }),
  readyModelStatus: async (f: string) => {
    onDisk.add(f);
    return { kind: "ready", meta: {} };
  },
  deleteModel: async (f: string) => void onDisk.delete(f),
}));

const store = await import("./store");
const { holdView, holdTestIds, vaultRowState } = await import("./card");
const { ExtensionHoldCard } = await import("../components/chat/ExtensionHoldCard");
const { ExtensionsSection } = await import("../components/ExtensionsSection");
const serverRenderer: string = "react-dom/server";
const { renderToStaticMarkup } = (await import(serverRenderer)) as { renderToStaticMarkup: (el: ReactElement) => string };
const repo = join(__dirname, "../../../..");
const web = (await import(/* @vite-ignore */ join(repo, "scripts/web-manifest.mjs"))) as { webManifest: (base: string, catalog?: unknown, registry?: unknown) => { companions: { id: string; kind: string; delivery: { url: string }[] }[] }; readCatalog: () => unknown; readExtensions: () => Extension[] };

const theme = new Proxy({}, { get: () => "#000" }) as never;
const fake: Extension = { id: "ocr-fake", kind: "ocr", file: "ocr-fake.gguf", bytes: 12_345_678, sha256: "a".repeat(64), path: "ocr-fake.gguf", appliesTo: { mime: ["application/pdf"] }, bundledOn: [], fallback: null };
const undo = registerExtension(fake);
afterAll(undo);
beforeEach(() => {
  downloads.length = 0;
  onDisk.clear();
  manifest = web.webManifest(`${MODELS_ORIGIN}/v1`, web.readCatalog(), [...web.readExtensions(), fake]);
});

const e5 = findExtension("embed-e5")!;
const vision = findExtension("vision-qwen35")!;

describe("F406 · the hold card is data from the registry", () => {
  it("the index card: why + size, Download, the word-search fallback and Cancel, under the round-93 testIDs", () => {
    const v = holdView(e5, { kind: "missing", bytes: e5.bytes }, { count: 2, size: "468 MB" });
    expect(v.body).toEqual({ key: "extensions.embed-e5.why", params: { count: 2, size: "468 MB" } });
    expect(v.download).toEqual({ key: "extensions.download", params: { size: "468 MB" } });
    expect(v.fallback).toEqual({ key: "extensions.embed-e5.fallback" });
    expect(holdTestIds(e5)).toMatchObject({ card: "docs-hold", download: "docs-hold-download", fallback: "docs-hold-words", cancel: "docs-hold-cancel", error: "docs-hold-error" });
  });
  it("the photo card has no fallback: nothing reads a photo without the pack", () => {
    const v = holdView(vision, { kind: "missing", bytes: vision.bytes }, { count: 1, size: "205 MB" });
    expect(v.fallback).toBeNull();
    expect(v.cancel).toEqual({ key: "extensions.vision-qwen35.cancel", params: { count: 1 } });
    expect(holdTestIds(vision)).toMatchObject({ card: "vision-hold", download: "vision-hold-download", cancel: "vision-hold-remove" });
  });
  it("a failure keeps the F349 error for the plain sentence and offers Try again; a running download offers nothing to press twice", () => {
    const failed = holdView(e5, { kind: "failed", error: "HTTP 404", bytes: 1 }, { count: 1, size: "1 B" });
    expect(failed.error).toBe("HTTP 404");
    expect(failed.download?.key).toBe("extensions.retry");
    const running = holdView(e5, { kind: "downloading", bytes: 50, total: 100 }, { count: 1, size: "" });
    expect(running.download).toBeNull();
    expect(running.body).toEqual({ key: "extensions.embed-e5.downloading", params: { pct: 50 } });
  });
  it("a host that does not serve it says so, with no Download button", () => {
    const v = holdView(vision, { kind: "unavailable" }, { count: 1, size: "" });
    expect(v.download).toBeNull();
    expect(v.body.key).toBe("extensions.vision-qwen35.unavailable");
  });
  it("the vault row says included for a bundled pack and never offers to remove it", () => {
    const s: ExtensionState = { kind: "ready", bundled: true };
    expect(vaultRowState(s, "205 MB").key).toBe("extensions.state.included");
    expect(vaultRowState({ kind: "ready" }, "205 MB").key).toBe("extensions.state.installed");
  });
});

describe("F406 · a third extension is one registry entry and one locale block", () => {
  it("the hold card lights up for it", async () => {
    await store.refreshExtension("ocr-fake");
    const html = renderToStaticMarkup(createElement(ExtensionHoldCard, { extensionId: "ocr-fake", theme, count: 1, onCancel() {} }));
    expect(html).toContain('data-testid="ext-hold-ocr-fake"');
    expect(html).toContain('data-testid="ext-hold-ocr-fake-download"');
    expect(html).toContain("extensions.ocr-fake.why");
    expect(html).toContain('data-testid="ext-hold-ocr-fake-cancel"');
    expect(html).not.toContain("ext-hold-ocr-fake-fallback");
  });
  it("the vault's Extensions section lists it after the two shipped ones", async () => {
    const html = renderToStaticMarkup(createElement(ExtensionsSection, { theme }));
    const rows = [...html.matchAll(/data-testid="ext-row-([^"]+)"/g)].map((m) => m[1]);
    expect(rows).toEqual(["embed-e5", "vision-qwen35", "ocr-fake"]);
    expect(html).toContain("extensions.ocr-fake.name");
    expect(html).toContain('data-testid="ext-download-ocr-fake"');
  });
  it("the web catalog carries it and the downloader fetches it from the CDN into OPFS, then Remove deletes it", async () => {
    const c = (manifest as { companions: { id: string; kind: string; delivery: { url: string }[] }[] }).companions.find((x) => x.id === "ocr-fake");
    expect(c).toMatchObject({ kind: "ocr", delivery: [{ url: `${MODELS_ORIGIN}/v1/ocr-fake.gguf` }] });
    const end = await store.installExtension("ocr-fake");
    expect(downloads).toEqual([{ id: "ocr-fake", tier: "instant", name: "ocr-fake", file: "ocr-fake.gguf", bytes: 12_345_678, sha256: "a".repeat(64), url: `${MODELS_ORIGIN}/v1/ocr-fake.gguf` }]);
    expect(end).toEqual({ kind: "ready" });
    expect(store.extensionUri("ocr-fake")).toBe("opfs://models/ocr-fake.gguf");
    await store.removeExtension("ocr-fake");
    expect(store.extensionState("ocr-fake").kind).toBe("missing");
  });
  it("the shipped two go down the same path: the projector's download URL is the CDN one", async () => {
    await store.installExtension("vision-qwen35");
    expect(downloads.map((d) => d.url)).toEqual([`${MODELS_ORIGIN}/v1/${vision.file}`]);
  });
  it("a host whose catalog does not list it gets no Download (unavailable), and the index stays first", async () => {
    manifest = { companions: [] };
    await expect(store.refreshExtension("vision-qwen35")).resolves.toEqual({ kind: "unavailable" });
    expect(extensions()[0]!.id).toBe("embed-e5");
  });
});

describe("F406 · every shipped extension has its locale block in all eight languages and the pseudo-locale", () => {
  const LEAVES = ["name", "why", "downloading", "unavailable", "cancel", "vault"];
  for (const loc of ["en", "de", "fr", "es", "pt-BR", "ja", "ko", "zh-Hant", "pseudo"]) {
    it(loc, () => {
      const l = JSON.parse(readFileSync(join(repo, `packages/i18n/locales/${loc}.json`), "utf8")) as Record<string, string>;
      for (const ext of extensions().filter((e) => e.id !== "ocr-fake")) {
        for (const leaf of [...LEAVES, ...(ext.fallback ? ["fallback"] : [])]) expect(l[`extensions.${ext.id}.${leaf}`], `${loc} ${ext.id}.${leaf}`).toBeTruthy();
        expect(l[`extensions.${ext.id}.name`], `${loc} ${ext.id}`).toBe(l[`models.name.${ext.id}`]);
      }
      for (const k of ["extensions.section", "extensions.onDemand", "extensions.download", "extensions.retry", "extensions.stuck", "extensions.remove", "web.download.extensionsLater"]) expect(l[k], `${loc} ${k}`).toBeTruthy();
    });
  }
  it("the registry and the catalog agree", () => {
    for (const ext of extensions().filter((e) => e.id !== "ocr-fake")) expect(BUNDLED_MANIFEST.models.find((m) => m.id === ext.id)?.sha256).toBe(ext.sha256);
  });
});

describe("F407 · the browser can see once the photo pack is in", () => {
  it("Instant sees, Fast and Sharp do not (one projector, one embedding width), and the pack resolves only once verified", async () => {
    const v = await import("../images/vision");
    const { fitWithin } = await import("../images/scale");
    expect(v.modelHasVision("instant")).toBe(true);
    expect(v.modelHasVision("fast")).toBe(false);
    expect(v.modelHasVision("chrome-prompt-api")).toBe(false);
    expect(v.visionChatModel()?.id).toBe("instant");
    await v.visionScanned();
    expect(v.resolveVision()).toBeNull();
    await v.installVision();
    expect(v.resolveVision()).toBe(`opfs://models/${vision.file}`);
    expect(fitWithin(4032, 3024)).toEqual({ width: 1024, height: 768 });
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 });
  });
  it("the wllama adapter loads the projector with the model and hands photos over as image parts", () => {
    const src = readFileSync(join(__dirname, "../adapters/wllama.ts"), "utf8");
    expect(src).toContain("async enableVision(mmprojUri: string)");
    expect(src).toContain('wllama.supportInputModality("image")');
    expect(src).toContain('type: "image" as const, data');
  });
});
