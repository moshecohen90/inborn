import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { initI18n } from "@inborn/i18n";
import { fileAsk } from "@inborn/core";
import { summaryScope } from "../src/lib/docsGate";

const read = (rel: string) => readFileSync(join(__dirname, rel), "utf8");
const sheet = read("../src/screens/documents/AskDocuments.tsx");
const ask = sheet.slice(sheet.indexOf("const ask = async"), sheet.indexOf("useEffect(() => {"));
let t: (key: string, values?: Record<string, unknown>) => string;
beforeAll(async () => {
  const i18n = await initI18n("en");
  t = (key, values) => i18n.t(key, values);
});

describe("round 132C · the Ask sheet reads the whole file for a summary", () => {
  it("a summary ask reads the files whole; a normal question and 'what is this file about?' keep retrieval", () => {
    expect(fileAsk("Summarize it")).toBe("summary");
    expect(fileAsk("What is this file about?")).toBe("about");
    expect(fileAsk("Who can veto a bill?")).toBeNull();
    expect(ask).toMatch(/const summary = fileAsk\(text\) === "summary";/);
    expect(ask).toMatch(/const whole = summary \? await readWhole\(s, text, docIds, length\.instruction, ac\.signal\) : null;/);
    expect(ask).toMatch(/whole\s*\? \{ prompt: whole\.prompt,[^}]*\}\s*: await library\.ask\(text, \{ docIds, strict: strict && !strictLocked/);
    expect(ask).toMatch(/use: summary \? "summarize" : "documents"/);
  });

  it("reads with the chat's options and shows the page line while it reads", () => {
    const helper = sheet.slice(sheet.indexOf("const readWhole = async"), sheet.indexOf("const ask = async"));
    expect(helper).toMatch(/library\.readWhole\(question, \{\s*docIds,\s*nCtx: s\.nCtx,\s*systemPrompt: system,/);
    expect(helper).toContain("citeMarkers: canCiteMarkers(model.id)");
    expect(helper).toContain("onSection: (_i, section, plan) => setReadingPages(readingPagesLine(t, section, plan.pagesTotal))");
    expect(helper).toContain("{ reasoning: false, maxTokens, temperature: 0.3 }");
    expect(helper).toMatch(/finally \{\s*setReadingPages\(null\);/);
    expect(sheet).toMatch(/phase\.kind === "retrieving" && readingPages \? \(\s*<Text testID="ask-reading-pages"/);
  });

  it("the scope line closes the summary, with the Instant caveat on Instant", () => {
    expect(ask).toContain('if (scope && reply.trim()) reply = `${reply.trimEnd()}\\n\\n*${summaryScope(t, scope, model.id === "instant" ? { current: chipLabel(t, model.id), better: chipLabel(t, "fast") } : undefined)}*`;');
    expect(summaryScope(t, { pagesRead: 9, pagesTotal: 9 }, { current: "INSTANT", better: "FAST" })).toBe("Summary of all 9 pages. INSTANT can miss or mix up details of a long file; FAST summarizes files better.");
  });

  it("Stop while reading or writing leaves the sheet idle with no half answer", () => {
    expect(ask).toMatch(/await readWhole\([^)]*\) : null;\s*if \(ac\.signal\.aborted\) return setPhase\(\{ kind: "idle" \}\);/);
    expect(ask).toMatch(/if \(scope && ac\.signal\.aborted\) \{\s*setAnswer\(""\);\s*return setPhase\(\{ kind: "idle" \}\);/);
    expect(ask).toMatch(/if \(summary && ac\.signal\.aborted\) \{\s*setAnswer\(""\);\s*return setPhase\(\{ kind: "idle" \}\);/);
  });

  it("no 'not found' or 'none matched' on a summary; the stats line says what was read", () => {
    expect(ask).toContain("const isNotFound = !scope && isNotFoundReply(reply);");
    expect(ask).toMatch(/if \(!scope && !isNotFound && saysNoneMatched\(/);
    expect(ask).toContain('scope ? t("documents.ask.read", { ms: retrieveMs, read: scope.pagesRead, count: scope.pagesTotal })');
    expect(t("documents.ask.read", { ms: 812, read: 9, count: 9 })).toBe("read 812 ms · 9 of 9 pages");
    expect(t("documents.ask.read", { ms: 40, read: 1, count: 1 })).toBe("read 40 ms · the 1 page");
  });

  it("onResult keeps its shape: `used` lists every page the summary read", () => {
    expect(ask).toMatch(/scope\.sections\.flatMap\(\(sec\) => Array\.from\(\{ length: sec\.to - sec\.from \+ 1 \}, \(_, i\) => \(\{ doc: [^,]+, page: sec\.from \+ i, cosine: 0, bm25: 0 \}\)\)\)/);
  });
});
