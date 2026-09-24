import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const repo = join(__dirname, "../../..");
const read = (p: string) => readFileSync(join(repo, p), "utf8");
const localeDir = join(repo, "packages/i18n/locales");
const locales = readdirSync(localeDir).filter((f) => f.endsWith(".json"));
const locale = (f: string) => JSON.parse(readFileSync(join(localeDir, f), "utf8")) as Record<string, string>;

/**
 * F306. "Have a code?" is a door to the store's own redemption screen and nothing else. A code we validate ourselves
 * would need a server we do not have, or a local check anyone can forge.
 */
describe("F306 · the code row opens the store, and only where a store exists", () => {
  const paywall = read("apps/mobile/src/screens/paywall/PaywallScreen.tsx");
  it("the row is gated on the manager saying this store has a code screen", () => {
    expect(paywall).toContain("manager.canRedeemStoreCode()");
    expect(paywall).toContain('testID="redeem-code"');
    expect(paywall).toContain("void manager.redeemStoreCode()");
  });
  it("the native provider hands the tap to expo-iap, and the web/licence-key provider has no such screen", () => {
    expect(read("apps/mobile/src/licence/provider.native.ts")).toContain("iap.openRedeemOfferCode()");
    expect(read("apps/mobile/src/licence/provider.web.ts")).not.toContain("openCodeRedemption");
  });
  it("nothing in the app reads, stores or validates a code itself", () => {
    /* The only code the app ever touches is a Paddle licence key, which is signed and verified offline (§12.4 row 4). */
    expect(paywall).not.toMatch(/setCode|codeInput|validateCode/);
  });
  it("both strings exist in every locale, in every file", () => {
    for (const f of locales) {
      const d = locale(f);
      expect(d["paywall.code.title"], `${f} paywall.code.title`).toBeTruthy();
      expect(d["paywall.code.failed"], `${f} paywall.code.failed`).toBeTruthy();
    }
  });
  it("no locale promises a discount on the code row: a Play code is free-only", () => {
    for (const f of locales) {
      expect(locale(f)["paywall.code.title"], `${f} paywall.code.title`).not.toMatch(/%|discount|Rabatt|descuento|réduction|desconto|割引|할인|折扣/);
    }
  });
});

/**
 * F305. Per-market prices are whatever the store converts the one US price into. The spec promised a ratio table
 * copied from the Bible apps' subscription pricing, which nothing in this repo reads and which would go stale.
 */
describe("F305 · one US price per SKU, the store does the rest", () => {
  const spec = read("docs/spec-src/12-monetization.html");
  it("the spec no longer points at the Bible apps' pricing mechanism as the source of a local price", () => {
    expect(spec).toContain("מה שהחנות גוזרת בעצמה");
    expect(spec).not.toMatch(/ברזיל ≈ 36%/);
  });
  it("no source file derives a price from a country ratio", () => {
    expect(read("apps/mobile/src/screens/paywall/PaywallScreen.tsx")).toContain("manager.priceOf(offer.productId)");
    for (const f of locales) expect(locale(f)["paywall.web.priceNote"], `${f}`).toBeTruthy();
  });
});

/**
 * F307. The terms promised "a discount code" for a purchase made on another store. Apple can issue one and Play
 * cannot: its percentage codes are subscriptions-only. The promise is now the same-store upgrade, which is a real
 * store price, plus a free code at support's discretion.
 */
describe("F307 · the written promise is one the stores can keep", () => {
  const terms = read("docs/legal/terms.md");
  const siteDir = join(repo, "apps/site/src/i18n");
  const supportIn = (f: string) => (JSON.parse(readFileSync(join(siteDir, f), "utf8")) as Record<string, string>)["support.settings-restore-purchases-signed-in"];
  const support = supportIn("en.json");
  it("neither the terms nor the site promises a cross-store discount code any more", () => {
    for (const [name, text] of [["terms.md", terms], ["support (en)", support]] as const) {
      expect(text, name).not.toMatch(/receipt for a discount code/);
      expect(text, name).toContain("no particular discount is promised");
      expect(text, name).toContain("$49.99");
    }
  });
  it("every language of the support page names the same-store upgrade price", () => {
    for (const f of readdirSync(siteDir).filter((x) => x.endsWith(".json"))) {
      expect(supportIn(f), f).toMatch(/49\.99/);
      expect(supportIn(f), f).toMatch(/69\.99/);
    }
  });
  it("the codes a human has to create in each console are written down", () => {
    const codes = read("docs/store/codes.md");
    expect(codes).toContain("26 March 2026");
    expect(codes).toContain("inborn.work.upgrade");
    expect(codes).toMatch(/500 codes per quarter/);
  });
});
