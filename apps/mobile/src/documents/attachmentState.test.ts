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
vi.mock("./embedder", () => ({ EMBED_MODEL_ID: "embed-e5", resolveEmbedder: () => (embedderMissing ? null : { path: "/embed.gguf", embedder: hashEmbedder(64), contextTokens: 512 }) }));
vi.mock("./extract", () => ({
  nativeOcr: () => null,
  createExtractors: (): TextExtractor[] => [
    {
      supports: (kind: DocKind) => kind === "txt" || kind === "image" || kind === "pdf",
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
  missingSource: () => false,
  sweepIncognitoFiles: () => 0,
  deleteFile: (uri: string | undefined) => void (uri && files.delete(uri)),
  readHead: (uri: string) => new TextEncoder().encode(/\.pdf$/.test(uri) ? "%PDF-1.4" : "plain text"),
  resolveDocUri: (uri: string) => uri,
  /* Content-addressed like the real one, so importing the same file twice really is a duplicate. */
  sha256Of: async (uri: string) => `sha-${files.get(uri) ?? uri}`,
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

  it("a photo attached as a file is reported as a picture, not as a scan to OCR", async () => {
    /* On the 6T, OCR on door.jpg finished "empty · 0 chunks": a door has no text, so OCR is a dead end and the Photo button is not. */
    const library = new DocumentLibrary();
    await attach(library, "chat-1", "door.jpg", "");
    await settle(library);

    const state = library.attachmentState("chat-1");
    expect(state.hasIndex).toBe(false);
    expect(state.blocked).toBe("image");
    expect(planDocsTurn({ strict: false, ...state })).toEqual({ kind: "refuse", messageKey: "documents.photoNotText" });
  });

  it("a scan that was never OCR'd is reported as needs-ocr, so the turn says so instead of answering", async () => {
    const library = new DocumentLibrary();
    await attach(library, "chat-1", "scan.pdf", "");
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

describe("adding the same file again (QA F139)", () => {
  it("reads a twin that has no passages instead of handing back the dead record", async () => {
    embedderMissing = true;
    const library = new DocumentLibrary();
    const first = await attach(library, "chat-1", "handbook.txt", "the access code is ZR-4471-QX");
    await settle(library);
    expect(library.attachmentState("chat-1").hasIndex).toBe(false);

    /* The user installs the index model and adds the file again, which is the only move the app offers them. */
    embedderMissing = false;
    await library.refreshEmbedder();
    const again = await attach(library, "chat-1", "handbook.txt", "the access code is ZR-4471-QX");
    expect(again.id).toBe(first.id);
    await settle(library);

    const state = library.attachmentState("chat-1");
    expect(state.hasIndex).toBe(true);
    expect(planDocsTurn({ strict: false, ...state })).toEqual({ kind: "retrieve" });
  });

  it("leaves an indexed twin alone: adding it again does not re-read it", async () => {
    const library = new DocumentLibrary();
    const first = await attach(library, "chat-1", "handbook.txt", "the access code is ZR-4471-QX");
    await settle(library);
    const chunks = library.state().documents.find((d) => d.id === first.id)?.chunkCount;
    expect(chunks).toBeGreaterThan(0);

    const again = await attach(library, "chat-1", "handbook.txt", "the access code is ZR-4471-QX");
    expect(again.id).toBe(first.id);
    expect(library.attachmentState("chat-1").indexing).toBe(false);
    expect(library.state().documents.find((d) => d.id === first.id)?.chunkCount).toBe(chunks);
  });

  it("does not re-read a scan: OCR stays the user's decision", async () => {
    const library = new DocumentLibrary();
    const first = await attach(library, "chat-1", "scan.txt", "");
    await settle(library);
    expect(library.attachmentState("chat-1").blocked).toBe("needs-ocr");

    await attach(library, "chat-1", "scan.txt", "");
    expect(library.state().documents.find((d) => d.id === first.id)?.status).toBe("needs-ocr");
    expect(library.attachmentState("chat-1").blocked).toBe("needs-ocr");
  });
});

/**
 * F302. A file read to the end that carried no text looked exactly like a file we failed to read: `blocked` was
 * `null` for both, so the chat gave the vague "Inborn has not read it" line, and the library row called an empty
 * index "Indexed". The state now has its own name, and the refusal says what to do about it.
 */
describe("F302 · a document with no readable text is its own state", () => {
  it("names the state instead of leaving it unknown, and the turn is refused with that line", async () => {
    const library = new DocumentLibrary();
    /* Whitespace has a text layer, so OCR is not the answer: the file is simply empty of readable text. */
    const doc = await attach(library, "chat-1", "unreadable-scan.pdf", "   \n  \n");
    await settle(library);
    const record = library.state().documents.find((d) => d.id === doc.id)!;
    expect(record.chunkCount).toBe(0);

    const state = library.attachmentState("chat-1");
    expect(state).toMatchObject({ hasAttachment: true, hasIndex: false, indexing: false, blocked: "no-text" });
    expect(planDocsTurn({ strict: false, ...state })).toEqual({ kind: "refuse", messageKey: "documents.noText" });
    /* The complement that matters: it is never sent to the model, in either mode. */
    for (const strict of [true, false]) expect(planDocsTurn({ strict, ...state }).kind).not.toBe("model");
  });

  it("a scan that still needs OCR keeps its own, different answer", async () => {
    const library = new DocumentLibrary();
    await attach(library, "chat-1", "scan.txt", "");
    await settle(library);
    expect(library.attachmentState("chat-1").blocked).toBe("needs-ocr");
    expect(planDocsTurn({ strict: false, ...library.attachmentState("chat-1") })).toEqual({ kind: "refuse", messageKey: "documents.needsOcr" });
  });
});
