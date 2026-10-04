import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { betterModelForLanguage, languageCodeOf, languageHint, scriptOf, LANGUAGE_NAME_BY_CODE } from "../src/chat/language";

const instant = { id: "instant", goodLanguages: ["en", "zh", "es"], installed: true };
const fast = { id: "fast", goodLanguages: ["en", "zh", "es", "ar", "ru"], installed: false };
const sharp = { id: "sharp", goodLanguages: ["en", "he", "ar", "ru"], installed: false };
const phi = { id: "sharp-phi", goodLanguages: ["en"], installed: true };
const all = [instant, fast, sharp, phi];
const hebrew = "כתוב פסקה על הים התיכון";

describe("languageCodeOf", () => {
  it("maps scripts to the catalog's codes and Latin to null", () => {
    expect(languageCodeOf(hebrew)).toBe("he");
    expect(languageCodeOf("Привет")).toBe("ru");
    expect(languageCodeOf("hello there")).toBeNull();
  });
});

describe("languageHint (wrong-language answers)", () => {
  it("names every launch language, Latin-script ones included, from short questions", () => {
    expect(languageHint("¿Quién ganó ayer el partido del Real Madrid?")).toBe("The user writes in Spanish. Answer in Spanish.");
    expect(languageHint("Quem ganhou o jogo do Flamengo ontem?")).toBe("The user writes in Portuguese. Answer in Portuguese.");
    expect(languageHint("Qui a gagné le match du PSG hier soir ?")).toBe("The user writes in French. Answer in French.");
    expect(languageHint("Wie heißt die Hauptstadt von Kanada?")).toBe("The user writes in German. Answer in German.");
    expect(languageHint("¿Cuándo es la reunión?")).toBe("The user writes in Spanish. Answer in Spanish.");
  });
  it("says which Chinese script, so a Traditional question is not answered in Simplified", () => {
    expect(languageHint("昨天中信兄弟的比賽誰贏了？")).toBe("The user writes in Traditional Chinese. Answer in Traditional Chinese.");
    expect(languageHint("昨天的比赛谁赢了？")).toBe("The user writes in Simplified Chinese. Answer in Simplified Chinese.");
    expect(languageHint("山川日月星辰")).toBe("The user writes in Chinese. Answer in Chinese.");
  });
  it("a kanji-heavy Japanese question is Japanese, not Chinese", () => {
    expect(scriptOf("日本で一番高い山は何ですか？")).toBe("japanese");
    expect(languageCodeOf("日本で一番高い山は何ですか？")).toBe("ja");
    expect(languageHint("日本で一番高い山は何ですか？")).toBe("The user writes in Japanese. Answer in Japanese.");
  });
  it("stays empty for English and for text too short to tell", () => {
    expect(languageHint("Who won yesterday's Champions League match?")).toBe("");
    expect(languageHint("Berlin Paris Madrid")).toBe("");
  });
});

describe("betterModelForLanguage", () => {
  it("Hebrew on Instant names Sharp (the only model listing he)", () => {
    expect(betterModelForLanguage(hebrew, instant, all)).toEqual({ code: "he", language: "Hebrew", model: sharp });
  });
  it("nothing when the loaded model already handles the language", () => {
    expect(betterModelForLanguage(hebrew, sharp, all)).toBeNull();
  });
  it("nothing for Latin text or when no model lists the language", () => {
    expect(betterModelForLanguage("write a paragraph", instant, all)).toBeNull();
    expect(betterModelForLanguage("Γειά σου", instant, all)).toBeNull();
  });
  it("prefers an installed candidate over one still to install", () => {
    const fastReady = { ...fast, installed: true };
    expect(betterModelForLanguage("Привет, как дела", instant, [instant, fastReady, sharp])?.model).toBe(fastReady);
    expect(betterModelForLanguage("Привет, как дела", instant, [instant, fast, { ...sharp, installed: true }])?.model.id).toBe("sharp");
  });
  it("is silent without a current model", () => {
    expect(betterModelForLanguage(hebrew, null, all)).toBeNull();
  });
});

describe("LANGUAGE_NAME_BY_CODE", () => {
  it("every code the hint can produce has a language.<code> key in en.json with the English name", () => {
    const en = JSON.parse(readFileSync(join(__dirname, "../../i18n/locales/en.json"), "utf8")) as Record<string, string>;
    /* The two Chinese scripts are named here as well: detectLanguage returns them and the fit map can rate them apart. */
    expect(Object.keys(LANGUAGE_NAME_BY_CODE).sort()).toEqual(["ar", "el", "he", "ja", "ko", "ru", "zh", "zh-Hans", "zh-Hant"]);
    for (const [code, name] of Object.entries(LANGUAGE_NAME_BY_CODE)) expect(en[`language.${code}`], code).toBe(name);
  });
});
