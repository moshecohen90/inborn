import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement, type ReactElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BUNDLED_MANIFEST, MODELS_ORIGIN, formatModelBytes, photoPlan, type PhotoPlan } from "@inborn/core";

/*
 * Round 117 (F437): the one photo card. Moshe, Fast selected on the web, was offered Instant's 205 MB pack, then told
 * Fast cannot see, then asked for Instant (533 MB). The card now offers only the selected model's own pack, names the
 * cheaper way out with its whole cost, and fetches a way out in one tap.
 */
vi.mock("react-native", () => {
  const host = (tag: string) => ({ children, testID }: { children?: ReactNode; testID?: string }) => createElement(tag, { "data-testid": testID }, children);
  return { Pressable: host("button"), View: host("div"), Text: host("span"), StyleSheet: { create: <T>(s: T) => s }, Platform: { OS: "web", select: (o: Record<string, unknown>) => o.web ?? o.default } };
});
vi.mock("react-native-svg", () => { const Svg = () => null; return { __esModule: true, default: Svg, Svg, Path: Svg, Circle: Svg, Rect: Svg, G: Svg, Line: Svg }; });
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (k: string, o?: Record<string, unknown>) => (o ? `${k}(${Object.entries(o).map(([a, b]) => `${a}=${String(b)}`).join(",")})` : k), i18n: { language: "en" } }) }));
vi.stubGlobal("location", { origin: "https://app.inbornapp.com", assign: () => undefined });
vi.mock("../services/type", () => ({ useType: () => new Proxy({}, { get: () => ({}) }), font: () => ({}) }));
vi.mock("../adapters/tauri", () => ({ isTauri: () => false }));
/* A browser that has Fast and not Instant: Moshe's. */
vi.mock("../web/boot", () => ({
  ALLOWED_MODEL_ORIGINS: ["https://models.inbornapp.com"],
  webBoot: () => ({
    engine: "wllama",
    choices: [
      { source: { id: "instant", tier: "instant", name: "Instant", file: "Qwen3.5-0.8B-Q4_K_M.gguf", bytes: 532_517_120, url: "https://models.inbornapp.com/v1/Qwen3.5-0.8B-Q4_K_M.gguf" }, installed: false },
      { source: { id: "fast", tier: "fast", name: "Fast", file: "Qwen3.5-2B-Q4_K_M.gguf", bytes: 1_280_835_840, url: "https://models.inbornapp.com/v1/Qwen3.5-2B-Q4_K_M.gguf" }, installed: true },
    ],
  }),
  chooseWebModel: async () => null,
  onStoredModels: () => () => undefined,
  refreshStoredModels: async () => undefined,
}));
const downloads: string[] = [];
vi.mock("../web/modelDelivery", async (orig) => {
  const real = (await orig()) as { parseCompanion: (m: never, id: string, allowed: string[], origin: string) => unknown };
  const web = (await import(/* @vite-ignore */ `${process.cwd()}/../../scripts/web-manifest.mjs`)) as { webManifest: (base: string) => unknown };
  return {
    ...real,
    fetchCompanion: async (id: string, allowed: string[]) => real.parseCompanion(web.webManifest(`${MODELS_ORIGIN}/v1`) as never, id, allowed, "https://app.inbornapp.com"),
    WebModelDelivery: class {
      async download(src: { file: string; bytes: number; sha256?: string }, on: (e: unknown) => void) {
        downloads.push(src.file);
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
vi.mock("../web/transfers", () => ({ recordWebTransfer: () => undefined }));

const { photoHoldView, partOf } = await import("./photoCard");
const { installPath, pathState } = await import("./photoPath");
const { PhotoHoldCard } = await import("../components/chat/PhotoHoldCard");
const serverRenderer: string = "react-dom/server";
const { renderToStaticMarkup } = (await import(serverRenderer)) as { renderToStaticMarkup: (el: ReactElement) => string };

const chat = BUNDLED_MANIFEST.models.filter((m) => m.role === "chat");
const plan = (selected: string, installed: string[]) => photoPlan({ selected, models: chat, installed: (id) => installed.includes(id) }) as Exclude<PhotoPlan, { kind: "send" }>;
const names = { count: 1, model: "Fast", seer: "Instant", size: formatModelBytes };
const theme = new Proxy({}, { get: () => "#000" }) as never;
const noop = () => undefined;

beforeEach(() => {
  downloads.length = 0;
});

const en = JSON.parse(readFileSync(join(__dirname, "../../../../packages/i18n/locales/en.json"), "utf8")) as Record<string, string>;

describe("F437 · case (a): the selected model sees with its own pack", () => {
  it("Fast, fresh: one card, Fast's pack at 668 MB, no Instant (738 MB would cost more), never the 205 MB projector", () => {
    const v = photoHoldView(plan("fast", ["fast"]), "own", null, names);
    expect(v.title).toEqual({ key: "chat.vision.packTitle", params: { model: "Fast" } });
    expect(v.body).toEqual({ key: "chat.vision.packBody", params: { count: 1, size: "668 MB" } });
    expect(v.primary).toEqual({ action: "download", label: { key: "chat.vision.download", params: { size: "668 MB" } } });
    expect(v.secondary).toBeNull();
    expect(v.caption).toBeNull();
    expect(JSON.stringify(v)).not.toContain("205 MB");
  });

  it("Moshe's browser (Instant's pack already in, Instant not): Switch to Instant · 533 MB, and it is said to be smaller", () => {
    const v = photoHoldView(plan("fast", ["fast", "vision-qwen35"]), "own", null, names);
    expect(v.secondary).toEqual({ key: "chat.vision.switchToCost", params: { seer: "Instant", size: "533 MB" } });
    expect(v.caption).toEqual({ key: "chat.vision.smaller" });
  });

  it("a phone, where Instant and its pack come with the app: Switch to Instant, no size", () => {
    const v = photoHoldView(plan("fast", ["fast", "instant", "vision-qwen35"]), "own", null, names);
    expect(v.secondary).toEqual({ key: "chat.vision.switchTo", params: { seer: "Instant" } });
  });

  it("while the pack downloads: '53 of 668 MB' with a bar, and nothing to press twice", () => {
    const v = photoHoldView(plan("fast", ["fast"]), "own", { kind: "downloading", bytes: 334_113_632, total: 668_227_264 }, names);
    expect(v.body).toEqual({ key: "chat.vision.downloadingPack", params: { have: "334", total: "668 MB" } });
    expect(v.progress).toBe(0.5);
    expect(v.primary).toBeNull();
    expect(v.secondary).toBeNull();
  });

  it("the way out, once tapped, says it switches and counts in its own megabytes", () => {
    const v = photoHoldView(plan("fast", ["fast", "vision-qwen35"]), "alt", { kind: "downloading", bytes: 53_000_000, total: 532_517_120 }, names);
    expect(v.title).toEqual({ key: "chat.vision.altTitle", params: { seer: "Instant" } });
    expect(v.body).toEqual({ key: "chat.vision.downloadingSeer", params: { seer: "Instant", have: "53", total: "533 MB" } });
  });
});

describe("F437 · case (b): Sharp (Phi) cannot see, and the one step names its whole cost", () => {
  const phi = { ...names, model: "Sharp (Phi)" };
  it("nothing installed: the body names Instant (533 MB) and its pack (205 MB), the button 738 MB", () => {
    const v = photoHoldView(plan("sharp-phi", ["sharp-phi"]), "own", null, phi);
    expect(v.title).toEqual({ key: "chat.vision.holdTitleModel", params: { model: "Sharp (Phi)" } });
    expect(v.body).toEqual({ key: "chat.vision.switchBody", params: { seer: "Instant", count: 1, modelSize: "533 MB", packSize: "205 MB" } });
    expect(v.primary).toEqual({ action: "switch", label: { key: "chat.vision.switchToCost", params: { seer: "Instant", size: "738 MB" } } });
    expect(v.caption).toBeNull();
  });
  it("only the model or only the pack missing: the body names that one file", () => {
    const p = plan("sharp-phi", ["sharp-phi"]);
    if (p.kind !== "switch") throw new Error(p.kind);
    const only = (i: number) => ({ ...p, alt: { ...p.alt, missing: [p.alt.missing[i]!], bytes: p.alt.missing[i]!.bytes } });
    expect(photoHoldView(only(0), "own", null, phi).body).toEqual({ key: "chat.vision.switchBodyModel", params: { seer: "Instant", count: 1, modelSize: "533 MB" } });
    expect(photoHoldView(only(1), "own", null, phi).body).toEqual({ key: "chat.vision.switchBodyPack", params: { seer: "Instant", count: 1, packSize: "205 MB" } });
  });
  it("Instant already installed: switch, and the photo sends", () => {
    const v = photoHoldView(plan("sharp-phi", ["sharp-phi", "instant", "vision-qwen35"]), "own", null, phi);
    expect(v.body.key).toBe("chat.vision.switchReady");
    expect(v.primary).toEqual({ action: "switch", label: { key: "chat.vision.switchTo", params: { seer: "Instant" } } });
  });
  it("nothing here sees: the card says so and offers no download", () => {
    const v = photoHoldView({ kind: "none" }, "own", null, phi);
    expect(v.body).toEqual({ key: "chat.attach.noVisionHere", params: { model: "Sharp (Phi)" } });
    expect(v.primary).toBeNull();
  });
});

describe("F437 · the designer's copy (English)", () => {
  it("reads as specified", () => {
    expect(en["chat.vision.packTitle"]).toBe("{model} needs its photo pack to see photos");
    expect(en["chat.vision.packBody"]).toBe("One {size} download, then {count, plural, one {this photo sends by itself} other {these photos send by themselves}}.");
    expect(en["chat.vision.switchToCost"]).toBe("Switch to {seer} · {size}");
    expect(en["chat.vision.altTitle"]).toBe("Switching to {seer}");
    expect(en["chat.vision.smaller"]).toBe("Smaller, but less accurate with photos.");
    expect(en["chat.vision.downloadingPack"]).toBe("Downloading the photo pack: {have} of {total}.");
    expect(en["chat.vision.downloadingSeer"]).toBe("Downloading {seer}: {have} of {total}.");
    expect(en["chat.vision.switchBody"]).toMatch(/That is \{seer\} \(\{modelSize\}\) and its photo pack \(\{packSize\}\)\.$/);
    expect(en["extensions.state.installedNoModel"]).toBe("Installed · {size} · {model} not downloaded");
    const card = ["packTitle", "packBody", "download", "switchTo", "switchToCost", "altTitle", "smaller", "downloadingPack", "downloadingSeer", "switchBody", "switchBodyModel", "switchBodyPack", "switchReady"];
    for (const k of card) expect(en[`chat.vision.${k}`], k).not.toMatch(/…|instead/);
  });
  it("a part is counted in the whole's unit", () => {
    expect(partOf(53_000_000, 668_227_264)).toEqual({ have: "53", total: "668 MB" });
    expect(partOf(640_000_000, 1_280_835_840)).toEqual({ have: "0.64", total: "1.28 GB" });
  });
});

describe("F437 · the card as rendered, and the way out in one tap", () => {
  it("one card; the way out sits in the actions row between Download and Remove, the caption under it", () => {
    const html = renderToStaticMarkup(createElement(PhotoHoldCard, { held: plan("fast", ["fast", "vision-qwen35"]), theme, count: 1, model: "Fast", seer: "Instant", onCancel: noop, onReady: noop, onSwitch: noop }));
    expect(html.match(/data-testid="vision-hold"/g)).toHaveLength(1);
    const at = (s: string) => html.indexOf(s);
    expect(at('data-testid="vision-hold-download"')).toBeGreaterThan(-1);
    expect(at('data-testid="vision-hold-download"')).toBeLessThan(at('data-testid="vision-hold-switch"'));
    expect(at('data-testid="vision-hold-switch"')).toBeLessThan(at('data-testid="vision-hold-remove"'));
    expect(at('data-testid="vision-hold-remove"')).toBeLessThan(at('data-testid="vision-hold-caption"'));
    expect(html).toContain("chat.vision.switchToCost(seer=Instant,size=533 MB)");
    expect(html).toContain("chat.vision.smaller");
    expect(html).not.toContain("205 MB");
  });

  it("Switch to Instant fetches Instant, then its pack, as one download, and the path turns ready", async () => {
    const p = plan("fast", ["fast"]);
    if (p.kind !== "pack") throw new Error(p.kind);
    const instant = { model: "instant", pack: "vision-qwen35", missing: [{ id: "instant", kind: "model" as const, bytes: 532_517_120 }, { id: "vision-qwen35", kind: "pack" as const, bytes: 204_987_232 }], bytes: 737_504_352 };
    expect(pathState(instant)).toEqual({ kind: "missing", bytes: 737_504_352 });
    const end = await installPath(instant);
    expect(downloads).toEqual(["Qwen3.5-0.8B-Q4_K_M.gguf", "mmproj-Qwen3.5-0.8B-F16.gguf"]);
    expect(end).toEqual({ kind: "ready" });
  });
});
