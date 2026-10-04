import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { BUNDLED_MANIFEST, buildRagPrompt, photoPlan, type Chunk, type DocumentRecord, type Message } from "@inborn/core";
import { imageDocuments, photoTextDocs, withPhotoText } from "../src/documents/photoDocs";
import { planLibraryAttach } from "../src/documents/libraryAttach";
import { planDocsTurn, saysNoneMatched } from "../src/lib/docsGate";
import { gatePhotoSend, planVisionTurn } from "../src/lib/visionGate";
import { dismissAfterSend } from "../src/lib/keyboardDismiss";
import type { AskResult } from "../src/documents/library";

const read = (rel: string) => readFileSync(join(__dirname, rel), "utf8");
const chat = read("../src/screens/Chat.tsx");

const doc = (over: Partial<DocumentRecord>): DocumentRecord => ({ id: "d", name: "d", kind: "pdf", bytes: 1, pages: 1, addedAt: 0, status: "indexed", indexedPages: 1, chunkCount: 1, flaggedLines: 0, ocrPages: 0, ...over });

/* Build 32: the store photo, filed in the library and read by OCR, attached from the [+] sheet's library list. */
const store = doc({ id: "store", name: "סקארה חנות איפור ומוצרי קוסמטיקה.jpg", kind: "image", uri: "documents/store/x.jpg", ocrPages: 1, chunkCount: 1 });
const door = doc({ id: "door", name: "door.jpg", kind: "image", status: "needs-ocr", chunkCount: 0 });
const report = doc({ id: "report", name: "report.pdf" });
const PHOTO = "file:///Documents/images/store.jpg";
const QUESTION = "What do you see in the photo?";
const turn: Message[] = [
  { role: "system", content: "rules" },
  { role: "user", content: QUESTION, images: [PHOTO] },
];

const chunk: Chunk = { id: "c1", docId: "store", page: 1, ord: 0, text: "סקארה חנות איפור ומוצרי קוסמטיקה 03-5551234", start: 0, end: 40, tokens: 20 };
const ask = (used: boolean) =>
  vi.fn(async (): Promise<AskResult> => ({
    prompt: buildRagPrompt({ question: QUESTION, hits: used ? [{ chunk, score: 1, cosine: 0, bm25: 0, bm25Terms: 0 }] : [], docs: new Map([["store", store]]), strict: false, nCtx: 4096, overview: used }),
    retrieveMs: 1,
  }));

describe("round 128 · a picture attached from the library is asked about as a photo", () => {
  it("the bug: as an attached document with OCR text, the turn went to retrieval and no picture reached the model", () => {
    expect(planDocsTurn({ strict: false, hasAttachment: true, hasIndex: true })).toEqual({ kind: "retrieve" });
    expect(saysNoneMatched({ continuing: false, attachedCount: 1, usedPassages: 0 })).toBe(true);
  });

  it("the image documents among the attachments are the ones the chat moves into the composer", () => {
    expect(imageDocuments([store, report, door]).map((d) => d.id)).toEqual(["store", "door"]);
  });

  it("with the picture moved out, the turn is a plain model turn and no 'nothing matched' is shown", () => {
    const attached = [store];
    const left = attached.filter((d) => !imageDocuments(attached).includes(d));
    expect(left).toEqual([]);
    expect(planDocsTurn({ strict: false, hasAttachment: left.length > 0, hasIndex: false })).toEqual({ kind: "model" });
    expect(saysNoneMatched({ continuing: false, attachedCount: left.length, usedPassages: 0 })).toBe(false);
  });

  it("a model with its photo pack: the generated turn carries the image, and an OCR text that does not bear on the question is left out", async () => {
    const a = ask(false);
    const r = await withPhotoText(turn, [PHOTO], ["store"], a);
    expect(a).toHaveBeenCalledWith(["store"]);
    expect(r.rag).toBeNull();
    expect(r.messages.at(-1)).toEqual({ role: "user", content: QUESTION, images: [PHOTO] });
    expect(JSON.stringify(r.messages)).not.toContain("Your documents don't mention this");
    expect(planVisionTurn({ hasImages: true, vaultScanned: true, modelSees: true, projectorInstalled: true, projectorAttached: true, onLastUserMessage: true, otherModelSees: true })).toEqual({ kind: "send" });
  });

  it("an OCR passage that bears on the question rides along fenced, with the picture still on the question (F136's shape)", async () => {
    const r = await withPhotoText(turn, [PHOTO], ["store"], ask(true));
    expect(r.rag?.prompt.used).toHaveLength(1);
    const last = r.messages.at(-1)!;
    expect(last.images).toEqual([PHOTO]);
    expect(last.content).toContain("<<<DOCUMENTS");
    expect(last.content).toContain("03-5551234");
    expect(last.content).toContain(`Question: ${QUESTION}`);
  });

  it("only photos that came from a picture with OCR text are searched; a picture never read by OCR is a photo alone", async () => {
    const from = new Map([[PHOTO, "store"], ["file:///Documents/images/door.jpg", "door"]]);
    const lookup = (id: string) => [store, door].find((d) => d.id === id);
    expect(photoTextDocs([PHOTO, "file:///Documents/images/door.jpg", "file:///Documents/images/camera.jpg"], from, lookup)).toEqual(["store"]);
    const a = ask(true);
    expect((await withPhotoText(turn, [PHOTO], [], a)).messages).toBe(turn);
    expect(a).not.toHaveBeenCalled();
  });

  it("no vision on this device: Send holds the photo behind the pack offer, exactly as for the Photo button", async () => {
    const models = BUNDLED_MANIFEST.models.filter((m) => m.role === "chat");
    const held: unknown[] = [];
    const send = vi.fn(async () => undefined);
    const verdict = () => {
      const plan = photoPlan({ selected: "fast", models, installed: (id) => id === "fast" });
      return plan.kind === "send" ? ({ kind: "send" } as const) : ({ kind: "hold", offer: plan } as const);
    };
    await expect(gatePhotoSend({ hasImages: true, scanned: async () => undefined, verdict, hold: (o) => held.push(o), send })).resolves.toBe("held");
    expect(send).not.toHaveBeenCalled();
    expect(held[0]).toMatchObject({ kind: "pack", path: { model: "fast", missing: [{ kind: "pack" }] } });
    /* Sharp (Phi) sees nothing: the offer names a model that can. */
    expect(photoPlan({ selected: "sharp-phi", models, installed: () => true })).toMatchObject({ kind: "switch" });
    expect(chat).toContain("{photoHold && pendingImages.length ? (");
  });

  it("a picture row in the library list is open on Free past the document cap: the photo limit applies in the composer", () => {
    const shelf = [report, doc({ id: "r2" }), doc({ id: "r3" }), store];
    expect(planLibraryAttach("free", shelf, "store", 99)).toEqual({ kind: "ok" });
    expect(planLibraryAttach("free", shelf, "report", 99)).toMatchObject({ kind: "paywall" });
    expect(read("../src/components/chat/AttachSheet.tsx")).toContain('const ready = indexed(d) || d.kind === "image";');
  });

  it("the chat wiring: the library tap, attachments saved earlier, and the turn's OCR documents", () => {
    const tap = chat.slice(chat.indexOf("const attachFromLibrary = (id: string) => {"), chat.indexOf("const onMic = () => {"));
    expect(tap).toContain("const picture = imageDocuments(libraryState.documents.filter((d) => d.id === id));");
    expect(tap).toMatch(/if \(picture\.length\) \{\s*setAttachOpen\(false\);\s*return afterSheetClose\(\(\) => void addPhotoDocuments\(picture\)\);\s*\}/);
    expect(tap.indexOf("addPhotoDocuments(picture)")).toBeLessThan(tap.indexOf("docs.attach(id)"));
    expect(chat).toMatch(/useEffect\(\(\) => \{\s*if \(attachedPictures\.length\) void addPhotoDocuments\(attachedPictures\);\s*\}, \[attachedPictureIds\]\);/);
    expect(chat).toMatch(/for \(const d of pictures\) docs\.detach\(d\.id\);/);
    expect(chat).toContain('await generate(chatIdNow, history, pendingId, "", undefined, undefined, photoDocIds);');
    expect(chat).toContain("docs.buildPrompt(lastUser, history.slice(0, lastUserAt), nCtx, system, photoDocIds)");
    expect(chat).toContain('if (turn.kind === "model" && photoDocIds.length) {');
  });

  it("the share sheet already sends a picture to the composer, never into the library (F343, unchanged)", () => {
    const share = chat.slice(chat.indexOf('if (seed.kind === "files")'), chat.indexOf("if (seed.text) setDraft(seed.text);"));
    expect(share).toMatch(/if \(kind === "image"\) \{\s*photos\.push\(f\.uri\);\s*continue;/);
  });

  it("the browser reads a library picture back from IndexedDB, not only from this page's blob", () => {
    expect(read("../src/images/pick.ts")).toMatch(/registeredBlob\(uri\) \?\? \(await readBytes\(uri\)/);
  });
});

describe("round 128 · the keyboard", () => {
  it("the message field is editable while the model loads; only Send waits for it", () => {
    const composer = read("../src/components/chat/Composer.tsx");
    expect(composer).not.toMatch(/editable=/);
    expect(composer).toContain("const canSend = composerCanSend({ text: value, preparing, busy, disabled });");
    expect(chat).toContain('disabled={status.kind !== "ready"}');
  });

  it("after a send the on-screen keyboard goes away", () => {
    const kb = { isVisible: vi.fn(() => true), dismiss: vi.fn() };
    dismissAfterSend("ios", kb);
    dismissAfterSend("android", kb);
    expect(kb.dismiss).toHaveBeenCalledTimes(2);
  });

  it("a browser and a hardware keyboard keep their focus", () => {
    const web = { isVisible: vi.fn(() => true), dismiss: vi.fn() };
    dismissAfterSend("web", web);
    expect(web.dismiss).not.toHaveBeenCalled();
    const hardware = { isVisible: vi.fn(() => false), dismiss: vi.fn() };
    dismissAfterSend("ios", hardware);
    expect(hardware.dismiss).not.toHaveBeenCalled();
  });

  it("every turn that starts an answer dismisses (send, regenerate, Continue, quick actions); a refused send never reaches it", () => {
    const gen = chat.slice(chat.indexOf("const generate = async ("), chat.indexOf("const ac = new AbortController();"));
    expect(gen).toContain("dismissAfterSend(Platform.OS, Keyboard);");
    const quick = chat.slice(chat.indexOf("const runQuick = ("), chat.indexOf("const closeQuick = () => {"));
    expect(quick).toContain("dismissAfterSend(Platform.OS, Keyboard);");
    const submit = chat.slice(chat.indexOf("const submit = async (input: string) => {"), chat.indexOf("const submitNow = async"));
    expect(submit).not.toContain("dismiss");
    expect(chat.match(/dismissAfterSend\(/g)).toHaveLength(2);
  });
});
