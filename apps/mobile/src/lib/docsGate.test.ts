import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { planDocsTurn, saysNoneMatched, type DocsTurnInput } from "./docsGate";

const en = JSON.parse(readFileSync(join(__dirname, "../../../../packages/i18n/locales/en.json"), "utf8")) as Record<string, string>;
const chat = readFileSync(join(__dirname, "../screens/Chat.tsx"), "utf8");

describe("planDocsTurn (QA F34)", () => {
  it("refuses instead of calling the model when strict is on and nothing is attached", () => {
    expect(planDocsTurn({ strict: true, hasAttachment: false, hasIndex: false })).toEqual({ kind: "refuse", messageKey: "documents.noneAttached" });
  });

  it("refuses when strict is on and the attached document has no index yet", () => {
    expect(planDocsTurn({ strict: true, hasAttachment: true, hasIndex: false })).toEqual({ kind: "refuse", messageKey: "documents.notRead" });
  });

  it("retrieves when a document is attached and indexed, strict or not", () => {
    expect(planDocsTurn({ strict: true, hasAttachment: true, hasIndex: true })).toEqual({ kind: "retrieve" });
    expect(planDocsTurn({ strict: false, hasAttachment: true, hasIndex: true })).toEqual({ kind: "retrieve" });
  });

  it("leaves the plain chat alone: no strict, no documents, the model answers", () => {
    expect(planDocsTurn({ strict: false, hasAttachment: false, hasIndex: false })).toEqual({ kind: "model" });
  });
});

describe("planDocsTurn: an attachment is never silently dropped (QA F125/F126)", () => {
  it("waits while an attached document is still being read, strict or not", () => {
    expect(planDocsTurn({ strict: false, hasAttachment: true, hasIndex: false, indexing: true })).toEqual({ kind: "wait" });
    expect(planDocsTurn({ strict: true, hasAttachment: true, hasIndex: false, indexing: true })).toEqual({ kind: "wait" });
  });

  it("waits for a second attachment even when the first one is already searchable", () => {
    expect(planDocsTurn({ strict: false, hasAttachment: true, hasIndex: true, indexing: true })).toEqual({ kind: "wait" });
  });

  it("never answers from the weights with an attachment on screen: the 6T repro", () => {
    /* door.jpg imported as a file: 0 passages, strict off. The Play build answered "I don't see an attached photo". */
    expect(planDocsTurn({ strict: false, hasAttachment: true, hasIndex: false, blocked: "image" })).toEqual({ kind: "refuse", messageKey: "documents.photoNotText" });
    expect(planDocsTurn({ strict: false, hasAttachment: true, hasIndex: false, blocked: "needs-ocr" })).toEqual({ kind: "refuse", messageKey: "documents.needsOcr" });
    /* 40-page PDF sent mid-index, strict off. The Play build invented the access code "NORTGATE". */
    expect(planDocsTurn({ strict: false, hasAttachment: true, hasIndex: false }).kind).not.toBe("model");
  });

  it("names the missing index model when that is why there is nothing to search", () => {
    expect(planDocsTurn({ strict: false, hasAttachment: true, hasIndex: false, blocked: "no-embedder" })).toEqual({ kind: "refuse", messageKey: "documents.needsIndexModel" });
  });

  it("falls back to the plain refusal when the reason is unknown", () => {
    expect(planDocsTurn({ strict: true, hasAttachment: true, hasIndex: false, blocked: null })).toEqual({ kind: "refuse", messageKey: "documents.notRead" });
  });

  it("only an attachment can make the turn wait", () => {
    expect(planDocsTurn({ strict: false, hasAttachment: false, hasIndex: false, indexing: true })).toEqual({ kind: "model" });
    expect(planDocsTurn({ strict: true, hasAttachment: false, hasIndex: false, indexing: true })).toEqual({ kind: "refuse", messageKey: "documents.noneAttached" });
  });

  it("every message key it can return exists in en.json", () => {
    const inputs: DocsTurnInput[] = [
      { strict: true, hasAttachment: false, hasIndex: false },
      { strict: true, hasAttachment: true, hasIndex: false },
      { strict: false, hasAttachment: true, hasIndex: false, blocked: "needs-ocr" },
      { strict: false, hasAttachment: true, hasIndex: false, blocked: "no-embedder" },
      { strict: false, hasAttachment: true, hasIndex: false, blocked: "image" },
    ];
    for (const input of inputs) {
      const turn = planDocsTurn(input);
      expect(turn.kind).toBe("refuse");
      if (turn.kind === "refuse") expect(en[turn.messageKey]).toBeTypeOf("string");
    }
    expect(en["documents.reading"]).toBeTypeOf("string");
  });
});

/**
 * F198. The notice is a claim about *this* answer. Continuing a partial answer is forced past the gate with no
 * retrieval of its own, so the chat flashed "nothing matched" over an answer whose first half cited the documents.
 */
describe("F198 · the 'answered without your documents' notice", () => {
  it("fires on a fresh turn that had documents attached and used none of them", () => {
    expect(saysNoneMatched({ continuing: false, attachedCount: 1, usedPassages: 0 })).toBe(true);
    expect(saysNoneMatched({ continuing: false, attachedCount: 3, usedPassages: 0 })).toBe(true);
  });

  it("stays quiet when passages were used", () => {
    expect(saysNoneMatched({ continuing: false, attachedCount: 1, usedPassages: 1 })).toBe(false);
  });

  it("stays quiet with nothing attached: there is no claim to make", () => {
    expect(saysNoneMatched({ continuing: false, attachedCount: 0, usedPassages: 0 })).toBe(false);
  });

  it("never fires on Continue, whichever way that turn went", () => {
    for (const usedPassages of [0, 2]) expect(saysNoneMatched({ continuing: true, attachedCount: 1, usedPassages })).toBe(false);
  });

  it("the chat asks this one question at every place it could raise the notice, and nowhere decides for itself", () => {
    const raises = [...chat.matchAll(/setNoneMatched\(true\)/g)];
    /* The third is F366: an answer none of whose passages it drew on. */
    expect(raises).toHaveLength(3);
    for (const m of raises) {
      const line = chat.slice(chat.lastIndexOf("\n", m.index) + 1, m.index);
      expect(line, "a notice raised without asking saysNoneMatched").toContain("saysNoneMatched({ continuing: !!existingMessageId");
    }
  });
});

/**
 * F276. Measured on the OnePlus 6T: the gate fired and `flash` ran 4 ms later, the 1,400 ms timer cleared the toast
 * 1,807 ms after that, and the first token of the answer arrived 9,784 ms into the turn. The sentence explaining an
 * answer was therefore withdrawn about eight seconds before that answer existed, on every turn, on that phone.
 * It is not a toast any more: it lives beside the answer it is about until the next question replaces both.
 */
describe("F276 · the notice outlives the turn it explains", () => {
  it("is never routed through the 1,400 ms toast again", () => {
    expect(chat).not.toMatch(/flash\(\s*t\("documents\.noneMatched"\)\s*\)/);
  });

  it("is withdrawn by a fresh turn, and only by a fresh turn", () => {
    const clears = [...chat.matchAll(/setNoneMatched\(false\)/g)];
    expect(clears, "the notice must be cleared exactly once, when a new turn starts").toHaveLength(1);
    const line = chat.slice(chat.lastIndexOf("\n", clears[0]!.index) + 1, clears[0]!.index);
    expect(line, "a clear that Continue would also run would drop the notice off the answer it belongs to").toContain("if (!existingMessageId)");
  });

  it("renders from the chat's own state, on every platform", () => {
    const strip = /<View testID="none-matched"[\s\S]{0,400}?<\/View>/.exec(chat);
    expect(strip, "no none-matched strip in Chat.tsx").toBeTruthy();
    expect(strip![0]).toContain('t("documents.noneMatched")');
    const guard = chat.slice(Math.max(0, strip!.index - 120), strip!.index);
    expect(guard, "the strip must hang off the noneMatched state").toContain("{noneMatched ?");
    expect(strip![0], "the notice must not be gated on a platform again").not.toMatch(/Platform\.OS/);
  });

  it("the sentence it renders is a real string, not a missing key", () => {
    expect(en["documents.noneMatched"]).toBeTruthy();
  });
});
