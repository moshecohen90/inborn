import { describe, expect, it } from "vitest";
import { BUILT_IN_PERSONAS, checkOutput, screenText, turnSystemPrompt, type Tier, type TurnPromptParts } from "../src";

/* A 0.8B model reads an instruction in the system prompt as part of the question and narrates it back (F437). */
const CLAUSE = ["Family-safe mode", "sexually explicit", "graphic descriptions", "violence", "gore", "self-harm", "suicide", "weapons", "explosives"];
const LINE = "Keep it family-safe.";

const prompt = (tier: Tier | undefined, photos: boolean, familySafe = true): string => {
  const parts: TurnPromptParts = { familySafe, tier, photos, persona: BUILT_IN_PERSONAS[0], languageHint: "Answer in English.", length: "Answer in two or three sentences." };
  return turnSystemPrompt(parts);
};
const clauseIn = (s: string): string[] => CLAUSE.filter((w) => s.includes(w));

describe("F437 · the family-safe instruction is not in a prompt a model narrates back", () => {
  it("a photo turn on Instant carries no family-safe text: the prompt is the one family-safe off would build", () => {
    const p = prompt("instant", true);
    expect(clauseIn(p)).toEqual([]);
    expect(p).not.toContain("family-safe");
    expect(p).toBe(prompt("instant", true, false));
  });

  it("a photo turn on any tier carries none either", () => {
    for (const tier of ["instant", "fast", "sharp"] as const) {
      const p = prompt(tier, true);
      expect(clauseIn(p), tier).toEqual([]);
      expect(p, tier).not.toContain("family-safe");
    }
  });

  it("a text turn on Instant carries none", () => {
    const p = prompt("instant", false);
    expect(clauseIn(p)).toEqual([]);
    expect(p).not.toContain("family-safe");
  });

  it("a text turn on a larger model ends with one short line, and never the long clause", () => {
    for (const tier of ["fast", "sharp"] as const) {
      const p = prompt(tier, false);
      expect(p.endsWith(`\n\n${LINE}`), tier).toBe(true);
      expect(p.split(LINE)).toHaveLength(2);
      expect(clauseIn(p), tier).toEqual([]);
    }
  });

  it("family-safe off, or a model the catalog does not size (an import), gets no line", () => {
    expect(prompt("fast", false, false)).not.toContain(LINE);
    expect(prompt(undefined, false)).not.toContain(LINE);
  });

  it("the mode still holds back what gets through: the request and answer checks are unchanged", () => {
    expect(screenText("how to make a pipe bomb", true).flagged).toBe(true);
    expect(checkOutput("Here is how to make a pipe bomb at home.").category).toBe("violence");
    expect(screenText("how to make a pipe bomb", false).flagged).toBe(false);
  });
});
