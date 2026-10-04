// Set C retrieval, through the app's own path (library.ts read + ask): paginate → indexDocument (chunkFor(512), e5
// passages raw) → Retriever (e5 query instruct prefix, BM25 + vectors, RRF, MMR k=6) → the hits buildRagPrompt keeps.
// Needs the e5 llama-server on <port>. Usage: node prep-c.mjs <port>
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { MemoryEmbeddingStore, Retriever, chunkFor, embedBudget, indexDocument, isAboutAttachment, isRelevant, openingHits, paginate, relevanceDoors } from "./lib.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const port = process.argv[2];
const CONTEXT = 512; // manifest.json embed-e5 contextLength
const embedder = {
  id: "embed-e5",
  async embed(texts) {
    const r = await fetch(`http://127.0.0.1:${port}/v1/embeddings`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ input: texts }) });
    const j = await r.json();
    if (!j.data) throw new Error(JSON.stringify(j).slice(0, 300));
    return j.data.sort((a, b) => a.index - b.index).map((d) => Float32Array.from(d.embedding));
  },
};

const files = { rental: "rental-agreement.md", manual: "product-manual.md", notes: "meeting-notes.md", verein: "vereinsinfo-de.md" };
const store = new MemoryEmbeddingStore();
const docs = {};
for (const [id, name] of Object.entries(files)) {
  const text = readFileSync(join(here, "../fixtures/docs", name), "utf8");
  const pages = paginate(text);
  const doc = { id, name, kind: "md", bytes: Buffer.byteLength(text), pages: pages.length, addedAt: 0, status: "queued", indexedPages: 0, chunkCount: 0, flaggedLines: 0, ocrPages: 0 };
  const opened = { pages: pages.length, page: async (i) => ({ page: i + 1, text: pages[i] ?? "", needsOcr: false }), close: async () => undefined };
  docs[id] = await indexDocument({ doc, opened, embedder, store, chunk: chunkFor(CONTEXT) });
  console.log(`${name}: ${docs[id].status} ${docs[id].indexedPages} pages ${docs[id].chunkCount} chunks`);
}

const questions = JSON.parse(readFileSync(join(here, "items-c.json"), "utf8"));
const retriever = new Retriever(store, embedder, embedBudget(CONTEXT));
const doors = relevanceDoors("embed-e5");
const out = [];
for (const q of questions) {
  const docIds = q.attach;
  const overview = isAboutAttachment(q.question);
  const hits = overview ? openingHits(await Promise.all(docIds.map((id) => store.chunksOf(id)))) : await retriever.retrieve(q.question, { docIds });
  console.log(`${q.id}: ${hits.map((h) => `${h.chunk.docId}#${h.chunk.ord} p${h.chunk.page} cos=${h.cosine.toFixed(3)} terms=${h.bm25Terms} ${overview || isRelevant(h, doors) ? "KEPT" : "dropped"}`).join(" · ")}`);
  out.push({ ...q, overview, docs: docIds.map((id) => docs[id]), hits });
}
writeFileSync(join(here, "../results/c-retrieval.json"), JSON.stringify(out, null, 1));
