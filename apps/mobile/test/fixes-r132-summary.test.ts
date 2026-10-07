import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { initI18n } from "@inborn/i18n";
import { planIndexHold, readingPagesLine, summaryScope } from "../src/lib/docsGate";

const read = (rel: string) => readFileSync(join(__dirname, rel), "utf8");
const chat = read("../src/screens/Chat.tsx");
let t: (key: string, values?: Record<string, unknown>) => string;
beforeAll(async () => {
  const i18n = await initI18n("en");
  t = (key, values) => i18n.t(key, values);
});

describe("round 132 · the lines a summary shows", () => {
  it("while reading: the page, or the span of pages, out of the whole file", () => {
    expect(readingPagesLine(t, { from: 3, to: 3 }, 9)).toBe("Reading page 3 of 9…");
    expect(readingPagesLine(t, { from: 4, to: 6 }, 9)).toBe("Reading pages 4–6 of 9…");
  });

  it("under the answer: all of the file, or how far a longer file was read", () => {
    expect(summaryScope(t, { pagesRead: 9, pagesTotal: 9 })).toBe("Summary of all 9 pages.");
    expect(summaryScope(t, { pagesRead: 1, pagesTotal: 1 })).toBe("Summary of the whole file (1 page).");
    expect(summaryScope(t, { pagesRead: 20, pagesTotal: 57 })).toMatch(/^Summary of pages 1–20 of 57\./);
    expect(summaryScope(t, { pagesRead: 9, pagesTotal: 9 }, { current: "INSTANT", better: "FAST" })).toBe("Summary of all 9 pages. INSTANT can miss or mix up details of a long file; FAST summarizes files better.");
  });
});

describe("round 132 · Chat reads the whole file for a summary", () => {
  it("only a fresh documents turn asking for the content takes the route, never a page picture, a thin page or a photo turn", () => {
    expect(chat).toMatch(/const summary = turn\.kind === "retrieve" && !existingMessageId && !seesPage && !thinPage && !photoDocIds\.length && fileAsk\(lastUser\) === "summary";/);
    expect(chat).toMatch(/use: summary \? "summarize" : detectUse\(/);
  });

  it("the whole-file prompt replaces retrieval, and Stop while reading leaves no empty answer behind", () => {
    const block = chat.slice(chat.indexOf("let scope: WholeFilePlan | null = null;"));
    expect(block).toMatch(/const whole = summary \? await readWholeFile\(s, system, lastUser, ac\.signal\) : null;\s*if \(ac\.signal\.aborted\) \{\s*setRows\(\(all\) => all\.filter\(\(x\) => x\.id !== rowId\)\);\s*return;/);
    expect(block).toMatch(/const rag = whole \? \{ prompt: whole\.prompt, retrieveMs: 0, overview: false \} : await docs\.buildPrompt\(/);
  });

  it("the progress line follows each section, and the scope line closes a finished summary only", () => {
    expect(chat).toMatch(/onSection: \(_i, section, plan\) => setReadingPages\(readingPagesLine\(t, section, plan\.pagesTotal\)\)/);
    expect(chat).toMatch(/<View testID="reading-pages"/);
    expect(chat).toMatch(/if \(scope && !stopped && !familySafeReplaced && reply\.trim\(\)\) \{\s*reply = `\$\{reply\.trimEnd\(\)\}\\n\\n\*\$\{summaryScope\(t, scope, /);
    expect(chat).toContain('summaryScope(t, scope, model.id === "instant" ? { current: chipLabel(t, model.id), better: chipLabel(t, "fast") } : undefined)');
  });

  it("a summary reads every page itself, so it is not held for the index model", () => {
    expect(chat).toMatch(/coveredWhole: coversAttachments\(page, docs\.documents\) \|\| fileAsk\(text\) === "summary"/);
    expect(planIndexHold({ attached: 1, embedder: "missing", wordsAccepted: false, coveredWhole: true })).toBe("send");
  });
});
