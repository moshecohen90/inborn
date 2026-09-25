import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * F122 / F124b: the airplane test left the onboarding chain, so the seal screen is where a first-run user is offered it.
 * A unit test cannot render the screen in node, so the wiring and the copy are asserted on the source and the locales.
 */
const sealed = readFileSync(join(__dirname, "Sealed.tsx"), "utf8");
const locales = join(__dirname, "../../../../../packages/i18n/locales");
const load = (f: string) => JSON.parse(readFileSync(join(locales, f), "utf8")) as Record<string, string>;
const LOCALES = ["en", "de", "es", "fr", "ja", "ko", "pt-BR", "zh-Hant", "pseudo"];

describe("the seal screen offers the proof it no longer forces (F124b)", () => {
  it("renders the link and routes it to the airplane test, not to the Proof index", () => {
    expect(sealed).toMatch(/testID="sealed-prove"[\s\S]*?title=\{t\(offlineKey\("onboarding\.sealed\.prove"\)\)\}/);
    expect(sealed).toMatch(/testID="sealed-prove"[\s\S]*?router\.push\("\/proof\/airplane"\)/);
  });

  it("keeps it secondary to Start, and asleep until the seal has closed", () => {
    expect(sealed).toMatch(/testID="sealed-prove"[\s\S]*?variant="link"/);
    expect(sealed).toMatch(/testID="sealed-prove"[\s\S]*?disabled=\{!done\}/);
    /* Start stays the primary action: the offer must not become the thing the screen asks for. */
    expect(sealed.indexOf('testID="sealed-start"')).toBeLessThan(sealed.indexOf('testID="sealed-prove"'));
  });

  it("says what it does in the label itself, in every locale, so it is an offer and not an instruction", () => {
    for (const name of LOCALES) {
      const value = load(`${name}.json`)["onboarding.sealed.prove"];
      expect(value, name).toBeTruthy();
      expect(value!.length, name).toBeLessThan(60);
      /* The reason travels with the label: every language names the mode the user is being asked to turn on. */
      expect(value!, name).toMatch(/avión|avião|avion|Flugmodus|Airplane|機内モード|비행기 모드|飛航模式|Åïrplàñé/);
    }
  });

  /* F387: the web build (browser and desktop) has no Airplane Mode to turn on, so its label says "offline" instead. */
  it("gives the web build an offline label with no Airplane Mode in it, in every locale", () => {
    for (const name of LOCALES) {
      const value = load(`${name}.json`)["onboarding.sealed.proveOffline"];
      expect(value, name).toBeTruthy();
      expect(value!.length, name).toBeLessThan(60);
      expect(value!, name).not.toMatch(/avión|avião|avion|Flugmodus|Airplane|機内モード|비행기 모드|飛航模式|Åïrplàñé/);
    }
  });
});
