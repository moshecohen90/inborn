import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryEmbeddingStore, TextFileExtractor, hashVector, type DocumentRecord, type Embedder } from "@inborn/core";

/*
 * F399 (round 101): on the web a picked file lived in a Map for one page load, and its record kept a `blob:inborn/…`
 * key. In the next visit that key was dead: the rebuild for the index model fetched it (blocked by the CSP) and the
 * file turned into "The file is damaged or not what its name says". A new page load is a fresh module registry here.
 */

type FilesModule = typeof import("./files");
const visit = async (): Promise<FilesModule> => {
  vi.resetModules();
  return import("./files");
};

const HARBOR = "The new fuel pier opened on 14 June 2025 and cost 3.2 million euros.";

async function pick(files: FilesModule, text: string, name: string): Promise<string> {
  const uri = files.registerBlob(new Blob([text]), name);
  await files.primeHead(uri);
  return uri;
}

async function deleteDocumentsDb(): Promise<void> {
  await new Promise<void>((resolve) => {
    const r = indexedDB.deleteDatabase("inborn-documents");
    r.onsuccess = r.onerror = r.onblocked = () => resolve();
  });
}

beforeEach(deleteDocumentsDb);
afterEach(() => vi.restoreAllMocks());

describe("F399 · a file added on the web is still there in the next visit", () => {
  it("is copied into IndexedDB under a key that outlives the page, and read back from it", async () => {
    const first = await visit();
    const picked = await pick(first, HARBOR, "harbor-report.txt");
    const uri = first.copyIntoLibrary(picked, "doc1", "harbor-report.txt");
    expect(uri).not.toMatch(/^blob:/);
    expect(await first.whenStored(uri)).toBe(true);

    const second = await visit();
    await second.restoreFiles(new Set([uri]));
    expect(second.missingSource(uri)).toBe(false);
    expect(second.sizeOf(uri)).toBe(new TextEncoder().encode(HARBOR).length);
    expect(new TextDecoder().decode(await second.readBytes(uri))).toBe(HARBOR);
    expect(new TextDecoder().decode(second.readHead(uri, 7))).toBe("The new");
  });

  it("a blob key of an earlier page load is reported missing and never fetched (the CSP blocks it)", async () => {
    const files = await visit();
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const dead = "blob:inborn/1790331749422-063bgsdy6sh/harbor-report.txt";
    expect(files.missingSource(dead)).toBe(true);
    await expect(files.readBytes(dead)).rejects.toMatchObject({ reason: "missing" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("deleting the document deletes its bytes", async () => {
    const first = await visit();
    const uri = first.copyIntoLibrary(await pick(first, HARBOR, "a.txt"), "doc2", "a.txt");
    await first.whenStored(uri);
    first.deleteFile(uri);
    await new Promise((r) => setTimeout(r, 20));
    const second = await visit();
    await second.restoreFiles(new Set([uri]));
    expect(second.missingSource(uri)).toBe(true);
  });

  it("bytes no record points to are deleted once they are old enough not to be an import in flight", async () => {
    const first = await visit();
    const uri = first.copyIntoLibrary(await pick(first, HARBOR, "orphan.txt"), "doc3", "orphan.txt");
    await first.whenStored(uri);
    const second = await visit();
    await second.restoreFiles(new Set());
    expect(second.missingSource(uri)).toBe(true);
    const young = await visit();
    await young.restoreFiles(new Set([uri]));
    expect(young.missingSource(uri)).toBe(false);
    vi.spyOn(Date, "now").mockReturnValue(Date.now() + 5 * 60_000);
    const later = await visit();
    await later.restoreFiles(new Set());
    const last = await visit();
    await last.restoreFiles(new Set([uri]));
    expect(last.missingSource(uri)).toBe(true);
  });

  it("an incognito import is never written anywhere (§5.7)", async () => {
    const files = await visit();
    const picked = await pick(files, HARBOR, "secret.txt");
    expect(files.copyIntoLibrary(picked, "doc4", "secret.txt", { incognito: true })).toBe(picked);
    const next = await visit();
    await next.restoreFiles(new Set([picked]));
    expect(next.missingSource(picked)).toBe(true);
  });

  it("Delete everything takes the stored bytes with the database", async () => {
    const files = await visit();
    const uri = files.copyIntoLibrary(await pick(files, HARBOR, "wiped.txt"), "doc5", "wiped.txt");
    await files.whenStored(uri);
    const { wipe } = await import("../storage/wipe");
    await wipe({ models: false }, { indexedDB, blockedTimeoutMs: 200 });
    expect(files.missingSource(uri)).toBe(true);
    const next = await visit();
    await next.restoreFiles(new Set([uri]));
    expect(next.missingSource(uri)).toBe(true);
  });
});

/* The library over the real web file module: visit 1 reads by words, visit 2 installs the index model. */
const saved = new MemoryEmbeddingStore();
let embedderMissing = true;
const e5: Embedder = { id: "embed-e5", embed: async (texts) => texts.map((t) => hashVector(t, 64)) };
const opened: string[] = [];
vi.mock("./db", () => ({ openRagStore: async () => saved, ragStoreKind: () => "indexeddb", forgetRagStore: () => undefined, DOCUMENTS_IDB_NAME: "inborn-documents" }));
vi.mock("./embedder", () => ({ EMBED_MODEL_ID: "embed-e5", resolveEmbedder: () => (embedderMissing ? null : { path: "/embed.gguf", embedder: { ...e5, unload: async () => undefined }, contextTokens: 512 }) }));
vi.mock("./extract", async () => {
  const files = await import("./files");
  const text = new TextFileExtractor((uri) => {
    opened.push(uri);
    return files.readBytes(uri);
  });
  return { nativeOcr: () => null, createExtractors: () => [text] };
});
let prefs = { strict: false, attachments: {} as Record<string, string[]>, redactNames: [] as string[], redactDates: false };
vi.mock("./prefs", () => ({ readPrefs: () => prefs, writePrefs: (p: typeof prefs) => void (prefs = p) }));

async function settle(library: { state(): { documents: DocumentRecord[] } }): Promise<void> {
  for (let i = 0; i < 400; i++) {
    if (library.state().documents.every((d) => d.status !== "queued" && d.status !== "indexing")) return;
    await new Promise((r) => setTimeout(r, 5));
  }
  throw new Error("indexing never settled");
}

async function libraryVisit() {
  vi.resetModules();
  const files = await import("./files");
  const { DocumentLibrary } = await import("./library");
  const library = new DocumentLibrary();
  await library.ready();
  return { files, library };
}

describe("F399 · the library across two visits", () => {
  beforeEach(async () => {
    for (const d of await saved.listDocuments()) await saved.deleteDocument(d.id);
    embedderMissing = true;
    opened.length = 0;
  });

  it("a file read by its words is rebuilt from its own bytes once the index model lands, never marked damaged", async () => {
    const one = await libraryVisit();
    const doc = await one.library.importFile(await pick(one.files, HARBOR, "harbor-report.txt"), "harbor-report.txt");
    await settle(one.library);
    expect(one.library.document(doc.id)).toMatchObject({ status: "indexed", embedModel: "lexical", chunkCount: 1 });
    expect(one.library.document(doc.id)?.uri).not.toMatch(/^blob:/);

    embedderMissing = false;
    opened.length = 0;
    const two = await libraryVisit();
    await settle(two.library);
    const after = two.library.document(doc.id)!;
    expect(after).toMatchObject({ status: "indexed", embedModel: "embed-e5", chunkCount: 1 });
    expect(after.error).toBeUndefined();
    /* Read again from the stored bytes, not from a dead blob key. */
    expect(opened).toEqual([after.uri]);
    const { prompt, lexical } = await two.library.ask("What did the new fuel pier cost?", { docIds: [doc.id] });
    expect(lexical).toBeUndefined();
    expect(prompt.used.map((h) => h.chunk.docId)).toEqual([doc.id]);
  });

  it("the same file picked again replaces a damaged record with a fresh read", async () => {
    const one = await libraryVisit();
    const doc = await one.library.importFile(await pick(one.files, HARBOR, "harbor-report.txt"), "harbor-report.txt");
    await settle(one.library);
    /* What the base build left behind: a record marked damaged whose key is a dead blob. */
    const damaged: DocumentRecord = { ...one.library.document(doc.id)!, uri: "blob:inborn/1-dead/harbor-report.txt", status: "failed", error: "corrupt", chunkCount: 0, indexedPages: 0 };
    await saved.putDocument(damaged);

    embedderMissing = false;
    const two = await libraryVisit();
    await settle(two.library);
    const again = await two.library.importFile(await pick(two.files, HARBOR, "harbor-report.txt"), "harbor-report.txt");
    expect(again.id).toBe(doc.id);
    await settle(two.library);
    const fresh = two.library.document(doc.id)!;
    expect(fresh).toMatchObject({ status: "indexed", embedModel: "embed-e5", chunkCount: 1 });
    expect(fresh.error).toBeUndefined();
    expect(fresh.uri).not.toMatch(/^blob:/);
    expect(two.library.state().documents).toHaveLength(1);
  });

  it("a record whose bytes are gone and that holds no passages says the file is missing, not damaged", async () => {
    embedderMissing = false;
    const rec: DocumentRecord = { id: "gone", name: "notes.txt", kind: "txt", bytes: 10, pages: 0, addedAt: 1, status: "cancelled", indexedPages: 0, chunkCount: 0, flaggedLines: 0, ocrPages: 0, uri: "blob:inborn/2-dead/notes.txt", sha256: "x" };
    await saved.putDocument(rec);
    const { library } = await libraryVisit();
    library.resume("gone");
    await settle(library);
    expect(library.document("gone")).toMatchObject({ status: "failed", error: "missing" });
  });
});
