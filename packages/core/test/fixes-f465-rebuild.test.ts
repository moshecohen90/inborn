import { beforeAll, describe, expect, it } from "vitest";
import initSqlJs, { type Database } from "sql.js";
import {
  DEFAULT_CHUNK,
  EmbedLanes,
  MemoryEmbeddingStore,
  SqlEmbeddingStore,
  chunkFor,
  chunkingOf,
  hashVector,
  indexDocument,
  rebuildKind,
  reembedFrom,
  reembedStored,
  vectorsValidUpTo,
  type Chunk,
  type DocumentRecord,
  type Embedder,
  type OpenedDocument,
  type SqlDriver,
  type SqlValue,
} from "../src/index";

/* F465: an update re-embeds stored passages in place, and only re-reads a file when its passages were cut another way. */
const CUT = chunkingOf(chunkFor(512));
const e5 = (calls: string[] = [], revision = 2): Embedder => ({ id: "embed-e5", revision, embed: async (texts) => (calls.push(...texts), texts.map((t) => hashVector(t, 32))) });
const base: DocumentRecord = { id: "d", name: "d.pdf", kind: "pdf", bytes: 1, pages: 4, addedAt: 1, status: "indexed", indexedPages: 4, chunkCount: 4, flaggedLines: 0, ocrPages: 0, embedModel: "embed-e5" };
const chunk = (page: number, text: string): Chunk => ({ id: `d:${page}:${page - 1}`, docId: "d", page, ord: page - 1, text, start: 0, end: text.length, tokens: 8 });

describe("rebuildKind", () => {
  const embedder = e5();
  it("a new revision of the same model with the same cut only needs vectors, also for rows from before the cut was stored", () => {
    expect(rebuildKind(base, embedder, CUT)).toBe("vectors");
    expect(rebuildKind({ ...base, chunking: CUT }, embedder, CUT)).toBe("vectors");
  });
  it("the same model and cut needs nothing", () => {
    expect(rebuildKind({ ...base, embedModel: "embed-e5@2" }, embedder, CUT)).toBe("none");
    expect(rebuildKind({ ...base, embedModel: "embed-e5@2", chunking: CUT }, embedder, CUT)).toBe("none");
  });
  it("another cut, another model, or a file never fully read is read again", () => {
    expect(rebuildKind({ ...base, embedModel: "embed-e5@2", chunking: "v1:400/60/40" }, embedder, CUT)).toBe("full");
    expect(rebuildKind({ ...base, embedModel: "embed-nomic" }, embedder, CUT)).toBe("full");
    expect(rebuildKind({ ...base, status: "cancelled" }, embedder, CUT)).toBe("full");
  });
  it("a word index cut to the model's size only needs vectors once the model lands", () => {
    expect(rebuildKind({ ...base, embedModel: "lexical", chunking: CUT }, embedder, CUT)).toBe("vectors");
    expect(rebuildKind({ ...base, embedModel: "lexical" }, embedder, CUT)).toBe("full");
  });
  it("the stored cut names every option the chunker uses", () => {
    expect(chunkingOf({ ...DEFAULT_CHUNK })).toBe("v1:400/60/40");
    expect(CUT).toBe("v1:212/53/40");
  });
});

describe("reembedStored page by page", () => {
  async function stored(): Promise<MemoryEmbeddingStore> {
    const store = new MemoryEmbeddingStore();
    await store.putDocument(base);
    await store.putChunks([chunk(1, "alpha one"), chunk(2, "bravo two"), chunk(3, "charlie three"), chunk(4, "delta four")], ["a", "b", "c", "d"].map((t) => hashVector(`old ${t}`, 32)));
    return store;
  }

  it("commits each page, so a cancel resumes at the next one and a question uses the new vectors up to there", async () => {
    const store = await stored();
    const calls: string[] = [];
    const abort = new AbortController();
    const embedder: Embedder = { id: "embed-e5", revision: 2, embed: async (texts) => (calls.push(...texts), calls.length === 2 && abort.abort(), texts.map((t) => hashVector(t, 32))) };
    const stopped = await reembedStored({ doc: reembedFrom(base), store, embedder, signal: abort.signal, chunking: CUT });
    expect(stopped).toMatchObject({ status: "cancelled", reindexFrom: "embed-e5", vectorPages: 2, indexedPages: 4, chunkCount: 4 });
    expect(vectorsValidUpTo(stopped)).toBe(2);
    expect(await store.getDocument("d")).toMatchObject({ vectorPages: 2 });

    const done = await reembedStored({ doc: stopped, store, embedder: e5(calls), chunking: CUT });
    expect(calls).toEqual(["alpha one", "bravo two", "charlie three", "delta four"]);
    expect(done).toMatchObject({ status: "indexed", embedModel: "embed-e5@2", chunking: CUT, indexedPages: 4, chunkCount: 4 });
    expect(done.reindexFrom).toBeUndefined();
    expect(done.vectorPages).toBeUndefined();
    expect(vectorsValidUpTo(done)).toBe(Infinity);
  });

  it("a passage repeated on several pages is embedded once", async () => {
    const store = new MemoryEmbeddingStore();
    await store.putDocument(base);
    await store.putChunks([chunk(1, "Form 7 · leave blank"), chunk(2, "Form 7 · leave blank"), chunk(3, "the answer is here"), chunk(4, "Form 7 · leave blank")], []);
    const calls: string[] = [];
    await reembedStored({ doc: reembedFrom(base), store, embedder: e5(calls) });
    expect(calls).toEqual(["Form 7 · leave blank", "the answer is here"]);
    expect((await store.vectorsOf(["d"])).length).toBe(4);
  });
});

describe("indexDocument", () => {
  const opened = (pages: string[]): OpenedDocument => ({ pages: pages.length, page: async (p) => ({ page: p + 1, text: pages[p]!, needsOcr: false }), close: async () => undefined });
  it("stores the cut it used and embeds a repeated page once", async () => {
    const store = new MemoryEmbeddingStore();
    const calls: string[] = [];
    const doc = await indexDocument({ doc: { ...base, status: "queued", indexedPages: 0, chunkCount: 0, embedModel: undefined }, opened: opened(["Running header text only.", "A real page about tides.", "Running header text only."]), embedder: e5(calls), store, chunk: chunkFor(512) });
    expect(doc).toMatchObject({ status: "indexed", chunking: CUT, chunkCount: 3, embedModel: "embed-e5@2" });
    expect(calls).toEqual(["Running header text only.", "A real page about tides."]);
  });
});

describe("EmbedLanes", () => {
  it("an aborted index call stops before its next text; a question is still served", async () => {
    const seen: string[] = [];
    const lanes = new EmbedLanes({ id: "embed-e5", embed: async (texts) => (seen.push(...texts), texts.map((t) => hashVector(t, 8))) });
    const abort = new AbortController();
    const index = lanes.index.embed(["one", "two", "three"], abort.signal);
    abort.abort();
    await expect(index).rejects.toThrow("cancelled");
    expect(await lanes.query.embed(["question"])).toHaveLength(1);
    expect(seen.filter((t) => t !== "question").length).toBeLessThanOrEqual(1);
  });
});

describe("SqlEmbeddingStore migration", () => {
  let SQL: Awaited<ReturnType<typeof initSqlJs>>;
  beforeAll(async () => {
    SQL = await initSqlJs();
  });
  function driverOf(db: Database): SqlDriver {
    const bind = (p?: SqlValue[]) => (p ?? []) as (string | number | null)[];
    return {
      exec: async (sql) => void db.exec(sql),
      run: async (sql, params) => void db.run(sql, bind(params)),
      all: async <T,>(sql: string, params?: SqlValue[]) => {
        const stmt = db.prepare(sql);
        stmt.bind(bind(params));
        const rows: T[] = [];
        while (stmt.step()) rows.push(stmt.getAsObject() as T);
        stmt.free();
        return rows;
      },
      batch: async (statements) => {
        for (const s of statements) db.run(s.sql, bind(s.params));
      },
    };
  }

  it("a database written by the previous build opens, keeps its rows, and stores the cut and the rebuild page", async () => {
    const db = new SQL.Database();
    db.exec(`CREATE TABLE documents (id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, kind TEXT NOT NULL, bytes INTEGER NOT NULL, pages INTEGER NOT NULL DEFAULT 0, added_at INTEGER NOT NULL, status TEXT NOT NULL, indexed_pages INTEGER NOT NULL DEFAULT 0, chunk_count INTEGER NOT NULL DEFAULT 0, language TEXT, embed_model TEXT, error TEXT, uri TEXT, sha256 TEXT, flagged_lines INTEGER NOT NULL DEFAULT 0, ocr_pages INTEGER NOT NULL DEFAULT 0, reindex_from TEXT);
      INSERT INTO documents (id, name, kind, bytes, pages, added_at, status, indexed_pages, chunk_count, embed_model, flagged_lines, ocr_pages) VALUES ('d', 'd.pdf', 'pdf', 1, 4, 1, 'indexed', 4, 4, 'embed-e5', 0, 0);`);
    const store = await SqlEmbeddingStore.open(driverOf(db));
    const old = (await store.getDocument("d"))!;
    expect(old).toMatchObject({ embedModel: "embed-e5", indexedPages: 4 });
    expect(old.chunking).toBeUndefined();
    expect(old.vectorPages).toBeUndefined();
    expect(rebuildKind(old, e5(), CUT)).toBe("vectors");

    await store.putDocument({ ...reembedFrom(old), vectorPages: 0, chunking: CUT });
    expect(await store.getDocument("d")).toMatchObject({ vectorPages: 0, chunking: CUT, reindexFrom: "embed-e5" });
    await store.putDocument({ ...old, embedModel: "embed-e5@2", chunking: CUT });
    const after = (await store.getDocument("d"))!;
    expect(after.vectorPages).toBeUndefined();
    expect(after.reindexFrom).toBeUndefined();
  });
});
