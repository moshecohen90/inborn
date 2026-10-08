import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { EmbedLanes, MemoryEmbeddingStore, chunkFor, indexDocument, reembedFrom, reembedStored, reindexFrom, type DocumentRecord, type Embedder, type EmbeddingStore, type OpenedDocument } from "../src/index";

/**
 * F465. Seconds per page of the document index on this machine with the real index model, stage by stage, for a fresh
 * read, the update rebuild the previous build ran (read, cut and embed every page again) and the vectors-only rebuild.
 *
 *   docs/qa/docs-index-43/scripts/make-pdf.sh /tmp/federalist-40.pdf
 *   llama-server -m multilingual-e5-large-instruct-Q6_K.gguf --embedding --pooling mean -c 512 -b 512 -ub 512 -np 1 --port 8797
 *   INBORN_MEASURE_INDEX_PDF=/tmp/federalist-40.pdf INBORN_EMBED_URL=http://127.0.0.1:8797 \
 *     pnpm --filter @inborn/core exec vitest run test/rag-index-speed-measure.test.ts
 */
const PDF = process.env.INBORN_MEASURE_INDEX_PDF;
const URL_ = process.env.INBORN_EMBED_URL;
const OUT = process.env.INBORN_MEASURE_OUT;

interface Stages {
  extractMs: number;
  embedMs: number;
  storeMs: number;
  texts: number;
  chars: number;
}

/** One text per engine call, as the phone's LlamaRnEmbedder does. */
function serverEmbedder(stages: Stages): Embedder {
  return {
    id: "embed-e5",
    revision: 2,
    embed: async (texts) => {
      const out: Float32Array[] = [];
      for (const content of texts) {
        const started = performance.now();
        const res = await fetch(`${URL_}/embedding`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ content }) });
        const body = (await res.json()) as Array<{ embedding: number[][] }>;
        stages.embedMs += performance.now() - started;
        stages.texts++;
        stages.chars += content.length;
        out.push(Float32Array.from(body[0]!.embedding[0]!));
      }
      return out;
    },
  };
}

/** pdftotext one page per call, as the phone's extractor reads one page per bridge call. */
function openPdf(path: string, pages: number, stages: Stages): OpenedDocument {
  return {
    pages,
    page: async (p) => {
      const started = performance.now();
      const text = execFileSync("pdftotext", ["-f", String(p + 1), "-l", String(p + 1), "-enc", "UTF-8", path, "-"]).toString();
      stages.extractMs += performance.now() - started;
      return { page: p + 1, text, needsOcr: !text.trim() };
    },
    close: async () => undefined,
  };
}

function timedStore(inner: EmbeddingStore, stages: Stages): EmbeddingStore {
  const timed = <A extends unknown[], R>(f: (...a: A) => Promise<R>) => async (...a: A): Promise<R> => {
    const started = performance.now();
    try {
      return await f(...a);
    } finally {
      stages.storeMs += performance.now() - started;
    }
  };
  return {
    listDocuments: timed(() => inner.listDocuments()),
    getDocument: timed((id: string) => inner.getDocument(id)),
    putDocument: timed((d: DocumentRecord) => inner.putDocument(d)),
    deleteDocument: timed((id: string) => inner.deleteDocument(id)),
    putChunks: timed((c: Parameters<EmbeddingStore["putChunks"]>[0], v: Float32Array[]) => inner.putChunks(c, v)),
    chunksOf: timed((id: string) => inner.chunksOf(id)),
    getChunk: timed((id: string) => inner.getChunk(id)),
    vectorsOf: timed((ids: string[]) => inner.vectorsOf(ids)),
    deleteChunksFrom: timed((id: string, p: number) => inner.deleteChunksFrom(id, p)),
    deleteChunksOfPage: timed((id: string, p: number) => inner.deleteChunksOfPage(id, p)),
  };
}

const fresh = (): Stages => ({ extractMs: 0, embedMs: 0, storeMs: 0, texts: 0, chars: 0 });

describe.skipIf(!PDF || !URL_)("F465 · index speed on this machine", () => {
  it("measures a fresh read, the old update rebuild and the vectors-only rebuild", { timeout: 3_600_000 }, async () => {
    const pages = Number(/Pages:\s+(\d+)/.exec(execFileSync("pdfinfo", [PDF!]).toString())![1]);
    const store = new MemoryEmbeddingStore();
    const rows: string[] = [];
    const run = async (label: string, go: (s: Stages, st: EmbeddingStore, e: Embedder) => Promise<DocumentRecord>) => {
      const s = fresh();
      const started = performance.now();
      const doc = await go(s, timedStore(store, s), new EmbedLanes(serverEmbedder(s)).index);
      const total = performance.now() - started;
      const per = (ms: number) => (ms / pages / 1000).toFixed(3);
      rows.push(`| ${label} | ${per(total)} | ${per(s.extractMs)} | ${per(s.embedMs)} | ${per(s.storeMs)} | ${per(total - s.extractMs - s.embedMs - s.storeMs)} | ${s.texts} | ${Math.round(s.chars / Math.max(1, s.texts))} |`);
      return doc;
    };
    const base: DocumentRecord = { id: "fed", name: "federalist-40.pdf", kind: "pdf", bytes: 1, pages: 0, addedAt: 1, status: "queued", indexedPages: 0, chunkCount: 0, flaggedLines: 0, ocrPages: 0 };
    const chunk = chunkFor(512);
    const read = await run("fresh read", (s, st, e) => indexDocument({ doc: base, opened: openPdf(PDF!, pages, s), embedder: e, store: st, chunk }));
    expect(read).toMatchObject({ status: "indexed", indexedPages: pages });
    const old = { ...read, embedModel: "embed-e5" };
    await run("update rebuild, previous build (read + cut + embed again)", (s, st, e) => indexDocument({ doc: reindexFrom(old), opened: openPdf(PDF!, pages, s), embedder: e, store: st, chunk }));
    const vectors = await run("update rebuild, this build (stored passages, vectors only)", (s, st, e) => reembedStored({ doc: reembedFrom(old), store: st, embedder: e }));
    expect(vectors).toMatchObject({ status: "indexed", chunkCount: read.chunkCount });
    const table = [`pages=${pages} chunks=${read.chunkCount} engine=${URL_}`, "| run | s/page | extract | embed | store | other | texts | chars/text |", "|---|---|---|---|---|---|---|---|", ...rows].join("\n");
    console.log(table);
    if (OUT) writeFileSync(OUT, table + "\n");
  });
});
