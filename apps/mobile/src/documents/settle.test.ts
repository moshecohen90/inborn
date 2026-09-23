import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryEmbeddingStore, hashEmbedder, type DocKind, type OpenedDocument, type TextExtractor } from "@inborn/core";

/* Same shape as incognito.test.ts, with one difference that is the whole point: reading a page takes time, so the
   chat's question really does arrive while the document is still being read — Moshe's case (QA F135). */
const saved = new MemoryEmbeddingStore();
const files = new Map<string, string>();
let pageDelayMs = 0;

vi.mock("./db", () => ({ openRagStore: async () => saved, ragStoreKind: () => "sqlcipher" }));
let embedderPresent = true;
vi.mock("./embedder", () => ({ resolveEmbedder: () => (embedderPresent ? { path: "/embed.gguf", embedder: hashEmbedder(64) } : null) }));
vi.mock("./extract", () => ({
  nativeOcr: () => null,
  createExtractors: (): TextExtractor[] => [
    {
      supports: (kind: DocKind) => kind === "txt",
      open: async (source): Promise<OpenedDocument> => ({
        pages: 1,
        page: async (page: number) => {
          if (pageDelayMs) await new Promise((r) => setTimeout(r, pageDelayMs));
          return { page: page + 1, text: files.get(source.uri) ?? "", needsOcr: false };
        },
        close: async () => undefined,
      }),
    },
  ],
}));
vi.mock("./files", () => ({
  copyIntoLibrary: (uri: string, id: string, name: string) => {
    const stored = `/library/${id}-${name}`;
    files.set(stored, files.get(uri) ?? "");
    return stored;
  },
  sweepIncognitoFiles: () => 0,
  deleteFile: (uri: string | undefined) => void (uri && files.delete(uri)),
  readHead: () => new TextEncoder().encode("plain text"),
  resolveDocUri: (uri: string) => uri,
  sha256Of: async (uri: string) => `sha-${uri}`,
  sizeOf: (uri: string) => (files.get(uri) ?? "").length,
  storedDocPath: (uri: string) => uri,
}));
let prefs = { strict: false, attachments: {} as Record<string, string[]>, redactNames: [] as string[], redactDates: false };
vi.mock("./prefs", () => ({ readPrefs: () => prefs, writePrefs: (p: typeof prefs) => void (prefs = p) }));

const { DocumentLibrary } = await import("./library");

beforeEach(async () => {
  for (const d of await saved.listDocuments()) await saved.deleteDocument(d.id);
  files.clear();
  pageDelayMs = 0;
  embedderPresent = true;
  prefs = { strict: false, attachments: {}, redactNames: [], redactDates: false };
});

describe("waiting for an attached document to be read (QA F135)", () => {
  it("settle resolves only once the document really has its passages", async () => {
    pageDelayMs = 60;
    const library = new DocumentLibrary();
    files.set("/picked/warranty.txt", "the warranty lasts two years");
    const doc = await library.importFile("/picked/warranty.txt", "warranty.txt");

    /* The state the chat gate sees at the moment the user hits send. */
    expect(library.indexingAny([doc.id])).toBe(true);
    expect(library.document(doc.id)?.chunkCount ?? 0).toBe(0);

    await library.settle([doc.id]);

    expect(library.indexingAny([doc.id])).toBe(false);
    expect(library.document(doc.id)!.chunkCount).toBeGreaterThan(0);
    expect(library.document(doc.id)!.status).toBe("indexed");
  });

  it("settle resolves immediately for a document that is already read, and for an id that does not exist", async () => {
    const library = new DocumentLibrary();
    files.set("/picked/a.txt", "hello");
    const doc = await library.importFile("/picked/a.txt", "a.txt");
    await library.settle([doc.id]);
    /* No pending job left: a second wait must not hang. */
    await expect(Promise.race([library.settle([doc.id, "no-such-doc"]), new Promise((_, reject) => setTimeout(() => reject(new Error("settle hung")), 500))])).resolves.toBeUndefined();
    expect(library.indexingAny([])).toBe(false);
  });

  it("a file that cannot be indexed settles too, with nothing to search", async () => {
    embedderPresent = false;
    const library = new DocumentLibrary();
    files.set("/picked/b.txt", "hello");
    const doc = await library.importFile("/picked/b.txt", "b.txt");
    await library.settle([doc.id]);
    expect(library.indexingAny([doc.id])).toBe(false);
    expect(library.document(doc.id)!.status).toBe("failed");
    expect(library.document(doc.id)!.error).toBe("no-embedder");
    expect(library.document(doc.id)!.chunkCount).toBe(0);
  });
});
