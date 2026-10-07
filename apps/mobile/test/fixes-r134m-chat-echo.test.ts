import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const chat = readFileSync(join(__dirname, "../src/screens/Chat.tsx"), "utf8");

/** Round 134M: build 41's J7 answers that said the system prompt back on general questions. */
describe("134M · a fresh general chat answer goes through the rule-echo net", () => {
  it("the net is set only for a fresh turn with no passages, no picture and no follow-up rework", () => {
    expect(chat).toContain('if (!existingMessageId && !continueFrom && !sources && plainChat !== "follow-up" && !messages.some((m) => m.images?.length)) ruleNet = { instructions: systemOf(messages), question: lastUser };');
  });

  it("both the streamed text and the stored answer are what the net lets through; a Continue (prefix) is never filtered", () => {
    expect(chat).toContain("if (ruleNet && !prefix) return withoutEchoedRules(text, { ...ruleNet, streaming: live });");
    expect(chat.indexOf("ruleNet = { instructions")).toBeLessThan(chat.indexOf("const source = checksPicture"));
  });

  it("logs what the user never saw, lengths only", () => {
    expect(chat).toContain("if (ruleNet && shown() !== reply) console.log(`[chat] rule-echo kept ${shown().length}/${reply.length} chars`);");
  });
});
