import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryEmbeddingStore, hashEmbedder, type DocKind, type OpenedDocument, type TextExtractor } from "@inborn/core";

/* The saved library: what would be inside the SQLCipher database. The test asserts on it directly. */
const saved = new MemoryEmbeddingStore();
/* The device's disk, by path. `LIBRARY` is the document directory that survives a launch; `INCOGNITO` is the cache
   directory the session owns (F95): a file there must never outlive its session, crash or no crash. */
const files = new Map<string, string>();
const LIBRARY = "/library/";
const INCOGNITO = "/cache/incognito/";

vi.mock("./db", () => ({ openRagStore: async () => saved, ragStoreKind: () => "sqlcipher" }));
vi.mock("./embedder", () => ({ EMBED_MODEL_ID: "embed-e5", resolveEmbedder: () => ({ path: "/embed.gguf", embedder: hashEmbedder(64), contextTokens: 512 }) }));
vi.mock("./extract", () => ({
  nativeOcr: () => null,
  createExtractors: (): TextExtractor[] => [
    {
      supports: (kind: DocKind) => kind === "txt",
      open: async (source): Promise<OpenedDocument> => ({
        pages: 1,
        page: async (page: number) => ({ page: page + 1, text: files.get(source.uri) ?? "", needsOcr: false }),
        close: async () => undefined,
      }),
    },
  ],
}));
vi.mock("./files", () => ({
  copyIntoLibrary: (uri: string, id: string, name: string, opts: { incognito?: boolean } = {}) => {
    const stored = `${opts.incognito ? INCOGNITO : LIBRARY}${id}-${name}`;
    files.set(stored, files.get(uri) ?? "");
    return stored;
  },
  missingSource: (uri: string) => !files.has(uri),
  sweepIncognitoFiles: () => {
    const orphans = [...files.keys()].filter((k) => k.startsWith(INCOGNITO));
    for (const k of orphans) files.delete(k);
    return orphans.length;
  },
  deleteFile: (uri: string | undefined) => void (uri && files.delete(uri)),
  readHead: () => new TextEncoder().encode("plain text"),
  resolveDocUri: (uri: string) => uri,
  sha256Of: async (uri: string) => `sha-${uri}`,
  sizeOf: (uri: string) => (files.get(uri) ?? "").length,
  storedDocPath: (uri: string) => uri,
}));
let prefs = { strict: false, attachments: {} as Record<string, string[]>, redactNames: [] as string[], redactDates: false };
vi.mock("./prefs", () => ({ readPrefs: () => prefs, writePrefs: (p: typeof prefs) => void (prefs = p) }));

const { DocumentLibrary, RAM_ATTACH_PREFIX } = await import("./library");

const settle = async (library: InstanceType<typeof DocumentLibrary>) => {
  for (let i = 0; i < 200; i++) {
    if (library.state().documents.every((d) => d.status !== "queued" && d.status !== "indexing")) return;
    await new Promise((r) => setTimeout(r, 5));
  }
  throw new Error("indexing never settled");
};

async function importInto(library: InstanceType<typeof DocumentLibrary>, name: string, text: string, incognito: boolean) {
  const uri = `/picked/${name}`;
  files.set(uri, text);
  const doc = await library.importFile(uri, name, { incognito });
  await settle(library);
  return doc;
}

beforeEach(async () => {
  for (const d of await saved.listDocuments()) await saved.deleteDocument(d.id);
  files.clear();
  prefs = { strict: false, attachments: {}, redactNames: [], redactDates: false };
});

describe("incognito documents live in RAM only (spec §5.7, F69/F70)", () => {
  it("a document added in an incognito chat is never written to the saved library", async () => {
    const library = new DocumentLibrary();
    const kept = await importInto(library, "warranty.txt", "the warranty lasts two years", false);
    const secret = await importInto(library, "offer.txt", "the offer price is four million", true);

    expect(library.isIncognito(secret.id)).toBe(true);
    expect(library.isIncognito(kept.id)).toBe(false);
    /* The whole point: nothing of the incognito document reached the database, not the row and not a chunk. */
    expect((await saved.listDocuments()).map((d) => d.name)).toEqual(["warranty.txt"]);
    expect(await saved.getDocument(secret.id)).toBeNull();
    expect(await saved.chunksOf(secret.id)).toEqual([]);
    expect(await saved.vectorsOf([secret.id])).toEqual([]);
    /* And it is still a usable document while the session lasts. */
    expect(library.state().documents.map((d) => d.name).sort()).toEqual(["offer.txt", "warranty.txt"]);
    expect(library.document(secret.id)?.chunkCount).toBeGreaterThan(0);
  });

  it("both documents answer the same question while the session lasts", async () => {
    const library = new DocumentLibrary();
    const kept = await importInto(library, "warranty.txt", "the warranty lasts two years", false);
    const secret = await importInto(library, "offer.txt", "the offer price is four million", true);
    const { prompt } = await library.ask("what is the offer price", { docIds: [kept.id, secret.id] });
    expect(prompt.citations.length).toBeGreaterThan(0);
    expect(prompt.messages.map((m) => m.content).join("\n")).toContain("four million");
  });

  it("ending the session takes the incognito document, its file and its attachment; the saved library is untouched", async () => {
    const library = new DocumentLibrary();
    const kept = await importInto(library, "warranty.txt", "the warranty lasts two years", false);
    const secret = await importInto(library, "offer.txt", "the offer price is four million", true);
    const chatKey = `${RAM_ATTACH_PREFIX}chat-1`;
    library.attach(chatKey, secret.id);
    library.attach("chat-2", kept.id);
    const storedUri = library.document(secret.id)!.uri!;
    /* The complement of the old assertion: the copy the extractor reads is in the session's cache directory, and the
       document library, which survives the session, never holds it. */
    expect(storedUri.startsWith(INCOGNITO)).toBe(true);
    expect([...files.keys()].filter((k) => k.startsWith(LIBRARY))).toEqual([library.document(kept.id)!.uri]);

    library.endSession();

    expect(library.state().documents.map((d) => d.name)).toEqual(["warranty.txt"]);
    expect(library.document(secret.id)).toBeUndefined();
    expect(library.isIncognito(secret.id)).toBe(false);
    expect(files.has(storedUri)).toBe(false);
    expect(library.attachedTo(chatKey)).toEqual([]);
    expect(library.attachedTo("chat-2").map((d) => d.id)).toEqual([kept.id]);
    expect((await saved.listDocuments()).map((d) => d.name)).toEqual(["warranty.txt"]);
  });

  it("a crash mid-session leaves the file behind, and the next launch deletes it before the library opens", async () => {
    const crashed = new DocumentLibrary();
    const secret = await importInto(crashed, "offer.txt", "the offer price is four million", true);
    const storedUri = crashed.document(secret.id)!.uri!;
    /* No endSession: this is the process dying with the session open. */
    expect(files.has(storedUri)).toBe(true);

    const relaunched = new DocumentLibrary();
    await relaunched.ready();

    expect(files.has(storedUri)).toBe(false);
    expect([...files.keys()].some((k) => k.startsWith(INCOGNITO))).toBe(false);
  });

  it("a saved import still goes to the library, so the sweep cannot be a blanket delete", async () => {
    const library = new DocumentLibrary();
    const kept = await importInto(library, "warranty.txt", "the warranty lasts two years", false);
    expect(library.document(kept.id)!.uri!.startsWith(LIBRARY)).toBe(true);
    await new DocumentLibrary().ready();
    expect(files.has(library.document(kept.id)!.uri!)).toBe(true);
  });

  it("a session with nothing incognito in it ends without touching anything", async () => {
    const library = new DocumentLibrary();
    const kept = await importInto(library, "warranty.txt", "the warranty lasts two years", false);
    library.attach("chat-2", kept.id);
    library.endSession();
    expect(library.state().documents.map((d) => d.id)).toEqual([kept.id]);
    expect(library.attachedTo("chat-2").map((d) => d.id)).toEqual([kept.id]);
  });
});
