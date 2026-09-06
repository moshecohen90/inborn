import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { IntlMessageFormat } from "intl-messageformat";

/* Hermes has no Intl.PluralRules: the engine is stubbed out here, then the phone entry (`intl/index.native`) must restore ICU plurals. */
const native = Intl.PluralRules;
const intl = Intl as unknown as { PluralRules?: typeof Intl.PluralRules };

describe("Intl.PluralRules polyfill (Hermes)", () => {
  beforeAll(() => {
    delete intl.PluralRules;
    expect(() => new IntlMessageFormat("{count, plural, one {# model} other {# models}}", "en").format({ count: 1 })).toThrow();
  });
  afterAll(() => {
    Object.defineProperty(Intl, "PluralRules", { value: native, writable: true, configurable: true });
  });

  it("installs only the missing pieces and formats models.count for 1 and 2", async () => {
    const { installed } = await import("../src/intl/index.native");
    expect(installed.pluralRules).toBe(true);
    expect(intl.PluralRules).toBeDefined();
    expect(new Intl.PluralRules("he").select(2)).toBe("two");
    const { initI18n } = await import("../src/index");
    const i18n = await initI18n("en");
    expect(i18n.t("models.count", { count: 1 })).toBe("1 model on this device");
    expect(i18n.t("models.count", { count: 2 })).toBe("2 models on this device");
    expect(i18n.t("vault.details.tokens", { count: 1 })).toBe("1 token");
  });
});
