import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryEmbeddingStore, hashEmbedder, type DocKind, type OpenedDocument, type TextExtractor } from "@inborn/core";
import { planDocsTurn } from "../lib/docsGate";

/* The saved library, as the SQLCipher database would hold it. */
const saved = new MemoryEmbeddingStore();
const files = new Map<string, string>();
/* Held open per page so a test can ask its question while the document is still being read. */
let hold: (() => void) | null = null;
let embedderMissing = false;

vi.mock("./db", () => ({ openRagStore: async () => saved, ragStoreKind: () => "sqlcipher" }));
vi.mock("./embedder", () => ({ resolveEmbedder: () => (embedderMissing ? null : { path: "/embed.gguf", embedder: hashEmbedder(64) }) }));
vi.mock("./extract", () => ({
  nativeOcr: () => null,
  createExtractors: (): TextExtractor[] => [
    {
      supports: (kind: DocKind) => kind === "txt" || kind === "image",
      open: async (source): Promise<OpenedDocument> => ({
        pages: 1,
        page: async (page: number) => {
          if (hold) await new Promise<void>((r) => (hold = r));
          const text = files.get(source.uri) ?? "";
          /* An empty page with no text layer is what a scan looks like: it ends as needs-ocr, never indexed. */
          return { page: page + 1, text, needsOcr: !text };
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
  sizeOf: (uri: string) => (files.get(uri) ?? "").length || 1,
  storedDocPath: (uri: string) => uri,
}));
let prefs = { strict: false, attachments: {} as Record<string, string[]>, redactNames: [] as string[], redactDates: false };
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

/** Imports and attaches exactly the way the chat does: the chip appears before the document has been read. */
async function attach(library: Library, chat: string, name: string, text: string) {
  const uri = `/picked/${name}`;
  files.set(uri, text);
  const doc = await library.importFile(uri, name);
  library.attach(chat, doc.id);
  return doc;
}

beforeEach(async () => {
  for (const d of await saved.listDocuments()) await saved.deleteDocument(d.id);
  files.clear();
  hold = null;
  embedderMissing = false;
  prefs = { strict: false, attachments: {}, redactNames: [], redactDates: false };
});

describe("attachmentState: what the chat may answer from (QA F125/F126)", () => {
  it("reports a document that is still being read, and the turn waits for it", async () => {
    const library = new DocumentLibrary();
    hold = () => undefined;
    await attach(library, "chat-1", "handbook.txt", "the access code is ZR-4471-QX");

    const mid = library.attachmentState("chat-1");
    expect(mid.hasAttachment).toBe(true);
    expect(mid.indexing).toBe(true);
    expect(mid.reading).toBe(1);
    /* This is the turn that invented an access code on the 6T: it must wait, not go to the model. */
    expect(planDocsTurn({ strict: false, ...mid })).toEqual({ kind: "wait" });

    const waited = library.whenAttachmentsRead("chat-1");
    let done = false;
    void waited.then(() => (done = true));
    await new Promise((r) => setTimeout(r, 20));
    expect(done).toBe(false);

    const release = hold as unknown as () => void;
    hold = null;
    release();
    await waited;
    await settle(library);

    const after = library.attachmentState("chat-1");
    expect(after.indexing).toBe(false);
    expect(after.hasIndex).toBe(true);
    expect(planDocsTurn({ strict: false, ...after })).toEqual({ kind: "retrieve" });
  });

  it("a scan that was never OCR'd is reported as needs-ocr, so the turn says so instead of answering", async () => {
    const library = new DocumentLibrary();
    await attach(library, "chat-1", "scan.txt", "");
    await settle(library);

    const state = library.attachmentState("chat-1");
    expect(state.hasIndex).toBe(false);
    expect(state.indexing).toBe(false);
    expect(state.blocked).toBe("needs-ocr");
    expect(planDocsTurn({ strict: false, ...state })).toEqual({ kind: "refuse", messageKey: "documents.needsOcr" });
  });

  it("names the missing index model when nothing could be embedded", async () => {
    embedderMissing = true;
    const library = new DocumentLibrary();
    await attach(library, "chat-1", "handbook.txt", "the access code is ZR-4471-QX");
    await settle(library);

    const state = library.attachmentState("chat-1");
    expect(state.blocked).toBe("no-embedder");
    expect(planDocsTurn({ strict: false, ...state })).toEqual({ kind: "refuse", messageKey: "documents.needsIndexModel" });
  });

  it("a chat with no attachment is untouched: no wait, no refusal", async () => {
    const library = new DocumentLibrary();
    await attach(library, "other-chat", "handbook.txt", "the access code is ZR-4471-QX");
    await settle(library);

    const state = library.attachmentState("chat-1");
    expect(state).toEqual({ hasAttachment: false, hasIndex: false, indexing: false, blocked: null, reading: 0 });
    expect(planDocsTurn({ strict: false, ...state })).toEqual({ kind: "model" });
    await expect(library.whenAttachmentsRead("chat-1")).resolves.toBeUndefined();
  });

  it("an aborted turn stops waiting", async () => {
    const library = new DocumentLibrary();
    hold = () => undefined;
    await attach(library, "chat-1", "handbook.txt", "the access code is ZR-4471-QX");
    expect(library.attachmentState("chat-1").indexing).toBe(true);

    const ac = new AbortController();
    const waited = library.whenAttachmentsRead("chat-1", ac.signal);
    ac.abort();
    await expect(waited).resolves.toBeUndefined();

    const release = hold as unknown as () => void;
    hold = null;
    release();
    await settle(library);
  });
});
