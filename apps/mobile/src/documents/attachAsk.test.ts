import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryEmbeddingStore, hashEmbedder, type DocKind, type OpenedDocument, type TextExtractor } from "@inborn/core";
import { planDocsTurn } from "../lib/docsGate";

/**
 * Round 93 (Moshe, 25.9.2026, web app): "I attach a file and the model does not understand what it is; it is not
 * added to the model at all." Two ways the file never reached the model: a question about the file itself matched no
 * passage (docs/qa/web-attach-fix/before-embed), and with no index model the file was never read at all
 * (docs/qa/web-attach-fix/before-noembed).
 */
const saved = new MemoryEmbeddingStore();
const files = new Map<string, string>();
let embedderMissing = false;

vi.mock("./db", () => ({ openRagStore: async () => saved, ragStoreKind: () => "indexeddb" }));
vi.mock("./embedder", () => ({ EMBED_MODEL_ID: "embed-e5", resolveEmbedder: () => (embedderMissing ? null : { path: "/embed.gguf", embedder: { ...hashEmbedder(64, "embed-e5"), unload: async () => undefined }, contextTokens: 512 }) }));
vi.mock("./extract", () => ({
  nativeOcr: () => null,
  createExtractors: (): TextExtractor[] => [
    {
      supports: (kind: DocKind) => kind === "txt",
      open: async (source): Promise<OpenedDocument> => ({ pages: 1, page: async (p: number) => ({ page: p + 1, text: files.get(source.uri) ?? "", needsOcr: false }), close: async () => undefined }),
    },
  ],
}));
vi.mock("./files", () => ({
  copyIntoLibrary: (uri: string) => uri,
  missingSource: () => false,
  sweepIncognitoFiles: () => 0,
  deleteFile: () => undefined,
  readHead: () => new TextEncoder().encode("plain text"),
  resolveDocUri: (uri: string) => uri,
  sha256Of: async (uri: string) => `sha-${uri}`,
  sizeOf: (uri: string) => (files.get(uri) ?? "").length || 1,
  storedDocPath: (uri: string) => uri,
}));
let prefs = { strict: false, attachments: {} as Record<string, string[]>, redactNames: [] as string[], redactDates: false };
vi.mock("./prefs", () => ({ readPrefs: () => prefs, writePrefs: (p: typeof prefs) => void (prefs = p) }));

const { DocumentLibrary } = await import("./library");
type Library = InstanceType<typeof DocumentLibrary>;

const NOTES = "Greenhouse maintenance notes. The Lindqvist greenhouse is heated by a heat pump that was installed in October 2021. The irrigation timer runs twice a day, at 06:15 and at 19:40.";
const ABOUT = "What is this file about? Quote one sentence from it.";

const settle = async (library: Library) => {
  for (let i = 0; i < 400; i++) {
    if (library.state().documents.every((d) => d.status !== "queued" && d.status !== "indexing")) return;
    await new Promise((r) => setTimeout(r, 5));
  }
  throw new Error("indexing never settled");
};

async function attachNotes(library: Library, chat = "chat") {
  files.set("/picked/greenhouse-notes.txt", NOTES);
  const doc = await library.importFile("/picked/greenhouse-notes.txt", "greenhouse-notes.txt");
  library.attach(chat, doc.id);
  await settle(library);
  return library.document(doc.id)!;
}

beforeEach(async () => {
  embedderMissing = false;
  prefs = { strict: false, attachments: {}, redactNames: [], redactDates: false };
  for (const d of await saved.listDocuments()) await saved.deleteDocument(d.id);
});

describe("round 93 · an attached file reaches the model", () => {
  it("with the index model: 'what is this file about' gets the file's passage and a source", async () => {
    const library = new DocumentLibrary();
    const doc = await attachNotes(library);
    const { prompt } = await library.ask(ABOUT, { docIds: [doc.id] });
    expect(prompt.used.map((h) => h.chunk.docId)).toEqual([doc.id]);
    expect(prompt.citations[0]?.docName).toBe("greenhouse-notes.txt");
    expect(prompt.messages.at(-1)!.content).toContain("Lindqvist greenhouse");
  });

  it("without the index model the file is still read, by its words, and the turn is not refused", async () => {
    embedderMissing = true;
    const library = new DocumentLibrary();
    const doc = await attachNotes(library);
    expect(doc).toMatchObject({ status: "indexed", embedModel: "lexical" });
    expect(doc.error).toBeUndefined();
    expect(doc.chunkCount).toBeGreaterThan(0);
    const state = library.attachmentState("chat");
    expect(state.blocked).toBeNull();
    expect(planDocsTurn({ strict: false, ...state })).toEqual({ kind: "retrieve" });
  });

  it("without the index model a direct question is answered from the passage, marked as a word search", async () => {
    embedderMissing = true;
    const library = new DocumentLibrary();
    const doc = await attachNotes(library);
    const direct = await library.ask("When was the heat pump in the greenhouse installed?", { docIds: [doc.id] });
    expect(direct.lexical).toBe(true);
    expect(direct.prompt.used.map((h) => h.chunk.docId)).toEqual([doc.id]);
    expect(direct.prompt.citations).toHaveLength(1);
    const about = await library.ask(ABOUT, { docIds: [doc.id] });
    expect(about.prompt.used).toHaveLength(1);
  });

  it("an unrelated question still gets no passage", async () => {
    embedderMissing = true;
    const library = new DocumentLibrary();
    const doc = await attachNotes(library);
    const { prompt } = await library.ask("What is the capital of France?", { docIds: [doc.id] });
    expect(prompt.used).toHaveLength(0);
  });

  it("once the index model lands, the word index is rebuilt with vectors", async () => {
    embedderMissing = true;
    const library = new DocumentLibrary();
    const doc = await attachNotes(library);
    embedderMissing = false;
    await library.refreshEmbedder();
    await settle(library);
    expect(library.document(doc.id)).toMatchObject({ status: "indexed", embedModel: "embed-e5" });
    expect((await saved.vectorsOf([doc.id])).length).toBeGreaterThan(0);
    const again = await library.ask("When was the heat pump in the greenhouse installed?", { docIds: [doc.id] });
    expect(again.lexical).toBeFalsy();
  });
});
