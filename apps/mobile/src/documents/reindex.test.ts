import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryEmbeddingStore, chunkFor, embedBudget, estimateRagTokens, hashVector, type DocKind, type DocumentRecord, type Embedder, type OpenedDocument, type TextExtractor } from "@inborn/core";

/* The saved library, as the SQLCipher database would hold it after an update from a nomic-built index. */
const saved = new MemoryEmbeddingStore();
const files = new Map<string, string>();
let embedderMissing = false;
/* Sources a browser no longer holds: a picked file lives in memory for one page load only. */
const gone = new Set<string>();
/* Every text the embedder was handed, so a test can see what reached the model. */
const embedded: string[] = [];
const e5: Embedder = {
  id: "embed-e5",
  embed: async (texts) => {
    embedded.push(...texts);
    return texts.map((t) => hashVector(t, 64));
  },
};

vi.mock("./db", () => ({ openRagStore: async () => saved, ragStoreKind: () => "sqlcipher" }));
vi.mock("./embedder", () => ({ EMBED_MODEL_ID: "embed-e5", resolveEmbedder: () => (embedderMissing ? null : { path: "/embed.gguf", embedder: { ...e5, unload: async () => undefined }, contextTokens: 512 }) }));
vi.mock("./extract", () => ({
  nativeOcr: () => null,
  createExtractors: (): TextExtractor[] => [
    {
      supports: (kind: DocKind) => kind === "txt",
      open: async (source): Promise<OpenedDocument> => ({ pages: 1, page: async (page: number) => ({ page: page + 1, text: files.get(source.uri) ?? "", needsOcr: false }), close: async () => undefined }),
    },
  ],
}));
vi.mock("./files", () => ({
  restoreFiles: async () => undefined,
  whenStored: async () => true,
  copyIntoLibrary: (uri: string, id: string, name: string) => {
    const stored = `/library/${id}-${name}`;
    files.set(stored, files.get(uri) ?? "");
    return stored;
  },
  missingSource: (uri: string) => gone.has(uri),
  sweepIncognitoFiles: () => 0,
  deleteFile: (uri: string | undefined) => void (uri && files.delete(uri)),
  readHead: () => new TextEncoder().encode("plain text"),
  resolveDocUri: (uri: string) => uri,
  sha256Of: async (uri: string) => `sha-${files.get(uri) ?? uri}`,
  sizeOf: (uri: string) => (files.get(uri) ?? "").length || 1,
  storedDocPath: (uri: string) => uri,
}));
let prefs = { strict: true, attachments: {} as Record<string, string[]>, redactNames: [] as string[], redactDates: false };
vi.mock("./prefs", () => ({ readPrefs: () => prefs, writePrefs: (p: typeof prefs) => void (prefs = p) }));

const { DocumentLibrary } = await import("./library");
type Library = InstanceType<typeof DocumentLibrary>;

const settle = async (library: Library) => {
  for (let i = 0; i < 400; i++) {
    if (library.state().documents.every((d) => d.status !== "queued" && d.status !== "indexing")) return;
    await new Promise((r) => setTimeout(r, 5));
  }
  throw new Error("indexing never settled");
};

const GERMAN = "Laut Jahresbericht 2025 beschäftigt die Aoba Handelsgesellschaft dreihundertzweiundachtzig Mitarbeiter an zwei Standorten.";

/** A document the previous app version indexed with nomic-embed: 768-dimension vectors and its own chunk text. */
async function nomicBuilt(): Promise<DocumentRecord> {
  const uri = "/library/old-bericht.txt";
  files.set(uri, GERMAN);
  const doc: DocumentRecord = { id: "old", name: "bericht.txt", kind: "txt", bytes: GERMAN.length, pages: 1, addedAt: 1, status: "indexed", indexedPages: 1, chunkCount: 1, flaggedLines: 0, ocrPages: 0, embedModel: "embed-nomic", uri, sha256: "sha-old" };
  await saved.putDocument(doc);
  await saved.putChunks([{ id: "old:1:0", docId: "old", page: 1, ord: 0, text: "stale nomic chunk", start: 0, end: 17, tokens: 4 }], [hashVector("stale", 768)]);
  return doc;
}

beforeEach(async () => {
  for (const d of await saved.listDocuments()) await saved.deleteDocument(d.id);
  files.clear();
  embedded.length = 0;
  gone.clear();
  embedderMissing = false;
  prefs = { strict: true, attachments: {}, redactNames: [], redactDates: false };
});

describe("F336 · a document indexed by the old embedder is rebuilt on the first open after the update", () => {
  it("re-embeds it with the new embedder, drops every old row, and answers from it", async () => {
    await nomicBuilt();
    const library = new DocumentLibrary();
    await library.ready();
    await settle(library);
    const doc = library.document("old")!;
    expect(doc).toMatchObject({ status: "indexed", embedModel: "embed-e5", chunkCount: 1 });
    const chunks = await saved.chunksOf("old");
    expect(chunks.map((c) => c.text)).toEqual([GERMAN]);
    expect((await saved.vectorsOf(["old"])).map((v) => v.dim)).toEqual([64]);
    /* A mixed 768/64 index would throw here on the dimension check. */
    const { prompt } = await library.ask("Wie viele Mitarbeiter beschäftigt die Aoba Handelsgesellschaft?", { docIds: ["old"] });
    expect(prompt.used.map((h) => h.chunk.text)).toEqual([GERMAN]);
  });

  /* Round 93: its rows stay, searched by their words, until the new embedder lands and rebuilds them. */
  it("without the new embedder installed it is searched by its words, then rebuilt once the embedder lands", async () => {
    await nomicBuilt();
    embedderMissing = true;
    const library = new DocumentLibrary();
    await library.ready();
    library.attach("chat", "old");
    expect(library.document("old")).toMatchObject({ status: "indexed", embedModel: "embed-nomic", chunkCount: 1 });
    expect(library.attachmentState("chat").blocked).toBeNull();
    const words = await library.ask("Which nomic chunk is stale?", { docIds: ["old"] });
    expect(words.lexical).toBe(true);
    expect(words.prompt.used.map((h) => h.chunk.docId)).toEqual(["old"]);

    embedderMissing = false;
    await library.refreshEmbedder();
    await settle(library);
    expect(library.document("old")).toMatchObject({ status: "indexed", embedModel: "embed-e5", chunkCount: 1 });
    expect(library.attachmentState("chat").blocked).toBeNull();
  });

  /* Round 93 (web): a file read by its words before the index model landed, reopened after a reload, has no source left
     to re-read. Its rebuild re-embeds the passages it already stored instead of stalling on "re-indexing" for good. */
  it("a word index whose source is gone is rebuilt from its stored passages", async () => {
    const uri = "/library/words-notes.txt";
    const text = "The irrigation timer runs twice a day, at 06:15 and at 19:40.";
    const doc: DocumentRecord = { id: "words", name: "notes.txt", kind: "txt", bytes: text.length, pages: 1, addedAt: 1, status: "indexed", indexedPages: 1, chunkCount: 1, flaggedLines: 0, ocrPages: 0, embedModel: "lexical", uri, sha256: "sha-words" };
    await saved.putDocument(doc);
    await saved.putChunks([{ id: "words:1:0", docId: "words", page: 1, ord: 0, text, start: 0, end: text.length, tokens: 16 }], []);
    gone.add(uri);

    const library = new DocumentLibrary();
    await library.ready();
    await settle(library);
    expect(library.document("words")).toMatchObject({ status: "indexed", embedModel: "embed-e5", chunkCount: 1, indexedPages: 1 });
    expect(library.document("words")?.reindexFrom).toBeUndefined();
    expect((await saved.vectorsOf(["words"])).map((v) => v.dim)).toEqual([64]);
    expect(embedded.some((t) => t.includes("06:15"))).toBe(true);
    const { prompt, reindexing } = await library.ask("When does the irrigation timer run?", { docIds: ["words"] });
    expect(reindexing).toBeUndefined();
    expect(prompt.used.map((h) => h.chunk.id)).toEqual(["words:1:0"]);
  });

  /* Web: the same file picked again after a reload is a twin of a record whose bytes the page no longer holds. */
  it("a twin whose source is gone takes the file just picked, and is read again from it", async () => {
    const text = "The heat pump was installed in October 2021.";
    files.set("/picked/a.txt", text);
    const library = new DocumentLibrary();
    await library.ready();
    const first = await library.importFile("/picked/a.txt", "a.txt");
    await settle(library);
    const firstUri = library.document(first.id)!.uri!;
    gone.add(firstUri);
    files.delete(firstUri);
    /* A read that died with the page: the record is failed, its bytes are gone. */
    (library as unknown as { docs: Map<string, DocumentRecord> }).docs.set(first.id, { ...library.document(first.id)!, status: "failed", error: "missing", chunkCount: 0, indexedPages: 0 });

    files.set("/picked/a-again.txt", text);
    const again = await library.importFile("/picked/a-again.txt", "a.txt");
    expect(again.id).toBe(first.id);
    expect(again.status).not.toBe("failed");
    expect(library.document(first.id)!.uri).not.toBe(firstUri);
    await settle(library);
    expect(library.document(first.id)).toMatchObject({ status: "indexed", chunkCount: 1 });
  });

  it("leaves a document already indexed by the current embedder alone", async () => {
    const uri = "/picked/neu.txt";
    files.set(uri, GERMAN);
    let library = new DocumentLibrary();
    await library.importFile(uri, "neu.txt");
    await settle(library);
    const before = embedded.length;
    library = new DocumentLibrary();
    await library.ready();
    await settle(library);
    expect(embedded.length).toBe(before);
  });
});

describe("F335 · nothing longer than the embedder's 512 positions reaches it", () => {
  it("chunks a long document within the budget", async () => {
    const uri = "/picked/lang.txt";
    files.set(uri, Array.from({ length: 120 }, (_, i) => `Absatz ${i}: ${GERMAN}`).join(" "));
    const library = new DocumentLibrary();
    await library.importFile(uri, "lang.txt");
    await settle(library);
    const chunks = (await saved.listDocuments()).flatMap((d) => d.id);
    const all = (await Promise.all(chunks.map((id) => saved.chunksOf(id)))).flat();
    expect(all.length).toBeGreaterThan(3);
    const { targetTokens, minTokens } = chunkFor(512);
    for (const c of all) expect(estimateRagTokens(c.text)).toBeLessThanOrEqual(targetTokens + minTokens);
    expect(targetTokens + minTokens).toBeLessThanOrEqual(embedBudget(512));
  });

  it("clips a pasted wall of text before embedding it as a question, keeping the e5 instruction", async () => {
    const uri = "/picked/kurz.txt";
    files.set(uri, GERMAN);
    const library = new DocumentLibrary();
    const doc = await library.importFile(uri, "kurz.txt");
    await settle(library);
    embedded.length = 0;
    await library.ask(`Mitarbeiter ${"sehr lange Frage ".repeat(800)}`, { docIds: [doc.id] });
    expect(embedded).toHaveLength(1);
    expect(embedded[0]!.startsWith("Instruct: Given a question")).toBe(true);
    expect(estimateRagTokens(embedded[0]!)).toBeLessThanOrEqual(embedBudget(512));
  });
});
