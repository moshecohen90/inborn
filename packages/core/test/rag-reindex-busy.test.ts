import { describe, expect, it } from "vitest";
import { EmbedLanes, hashVector, indexDocument, isRelevant, MemoryEmbeddingStore, reindexFrom, Retriever, vectorsValidUpTo, type DocumentRecord, type Embedder, type OpenedDocument } from "../src/rag";

const CHUNK_MS = 30;

/** llama.rn's embedding context: one text at a time, and a second call while one runs fails with "Context is busy". */
function slowEngine(id = "embed-e5", dim = 64): Embedder & { calls: string[] } {
  let inFlight = false;
  const calls: string[] = [];
  return {
    id,
    calls,
    async embed(texts) {
      if (inFlight) throw new Error("Context is busy");
      inFlight = true;
      try {
        const out: Float32Array[] = [];
        for (const t of texts) {
          await new Promise((r) => setTimeout(r, CHUNK_MS));
          calls.push(t);
          out.push(hashVector(t, dim));
        }
        return out;
      } finally {
        inFlight = false;
      }
    },
  };
}

const pageText = (doc: string, p: number) => `Bericht ${doc} Seite ${p}: Abschnitt ${p} über Lagerbestand und Lieferanten im Quartal ${p}.`;
const ANSWER = "Die Aoba Handelsgesellschaft beschäftigt dreihundertzweiundachtzig Mitarbeiter an zwei Standorten.";

function opened(doc: string, pages: number, answerPage?: number): OpenedDocument {
  return { pages, page: async (i) => ({ page: i + 1, text: i + 1 === answerPage ? ANSWER : pageText(doc, i + 1), needsOcr: false }), close: async () => undefined };
}

const record = (id: string, extra: Partial<DocumentRecord> = {}): DocumentRecord => ({ id, name: `${id}.pdf`, kind: "pdf", bytes: 1, pages: 0, addedAt: 1, status: "queued", indexedPages: 0, chunkCount: 0, flaggedLines: 0, ocrPages: 0, ...extra });

/** What the previous app version left: every page indexed by nomic, 768-dimension vectors. */
async function nomicBuilt(store: MemoryEmbeddingStore, id: string, pages: number, answerPage?: number): Promise<DocumentRecord> {
  const doc = record(id, { status: "indexed", pages, indexedPages: pages, chunkCount: pages, embedModel: "embed-nomic" });
  await store.putDocument(doc);
  for (let p = 1; p <= pages; p++) {
    const text = p === answerPage ? ANSWER : pageText(id, p);
    await store.putChunks([{ id: `${id}:${p}:${p - 1}`, docId: id, page: p, ord: p - 1, text, start: 0, end: text.length, tokens: 20 }], [hashVector(text, 768)]);
  }
  return doc;
}

/** Embeds `pages` one-chunk pages and then stops the job, as a kill or a question would find it. */
function stopAfter(pages: number): { embedder: Embedder; signal: AbortSignal } {
  const ac = new AbortController();
  let n = 0;
  return {
    signal: ac.signal,
    embedder: {
      id: "embed-e5",
      embed: async (texts) => {
        if (++n >= pages) ac.abort();
        return texts.map((t) => hashVector(t, 64));
      },
    },
  };
}

describe("F353 · a question is served while the index queue embeds", () => {
  it("answers within one chunk's time, without 'Context is busy', and the queue still finishes", async () => {
    const engine = slowEngine();
    const lanes = new EmbedLanes(engine);
    const store = new MemoryEmbeddingStore();
    const ready = record("ready");
    await indexDocument({ doc: ready, opened: opened("ready", 1, 1), embedder: lanes.index, store });
    const indexing = indexDocument({ doc: record("big"), opened: opened("big", 40), embedder: lanes.index, store, batchSize: 8 });
    await new Promise((r) => setTimeout(r, CHUNK_MS * 3));
    const retriever = new Retriever(store, lanes.query);
    const started = Date.now();
    const hits = await retriever.retrieve("Wie viele Mitarbeiter beschäftigt die Aoba Handelsgesellschaft?", { docIds: ["ready"] });
    const waited = Date.now() - started;
    expect(hits.map((h) => h.chunk.text)).toEqual([ANSWER]);
    /* At most the chunk already in the engine, then the question itself. */
    expect(waited).toBeLessThan(CHUNK_MS * 4);
    expect((await store.getDocument("big"))?.status).toBe("indexing");
    const big = await indexing;
    expect(big).toMatchObject({ status: "indexed", chunkCount: 40, indexedPages: 40 });
  });

  it("a question in a queue of questions is not starved by chunks queued behind it", async () => {
    const engine = slowEngine();
    const lanes = new EmbedLanes(engine);
    const bulk = lanes.index.embed(Array.from({ length: 20 }, (_, i) => `chunk ${i}`));
    await new Promise((r) => setTimeout(r, CHUNK_MS / 2));
    const [q1, q2] = await Promise.all([lanes.query.embed(["frage eins"]), lanes.query.embed(["frage zwei"])]);
    expect(q1).toHaveLength(1);
    expect(q2).toHaveLength(1);
    /* One chunk was in the engine when the questions arrived; both questions went before the other 19. */
    expect(engine.calls.slice(0, 3)).toEqual(["chunk 0", "frage eins", "frage zwei"]);
    expect(await bulk).toHaveLength(20);
  });
});

describe("F353 · a document with an old index is searchable while it is rebuilt", () => {
  it("finds a page not rebuilt yet by its words, with the old vectors left out of the cosine", async () => {
    const store = new MemoryEmbeddingStore();
    const old = await nomicBuilt(store, "bericht", 6, 6);
    const queued = reindexFrom(old);
    expect(queued.reindexFrom).toBe("embed-nomic");
    /* Two pages rebuilt when the question arrives. */
    const partial = await indexDocument({ doc: queued, opened: opened("bericht", 6, 6), store, ...stopAfter(2) });
    expect(partial).toMatchObject({ status: "cancelled", reindexFrom: "embed-nomic", indexedPages: 2 });
    const retriever = new Retriever(store, { id: "embed-e5", embed: async (t) => t.map((x) => hashVector(x, 64)) });
    const hits = await retriever.retrieve("Wie viele Mitarbeiter beschäftigt die Aoba Handelsgesellschaft?", { docIds: ["bericht"], vectorPages: { bericht: vectorsValidUpTo(partial) } });
    const answer = hits.find((h) => h.chunk.text === ANSWER);
    expect(answer && isRelevant(answer)).toBe(true);
    expect(answer?.cosine).toBe(0);
    /* What the prompt keeps is the old page, found by its words; the rebuilt pages share nothing with the question. */
    expect(hits.filter((h) => isRelevant(h)).map((h) => h.chunk.text)).toEqual([ANSWER]);
    /* Every page is still in the store: the rebuilt ones in the new space, the rest as the old rows. */
    expect((await store.chunksOf("bericht")).map((c) => c.page).sort()).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("resumes the rebuild at its committed page and ends with no old row", async () => {
    const store = new MemoryEmbeddingStore();
    const old = await nomicBuilt(store, "bericht", 6, 6);
    const first = await indexDocument({ doc: reindexFrom(old), opened: opened("bericht", 6, 6), store, ...stopAfter(3) });
    expect(first).toMatchObject({ status: "cancelled", indexedPages: 3 });
    /* The record as the next launch reads it back from the store. */
    const saved = (await store.getDocument("bericht"))!;
    expect(saved).toMatchObject({ indexedPages: 3, reindexFrom: "embed-nomic" });
    const engine = slowEngine();
    const done = await indexDocument({ doc: saved, opened: opened("bericht", 6, 6), embedder: engine, store });
    expect(engine.calls).toEqual([pageText("bericht", 4), pageText("bericht", 5), ANSWER]);
    expect(done).toMatchObject({ status: "indexed", indexedPages: 6, chunkCount: 6 });
    expect(done.reindexFrom).toBeUndefined();
    expect((await store.vectorsOf(["bericht"])).map((v) => v.dim)).toEqual([64, 64, 64, 64, 64, 64]);
  });
});
