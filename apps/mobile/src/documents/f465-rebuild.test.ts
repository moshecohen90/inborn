import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryEmbeddingStore, chunkFor, chunkingOf, hashVector, type DocKind, type DocumentRecord, type Embedder, type OpenedDocument, type TextExtractor } from "@inborn/core";

/* F465: after an update a 40-page library file was rebuilt for 31 min while a freshly attached file waited behind it. */
const saved = new MemoryEmbeddingStore();
const files = new Map<string, string[]>();
/* Every file the extractor opened, so a test can see which documents were read again. */
const opened: string[] = [];
/* Every text the embedder was handed, in order, tagged with the document it came from by its marker word. */
const embedded: string[] = [];
/* Each embedding waits for this many ms, so a rebuild is still running when the next thing happens. */
let embedDelay = 0;
const e5: Embedder = {
  id: "embed-e5",
  revision: 2,
  embed: async (texts) => {
    if (embedDelay) await new Promise((r) => setTimeout(r, embedDelay));
    embedded.push(...texts);
    return texts.map((t) => hashVector(t, 64));
  },
};

vi.mock("./db", () => ({ openRagStore: async () => saved, ragStoreKind: () => "sqlcipher" }));
vi.mock("./embedder", () => ({ EMBED_MODEL_ID: "embed-e5", resolveEmbedder: () => ({ path: "/embed.gguf", embedder: { ...e5, unload: async () => undefined }, contextTokens: 512 }) }));
vi.mock("./extract", () => ({
  nativeOcr: () => null,
  createExtractors: (): TextExtractor[] => [
    {
      supports: (kind: DocKind) => kind === "txt",
      open: async (source): Promise<OpenedDocument> => {
        opened.push(source.uri);
        const pages = files.get(source.uri) ?? [""];
        return { pages: pages.length, page: async (p: number) => ({ page: p + 1, text: pages[p] ?? "", needsOcr: false }), close: async () => undefined };
      },
    },
  ],
}));
vi.mock("./files", () => ({
  restoreFiles: async () => undefined,
  whenStored: async () => true,
  copyIntoLibrary: (uri: string, id: string, name: string) => {
    const stored = `/library/${id}-${name}`;
    files.set(stored, files.get(uri) ?? [""]);
    return stored;
  },
  missingSource: () => false,
  sweepIncognitoFiles: () => 0,
  deleteFile: (uri: string | undefined) => void (uri && files.delete(uri)),
  readHead: () => new TextEncoder().encode("plain text"),
  resolveDocUri: (uri: string) => uri,
  sha256Of: async (uri: string) => `sha-${uri}`,
  sizeOf: () => 100,
  storedDocPath: (uri: string) => uri,
}));
let prefs = { strict: true, attachments: {} as Record<string, string[]>, redactNames: [] as string[], redactDates: false };
vi.mock("./prefs", () => ({ readPrefs: () => prefs, writePrefs: (p: typeof prefs) => void (prefs = p) }));

const { DocumentLibrary } = await import("./library");
type Library = InstanceType<typeof DocumentLibrary>;

const until = async (cond: () => boolean, what: string) => {
  for (let i = 0; i < 2000; i++) {
    if (cond()) return;
    await new Promise((r) => setTimeout(r, 2));
  }
  throw new Error(`never: ${what}`);
};
const settled = (library: Library) => library.state().documents.every((d) => d.status !== "queued" && d.status !== "indexing");

const CHUNKING = chunkingOf(chunkFor(512));
const pageText = (marker: string, p: number) => `${marker} page ${p + 1} records the harbour tonnage for week ${p + 1}.`;

/** A document the previous build indexed with embed-e5 before revision 2: one passage per page, as the chunker cut them. */
async function libraryDoc(id: string, marker: string, pages: number, extra: Partial<DocumentRecord> = {}): Promise<DocumentRecord> {
  const uri = `/library/${id}.txt`;
  const texts = Array.from({ length: pages }, (_, p) => pageText(marker, p));
  files.set(uri, texts);
  const doc: DocumentRecord = { id, name: `${id}.txt`, kind: "txt", bytes: 100, pages, addedAt: 1, status: "indexed", indexedPages: pages, chunkCount: pages, flaggedLines: 0, ocrPages: 0, embedModel: "embed-e5", uri, sha256: `sha-${id}`, ...extra };
  await saved.putDocument(doc);
  await saved.putChunks(
    texts.map((text, p) => ({ id: `${id}:${p + 1}:${p}`, docId: id, page: p + 1, ord: p, text, start: 0, end: text.length, tokens: 16 })),
    texts.map((t) => hashVector(`old ${t}`, 64)),
  );
  return doc;
}

beforeEach(async () => {
  for (const d of await saved.listDocuments()) await saved.deleteDocument(d.id);
  files.clear();
  opened.length = 0;
  embedded.length = 0;
  embedDelay = 0;
  prefs = { strict: true, attachments: {}, redactNames: [], redactDates: false };
});

describe("F465 · an update rebuilds only what changed", () => {
  it("a new embedder revision re-embeds the stored passages in place: no page is read again, every passage is kept", async () => {
    await libraryDoc("northgate", "Northgate", 40);
    const library = new DocumentLibrary();
    await library.ready();
    await until(() => settled(library), "rebuild settles");
    expect(opened).toEqual([]);
    const doc = library.document("northgate")!;
    expect(doc).toMatchObject({ status: "indexed", embedModel: "embed-e5@2", chunkCount: 40, indexedPages: 40, chunking: CHUNKING });
    expect(doc.reindexFrom).toBeUndefined();
    expect(doc.vectorPages).toBeUndefined();
    expect(embedded).toHaveLength(40);
    expect((await saved.chunksOf("northgate")).map((c) => c.text)).toEqual(Array.from({ length: 40 }, (_, p) => pageText("Northgate", p)));
    const v = (await saved.vectorsOf(["northgate"])).find((x) => x.chunkId === "northgate:7:6")!;
    const fresh = hashVector(pageText("Northgate", 6), 64);
    expect(Math.abs(v.q[0]! * v.scale - fresh[0]!)).toBeLessThan(0.02);

    /* A second launch on the same build finds nothing to do. */
    embedded.length = 0;
    const again = new DocumentLibrary();
    await again.ready();
    await until(() => settled(again), "second launch settles");
    expect(embedded).toEqual([]);
  });

  it("the same build rebuilds nothing", async () => {
    await libraryDoc("current", "Current", 3, { embedModel: "embed-e5@2", chunking: CHUNKING });
    const library = new DocumentLibrary();
    await library.ready();
    await until(() => settled(library), "settles");
    expect(embedded).toEqual([]);
    expect(opened).toEqual([]);
  });

  it("passages cut another way are read and cut again", async () => {
    await libraryDoc("recut", "Recut", 3, { embedModel: "embed-e5@2", chunking: "v0:400/60/40" });
    const library = new DocumentLibrary();
    await library.ready();
    await until(() => settled(library), "settles");
    expect(opened).toEqual(["/library/recut.txt"]);
    expect(library.document("recut")).toMatchObject({ status: "indexed", embedModel: "embed-e5@2", chunking: CHUNKING });
  });

  it("a rebuild killed halfway resumes at its committed page", async () => {
    await libraryDoc("half", "Half", 10, { status: "indexing", reindexFrom: "embed-e5", vectorPages: 6 });
    const library = new DocumentLibrary();
    await library.ready();
    await until(() => settled(library), "settles");
    expect(opened).toEqual([]);
    expect(embedded).toEqual([7, 8, 9, 10].map((p) => pageText("Half", p - 1)));
    expect(library.document("half")).toMatchObject({ status: "indexed", embedModel: "embed-e5@2", indexedPages: 10 });
  });
});

describe("F465 · the user's current work comes first", () => {
  it("a file attached during a library rebuild is read at once; the rebuild steps aside and resumes where it stopped", async () => {
    embedDelay = 3;
    await libraryDoc("northgate", "Northgate", 40);
    const library = new DocumentLibrary();
    await library.ready();
    await until(() => (library.document("northgate")?.vectorPages ?? 0) >= 3, "rebuild under way");

    files.set("/picked/pancakes.txt", Array.from({ length: 9 }, (_, p) => `Pancakes step ${p + 1}: whisk flour and milk for batch ${p + 1}.`));
    const fresh = await library.importFile("/picked/pancakes.txt", "pancakes.txt");
    library.attach("chat", fresh.id);
    expect(library.attachmentState("chat").indexing).toBe(true);
    await library.whenAttachmentsRead("chat");
    expect(library.document(fresh.id)).toMatchObject({ status: "indexed", chunkCount: 9 });
    /* The 40-page rebuild had not finished when the attached file was ready to answer from. */
    const rebuilding = library.document("northgate")!;
    expect(rebuilding.reindexFrom).toBe("embed-e5");
    expect(rebuilding.status).not.toBe("cancelled");
    expect(rebuilding.vectorPages!).toBeLessThan(40);

    await until(() => settled(library), "rebuild finishes");
    expect(library.document("northgate")).toMatchObject({ status: "indexed", embedModel: "embed-e5@2", chunkCount: 40 });
    /* No page was embedded from the start again: at most the text in flight when it stepped aside. */
    const northgate = embedded.filter((t) => t.startsWith("Northgate"));
    expect(new Set(northgate).size).toBe(40);
    expect(northgate.length).toBeLessThanOrEqual(41);
    const lastPancake = embedded.findLastIndex((t) => t.startsWith("Pancakes"));
    const firstPancake = embedded.findIndex((t) => t.startsWith("Pancakes"));
    expect(embedded.slice(firstPancake, lastPancake + 1).every((t) => t.startsWith("Pancakes"))).toBe(true);
  });

  it("the document a question is about is rebuilt before the rest of the library", async () => {
    embedDelay = 2;
    await libraryDoc("aaa", "Alpha", 20, { addedAt: 3 });
    await libraryDoc("bbb", "Bravo", 20, { addedAt: 2 });
    await libraryDoc("ccc", "Charlie", 5, { addedAt: 1 });
    const library = new DocumentLibrary();
    await library.ready();
    await until(() => embedded.length >= 2, "first rebuild under way");
    const first = embedded[0]!.split(" ")[0]!;
    const asked = first === "Charlie" ? "aaa" : "ccc";
    const askedMarker = asked === "aaa" ? "Alpha" : "Charlie";
    const { reindexing } = await library.ask(`What does ${askedMarker} page 2 record?`, { docIds: [asked] });
    expect(reindexing?.ids).toEqual([asked]);
    await until(() => library.document(asked)?.status === "indexed", "asked document rebuilt");
    const others = library.state().documents.filter((d) => d.id !== asked && d.id !== embeddedDoc(first));
    /* The untouched third document had not been started when the asked one was done. */
    for (const d of others) expect(d.embedModel).toBe("embed-e5");
    await until(() => settled(library), "all rebuilt");
  });
});

const embeddedDoc = (marker: string): string => ({ Alpha: "aaa", Bravo: "bbb", Charlie: "ccc" })[marker] ?? "";
