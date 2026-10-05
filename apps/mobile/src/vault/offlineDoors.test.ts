import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement, type ReactElement, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { BUNDLED_MANIFEST, findExtension, formatModelBytes, photoPlan, type CatalogModel, type InstallState, type PhotoPlan } from "@inborn/core";

/*
 * Round 130, the founder's question: a download tapped in Airplane Mode. Every door now says the phone is offline,
 * that a download is the one thing that needs internet, and that it starts by itself; each keeps its way out.
 */
vi.mock("react-native", () => {
  const host = (tag: string) => ({ children, testID }: { children?: ReactNode; testID?: string }) => createElement(tag, { "data-testid": testID }, children);
  return { Pressable: host("button"), View: host("div"), Text: host("span"), StyleSheet: { create: <T>(s: T) => s }, Platform: { OS: "ios", select: (o: Record<string, unknown>) => o.ios ?? o.default } };
});
vi.mock("react-native-svg", () => { const Svg = () => null; return { __esModule: true, default: Svg, Svg, Path: Svg, Circle: Svg, Rect: Svg, G: Svg, Line: Svg }; });
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (k: string, o?: { defaultValue?: string }) => o?.defaultValue ?? k, i18n: { language: "en" } }) }));
vi.mock("../services/type", () => ({ useType: () => new Proxy({}, { get: () => ({}) }), font: () => ({}) }));
vi.mock("../lib/deviceNoun", () => ({ deviceNoun: () => "phone" }));
vi.mock("../screens/vault/FitMap", () => ({ FitMap: () => null }));

const { ModelCard } = await import("../screens/vault/ModelCard");
const { fromInstallState } = await import("../extensions/installState");
const { holdView, vaultRowState } = await import("../extensions/card");
const { photoHoldView } = await import("../extensions/photoCard");
const { modelStep } = await import("../screens/Onboarding/modelStep");
const { bannerRows } = await import("../components/shell/bannerRows");
const { keepOpenNote } = await import("./keepOpen");
const serverRenderer: string = "react-dom/server";
const { renderToStaticMarkup } = (await import(serverRenderer)) as { renderToStaticMarkup: (el: ReactElement) => string };

const byId = (id: string): CatalogModel => BUNDLED_MANIFEST.models.find((m) => m.id === id)!;
const waiting = (bytes = 0, total = 0): InstallState => ({ kind: "delivering", via: "https", bytes, total, paused: false, waitingForWifi: false, needsConfirmation: false, waitingForNetwork: true });
const wifiWait: InstallState = { kind: "delivering", via: "https", bytes: 0, total: 0, paused: false, waitingForWifi: true, needsConfirmation: false };
const theme = new Proxy({}, { get: () => "#000" }) as never;
const device = { ramGB: 8, deviceClass: "phone", chip: "ios-flagship", os: "ios" } as never;
const plan = { via: "https" as const, origin: "models.inbornapp.com", host: "models.inbornapp.com", bytes: 1 };
const card = (state: InstallState) =>
  renderToStaticMarkup(createElement(ModelCard, { model: byId("fast"), state, plan, device, theme, recommended: false, active: false, onInstall() {}, onCancel() {}, onPause() {}, onResume() {}, onUse() {}, onDetails() {} }));

describe("door 2 · the vault card", () => {
  it("says offline + what to do + that it starts by itself, keeps Cancel, and offers no Pause on bytes that are not moving", () => {
    const html = card(waiting());
    expect(html).toContain('data-testid="model-offline-fast">vault.state.noInternet');
    expect(html).toContain("vault.state.waitingNetwork");
    expect(html).not.toContain("vault.state.waitingWifi");
    expect(html).toContain('data-testid="cancel-fast"');
    expect(html).not.toContain('data-testid="pause-fast"');
    expect(html).not.toContain("vault.keepOpen");
  });
  it("the Wi-Fi wait keeps its own words and no offline line", () => {
    const html = card(wifiWait);
    expect(html).toContain("vault.state.waitingWifi");
    expect(html).not.toContain("vault.state.noInternet");
  });
  it("the iPhone 'keep the app open' note is off while nothing moves", () => {
    expect(keepOpenNote("ios", waiting())).toBe(false);
  });
});

describe("door 3 · the document index card", () => {
  const e5 = findExtension("embed-e5")!;
  it("a wait for a connection is its own state, not 'stuck: open the vault'", () => {
    expect(fromInstallState(waiting(10, 100), e5.bytes, "ios")).toEqual({ kind: "offline", bytes: 10, total: 100 });
    expect(fromInstallState(wifiWait, e5.bytes, "ios")).toEqual({ kind: "stuck" });
  });
  it("the card says it, keeps 'Send, exact words only' and Cancel, and has no dead Try again", () => {
    const v = holdView(e5, { kind: "offline", bytes: 0, total: e5.bytes }, { count: 1, size: "468 MB" });
    expect(v.offline).toBe(true);
    expect(v.body).toEqual({ key: "vault.state.waitingNetwork" });
    expect(v.fallback).toEqual({ key: "extensions.embed-e5.fallback" });
    expect(v.cancel.key).toBe("extensions.embed-e5.cancel");
    expect(v.download).toBe(null);
    expect(v.openVault).toBe(false);
    expect(vaultRowState({ kind: "offline", bytes: 0, total: 1 }, "468 MB")).toEqual({ key: "vault.state.waitingNetwork" });
  });
});

describe("door 4 · the photo pack card", () => {
  const chat = BUNDLED_MANIFEST.models.filter((m) => m.role === "chat");
  const held = photoPlan({ selected: "fast", models: chat, installed: (id) => ["fast", "instant", "vision-qwen35"].includes(id) }) as Exclude<PhotoPlan, { kind: "send" }>;
  it("says it, keeps 'Switch to Instant' and Remove the photo, and offers nothing that cannot work offline", () => {
    const v = photoHoldView(held, "own", { kind: "offline", bytes: 0, total: 668_227_264 }, { count: 1, model: "Fast", seer: "Instant", size: formatModelBytes });
    expect(v.offline).toBe(true);
    expect(v.body).toEqual({ key: "vault.state.waitingNetwork" });
    expect(v.secondary?.key).toBe("chat.vision.switchTo");
    expect(v.primary).toBe(null);
    expect(v.cancel.key).toBe("extensions.vision.cancel");
  });
});

describe("door 1 · onboarding", () => {
  const instant = byId("instant");
  const fast = byId("fast");
  const entries = (fastState: InstallState) => [
    { model: instant, state: { kind: "ready", path: "x", bytes: 1, sha256: "", via: "bundled" } as InstallState, plan: null },
    { model: fast, state: fastState, plan: { via: "https" as const, host: "models.inbornapp.com", bytes: fast.bytes } },
  ];
  const step = (s: InstallState) => modelStep({ platform: "ios", entries: entries(s), recommendedId: "fast", freeBytes: 64e9, ramGB: 8, languageCode: "en", pro: false });
  it("Download Fast tapped offline is queued, says why, and leaves Instant usable now", () => {
    const s = step(waiting());
    expect(s.options.find((o) => o.id === "fast")!.state).toMatchObject({ kind: "arriving", waiting: "network" });
    expect(s.usableNow).toBe(true);
    expect(s.initialSelection).toBe("fast");
  });
  it("the Wi-Fi wait is told apart, and bytes moving carry no wait at all", () => {
    expect(step(wifiWait).options.find((o) => o.id === "fast")!.state).toMatchObject({ waiting: "wifi" });
    expect(step({ kind: "delivering", via: "https", bytes: 5, total: 10, paused: false, waitingForWifi: false, needsConfirmation: false, waitingForNetwork: false }).options.find((o) => o.id === "fast")!.state).not.toHaveProperty("waiting");
  });
  it("the screen offers 'Start now with Instant' while Fast waits, and keeps Cancel (source)", () => {
    const src = readFileSync(join(__dirname, "../screens/Onboarding/ModelChoice.tsx"), "utf8");
    expect(src).toMatch(/waitingOn \? t\("onboarding\.model\.startNowWith"/);
    expect(src).toContain('testID="cancel-download"');
    expect(src).toContain('offlineKey("vault.state.noInternet")');
  });
});

describe("the strip under the header", () => {
  const device = { recommendation: { kind: "none" }, thermal: "nominal", battery: { level: 1 } } as never;
  const act = { dismissRepair() {}, manageStorage() {}, switchToInstant() {}, switchBack() {}, continueGeneration() {}, continuePaused() {} };
  const t = (k: string, o?: Record<string, unknown>) => `${k}${o ? JSON.stringify(o) : ""}`;
  it("says the model waits for a connection instead of 'Delivering 0%'", () => {
    const rows = bannerRows({ device, storageFull: false, repair: null, pausedHere: false, delivery: { name: "FAST", status: "delivering", progress: 0, totalBytes: 1, source: "https", waiting: true } }, act, t);
    expect(rows.map((r) => r.text)).toEqual(['state.deliveryWaiting{"name":"FAST"}']);
  });
});

describe("the copy", () => {
  const dir = join(__dirname, "../../../../packages/i18n/locales");
  const KEYS = ["vault.state.noInternet", "vault.state.noInternetOffline", "vault.state.waitingNetwork", "vault.confirm.offline", "vault.confirm.offlineOffline", "state.deliveryWaiting"];
  it("is in all eight languages and the pseudo-locale, and the phone wording names Airplane Mode and Wi-Fi", () => {
    for (const loc of ["en", "de", "es", "fr", "ja", "ko", "pt-BR", "zh-Hant", "pseudo"]) {
      const json = JSON.parse(readFileSync(join(dir, `${loc}.json`), "utf8")) as Record<string, string>;
      for (const k of KEYS) expect(json[k], `${loc} ${k}`).toBeTruthy();
      expect(json["vault.state.noInternet"], loc).toMatch(/Wi-Fi|Wï-Fï/);
    }
    const en = JSON.parse(readFileSync(join(dir, "en.json"), "utf8")) as Record<string, string>;
    expect(en["vault.state.noInternet"]).toContain("Airplane Mode");
    expect(en["vault.state.noInternetOffline"]).not.toContain("Airplane");
  });
});
