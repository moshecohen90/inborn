import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const chat = readFileSync(join(__dirname, "../src/screens/Chat.tsx"), "utf8");

/** Round 134M: build 41's J7 answers that said the system prompt back on general questions. */
describe("134M · a fresh general chat answer goes through the rule-echo net", () => {
  it("the net is set for every fresh turn without a picture; over files or a rework only the document rules count", () => {
    expect(chat).toContain('if (!existingMessageId && !continueFrom && !messages.some((m) => m.images?.length)) ruleNet = { instructions: systemOf(messages), question: lastUser, files: !!sources || plainChat === "follow-up" };');
  });

  it("both the streamed text and the stored answer are what the net lets through; a Continue (prefix) is never filtered", () => {
    expect(chat).toContain("return ruleNet && !prefix ? withoutEchoedRules(bare, { ...ruleNet, streaming: live }) : bare;");
    expect(chat.indexOf("ruleNet = { instructions")).toBeLessThan(chat.indexOf("const source = checksPicture"));
  });

  it("logs what the user never saw, lengths only", () => {
    expect(chat).toContain("if (ruleNet && shown() !== reply) console.log(`[chat] rule-echo kept ${shown().length}/${reply.length} chars`);");
  });
});

describe("134M · the chips judge the answer after the net, and an overview skips the share test", () => {
  it("groundedCitations and inheritedCitations read shown(), which the net has already filtered", () => {
    expect(chat).toContain("const kept = groundedCitations(shown(), lastUser, ragUsed, citations, { overview });");
    expect(chat).toContain("const kept = inheritedCitations(shown(), reworkedRow);");
  });

  it("the overview flag comes from library.ask, on the documents path and the photo path; the sheet passes it too", () => {
    expect(chat).toContain("overview = !!rag.overview;");
    expect(chat).toContain("overview = !!photoText.rag.overview;");
    const library = readFileSync(join(__dirname, "../src/documents/library.ts"), "utf8");
    expect(library).toContain("...(overview ? { overview: true } : {}) };");
    const sheet = readFileSync(join(__dirname, "../src/screens/documents/AskDocuments.tsx"), "utf8");
    expect(sheet).toContain("groundedCitations(reply, text, prompt.used, prompt.citations, { overview: !!overview })");
  });
});
