import { describe, expect, it } from "vitest";
import { isAppDecline, offlineAnswer, questionOpeners, selfAnswer } from "../src/index";
import en from "../locales/en.json";
import ptBR from "../locales/pt-BR.json";

const LANGS = ["en", "ja", "de", "fr", "es", "pt-BR", "ko", "zh-Hant", "he"];
const DEVICES = ["phone", "tablet", "computer", "browser"];

describe("isAppDecline · the app's own declines are told from the model's answers (F464, F469)", () => {
  it("every offline card, in every language and on every device", () => {
    for (const lang of LANGS)
      for (const device of DEVICES) for (const kind of ["weather", "news", "scores", "prices"] as const) expect(isAppDecline(offlineAnswer(kind, lang, { device }))).toBe(true);
  });

  it("the no-match lines the chat writes in the UI language", () => {
    expect(isAppDecline(en["documents.opener.nothingRelevant"])).toBe(true);
    expect(isAppDecline(ptBR["documents.opener.nothingRelevant"])).toBe(true);
    expect(isAppDecline(ptBR["documents.notFound"])).toBe(true);
    expect(isAppDecline(en["documents.opener.nothingFits"])).toBe(true);
  });

  it("the identity card stays in the conversation: it declines nothing and follow-ups build on it", () => {
    expect(isAppDecline(selfAnswer("identity", "en", { device: "phone", model: "Fast" }))).toBe(false);
    expect(isAppDecline(selfAnswer("capabilities", "he", { device: "phone" }))).toBe(false);
  });

  it("a model answer is never one, even when it opens with the no-match line's words", () => {
    expect(isAppDecline("Seus documentos não mencionam isso. Para fazer panquecas, misture 1 xícara de farinha…")).toBe(false);
    expect(isAppDecline("I can't offer specific sleep advice, but I can help you brainstorm ideas.")).toBe(false);
    expect(isAppDecline("")).toBe(false);
  });
});

describe("questionOpeners · the no-match opener in the question's language (F469)", () => {
  it("a detected UI language gets its own line; pt maps to pt-BR", () => {
    expect(questionOpeners("en")?.nothingRelevant).toBe(en["documents.opener.nothingRelevant"]);
    expect(questionOpeners("pt")?.nothingRelevant).toBe(ptBR["documents.opener.nothingRelevant"]);
    expect(questionOpeners("pt-BR")?.nothingFits).toBe(ptBR["documents.opener.nothingFits"]);
  });

  it("an unknown language, Hebrew (no UI table) and Simplified Chinese get none, never the UI's", () => {
    for (const lang of [null, "he", "zh-Hans", "zh", "it", "ru"]) expect(questionOpeners(lang)).toBeNull();
    expect(questionOpeners("zh-Hant")?.nothingRelevant).toBeTruthy();
  });
});
