import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { planDocsTurn, type DocsTurnInput } from "./docsGate";

const en = JSON.parse(readFileSync(join(__dirname, "../../../../packages/i18n/locales/en.json"), "utf8")) as Record<string, string>;

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
