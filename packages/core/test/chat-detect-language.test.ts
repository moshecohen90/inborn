import { describe, expect, it } from "vitest";
import { TRANSLATION_LANGUAGES, detectLanguage, languageNameOf, pickTranslationTarget } from "../src/chat/detectLanguage";
import { chineseScriptOf } from "../src/chat/language";

describe("detectLanguage (translation mode, spec §7.6)", () => {
  it("non-Latin scripts decide at once", () => {
    expect(detectLanguage("מה השעה עכשיו")).toBe("he");
    expect(detectLanguage("كيف حالك اليوم")).toBe("ar");
    expect(detectLanguage("Привет, как дела?")).toBe("ru");
    expect(detectLanguage("今日はいい天気ですね")).toBe("ja");
    expect(detectLanguage("안녕하세요 반갑습니다")).toBe("ko");
    expect(detectLanguage("今天天气很好")).toBe("zh-Hans");
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

  it("tells the two Chinese scripts apart, and says plain zh when the characters do not", () => {
    /* The two renderings of the study's translation prompt (research §3.3). */
    expect(detectLanguage("会议已移至周四上午，因两位经理出差。请确认新时间是否方便。")).toBe("zh-Hans");
    expect(detectLanguage("會議已移至週四上午，因兩位經理出差。請確認新時間是否方便。")).toBe("zh-Hant");
    expect(detectLanguage("台灣的天氣很好，我們去散步")).toBe("zh-Hant");
    /* Characters both scripts share decide nothing: the launch language stays plain Chinese. */
    expect(detectLanguage("今天天气")).toBe("zh-Hans");
    expect(detectLanguage("山水花鳥")).toBe("zh-Hant");
    expect(detectLanguage("北京上海天安门")).toBe("zh-Hans");
    expect(detectLanguage("我是学生")).toBe("zh-Hans");
    expect(detectLanguage("山川日月星辰")).toBe("zh");
    expect(chineseScriptOf("山川日月星辰")).toBeNull();
    expect(chineseScriptOf("hello")).toBeNull();
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
    /* A script subtag is still the same language: Traditional Chinese into a Chinese UI must not be Chinese into Chinese. */
    expect(pickTranslationTarget("zh-Hant", "zh")).toBe("en");
    expect(pickTranslationTarget("zh-Hans", "de")).toBe("de");
  });

  it("names every spec §7.8 language", () => {
    expect(TRANSLATION_LANGUAGES).toHaveLength(17);
    expect(languageNameOf("he")).toBe("Hebrew");
    expect(languageNameOf("zz")).toBe("zz");
    /* The script variants name a text; they are not extra entries in the translation picker. */
    expect(languageNameOf("zh-Hant")).toBe("Chinese (Traditional)");
    expect(languageNameOf("zh-Hans")).toBe("Chinese (Simplified)");
    expect(TRANSLATION_LANGUAGES.some((l) => l.code.includes("-"))).toBe(false);
  });
});
