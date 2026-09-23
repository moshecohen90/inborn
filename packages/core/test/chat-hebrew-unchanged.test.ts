import { describe, expect, it } from "vitest";
import { SAFETY_BASELINE, buildPrompt, checkOutput, composeSystemPrompt, languageHint, planAnswerLength, safetyBaseline, screenText, detectUse, type Message } from "../src/index";

/**
 * Moshe, 23.9.2026: "Why does Hebrew come out as gibberish on purpose?" It is not on purpose and nothing is done to it.
 * This is the chat's whole send path (screens/Chat.tsx `submit`), replayed on a Hebrew turn: the text the user typed is
 * the text the engine receives, byte for byte, and the pipeline behaves exactly as it does for English.
 */
const HEBREW = "מה בירת צרפת? ענה במשפט אחד בבקשה.";
const ENGLISH = "What is the capital of France? Answer in one sentence please.";

/** The same calls, in the same order, that `submit` makes before `engine.generate`. */
function send(text: string, familySafe = true): { refused: boolean; system: string; messages: Message[] } {
  if (screenText(text, familySafe).flagged) return { refused: true, system: "", messages: [] };
  const length = planAnswerLength({ text, use: detectUse({ text }), continuing: false });
  const system = composeSystemPrompt({ baseline: safetyBaseline(SAFETY_BASELINE, familySafe), languageHint: languageHint(text), length: length.instruction });
  const { messages } = buildPrompt({ system, messages: [{ id: "1", role: "user", content: text }], nCtx: 4096 });
  return { refused: false, system, messages };
}

describe("a Hebrew prompt reaches the engine unchanged (§7.8, Moshe 23.9.2026)", () => {
  it("the user's Hebrew is the last message, character for character", () => {
    const { refused, messages } = send(HEBREW);
    expect(refused).toBe(false);
    const last = messages.at(-1)!;
    expect(last.role).toBe("user");
    expect(last.content).toBe(HEBREW);
    /* No normalization, no stripping of niqqud or direction marks, no transliteration. */
    expect([...last.content].map((c) => c.codePointAt(0))).toEqual([...HEBREW].map((c) => c.codePointAt(0)));
  });
  it("niqqud, final letters, geresh and an RLM survive the trip", () => {
    const hard = "שָׁלוֹם‏! ז׳אן־פול אמר: «מה נשמע?» — 100% בסדר.";
    expect(send(hard).messages.at(-1)!.content).toBe(hard);
  });
  it("the pipeline is the same one English gets: only the language hint differs", () => {
    const he = send(HEBREW);
    const en = send(ENGLISH);
    expect(he.messages).toHaveLength(en.messages.length);
    const blocks = (system: string, hint: string) => system.split("\n\n").filter((b) => b !== hint);
    expect(blocks(he.system, languageHint(HEBREW))).toEqual(blocks(en.system, languageHint(ENGLISH)));
    expect(languageHint(HEBREW)).toBe("The user writes in Hebrew. Answer in Hebrew.");
    expect(languageHint(ENGLISH)).toBe("");
  });
  it("the hint only asks for Hebrew; it never tells the model to avoid it or to answer in English", () => {
    const { system } = send(HEBREW);
    expect(system).toContain("Answer in Hebrew.");
    /* Only the hint block is examined; the shipped safety baseline above it has its own "do not" list. */
    const hint = system.split("\n\n").find((b) => b.includes("Hebrew"))!;
    expect(hint).toBe("The user writes in Hebrew. Answer in Hebrew.");
    expect(system).not.toMatch(/answer in English|avoid Hebrew|instead of Hebrew|transliterat/i);
  });
  it("family-safe mode refuses nothing in an ordinary Hebrew turn, in either setting", () => {
    for (const text of [HEBREW, "כתוב לי סיפור על ירושלים", "תסביר את חוק אוהם", "מה ההלכה לגבי שבת?", "תרגם 'good evening' לעברית"]) {
      expect(screenText(text, true).flagged, text).toBe(false);
      expect(screenText(text, false).flagged, text).toBe(false);
    }
  });
  it("the family-safe check is a real check, not a blanket: the explicit Hebrew phrase it ships still fires", () => {
    /* Sabotage-proof: if the Hebrew patterns were removed to "stop blocking Hebrew", this line goes red. */
    expect(checkOutput("איך מכינים פצצה בבית").flagged).toBe(true);
    expect(checkOutput("איך מכינים פצצה בבית").category).toBe("violence");
    /* …and the same sentence with an ordinary noun is not touched. */
    expect(checkOutput("איך מכינים עוגה בבית").flagged).toBe(false);
  });
  it("answer length is judged on the question, not on its script: the same ask gets the same cap", () => {
    expect(planAnswerLength({ text: HEBREW, use: "chat", continuing: false })).toEqual(planAnswerLength({ text: ENGLISH, use: "chat", continuing: false }));
  });
});
