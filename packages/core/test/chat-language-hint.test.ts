import { describe, expect, it } from "vitest";
import { betterModelForLanguage, languageCodeOf } from "../src/chat/language";

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
