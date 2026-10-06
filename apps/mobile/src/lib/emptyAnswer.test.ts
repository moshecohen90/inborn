import { describe, expect, it } from "vitest";
import type { Delta } from "@inborn/core";
import { emptyTurn, silenced } from "./emptyAnswer";
import { planVisionTurn } from "./visionGate";
import { EASE_WINDOW_MS, MemoryStrikes } from "../device/memoryStrikes";

describe("a turn that came back with no words (build 38 X6, finding 1)", () => {
  it("is a system stop with Continue unless the user pressed Stop", () => {
    expect(emptyTurn({ reply: "", reasoning: "" })).toBe("systemStop");
    expect(emptyTurn({ reply: "  \n", reasoning: "", stoppedBy: "system" })).toBe("systemStop");
    expect(emptyTurn({ reply: "", reasoning: "", stoppedBy: "user" })).toBe("drop");
    expect(emptyTurn({ reply: "The", reasoning: "", stoppedBy: "system" })).toBeNull();
    expect(emptyTurn({ reply: "", reasoning: "thinking", stoppedBy: "system" })).toBeNull();
  });

  it("the QA seam keeps only the stream's end", async () => {
    async function* stream(): AsyncIterable<Delta> {
      yield { text: "Hello" };
      yield { reasoning: "hm" };
      yield { done: { promptTokens: 160, completionTokens: 2, ttftMs: 1, tokPerSec: 1 } };
    }
    const out: Delta[] = [];
    for await (const d of silenced(stream())) out.push(d);
    expect(out).toEqual([{ done: { promptTokens: 160, completionTokens: 2, ttftMs: 1, tokPerSec: 1 } }]);
  });
});

describe("a memory warning after a picture turn (build 38 X6)", () => {
  it("drops the projector first, and switches the model only on a second warning inside the window", () => {
    const s = new MemoryStrikes();
    expect(s.warn(0, "warning", true)).toBe("ease");
    expect(s.due()).toBe(false);
    expect(s.warn(10_000, "warning", false)).toBe("escalate");
    expect(s.due()).toBe(true);
    s.acted();
    expect(s.due()).toBe(false);
    expect(s.warn(20_000, "warning", true)).toBe("escalate");
    expect(s.warn(20_000 + EASE_WINDOW_MS + 1, "warning", true)).toBe("ease");
    expect(new MemoryStrikes().warn(0, "critical", true)).toBe("escalate");
  });

  it("while the projector is dropped, an older picture is left out instead of loading it again; a new picture still waits for it", () => {
    const base = { hasImages: true, vaultScanned: true, modelSees: true, projectorInstalled: true, projectorAttached: false, otherModelSees: true };
    expect(planVisionTurn({ ...base, onLastUserMessage: false, memoryEased: true })).toEqual({ kind: "drop" });
    expect(planVisionTurn({ ...base, onLastUserMessage: true, memoryEased: true })).toEqual({ kind: "wait" });
    expect(planVisionTurn({ ...base, onLastUserMessage: false })).toEqual({ kind: "wait" });
  });
});
