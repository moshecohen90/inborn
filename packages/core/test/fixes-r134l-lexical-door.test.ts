import { describe, expect, it } from "vitest";
import { Bm25Index } from "../src/rag/bm25";
import { lexicalEmbedder, LEXICAL_INDEX_ID } from "../src/rag/overview";
import { buildRagPrompt, isRelevant, relevanceDoors } from "../src/rag/prompt";
import { Retriever } from "../src/rag/retriever";
import { MemoryEmbeddingStore } from "../src/rag/store";
import type { Chunk, DocumentRecord, RetrievalHit } from "../src/rag/types";
import constitution from "./fixtures/rag/constitution-9pages-chunks.json";

/*
 * Build 41, j3-08: "give me a pancake recipe" in the constitution chat kept pages 5 and 6 on `terms=1 bm25=2.93/2.89
 * cos=0.000`, the one shared word being "give". The chunks are the fixture's pages through chunkFor(512)
 * (docs/qa/r132-doc-summary/fixtures/constitution-9pages.pdf, dumped by rag-lexical-door-measure.test.ts).
 */
const E5 = relevanceDoors("embed-e5");
const WORDS = relevanceDoors(LEXICAL_INDEX_ID);

const TURBINE = [
  "Inborn acceptance test document - page 1\nThe Rakovsky turbine serial number is RK-4417.\nThis line exists only so the page has more than one sentence of text.",
  "Inborn acceptance test document - page 2\nThe Belmont warehouse roof was replaced in March 2019.\nThis line exists only so the page has more than one sentence of text.",
  "Inborn acceptance test document - page 3\nThe annual maintenance budget for the Halden plant is 284,000 euro.\nThis line exists only so the page has more than one sentence of text.",
];
const GREENHOUSE =
  "Greenhouse maintenance notes\nThe Lindqvist greenhouse is heated by a heat pump that was installed in October 2021.\nThe irrigation timer runs twice a day, at 06:15 and at 19:40.\nThe tomato beds on the east side are rotated with beans every second year.";

async function wordsOnly(id: string, pages: Array<{ page: number; text: string }>) {
  const chunks: Chunk[] = pages.map((p, ord) => ({ id: `${id}#${ord}`, docId: id, page: p.page, ord, text: p.text, start: 0, end: p.text.length, tokens: 0 }));
  const doc: DocumentRecord = { id, name: `${id}.pdf`, kind: "pdf", bytes: 1, pages: pages.at(-1)!.page, addedAt: 0, status: "indexed", indexedPages: pages.at(-1)!.page, chunkCount: chunks.length, flaggedLines: 0, ocrPages: 0, uri: `documents/${id}/${id}.pdf`, embedModel: LEXICAL_INDEX_ID };
  const store = new MemoryEmbeddingStore();
  await store.putDocument(doc);
  await store.putChunks(chunks, []);
  const retriever = new Retriever(store, lexicalEmbedder);
  return { docs: new Map([[id, doc]]), ask: (q: string) => retriever.retrieve(q, { docIds: [id] }) };
}

/* The cosines e5 gave these hits on the same chunks (docs/qa/r134l-lexical-door/table.md); 0 = outside the vector side's 24. */
const withCosines = (hits: RetrievalHit[], cos: Record<number, number>): RetrievalHit[] => hits.map((h) => ({ ...h, cosine: cos[h.chunk.ord] ?? 0 }));

describe("round 134L · one common word is not lexical evidence", () => {
  it("the pancake request over the constitution: the passages that share only 'give' count no term and none is kept", async () => {
    const c = await wordsOnly("c", constitution);
    const hits = await c.ask("give me a pancake recipe");
    const give = hits.filter((h) => /\bgive\b/i.test(h.chunk.text));
    expect(give.map((h) => h.chunk.page).sort()).toEqual(expect.arrayContaining([5, 6]));
    for (const h of give) {
      expect(h.bm25).toBeGreaterThan(WORDS.minBm25);
      expect(h.bm25Terms).toBe(0);
    }
    expect(hits.filter((h) => isRelevant(h, WORDS))).toEqual([]);
    const e5Hits = withCosines(hits, { 26: 0, 31: 0.703 });
    expect(e5Hits.filter((h) => isRelevant(h, E5))).toEqual([]);
    const prompt = buildRagPrompt({ question: "give me a pancake recipe", hits: e5Hits, docs: c.docs, strict: false, embedderId: "embed-e5", nCtx: 4096 });
    expect(prompt.used).toEqual([]);
    expect(prompt.citations).toEqual([]);
    expect(prompt.messages[0]!.content).toContain("nothing in them matched");
  });

  it.each(["What's the weather like tomorrow?", "What time is it in Tokyo?", "How do I take a screenshot on my phone?", "Recommend a good movie to watch tonight", "Give me a workout plan for two weeks"])(
    "%s keeps no constitution passage on its one common word",
    async (q) => {
      const c = await wordsOnly("c", constitution);
      expect((await c.ask(q)).filter((h) => isRelevant(h, WORDS))).toEqual([]);
    },
  );

  it.each([
    ["Who can veto a bill?", 3],
    ["What does it say about treason?", 7],
  ])("%s still keeps its passages, words-only and with the index model", async (q, page) => {
    const c = await wordsOnly("c", constitution);
    const kept = (await c.ask(q)).filter((h) => isRelevant(h, WORDS));
    expect(kept.map((h) => h.chunk.page)).toContain(page);
    for (const h of kept) expect(h.bm25Terms).toBeGreaterThanOrEqual(1);
    const prompt = buildRagPrompt({ question: q, hits: kept, docs: c.docs, strict: false, embedderId: LEXICAL_INDEX_ID, nCtx: 4096 });
    expect(prompt.citations.map((x) => x.page)).toContain(page);
    expect(withCosines(kept, {}).filter((h) => isRelevant(h, E5)).length).toBe(kept.length);
  });

  it("the turbine's serial number and the greenhouse's irrigation timer are kept words-only on two or more terms", async () => {
    const t = await wordsOnly("t", TURBINE.map((text, i) => ({ page: i + 1, text })));
    const serial = (await t.ask("What is the serial number of the turbine?")).filter((h) => isRelevant(h, WORDS));
    expect(serial.map((h) => h.chunk.page)).toEqual([1]);
    expect(serial[0]!.bm25Terms).toBeGreaterThanOrEqual(2);
    const g = await wordsOnly("g", [{ page: 1, text: GREENHOUSE }]);
    const [timer] = await g.ask("When does the irrigation timer run?");
    expect(timer!.bm25).toBeLessThan(WORDS.minBm25);
    expect(timer!.bm25Terms).toBe(2);
    expect(isRelevant(timer!, WORDS)).toBe(true);
  });

  it("a common word still counts beside a content word, and still scores", () => {
    const idx = new Bm25Index();
    idx.add("a", "He shall from time to time give to the Congress Information of the State of the Union.");
    idx.add("b", "The Electors shall meet in their respective States, and vote by Ballot for two Persons.");
    idx.add("c", "No Person shall be a Senator who shall not have attained to the Age of thirty Years.");
    const [alone] = idx.search("give me a recipe");
    expect(alone).toMatchObject({ id: "a", matched: 0 });
    expect(alone!.score).toBeGreaterThan(0);
    expect(idx.search("what information does the president give to congress")[0]).toMatchObject({ id: "a", matched: 3 });
  });
});
