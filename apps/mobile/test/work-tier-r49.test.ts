import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Round 49 — what the OnePlus 6T pass found while driving the $69.99 Work card end to end. The screens need a device,
 * so what can be asserted without one lives here, the way `fixes-r34.test.ts` does; the behaviour is proven on the
 * phone and the evidence is in docs/qa/work-tier-6t/.
 */
const SRC = join(__dirname, "../src");
const source = (p: string) => readFileSync(join(SRC, p), "utf8");
const en = JSON.parse(readFileSync(join(__dirname, "../../../packages/i18n/locales/en.json"), "utf8")) as Record<string, string>;

describe("F215 · the chat row's action menu is reachable without a touch gesture", () => {
  const src = source("screens/Chats.tsx");
  const row = /const renderRow = \(item: Chat\) => \{[\s\S]*?\n {2}\};/.exec(src)?.[0] ?? "";

  it("the row exposes a long-press accessibility action", () => {
    expect(row, "renderRow must be found").toContain("testID={`chat-row-${item.id}`}");
    expect(row).toContain('accessibilityActions=');
    expect(row).toMatch(/name: "longpress"/);
  });

  it("that action opens the same menu the touch gesture opens", () => {
    const handler = /onAccessibilityAction=\{[\s\S]*?\n {8}\}\}/.exec(row)?.[0] ?? "";
    expect(handler, "the action needs a handler").toMatch(/actionName === "longpress"/);
    expect(handler).toContain("setMenu({ chat: item, renaming: false, title: item.title })");
    expect(handler, "selection mode swallows the long press, so it must swallow the action too").toContain("!selecting");
  });

  it("the action carries a translated label", () => {
    expect(row).toContain('t("chats.more")');
    expect(en["chats.more"]).toBe("More actions");
  });
});
