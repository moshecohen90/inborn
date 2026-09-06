import { beforeAll, describe, expect, it } from "vitest";
import initSqlJs, { type Database } from "sql.js";
import { Retriever, SqlEmbeddingStore, hashEmbedder, hashVector, indexDocument, type Chunk, type DocumentRecord, type SqlDriver, type SqlValue } from "../src/index";

/** sql.js behind the same driver shape expo-sqlite and the Tauri store implement. */
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
      db.exec("BEGIN");
      try {
        for (const s of statements) db.run(s.sql, bind(s.params));
        db.exec("COMMIT");
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
    },
  };
}

const doc = (id: string, name: string): DocumentRecord => ({ id, name, kind: "pdf", bytes: 5, pages: 2, addedAt: 10, status: "indexed", indexedPages: 2, chunkCount: 2, language: "en", embedModel: "null", flaggedLines: 1, ocrPages: 0, uri: "file:///x", sha256: "ab" });
const chunk = (docId: string, page: number, ord: number, text: string): Chunk => ({ id: `${docId}:${page}:${ord}`, docId, page, ord, text, start: 0, end: text.length, tokens: 5 });

let SQL: Awaited<ReturnType<typeof initSqlJs>>;
beforeAll(async () => {
  SQL = await initSqlJs();
});

describe("SqlEmbeddingStore", () => {
  it("creates the schema, upserts documents and round-trips chunks and int8 vectors", async () => {
    const store = await SqlEmbeddingStore.open(driverOf(new SQL.Database()));
    await store.putDocument(doc("d1", "a.pdf"));
    await store.putDocument({ ...doc("d1", "a-renamed.pdf"), status: "indexing" });
    const got = await store.getDocument("d1");
    expect(got).toMatchObject({ name: "a-renamed.pdf", status: "indexing", flaggedLines: 1, language: "en", uri: "file:///x", sha256: "ab" });
    expect(await store.getDocument("nope")).toBeNull();
    const v1 = hashVector("battery warranty", 64);
    await store.putChunks([chunk("d1", 1, 0, "battery warranty"), chunk("d1", 2, 1, "shipping")], [v1, hashVector("shipping", 64)]);
    const chunks = await store.chunksOf("d1");
    expect(chunks.map((c) => c.ord)).toEqual([0, 1]);
    expect(await store.getChunk("d1:2:1")).toMatchObject({ text: "shipping", page: 2 });
    const vectors = await store.vectorsOf(["d1"]);
    expect(vectors.length).toBe(2);
    const back = vectors.find((v) => v.chunkId === "d1:1:0")!;
    expect(back.dim).toBe(64);
    let dot = 0;
    for (let i = 0; i < 64; i++) dot += back.q[i]! * back.scale * v1[i]!;
    expect(dot).toBeGreaterThan(0.99);
  });

  it("deletes a document with its chunks and vectors, and drops pages from a resume point", async () => {
    const store = await SqlEmbeddingStore.open(driverOf(new SQL.Database()));
    await store.putDocument(doc("d1", "a.pdf"));
    await store.putDocument(doc("d2", "b.pdf"));
    await store.putChunks([chunk("d1", 1, 0, "one"), chunk("d1", 2, 1, "two"), chunk("d1", 3, 2, "three"), chunk("d2", 1, 0, "other")], [hashVector("one"), hashVector("two"), hashVector("three"), hashVector("other")]);
    await store.deleteChunksFrom("d1", 2);
    expect((await store.chunksOf("d1")).map((c) => c.page)).toEqual([1]);
    expect((await store.vectorsOf(["d1"])).length).toBe(1);
    await store.deleteDocument("d1");
    expect(await store.getDocument("d1")).toBeNull();
    expect(await store.chunksOf("d1")).toEqual([]);
    expect((await store.vectorsOf(["d1", "d2"])).map((v) => v.docId)).toEqual(["d2"]);
    expect((await store.listDocuments()).map((d) => d.id)).toEqual(["d2"]);
    expect(await store.vectorsOf([])).toEqual([]);
  });

  it("serves the indexer and retriever end to end on disk", async () => {
    const store = await SqlEmbeddingStore.open(driverOf(new SQL.Database()));
    const text = ["Alpha section about installation and setup steps.", "The support hotline number is 555-0199 and it answers on weekdays.", "Closing remarks about maintenance."];
    await indexDocument({ doc: { ...doc("m", "manual.pdf"), status: "queued", indexedPages: 0, chunkCount: 0 }, opened: { pages: 3, page: async (i) => ({ page: i + 1, text: text[i]!, needsOcr: false }), close: async () => undefined }, embedder: hashEmbedder(), store });
    const hits = await new Retriever(store, hashEmbedder()).retrieve("what is the support hotline number?");
    expect(hits[0]!.chunk.page).toBe(2);
    expect(hits[0]!.chunk.text).toContain("555-0199");
  });
});
