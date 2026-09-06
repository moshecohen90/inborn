import { describe, expect, it } from "vitest";
import { buildPrompt, calibrate, composeSystemPrompt, contextLevel, estimateTokens, planSummary, type MemoryFact } from "../src/index";

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
