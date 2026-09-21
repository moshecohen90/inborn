import { describe, expect, it } from "vitest";
import {
  ANSWER_CEILING,
  LENGTH_INSTRUCTIONS,
  LENGTH_TOKENS,
  SAVING_CEILING,
  SPOKEN_CEILING,
  USE_LENGTH,
  composeSystemPrompt,
  detectExplicitLength,
  detectUse,
  isDraftAsk,
  isShortAsk,
  planAnswerLength,
  USE_CASES,
  type UseCase,
} from "../src/index";

/* F38 (Moshe, 22.9.2026, soak 6 on the OnePlus 6T): "when the bot answers it really digs / rambles" —
   "What is 2 plus 2?" cost 20 s and the third and fourth ask ran to the 1,024-token cap. */

const plan = (text: string, over: Partial<Parameters<typeof planAnswerLength>[0]> = {}) =>
  planAnswerLength({ text, use: detectUse({ text }), ...over });

describe("the length policy answers a short question shortly", () => {
  it("a short factual question is one to three sentences, not a 1,024-token essay", () => {
    const p = plan("What is 2 plus 2?");
    expect(p.length).toBe("short");
    expect(p.maxTokens).toBe(LENGTH_TOKENS.short);
    expect(p.maxTokens).toBeLessThan(ANSWER_CEILING / 3);
    expect(p.instruction).toBe(LENGTH_INSTRUCTIONS.short);
    expect(p.explicit).toBe(false);
  });

  it("counts instead of reading, so a Hebrew or Japanese question is judged like an English one", () => {
    for (const q of ["What is the capital of France?", "מה הבירה של צרפת?", "フランスの首都はどこですか？", "프랑스의 수도는 어디인가요?"]) {
      expect(isShortAsk(q)).toBe(true);
      expect(plan(q).length).toBe("short");
    }
  });

  it("a bare phrase too short to be asking for an essay is short too", () => {
    expect(plan("capital of France").length).toBe("short");
    expect(isShortAsk("")).toBe(false);
  });

  it("an open question that is not short stays moderate, well under the ceiling", () => {
    const p = plan("Walk me through what happened to the Roman Republic between the Gracchi and Augustus, and why");
    expect(p.length).toBe("moderate");
    expect(p.maxTokens).toBe(LENGTH_TOKENS.moderate);
  });
});

describe("work that is legitimately long is not truncated", () => {
  it("a drafted document gets the ceiling, however briefly it was asked for", () => {
    const p = plan("Write a formal letter to my landlord about a broken heater");
    expect(isDraftAsk("Write a formal letter to my landlord about a broken heater")).toBe(true);
    expect(p.length).toBe("long");
    expect(p.maxTokens).toBe(ANSWER_CEILING);
  });

  it("a translation is as long as its source", () => {
    expect(plan("Translate this paragraph into Spanish").length).toBe("long");
    expect(plan("תרגם את זה לאנגלית").length).toBe("long");
  });

  it("code, writing, summarize, translate and documents never start below their use's length", () => {
    expect(USE_LENGTH.code).toBe("long");
    expect(USE_LENGTH.writing).toBe("long");
    expect(USE_LENGTH.summarize).toBe("long");
    expect(USE_LENGTH.translate).toBe("long");
    expect(planAnswerLength({ text: "fix this", use: "code" }).maxTokens).toBe(ANSWER_CEILING);
  });

  it("every use case has a length and every length has tokens and an instruction", () => {
    for (const u of USE_CASES) {
      const length = USE_LENGTH[u as UseCase];
      expect(LENGTH_TOKENS[length]).toBeGreaterThan(0);
      expect(LENGTH_INSTRUCTIONS[length].length).toBeGreaterThan(20);
      expect(LENGTH_TOKENS[length]).toBeLessThanOrEqual(ANSWER_CEILING);
    }
  });

  it('"Continue" on a stopped answer asks for the rest, so it gets the ceiling', () => {
    const p = plan("Continue exactly where you stopped. Do not repeat what you already wrote.", { continuing: true });
    expect(p.length).toBe("long");
    expect(p.maxTokens).toBe(ANSWER_CEILING);
  });
});

describe("what the user asks for beats the heuristic", () => {
  it('"in about 200 words" is matched, not clipped', () => {
    expect(detectExplicitLength("Summarize the causes of World War One in about 200 words.")).toEqual({ kind: "count", words: 200 });
    const p = plan("Summarize the causes of World War One in about 200 words.");
    expect(p.explicit).toBe(true);
    expect(p.maxTokens).toBe(200 * 3 + 64);
    expect(p.instruction).toContain("about 200 words");
  });

  it("sentences and paragraphs become words", () => {
    expect(detectExplicitLength("answer in 3 sentences")).toEqual({ kind: "count", words: 75 });
    expect(detectExplicitLength("write two paragraphs about oak trees")).toEqual({ kind: "count", words: 160 });
  });

  it("the unit words of the shipped locales and Hebrew are read", () => {
    expect(detectExplicitLength("Erkläre das in etwa 150 Wörtern")?.words).toBe(150);
    expect(detectExplicitLength("explícalo en 120 palabras")?.words).toBe(120);
    expect(detectExplicitLength("explique en 90 mots")?.words).toBe(90);
    expect(detectExplicitLength("explique em 80 palavras")?.words).toBe(80);
    expect(detectExplicitLength("100字で説明して")?.words).toBe(100);
    expect(detectExplicitLength("100단어로 설명해줘")?.words).toBe(100);
    expect(detectExplicitLength("תסביר ב-120 מילים")?.words).toBe(120);
  });

  it('"in detail" lifts a short question to the ceiling, "briefly" holds a long one down', () => {
    const long = plan("What is 2 plus 2? Explain in detail.");
    expect(long.length).toBe("long");
    expect(long.maxTokens).toBe(ANSWER_CEILING);
    const short = plan("Write a letter to my landlord about a broken heater, briefly");
    expect(short.length).toBe("short");
    expect(short.maxTokens).toBe(LENGTH_TOKENS.short);
  });

  it("a request for more words than the ceiling holds is still clamped to the ceiling", () => {
    const p = plan("Write an essay of 2000 words about the sea");
    expect(p.explicit).toBe(true);
    expect(p.maxTokens).toBe(ANSWER_CEILING);
  });
});

describe("the cap never rises above the ceiling the device allows", () => {
  it("every plan is clamped to the ceiling it is given, saving mode included", () => {
    const texts = ["What is 2 plus 2?", "Write a formal letter to my landlord", "Summarize this in about 400 words", "Tell me about the sea"];
    for (const text of texts) {
      for (const ceiling of [SAVING_CEILING, 256, 64, ANSWER_CEILING]) {
        const p = plan(text, { ceiling });
        expect(p.maxTokens).toBeLessThanOrEqual(ceiling);
        expect(p.maxTokens).toBeGreaterThan(0);
      }
    }
  });

  it("a ceiling above the hard ceiling does not raise it", () => {
    expect(plan("Write a long essay about the sea", { ceiling: 8192 }).maxTokens).toBe(ANSWER_CEILING);
  });
});

describe("a spoken answer is shorter than a typed one", () => {
  it("hands-free gets the spoken budget and the spoken line", () => {
    const p = planAnswerLength({ text: "what is the capital of France", use: "voice", spoken: true });
    expect(p.length).toBe("spoken");
    expect(p.maxTokens).toBe(LENGTH_TOKENS.spoken);
    expect(p.maxTokens).toBeLessThan(LENGTH_TOKENS.short);
    expect(p.instruction).toBe(LENGTH_INSTRUCTIONS.spoken);
  });

  it("even an explicit request for a long answer stays inside the spoken ceiling, and says so", () => {
    const p = planAnswerLength({ text: "explain the Roman Republic in detail", use: "voice", spoken: true });
    expect(p.maxTokens).toBe(SPOKEN_CEILING);
    expect(p.maxTokens).toBeLessThan(ANSWER_CEILING);
    expect(p.instruction).toContain(LENGTH_INSTRUCTIONS.spoken);
  });
});

describe("the instruction reaches the model", () => {
  it("it is the last block of the system prompt, after the language hint", () => {
    const p = plan("What is 2 plus 2?");
    const system = composeSystemPrompt({ baseline: "BASE", persona: { systemPrompt: "PERSONA" }, languageHint: "HINT", length: p.instruction });
    expect(system.endsWith(p.instruction)).toBe(true);
    expect(system.indexOf("HINT")).toBeLessThan(system.indexOf(p.instruction));
    expect(system.startsWith("BASE")).toBe(true);
  });

  it("no length, no block", () => {
    expect(composeSystemPrompt({ baseline: "BASE", length: "   " })).toBe("BASE");
  });
});
