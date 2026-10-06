import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { initI18n } from "@inborn/i18n";
import { buildRagPrompt, fileAsk } from "@inborn/core";
import { askSheetRoute, sheetNotFoundLine, sheetPlainLine } from "../src/lib/docsGate";

const read = (rel: string) => readFileSync(join(__dirname, rel), "utf8");
const sheet = read("../src/screens/documents/AskDocuments.tsx");
const ask = sheet.slice(sheet.indexOf("const ask = async"), sheet.indexOf("useEffect(() => {"));
const notFoundBranch = ask.slice(ask.indexOf('if (route === "not-found") {'), ask.indexOf('setPhase({ kind: "answering" });'));
let t: (key: string, values?: Record<string, unknown>) => string;
beforeAll(async () => {
  const i18n = await initI18n("en");
  t = (key, values) => i18n.t(key, values);
});

const noPassages = (strict: boolean) => buildRagPrompt({ question: "Who won the 1998 World Cup?", hits: [], docs: new Map(), strict, nCtx: 4096 });

describe("round 134K · with no passage the Ask sheet shows the opener without a model call", () => {
  it("no passage routes to not-found in strict and non-strict mode; a kept passage still answers", () => {
    for (const strict of [true, false]) {
      const p = noPassages(strict);
      expect(p.used, `strict=${strict}`).toEqual([]);
      expect(askSheetRoute({ noAnswer: p.noAnswer, usedPassages: p.used.length }), `strict=${strict}`).toBe("not-found");
    }
    expect(askSheetRoute({ noAnswer: false, usedPassages: 2 })).toBe("answer");
    expect(askSheetRoute({ noAnswer: true, usedPassages: 0 })).toBe("not-found");
  });

  it("the line is the opener the model was told to start with; passages that did not fit say so", () => {
    expect(sheetNotFoundLine(t, 0)).toBe("Your documents don't mention this.");
    expect(sheetNotFoundLine(t, 3)).toBe("Your documents could not be included in this answer.");
  });

  it("the not-found branch returns before engine.generate, with the opener as the answer and nothing used", () => {
    expect(ask).toContain('const route = scope ? "answer" : askSheetRoute({ noAnswer: prompt.noAnswer, usedPassages: prompt.used.length });');
    expect(notFoundBranch).toMatch(/const line = sheetNotFoundLine\(t, prompt\.droppedForBudget\);\s*setNotFound\(line\);/);
    expect(notFoundBranch).toContain('setStats(t("documents.ask.retrieved", { ms: retrieveMs, count: 0 }));');
    expect(notFoundBranch).toContain("onResult?.({ question: text, answer: line, citations: [], cited: false, notFound: true, retrieveMs, promptTokens: 0, generateMs: 0, tokPerSec: 0, used: [] });");
    expect(notFoundBranch).toMatch(/return;\s*\}\s*$/);
    expect(notFoundBranch).not.toMatch(/engine\.generate|setAnswer\(|setNoneMatched\(true\)|answering/);
    expect(ask.indexOf('if (route === "not-found") {')).toBeLessThan(ask.indexOf("engine.generate("));
    expect(t("documents.ask.retrieved", { ms: 42, count: 0 })).toBe("search 42 ms · 0 passages");
  });

  it("the sheet shows that line under ask-not-found, without chips or the none-matched notice", () => {
    expect(sheet).toMatch(/\{notFound \? \(\s*<Text testID="ask-not-found"[^>]*>\s*\{notFound\}\s*<\/Text>/);
    expect(sheet).toContain('{phase.kind === "done" && !notFound ? <Citations');
    expect(sheet).toContain("{noneMatched && !notFound ? (");
  });

  it("passages kept → the model answers as before; a model not-found reply keeps its line", () => {
    expect(ask).toMatch(/for await \(const d of engine\.generate\(s, prompt\.messages, \{ reasoning: false, maxTokens: length\.maxTokens \}, ac\.signal\)\)/);
    expect(ask).toContain('setNotFound(isNotFound ? t("documents.notFound") : null);');
    expect(ask).toContain("library.citationsFor(reply, groundedCitations(reply, text, prompt.used, prompt.citations))");
  });

  it("a summary still reads the file whole and never takes the no-passage route; a thanks keeps its 134D line", () => {
    expect(fileAsk("Summarize it")).toBe("summary");
    expect(ask).toMatch(/const whole = summary \? await readWhole\(s, text, docIds, length\.instruction, ac\.signal\) : null;/);
    expect(ask).toMatch(/const route = scope \? "answer"/);
    expect(sheetPlainLine(t, "thank you")).toBe("You're welcome. Ask another question about these documents.");
    expect(ask.indexOf("if (plain) {")).toBeLessThan(ask.indexOf("await library.ask("));
  });
});
