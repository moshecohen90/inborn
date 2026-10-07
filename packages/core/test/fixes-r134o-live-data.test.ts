import { describe, expect, it } from "vitest";
import { liveDataQuestion, liveDataQuestionMatch, selfQuestion, type LiveDataQuestion, type SelfQuestionLang } from "../src/index";

type Case = [string, LiveDataQuestion];
const CASES: Record<SelfQuestionLang, { yes: Case[]; no: string[] }> = {
  en: {
    yes: [
      ["what's the weather like today?", "weather"],
      ["what's the weather in Tokyo tomorrow?", "weather"],
      ["will it rain tonight?", "weather"],
      ["who won last night's game?", "scores"],
      ["what's the score of the match right now?", "scores"],
      ["any news today?", "news"],
      ["what are the latest headlines?", "news"],
      ["what's the price of bitcoin right now?", "prices"],
      ["what is the dollar to euro exchange rate today?", "prices"],
      ["hey! weather forecast for this weekend?", "weather"],
    ],
    no: [
      "how do weather forecasts work?",
      "what's the weather like on Mars?",
      "who won WW2?",
      "what was the price of bitcoin in 2010?",
      "explain stock prices",
      "what's the weather usually like in Tokyo in winter?",
      "give me a pancake recipe",
      "who won the 1998 World Cup?",
    ],
  },
  ja: {
    yes: [
      ["今日の天気は？", "weather"],
      ["明日の東京の天気は？", "weather"],
      ["昨夜の試合は誰が勝った？", "scores"],
      ["今日のニュースは？", "news"],
      ["ビットコインの今の価格は？", "prices"],
      ["今日のドル円の為替は？", "prices"],
    ],
    no: ["天気予報はどうやって作られるの？", "火星の天気は？", "第二次世界大戦で勝ったのは誰？", "2010年のビットコインの価格は？", "株価について説明して", "冬の東京の天気は普段どう？"],
  },
  de: {
    yes: [
      ["Wie ist das Wetter heute?", "weather"],
      ["Regnet es morgen in Berlin?", "weather"],
      ["Wer hat gestern das Spiel gewonnen?", "scores"],
      ["Was gibt es Neues in den Nachrichten heute?", "news"],
      ["Was ist der aktuelle Bitcoin-Kurs?", "prices"],
      ["Wie ist der Wechselkurs heute?", "prices"],
    ],
    no: ["Wie funktioniert eine Wettervorhersage?", "Wie ist das Wetter auf dem Mars?", "Wer hat den Zweiten Weltkrieg gewonnen?", "Was war der Bitcoin-Kurs 2010?", "Erkläre Aktienkurse", "Wie ist das Wetter normalerweise im Winter in Tokio?"],
  },
  fr: {
    yes: [
      ["Quel temps fait-il aujourd'hui ?", "weather"],
      ["Météo de demain à Paris ?", "weather"],
      ["Qui a gagné le match hier soir ?", "scores"],
      ["Quelles sont les dernières actualités ?", "news"],
      ["Quel est le prix du bitcoin en ce moment ?", "prices"],
      ["Quel est le taux de change euro dollar aujourd'hui ?", "prices"],
    ],
    no: ["Comment fonctionnent les prévisions météo ?", "Quel temps fait-il sur Mars ?", "Qui a gagné la Seconde Guerre mondiale ?", "Quel était le prix du bitcoin en 2010 ?", "Explique le cours des actions", "Quel temps fait-il d'habitude à Tokyo en hiver ?"],
  },
  es: {
    yes: [
      ["¿Qué tiempo hace hoy?", "weather"],
      ["¿Va a llover mañana en Madrid?", "weather"],
      ["¿Quién ganó el partido anoche?", "scores"],
      ["¿Cuáles son las últimas noticias?", "news"],
      ["¿Cuál es el precio del bitcoin ahora?", "prices"],
      ["¿Cuál es el tipo de cambio hoy?", "prices"],
    ],
    no: ["¿Cómo funciona el pronóstico del tiempo?", "¿Qué tiempo hace en Marte?", "¿Quién ganó la Segunda Guerra Mundial?", "¿Cuál era el precio del bitcoin en 2010?", "Explica los precios de las acciones", "¿Qué tiempo suele hacer en Tokio en invierno?"],
  },
  "pt-BR": {
    yes: [
      ["Como está o tempo hoje?", "weather"],
      ["Vai chover amanhã em São Paulo?", "weather"],
      ["Quem ganhou o jogo ontem à noite?", "scores"],
      ["Quais são as últimas notícias?", "news"],
      ["Qual é o preço do bitcoin agora?", "prices"],
      ["Qual é a cotação do dólar hoje?", "prices"],
    ],
    no: ["Como funciona a previsão do tempo?", "Como é o clima em Marte?", "Quem ganhou a Segunda Guerra Mundial?", "Qual era o preço do bitcoin em 2010?", "Explique o preço das ações", "Como costuma ser o clima em Tóquio no inverno?"],
  },
  ko: {
    yes: [
      ["오늘 날씨 어때?", "weather"],
      ["내일 서울에 비가 와?", "weather"],
      ["어젯밤 경기 누가 이겼어?", "scores"],
      ["오늘 뉴스 알려줘", "news"],
      ["지금 비트코인 가격 얼마야?", "prices"],
      ["오늘 환율 얼마야?", "prices"],
    ],
    no: ["일기예보는 어떻게 만들어져?", "화성의 날씨는 어때?", "2차 세계대전은 누가 이겼어?", "2010년 비트코인 가격은?", "주가에 대해 설명해 줘", "도쿄의 겨울 날씨는 보통 어때?"],
  },
  "zh-Hant": {
    yes: [
      ["今天天氣如何？", "weather"],
      ["明天東京會下雨嗎？", "weather"],
      ["昨晚的比賽誰贏了？", "scores"],
      ["今天有什麼新聞？", "news"],
      ["現在比特幣價格多少？", "prices"],
      ["今天美元匯率是多少？", "prices"],
    ],
    no: ["天氣預報是怎麼做出來的？", "火星的天氣如何？", "誰贏了第二次世界大戰？", "2010年比特幣的價格是多少？", "解釋一下股價", "東京冬天的天氣通常怎樣？"],
  },
  he: {
    yes: [
      ["מה מזג האוויר היום?", "weather"],
      ["ירד גשם מחר בתל אביב?", "weather"],
      ["מי ניצח במשחק אתמול בלילה?", "scores"],
      ["מה החדשות היום?", "news"],
      ["כמה עולה ביטקוין עכשיו?", "prices"],
      ["מה שער הדולר היום?", "prices"],
    ],
    no: ["איך עובדת תחזית מזג אוויר?", "מה מזג האוויר במאדים?", "מי ניצח במלחמת העולם השנייה?", "מה היה מחיר הביטקוין ב-2010?", "תסביר מחירי מניות", "מה מזג האוויר בדרך כלל בטוקיו בחורף?"],
  },
};

describe("round 134O · liveDataQuestion: a domain word and a live anchor, nothing else", () => {
  for (const [lang, { yes, no }] of Object.entries(CASES) as [SelfQuestionLang, (typeof CASES)[SelfQuestionLang]][]) {
    it(`${lang}: ${yes.length} positives, in that language, whatever the UI locale`, () => {
      expect(yes.length).toBeGreaterThanOrEqual(6);
      for (const [text, kind] of yes) {
        expect(liveDataQuestion(text, lang), text).toBe(kind);
        expect(liveDataQuestionMatch(text, "en"), `${text} (UI en)`).toEqual({ kind, lang });
      }
    });
    it(`${lang}: ${no.length} negatives stay with the model`, () => {
      expect(no.length).toBeGreaterThanOrEqual(6);
      for (const text of no) expect(liveDataQuestion(text, lang), text).toBeNull();
    });
  }

  it("the 134M probes: only the weather question is live data, and no self-question is", () => {
    const probes = ["hey! what is this app?", "give me a pancake recipe", "how long do pancakes keep in the fridge?", "who won the last football World Cup?", "my 4 year old won't sleep, any tips?", "Draft a short, friendly message that", "tell me about yourself", "what can you do?"];
    for (const q of probes) expect(liveDataQuestion(q), q).toBeNull();
    expect(liveDataQuestion("what's the weather like today?")).toBe("weather");
    for (const [q] of CASES.en.yes) expect(selfQuestion(q), q).toBeNull();
  });

  it("a long message is a question for the model", () => {
    expect(liveDataQuestion("I'm writing a story where it rains today in a small town; can you describe the scene for the opening chapter?")).toBeNull();
  });
});
