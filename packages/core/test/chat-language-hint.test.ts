import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { betterModelForLanguage, languageCodeOf, LANGUAGE_NAME_BY_CODE } from "../src/chat/language";

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
    expect(Object.keys(LANGUAGE_NAME_BY_CODE).sort()).toEqual(["ar", "el", "he", "ja", "ko", "ru", "zh"]);
    for (const [code, name] of Object.entries(LANGUAGE_NAME_BY_CODE)) expect(en[`language.${code}`], code).toBe(name);
  });
});
