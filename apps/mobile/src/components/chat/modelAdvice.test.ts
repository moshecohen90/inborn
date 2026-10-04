import { createElement, type ReactElement, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { BUNDLED_MANIFEST, adviseModel } from "@inborn/core";

/*
 * Round 127 (28.9 iPhone pass, free tier): documents on Instant showed "Install SHARP · 2.74 GB" as the card's only offer,
 * a Pro model behind a paywall. The offer is now the best model a free user can get; Sharp may only ride along, marked PRO.
 */
vi.mock("react-native", () => {
  const host = (tag: string) => ({ children, testID }: { children?: ReactNode; testID?: string }) => createElement(tag, { "data-testid": testID }, children);
  return { Pressable: host("button"), View: host("div"), Text: host("span"), StyleSheet: { create: <T>(s: T) => s } };
});
vi.mock("react-native-svg", () => { const Svg = () => null; return { __esModule: true, default: Svg, Svg, Path: Svg, Circle: Svg, Rect: Svg, G: Svg, Line: Svg }; });
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (k: string, o?: Record<string, unknown>) => `${k}${o?.model ? `(${String(o.model)})` : ""}`, i18n: { language: "en" } }) }));
vi.mock("../../services/type", () => ({ useType: () => new Proxy({}, { get: () => ({}) }), font: () => ({}) }));
vi.mock("../../lib/models", () => ({ modelLabel: (id: string) => id.toUpperCase() }));

const { ModelAdviceCard } = await import("./ModelAdvice");
const serverRenderer: string = "react-dom/server";
const { renderToStaticMarkup } = (await import(serverRenderer)) as { renderToStaticMarkup: (el: ReactElement) => string };

const catalog = BUNDLED_MANIFEST.models;
const theme = new Proxy({}, { get: () => "#000" }) as never;
const advice = (pro: boolean) =>
  adviseModel({ current: catalog.find((m) => m.id === "instant"), use: "documents", languageCode: "en", device: { ramGB: 6, deviceClass: "phone", pro }, installed: ["instant"], catalog })!;
const render = (pro: boolean) =>
  renderToStaticMarkup(createElement(ModelAdviceCard, { advice: advice(pro), theme, locked: false, bestLocked: !pro, onSwitch() {}, onInstall() {}, onNotNow() {} }));

describe("the model advice card on a free 6 GB phone", () => {
  it("offers Fast as the one button and names Sharp only on a second line marked PRO", () => {
    const html = render(false);
    expect(html).toContain("chat.modelAdvice.install(FAST)");
    expect(html).not.toContain("chat.modelAdvice.install(SHARP)");
    expect(html).toContain("chat.modelAdvice.best(SHARP)");
    expect(html).toMatch(/data-testid="model-advice-best">.*data-testid="model-advice-best-pro"><span>vault\.pro<\/span>/);
  });
  it("a Pro user is offered Sharp directly, with no PRO tag on any line", () => {
    const html = render(true);
    expect(html).toContain("chat.modelAdvice.install(SHARP)");
    expect(html).not.toContain("model-advice-best-pro");
  });
});
