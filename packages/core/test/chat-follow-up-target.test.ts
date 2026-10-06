import { describe, expect, it } from "vitest";
import { ANSWER_CEILING, FOLLOW_UP_LINE, REWORK_MAX_WORDS, detectUse, fileAsk, followUpWindow, plainChatKind, planAnswerLength, turnSystemPrompt } from "../src/index";

/* Build 39: "make it 3 bullet points" and "translate it to French" after a summary got the index card or a search. */
const REWORKS: Record<string, string[]> = {
  en: ["make it 3 bullet points", "translate it to French", "put it in one line", "turn this into a table", "make that more formal", "rewrite it for a child", "can you make it shorter", "please translate that into Spanish", "make it casual"],
  de: ["mach es kürzer", "übersetze es ins Französische", "mach daraus 3 Stichpunkte", "bitte formuliere das formeller"],
  es: ["hazlo más corto", "tradúcelo al francés", "conviértelo en 3 viñetas", "ponlo en una línea", "traduce eso al inglés"],
  fr: ["rends-le plus court", "traduis-le en anglais", "fais-en 3 puces", "mets ça en une ligne", "simplifie-le"],
  "pt-BR": ["traduza isso para o francês", "transforma-o em 3 tópicos", "deixe isso mais curto", "faça isso mais formal"],
  ja: ["それを3つの箇条書きにして", "これをフランス語に翻訳して", "それを短くして", "それをもっと分かりやすく"],
  ko: ["그거 프랑스어로 번역해줘", "이걸 3개 요점으로 만들어줘", "그것을 짧게 해줘", "이거 쉽게 바꿔줘"],
  "zh-Hant": ["把它翻譯成法文", "把這個改成三個要點", "把它縮短", "把这个翻译成英文"],
  he: ["תעשה את זה 3 נקודות", "תתרגם את זה לצרפתית", "תקצר את זה לשורה אחת", "תהפוך את זה לרשימה", "אפשר לפשט את זה"],
};

const NOT_REWORKS: Record<string, string[]> = {
  en: ["What does it say about treason?", "what does it say about treason", "summarize it", "Summarize it", "translate the document", "make a plan for the trip", "make it 3 bullet points?", "thanks, now make it shorter", "summarize it in 3 bullets", "put it on page 3", "make it into a short list of the treason clauses and the veto rules please"],
  de: ["übersetze die Datei", "was steht da über Verrat?", "mach einen Plan für die Reise"],
  es: ["traduce el archivo", "resúmelo", "haz un plan para el viaje"],
  fr: ["traduis le fichier", "résume-le", "fais un plan pour le voyage"],
  "pt-BR": ["traduza o arquivo", "resuma isso", "faça um plano para a viagem"],
  ja: ["このファイルを翻訳して", "要約して", "反逆罪について何と書いてありますか"],
  ko: ["파일 번역해줘", "요약해줘", "반역에 대해 뭐라고 해?"],
  "zh-Hant": ["把這個檔案翻譯成法文", "總結一下", "它說了什麼？"],
  he: ["תתרגם את הקובץ", "סכם", "מה כתוב על בגידה?", "תעשה תוכנית לטיול"],
};

describe("plainChatKind · a rework of the previous answer (round 134G)", () => {
  for (const [lang, list] of Object.entries(REWORKS))
    it(`${lang}: an imperative about it / that / this with a target is a follow-up`, () => {
      for (const text of list) expect(plainChatKind(text), text).toBe("follow-up");
    });
  for (const [lang, list] of Object.entries(NOT_REWORKS))
    it(`${lang}: a question, an ask about the file, a file word or a new task keeps the file route`, () => {
      for (const text of list) expect(plainChatKind(text), text).toBeNull();
    });
  it("'Summarize it' stays the whole-file summary, with or without a count", () => {
    for (const text of ["Summarize it", "summarize it in 3 bullets"]) {
      expect(fileAsk(text), text).toBe("summary");
      expect(plainChatKind(text), text).toBeNull();
    }
  });
  it(`no more than ${REWORK_MAX_WORDS} words`, () => {
    expect(plainChatKind("make it shorter and more formal for him")).toBe("follow-up");
    expect(plainChatKind("make it shorter and more formal for my new boss today")).toBeNull();
  });
  it("flows through detectUse and keeps the long plan and the follow-up line", () => {
    for (const text of ["make it 3 bullet points", "translate it to French", "תתרגם את זה לצרפתית"]) {
      expect(detectUse({ text, hasDocuments: true }), text).not.toBe("documents");
      const plainChat = plainChatKind(text);
      const plan = planAnswerLength({ text, use: detectUse({ text, hasDocuments: true }), plainChat });
      expect(plan.length, text).toBe("long");
      expect(plan.maxTokens, text).toBe(ANSWER_CEILING);
      expect(turnSystemPrompt({ familySafe: false, tier: "instant", photos: false, plainChat }), text).toContain(FOLLOW_UP_LINE);
    }
    expect(detectUse({ text: "What does it say about treason?", hasDocuments: true })).toBe("documents");
  });
});

const user = (content: string, images?: string[]) => ({ role: "user" as const, content, ...(images ? { images } : {}) });
const bot = (content: string) => ({ role: "assistant" as const, content });
const SUMMARY = "The Constitution sets up three branches of government…";

describe("followUpWindow (round 134G)", () => {
  it("thanks and its reply after the summary are left out, so the summary is the last answer", () => {
    const history = [user("Summarize it"), bot(SUMMARY), user("Thanks"), bot("You're welcome!"), user("shorter")];
    expect(followUpWindow(history)).toEqual([user("Summarize it"), bot(SUMMARY), user("shorter")]);
  });
  it("two acknowledgements in a row, and a greeting", () => {
    const history = [user("Summarize it"), bot(SUMMARY), user("thank you"), bot("You're welcome! Enjoy your day."), user("ok"), bot("Okay. What do you need next?"), user("hello"), bot("Hi!"), user("more")];
    expect(followUpWindow(history)).toEqual([user("Summarize it"), bot(SUMMARY), user("more")]);
  });
  it("no plain chat tail: unchanged", () => {
    const history = [user("Summarize it"), bot(SUMMARY), user("shorter")];
    expect(followUpWindow(history)).toEqual(history);
    const reworked = [user("Summarize it"), bot(SUMMARY), user("shorter"), bot("A shorter summary."), user("thanks"), bot("Glad to help."), user("more")];
    expect(followUpWindow(reworked)).toEqual([user("Summarize it"), bot(SUMMARY), user("shorter"), bot("A shorter summary."), user("more")]);
  });
  it("keeps system rows and a thanks that carries a picture; unchanged when nothing real was answered", () => {
    const sys = { role: "system" as const, content: "Attached: constitution-9pages.pdf" };
    expect(followUpWindow([sys, user("Summarize it"), bot(SUMMARY), user("Thanks"), bot("You're welcome!"), user("shorter")])).toEqual([sys, user("Summarize it"), bot(SUMMARY), user("shorter")]);
    const pictured = [user("Summarize it"), bot(SUMMARY), user("thanks", ["page.png"]), bot("You're welcome!"), user("shorter")];
    expect(followUpWindow(pictured)).toEqual(pictured);
    const onlyThanks = [user("hi"), bot("Hello!"), user("shorter")];
    expect(followUpWindow(onlyThanks)).toEqual(onlyThanks);
    expect(followUpWindow([])).toEqual([]);
  });
  it("the follow-up line points at the previous answer", () => {
    expect(FOLLOW_UP_LINE).toContain("apply this to your previous answer");
  });
});
