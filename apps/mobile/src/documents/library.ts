import {
  Retriever,
  assertImportable,
  buildRagPrompt,
  citationsForAnswer,
  indexDocument,
  newId,
  type Citation,
  type DocumentRecord,
  type EmbeddingStore,
  type ExtractError,
  type IndexProgress,
  type Message,
  type OpenedDocument,
  type RagPrompt,
  type TextExtractor,
} from "@inborn/core";
import { openRagStore, ragStoreKind } from "./db";
import { resolveEmbedder, type ResolvedEmbedder } from "./embedder";
import { createExtractors, nativeOcr } from "./extract";
import { findDuplicate } from "./dedupe";
import { copyIntoLibrary, deleteFile, readHead, resolveDocUri, sha256Of, sizeOf, storedDocPath } from "./files";
import { readPrefs, writePrefs, type DocumentPrefs } from "./prefs";

/** Free tier attaches one file of up to 20 pages (spec §7.3); Pro indexes everything, page by page. */
export const FREE_PAGE_CAP = 20;
/** Attachment keys with this prefix (incognito chats, chats not created yet) live in RAM only (§5.7). */
export const RAM_ATTACH_PREFIX = "ram:";

export type EmbedderStatus = { kind: "ready"; path: string } | { kind: "missing" } | { kind: "loading" } | { kind: "failed"; error: string };

export interface LibraryState {
  documents: DocumentRecord[];
  progress: Map<string, IndexProgress>;
  embedder: EmbedderStatus;
  strict: boolean;
  attachments: Record<string, string[]>;
  storeKind: string;
  redactNames: string[];
  redactDates: boolean;
}

/** Instant never places [n] marks (models run D15); every larger tier and import is asked to. */
export const canCiteMarkers = (modelId: string | undefined): boolean => modelId !== "instant";

export interface AskOptions {
  docIds?: string[];
  strict?: boolean;
  history?: Message[];
  nCtx?: number;
  systemPrompt?: string;
  answerLanguage?: string;
  /** False for Instant: it never places [n] marks, so the prompt does not ask and the chips show as plain sources (models run D15). */
  citeMarkers?: boolean;
}

export interface AskResult {
  prompt: RagPrompt;
  /** Milliseconds spent embedding the question and ranking. */
  retrieveMs: number;
}

/** A pending or running indexing job. */
interface Job {
  abort: AbortController;
  ocr: boolean;
}

/**
 * The document library (spec §5.5, S40): import → extract → (OCR) → chunk → embed → store, one document at a time,
 * with cancel/resume, strict mode, per-chat attachments and the retrieval + prompt for a question.
 */
export class DocumentLibrary {
  private store: EmbeddingStore | null = null;
  private extractors: TextExtractor[] = createExtractors();
  private embedderRef: ResolvedEmbedder | null = null;
  private retriever: Retriever | null = null;
  private docs = new Map<string, DocumentRecord>();
  private progress = new Map<string, IndexProgress>();
  private jobs = new Map<string, Job>();
  private queue: string[] = [];
  private running = false;
  private listeners = new Set<() => void>();
  private prefs: DocumentPrefs = readPrefs();
  private booted: Promise<void> | null = null;
  private storeKind: string = ragStoreKind();
  embedder: EmbedderStatus = { kind: "loading" };

  ready(): Promise<void> {
    return (this.booted ??= this.boot());
  }

  private async boot(): Promise<void> {
    try {
      this.store = await openRagStore();
    } catch (e: unknown) {
      console.warn("[documents] store unavailable, keeping the index in memory for this run", e);
      const { MemoryEmbeddingStore } = await import("@inborn/core");
      this.store = new MemoryEmbeddingStore();
      this.storeKind = "memory";
    }
    for (const d of await this.store.listDocuments()) {
      /* A crash mid-index leaves "indexing"; it resumes from the committed page on the next tap. */
      const doc = d.status === "indexing" ? { ...d, status: "cancelled" as const } : d;
      const uri = doc.uri ? storedDocPath(doc.uri) : doc.uri;
      /* Records written before round 9 hold an absolute URI of a container that may be gone (QA F11); re-based once, then kept relative. */
      if (uri !== doc.uri) {
        const migrated = { ...doc, uri };
        this.docs.set(d.id, migrated);
        void this.store.putDocument(migrated);
      } else this.docs.set(d.id, doc);
    }
    await this.refreshEmbedder();
    this.notify();
    const mod = await import("./embedder");
    /* The model can land or leave from the vault screen or a dev hook; without this the first ask kept failing with `no-embedder` until a relaunch (and a removal kept "ready", QA O9). */
    if ("watchEmbedder" in mod) (mod as { watchEmbedder: (cb: () => void) => void }).watchEmbedder(() => void this.refreshEmbedder());
  }

  async refreshEmbedder(): Promise<void> {
    const mod = await import("./embedder");
    const resolved = "resolveEmbedderAsync" in mod ? await (mod as { resolveEmbedderAsync: () => Promise<ResolvedEmbedder | null> }).resolveEmbedderAsync() : resolveEmbedder();
    const previous = this.embedderRef;
    if (previous && previous.path !== resolved?.path) void previous.embedder.unload().catch(() => undefined);
    this.embedderRef = resolved;
    this.retriever = null;
    this.embedder = resolved ? { kind: "ready", path: resolved.path } : { kind: "missing" };
    this.notify();
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => void this.listeners.delete(listener);
  }

  private notify(): void {
    for (const l of this.listeners) l();
  }

  state(): LibraryState {
    return { documents: [...this.docs.values()].sort((a, b) => b.addedAt - a.addedAt), progress: this.progress, embedder: this.embedder, strict: this.prefs.strict, attachments: this.prefs.attachments, storeKind: this.storeKind, redactNames: this.prefs.redactNames, redactDates: this.prefs.redactDates };
  }

  document(id: string): DocumentRecord | undefined {
    return this.docs.get(id);
  }

  // ---- preferences -------------------------------------------------------------

  private savePrefs(): void {
    const attachments = Object.fromEntries(Object.entries(this.prefs.attachments).filter(([k]) => !k.startsWith(RAM_ATTACH_PREFIX)));
    writePrefs({ ...this.prefs, attachments });
  }

  setStrict(v: boolean): void {
    this.prefs.strict = v;
    this.savePrefs();
    this.notify();
  }

  setRedactNames(names: string[]): void {
    this.prefs.redactNames = [...new Set(names.map((n) => n.trim()).filter((n) => n.length >= 2))];
    this.savePrefs();
    this.notify();
  }

  setRedactDates(v: boolean): void {
    this.prefs.redactDates = v;
    this.savePrefs();
    this.notify();
  }

  attach(chatId: string, docId: string): void {
    const list = this.prefs.attachments[chatId] ?? [];
    if (!list.includes(docId)) this.prefs.attachments[chatId] = [...list, docId];
    this.savePrefs();
    this.notify();
  }

  detach(chatId: string, docId: string): void {
    const list = this.prefs.attachments[chatId] ?? [];
    this.prefs.attachments[chatId] = list.filter((d) => d !== docId);
    if (!this.prefs.attachments[chatId]?.length) delete this.prefs.attachments[chatId];
    this.savePrefs();
    this.notify();
  }

  /** The first message creates the chat: what was attached under the draft key follows it to the real id. */
  moveAttachments(from: string, to: string): void {
    const list = this.prefs.attachments[from];
    delete this.prefs.attachments[from];
    if (list?.length) this.prefs.attachments[to] = [...new Set([...(this.prefs.attachments[to] ?? []), ...list])];
    this.savePrefs();
    this.notify();
  }

  detachAll(chatId: string): void {
    if (!this.prefs.attachments[chatId]) return;
    delete this.prefs.attachments[chatId];
    this.savePrefs();
    this.notify();
  }

  attachedTo(chatId: string): DocumentRecord[] {
    return (this.prefs.attachments[chatId] ?? []).map((id) => this.docs.get(id)).filter((d): d is DocumentRecord => !!d);
  }

  // ---- import -------------------------------------------------------------------

  /** Copies the file in, sniffs it, records it and queues indexing. Failures are recorded on the document, never thrown. */
  async importFile(sourceUri: string, name: string, opts: { ocr?: boolean; pageCap?: number } = {}): Promise<DocumentRecord> {
    await this.ready();
    const id = newId();
    const bytes = sizeOf(sourceUri);
    const base: DocumentRecord = { id, name, kind: "unknown", bytes, pages: 0, addedAt: Date.now(), status: "queued", indexedPages: 0, chunkCount: 0, flaggedLines: 0, ocrPages: 0 };
    let doc: DocumentRecord;
    try {
      const kind = assertImportable(name, bytes, readHead(sourceUri));
      const uri = copyIntoLibrary(sourceUri, id, name);
      /* File.copy() can return before Android has written every byte (vault D5); the hash must cover the whole file. */
      for (let i = 0; sizeOf(uri) < bytes && i < 100; i++) await new Promise((r) => setTimeout(r, 50));
      const sha256 = await sha256Of(uri);
      /* The same file picked twice is one document (models run D16): keep the indexed copy, drop the new one. */
      const twin = findDuplicate(this.docs.values(), sha256, bytes);
      if (twin) {
        if (uri !== twin.uri) deleteFile(uri);
        return twin;
      }
      doc = { ...base, kind, uri, sha256 };
    } catch (e: unknown) {
      const reason = (e as Partial<ExtractError>).reason ?? "corrupt";
      if (!(e as Partial<ExtractError>).reason) console.warn("[documents] import failed", e);
      doc = { ...base, status: reason === "empty" ? "empty" : "failed", error: reason };
    }
    this.docs.set(id, doc);
    await this.store!.putDocument(doc);
    this.notify();
    if (doc.status === "queued") this.enqueue(id, opts.ocr ?? false, opts.pageCap);
    return doc;
  }

  // ---- indexing -----------------------------------------------------------------

  private pageCaps = new Map<string, number>();

  private enqueue(id: string, ocr: boolean, pageCap?: number): void {
    if (this.jobs.has(id)) return;
    this.jobs.set(id, { abort: new AbortController(), ocr });
    const doc = this.docs.get(id);
    if (doc && doc.status !== "queued") this.commit({ ...doc, status: "queued" });
    if (pageCap) this.pageCaps.set(id, pageCap);
    else this.pageCaps.delete(id);
    this.queue.push(id);
    void this.pump();
  }

  private async pump(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      while (this.queue.length) {
        const id = this.queue.shift()!;
        const job = this.jobs.get(id);
        if (!job) continue;
        await this.runJob(id, job);
        this.jobs.delete(id);
      }
    } finally {
      this.running = false;
    }
  }

  private async runJob(id: string, job: Job): Promise<void> {
    const doc = this.docs.get(id);
    const store = this.store;
    if (!doc || !store) return;
    if (!this.embedderRef) {
      this.commit({ ...doc, status: "failed", error: "no-embedder" });
      return;
    }
    const extractor = this.extractors.find((x) => x.supports(doc.kind));
    if (!extractor) {
      this.commit({ ...doc, status: "failed", error: "unsupported" });
      return;
    }
    let opened: OpenedDocument & { render?: (index: number) => Promise<string> };
    try {
      opened = await this.openWithRetry(extractor, doc);
    } catch (e: unknown) {
      const reason = (e as Partial<ExtractError>).reason ?? "corrupt";
      this.commit({ ...doc, status: reason === "empty" ? "empty" : "failed", error: reason });
      return;
    }
    const ocrEngine = job.ocr ? nativeOcr() : null;
    const ocr = ocrEngine && opened.render ? { engine: ocrEngine, languages: await ocrEngine.languages(), render: opened.render } : undefined;
    const started = Date.now();
    const result = await indexDocument({
      doc: job.ocr ? { ...doc, indexedPages: 0, chunkCount: 0, ocrPages: 0, flaggedLines: 0 } : doc,
      opened,
      embedder: this.embedderRef.embedder,
      store,
      ocr,
      signal: job.abort.signal,
      maxPages: this.pageCaps.get(id),
      onProgress: (p) => {
        this.progress.set(id, p);
        const current = this.docs.get(id);
        if (current) this.docs.set(id, { ...current, status: "indexing", indexedPages: p.page, pages: p.pages, chunkCount: p.chunks });
        this.notify();
      },
    });
    await opened.close().catch(() => undefined);
    const pages = Math.max(1, result.indexedPages);
    console.log(`[documents] ${doc.name}: ${result.status} · ${result.indexedPages}/${result.pages} pages · ${result.chunkCount} chunks · ${Date.now() - started} ms (${Math.round((Date.now() - started) / pages)} ms/page)`);
    this.progress.delete(id);
    this.commit(result);
    this.retriever?.invalidate();
  }

  /* A copy made a moment ago can still read back as 0 bytes on Android; a non-empty file gets one more try. */
  private async openWithRetry(extractor: TextExtractor, doc: DocumentRecord): Promise<OpenedDocument> {
    const source = { uri: doc.uri ? resolveDocUri(doc.uri) : "", name: doc.name, kind: doc.kind, bytes: doc.bytes };
    try {
      return await extractor.open(source);
    } catch (e: unknown) {
      if ((e as Partial<ExtractError>).reason !== "empty" || doc.bytes === 0) throw e;
      await new Promise((r) => setTimeout(r, 400));
      return extractor.open(source);
    }
  }

  private commit(doc: DocumentRecord): void {
    this.docs.set(doc.id, doc);
    void this.store?.putDocument(doc);
    this.notify();
  }

  cancel(id: string): void {
    this.jobs.get(id)?.abort.abort();
    this.queue = this.queue.filter((q) => q !== id);
  }

  /** Resumes a cancelled/failed document from its committed page (or re-runs a scan with OCR). */
  resume(id: string, opts: { ocr?: boolean } = {}): void {
    const doc = this.docs.get(id);
    if (!doc || this.jobs.has(id)) return;
    this.enqueue(id, opts.ocr ?? false);
  }

  runOcr(id: string): void {
    this.resume(id, { ocr: true });
  }

  async remove(id: string): Promise<void> {
    this.cancel(id);
    const doc = this.docs.get(id);
    this.docs.delete(id);
    this.progress.delete(id);
    for (const chatId of Object.keys(this.prefs.attachments)) this.detach(chatId, id);
    deleteFile(doc?.uri);
    await this.store?.deleteDocument(id);
    this.retriever?.invalidate();
    this.notify();
  }

  /** Releases the embedding context (called when the app goes idle; the next index or question reloads it). */
  async unloadEmbedder(): Promise<void> {
    await this.embedderRef?.embedder.unload();
  }

  // ---- questions ----------------------------------------------------------------

  /** Retrieval + the fenced prompt for a question; `noAnswer` in strict mode means "say not found" without the model. */
  async ask(question: string, o: AskOptions = {}): Promise<AskResult> {
    await this.ready();
    if (!this.store || !this.embedderRef) throw new Error("no-embedder");
    const retriever = (this.retriever ??= new Retriever(this.store, this.embedderRef.embedder));
    const indexed = this.state().documents.filter((d) => d.chunkCount > 0);
    const docIds = o.docIds?.length ? o.docIds.filter((id) => this.docs.get(id)?.chunkCount) : indexed.map((d) => d.id);
    const started = Date.now();
    const hits = docIds.length ? await retriever.retrieve(question, { docIds }) : [];
    const retrieveMs = Date.now() - started;
    const prompt = buildRagPrompt({ question, hits, docs: this.docs, strict: o.strict ?? this.prefs.strict, nCtx: o.nCtx ?? 4096, history: o.history, systemPrompt: o.systemPrompt, answerLanguage: o.answerLanguage, citeMarkers: o.citeMarkers });
    return { prompt, retrieveMs };
  }

  citationsFor(answer: string, citations: Citation[]): { shown: Citation[]; cited: boolean } {
    return citationsForAnswer(answer, citations);
  }

  async passage(chunkId: string): Promise<{ text: string; doc: DocumentRecord | undefined; page: number } | null> {
    const chunk = await this.store?.getChunk(chunkId);
    if (!chunk) return null;
    return { text: chunk.text, doc: this.docs.get(chunk.docId), page: chunk.page };
  }
}

let shared: DocumentLibrary | null = null;
export function getLibrary(): DocumentLibrary {
  return (shared ??= new DocumentLibrary());
}
