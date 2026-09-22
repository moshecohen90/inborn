import { describe, expect, it } from "vitest";
import { MemoryEmbeddingStore, SplitEmbeddingStore, hashVector, type Chunk, type DocumentRecord } from "../src/index";

const doc = (id: string): DocumentRecord => ({ id, name: `${id}.pdf`, kind: "pdf", bytes: 9, pages: 1, addedAt: 1, status: "indexed", indexedPages: 1, chunkCount: 1, flaggedLines: 0, ocrPages: 0 });
const chunk = (docId: string, text: string): Chunk => ({ id: `${docId}:1:0`, docId, page: 1, ord: 0, text, start: 0, end: text.length, tokens: 3 });

/** `saved` stands for the SQLCipher library on disk; `ram` for the incognito session. */
function split(ramIds: string[] = ["secret"]) {
  const saved = new MemoryEmbeddingStore();
  const ram = new MemoryEmbeddingStore();
  const owned = new Set(ramIds);
  return { saved, ram, store: new SplitEmbeddingStore(saved, ram, (id) => owned.has(id)), owned };
}

describe("SplitEmbeddingStore (spec §5.7: incognito documents never reach the database)", () => {
  it("writes an incognito document to RAM and a saved one to the library", async () => {
    const { saved, ram, store } = split();
    await store.putDocument(doc("kept"));
    await store.putDocument(doc("secret"));
    expect((await saved.listDocuments()).map((d) => d.id)).toEqual(["kept"]);
    expect((await ram.listDocuments()).map((d) => d.id)).toEqual(["secret"]);
    expect(await store.getDocument("secret")).toMatchObject({ id: "secret" });
    expect(await saved.getDocument("secret")).toBeNull();
  });

  it("one question searches both: chunks and vectors come back from either side", async () => {
    const { saved, ram, store } = split();
    await store.putDocument(doc("kept"));
    await store.putDocument(doc("secret"));
    await store.putChunks([chunk("kept", "warranty terms"), chunk("secret", "the offer price")], [hashVector("warranty terms", 64), hashVector("the offer price", 64)]);
    expect((await saved.chunksOf("secret"))).toEqual([]);
    expect((await ram.chunksOf("kept"))).toEqual([]);
    expect((await store.chunksOf("secret")).map((c) => c.text)).toEqual(["the offer price"]);
    expect((await store.vectorsOf(["kept", "secret"])).map((v) => v.chunkId).sort()).toEqual(["kept:1:0", "secret:1:0"]);
    expect((await store.listDocuments()).map((d) => d.id).sort()).toEqual(["kept", "secret"]);
    expect(await store.getChunk("secret:1:0")).toMatchObject({ text: "the offer price" });
    expect(await store.getChunk("kept:1:0")).toMatchObject({ text: "warranty terms" });
    expect(await store.getChunk("nope:1:0")).toBeNull();
  });

  it("the session ends and the library is exactly what it was before it", async () => {
    const { saved, ram, store } = split();
    await store.putDocument(doc("kept"));
    await store.putChunks([chunk("kept", "warranty terms")], [hashVector("warranty terms", 64)]);
    const before = JSON.stringify(saved.snapshot());
    await store.putDocument(doc("secret"));
    await store.putChunks([chunk("secret", "the offer price")], [hashVector("the offer price", 64)]);
    /* Ending the session is dropping the RAM store; nothing has to be unwound on disk, because nothing was written there. */
    expect(JSON.stringify(saved.snapshot())).toEqual(before);
    expect((await ram.listDocuments()).map((d) => d.id)).toEqual(["secret"]);
  });

  it("clearing the RAM side drops the whole session index at once", async () => {
    const { ram, store } = split();
    await store.putDocument(doc("secret"));
    await store.putChunks([chunk("secret", "the offer price")], [hashVector("the offer price", 64)]);
    ram.clear();
    expect(await ram.listDocuments()).toEqual([]);
    expect(await ram.chunksOf("secret")).toEqual([]);
    expect(await ram.vectorsOf(["secret"])).toEqual([]);
    expect(await ram.getChunk("secret:1:0")).toBeNull();
  });

  it("deleting reaches whichever side holds it, even after the session ended", async () => {
    const { saved, store, owned } = split();
    await store.putDocument(doc("kept"));
    await store.putChunks([chunk("kept", "warranty terms")], [hashVector("warranty terms", 64)]);
    owned.clear();
    await store.deleteDocument("kept");
    expect(await saved.listDocuments()).toEqual([]);
  });

  it("re-indexing from a page only touches the side that owns the document", async () => {
    const { saved, ram, store } = split();
    await store.putDocument(doc("secret"));
    await store.putChunks([chunk("secret", "page one")], [hashVector("page one", 64)]);
    await store.deleteChunksFrom("secret", 1);
    expect(await ram.chunksOf("secret")).toEqual([]);
    expect(await saved.listDocuments()).toEqual([]);
  });
});
