import { describe, expect, it } from "vitest";
import { selfQuestion, selfQuestionMatch, type SelfQuestion, type SelfQuestionLang } from "../src/index";

type Case = [string, SelfQuestion];
const CASES: Record<SelfQuestionLang, { yes: Case[]; no: string[] }> = {
  en: {
    yes: [
      ["hey! what is this app?", "identity"],
      ["tell me about yourself", "identity"],
      ["Who are you?", "identity"],
      ["Please introduce yourself.", "identity"],
      ["who made you", "identity"],
      ["What model are you?", "identity"],
      ["are you ChatGPT?", "identity"],
      ["Are you Qwen?", "identity"],
      ["what’s your name?", "identity"],
      ["what can you do?", "capabilities"],
      ["How can you help me?", "capabilities"],
      ["what are your capabilities", "capabilities"],
    ],
    no: ["what can you do with PDFs?", "tell me about Paris", "who made the Eiffel tower?", "what model of phone is this?", "what is this word?", "are you sure the recipe is right?", "who are the Beatles?", "what can you tell me about volcanoes"],
  },
  ja: {
    yes: [
      ["あなたは誰ですか？", "identity"],
      ["自己紹介してください", "identity"],
      ["このアプリは何ですか", "identity"],
      ["誰があなたを作ったの？", "identity"],
      ["あなたはChatGPTですか", "identity"],
      ["何のモデルですか", "identity"],
      ["何ができますか？", "capabilities"],
      ["あなたは何ができるの", "capabilities"],
    ],
    no: ["PDFで何ができる？", "パリについて教えて", "エッフェル塔は誰が作った？", "このスマホは何のモデル？", "この単語は何ですか", "富士山の高さは？"],
  },
  de: {
    yes: [
      ["Wer bist du?", "identity"],
      ["Erzähl mir von dir", "identity"],
      ["Stell dich vor", "identity"],
      ["Was ist das für eine App?", "identity"],
      ["Wer hat dich entwickelt?", "identity"],
      ["Bist du ChatGPT?", "identity"],
      ["Welches Modell bist du?", "identity"],
      ["Was kannst du?", "capabilities"],
      ["Wobei kannst du mir helfen?", "capabilities"],
    ],
    no: ["Was kannst du mit PDFs machen?", "Erzähl mir von Paris", "Wer hat den Eiffelturm gebaut?", "Welches Modell ist dieses Handy?", "Wer bist du in diesem Märchen?", "Was ist das für ein Wort?"],
  },
  fr: {
    yes: [
      ["Qui es-tu ?", "identity"],
      ["Présente-toi", "identity"],
      ["Parle-moi de toi", "identity"],
      ["C'est quoi cette application ?", "identity"],
      ["Qui t'a créé ?", "identity"],
      ["Es-tu ChatGPT ?", "identity"],
      ["Que peux-tu faire ?", "capabilities"],
      ["Comment peux-tu m'aider ?", "capabilities"],
    ],
    no: ["Que peux-tu faire avec un PDF ?", "Parle-moi de Paris", "Qui a construit la tour Eiffel ?", "Quel modèle de téléphone est-ce ?", "C'est quoi ce mot ?", "Qui es-tu pour juger ?"],
  },
  es: {
    yes: [
      ["¿Quién eres?", "identity"],
      ["Preséntate", "identity"],
      ["Háblame de ti", "identity"],
      ["¿Qué es esta app?", "identity"],
      ["¿Quién te creó?", "identity"],
      ["¿Eres ChatGPT?", "identity"],
      ["¿Qué puedes hacer?", "capabilities"],
      ["¿En qué me puedes ayudar?", "capabilities"],
    ],
    no: ["¿Qué puedes hacer con un PDF?", "Háblame de París", "¿Quién construyó la torre Eiffel?", "¿Qué modelo de teléfono es este?", "¿Qué es esta palabra?", "¿Quién eres tú para decirme eso?"],
  },
  "pt-BR": {
    yes: [
      ["Quem é você?", "identity"],
      ["Fale sobre você", "identity"],
      ["Se apresente", "identity"],
      ["Que app é esse?", "identity"],
      ["Quem te criou?", "identity"],
      ["Você é o ChatGPT?", "identity"],
      ["O que você pode fazer?", "capabilities"],
      ["Como você pode me ajudar?", "capabilities"],
    ],
    no: ["O que você pode fazer com um PDF?", "Fale sobre Paris", "Quem construiu a Torre Eiffel?", "Qual modelo de celular é esse?", "O que é essa palavra?", "Quem é você na fila do pão?"],
  },
  ko: {
    yes: [
      ["너는 누구야?", "identity"],
      ["자기소개 해줘", "identity"],
      ["이 앱은 뭐야?", "identity"],
      ["누가 너를 만들었어?", "identity"],
      ["너 ChatGPT야?", "identity"],
      ["무슨 모델이야?", "identity"],
      ["뭘 할 수 있어?", "capabilities"],
      ["무엇을 할 수 있나요?", "capabilities"],
    ],
    no: ["PDF로 뭘 할 수 있어?", "파리에 대해 알려줘", "에펠탑은 누가 만들었어?", "이 휴대폰은 무슨 모델이야?", "이 단어는 뭐야?", "오늘 날씨 어때?"],
  },
  "zh-Hant": {
    yes: [
      ["你是誰？", "identity"],
      ["介紹一下你自己", "identity"],
      ["這是什麼應用？", "identity"],
      ["誰開發了你？", "identity"],
      ["你是ChatGPT嗎？", "identity"],
      ["你是什么模型", "identity"],
      ["你能做什麼？", "capabilities"],
      ["你可以帮我做什么", "capabilities"],
    ],
    no: ["你能用PDF做什麼？", "介紹一下巴黎", "誰建造了艾菲爾鐵塔？", "這支手機是什麼型號？", "這個字是什麼意思？", "今天天氣如何？"],
  },
  he: {
    yes: [
      ["מי אתה?", "identity"],
      ["ספר לי על עצמך", "identity"],
      ["היי, מה זו האפליקציה הזאת?", "identity"],
      ["מי בנה אותך?", "identity"],
      ["אתה ChatGPT?", "identity"],
      ["איזה מודל אתה?", "identity"],
      ["מה אתה יודע לעשות?", "capabilities"],
      ["במה אתה יכול לעזור לי?", "capabilities"],
    ],
    no: ["מה אתה יכול לעשות עם PDF?", "ספר לי על פריז", "מי בנה את מגדל אייפל?", "איזה דגם הטלפון הזה?", "מה זה המילה הזאת?", "היום יש גשם?"],
  },
};

describe("round 134N · selfQuestion matches a question about the assistant, and nothing else", () => {
  for (const [lang, { yes, no }] of Object.entries(CASES) as [SelfQuestionLang, (typeof CASES)[SelfQuestionLang]][]) {
    it(`${lang}: ${yes.length} positives, in that language, whatever the UI locale`, () => {
      expect(yes.length).toBeGreaterThanOrEqual(6);
      for (const [text, kind] of yes) {
        expect(selfQuestion(text, lang), text).toBe(kind);
        expect(selfQuestionMatch(text, "en"), `${text} (UI en)`).toEqual({ kind, lang });
      }
    });
    it(`${lang}: ${no.length} negatives stay with the model`, () => {
      expect(no.length).toBeGreaterThanOrEqual(6);
      for (const text of no) expect(selfQuestion(text, lang), text).toBeNull();
    });
  }

  it("the 134M probes: the app and self questions match, the others do not", () => {
    expect(selfQuestion("hey! what is this app?")).toBe("identity");
    expect(selfQuestion("tell me about yourself")).toBe("identity");
    expect(selfQuestion("what can you do?")).toBe("capabilities");
    for (const q of ["what's the weather like today?", "give me a pancake recipe", "how long do pancakes keep in the fridge?", "who won the last football World Cup?", "my 4 year old won't sleep, any tips?", "Draft a short, friendly message that"]) expect(selfQuestion(q), q).toBeNull();
  });

  it("a long message that mentions the assistant is a question for the model", () => {
    expect(selfQuestion("who are you going to vote for in the election and why do you think that candidate is the best one?")).toBeNull();
    expect(selfQuestion("")).toBeNull();
  });
});
