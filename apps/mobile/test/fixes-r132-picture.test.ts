import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { ANSWER_CEILING, BUNDLED_MANIFEST, type DocumentRecord } from "@inborn/core";
import { imageMaxTokens, phoneImageMaxTokens } from "../src/adapters/imageTokens";
import { coversAttachments, isThinTurn, pageReadable, planPage, type PagePhotoInput } from "../src/documents/pagePhoto";
import { planDocsTurn } from "../src/lib/docsGate";

const read = (rel: string) => readFileSync(join(__dirname, rel), "utf8");
const chat = read("../src/screens/Chat.tsx");

const doc = (over: Partial<DocumentRecord>): DocumentRecord => ({ id: "scan", name: "sign-scan.pdf", kind: "pdf", bytes: 1, pages: 1, addedAt: 0, status: "needs-ocr", indexedPages: 1, chunkCount: 0, flaggedLines: 0, ocrPages: 0, uri: "documents/scan/sign-scan.pdf", ...over });
/* docs/qa/r132-picture-budget/fixtures/sign-scan.pdf: no text layer, ink 0.928 of the 128 px render. */
const scan = doc({});
const SCAN_INK = 0.928;

const input = (over: Partial<PagePhotoInput> = {}): PagePhotoInput => ({
  ownPhotos: 0,
  limit: 1,
  attached: [scan],
  canRender: true,
  sent: [],
  chars: vi.fn(async () => new Map<number, number>()),
  bestPage: vi.fn(async () => null),
  ink: vi.fn(async () => SCAN_INK),
  ...over,
});

describe("round 132 · an image-only PDF is a picture", () => {
  it("a scan read to the end with no text, before or after OCR found nothing, can be rendered; one still being read or lost cannot", () => {
    expect(pageReadable(scan)).toBe(true);
    expect(pageReadable(doc({ status: "empty" }))).toBe(true);
    expect(pageReadable(doc({ status: "indexing", indexedPages: 0 }))).toBe(false);
    expect(pageReadable(doc({ status: "empty", indexedPages: 0, bytes: 0 }))).toBe(false);
    expect(pageReadable(doc({ uri: undefined }))).toBe(false);
    expect(pageReadable(doc({ status: "failed" }))).toBe(false);
  });

  it("0 stored characters and ink of at least 0.10: the page picture goes with the message", async () => {
    const plan = await planPage(input());
    expect(plan).toMatchObject({ doc: scan, page: 1, chars: 0, visual: true, picture: true });
  });

  it("a blank page (ink under 0.10) is not a picture, and with no text it is no thin turn either: today's OCR refusal stands", async () => {
    const plan = await planPage(input({ ink: vi.fn(async () => 0.04) }));
    expect(plan).toMatchObject({ chars: 0, visual: false, picture: false });
    expect(isThinTurn(plan)).toBe(false);
  });

  it("a model that cannot get the picture (declined, own photo, the browser) is not handed an empty thin page", async () => {
    for (const over of [{ declined: true }, { ownPhotos: 1 }, { canRender: false }]) {
      const plan = await planPage(input(over));
      expect(plan?.picture).toBe(false);
      expect(isThinTurn(plan)).toBe(false);
    }
  });

  it("after OCR: a few words keep the page a picture with its text; a full page of text goes the text route", async () => {
    const ocred = doc({ status: "indexed", chunkCount: 1, ocrPages: 1 });
    await expect(planPage(input({ attached: [ocred], chars: vi.fn(async () => new Map([[1, 120]])) }))).resolves.toMatchObject({ chars: 120, picture: true });
    await expect(planPage(input({ attached: [ocred], chars: vi.fn(async () => new Map([[1, 1800]])) }))).resolves.toBeNull();
  });

  it("the scan carries the whole file: no index model card, also for a scan of several pages", async () => {
    const plan = await planPage(input());
    expect(coversAttachments(plan, [scan])).toBe(true);
    const long = doc({ pages: 3, indexedPages: 3 });
    const longPlan = await planPage(input({ attached: [long] }));
    expect(longPlan?.picture).toBe(true);
    expect(coversAttachments(longPlan, [long])).toBe(true);
    /* A text file of several pages still holds for the index model. */
    expect(coversAttachments({ ...longPlan!, doc: { ...long, chunkCount: 4 } }, [{ ...long, chunkCount: 4 }])).toBe(false);
  });
});

describe("round 132 · the OCR refusal does not pre-empt a page the model sees", () => {
  it("nothing to search but the model sees the page: the turn goes to the model as a page turn", () => {
    expect(planDocsTurn({ strict: false, hasAttachment: true, hasIndex: false, blocked: "needs-ocr", seesPage: true })).toEqual({ kind: "page" });
    expect(planDocsTurn({ strict: true, hasAttachment: true, hasIndex: false, blocked: "no-text", seesPage: true })).toEqual({ kind: "page" });
  });

  it("a model that does not see it gets today's refusal; a file still being read is still waited for; an index still retrieves", () => {
    expect(planDocsTurn({ strict: false, hasAttachment: true, hasIndex: false, blocked: "needs-ocr" })).toEqual({ kind: "refuse", messageKey: "documents.needsOcr" });
    expect(planDocsTurn({ strict: false, hasAttachment: true, hasIndex: false, indexing: true, seesPage: true })).toEqual({ kind: "wait" });
    expect(planDocsTurn({ strict: false, hasAttachment: true, hasIndex: true, seesPage: true })).toEqual({ kind: "retrieve" });
  });

  it("Chat decides whether the model sees the page before it asks the gate, and a page turn is not told 'none matched'", () => {
    const gen = chat.slice(chat.indexOf("const planTurn = () =>") - 400, chat.indexOf("const thinPage ="));
    expect(gen.indexOf("const seesPage =")).toBeLessThan(gen.indexOf("const planTurn = () =>"));
    expect(gen).toContain("...library.attachmentState(attachKey), seesPage })");
    expect(chat).toContain('if (turn.kind === "model" && saysNoneMatched(');
  });
});

/* docs/qa/r132-picture-budget/NOTES.md: Instant at 1024 costs about 25 MB more on the GPU path and fits 4096 contexts only. */
describe("round 132 · Instant's picture budget per device class", () => {
  it("6 GB and up (4096 context): Instant spends 1024 image tokens like Fast and Sharp", () => {
    for (const id of ["instant", "fast", "sharp"]) expect(phoneImageMaxTokens(id, 4096)).toBe(1024);
  });

  it("under 6 GB (2048 context): 512, so the picture and the answer ceiling still leave room for the question", () => {
    expect(phoneImageMaxTokens("instant", 2048)).toBe(512);
    expect(2048 - phoneImageMaxTokens("instant", 2048) - ANSWER_CEILING).toBeGreaterThanOrEqual(512);
    expect(2048 - 1024 - ANSWER_CEILING).toBe(0);
  });

  it("Instant is the model of the small class: it runs on 3 GB, Fast and Sharp need 6", () => {
    const ram = (id: string) => BUNDLED_MANIFEST.models.find((m) => m.id === id)!.minRamGB;
    expect(ram("instant")).toBeLessThan(6);
    expect(ram("fast")).toBeGreaterThanOrEqual(6);
    expect(ram("sharp")).toBeGreaterThanOrEqual(6);
  });

  it("the prompt budget and the projector read the same context, and the browser keeps its 512", () => {
    expect(imageMaxTokens("llama.rn", "instant", 4096)).toBe(1024);
    expect(imageMaxTokens("wllama", "instant", 4096)).toBe(512);
    const rn = read("../src/adapters/llamaRn.ts");
    expect(rn).toContain("phoneImageMaxTokens(this.session?.model.id, this.session?.nCtx ?? 4096)");
    expect(chat).toContain("const nCtx = session.current?.nCtx ?? 4096;");
    expect(chat.match(/imageMaxTokens\(engine\.id, model\.id, nCtx\)/g)).toHaveLength(2);
  });
});
