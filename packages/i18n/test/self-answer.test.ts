import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { LAUNCH_LOCALES, selfAnswer } from "../src";

const KEYS = ["identity.answer.identity", "identity.answer.capabilities", "identity.answer.model"] as const;
const LANGS = [...LAUNCH_LOCALES, "he"] as const;
const table = (lang: string): Record<string, string> => JSON.parse(readFileSync(join(__dirname, lang === "he" ? "../answers/he.json" : `../locales/${lang}.json`), "utf8"));

describe("round 134N · the app's own answer to a question about the assistant", () => {
  it("every UI locale and Hebrew has the three keys", () => {
    for (const lang of LANGS) for (const key of KEYS) expect(table(lang)[key], `${lang}:${key}`).toBeTruthy();
  });

  it("says Inborn, plain facts in two or three sentences, with no rule words and no other model's name", () => {
    for (const lang of LANGS)
      for (const kind of ["identity", "capabilities"] as const)
        for (const device of ["phone", "tablet", "computer", "browser"]) {
          const text = selfAnswer(kind, lang, { device, model: "Fast" });
          if (kind === "identity") expect(text, `${lang} ${device}`).toContain("Inborn");
          expect(text, `${lang} ${kind}`).not.toMatch(/\{|\}|qwen|alibaba|tongyi|gpt|gemini|family|safe|hateful|crisis|accura|rule|guideline|guess|offline|ファミリー|安全|規則|安全|규칙|안전|規則|כלל|בטוח/i);
          const sentences = text.split(/(?<=[.。!?！？])\s*/).filter((s) => s.trim()).length;
          expect(sentences, `${lang} ${kind}: ${text}`).toBeGreaterThanOrEqual(2);
          expect(sentences, `${lang} ${kind}: ${text}`).toBeLessThanOrEqual(kind === "identity" ? 4 : 3);
        }
  });

  it("in English: the identity, the model line, the device", () => {
    expect(selfAnswer("identity", "en", { device: "phone", model: "Fast" })).toBe(
      "I'm Inborn, a private assistant that runs on this phone. Nothing you write or attach leaves it. I help with questions, writing, translation, PDFs and photos. Right now Fast is answering.",
    );
    expect(selfAnswer("identity", "en", { device: "phone" })).not.toContain("answering");
    expect(selfAnswer("capabilities", "en", { device: "browser", model: "Fast" })).toBe(
      "I can answer questions, write and edit text, translate, and explain things step by step. Attach a PDF or a photo and I'll read it and answer about it. All of it happens on this browser.",
    );
  });

  it("in the asker's language, inflected for the device; an unknown language falls back to English", () => {
    expect(selfAnswer("identity", "he", { device: "phone", model: "Instant" })).toBe(
      "אני Inborn, עוזר פרטי שפועל בטלפון הזה. שום דבר שתכתבו או תצרפו לא יוצא ממנו. אני עוזר בשאלות, בכתיבה, בתרגום, בקובצי PDF ובתמונות. כרגע עונה Instant.",
    );
    expect(selfAnswer("capabilities", "de", { device: "tablet" })).toContain("auf diesem Tablet");
    expect(selfAnswer("identity", "pt", { device: "phone" })).toBe(selfAnswer("identity", "pt-BR", { device: "phone" }));
    expect(selfAnswer("identity", "xx", { device: "phone" })).toBe(selfAnswer("identity", "en", { device: "phone" }));
  });
});
