import { describe, expect, it } from "vitest";
import {
  BUNDLED_MANIFEST,
  PICTURE_LINES,
  PICTURE_RETRY,
  PICTURE_SAMPLING,
  SENTENCE_HOLD,
  advisePhotoModel,
  buildRagPrompt,
  checkSentence,
  checkedAnswer,
  firstSentence,
  screenAnswer,
  turnSystemPrompt,
  type CatalogModel,
  type Chunk,
  type Delta,
  type DocumentRecord,
  type TurnFacts,
} from "../src/index";

/* Answers below are as the round-131 harness measured them (docs/qa/r131-picture-answers), on the synthetic pages only. */
const instructions = turnSystemPrompt({ familySafe: true, tier: "instant", photos: true, picture: "page", length: "Answer in one to three sentences." });
const page: TurnFacts = { pictureSent: true, sources: ["visual-page.pdf · p.1"], instructions, question: "What do you see?" };
const photo: TurnFacts = { pictureSent: true, sources: [], instructions, question: "What do you see?" };

describe("round 131 · a sentence checked against what the app knows about its turn", () => {
  it("a picture the app sent is never denied, in English or Hebrew", () => {
    expect(checkSentence("I am an AI model and cannot physically see objects outside my device.", photo)).toBe("denies-sight");
    expect(checkSentence("I am a large language model and I cannot see what's in your picture.", photo)).toBe("denies-sight");
    expect(checkSentence("אני תמיד רוצה לדעת מה אתה רואה, אבל אני לא יכול לראות את התמונה.", photo)).toBe("denies-sight");
    expect(checkSentence("אין לי יכולות לראות תמונות.", photo)).toBe("denies-sight");
    /* Without a picture the same words are an honest statement. */
    expect(checkSentence("I cannot see the image.", { ...photo, pictureSent: false })).toBeNull();
  });

  it("the system prompt's crisis line, handed to a message that says nothing of the kind, is off topic; to one that does, it is not", () => {
    const line = "If you have concerns about your own health, please contact a trusted person or a crisis line such as 988 (USA).";
    expect(checkSentence(line, photo)).toBe("off-topic-safety");
    expect(checkSentence("אני ממליץ להתייעץ עם מישהו שנוח לך.", photo)).toBe("off-topic-safety");
    expect(checkSentence(line, { ...photo, question: "I want to die" })).toBeNull();
  });

  it("a label or [n] that names no passage of the turn is foreign; the turn's own label is not", () => {
    expect(checkSentence("Free shipping over 150 ₪ [1] visual-page.pdf · p.1", page)).toBeNull();
    expect(checkSentence("Free shipping over 150 ₪ [2] visual-page.pdf · p.2", page)).toBe("foreign-source");
    expect(checkSentence("The crew had the most deaths [7].", page)).toBe("foreign-source");
    expect(checkSentence("A chalkboard menu [1].", photo)).toBe("foreign-source");
  });

  it("talk about the user, a five-word run of the instructions, or the question quoted whole is the model narrating its prompt", () => {
    expect(checkSentence("The user is asking what I see in the picture.", page)).toBe("meta");
    expect(checkSentence("[2] The user's file shows a store page.", page)).toBe("meta");
    expect(checkSentence("I should answer in one to three sentences.", page)).toBe("meta");
    expect(checkSentence('אני מודע שהמסר המצוין הוא "מה אתה רואה?", אך אין לי קשר למונח.', { ...page, question: "מה אתה רואה?" })).toBe("meta");
    /* A question of fewer than three words is too short to tell a quote from an answer. */
    expect(checkSentence('It says "hello world".', { ...page, question: "hello world" })).toBeNull();
    expect(checkSentence("The image displays a webpage from Northwind, featuring three small dogs on gravel.", page)).toBeNull();
  });
});

describe("round 131 · sentences as the stream releases them", () => {
  it("a sentence is released at its end mark or a newline, and a run with no end is judged once it is SENTENCE_HOLD long", () => {
    expect(firstSentence("Three dogs on gravel. A cup")).toBe("Three dogs on gravel. ");
    expect(firstSentence("Three dogs on gravel")).toBeNull();
    expect(firstSentence("Three dogs on gravel", true)).toBe("Three dogs on gravel");
    expect(firstSentence("x".repeat(SENTENCE_HOLD))).toHaveLength(SENTENCE_HOLD);
    expect(firstSentence("Tax paid .14 and change .01")).toBeNull();
  });

  it("screenAnswer: an opening at fault lets nothing through; a later one is left out; an invented label ends the answer", () => {
    expect(screenAnswer("The user is asking what I see. Three dogs.", page)).toEqual({ text: "", fault: "meta" });
    expect(screenAnswer("Three dogs on gravel. I cannot see the image. A cup of coffee.", page)).toEqual({ text: "Three dogs on gravel. A cup of coffee.", fault: "denies-sight" });
    expect(screenAnswer("Three dogs on gravel.\n[2] visual-page.pdf · p.2\nFree shipping.", page)).toEqual({ text: "Three dogs on gravel.\n", fault: "foreign-source" });
  });
});

const pieces = (text: string): Delta[] => [...(text.match(/\S+\s*|\s+/g) ?? []).map((t) => ({ text: t })), { done: { promptTokens: 1, completionTokens: 1, ttftMs: 1, tokPerSec: 1 } }];

async function run(attempts: string[], over: { cancelled?: boolean; forceFault?: boolean } = {}) {
  const started: boolean[] = [];
  let stops = 0;
  const faults: string[] = [];
  let text = "";
  let done = 0;
  for await (const d of checkedAnswer({
    start: async function* (retry) {
      started.push(retry);
      yield* pieces(attempts[started.length - 1] ?? "");
    },
    stop: () => void stops++,
    cancelled: () => !!over.cancelled,
    facts: page,
    honest: "HONEST",
    onFault: (f, a) => faults.push(`${f}@${a}`),
    forceFault: over.forceFault,
  })) {
    if (d.text) text += d.text;
    if (d.done) done++;
  }
  return { text, started, stops, faults, done };
}

describe("round 131 · checkedAnswer: one silent retry, then the honest line", () => {
  it("a sound answer streams through untouched, on one attempt", async () => {
    const r = await run(["The image displays a webpage from Northwind. It shows three dogs."]);
    expect(r).toMatchObject({ text: "The image displays a webpage from Northwind. It shows three dogs.", started: [false], stops: 0, faults: [], done: 1 });
  });

  it("an opening refusal is stopped unseen and asked once more; the second answer is what the user reads", async () => {
    const r = await run(["I cannot see the image. Sorry.", "Three dogs on gravel."]);
    expect(r).toMatchObject({ text: "Three dogs on gravel.", started: [false, true], stops: 1, faults: ["denies-sight@0"] });
  });

  it("two faulty openings give the honest line, never the model's words", async () => {
    const r = await run(["The user is asking what I see.", "The user wants a description."]);
    expect(r).toMatchObject({ text: "HONEST", started: [false, true], faults: ["meta@0", "meta@1"], done: 1 });
  });

  it("a faulty sentence after a sound opening is left out, and the answer goes on", async () => {
    const r = await run(["Three dogs on gravel. The user is asking about it. A cup of coffee."]);
    expect(r).toMatchObject({ text: "Three dogs on gravel. A cup of coffee.", started: [false], stops: 0, faults: ["meta@0"] });
  });

  it("an invented label cuts the answer there and stops the model", async () => {
    const r = await run(["Free shipping over 150 ₪.\n[2] visual-page.pdf · p.2 more text that would follow."]);
    expect(r).toMatchObject({ text: "Free shipping over 150 ₪.\n", started: [false], stops: 1, faults: ["foreign-source@0"] });
  });

  it("a stopped turn is not retried and shows no honest line", async () => {
    const r = await run(["I cannot see the image."], { cancelled: true });
    expect(r).toMatchObject({ text: "", started: [false] });
  });

  it("the QA seam faults every opening, so the honest line shows", async () => {
    const r = await run(["Three dogs on gravel.", "Three dogs on gravel."], { forceFault: true });
    expect(r.text).toBe("HONEST");
    expect(r.started).toEqual([false, true]);
  });

  it("picture turns sample cooler, and the retry cooler still", () => {
    expect(PICTURE_SAMPLING.temperature).toBeLessThan(0.7);
    expect(PICTURE_RETRY.temperature).toBeLessThan(PICTURE_SAMPLING.temperature!);
  });
});

describe("round 131 · the prompt says the picture is there", () => {
  it("a picture turn names its picture as the prompt's last line; a turn without one does not", () => {
    const withPhoto = turnSystemPrompt({ familySafe: true, tier: "fast", photos: true, picture: "photo" });
    expect(withPhoto).toContain(PICTURE_LINES.photo);
    expect(withPhoto.endsWith(`\n\n${PICTURE_LINES.photo}`)).toBe(true);
    expect(turnSystemPrompt({ familySafe: true, tier: "fast", photos: true, picture: "page" })).toContain(PICTURE_LINES.page);
    expect(turnSystemPrompt({ familySafe: true, tier: "fast", photos: true })).not.toContain(PICTURE_LINES.photo);
    expect(turnSystemPrompt({ familySafe: true, tier: "fast", photos: false, picture: "photo" })).not.toContain(PICTURE_LINES.photo);
  });

  it("next to the page's picture the passages are the page's text to quote from, not what to answer from", () => {
    const doc: DocumentRecord = { id: "v", name: "visual-page.pdf", kind: "pdf", bytes: 1, pages: 1, addedAt: 0, status: "indexed", indexedPages: 1, chunkCount: 1, flaggedLines: 0, ocrPages: 0 };
    const chunk: Chunk = { id: "c", docId: "v", ord: 0, page: 1, text: "Free shipping over 150", tokens: 6 } as Chunk;
    const build = (pagePicture: boolean) => buildRagPrompt({ question: "What do you see?", hits: [{ chunk, score: 1, cosine: 1, bm25: 0, bm25Terms: 0 }], docs: new Map([["v", doc]]), strict: false, embedderId: "embed-e5", nCtx: 4096, history: [], systemPrompt: "S", pagePicture }).messages[0]!.content;
    expect(build(true)).toContain("The text found on that page is between");
    expect(build(true)).not.toContain("Answer from the passages");
    expect(build(false)).toContain("Answer from the passages");
  });
});

describe("round 131 · a model that sees better, after a picture answer on Instant", () => {
  const catalog = BUNDLED_MANIFEST.models;
  const byId = (id: string): CatalogModel => catalog.find((m) => m.id === id)!;
  const advise = (current: string, installed: string[], pro = true) => advisePhotoModel({ current: byId(current), use: "chat", languageCode: "en", device: { ramGB: 8, deviceClass: "phone", pro }, installed, catalog });

  it("Instant is offered a higher tier that also sees, with a key of its own so a snoozed language card does not hide it", () => {
    const a = advise("instant", ["instant"])!;
    expect(a.photos).toBe(true);
    expect(a.better.model.vision).toBe(true);
    expect(a.better.model.id).not.toBe("instant");
    expect(a.key).toBe(`instant>${a.better.model.id}|photos`);
    expect(a.best).toBeUndefined();
  });

  it("Fast and Sharp are offered nothing: Sharp reads pictures no better than Fast (measured 4.10)", () => {
    expect(advise("fast", ["fast"])).toBeNull();
    expect(advise("fast", ["fast", "sharp"])).toBeNull();
    expect(advise("sharp", ["sharp"])).toBeNull();
  });
});

describe("F468 · the photo offer names only a model that sees on this device", () => {
  const catalog = BUNDLED_MANIFEST.models;
  const byId = (id: string): CatalogModel => catalog.find((m) => m.id === id)!;
  const advise = (sees?: (id: string) => boolean) => advisePhotoModel({ current: byId("instant"), use: "chat", languageCode: "en", device: { ramGB: 8, deviceClass: "phone", pro: true }, installed: ["instant"], catalog, ...(sees ? { sees } : {}) });

  it("a seer that cannot see here is never offered; the next one that can is", () => {
    expect(advise()!.better.model.id).toBe("fast");
    const a = advise((id) => id !== "fast");
    expect(a?.better.model.id).not.toBe("fast");
    if (a) expect(a.better.model.vision).toBe(true);
  });

  it("nothing is offered when no higher-tier model sees here", () => {
    expect(advise(() => false)).toBeNull();
  });

  it("without the predicate the catalog flag decides, as before", () => {
    expect(advise()).toEqual(advise(() => true));
  });
});
