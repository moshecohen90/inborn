import { describe, expect, it } from "vitest";
import { ANSWER_CEILING, LENGTH_INSTRUCTIONS, LENGTH_TOKENS, detectUse, isExplanatoryAsk, isShortAsk, planAnswerLength } from "../src/index";

/* F39 (MosheAI, 22.9.2026): round 19's counting rule called every one-line question a short factual ask, so
   "How do I set up SSH keys on my Mac?" was answered in three sentences. A how-to, a reason, a comparison or a
   procedure keeps its use's own length; a real one-liner still gets the short plan. */

const plan = (text: string, over: Partial<Parameters<typeof planAnswerLength>[0]> = {}) => planAnswerLength({ text, use: detectUse({ text }), ...over });

describe("a how-to is not a short factual ask", () => {
  it("the SSH question gets a paragraph, not three sentences", () => {
    const q = "How do I set up SSH keys on my Mac?";
    expect(isShortAsk(q)).toBe(true);
    expect(isExplanatoryAsk(q)).toBe(true);
    const p = plan(q);
    expect(p.length).toBe("moderate");
    expect(p.maxTokens).toBe(LENGTH_TOKENS.moderate);
    expect(p.instruction).toBe(LENGTH_INSTRUCTIONS.moderate);
    expect(p.explicit).toBe(false);
  });

  it("a reason, an explanation, a comparison, a procedure and a choice are all explanatory", () => {
    for (const q of [
      "Why is the sky blue?",
      "How does a refrigerator work?",
      "Explain TCP handshakes",
      "What is the difference between TCP and UDP?",
      "Compare Rust and Go for a CLI",
      "Pros and cons of renting?",
      "Walk me through a git rebase",
      "What happens if I delete the .git folder?",
      "Should I rent or buy?",
      "Tell me about the Roman Republic",
    ]) {
      expect(isExplanatoryAsk(q), q).toBe(true);
      expect(plan(q).length, q).toBe("moderate");
    }
  });
});

describe("a real short factual question is still short", () => {
  it("the one-liners round 19 shortened stay shortened", () => {
    for (const q of ["What is the capital of France?", "What is 2 plus 2?", "מה הבירה של צרפת?", "capital of France", "Who wrote Hamlet?", "How much does a stamp cost?"]) {
      expect(isExplanatoryAsk(q), q).toBe(false);
      const p = plan(q);
      expect(p.length, q).toBe("short");
      expect(p.maxTokens, q).toBe(LENGTH_TOKENS.short);
    }
  });
});

describe("the eight shipped locales and Hebrew are read too", () => {
  it("a how-to in each of them lands on moderate", () => {
    const asks: readonly [string, string][] = [
      ["de", "Wie richte ich SSH-Schlüssel ein?"],
      ["fr", "Comment configurer des clés SSH sur mon Mac ?"],
      ["es", "¿Cómo configuro las claves SSH en mi Mac?"],
      ["pt-BR", "Como configuro chaves SSH no meu Mac?"],
      ["ja", "Macでどうやって SSH 鍵を設定しますか？"],
      ["ko", "Mac에서 SSH 키를 어떻게 설정하나요?"],
      ["zh-Hant", "如何在 Mac 上設定 SSH 金鑰？"],
      ["he", "איך מגדירים מפתחות SSH במק?"],
      ["he", "למה השמיים כחולים?"],
      ["de", "Erkläre den Unterschied zwischen TCP und UDP"],
    ];
    for (const [tag, q] of asks) {
      expect(isExplanatoryAsk(q), tag).toBe(true);
      expect(plan(q).length, tag).toBe("moderate");
    }
  });

  it("a factual one-liner in those same languages is not caught by its question word", () => {
    for (const q of ["Wie viel kostet das?", "Wie alt ist er?", "フランスの首都はどこですか？", "프랑스의 수도는 어디인가요?", "法國的首都是哪裡？"]) {
      expect(isExplanatoryAsk(q), q).toBe(false);
      expect(plan(q).length, q).toBe("short");
    }
  });
});

describe("the rules above the heuristic still win", () => {
  it('"in one sentence" beats the explanatory detector', () => {
    const p = plan("Explain how SSH keys work in one sentence");
    expect(p.length).toBe("short");
    expect(p.explicit).toBe(true);
    /* One sentence is read as a count of about 25 words, so the cap is the count's floor, not the short plan's. */
    expect(p.maxTokens).toBe(160);
    expect(p.instruction).toContain("about 25 words");
  });

  it('"briefly" beats it too, and keeps the short plan', () => {
    const p = plan("Briefly, how do I set up SSH keys on my Mac?");
    expect(p.length).toBe("short");
    expect(p.maxTokens).toBe(LENGTH_TOKENS.short);
    expect(p.instruction).toBe(LENGTH_INSTRUCTIONS.short);
  });

  it("a drafted document is still long, even when it asks to explain something", () => {
    const p = plan("Write an email to my team explaining how our SSH keys work");
    expect(p.length).toBe("long");
    expect(p.maxTokens).toBe(ANSWER_CEILING);
  });

  it("a spoken how-to stays inside the spoken budget", () => {
    const p = planAnswerLength({ text: "How do I set up SSH keys on my Mac?", use: "voice", spoken: true });
    expect(p.length).toBe("spoken");
    expect(p.maxTokens).toBe(LENGTH_TOKENS.spoken);
  });

  it("the device ceiling still clamps an explanatory ask", () => {
    expect(plan("Why is the sky blue?", { ceiling: 256 }).maxTokens).toBe(256);
  });

  it('Hebrew "למה" inside an ordinary word is not a question word', () => {
    expect(isExplanatoryAsk("מי היה שלמה המלך?")).toBe(false);
    expect(plan("מי היה שלמה המלך?").length).toBe("short");
    expect(isExplanatoryAsk("למה שלמה בנה את המקדש?")).toBe(true);
  });

  it("empty text is neither", () => {
    expect(isExplanatoryAsk("   ")).toBe(false);
  });
});
