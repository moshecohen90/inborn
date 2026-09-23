import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { planDocsTurn } from "./docsGate";

const en = JSON.parse(readFileSync(join(__dirname, "../../../../packages/i18n/locales/en.json"), "utf8")) as Record<string, string>;

describe("planDocsTurn (QA F34)", () => {
  it("refuses instead of calling the model when strict is on and nothing is attached", () => {
    expect(planDocsTurn({ strict: true, hasAttachment: false, hasIndex: false })).toEqual({ kind: "refuse", messageKey: "documents.noneAttached" });
  });

  it("refuses when strict is on and the attached document has no index yet", () => {
    expect(planDocsTurn({ strict: true, hasAttachment: true, hasIndex: false })).toEqual({ kind: "refuse", messageKey: "documents.notFound" });
  });

  it("retrieves when a document is attached and indexed, strict or not", () => {
    expect(planDocsTurn({ strict: true, hasAttachment: true, hasIndex: true })).toEqual({ kind: "retrieve" });
    expect(planDocsTurn({ strict: false, hasAttachment: true, hasIndex: true })).toEqual({ kind: "retrieve" });
  });

  it("leaves the plain chat alone: no strict, no documents, the model answers", () => {
    expect(planDocsTurn({ strict: false, hasAttachment: false, hasIndex: false })).toEqual({ kind: "model" });
  });
});

describe("an attached document is never answered around (QA F135)", () => {
  /* Moshe's iPhone and 6T, 23.9.2026: a PDF hangs off the composer, strict is off, and the turn went straight to the
     model, which answered that it had received no document. The old gate returned { kind: "model" } for exactly this. */
  it("does not send the turn to the model while a file the user attached cannot be searched", () => {
    expect(planDocsTurn({ strict: false, hasAttachment: true, hasIndex: false })).not.toEqual({ kind: "model" });
  });

  it("waits for an attached document that is still being read, strict or not", () => {
    expect(planDocsTurn({ strict: false, hasAttachment: true, hasIndex: false, indexing: true })).toEqual({ kind: "wait" });
    expect(planDocsTurn({ strict: true, hasAttachment: true, hasIndex: false, indexing: true })).toEqual({ kind: "wait" });
    /* A second file still being read holds the answer back too: the user attached both and asked about both. */
    expect(planDocsTurn({ strict: false, hasAttachment: true, hasIndex: true, indexing: true })).toEqual({ kind: "wait" });
  });

  it("says the file could not be read when indexing is finished and produced nothing", () => {
    expect(planDocsTurn({ strict: false, hasAttachment: true, hasIndex: false, indexing: false })).toEqual({ kind: "refuse", messageKey: "documents.notReadable" });
  });

  it("names the missing index model rather than the file when that is the reason", () => {
    expect(planDocsTurn({ strict: false, hasAttachment: true, hasIndex: false, noIndexModel: true })).toEqual({ kind: "refuse", messageKey: "documents.noIndexModel" });
    expect(planDocsTurn({ strict: true, hasAttachment: true, hasIndex: false, noIndexModel: true })).toEqual({ kind: "refuse", messageKey: "documents.noIndexModel" });
  });

  it("a scan says so, instead of the generic unreadable sentence", () => {
    expect(planDocsTurn({ strict: false, hasAttachment: true, hasIndex: false, needsOcr: true })).toEqual({ kind: "refuse", messageKey: "documents.needsOcr" });
    expect(planDocsTurn({ strict: true, hasAttachment: true, hasIndex: false, needsOcr: true })).toEqual({ kind: "refuse", messageKey: "documents.needsOcr" });
    /* A missing index model is the earlier reason: OCR would not help until it is there. */
    expect(planDocsTurn({ strict: false, hasAttachment: true, hasIndex: false, needsOcr: true, noIndexModel: true })).toEqual({ kind: "refuse", messageKey: "documents.noIndexModel" });
    /* And a scan still waits while it is being read. */
    expect(planDocsTurn({ strict: false, hasAttachment: true, hasIndex: false, needsOcr: true, indexing: true })).toEqual({ kind: "wait" });
  });

  it("nothing attached still goes to the model, index model or not", () => {
    expect(planDocsTurn({ strict: false, hasAttachment: false, hasIndex: false, noIndexModel: true })).toEqual({ kind: "model" });
    expect(planDocsTurn({ strict: false, hasAttachment: false, hasIndex: false, indexing: true })).toEqual({ kind: "model" });
  });

  it("every message key it can return exists in en.json", () => {
    const keys = new Set<string>();
    for (const strict of [true, false])
      for (const hasAttachment of [true, false])
        for (const hasIndex of [true, false])
          for (const indexing of [true, false])
            for (const noIndexModel of [true, false])
              for (const needsOcr of [true, false]) {
                const turn = planDocsTurn({ strict, hasAttachment, hasIndex, indexing, noIndexModel, needsOcr });
                if (turn.kind === "refuse") keys.add(turn.messageKey);
              }
    expect(keys.size).toBeGreaterThan(0);
    for (const k of keys) expect(en[k], k).toBeTypeOf("string");
  });
});
