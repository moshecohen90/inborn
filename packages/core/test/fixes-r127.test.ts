import { describe, expect, it } from "vitest";
import { LENGTH_INSTRUCTIONS, LENGTH_TOKENS, detectExplicitLength, detectUse, isRewriteAsk, planAnswerLength } from "../src/index";

/* Round 127 (docs/qa/v1-basics-baseline/ROUND-127.md): the offline baseline found Fast writing no code, rewrites answered
   as chat, and plans squeezed into "a paragraph at most". */

const plan = (text: string) => planAnswerLength({ text, use: detectUse({ text }) });

describe("a code request is code, and gets room", () => {
  it("'a word' is not a one-word length: the palindrome request kept Fast to one sentence", () => {
    expect(detectExplicitLength("Write a Python function that checks if a word is a palindrome.")).toBeNull();
    expect(detectExplicitLength("Answer in a word.")).toEqual({ kind: "count", words: 1 });
    expect(detectExplicitLength("Explain it in a sentence")).toEqual({ kind: "count", words: 25 });
    expect(detectExplicitLength("Describe it in two sentences")).toEqual({ kind: "count", words: 50 });
  });
  it("'write … function / script / code' is code in the launch languages", () => {
    for (const text of [
      "Write a Python function that checks if a word is a palindrome.",
      "write a bash script to rename my photos",
      "Schreib mir eine Funktion, die Primzahlen findet",
      "Escribe una función en Python que sume una lista",
      "Écris une fonction qui inverse une chaîne",
      "Escreva uma função que conte as vogais",
      "文字列を逆にする関数を書いてください",
      "문자열을 뒤집는 함수를 작성해 주세요",
      "請寫一個反轉字串的函數",
    ])
      expect(detectUse({ text }), text).toBe("code");
    expect(plan("Write a Python function that checks if a word is a palindrome.").length).toBe("long");
    expect(detectUse({ text: "Write a short poem about the sea" })).toBe("chat");
  });
});

describe("a rewrite of the user's own text is writing", () => {
  it("'make … more polite', rewrite, reword, fix my email, in all eight languages", () => {
    for (const text of [
      'Make this email more polite: "You still haven\'t sent me the report."',
      "Can you reword this for me: we are late again",
      "fix my email: hey send the file now",
      'Formuliere diese E-Mail höflicher: "Sie haben mir den Bericht immer noch nicht geschickt."',
      'Haz este correo más educado: "Todavía no me has enviado el informe."',
      "Rends cet e-mail plus poli : « Tu ne m'as toujours pas envoyé le rapport. »",
      'Deixe este e-mail mais educado: "Você ainda não me mandou o relatório."',
      "このメールをもっと丁寧にしてください：「まだ報告書が届いていません。」",
      '이 이메일을 더 정중하게 바꿔 주세요: "아직도 보고서를 안 보냈네요."',
      "請把這封信改得更有禮貌：「你還沒把報告寄給我。」",
    ]) {
      expect(isRewriteAsk(text), text).toBe(true);
      expect(detectUse({ text }), text).toBe("writing");
      expect(plan(text).length, text).toBe("moderate");
      expect(plan(text).maxTokens, text).toBe(LENGTH_TOKENS.moderate);
      expect(plan(text).instruction, text).toBe(LENGTH_INSTRUCTIONS.moderate);
    }
    expect(isRewriteAsk("What is the capital of Australia?")).toBe(false);
  });

  it("a rewrite is one text the size of the original, not the long plan that drew menus of versions (127b)", () => {
    const text = 'Make this email more polite: "Send me the report now."';
    expect(planAnswerLength({ text, use: "writing" }).length).toBe("moderate");
    expect(planAnswerLength({ text: `${text} Give me a detailed version.`, use: "writing" }).length).toBe("long");
    expect(planAnswerLength({ text, use: "writing", continuing: true }).length).toBe("long");
    expect(planAnswerLength({ text, use: "writing", spoken: true }).length).toBe("spoken");
    expect(plan("Write a letter to my landlord about the broken heater.").length).toBe("long");
  });
});

describe("plans, itineraries and step lists get room", () => {
  it("one line per day is many lines, never 'a paragraph at most'", () => {
    for (const text of ["Plan a 3-day trip to Kyoto for me, one line per day.", "Give me the steps to change a bike tire", "Planifica mi semana de estudio", "京都の3日間の旅行計画を立てて"]) {
      expect(plan(text).length, text).toBe("long");
      expect(plan(text).maxTokens, text).toBe(LENGTH_TOKENS.long);
    }
    expect(plan("What is the plan?").length).toBe("short");
  });
});
