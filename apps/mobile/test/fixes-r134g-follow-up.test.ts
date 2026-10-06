import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildPrompt, fileAsk, followUpWindow, isPlainChatTurn, plainChatKind } from "@inborn/core";
import { planDocsTurn, planIndexHold, saysNoneMatched } from "../src/lib/docsGate";

const chat = readFileSync(join(__dirname, "../src/screens/Chat.tsx"), "utf8");

/* Build 39: after "Thanks" → "You're welcome", "shorter" got "You're welcome! Enjoy your day."; "make it 3 bullet points" got the card. */
describe("round 134G · a follow-up reworks the last real answer", () => {
  it("Chat builds a follow-up's prompt from followUpWindow and logs the window", () => {
    expect(chat).toMatch(/const turns = plainChat === "follow-up" \? followUpWindow\(history\) : history;/);
    expect(chat).toContain("messages: turns.map((m, i) => ({ id: String(i), ...m }))");
    expect(chat).toContain("[chat] plain=${plainChat} window=${turns.length}/${history.length}");
  });

  it("the prompt the model sees ends with the summary, then the follow-up", () => {
    const history = [
      { role: "user" as const, content: "Summarize it" },
      { role: "assistant" as const, content: "Summary of all 9 pages…" },
      { role: "user" as const, content: "Thanks" },
      { role: "assistant" as const, content: "You're welcome!" },
      { role: "user" as const, content: "shorter" },
    ];
    const { messages } = buildPrompt({ system: "sys", messages: followUpWindow(history).map((m, i) => ({ id: String(i), ...m })), nCtx: 4096 });
    expect(messages.map((m) => m.content)).toEqual(["sys", "Summarize it", "Summary of all 9 pages…", "shorter"]);
  });

  it("a rework sends with no card, goes to the model and shows no notice; a question about the file is still held", () => {
    const noIndex = { attached: 1, embedder: "missing" as const, wordsAccepted: false };
    for (const text of ["make it 3 bullet points", "translate it to French"]) {
      expect(plainChatKind(text), text).toBe("follow-up");
      expect(planIndexHold({ ...noIndex, coveredWhole: fileAsk(text) === "summary", smallTalk: isPlainChatTurn(text) }), text).toBe("send");
      expect(planDocsTurn({ strict: false, hasAttachment: true, hasIndex: true, smallTalk: isPlainChatTurn(text) }), text).toEqual({ kind: "model" });
      expect(saysNoneMatched({ continuing: false, attachedCount: 1, usedPassages: 0, smallTalk: isPlainChatTurn(text) }), text).toBe(false);
    }
    const q = "What does it say about treason?";
    expect(planIndexHold({ ...noIndex, smallTalk: isPlainChatTurn(q) })).toBe("hold");
  });
});
