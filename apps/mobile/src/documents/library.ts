import {
  EmbedLanes,
  ExtractError,
  Retriever,
  assertImportable,
  buildRagPrompt,
  chunkFor,
  citationsForAnswer,
  embedBudget,
  indexDocument,
  isRelevant,
  relevanceDoors,
  needsReindex,
  newId,
  reindexFrom,
  vectorsValidUpTo,
  isSearchable as searchable,
  type Citation,
  type DocumentRecord,
  type EmbeddingStore,
  type IndexProgress,
  type Message,
  type OpenedDocument,
  type RagPrompt,
  type TextExtractor,
} from "@inborn/core";
import { MemoryEmbeddingStore, SplitEmbeddingStore } from "@inborn/core";
import { openRagStore, ragStoreKind } from "./db";
import { EMBED_MODEL_ID, resolveEmbedder, type ResolvedEmbedder } from "./embedder";
import { createExtractors, nativeOcr } from "./extract";
import { findDuplicate } from "./dedupe";
import { copyIntoLibrary, deleteFile, missingSource, readHead, resolveDocUri, sha256Of, sizeOf, storedDocPath, sweepIncognitoFiles } from "./files";
import { readPrefs, writePrefs, type DocumentPrefs } from "./prefs";
/* The gate owns the reasons, so a new one cannot be reported here and go unhandled there. */
import type { AttachmentBlock } from "../lib/docsGate";

/** Free tier attaches one file of up to 20 pages (spec §7.3); Pro indexes everything, page by page. */
export const FREE_PAGE_CAP = 20;
/** Attachment keys with this prefix (incognito chats, chats not created yet) live in RAM only (§5.7). */
export const RAM_ATTACH_PREFIX = "ram:";

export type EmbedderStatus = { kind: "ready"; path: string } | { kind: "missing" } | { kind: "loading" } | { kind: "failed"; error: string };

export interface AttachmentState {
  hasAttachment: boolean;
  hasIndex: boolean;
  /** At least one attached document is queued or still being read. */
  indexing: boolean;
  blocked: AttachmentBlock;
  /** How many attached documents are still being read, for the "reading your documents" notice. */
  reading: number;
}

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
  /** Set when some searched documents are still being rebuilt for a new embedder, for "Still re-indexing N of M documents". */
  reindexing?: { pending: number; total: number };
}


/** A pending or running indexing job. */
interface Job {
  abort: AbortController;
  ocr: boolean;
  /** "rebuild" re-embeds a document already searchable for a new embedder; "read" is a first read or a user's resume. */
  kind: "read" | "rebuild";
}

/**
 * The document library (spec §5.5, S40): import → extract → (OCR) → chunk → embed → store, one document at a time,
 * with cancel/resume, strict mode, per-chat attachments and the retrieval + prompt for a question.
 */
export class DocumentLibrary {
  private store: EmbeddingStore | null = null;
  private extractors: TextExtractor[] = createExtractors();
  private embedderRef: ResolvedEmbedder | null = null;
  /* Questions and the index queue share the one embedder; a question never waits behind the queue (QA F353). */
  private lanes: EmbedLanes | null = null;
  private retriever: Retriever | null = null;
  private docs = new Map<string, DocumentRecord>();
  private progress = new Map<string, IndexProgress>();
  private jobs = new Map<string, Job>();
  private queue: string[] = [];
  private running = false;
  private listeners = new Set<() => void>();
  private prefs: DocumentPrefs = readPrefs();
  /* §5.7: a document added inside an incognito session is owned by RAM for as long as the session lasts. */
  private ram = new MemoryEmbeddingStore();
  private ramDocs = new Set<string>();
  private booted: Promise<void> | null = null;
  private storeKind: string = ragStoreKind();
  embedder: EmbedderStatus = { kind: "loading" };

  ready(): Promise<void> {
    return (this.booted ??= this.boot());
  }

  private async boot(): Promise<void> {
    /* A session killed mid-incognito cannot run endSession; its copy is deleted here before anything else opens (§5.7, F95). */
    const orphans = sweepIncognitoFiles();
    if (orphans) console.log(`[documents] swept ${orphans} incognito file(s) left by a previous run`);
    let saved: EmbeddingStore;
    try {
      saved = await openRagStore();
    } catch (e: unknown) {
      console.warn("[documents] store unavailable, keeping the index in memory for this run", e);
      saved = new MemoryEmbeddingStore();
      this.storeKind = "memory";
    }
    this.store = new SplitEmbeddingStore(saved, this.ram, (id) => this.ramDocs.has(id));
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
    this.lanes = resolved ? new EmbedLanes(resolved.embedder) : null;
    this.retriever = null;
    this.embedder = resolved ? { kind: "ready", path: resolved.path } : { kind: "missing" };
    this.reindexStale();
    this.notify();
  }

  /**
   * A document whose vectors came from another embedder is rebuilt with this one on the first open after the update;
   * with no embedder yet it waits as "no-embedder", which the chat already turns into "install the document index".
   */
  private reindexStale(): void {
    const current = this.embedderRef?.embedder.id ?? EMBED_MODEL_ID;
    for (const doc of this.docs.values()) {
      if (this.jobs.has(doc.id)) continue;
      const stale = needsReindex(doc, current);
      const waiting = doc.status === "failed" && doc.error === "no-embedder";
      /* A rebuild stopped by a kill or the background resumes at its last committed page, not from zero. */
      const unfinished = !stale && !!doc.reindexFrom;
      if (!stale && !unfinished && !(waiting && this.embedderRef)) continue;
      const ocr = doc.ocrPages > 0;
      const fresh = stale ? reindexFrom(doc) : doc;
      if (this.embedderRef) {
        this.commit(fresh);
        this.enqueue(doc.id, ocr, undefined, "rebuild");
      } else {
        /* Without an embedder no question can be searched at all, so the old rows are not offered as an index. */
        const waiting: DocumentRecord = { ...fresh, status: "failed", error: "no-embedder" };
        delete waiting.reindexFrom;
        this.commit(waiting);
      }
    }
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

  /**
   * What this chat's attachments can offer the turn about to be sent, read live rather than from a render snapshot
   * (QA F125/F126: the Chat screen's copy is one render behind the import that queued the job).
   */
  attachmentState(chatId: string): AttachmentState {
    const docs = this.attachedTo(chatId);
    /* A document being rebuilt for a new embedder is answered from meanwhile; only a first read is waited for (QA F353). */
    const reading = docs.filter((d) => (this.jobs.has(d.id) || d.status === "queued" || d.status === "indexing") && !d.reindexFrom);
    const indexing = reading.length > 0;
    const hasIndex = docs.some(searchable);
    const unread = docs.filter((d) => !searchable(d));
    const blocked: AttachmentBlock =
      hasIndex || indexing
        ? null
        : this.embedder.kind === "missing"
          ? "no-embedder"
          : /* A picture holds no text to index; the answer is the Photo button, not OCR, whether or not OCR already ran. */
            unread.length > 0 && unread.every((d) => d.kind === "image")
            ? "image"
            : docs.some((d) => d.status === "needs-ocr")
              ? "needs-ocr"
              : /* Reading is over and nothing came out: an unreadable scan holds no source, so the turn must not go out as if it did (QA F302). */
                unread.length > 0
                ? "no-text"
                : null;
    return { hasAttachment: docs.length > 0, hasIndex, indexing, blocked, reading: reading.length };
  }

  /** Resolves once nothing attached to this chat is queued or being read, so the answer can see what the user attached. */
  whenAttachmentsRead(chatId: string, signal?: AbortSignal): Promise<void> {
    if (!this.attachmentState(chatId).indexing || signal?.aborted) return Promise.resolve();
    return new Promise((resolve) => {
      const done = () => {
        off();
        signal?.removeEventListener("abort", done);
        resolve();
      };
      const off = this.subscribe(() => {
        if (!this.attachmentState(chatId).indexing) done();
      });
      signal?.addEventListener("abort", done, { once: true });
    });
  }

  // ---- import -------------------------------------------------------------------

  /** Copies the file in, sniffs it, records it and queues indexing. Failures are recorded on the document, never thrown. */
  async importFile(sourceUri: string, name: string, opts: { ocr?: boolean; pageCap?: number; incognito?: boolean } = {}): Promise<DocumentRecord> {
    await this.ready();
    const id = newId();
    /* Claimed before the first write: every putDocument and putChunks for this id then routes to RAM (§5.7). */
    if (opts.incognito) this.ramDocs.add(id);
    const bytes = sizeOf(sourceUri);
    const base: DocumentRecord = { id, name, kind: "unknown", bytes, pages: 0, addedAt: Date.now(), status: "queued", indexedPages: 0, chunkCount: 0, flaggedLines: 0, ocrPages: 0 };
    let doc: DocumentRecord;
    try {
      /* Asked before the size, because a source that is not there and a source of 0 bytes are the same 0 (QA F277). */
      if (missingSource(sourceUri)) throw new ExtractError("missing", `${name}: nothing to read at ${sourceUri}`);
      const kind = assertImportable(name, bytes, readHead(sourceUri));
      const uri = copyIntoLibrary(sourceUri, id, name, { incognito: opts.incognito });
      /* File.copy() can return before Android has written every byte (vault D5); the hash must cover the whole file. */
      for (let i = 0; sizeOf(uri) < bytes && i < 100; i++) await new Promise((r) => setTimeout(r, 50));
      const sha256 = await sha256Of(uri);
      /* The same file picked twice is one document (models run D16): keep the indexed copy, drop the new one. */
      const twin = findDuplicate(this.docs.values(), sha256, bytes);
      if (twin) {
        if (uri !== twin.uri) deleteFile(uri);
        /* A twin that never got an index is read again here: adding the file a second time is what a user does about it,
           and before this it was the one action that could not help (QA F138). OCR stays a decision the user makes. */
        if (twin.chunkCount === 0 && twin.status !== "needs-ocr") this.resume(twin.id, { ocr: opts.ocr ?? false });
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

  private enqueue(id: string, ocr: boolean, pageCap?: number, kind: "read" | "rebuild" = "read"): void {
    if (this.jobs.has(id)) return;
    this.jobs.set(id, { abort: new AbortController(), ocr, kind });
    const doc = this.docs.get(id);
    if (doc && doc.status !== "queued") this.commit({ ...doc, status: "queued" });
    if (pageCap) this.pageCaps.set(id, pageCap);
    else this.pageCaps.delete(id);
    /* A file the user just added is read before the rebuilds still waiting: its turn waits for it, theirs does not. */
    const firstRebuild = kind === "read" ? this.queue.findIndex((q) => this.jobs.get(q)?.kind === "rebuild") : -1;
    if (firstRebuild >= 0) this.queue.splice(firstRebuild, 0, id);
    else this.queue.push(id);
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
        /* The job outlives its last commit, so a turn waiting on "nothing is being read any more" needs this one. */
        this.notify();
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
      /* A rebuild of a scan re-reads it with OCR from its committed page; only a user's "Run OCR" starts over. */
      doc: job.ocr && !doc.reindexFrom ? { ...doc, indexedPages: 0, chunkCount: 0, ocrPages: 0, flaggedLines: 0 } : doc,
      opened,
      embedder: this.lanes!.index,
      store,
      ocr,
      signal: job.abort.signal,
      maxPages: this.pageCaps.get(id),
      chunk: chunkFor(this.embedderRef.contextTokens),
      onProgress: (p) => {
        this.progress.set(id, p);
        const current = this.docs.get(id);
        if (current) this.docs.set(id, { ...current, status: "indexing", indexedPages: p.page, pages: p.pages, chunkCount: p.chunks });
        /* A rebuilt page moves from word-only to full search; the next question loads it. */
        if (current?.reindexFrom && p.phase === "store") this.retriever?.invalidate();
        this.notify();
      },
    });
    await opened.close().catch(() => undefined);
    const pages = Math.max(1, result.indexedPages);
    console.log(`[documents] ${doc.name}: ${result.status}${result.error ? ` (${result.error})` : ""} · ${result.indexedPages}/${result.pages} pages · ${result.chunkCount} chunks · ${Date.now() - started} ms (${Math.round((Date.now() - started) / pages)} ms/page)`);
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
    this.enqueue(id, opts.ocr ?? false, undefined, doc.reindexFrom && !opts.ocr ? "rebuild" : "read");
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

  /** True while this document exists only in RAM, because it was added inside an incognito session. */
  isIncognito(id: string): boolean {
    return this.ramDocs.has(id);
  }

  /**
   * The incognito session ended (§5.7): every document it held goes, with its temporary file, its chunks and its
   * vectors. Nothing of it reached the library or the database; the copy the extractor read lived in the cache.
   */
  endSession(): void {
    if (!this.ramDocs.size) return;
    for (const id of this.ramDocs) {
      this.cancel(id);
      deleteFile(this.docs.get(id)?.uri);
      this.docs.delete(id);
      this.progress.delete(id);
      for (const chatId of Object.keys(this.prefs.attachments)) this.detach(chatId, id);
    }
    this.ramDocs.clear();
    this.ram.clear();
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
    if (!this.store || !this.embedderRef || !this.lanes) throw new Error("no-embedder");
    const retriever = (this.retriever ??= new Retriever(this.store, this.lanes.query, embedBudget(this.embedderRef.contextTokens)));
    const indexed = this.state().documents.filter(searchable);
    const docIds = o.docIds?.length ? o.docIds.filter((id) => { const d = this.docs.get(id); return !!d && searchable(d); }) : indexed.map((d) => d.id);
    const rebuilding = docIds.map((id) => this.docs.get(id)!).filter((d) => d.reindexFrom);
    const vectorPages = Object.fromEntries(rebuilding.map((d) => [d.id, vectorsValidUpTo(d)]));
    const started = Date.now();
    const hits = docIds.length ? await retriever.retrieve(question, { docIds, vectorPages }) : [];
    const retrieveMs = Date.now() - started;
    const strict = o.strict ?? this.prefs.strict;
    const embedderId = this.embedderRef.embedder.id;
    const doors = relevanceDoors(embedderId);
    const prompt = buildRagPrompt({ question, hits, docs: this.docs, strict, embedderId, nCtx: o.nCtx ?? 4096, history: o.history, systemPrompt: o.systemPrompt, answerLanguage: o.answerLanguage, citeMarkers: o.citeMarkers });
    /* Not behind __DEV__: F282 was a release build citing an off-topic passage, and no screen prints the two numbers that decided it. */
    console.log(`[rag] strict=${strict}${rebuilding.length ? ` reindexing=${rebuilding.length}/${docIds.length}` : ""} hits=${hits.length} used=${prompt.used.length} ${retrieveMs} ms | ${hits.map((h) => `${h.chunk.docId}#${h.chunk.ord} cos=${h.cosine.toFixed(3)} terms=${h.bm25Terms} bm25=${h.bm25.toFixed(2)} ${isRelevant(h, doors) ? "KEPT" : "dropped"}`).join(" · ")}`);
    return { prompt, retrieveMs, ...(rebuilding.length ? { reindexing: { pending: rebuilding.length, total: docIds.length } } : {}) };
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

/** After Delete everything the next caller boots a library from the emptied store, not the old in-memory list. */
export function resetLibrary(): void {
  shared = null;
}
