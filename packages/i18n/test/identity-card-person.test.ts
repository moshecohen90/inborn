import { describe, expect, it } from "vitest";
import { LAUNCH_LOCALES, selfAnswer } from "../src";

const LANGS = [...LAUNCH_LOCALES, "he"] as const;
type Lang = "en" | "de" | "fr" | "es" | "pt-BR" | "ja" | "ko" | "zh-Hant" | "he";

/* The cards are the assistant speaking ("I'm Inborn… I help…", like the offline cards); the capabilities card used to switch to "Inborn can…" mid-card. */
const THIRD_PERSON: Record<Lang, RegExp> = {
  en: /\bInborn (?:can|is|does|will|helps|reads|runs)\b/,
  de: /\bInborn (?:kann|ist|hilft|liest|läuft)\b/,
  fr: /\bInborn (?:peut|est|aide|lit|fonctionne)\b/,
  es: /\bInborn (?:puede|es|ayuda|lee|funciona)\b/,
  "pt-BR": /\b(?:O )?Inborn (?:pode|é|ajuda|lê|roda)\b/,
  ja: /Inborn(?:は|が)/,
  ko: /Inborn(?:은|는|이 |가 )/,
  "zh-Hant": /Inborn\s*(?:可以|能|會|是)/,
  he: /Inborn (?:יכול|עוזר|קורא|פועל)/,
};

const FIRST_PERSON: Record<Lang, RegExp> = {
  en: /\bI(?:'m|'ll| )/,
  de: /\b[Ii]ch\b/,
  fr: /\b(?:[Jj]e|j')/,
  es: /\b(?:Soy|puedo|leo|[Tt]e ayudo)\b/,
  "pt-BR": /\b(?:Sou|posso|eu|Ajudo)\b/,
  ja: /私/,
  ko: /저는/,
  "zh-Hant": /我/,
  he: /אני/,
};

describe("the identity and capabilities cards speak in one voice", () => {
  for (const lang of LANGS)
    for (const kind of ["identity", "capabilities"] as const) {
      const text = selfAnswer(kind, lang, { device: "phone", model: "Fast" });
      it(`${lang} ${kind}: first person throughout, never "Inborn" as a third party`, () => {
        expect(text).toMatch(FIRST_PERSON[lang as Lang]);
        expect(text).not.toMatch(THIRD_PERSON[lang as Lang]);
      });
    }

  it("the texts, per locale", () => {
    const all = Object.fromEntries(LANGS.map((lang) => [lang, { identity: selfAnswer("identity", lang, { device: "phone", model: "Fast" }), capabilities: selfAnswer("capabilities", lang, { device: "phone" }) }]));
    expect(all).toMatchSnapshot();
  });
});
