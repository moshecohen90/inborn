import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { citationsForAnswer, inheritedCitations, reworkedAnswer, withoutStrayMarkers, type Citation } from "@inborn/core";
import { claimsFileContent } from "../src/lib/docsGate";

const chat = readFileSync(join(__dirname, "../src/screens/Chat.tsx"), "utf8");

const chip = (n: number, page: number): Citation => ({ n, docId: "f", docName: "file.pdf", kind: "pdf", page, chunkId: `f#${n}`, snippet: "" });
const summaryRow = {
  role: "assistant" as const,
  content: "The document describes a turbine acceptance test: the Halden warehouse roof was replaced in March 2019 [2], and the annual maintenance budget of the Halden plant is 284,000 euro [3].",
  citations: [chip(2, 1), chip(3, 2), chip(4, 3)],
};

/* Build 40, the founder's file: "shorter" after "Thanks" came back as "Your documents don't mention this." */
describe("round 134I · a rework keeps the sources of the answer it reworks", () => {
  it("Chat finds the reworked row through reworkedAnswer and gives the rework its chips", () => {
    expect(chat).toContain('const reworked = plainChat === "follow-up" ? reworkedAnswer(history) : null;');
    expect(chat).toContain("const kept = inheritedCitations(shown(), reworkedRow);");
  });

  it("the file-claim guard counts the inherited sources as the answer's grounding", () => {
    expect(chat).toMatch(/if \(!ragUsed\.length && !citations\?\.length && !existingMessageId[^\n]*claimsFileContent\(reply\)\)/);
    const at = (s: string) => chat.indexOf(s);
    expect(at("inheritedCitations(shown(), reworkedRow)")).toBeLessThan(at("claimsFileContent(reply)) {"));
  });

  it("'shorter, start with The document' is a file claim, and it inherits the summary's chips, so it is shown", () => {
    const history = [
      { role: "user" as const, content: "Summarize it" },
      summaryRow,
      { role: "user" as const, content: "Thanks" },
      { role: "assistant" as const, content: "You're welcome!" },
      { role: "user" as const, content: "shorter, start with 'The document'" },
    ];
    expect(reworkedAnswer(history)).toBe(summaryRow);
    const rework = "The document says the Halden warehouse roof was replaced in March 2019 and the maintenance budget is 284,000 euro [4].";
    expect(claimsFileContent(rework)).toBe(true);
    const inherited = inheritedCitations(rework, summaryRow);
    expect(inherited.length).toBeGreaterThan(0);
    expect(citationsForAnswer(rework, inherited).shown.map((c) => c.page)).toEqual([3]);
  });

  it("a mark with no chip under it is dropped from a turn with files attached, never from a Continue", () => {
    expect(chat).toMatch(/if \(!existingMessageId && !familySafeReplaced && docs\.documents\.length > 0\) \{\n\s+const bare = withoutStrayMarkers\(reply, citations \?\? \[\]\);/);
    expect(withoutStrayMarkers("…removed from office [4].", summaryRow.citations.slice(0, 2))).toBe("…removed from office.");
  });

  it("an acknowledgement inherits nothing", () => {
    expect(chat).toMatch(/const reworked = plainChat === "follow-up"/);
  });
});
