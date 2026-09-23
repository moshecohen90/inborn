import { describe, expect, it } from "vitest";
import { buildRagPrompt, type DocumentRecord, type Message, type RetrievalHit } from "@inborn/core";
import { withPhotos } from "./photoPrompt";

const hit = (text: string): RetrievalHit => ({
  chunk: { id: "c1", docId: "d1", page: 1, ord: 0, text, start: 0, end: text.length, tokens: 8 },
  cosine: 0.9,
  bm25: 5,
  bm25Terms: 2,
  score: 1,
});
const docs = new Map<string, DocumentRecord>([
  ["d1", { id: "d1", name: "door.pdf", kind: "pdf", bytes: 10, pages: 1, addedAt: 0, status: "indexed", indexedPages: 1, chunkCount: 1, flaggedLines: 0, ocrPages: 0 }],
]);

describe("withPhotos (QA F136)", () => {
  it("puts the photos on the last user message", () => {
    const messages: Message[] = [
      { role: "system", content: "rules" },
      { role: "user", content: "older" },
      { role: "assistant", content: "answer" },
      { role: "user", content: "what do you see?" },
    ];
    const out = withPhotos(messages, ["file:///a.jpg"]);
    expect(out[3]).toEqual({ role: "user", content: "what do you see?", images: ["file:///a.jpg"] });
    expect(out.filter((m) => m.images?.length)).toHaveLength(1);
  });

  it("changes nothing without photos, and never mutates the input", () => {
    const messages: Message[] = [{ role: "user", content: "hello" }];
    expect(withPhotos(messages, undefined)).toEqual(messages);
    expect(withPhotos(messages, [])).toEqual(messages);
    withPhotos(messages, ["file:///a.jpg"]);
    expect(messages[0]!.images).toBeUndefined();
  });

  it("a prompt with no user message is left alone", () => {
    expect(withPhotos([{ role: "system", content: "rules" }], ["file:///a.jpg"])).toEqual([{ role: "system", content: "rules" }]);
  });

  /* The real path: a question about an attached document, with a photo on the same turn. */
  it("the retrieval prompt carries the photo the raw prompt would have carried", () => {
    const rag = buildRagPrompt({ question: "what do you see?", hits: [hit("The door is oak.")], docs, strict: false, nCtx: 4096 });
    /* The bug: the prompt the retrieval path builds holds no picture at all. */
    expect(rag.messages.some((m) => m.images?.length)).toBe(false);
    const fixed = withPhotos(rag.messages, ["file:///door.jpg"]);
    expect(fixed.some((m) => m.images?.length)).toBe(true);
    const last = fixed[fixed.length - 1]!;
    expect(last.role).toBe("user");
    expect(last.images).toEqual(["file:///door.jpg"]);
    expect(last.content).toContain("what do you see?");
  });
});
