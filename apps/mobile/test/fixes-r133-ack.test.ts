import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ANSWER_CEILING, FOLLOW_UP_LINE, LENGTH_TOKENS, SMALL_TALK_LINE, detectUse, fileAsk, isPlainChatTurn, plainChatKind, planAnswerLength, turnSystemPrompt } from "@inborn/core";
import { planDocsTurn, planIndexHold, saysNoneMatched } from "../src/lib/docsGate";

const chat = readFileSync(join(__dirname, "../src/screens/Chat.tsx"), "utf8");

/* Build 37: "Summarize it" on a 9-page PDF with no index model, then "And now" and "Thanks", got the 468 MB index card. */
const noIndex = { attached: 1, embedder: "missing" as const, wordsAccepted: false };
const hold = (text: string) => planIndexHold({ ...noIndex, coveredWhole: fileAsk(text) === "summary", smallTalk: isPlainChatTurn(text) });

describe("round 133B · thanks and a short follow-up are not questions for the file", () => {
  it("no index model: thanks sends, a real question still holds, the summary still skips the hold", () => {
    expect(hold("thank you")).toBe("send");
    expect(hold("תודה רבה")).toBe("send");
    expect(hold("ありがとう")).toBe("send");
    expect(hold("What does it say about treason?")).toBe("hold");
    expect(hold("And now")).toBe("send");
    expect(hold("shorter")).toBe("send");
    expect(hold("serial number of the turbine?")).toBe("hold");
    expect(hold("and page 3")).toBe("hold");
    expect(hold("Summarize it")).toBe("send");
    expect(planIndexHold({ ...noIndex, embedder: "failed", smallTalk: true })).toBe("send");
  });

  it("the turn goes to the model, never to retrieval, whatever the files' state", () => {
    const states = [
      { strict: false, hasAttachment: true, hasIndex: true },
      { strict: true, hasAttachment: true, hasIndex: true },
      { strict: false, hasAttachment: true, hasIndex: false, indexing: true },
      { strict: false, hasAttachment: true, hasIndex: false, blocked: "no-embedder" as const },
    ];
    for (const s of states) {
      expect(planDocsTurn({ ...s, smallTalk: true })).toEqual({ kind: "model" });
      expect(planDocsTurn(s).kind).not.toBe("model");
    }
  });

  it("no 'nothing matched' line under the reply to thanks; a question with no passage still gets it", () => {
    expect(saysNoneMatched({ continuing: false, attachedCount: 1, usedPassages: 0, smallTalk: true })).toBe(false);
    expect(saysNoneMatched({ continuing: false, attachedCount: 1, usedPassages: 0 })).toBe(true);
  });

  it("Chat feeds the same signal to the hold, the turn plan and the notice, and skips the page picture for it", () => {
    expect(chat).toMatch(/const smallTalk = isPlainChatTurn\(text\) && !pendingImages\.length;\s+const page = smallTalk\s+\? null/);
    expect(chat).toMatch(/planIndexHold\(\{[^\n]*=== "summary", smallTalk \}\)/);
    expect(chat).toMatch(/const plainChat = !existingMessageId && !history\[lastUserAt\]\?\.images\?\.length && !photoDocIds\.length \? plainChatKind\(lastUser\) : null;\s+const smallTalk = plainChat !== null;/);
    expect(chat).toMatch(/planDocsTurn\(\{[^\n]*seesPage, smallTalk \}\)/);
    expect(chat).toMatch(/usedPassages: 0, smallTalk \}\)\) setNoneMatched\(true\)/);
  });
});

describe("round 134A · a follow-up reworks the previous answer, a thanks gets a sentence", () => {
  it("Chat hands the kind, not a yes or no, to the length plan and the system prompt", () => {
    expect(chat).toMatch(/continuing: !!existingMessageId,\s+plainChat,\s+\}\);/);
    expect(chat).toContain("length: lengthLine, plainChat });");
    expect(chat).not.toMatch(/length: lengthLine, smallTalk/);
  });

  it("what Chat computes for each turn: a follow-up gets the full plan and its own line, a thanks the short plan", () => {
    const turn = (text: string) => {
      const plainChat = plainChatKind(text);
      const length = planAnswerLength({ text, use: detectUse({ text, hasDocuments: true }), continuing: false, plainChat });
      const system = turnSystemPrompt({ familySafe: false, tier: "instant", photos: false, length: length.instruction, plainChat });
      return { plainChat, length, system };
    };
    for (const text of ["shorter", "translate it", "And now", "longer", "בעברית"]) {
      const t = turn(text);
      expect(t.plainChat, text).toBe("follow-up");
      expect(t.length.maxTokens, text).toBe(ANSWER_CEILING);
      expect(t.system, text).toContain(FOLLOW_UP_LINE);
      expect(t.system, text).not.toContain(SMALL_TALK_LINE);
    }
    const thanks = turn("thank you");
    expect(thanks.plainChat).toBe("acknowledgement");
    expect(thanks.length.maxTokens).toBe(LENGTH_TOKENS.short);
    expect(thanks.system).toContain(SMALL_TALK_LINE);
    expect(turn("What does it say about treason?").plainChat).toBeNull();
  });

  it("both kinds skip the hold, retrieval and the notice", () => {
    for (const text of ["shorter", "translate it", "And now", "thank you"]) expect(hold(text), text).toBe("send");
  });
});
