import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildCitations, groundedCitations, MIN_SOURCE_SHARE, sourceShare, type DocumentRecord, type RetrievalHit } from "../src";

/* The web smoke's fixture (scripts/web-smoke.mjs, attachAndAsk): one passage, the whole file. */
const NOTES = readFileSync(new URL("../../../scripts/fixtures/attach/greenhouse-notes.txt", import.meta.url), "utf8");
const QUESTION = "What is this file about? Quote one sentence from it.";

const doc: DocumentRecord = { id: "g", name: "greenhouse-notes.txt", kind: "txt", bytes: NOTES.length, pages: 1, addedAt: 0, status: "indexed", indexedPages: 1, chunkCount: 1, flaggedLines: 0, ocrPages: 0, uri: "documents/g/g.txt" };
const used: RetrievalHit[] = [{ chunk: { id: "g#0", docId: "g", page: 1, ord: 0, text: NOTES, start: 0, end: NOTES.length, tokens: 0 }, score: 1, cosine: 0.8, bm25: 1, bm25Terms: 1 }];
const citations = buildCitations(used, new Map([["g", doc]]));

describe("round 134I2 · the source share counts a reworded word as found", () => {
  /* gates199: Instant's answer shared 4 of 14 words exactly (0.29) and lost its only chip; "bean", "rotation", "noting" are the file's words reworded. */
  const SMOKE = "This document details greenhouse maintenance for a heated climate-controlled facility, noting irrigation schedules and bean rotation on specific beds.";

  it("the smoke's answer keeps the greenhouse chip, with a margin over the bar", () => {
    expect(groundedCitations(SMOKE, QUESTION, used, citations).map((c) => c.docName)).toEqual(["greenhouse-notes.txt"]);
    expect(sourceShare(["bean", "rotation", "noting", "heat"], [NOTES])).toBe(1);
    expect(sourceShare(["details", "facility", "schedules"], [NOTES])).toBe(0);
  });

  it("two paraphrases keep it too", () => {
    for (const answer of [
      "The file is maintenance notes for a greenhouse: a heat pump from 2021, an irrigation timer twice a day, and tomato beds rotated with beans.",
      "It's about looking after the Lindqvist greenhouse.",
    ]) {
      expect(groundedCitations(answer, QUESTION, used, citations)).toEqual(citations);
    }
  });

  it("an answer about something else stays below the bar", () => {
    const pancakes = "Mix flour, baking powder and salt with melted butter; add eggs, cook on medium heat and serve warm.";
    expect(sourceShare(["flour", "baking", "powder", "salt", "melted", "butter", "eggs", "cook", "medium", "serve", "warm"], [NOTES])).toBeLessThan(MIN_SOURCE_SHARE);
    expect(groundedCitations(pancakes, "Give me a quick recipe for pancakes.", used, citations)).toEqual([]);
  });
});
