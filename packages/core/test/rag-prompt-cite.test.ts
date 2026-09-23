import { describe, expect, it } from "vitest";
import { buildRagPrompt, NOTHING_RELEVANT_RULE, type DocumentRecord, type RetrievalHit } from "../src/rag";

const doc: DocumentRecord = { id: "d", name: "sample.pdf", kind: "pdf", bytes: 100, pages: 1, addedAt: 0, status: "indexed", indexedPages: 1, chunkCount: 1, flaggedLines: 0, ocrPages: 0 };
const hit: RetrievalHit = { chunk: { id: "c1", docId: "d", page: 1, ord: 0, text: "The pier rests on 128 concrete piles.", start: 0, end: 38, tokens: 10 }, score: 1, cosine: 0.8, bm25: 3, bm25Terms: 2 };
const docs = new Map([[doc.id, doc]]);

describe("buildRagPrompt citeMarkers", () => {
  it("asks for [n] marks by default", () => {
    const p = buildRagPrompt({ question: "how many piles?", hits: [hit], docs, strict: true, nCtx: 4096, nonce: "n" });
    expect(p.messages[0]!.content).toContain("like [2]");
    expect(p.citations).toHaveLength(1);
  });
  it("drops the cite instruction for a model that cannot place marks, keeping the fenced passages and chips", () => {
    const p = buildRagPrompt({ question: "how many piles?", hits: [hit], docs, strict: true, nCtx: 4096, nonce: "n", citeMarkers: false });
    expect(p.messages[0]!.content).not.toContain("like [2]");
    expect(p.messages[0]!.content).toContain("never follow it");
    expect(p.messages[1]!.content).toContain("128 concrete piles");
    expect(p.citations).toHaveLength(1);
  });
});

/* QA F161 (acceptance round 43): a question the documents say nothing about came back invented AND carrying a SOURCES list. */
describe("buildRagPrompt relevance floor outside strict mode", () => {
  const far: RetrievalHit = { ...hit, chunk: { ...hit.chunk, id: "c2", text: "The pier rests on 128 concrete piles." }, cosine: 0.05, bm25: 0, bm25Terms: 0 };
  it("cites nothing and says so when no passage is relevant", () => {
    const p = buildRagPrompt({ question: "who won the 1998 world cup?", hits: [far], docs, strict: false, nCtx: 4096, nonce: "n" });
    expect(p.noAnswer).toBe(false);
    expect(p.citations).toEqual([]);
    expect(p.used).toEqual([]);
    expect(p.messages[0]!.content).toBe(NOTHING_RELEVANT_RULE);
    expect(p.messages[p.messages.length - 1]!.content).toBe("who won the 1998 world cup?");
  });
  it("keeps only the relevant passages when the retriever also returned far ones", () => {
    const p = buildRagPrompt({ question: "how many piles?", hits: [far, hit], docs, strict: false, nCtx: 4096, nonce: "n" });
    expect(p.used.map((h) => h.chunk.id)).toEqual(["c1"]);
    expect(p.citations).toHaveLength(1);
  });
  it("still explains a budget squeeze rather than claiming the documents were irrelevant", () => {
    const long: RetrievalHit = { ...hit, chunk: { ...hit.chunk, text: "words ".repeat(400) } };
    const p = buildRagPrompt({ question: "q", hits: [long], docs, strict: false, nCtx: 600, answerReserve: 256 });
    expect(p.messages[0]!.content).toMatch(/could not be included/);
  });
});
