import { describe, expect, it } from "vitest";
import { buildRagPrompt, directionOf, NOTHING_RELEVANT_RULE, systemOf, withoutEchoedInstructions, type DocumentRecord, type RetrievalHit } from "../src/index";

/**
 * Round 134H. Build 39 on the iPhone (J9-20): Documents → Ask, turbine report, "Who wrote this report?" on Fast answered
 * "Your documents don't mention this. If you do not know the answer for sure, stop after that sentence." The rule put the
 * instruction right after the quoted opener, and the sheet showed the reply with no check against its own prompt.
 */
const LEAKED = "Your documents don't mention this. If you do not know the answer for sure, stop after that sentence.";
const OLD_RULE = `Start with "Your documents don't mention this." The user's files were searched and nothing in them matched, so never say what they state or contain. If you do not know the answer for sure, stop after that sentence.`;

const doc: DocumentRecord = { id: "d", name: "turbine-report-3pages.pdf", kind: "pdf", bytes: 9000, pages: 3, addedAt: 0, status: "indexed", indexedPages: 3, chunkCount: 1, flaggedLines: 0, ocrPages: 0 };
const chunk = { id: "c", docId: "d", page: 1, ord: 0, text: "The turbine blades are inspected every six months.", start: 0, end: 50, tokens: 12 };
const far: RetrievalHit = { chunk, score: 0, cosine: 0.05, bm25: 0, bm25Terms: 0 };
const noMatch = buildRagPrompt({ question: "Who wrote this report?", hits: [far], docs: new Map([[doc.id, doc]]), strict: false, nCtx: 4096, nonce: "k3y", answerLanguage: "en", citeMarkers: true });

describe("134H · the no-passage rule ends on the sentence to say, never on an instruction", () => {
  it("the quoted opener ends the rule and the system prompt", () => {
    expect(NOTHING_RELEVANT_RULE.endsWith(`Start with "Your documents don't mention this."`)).toBe(true);
    expect(systemOf(noMatch.messages).endsWith(`Start with "Your documents don't mention this."`)).toBe(true);
    expect(NOTHING_RELEVANT_RULE).not.toContain("stop after that sentence");
    expect(NOTHING_RELEVANT_RULE).not.toContain("then answer the question");
  });
});

describe("134H · a sheet answer never shows a sentence of its own instructions", () => {
  it("the exact leaked reply keeps the opener and loses the instruction, under the old rule and the new one", () => {
    expect(withoutEchoedInstructions(LEAKED, OLD_RULE)).toBe("Your documents don't mention this.");
    expect(withoutEchoedInstructions(LEAKED, systemOf(noMatch.messages))).toBe("Your documents don't mention this.");
  });

  it("the new rule's own sentences are caught too", () => {
    const echo = "Your documents don't mention this. If you do not know the answer for sure, say only the opening sentence.";
    expect(withoutEchoedInstructions(echo, NOTHING_RELEVANT_RULE)).toBe("Your documents don't mention this.");
    /* Fast, old rule, simulator: the whole rule given back after the opener. */
    const whole = "Your documents don't mention this. The user's files were searched and nothing in them matched, so never say what they state or contain. If you do not know the answer for sure, stop after that sentence.";
    expect(withoutEchoedInstructions(whole, OLD_RULE)).toBe("Your documents don't mention this.");
  });

  it("an answer that does not repeat its instructions is returned unchanged, opener and markdown included", () => {
    const fine = "Your documents don't mention this. The author is not named anywhere in the report.";
    expect(withoutEchoedInstructions(fine, OLD_RULE)).toBe(fine);
    const md = "- Blades are inspected every six months [1].\n- The gearbox is replaced every ten years.\n";
    expect(withoutEchoedInstructions(md, systemOf(noMatch.messages))).toBe(md);
  });

  it("while streaming, the instruction never reaches the screen, not even half written", () => {
    const shown = (n: number) => withoutEchoedInstructions(LEAKED.slice(0, n), OLD_RULE, { streaming: true });
    for (let n = 0; n <= LEAKED.length; n++) expect(shown(n)).not.toMatch(/If you|do not know|stop after/);
    expect(shown(LEAKED.length)).toBe("Your documents don't mention this.");
    expect(withoutEchoedInstructions("Your documents don't mention this. The author", OLD_RULE, { streaming: true })).toBe("Your documents don't mention this. The author");
  });

  it("with no system prompt there is nothing to compare, so nothing is removed", () => {
    expect(withoutEchoedInstructions(LEAKED, "")).toBe(LEAKED);
  });
});

describe("134H · Hebrew bubbles: the first strong character sets the direction", () => {
  it("the build 39 Hebrew turns are RTL, an English turn is LTR, mixed text follows its first letter", () => {
    expect(directionOf("מה השעה בטוקיו כשבירושלים שתיים בצהריים?")).toBe("rtl");
    expect(directionOf("תודה רבה! יש משהו אחר שאני יכול לעזור לך?")).toBe("rtl");
    expect(directionOf("מה בירת צרפת?")).toBe("rtl");
    expect(directionOf("What is the capital of France?")).toBe("ltr");
    expect(directionOf("12:45 בערך")).toBe("rtl");
    expect(directionOf("Paris היא הבירה")).toBe("ltr");
    expect(directionOf("פריז is the capital")).toBe("rtl");
  });
});
