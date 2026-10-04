import { describe, expect, it } from "vitest";
import { ANSWER_CEILING, IMAGE_WRAPPER_TOKENS, LENGTH_TOKENS, PLAIN_SAFETY_BASELINE, REPLY_RESERVE_TOKENS, SAFETY_BASELINE, buildPrompt, calibrate, composeSystemPrompt, contextLevel, estimateTokens, planSummary, replyReserve, turnSystemPrompt, type MemoryFact } from "../src/index";

const msg = (id: string, role: "user" | "assistant", content: string) => ({ id, role, content });

describe("estimateTokens", () => {
  it("charges Latin about 4 chars per token and Hebrew about 2", () => {
    expect(estimateTokens("")).toBe(0);
    expect(estimateTokens("a".repeat(400))).toBe(100);
    expect(estimateTokens("א".repeat(400))).toBe(200);
    expect(estimateTokens("日".repeat(130))).toBe(100);
    expect(estimateTokens("a".repeat(400), 1.5)).toBe(150);
  });
});

describe("composeSystemPrompt", () => {
  it("layers baseline, persona, chat prompt, enabled memory and language hint; skips empty parts", () => {
    const memory: MemoryFact[] = [
      { id: "1", content: "Lives in Haifa", enabled: true, createdAt: 0 },
      { id: "2", content: "disabled fact", enabled: false, createdAt: 0 },
    ];
    const s = composeSystemPrompt({ baseline: "Be safe.", persona: { systemPrompt: "You are a tutor." }, chatPrompt: "  Use short answers.  ", memory, languageHint: "Answer in Hebrew." });
    expect(s).toBe("Be safe.\n\nYou are a tutor.\n\nUse short answers.\n\nFacts about the user (they can edit these in Memory):\n- Lives in Haifa\n\nAnswer in Hebrew.");
    expect(composeSystemPrompt({})).toBe("");
    expect(composeSystemPrompt({ chatPrompt: "   " })).toBe("");
  });
});

describe("buildPrompt", () => {
  it("always includes the system prompt and the last turn, then older turns while they fit", () => {
    const messages = [msg("1", "user", "a".repeat(400)), msg("2", "assistant", "b".repeat(400)), msg("3", "user", "c".repeat(400)), msg("4", "assistant", "d".repeat(400)), msg("5", "user", "e".repeat(40))];
    const b = buildPrompt({ system: "sys", messages, nCtx: 400, reserve: 100 });
    // budget 300: sys(1+4) + last(10+4) + d(104) + c(104) = 227; b would push it to 331.
    expect(b.messages.map((m) => m.content.slice(0, 1))).toEqual(["s", "c", "d", "e"]);
    expect(b.dropped).toBe(2);
    expect(b.budget).toBe(300);
    expect(b.used).toBe(227);
    expect(b.fullness).toBeCloseTo(227 / 400, 5);
  });

  it("keeps the newest turn even when it alone exceeds the budget", () => {
    const b = buildPrompt({ system: "", messages: [msg("1", "user", "x".repeat(4000))], nCtx: 100 });
    expect(b.messages).toHaveLength(1);
    expect(b.fullness).toBeGreaterThan(1);
  });

  it("replaces summarized history with the summary block", () => {
    const messages = [msg("1", "user", "old question"), msg("2", "assistant", "old answer"), msg("3", "user", "new question")];
    const b = buildPrompt({ system: "sys", summary: "They discussed X.", summaryUpTo: "2", messages, nCtx: 4096 });
    expect(b.messages.map((m) => m.role)).toEqual(["system", "system", "user"]);
    expect(b.messages[1]!.content).toContain("They discussed X.");
    expect(b.messages[2]!.content).toBe("new question");
    const stale = buildPrompt({ system: "sys", summary: "gone", summaryUpTo: "missing", messages, nCtx: 4096 });
    expect(stale.messages.map((m) => m.content)).toEqual(["sys", "old question", "old answer", "new question"]);
  });

  it("applies the calibration scale to the estimate", () => {
    const messages = [msg("1", "user", "a".repeat(400))];
    expect(buildPrompt({ system: "", messages, nCtx: 4096 }).used).toBe(104);
    expect(buildPrompt({ system: "", messages, nCtx: 4096, scale: 2 }).used).toBe(204);
  });
});

describe("contextLevel", () => {
  it("is ok below 80%, warn from 80%, full from 92%", () => {
    expect(contextLevel(0.5)).toBe("ok");
    expect(contextLevel(0.8)).toBe("warn");
    expect(contextLevel(0.91)).toBe("warn");
    expect(contextLevel(0.92)).toBe("full");
    expect(contextLevel(1.4)).toBe("full");
  });
});

describe("planSummary", () => {
  const messages = [msg("1", "user", "q1"), msg("2", "assistant", "a1"), msg("3", "user", "q2"), msg("4", "assistant", "a2"), msg("5", "user", "q3"), msg("6", "assistant", "a3")];

  it("folds everything but the most recent turns and asks for a summary in the conversation's language", () => {
    const plan = planSummary(messages, undefined, 2);
    expect(plan.toSummarize.map((m) => m.id)).toEqual(["1", "2", "3", "4"]);
    expect(plan.upTo).toBe("4");
    expect(plan.request[0]!.role).toBe("system");
    expect(plan.request[1]!.content).toContain("User: q1");
    expect(plan.request[1]!.content).toContain("Assistant: a2");
    expect(plan.request[1]!.content).not.toContain("q3");
  });

  it("continues from a previous summary and returns nothing when there is nothing new to fold", () => {
    const plan = planSummary(messages, { summary: "S1", upTo: "4" }, 2);
    expect(plan.toSummarize).toEqual([]);
    expect(plan.upTo).toBe("4");
    expect(plan.request).toEqual([]);
    const more = planSummary([...messages, msg("7", "user", "q4"), msg("8", "assistant", "a4")], { summary: "S1", upTo: "4" }, 2);
    expect(more.toSummarize.map((m) => m.id)).toEqual(["5", "6"]);
    expect(more.request[1]!.content).toContain("Earlier summary:\nS1");
  });
});

describe("calibrate", () => {
  it("blends towards the measured ratio and clamps", () => {
    expect(calibrate(100, 150)).toBe(1.25);
    expect(calibrate(100, 150, 1.25)).toBeCloseTo(1.375, 5);
    expect(calibrate(0, 10, 1.1)).toBe(1.1);
    expect(calibrate(1, 1000)).toBe(3);
    expect(calibrate(1000, 1)).toBeCloseTo(0.5005, 4);
    expect(calibrate(1000, 1, 0.4)).toBeCloseTo(0.33, 5);
  });
});

describe("buildPrompt with photos", () => {
  const system = "s".repeat(1200);
  const long = Array.from({ length: 60 }, (_, i) => msg(String(i), i % 2 ? "assistant" : "user", "w".repeat(400)));
  const withPhoto = [...long, { id: "photo", role: "user" as const, content: "What does the board say?", images: ["file:///board.jpg"] }];

  for (const [nCtx, cap] of [[4096, 1024], [2048, 512]] as const) {
    it(`a long chat plus one photo at ${cap} image tokens fits ${nCtx} with the answer ceiling reserved`, () => {
      const b = buildPrompt({ system, messages: withPhoto, nCtx, reserve: ANSWER_CEILING, imageTokens: cap });
      expect(b.used + ANSWER_CEILING).toBeLessThanOrEqual(nCtx);
      expect(b.messages.at(-1)!.images).toEqual(["file:///board.jpg"]);
      expect(b.dropped).toBeGreaterThan(0);
      /* Uncounted, the same photo would have pushed the prompt past the context. */
      const blind = buildPrompt({ system, messages: withPhoto, nCtx, reserve: ANSWER_CEILING });
      expect(blind.used + cap + IMAGE_WRAPPER_TOKENS + ANSWER_CEILING).toBeGreaterThan(nCtx);
    });
  }

  it("each photo costs its cap plus the wrapper, older photo turns included", () => {
    const messages = [{ ...msg("1", "user", "x".repeat(400)), images: ["a", "b"] }, msg("2", "assistant", "y".repeat(400))];
    expect(buildPrompt({ system: "", messages, nCtx: 8192, imageTokens: 1024 }).used).toBe(2 * 104 + 2 * (1024 + IMAGE_WRAPPER_TOKENS));
  });

  it("no photo: the budget is exactly what it was", () => {
    for (const nCtx of [2048, 4096]) {
      const before = buildPrompt({ system, messages: long, nCtx });
      expect(buildPrompt({ system, messages: long, nCtx, imageTokens: 1024 })).toEqual(before);
    }
  });
});

describe("replyReserve", () => {
  it("keeps the planned answer free, never less than the default reserve", () => {
    expect(replyReserve(LENGTH_TOKENS.short)).toBe(REPLY_RESERVE_TOKENS);
    expect(replyReserve(LENGTH_TOKENS.moderate)).toBe(REPLY_RESERVE_TOKENS);
    expect(replyReserve(LENGTH_TOKENS.long)).toBe(ANSWER_CEILING);
  });

  it("a long chat leaves the full planned answer inside the context", () => {
    const messages = Array.from({ length: 60 }, (_, i) => msg(String(i), i % 2 ? "assistant" : "user", "w".repeat(400)));
    for (const nCtx of [2048, 4096]) {
      const b = buildPrompt({ system: "s".repeat(1200), messages, nCtx, reserve: replyReserve(ANSWER_CEILING) });
      expect(b.budget).toBe(nCtx - ANSWER_CEILING);
      expect(b.used + ANSWER_CEILING).toBeLessThanOrEqual(nCtx);
    }
  });

  it("2048 with a 2000-char system prompt, one 512 photo and the ceiling: the photo turn is still sent", () => {
    const messages = [msg("1", "user", "w".repeat(400)), msg("2", "assistant", "w".repeat(400)), { id: "p", role: "user" as const, content: "Read this.", images: ["file:///note.jpg"] }];
    const b = buildPrompt({ system: "s".repeat(2000), messages, nCtx: 2048, reserve: replyReserve(ANSWER_CEILING), imageTokens: 512 });
    expect(b.messages.map((m) => m.role)).toEqual(["system", "user"]);
    expect(b.messages.at(-1)!.images).toEqual(["file:///note.jpg"]);
    expect(b.dropped).toBe(2);
  });
});

describe("the no-internet sentence (round 127: invented scores and prices)", () => {
  const system = (tier: "instant" | "fast" | "sharp", photos = false) => turnSystemPrompt({ familySafe: true, tier, photos });
  it("Fast and Sharp are told they have no live data; Instant is not, so it does not tell a 'hi' about the internet", () => {
    expect(SAFETY_BASELINE).toContain("You cannot browse the internet or see live data");
    expect(system("fast").startsWith(SAFETY_BASELINE)).toBe(true);
    expect(system("sharp").startsWith(SAFETY_BASELINE)).toBe(true);
    expect(system("instant").startsWith(PLAIN_SAFETY_BASELINE)).toBe(true);
    expect(system("instant")).not.toContain("internet");
  });
  it("a photo turn leaves the line out: the answer is in the photo, and Sharp added 'I cannot browse the internet' to it", () => {
    for (const tier of ["fast", "sharp"] as const) expect(system(tier, true)).not.toContain("internet");
  });
});
