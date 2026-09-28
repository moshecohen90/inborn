import { describe, expect, it } from "vitest";
import { withoutEchoedLabels, type Citation } from "../src/index";

/**
 * Round 126 (F457). The web, Instant (Qwen3.5-0.8B), 28.9: Ask your documents answered "[1] office.txt · part 1" on its
 * first line, then the sentence, while the same label sat under it as the citation chip. The prompt numbers each passage
 * "[n] <file> · part k", and the 0.8B model copies that header.
 */
const SENTENCE = "The support phone number is 555-0134. The office closes at 6 in the evening.";
const office: Citation = { n: 1, docId: "d", docName: "office.txt", kind: "txt", page: 1, chunkId: "c", snippet: "" };
const faq: Citation = { n: 2, docId: "f", docName: "faq.pdf", kind: "pdf", page: 3, chunkId: "f3", snippet: "" };

describe("F457 · the answer does not start with the passage label it was given", () => {
  it("the on-screen answer of 05c starts with the sentence", () => {
    expect(withoutEchoedLabels(`[1] office.txt · part 1\n${SENTENCE}`)).toBe(SENTENCE);
    expect(withoutEchoedLabels(`[1] office.txt · part 1\n\n${SENTENCE}`)).toBe(SENTENCE);
  });

  it("a leading run of labels goes, in the prompt's forms and the page form", () => {
    expect(withoutEchoedLabels(`[1] office.txt · part 1\n[2] faq.pdf · p.3\n\n${SENTENCE}`)).toBe(SENTENCE);
    expect(withoutEchoedLabels(`**[1] office.txt · part 1**\n${SENTENCE}`)).toBe(SENTENCE);
    expect(withoutEchoedLabels(`[2] faq.pdf · page 3\n${SENTENCE}`)).toBe(SENTENCE);
    expect(withoutEchoedLabels(`[1] book.xlsx · sheet 2\n${SENTENCE}`)).toBe(SENTENCE);
  });

  it("counter-example: a [n] marker that opens a sentence is the citation and stays (round 124's live answer)", () => {
    const cited = "[1] The support phone number is 555-0134, and the office closes at 6 in the evening.";
    expect(withoutEchoedLabels(cited)).toBe(cited);
    const inside = `The support phone number is 555-0134 [1]. The office closes at 6 in the evening [1].`;
    expect(withoutEchoedLabels(inside)).toBe(inside);
  });

  it("counter-example: an answer that is only a label keeps it", () => {
    expect(withoutEchoedLabels("[1] office.txt · part 1")).toBe("[1] office.txt · part 1");
    expect(withoutEchoedLabels("[1] office.txt · part 1\n")).toBe("[1] office.txt · part 1\n");
  });

  it("a label further down is left alone: only the opening lines are the echo", () => {
    const later = `${SENTENCE}\n[1] office.txt · part 1`;
    expect(withoutEchoedLabels(later)).toBe(later);
  });

  it("a line of 200 near-headers followed by prose is judged in linear time", () => {
    const line = `${"[1] a · part 1 ".repeat(200)}and the office closes.`;
    const started = performance.now();
    expect(withoutEchoedLabels(`${line}\n${SENTENCE}`)).toBe(`${line}\n${SENTENCE}`);
    expect(performance.now() - started).toBeLessThan(50);
  });

  it("while streaming, a label still being written stays off the screen, and a sentence after [1] shows at once", () => {
    const opts = { streaming: true, citations: [office, faq] };
    for (const partial of ["[", "[1", "[1]", "[1] office", "[1] office.txt · pa", "[1] office.txt · part 1", "[1] office.txt · part 1\n"]) expect(withoutEchoedLabels(partial, opts), partial).toBe("");
    expect(withoutEchoedLabels("[1] office.txt · part 1\nThe support", opts)).toBe("The support");
    expect(withoutEchoedLabels("[1] The", opts)).toBe("[1] The");
    expect(withoutEchoedLabels("The support", opts)).toBe("The support");
  });
});
