import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { fileAsk, isPlainChatTurn } from "@inborn/core";
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
    expect(chat).toMatch(/const smallTalk = !existingMessageId && isPlainChatTurn\(lastUser\) && !history\[lastUserAt\]\?\.images\?\.length && !photoDocIds\.length;/);
    expect(chat).toMatch(/planDocsTurn\(\{[^\n]*seesPage, smallTalk \}\)/);
    expect(chat).toMatch(/usedPassages: 0, smallTalk \}\)\) setNoneMatched\(true\)/);
    expect(chat).toMatch(/continuing: !!existingMessageId,\s+smallTalk,/);
    expect(chat).toContain("length: lengthLine, smallTalk });");
  });
});
