import { describe, expect, it } from "vitest";
import { selfQuestion, selfQuestionMatch, type SelfQuestion, type SelfQuestionLang } from "../src/index";

type Case = [string, SelfQuestion];
const CASES: Record<SelfQuestionLang, { yes: Case[]; no: string[] }> = {
  en: {
    yes: [
      ["who are you anyway?", "identity"],
      ["So who are you?", "identity"],
      ["well, what are you exactly?", "identity"],
      ["ok and who made you then?", "identity"],
      ["but what is this app, really?", "identity"],
      ["um, what can you do again?", "capabilities"],
      ["okay what can you do now?", "capabilities"],
      ["what can you do though", "capabilities"],
      ["hi, is this like chatgpt?", "identity"],
      ["what's your name, please?", "identity"],
    ],
    no: ["who are you anyway to tell me that?", "so what can you do with PDFs anyway?", "well, tell me about Paris then", "who are the Beatles anyway?", "and who made the Eiffel tower, really?", "is this like a recipe?", "is this chatgpt's answer copied?"],
  },
  ja: { yes: [["ところで、あなたは誰ですか？", "identity"], ["じゃあ何ができますか？", "capabilities"]], no: ["ところで、パリについて教えて", "じゃあエッフェル塔は誰が作った？"] },
  de: {
    yes: [["Wer bist du eigentlich?", "identity"], ["Und wer bist du denn?", "identity"], ["Aber was kannst du überhaupt?", "capabilities"]],
    no: ["Wer bist du eigentlich in diesem Märchen?", "Und erzähl mir von Paris"],
  },
  fr: {
    yes: [["Qui es-tu au juste ?", "identity"], ["Et tu es qui, alors ?", "identity"], ["Mais que peux-tu faire, exactement ?", "capabilities"]],
    no: ["Qui es-tu pour juger, au juste ?", "Et parle-moi de Paris alors"],
  },
  es: {
    yes: [["¿Y quién eres exactamente?", "identity"], ["Pero ¿qué puedes hacer, entonces?", "capabilities"]],
    no: ["¿Y quién construyó la torre Eiffel, entonces?", "Pero háblame de París"],
  },
  "pt-BR": {
    yes: [["Quem é você afinal?", "identity"], ["E o que você pode fazer, exatamente?", "capabilities"]],
    no: ["Quem é você na fila do pão, afinal?", "Mas fale sobre Paris"],
  },
  ko: { yes: [["근데 너는 누구야?", "identity"], ["그래서 뭘 할 수 있어?", "capabilities"]], no: ["근데 파리에 대해 알려줘"] },
  "zh-Hant": { yes: [["所以你是誰？", "identity"], ["那你能做什麼？", "capabilities"]], no: ["那是什麼？", "所以巴黎在哪裡？"] },
  he: {
    yes: [["מי אתה בכלל?", "identity"], ["אז מה אתה יודע לעשות בעצם?", "capabilities"], ["אבל איך קוראים לך?", "identity"]],
    no: ["אז ספר לי על פריז", "מי אתה בכלל שתגיד לי?"],
  },
};

describe("round 134P · a self-question with an opener or a filler around it is still the app's to answer", () => {
  for (const [lang, { yes, no }] of Object.entries(CASES) as [SelfQuestionLang, (typeof CASES)[SelfQuestionLang]][]) {
    it(`${lang}: ${yes.length} with a filler match, ${no.length} stay with the model`, () => {
      for (const [text, kind] of yes) {
        expect(selfQuestion(text, lang), text).toBe(kind);
        expect(selfQuestionMatch(text, "en"), `${text} (UI en)`).toEqual({ kind, lang });
      }
      for (const text of no) expect(selfQuestion(text, lang), text).toBeNull();
    });
  }

  it("the build 43 walk's negatives still go to the model (sim-jb-11…13)", () => {
    for (const q of ["what can you do with PDFs?", "tell me about Paris", "how do weather forecasts work?"]) expect(selfQuestion(q), q).toBeNull();
  });
});
