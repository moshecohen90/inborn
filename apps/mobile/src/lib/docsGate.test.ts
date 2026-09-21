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
    expect(planDocsTurn({ strict: false, hasAttachment: true, hasIndex: false })).toEqual({ kind: "model" });
  });

  it("every message key it can return exists in en.json", () => {
    for (const input of [
      { strict: true, hasAttachment: false, hasIndex: false },
      { strict: true, hasAttachment: true, hasIndex: false },
    ]) {
      const turn = planDocsTurn(input);
      expect(turn.kind).toBe("refuse");
      if (turn.kind === "refuse") expect(en[turn.messageKey]).toBeTypeOf("string");
    }
  });
});
