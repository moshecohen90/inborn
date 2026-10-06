import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (rel: string) => readFileSync(join(__dirname, rel), "utf8");

/** Round 134H: build 39's sheet leak (J9-20) and the Hebrew bubbles of J9-23 / J9-24. */
describe("134H · the Ask sheet checks its answer against its own system prompt", () => {
  const sheet = read("../src/screens/documents/AskDocuments.tsx");
  it("both the streamed text and the finished answer go through the instruction-echo guard", () => {
    expect(sheet).toContain("const instructions = systemOf(prompt.messages);");
    expect(sheet).toContain("withoutEchoedInstructions(reply, instructions, { streaming: true })");
    expect(sheet).toContain("reply = withoutEchoedLabels(withoutEchoedInstructions(reply, instructions));");
  });
});

describe("134H · chat bubbles take their direction from their own text", () => {
  it("user bubble, assistant body (Markdown) and reasoning set writingDirection and textAlign from directionOf", () => {
    expect(read("../src/components/chat/UserMessage.tsx")).toContain('writingDirection: dir, textAlign: dir === "rtl" ? "right" : "left"');
    expect(read("../src/components/chat/AssistantMessage.tsx")).toContain("const dir = directionOf(row.content || row.reasoning");
    const md = read("../src/components/chat/Markdown.tsx");
    expect(md).toContain('const textDir: TextStyle = { writingDirection: dir, textAlign: dir === "rtl" ? "right" : "left" };');
    expect(md).toMatch(/codeText: \{[^}]*writingDirection: "ltr"/);
  });
});
