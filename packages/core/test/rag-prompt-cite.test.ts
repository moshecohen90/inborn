import { describe, expect, it } from "vitest";
import { buildRagPrompt, type DocumentRecord, type RetrievalHit } from "../src/rag";

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
