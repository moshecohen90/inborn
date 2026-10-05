import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { BUNDLED_MANIFEST, buildRagPrompt, photoPlan, type Chunk, type DocumentRecord, type Message } from "@inborn/core";
import { carriesPage, charsByPage, isVisualPage, pageImagePrefix, planPagePhoto, VISUAL_PAGE_CHARS, VISUAL_PAGE_INK, type PagePhotoInput } from "../src/documents/pagePhoto";
import { withPhotoText } from "../src/documents/photoDocs";
import { gatePhotoSend } from "../src/lib/visionGate";
import type { AskResult } from "../src/documents/library";

const read = (rel: string) => readFileSync(join(__dirname, rel), "utf8");
const chat = read("../src/screens/Chat.tsx");

const doc = (over: Partial<DocumentRecord>): DocumentRecord => ({ id: "d", name: "d.pdf", kind: "pdf", bytes: 1, pages: 1, addedAt: 0, status: "indexed", indexedPages: 1, chunkCount: 1, flaggedLines: 0, ocrPages: 0, uri: "documents/d/d.pdf", ...over });
const shop = doc({ id: "shop", name: "shop.pdf" });
const manual = doc({ id: "manual", name: "manual.pdf", pages: 3, indexedPages: 3, chunkCount: 9 });
const brochure = doc({ id: "brochure", name: "brochure.pdf", pages: 3, indexedPages: 3, chunkCount: 4 });

/* Page lengths and ink as measured on the real files (docs/qa/r130-pdf-page-vision/NOTES.md). */
const lengths: Record<string, number[]> = { shop: [183], manual: [2490, 2490, 2490], brochure: [1800, 140, 2100] };
const inks: Record<string, number[]> = { shop: [0.272], manual: [0.02, 0.02, 0.02], brochure: [0.02, 0.6, 0.03] };

const input = (over: Partial<PagePhotoInput> = {}): PagePhotoInput & { calls: { bestPage: ReturnType<typeof vi.fn>; ink: ReturnType<typeof vi.fn>; chars: ReturnType<typeof vi.fn> } } => {
  const chars = vi.fn(async (id: string) => new Map((lengths[id] ?? []).map((n, i) => [i + 1, n])));
  const bestPage = vi.fn(async (): Promise<{ docId: string; page: number } | null> => null);
  const ink = vi.fn(async (d: DocumentRecord, page: number) => inks[d.id]![page - 1]!);
  const base: PagePhotoInput = { ownPhotos: 0, limit: 1, attached: [shop], canRender: true, sent: [], chars, bestPage, ink, ...over };
  return { ...base, calls: { bestPage: (over.bestPage as ReturnType<typeof vi.fn>) ?? bestPage, ink: (over.ink as ReturnType<typeof vi.fn>) ?? ink, chars } };
};

describe("round 130 · which PDF page is visual", () => {
  it("the measured pages: the founder's shop page and the synthetic one are visual; short and long text pages, picture-less, are not", () => {
    expect(isVisualPage(183, 0.272)).toBe(true);
    expect(isVisualPage(132, 0.597)).toBe(true);
    /* A one-paragraph memo page has fewer characters than the shop page: only the ink tells them apart. */
    expect(isVisualPage(157, 0.003)).toBe(false);
    expect(isVisualPage(282, 0.008)).toBe(false);
    expect(isVisualPage(593, 0.013)).toBe(false);
    expect(isVisualPage(2490, 0.02)).toBe(false);
    /* A photographed letter with no text layer is a picture; once OCR stores its text past the limit, the text route reads it. */
    expect(isVisualPage(0, 0.501)).toBe(true);
    expect(isVisualPage(VISUAL_PAGE_CHARS, 0.9)).toBe(false);
    expect(isVisualPage(0, VISUAL_PAGE_INK - 0.001)).toBe(false);
  });

  it("a page's length is where its last stored passage ends, overlaps counted once", () => {
    const c = (page: number, start: number, end: number): Chunk => ({ id: `${page}-${start}`, docId: "x", page, ord: 0, text: "", start, end, tokens: 1 });
    expect(charsByPage([c(1, 0, 120), c(1, 90, 183), c(3, 0, 2490)])).toEqual(new Map([[1, 183], [3, 2490]]));
  });

  it("a one-page visual PDF: that page, without a search for the best passage", async () => {
    const i = input();
    await expect(planPagePhoto(i)).resolves.toEqual({ doc: shop, page: 1 });
    expect(i.calls.bestPage).not.toHaveBeenCalled();
    expect(i.calls.ink).toHaveBeenCalledWith(shop, 1);
  });

  it("a text-rich PDF keeps today's route with nothing added: no search, no render", async () => {
    const i = input({ attached: [manual] });
    await expect(planPagePhoto(i)).resolves.toBeNull();
    expect(i.calls.bestPage).not.toHaveBeenCalled();
    expect(i.calls.ink).not.toHaveBeenCalled();
  });

  it("several pages: the page of the best passage when it is visual, nothing when it is text, page 1 when no passage bears", async () => {
    const onPage = (page: number) => vi.fn(async () => ({ docId: "brochure", page }));
    await expect(planPagePhoto(input({ attached: [brochure], bestPage: onPage(2) }))).resolves.toEqual({ doc: brochure, page: 2 });
    const text = input({ attached: [brochure], bestPage: onPage(3) });
    await expect(planPagePhoto(text)).resolves.toBeNull();
    expect(text.calls.ink).not.toHaveBeenCalled();
    /* Page 1 of the brochure is text: no passage, no picture. */
    await expect(planPagePhoto(input({ attached: [brochure] }))).resolves.toBeNull();
    const two = input({ attached: [shop, manual] });
    await expect(planPagePhoto(two)).resolves.toEqual({ doc: shop, page: 1 });
    expect(two.calls.bestPage).toHaveBeenCalledWith(["shop", "manual"]);
  });

  it("only a PDF the library has read and still holds: not a picture document, not one still being read, not a lost file", async () => {
    for (const d of [doc({ id: "shop", kind: "image" }), doc({ id: "shop", status: "indexing" }), doc({ id: "shop", uri: undefined }), doc({ id: "shop", status: "empty", indexedPages: 0 })]) {
      await expect(planPagePhoto(input({ attached: [d] }))).resolves.toBeNull();
    }
  });

  it("a platform with no page renderer (the browser) keeps today's behaviour", async () => {
    const i = input({ canRender: false });
    await expect(planPagePhoto(i)).resolves.toBeNull();
    expect(i.calls.chars).not.toHaveBeenCalled();
  });
});

describe("round 130 · the page is the turn's one photo", () => {
  it("the user's own photo wins: the PDF stays text-only for that turn, on Free and on Pro", async () => {
    for (const limit of [1, 4]) {
      const i = input({ ownPhotos: 1, limit });
      await expect(planPagePhoto(i)).resolves.toBeNull();
      expect(i.calls.chars).not.toHaveBeenCalled();
    }
  });

  it("the Send path asks for the page only when the composer has no photo, and gates it like one", () => {
    const submit = chat.slice(chat.indexOf("const submit = async (input: string) => {"), chat.indexOf("const importPage = async"));
    expect(submit).toContain("ownPhotos: pendingImages.length,");
    expect(submit).toContain("limit: limits(tier).imagesPerMessage,");
    expect(submit).toContain("hasImages: pendingImages.length > 0 || !!page,");
    /* Fast without its pack, after Instant saw the page in this chat: the page is planned again, so the gate offers the pack. */
    expect(submit).toContain('sent: photoPlanHere(model.id, tier !== "free").kind === "send" ? rowsRef.current.flatMap((r) => r.images ?? []) : [],');
    expect(submit).toContain("await submitNow(input, text, page);");
    expect(submit.indexOf("planPagePhoto(")).toBeLessThan(submit.indexOf("gatePhotoSend("));
  });

  it("the page goes into the user's message as a photo, named for its document and page", () => {
    expect(pageImagePrefix("doc-1", 3)).toBe("pdfpage-doc-1-p3-");
    const now = chat.slice(chat.indexOf("const importPage = async"), chat.indexOf("const send = () => submit(draft);"));
    expect(now).toContain("importImageFile(png, pageImagePrefix(doc.id, page))");
    expect(now).toContain("const images = [...pendingImages, ...(pagePicture ? [pagePicture] : [])].map((p) => storedImagePath(p.uri));");
    expect(now).toContain("...(images.length ? { images } : {})");
  });
});

describe("round 130 · the photo gates apply to the page unchanged", () => {
  const models = BUNDLED_MANIFEST.models.filter((m) => m.role === "chat");
  const verdictFor = (selected: string, installed: (id: string) => boolean) => () => {
    const plan = photoPlan({ selected, models, installed });
    return plan.kind === "send" ? ({ kind: "send" } as const) : ({ kind: "hold", offer: plan } as const);
  };

  it("Fast without its photo pack: the pack offer, and nothing reaches the model", async () => {
    const held: unknown[] = [];
    const send = vi.fn(async () => undefined);
    await expect(gatePhotoSend({ hasImages: true, scanned: async () => undefined, verdict: verdictFor("fast", (id) => id === "fast"), hold: (o) => held.push(o), send })).resolves.toBe("held");
    expect(send).not.toHaveBeenCalled();
    expect(held[0]).toMatchObject({ kind: "pack", path: { model: "fast", missing: [{ kind: "pack", id: "vision-qwen35-2b" }] } });
  });

  it("a model with no vision at all: the offer names a model that can see", () => {
    expect(photoPlan({ selected: "sharp-phi", models, installed: () => true })).toMatchObject({ kind: "switch" });
  });

  it("Instant with its bundled pack just sends", async () => {
    const send = vi.fn(async () => undefined);
    await expect(gatePhotoSend({ hasImages: true, scanned: async () => undefined, verdict: verdictFor("instant", (id) => id === "instant" || id === "vision-qwen35"), hold: () => undefined, send })).resolves.toBe("sent");
    expect(send).toHaveBeenCalledOnce();
  });

  it("the hold card shows for a held page with no photo in the composer, and a model switch carries the message", () => {
    expect(chat).toContain("{photoHold && (pendingImages.length || pageHeld) ? (");
    expect(chat).toContain("count={pendingImages.length || 1}");
    expect(chat).toContain("if (pendingImagesRef.current.length || pageHeld) stashHeldTurn(");
  });
});

describe("round 130 · the turn and the follow-ups", () => {
  const PAGE = "images/pdfpage-shop-p1-abc.jpg";
  const passage: Chunk = { id: "c1", docId: "shop", page: 1, ord: 0, text: "Free shipping on orders over $40", start: 0, end: 32, tokens: 9 };
  const askWith = (question: string, history: Message[], hit: boolean) =>
    vi.fn(async (): Promise<AskResult> => ({
      prompt: buildRagPrompt({ question, hits: hit ? [{ chunk: passage, score: 1, cosine: 0.9, bm25: 3, bm25Terms: 3 }] : [], docs: new Map([["shop", shop]]), strict: false, nCtx: 4096, history, overview: hit }),
      retrieveMs: 1,
    }));

  it("the first turn: the page and the question reach the model as a photo turn, with no 'documents don't mention' opener", async () => {
    const turn: Message[] = [
      { role: "system", content: "rules" },
      { role: "user", content: "Now what do you see", images: [PAGE] },
    ];
    expect(carriesPage(turn, ["shop"])).toBe(true);
    const r = await withPhotoText(turn, [PAGE], ["shop"], askWith("Now what do you see", [], false));
    expect(r.rag).toBeNull();
    expect(r.messages.at(-1)).toEqual({ role: "user", content: "Now what do you see", images: [PAGE] });
    expect(JSON.stringify(r.messages)).not.toContain("Your documents don't mention this");
  });

  it("a text question on the visual page: the passage goes in, fenced, with the page on the same message", async () => {
    const turn: Message[] = [{ role: "user", content: "What does the free shipping line say?", images: [PAGE] }];
    const r = await withPhotoText(turn, [PAGE], ["shop"], askWith("What does the free shipping line say?", [], true));
    expect(r.rag?.prompt.citations).toHaveLength(1);
    expect(r.messages.at(-1)!.images).toEqual([PAGE]);
    expect(r.messages.at(-1)!.content).toContain("Free shipping on orders over $40");
  });

  it("a follow-up is not sent the page again: the first turn's page stays in the history the model gets", async () => {
    const history: Message[] = [
      { role: "user", content: "Now what do you see", images: [PAGE] },
      { role: "assistant", content: "Two photos: dogs in a park and a coffee cup." },
    ];
    const i = input({ sent: [PAGE] });
    await expect(planPagePhoto(i)).resolves.toBeNull();
    expect(i.calls.ink).not.toHaveBeenCalled();
    const turn: Message[] = [{ role: "system", content: "rules" }, ...history, { role: "user", content: "What colour is the cup?" }];
    expect(carriesPage(turn, ["shop"])).toBe(true);
    const plain = await withPhotoText(turn, undefined, ["shop"], askWith("What colour is the cup?", history, false));
    expect(plain.messages).toBe(turn);
    const withText = await withPhotoText(turn, undefined, ["shop"], askWith("What colour is the cup?", history, true));
    expect(withText.messages.find((m) => m.images?.length)?.images).toEqual([PAGE]);
  });

  it("another document's page, or a plain photo, does not make the turn a page turn", () => {
    expect(carriesPage([{ role: "user", content: "x", images: ["images/pdfpage-other-p1-abc.jpg"] }], ["shop"])).toBe(false);
    expect(carriesPage([{ role: "user", content: "x", images: ["images/abc.jpg"] }], ["shop"])).toBe(false);
  });

  it("generate routes a page turn like a photo turn, and fits the passages into what the pictures leave", () => {
    const gen = chat.slice(chat.indexOf("const generate = async ("), chat.indexOf("const submit = async"));
    expect(gen).toContain("const seesPage = !existingMessageId && modelHasVision(model.id) && resolveVision(model.id) !== null && carriesPage(history, docs.context.docIds);");
    expect(gen).toContain('if (turn.kind === "retrieve" && !seesPage) {');
    expect(gen).toContain('if ((turn.kind === "model" && photoDocIds.length) || (turn.kind === "retrieve" && seesPage)) {');
    expect(gen).toContain("nCtx: nCtx - pictures");
  });
});
