import { describe, expect, it } from "vitest";
import { ACK_MAX_WORDS, LENGTH_TOKENS, SMALL_TALK_LINE, detectUse, isAcknowledgement, isPlainChatTurn, planAnswerLength, turnSystemPrompt } from "../src/index";

/* Round 133B: thanks, agreement, greetings and goodbyes in the eight launch languages and Hebrew. */
const ACKS: Record<string, string[]> = {
  en: ["thank you", "Thank you!", "thanks", "thanks a lot", "thank you so much 🙏", "ok", "Okay.", "ok thanks", "great, thanks!", "got it", "perfect", "cool", "awesome thank you", "bye", "good night", "hi", "Hello", "thanks for the summary", "much appreciated"],
  ja: ["ありがとう", "ありがとうございます！", "了解", "了解です", "わかりました", "なるほど", "おやすみなさい", "こんにちは", "了解、ありがとう"],
  de: ["danke", "Vielen Dank!", "danke schön", "alles klar", "super, danke", "perfekt", "tschüss", "gute Nacht", "hallo"],
  es: ["gracias", "¡Muchas gracias!", "vale", "perfecto, gracias", "entendido", "adiós", "buenas noches", "hola"],
  fr: ["merci", "Merci beaucoup !", "d'accord", "d’accord, merci", "parfait", "très bien", "au revoir", "bonne nuit", "bonjour"],
  "pt-BR": ["obrigado", "Muito obrigada!", "valeu", "beleza", "entendi", "perfeito, obrigado", "tchau", "boa noite", "oi", "olá"],
  ko: ["감사합니다", "고마워요!", "알겠습니다", "좋아요", "네 감사합니다", "잘 자요", "안녕하세요"],
  "zh-Hant": ["謝謝", "謝謝你！", "好的", "了解", "明白了", "太好了", "再見", "晚安", "你好", "好的，謝謝"],
  he: ["תודה", "תודה רבה!", "אוקיי", "סבבה", "מעולה", "הבנתי", "יופי", "סבבה תודה", "לילה טוב", "שלום"],
};

const ASKS: Record<string, string[]> = {
  en: ["and page 3?", "shorter", "translate it", "What does it say about treason?", "thanks, now translate it", "ok, and the second article", "thanks?", "hiking boots", "summarize it", "great question about the file", "ok ok ok ok ok ok thanks"],
  ja: ["3ページは？", "もっと短く", "翻訳して", "ありがとう、次は要約して"],
  de: ["und Seite 3?", "kürzer", "übersetze es", "danke, jetzt übersetzen"],
  es: ["¿y la página 3?", "más corto", "tradúcelo", "gracias, ahora resúmelo"],
  fr: ["et la page 3 ?", "plus court", "traduis-le", "merci, maintenant résume"],
  "pt-BR": ["e a página 3?", "mais curto", "traduza", "obrigado, agora resuma"],
  ko: ["3페이지는?", "더 짧게", "번역해 줘", "감사합니다 이제 요약해 주세요"],
  "zh-Hant": ["第三頁呢？", "短一點", "翻譯它", "謝謝，再幫我總結"],
  he: ["מה כתוב בעמוד 3", "תקצר", "תתרגם", "תודה, עכשיו תסכם", "שלום מה כתוב בקובץ"],
};

describe("isAcknowledgement (round 133B)", () => {
  for (const [lang, list] of Object.entries(ACKS))
    it(`${lang}: thanks, ok, greetings and goodbyes are small talk`, () => {
      for (const text of list) expect(isAcknowledgement(text), text).toBe(true);
    });
  for (const [lang, list] of Object.entries(ASKS))
    it(`${lang}: a question or an instruction is not`, () => {
      for (const text of list) expect(isAcknowledgement(text), text).toBe(false);
    });
  it("empty text, filler alone and long messages are not", () => {
    expect(isAcknowledgement("")).toBe(false);
    expect(isAcknowledgement("so much")).toBe(false);
    expect(isAcknowledgement(Array(ACK_MAX_WORDS + 1).fill("thanks").join(" "))).toBe(false);
  });
});

/* The founder's Build 37 turn after the summary was "And now", then "Thanks". */
const PLAIN: Record<string, string[]> = {
  en: ["And now", "Thanks", "next", "shorter", "ok and", "translate it", "more", "explain", "in bullet points", "go on", "in Hebrew", "more detail", "simpler please"],
  ja: ["次は", "もっと短く", "翻訳して", "続けて"],
  de: ["und jetzt", "kürzer", "weiter", "übersetze es"],
  es: ["y ahora", "más corto", "tradúcelo", "sigue"],
  fr: ["et maintenant", "plus court", "traduis-le", "continue"],
  "pt-BR": ["e agora", "mais curto", "traduza", "continua"],
  ko: ["그리고 이제", "더 짧게", "번역해 줘"],
  "zh-Hant": ["然後呢", "短一點", "翻譯它", "繼續"],
  he: ["ועכשיו", "יותר קצר", "תתרגם", "תמשיך", "תסביר שוב", "תודה"],
};

const FILE_ROUTE: Record<string, string[]> = {
  en: ["What does it say about treason?", "serial number of the turbine?", "page 3", "article 2", "top 5", "treason clause", "refund policy", "serial number", "and page 3", "the third section", "translate the document", "Summarize it", "tl;dr", "what is this", "what does it say", "who can veto", "what does the second article say about the senate"],
  ja: ["3ページは", "このファイルを翻訳", "要約して", "反逆罪について何と書いてありますか", "反逆罪"],
  de: ["und Seite 3", "die Datei übersetzen", "zusammenfassen", "Rückgaberecht"],
  es: ["y la página 3", "el archivo", "resúmelo", "política de reembolso"],
  fr: ["et la page 3", "le fichier", "résume", "politique de remboursement"],
  "pt-BR": ["e a página 3", "o arquivo", "resuma", "número de série"],
  ko: ["3페이지", "파일 번역", "요약해줘", "환불 정책"],
  "zh-Hant": ["第三頁", "這個檔案", "總結一下", "退款政策"],
  he: ["מה כתוב בעמוד 3", "ובעמוד 3", "תתרגם את הקובץ", "סכם", "סעיף הבגידה", "מדיניות החזרים"],
};

describe("isPlainChatTurn (round 133B)", () => {
  for (const [lang, list] of Object.entries(PLAIN))
    it(`${lang}: a short follow-up with no question mark and no file word is plain chat`, () => {
      for (const text of list) expect(isPlainChatTurn(text), text).toBe(true);
    });
  for (const [lang, list] of Object.entries(FILE_ROUTE))
    it(`${lang}: a question, a file word, an ask about the file or a longer message keeps the file route`, () => {
      for (const text of list) expect(isPlainChatTurn(text), text).toBe(false);
    });
  it("every acknowledgement is plain chat", () => {
    for (const list of Object.values(ACKS)) for (const text of list) expect(isPlainChatTurn(text), text).toBe(true);
  });
});

describe("detectUse with a file attached (round 133B)", () => {
  it("thanks and a short follow-up are not documents, a question is", () => {
    expect(detectUse({ text: "thank you", hasDocuments: true })).toBe("chat");
    expect(detectUse({ text: "תודה רבה", hasDocuments: true })).toBe("chat");
    expect(detectUse({ text: "And now", hasDocuments: true })).toBe("chat");
    expect(detectUse({ text: "What does it say about treason?", hasDocuments: true })).toBe("documents");
    expect(detectUse({ text: "and page 3", hasDocuments: true })).toBe("documents");
  });
  it("without a file nothing changes", () => {
    expect(detectUse({ text: "thank you" })).toBe("chat");
    expect(detectUse({ text: "thanks", personaId: "builtin:writer" })).toBe("writing");
  });
});

describe("the reply to thanks (round 133B)", () => {
  it("one line in the system prompt and the short plan, only for a plain chat turn", () => {
    const base = { familySafe: false, tier: "instant" as const, photos: false };
    expect(turnSystemPrompt({ ...base, smallTalk: true })).toContain(SMALL_TALK_LINE);
    expect(turnSystemPrompt(base)).not.toContain(SMALL_TALK_LINE);
    const plan = planAnswerLength({ text: "thank you", use: "chat", smallTalk: true });
    expect(plan.length).toBe("short");
    expect(plan.maxTokens).toBe(LENGTH_TOKENS.short);
    expect(planAnswerLength({ text: "write me a long story", use: "writing" }).length).not.toBe("short");
  });
});
