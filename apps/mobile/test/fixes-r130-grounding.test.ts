import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildRagPrompt, NOTHING_RELEVANT_RULE, thinPageRule, type Chunk, type DocumentRecord, type RetrievalHit } from "@inborn/core";
import { isThinTurn, pageHits, planPage, type PagePhotoInput } from "../src/documents/pagePhoto";
import { claimsFileContent, HELD_INDEX_WAIT_MS, releaseWhenIndexed } from "../src/lib/docsGate";

const read = (rel: string) => readFileSync(join(__dirname, rel), "utf8");
const chat = read("../src/screens/Chat.tsx");

const doc = (over: Partial<DocumentRecord>): DocumentRecord => ({ id: "d", name: "d.pdf", kind: "pdf", bytes: 1, pages: 1, addedAt: 0, status: "indexed", indexedPages: 1, chunkCount: 1, flaggedLines: 0, ocrPages: 0, uri: "documents/d/d.pdf", ...over });
const shop = doc({ id: "shop", name: "shop.pdf" });
const memo = doc({ id: "memo", name: "memo.pdf" });
const input = (over: Partial<PagePhotoInput>): PagePhotoInput => ({
  ownPhotos: 0,
  limit: 1,
  attached: [shop],
  canRender: true,
  sent: [],
  chars: async (id) => new Map([[1, id === "shop" ? 183 : 157]]),
  bestPage: async () => null,
  ink: async (d) => (d.id === "shop" ? 0.272 : 0.003),
  ...over,
});

const chunk = (id: string, page: number, ord: number, text: string): Chunk => ({ id, docId: "shop", page, ord, text, start: 0, end: text.length, tokens: 8 });
const hit = (c: Chunk): RetrievalHit => ({ chunk: c, score: 0.5, cosine: 0.9, bm25: 2, bm25Terms: 2 });

describe("round 130 · one rule for every file: text, plus the page picture when the page is visual and the model can see", () => {
  it("a visual page with a model that can see: the picture goes, and the turn is not a thin one", async () => {
    const plan = await planPage(input({}));
    expect(plan).toMatchObject({ picture: true, visual: true, chars: 183 });
    expect(isThinTurn(plan)).toBe(false);
  });

  it("'Remove the photo' on the hold card (a model that cannot see): no picture, the page's text under the thin-page rule", async () => {
    const plan = await planPage(input({ declined: true }));
    expect(plan).toMatchObject({ picture: false, visual: true });
    expect(isThinTurn(plan)).toBe(true);
    expect(chat).toMatch(/const dropAllPhotos = \(\) => \{[^}]*if \(pageHeld\) pageDeclined\.current = true;/);
    expect(chat).toContain("declined: pageDeclined.current,");
  });

  it("a short page of plain text (a memo) is neither a picture nor a thin page: its question is answered as today", async () => {
    const plan = await planPage(input({ attached: [memo] }));
    expect(plan).toMatchObject({ picture: false, visual: false });
    expect(isThinTurn(plan)).toBe(false);
  });

  it("the thin page's own text goes in whole, in reading order, ahead of other passages that bear on the question", () => {
    const own = [chunk("b", 1, 1, "Continue to checkout"), chunk("a", 1, 0, "Free shipping over 150")];
    const other = hit(chunk("c", 2, 2, "Returns within 30 days"));
    const hits = pageHits([...own, chunk("z", 2, 3, "unrelated")], 1, [hit(own[0]!), other]);
    expect(hits.map((h) => h.chunk.id)).toEqual(["a", "b", "c"]);
  });

  it("the thin-page rule tells the model what it has and that it cannot see the pictures, and never to describe one", () => {
    const docs = new Map([["shop", shop]]);
    const hits = [hit(chunk("a", 1, 0, "Free shipping over 150"))];
    const openers = { nothingRelevant: "Tus documentos no mencionan esto.", nothingFits: "x", thinPage: "Solo puedo leer el texto de esta página, no sus imágenes." };
    const thin = buildRagPrompt({ question: "¿Qué ves?", hits, docs, strict: false, nCtx: 4096, overview: true, thinPage: true, openers, nonce: "k" });
    expect(thin.messages[0]!.content).toContain(thinPageRule(openers.thinPage));
    expect(thinPageRule("I can read only the text of this page, not its pictures.")).toContain(
      `If the question is about what the page shows, start with "I can read only the text of this page, not its pictures." Then tell what that text says. Never describe a picture.`,
    );
    expect(thin.used).toHaveLength(1);
    const plain = buildRagPrompt({ question: "What do you see?", hits, docs, strict: false, nCtx: 4096, overview: true, nonce: "k" });
    expect(plain.messages[0]!.content).not.toContain("Never describe a picture.");
  });

  it("the chat routes a thin page through the library's page option, only when the page picture is not already in the chat", () => {
    expect(chat).toContain("const thinPage = !existingMessageId && !seesPage && isThinTurn(page) ? { docId: page.doc.id, page: page.page } : undefined;");
    expect(chat).toContain("docs.buildPrompt(lastUser, history.slice(0, lastUserAt), nCtx, system, photoDocIds, thinPage)");
    expect(read("../src/documents/library.ts")).toContain("overview: overview || !!thin, openers: o.openers, thinPage: !!thin");
  });
});

describe("round 130 · files attached and nothing matched: the answer never says what the file states", () => {
  it("the thin-page opener is a quoted sentence in the user's language, in every locale", async () => {
    expect(read("../src/lib/docsGate.ts")).toContain('thinPage: t("documents.opener.thinPage")');
    for (const loc of ["en", "de", "es", "fr", "ja", "ko", "pt-BR", "zh-Hant", "pseudo"])
      expect(JSON.parse(read(`../../../packages/i18n/locales/${loc}.json`))["documents.opener.thinPage"]).toBeTruthy();
  });

  it("the no-passage rule says the files were searched, forbids telling what they say, and lets an unsure model stop after the opener", () => {
    expect(NOTHING_RELEVANT_RULE).toBe(`The user's files were searched and nothing in them matched, so never say what they state or contain. If you do not know the answer for sure, say only the opening sentence. Start with "Your documents don't mention this."`);
    expect(NOTHING_RELEVANT_RULE).not.toContain("and then answer the question");
  });

  it("the invented answers measured on Instant are caught; denials and general answers are not", () => {
    for (const invented of [
      "The report states that the turbine is designed to generate electricity efficiently.",
      "The report indicates that the turbine's design was optimized to minimize energy loss.",
      "The provided document outlines three primary safety recommendations.",
      "The handbook states that fire drills should be conducted without preparation.",
      "This handbook was authored by Dr. Richard Nixon in 1971.",
      "My documents only mention general safety measures like proper ventilation.",
    ])
      expect(claimsFileContent(invented)).toBe(true);
    for (const honest of [
      "Your documents don't mention this.",
      "Your documents do not mention fire drills in the provided text.",
      "The report does not mention any safety recommendations.",
      "Your documents don't mention this. Fire drills are usually held once a month.",
      "The serial number of the Rakovsky turbine is RK-4417.",
      "Your documents do not mention this. The provided text contains no information regarding a specific turbine.",
      "Your documents don't mention this. I cannot know what the report says about a specific turbine without access to its content.",
    ])
      expect(claimsFileContent(honest)).toBe(false);
  });

  it("the chat replaces such an answer only when no passage and no page picture stood behind it", () => {
    expect(chat).toContain("if (!ragUsed.length && !existingMessageId && !familySafeReplaced && docs.documents.length > 0 && !messages.some((m) => m.images?.length) && claimsFileContent(reply)) {");
    expect(chat).toMatch(/claimsFileContent\(reply\)\) \{\s*reply = t\("documents\.opener\.nothingRelevant"\);/);
  });
});

describe("round 130 · a turn held for the index model waits for its files to be indexed with it", () => {
  afterEach(() => vi.useRealTimers());

  it("the bug: the effect sent the held message the moment the index model was ready, with the file still rebuilding", () => {
    const effect = chat.slice(chat.indexOf('if (!docsHold || libraryState.embedder.kind !== "ready") return;'), chat.indexOf("const sendWithWords = () => {"));
    expect(effect).not.toMatch(/setDocsHold\(false\);\s*void submitRef\.current/);
    expect(effect).toContain("releaseWhenIndexed({ pending: () => library.attachmentsIndexing(key), subscribe: (cb) => library.subscribe(cb), show: setReadingDocs, send: () => submitRef.current(draftRef.current) })");
    expect(read("../src/documents/library.ts")).toMatch(/attachmentsIndexing\(chatId: string\): number \{\s*return this\.attachedTo\(chatId\)\.filter\(\(d\) => this\.jobs\.has\(d\.id\) \|\| d\.status === "queued" \|\| d\.status === "indexing" \|\| !!d\.reindexFrom\)\.length;/);
  });

  it("it shows 'reading your document', sends once the rebuild is committed, and hides the line", async () => {
    let pending = 1;
    const listeners = new Set<() => void>();
    const shown: number[] = [];
    const send = vi.fn(async () => undefined);
    const done = releaseWhenIndexed({ pending: () => pending, subscribe: (cb) => (listeners.add(cb), () => listeners.delete(cb)), show: (n) => shown.push(n), send });
    await Promise.resolve();
    expect(send).not.toHaveBeenCalled();
    pending = 0;
    for (const l of listeners) l();
    await expect(done).resolves.toBe("indexed");
    expect(shown).toEqual([1, 0]);
    expect(send).toHaveBeenCalledOnce();
    expect(listeners.size).toBe(0);
  });

  it("a rebuild that never finishes still releases the message, to the existing re-indexing notice", async () => {
    vi.useFakeTimers();
    const send = vi.fn(async () => undefined);
    const done = releaseWhenIndexed({ pending: () => 1, subscribe: () => () => undefined, show: () => undefined, send });
    await vi.advanceTimersByTimeAsync(HELD_INDEX_WAIT_MS);
    await expect(done).resolves.toBe("timeout");
    expect(send).toHaveBeenCalledOnce();
  });

  it("nothing left to index: it goes out at once", async () => {
    const send = vi.fn(async () => undefined);
    const show = vi.fn();
    await expect(releaseWhenIndexed({ pending: () => 0, subscribe: () => () => undefined, show, send })).resolves.toBe("indexed");
    expect(show).not.toHaveBeenCalled();
    expect(send).toHaveBeenCalledOnce();
  });
});

describe("round 130 · the three exits of the pack card for a held PDF page", () => {
  it("Switch: the held turn carries the draft chat's files, the new chat attaches them and sends once they are there", async () => {
    const { stashHeldTurn, takeHeldTurn } = await import("../src/lib/heldTurn");
    stashHeldTurn({ model: "instant", text: "What do you see?", images: [], docIds: ["shop"] });
    expect(takeHeldTurn("fast")).toBeNull();
    expect(takeHeldTurn("instant")).toEqual({ model: "instant", text: "What do you see?", images: [], docIds: ["shop"] });
    expect(takeHeldTurn("instant")).toBeNull();
    expect(chat).toContain("stashHeldTurn({ model: modelId, text: draftRef.current, images: pendingImagesRef.current, docIds: library.attachedTo(docKey).map((d) => d.id) });");
    expect(chat).toContain("for (const id of docIds) library.attach(docKey, id);");
    expect(chat).toContain("if (carried.current === null || pendingImages.length !== carried.current.images || docs.documents.length < carried.current.docs) return;");
  });

  it("Download: the card's onReady sends the same draft again, which now plans the page with the pack on the phone", () => {
    expect(chat).toMatch(/const releaseHeldTurn = useCallback\(\(\) => \{\s*setPhotoHold\(null\);\s*void submitRef\.current\(draftRef\.current\);/);
    expect(chat).toContain("onReady={releaseHeldTurn}");
  });

  it("Remove the photo: the next Send plans the page without its picture (the thin route), it does not hold again", async () => {
    const plan = await planPage(input({ declined: true }));
    expect(plan?.picture).toBe(false);
    expect(chat).toContain("hasImages: pendingImages.length > 0 || !!page?.picture");
  });
});
