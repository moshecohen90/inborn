import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryEmbeddingStore, hashVector, type DocKind, type DocumentRecord, type Embedder, type OpenedDocument, type TextExtractor } from "@inborn/core";

/* QA F353: after the update to e5, three large PDFs are rebuilt one after another while the user keeps asking. */
const saved = new MemoryEmbeddingStore();
const files = new Map<string, string[]>();
const CHUNK_MS = 20;

/** llama.rn's embedding context: one text at a time, a second call while one runs throws, and a killed app never returns. */
function engine() {
  let inFlight = false;
  const e = {
    embedded: [] as string[],
    killed: false,
    busyErrors: 0,
    async embed(texts: string[]): Promise<Float32Array[]> {
      if (inFlight) {
        e.busyErrors++;
        throw new Error("Context is busy");
      }
      inFlight = true;
      try {
        const out: Float32Array[] = [];
        for (const t of texts) {
          await new Promise((r) => setTimeout(r, CHUNK_MS));
          if (e.killed) await new Promise(() => undefined);
          e.embedded.push(t);
          out.push(hashVector(t, 64));
        }
        return out;
      } finally {
        inFlight = false;
      }
    },
  };
  return e;
}
let current = engine();

vi.mock("./db", () => ({ openRagStore: async () => saved, ragStoreKind: () => "sqlcipher" }));
vi.mock("./embedder", () => ({
  EMBED_MODEL_ID: "embed-e5",
  resolveEmbedder: () => ({ path: "/embed.gguf", embedder: { id: "embed-e5", embed: (t: string[]) => current.embed(t), unload: async () => undefined } satisfies Embedder & { unload(): Promise<void> }, contextTokens: 512 }),
}));
vi.mock("./extract", () => ({
  nativeOcr: () => null,
  createExtractors: (): TextExtractor[] => [
    {
      supports: (kind: DocKind) => kind === "pdf",
      open: async (source): Promise<OpenedDocument> => {
        const pages = files.get(source.uri) ?? [];
        return { pages: pages.length, page: async (i: number) => ({ page: i + 1, text: pages[i] ?? "", needsOcr: false }), close: async () => undefined };
      },
    },
  ],
}));
vi.mock("./files", () => ({
  copyIntoLibrary: (uri: string) => uri,
  missingSource: () => false,
  sweepIncognitoFiles: () => 0,
  deleteFile: () => undefined,
  readHead: () => new TextEncoder().encode("%PDF-1.7"),
  resolveDocUri: (uri: string) => uri,
  sha256Of: async (uri: string) => `sha-${uri}`,
  sizeOf: () => 1,
  storedDocPath: (uri: string) => uri,
}));
let prefs = { strict: true, attachments: {} as Record<string, string[]>, redactNames: [] as string[], redactDates: false };
vi.mock("./prefs", () => ({ readPrefs: () => prefs, writePrefs: (p: typeof prefs) => void (prefs = p) }));

const { DocumentLibrary } = await import("./library");
type Library = InstanceType<typeof DocumentLibrary>;

const PAGES = 8;
const ANSWER = "Laut Jahresbericht beschäftigt die Aoba Handelsgesellschaft dreihundertzweiundachtzig Mitarbeiter an zwei Standorten.";
const QUESTION = "Wie viele Mitarbeiter beschäftigt die Aoba Handelsgesellschaft?";
const page = (doc: string, p: number) => `${doc} Seite ${p}: Lagerbestand, Lieferanten und Frachtkosten im Abschnitt ${p}.`;

/** A PDF the previous version indexed with nomic-embed (768 dimensions); `answerPage` holds the one passage that answers. */
async function nomicBuilt(id: string, addedAt: number, answerPage?: number): Promise<DocumentRecord> {
  const uri = `/library/${id}.pdf`;
  const texts = Array.from({ length: PAGES }, (_, i) => (i + 1 === answerPage ? ANSWER : page(id, i + 1)));
  files.set(uri, texts);
  const doc: DocumentRecord = { id, name: `${id}.pdf`, kind: "pdf", bytes: 1, pages: PAGES, addedAt, status: "indexed", indexedPages: PAGES, chunkCount: PAGES, flaggedLines: 0, ocrPages: 0, embedModel: "embed-nomic", uri, sha256: `sha-${uri}` };
  await saved.putDocument(doc);
  await saved.putChunks(
    texts.map((text, i) => ({ id: `${id}:${i + 1}:${i}`, docId: id, page: i + 1, ord: i, text, start: 0, end: text.length, tokens: 20 })),
    texts.map((t) => hashVector(t, 768)),
  );
  return doc;
}

const until = async (what: () => boolean, label: string) => {
  for (let i = 0; i < 2000; i++) {
    if (what()) return;
    await new Promise((r) => setTimeout(r, 2));
  }
  throw new Error(`never: ${label}`);
};
const settled = (library: Library) => library.state().documents.every((d) => d.status === "indexed");

beforeEach(async () => {
  for (const d of await saved.listDocuments()) await saved.deleteDocument(d.id);
  files.clear();
  current = engine();
  prefs = { strict: true, attachments: {}, redactNames: [], redactDates: false };
});

describe("F353 · a question during the post-update re-index", () => {
  it("on a document already rebuilt, is answered within about one chunk's time and never hits a busy embedder", async () => {
    await nomicBuilt("ready", 3, 2);
    await nomicBuilt("gross1", 2);
    await nomicBuilt("gross2", 1);
    const library = new DocumentLibrary();
    await library.ready();
    library.attach("chat", "ready");
    await until(() => library.document("ready")?.status === "indexed" && library.document("gross1")?.status === "indexing", "ready rebuilt, gross1 rebuilding");
    const started = Date.now();
    const { prompt, reindexing } = await library.ask(QUESTION, { docIds: ["ready"] });
    const waited = Date.now() - started;
    expect(current.busyErrors).toBe(0);
    expect(prompt.used.map((h) => h.chunk.text)).toEqual([ANSWER]);
    /* The chunk in the engine, then the question: never the rest of the queue (a 40-page PDF was ~13 minutes on the 6T). */
    expect(waited).toBeLessThan(CHUNK_MS * 6);
    expect(library.document("gross1")!.status).toBe("indexing");
    /* Everything this answer searched is rebuilt: no notice. */
    expect(reindexing).toBeUndefined();
    await until(() => settled(library), "rebuild finished");
    expect(current.busyErrors).toBe(0);
  });

  it("on a document not rebuilt yet, answers from its old rows by their words, says so, and does not wait for the rebuild", async () => {
    await nomicBuilt("bericht", 2, PAGES);
    await nomicBuilt("andere", 1);
    const library = new DocumentLibrary();
    await library.ready();
    library.attach("chat", "bericht");
    await until(() => (library.document("bericht")?.indexedPages ?? 0) >= 1, "first page rebuilt");
    const gate = library.attachmentState("chat");
    expect(gate).toMatchObject({ hasIndex: true, indexing: false, blocked: null, reading: 0 });
    const { prompt, reindexing } = await library.ask(QUESTION, { docIds: ["bericht"] });
    expect(prompt.noAnswer).toBe(false);
    expect(prompt.used.map((h) => h.chunk.text)).toEqual([ANSWER]);
    expect(reindexing).toEqual({ pending: 1, total: 1 });
    expect(library.document("bericht")!.indexedPages).toBeLessThan(PAGES);
    await until(() => settled(library), "rebuild finished");
    const after = await library.ask(QUESTION, { docIds: ["bericht"] });
    expect(after.reindexing).toBeUndefined();
    expect(after.prompt.used.map((h) => h.chunk.text)).toEqual([ANSWER]);
    expect((await saved.vectorsOf(["bericht", "andere"])).every((v) => v.dim === 64)).toBe(true);
  });

  it("after a kill mid-rebuild, the next launch resumes at the last finished document and page, not from zero", { timeout: 20_000 }, async () => {
    await nomicBuilt("eins", 3);
    await nomicBuilt("zwei", 2);
    await nomicBuilt("drei", 1);
    const first = new DocumentLibrary();
    await first.ready();
    await until(() => first.document("eins")?.status === "indexed" && (first.document("zwei")?.indexedPages ?? 0) >= 3, "eins done, zwei at page 3");
    /* The process dies: the engine never returns and nothing more is written. */
    current.killed = true;
    await new Promise((r) => setTimeout(r, CHUNK_MS * 2));
    const zweiAtKill = (await saved.getDocument("zwei"))!.indexedPages;
    expect(zweiAtKill).toBeGreaterThanOrEqual(3);
    expect(zweiAtKill).toBeLessThan(PAGES);

    current = engine();
    const second = new DocumentLibrary();
    await second.ready();
    await until(() => settled(second), "rebuild finished after relaunch");
    const again = current.embedded;
    expect(again.filter((t) => t.startsWith("eins"))).toEqual([]);
    expect(again.filter((t) => t.startsWith("zwei"))).toEqual(Array.from({ length: PAGES - zweiAtKill }, (_, i) => page("zwei", zweiAtKill + i + 1)));
    expect(again.filter((t) => t.startsWith("drei"))).toHaveLength(PAGES);
    for (const id of ["eins", "zwei", "drei"]) expect(second.document(id)).toMatchObject({ status: "indexed", embedModel: "embed-e5", chunkCount: PAGES, indexedPages: PAGES });
    expect(second.document("zwei")!.reindexFrom).toBeUndefined();
  });

  it("a file the user adds during the rebuild is read before the documents still waiting to be rebuilt", async () => {
    await nomicBuilt("alt1", 3);
    await nomicBuilt("alt2", 2);
    await nomicBuilt("alt3", 1);
    const library = new DocumentLibrary();
    await library.ready();
    files.set("/picked/neu.pdf", ["neu Seite 1: Vertrag"]);
    await until(() => library.document("alt1")?.status === "indexing", "alt1 rebuilding");
    const doc = await library.importFile("/picked/neu.pdf", "neu.pdf");
    await until(() => library.document(doc.id)?.status === "indexed", "new file read");
    expect(library.document("alt3")!.status).toBe("queued");
  });
});
