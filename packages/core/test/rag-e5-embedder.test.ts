import { describe, expect, it } from "vitest";
import { chunkFor, chunkPage, clipToTokens, E5_QUERY_PREFIX, embedBudget, EMBED_TOKEN_SAFETY, estimateRagTokens, forDocuments, forQuery, indexDocument, MemoryEmbeddingStore, hashEmbedder, needsReindex, reindexFrom, Retriever, type DocumentRecord, type Embedder } from "../src/rag";

/* Worst real/estimate ratio measured against the shipped embedder's tokenizer (docs/qa/embed-multilingual/token-ratios.txt). */
const WORST_MEASURED_RATIO = 1.84;
const E5_POSITIONS = 512;

describe("F335 · the e5 task prefixes", () => {
  it("embeds a passage raw and a question behind the instruction every measured number used", () => {
    expect(forDocuments("embed-e5", ["Absatz"])).toEqual(["Absatz"]);
    expect(forQuery("embed-e5", "Wie viele?")).toBe(`${E5_QUERY_PREFIX}Wie viele?`);
    expect(E5_QUERY_PREFIX).toBe("Instruct: Given a question, retrieve the passage of a document that answers it\nQuery: ");
    expect(forQuery("null", "q")).toBe("q");
  });
});

describe("F335 · no text past the embedder's 512 positions", () => {
  const SAMPLES: Record<string, string> = {
    latin: "Laut Jahresbericht beschäftigt die Gesellschaft dreihundertzweiundachtzig Mitarbeiter an zwei Standorten. ",
    cjk: "青叶商事二零二五年度的年报显示公司员工共三百八十二人主要据点设在仙台和福冈两地",
    "he-cantillated": "בְּרֵאשִׁ֖ית בָּרָ֣א אֱלֹהִ֑ים אֵ֥ת הַשָּׁמַ֖יִם וְאֵ֥ת הָאָֽרֶץ׃ ",
    code: "function f(x){return x.map((y)=>y*2).filter(Boolean);} // TODO: fix_this_later() ",
  };

  it("the margin covers the worst script measured", () => {
    expect(EMBED_TOKEN_SAFETY).toBeGreaterThanOrEqual(WORST_MEASURED_RATIO);
    const { targetTokens, minTokens } = chunkFor(E5_POSITIONS);
    /* The short-tail merge can add minTokens to the last chunk of a page. */
    expect(Math.ceil((targetTokens + minTokens) * WORST_MEASURED_RATIO)).toBeLessThanOrEqual(E5_POSITIONS - 2);
  });

  for (const [script, sample] of Object.entries(SAMPLES)) {
    it(`${script}: every chunk of a long page stays inside the budget`, () => {
      const { chunks } = chunkPage(sample.repeat(80), chunkFor(E5_POSITIONS));
      expect(chunks.length).toBeGreaterThan(1);
      for (const c of chunks) expect(estimateRagTokens(c.text)).toBeLessThanOrEqual(embedBudget(E5_POSITIONS));
    });
  }

  it("keeps a larger model's own target when it fits", () => {
    expect(chunkFor(8192).targetTokens).toBe(400);
  });

  it("clips at a code point and never grows a short text", () => {
    expect(clipToTokens("short", 50)).toBe("short");
    const clipped = clipToTokens("青".repeat(900), 100);
    expect(estimateRagTokens(clipped)).toBeLessThanOrEqual(100);
    expect(estimateRagTokens(clipped + "青")).toBeGreaterThan(100);
    expect(clipToTokens("😀".repeat(50), 3)).toMatch(/^(😀)*$/u);
  });

  it("the retriever clips the question, prefix included, to the budget it is given", async () => {
    const store = new MemoryEmbeddingStore();
    const seen: string[] = [];
    const e5: Embedder = { id: "embed-e5", embed: async (t) => (seen.push(...t), hashEmbedder(64).embed(t)) };
    const doc: DocumentRecord = { id: "d", name: "d.txt", kind: "txt", bytes: 1, pages: 1, addedAt: 0, status: "queued", indexedPages: 0, chunkCount: 0, flaggedLines: 0, ocrPages: 0 };
    await indexDocument({ doc, opened: { pages: 1, page: async () => ({ page: 1, text: "Zwei Standorte.", needsOcr: false }), close: async () => undefined }, embedder: e5, store });
    seen.length = 0;
    await new Retriever(store, e5, embedBudget(E5_POSITIONS)).retrieve("Frage ".repeat(2000));
    expect(seen[0]!.startsWith(E5_QUERY_PREFIX)).toBe(true);
    expect(estimateRagTokens(seen[0]!)).toBeLessThanOrEqual(embedBudget(E5_POSITIONS));
  });
});

describe("F336 · which documents are rebuilt after the embedder changes", () => {
  const base: DocumentRecord = { id: "d", name: "d.txt", kind: "txt", bytes: 1, pages: 3, addedAt: 0, status: "indexed", indexedPages: 3, chunkCount: 9, flaggedLines: 2, ocrPages: 1, embedModel: "embed-nomic" };

  it("any committed page from another embedder, whatever the status, and a record from before embedModel existed", () => {
    expect(needsReindex(base, "embed-e5")).toBe(true);
    const record = (d: DocumentRecord): DocumentRecord => d;
    expect(needsReindex(record({ ...base, status: "cancelled", indexedPages: 1 }), "embed-e5")).toBe(true);
    expect(needsReindex({ ...base, embedModel: undefined }, "embed-e5")).toBe(true);
    expect(needsReindex({ ...base, embedModel: "embed-e5" }, "embed-e5")).toBe(false);
    expect(needsReindex(record({ ...base, indexedPages: 0, chunkCount: 0 }), "embed-e5")).toBe(false);
  });

  it("restarts from page 0 and drops the old rows, vectors included", async () => {
    const store = new MemoryEmbeddingStore();
    await store.putChunks([{ id: "d:1:0", docId: "d", page: 1, ord: 0, text: "old", start: 0, end: 3, tokens: 1 }], [new Float32Array(768).fill(0.1)]);
    const fresh = reindexFrom(base);
    expect(fresh).toMatchObject({ status: "queued", indexedPages: 0, chunkCount: 0, ocrPages: 0, flaggedLines: 0 });
    const out = await indexDocument({ doc: fresh, opened: { pages: 1, page: async () => ({ page: 1, text: "Neu.", needsOcr: false }), close: async () => undefined }, embedder: hashEmbedder(64, "embed-e5"), store });
    expect(out).toMatchObject({ status: "indexed", embedModel: "embed-e5", chunkCount: 1 });
    expect((await store.chunksOf("d")).map((c) => [c.text, c.ord])).toEqual([["Neu.", 0]]);
    expect((await store.vectorsOf(["d"])).map((v) => v.dim)).toEqual([64]);
  });
});
