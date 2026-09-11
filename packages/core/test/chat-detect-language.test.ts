import { describe, expect, it } from "vitest";
import { TRANSLATION_LANGUAGES, detectLanguage, languageNameOf, pickTranslationTarget } from "../src/chat/detectLanguage";

describe("detectLanguage (translation mode, spec §7.6)", () => {
  it("non-Latin scripts decide at once", () => {
    expect(detectLanguage("מה השעה עכשיו")).toBe("he");
    expect(detectLanguage("كيف حالك اليوم")).toBe("ar");
    expect(detectLanguage("Привет, как дела?")).toBe("ru");
    expect(detectLanguage("今日はいい天気ですね")).toBe("ja");
    expect(detectLanguage("안녕하세요 반갑습니다")).toBe("ko");
    expect(detectLanguage("今天天气很好")).toBe("zh");
    expect(detectLanguage("आज मौसम अच्छा है")).toBe("hi");
  });

  it("Latin-script launch languages by function words", () => {
    expect(detectLanguage("The meeting is moved to Friday and you are invited.")).toBe("en");
    expect(detectLanguage("Das Treffen ist auf Freitag verschoben und Sie sind eingeladen.")).toBe("de");
    expect(detectLanguage("La réunion est déplacée à vendredi et vous êtes invités.")).toBe("fr");
    expect(detectLanguage("La reunión es el viernes y usted está invitado.")).toBe("es");
    expect(detectLanguage("A reunião é na sexta e você não pode faltar.")).toBe("pt");
    expect(detectLanguage("La riunione è venerdì e non puoi mancare, anche tu.")).toBe("it");
  });

  it("stays silent on short or ambiguous text", () => {
    expect(detectLanguage("ok")).toBeNull();
    expect(detectLanguage("Berlin Paris Madrid")).toBeNull();
    expect(detectLanguage("12 34 56")).toBeNull();
  });

  it("picks the app language as target, or English when the text already is in it", () => {
    expect(pickTranslationTarget("en", "de")).toBe("de");
    expect(pickTranslationTarget("de", "de")).toBe("en");
    expect(pickTranslationTarget("en", "en")).toBe("es");
    expect(pickTranslationTarget(null, "pt-BR")).toBe("pt");
    expect(pickTranslationTarget("he", "xx")).toBe("en");
  });

  it("names every spec §7.8 language", () => {
    expect(TRANSLATION_LANGUAGES).toHaveLength(17);
    expect(languageNameOf("he")).toBe("Hebrew");
    expect(languageNameOf("zz")).toBe("zz");
  });
});
