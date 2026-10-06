import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { initI18n } from "@inborn/i18n";
import { fileAsk, plainChatKind } from "@inborn/core";
import { sheetPlainLine } from "../src/lib/docsGate";

const read = (rel: string) => readFileSync(join(__dirname, rel), "utf8");
const sheet = read("../src/screens/documents/AskDocuments.tsx");
const ask = sheet.slice(sheet.indexOf("const ask = async"), sheet.indexOf("useEffect(() => {"));
const plainBranch = ask.slice(ask.indexOf("const plain = sheetPlainLine(t, text);"), ask.indexOf("const ac = new AbortController();"));
let t: (key: string) => string;
const locales = ["en", "de", "es", "fr", "ja", "ko", "pt-BR", "zh-Hant", "pseudo"];
beforeAll(async () => {
  const i18n = await initI18n("en");
  t = (key) => i18n.t(key);
});

describe("round 134D · a thanks or a follow-up in the Ask sheet gets one plain line, not a search", () => {
  it("a thanks gets the welcome line; a follow-up gets the one-question line", () => {
    expect(sheetPlainLine(t, "thank you")).toBe("You're welcome. Ask another question about these documents.");
    expect(sheetPlainLine(t, "Thanks!")).toBe("You're welcome. Ask another question about these documents.");
    expect(sheetPlainLine(t, "And now")).toBe('This sheet answers one question at a time: ask the full question (for example, "Summarize it in three lines").');
    expect(sheetPlainLine(t, "shorter")).toBe(sheetPlainLine(t, "And now"));
  });

  it("'Summarize it' and a real question get no plain line and keep their routes", () => {
    expect(sheetPlainLine(t, "Summarize it")).toBeNull();
    expect(fileAsk("Summarize it")).toBe("summary");
    expect(sheetPlainLine(t, "Who can veto a bill?")).toBeNull();
    expect(sheetPlainLine(t, "Who wrote this report?")).toBeNull();
    expect(ask).toMatch(/const whole = summary \? await readWhole\(s, text, docIds, length\.instruction, ac\.signal\) : null;/);
    expect(ask).toMatch(/: await library\.ask\(text, \{ docIds, strict: strict && !strictLocked/);
  });

  it("the plain branch returns before the model loads, before readWhole and before library.ask", () => {
    expect(plainBranch).toMatch(/if \(plain\) \{\s*setPlainLine\(plain\);\s*setPhase\(\{ kind: "done" \}\);[\s\S]*return;\s*\}/);
    expect(plainBranch).not.toMatch(/loadSession|readWhole|library\.ask|engine\.generate|setNotFound\(true\)|setNoneMatched\(true\)|setStats\(/);
    const at = ask.indexOf("if (plain) {");
    for (const later of ["loadSession()", "await readWhole(", "await library.ask(", "engine.generate("]) expect(ask.indexOf(later)).toBeGreaterThan(at);
  });

  it("onResult reports no not-found and nothing used; the line shows in the answer area with nothing else", () => {
    expect(plainBranch).toContain("onResult?.({ question: text, answer: plain, citations: [], cited: false, notFound: false, retrieveMs: 0, promptTokens: 0, generateMs: 0, tokPerSec: 0, used: [] });");
    expect(ask.indexOf("setPlainLine(null);")).toBeLessThan(ask.indexOf("if (plain) {"));
    expect(ask.indexOf("setStats(null);")).toBeLessThan(ask.indexOf("if (plain) {"));
    expect(sheet).toMatch(/\{plainLine \? \(\s*<Text testID="ask-plain"/);
  });

  it("both lines exist in every locale, and each locale's example is a summary ask", () => {
    for (const l of locales) {
      const strings = JSON.parse(read(`../../../packages/i18n/locales/${l}.json`)) as Record<string, string>;
      expect(strings["documents.ask.thanks"], l).toBeTruthy();
      expect(strings["documents.ask.oneQuestion"], l).toBeTruthy();
      if (l === "pseudo") continue;
      const example = strings["documents.ask.oneQuestion"]?.match(/["“«「„]\s*([^"”»」“]+?)\s*["”»」“]/u)?.[1];
      expect(example, l).toBeTruthy();
      expect(fileAsk(example!), `${l}: ${example}`).toBe("summary");
      expect(plainChatKind(example!), l).toBeNull();
    }
  });
});
