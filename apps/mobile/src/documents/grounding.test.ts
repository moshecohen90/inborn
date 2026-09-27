import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { askSheetRoute } from "../lib/docsGate";

const src = (p: string) => readFileSync(join(__dirname, p), "utf8");

/** F365/F366 wiring: the screens run the core rules on the real turn, not only in core's tests. */
describe("F365 · the library judges hits with its own embedder's doors", () => {
  const library = src("./library.ts");
  it("the prompt and the logcat line both use the doors of the embedder that produced the cosines", () => {
    expect(library).toMatch(/const embedderId = lexical \? LEXICAL_INDEX_ID : this\.embedderRef!\.embedder\.id;/);
    expect(library).toMatch(/const doors = relevanceDoors\(embedderId\);/);
    expect(library).toMatch(/buildRagPrompt\(\{[^}]*embedderId,/);
  });
});

describe("F366 · SOURCES only under an answer that took something from a passage", () => {
  it("the chat keeps only grounded chips, and says the documents did not match when none are", () => {
    const chat = src("../screens/Chat.tsx");
    expect(chat).toContain("groundedCitations(shown(), lastUser, ragUsed, citations)");
    expect(chat).toContain("saysNoneMatched({ continuing: !!existingMessageId, attachedCount: docs.documents.length, usedPassages: kept.length })");
    expect(chat).toContain("citations = kept.length ? kept : undefined;");
  });

  it("Ask documents shows chips only for grounded passages", () => {
    expect(src("../screens/documents/AskDocuments.tsx")).toContain("library.citationsFor(reply, groundedCitations(reply, text, prompt.used, prompt.citations))");
  });
});

describe("F7 · Documents → Ask says what the chat says when nothing matched", () => {
  const ask = src("../screens/documents/AskDocuments.tsx");
  it("an answer that took nothing from the documents carries the chat's none-matched line", () => {
    expect(ask).toContain("saysNoneMatched({ continuing: false, attachedCount: docs.length, usedPassages: shown.shown.length })");
    expect(ask).toMatch(/testID="ask-none-matched"[\s\S]{0,200}t\("documents\.noneMatched"\)/);
  });

  it("a words-only search says so, as the chat does", () => {
    expect(ask).toMatch(/testID="ask-lexical"[\s\S]{0,200}t\("documents\.wordsOnly"\)/);
  });
});

/* F416 (round 108, Moshe 27.9): Ask behaves like the chat: with no passage kept it answers from general knowledge under the chat's notice. */
describe("F416 · Documents → Ask answers like the chat when nothing matched", () => {
  const ask = src("../screens/documents/AskDocuments.tsx");
  it("only strict mode's no-answer skips the model", () => {
    expect(askSheetRoute({ noAnswer: true })).toBe("not-found");
    expect(askSheetRoute({ noAnswer: false })).toBe("answer");
  });

  it("the sheet asks the model on every non-strict route and shows the chat's notice, not a sheet-only line", () => {
    expect(ask).toContain("const route = askSheetRoute({ noAnswer: prompt.noAnswer });");
    expect(ask).toMatch(/if \(route === "not-found"\) \{[\s\S]{0,900}return;\n {6}\}[\s\S]{0,300}engine\.generate\(/);
    expect(ask).not.toContain("documents.ask.noneMatched");
    expect(ask).toMatch(/testID="ask-none-matched"[\s\S]{0,200}t\("documents\.noneMatched"\)/);
  });

  it("the sheet-only line is gone from every locale", () => {
    for (const lang of ["en", "de", "es", "fr", "ja", "ko", "pt-BR", "zh-Hant", "pseudo"]) {
      const strings = JSON.parse(src(`../../../../packages/i18n/locales/${lang}.json`)) as Record<string, string>;
      expect(strings["documents.ask.noneMatched"], lang).toBeUndefined();
      expect(strings["documents.noneMatched"], lang).toBeTruthy();
    }
  });
});
