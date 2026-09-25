import { describe, expect, it } from "vitest";
import { planIndexHold } from "./docsGate";

/* Round 93: an attached file with no index model behind it is never sent as if it were read in full. */
describe("round 93 · Send holds while the document index model is missing", () => {
  it("holds a turn with files attached and no index model", () => {
    expect(planIndexHold({ attached: 1, embedder: "missing", wordsAccepted: false })).toBe("hold");
    expect(planIndexHold({ attached: 2, embedder: "failed", wordsAccepted: false })).toBe("hold");
  });

  it("sends once the user chose to go on with the word search, or the model is there", () => {
    expect(planIndexHold({ attached: 1, embedder: "missing", wordsAccepted: true })).toBe("send");
    expect(planIndexHold({ attached: 1, embedder: "ready", wordsAccepted: false })).toBe("send");
  });

  it("never holds a chat with nothing attached, or while the library is still starting", () => {
    expect(planIndexHold({ attached: 0, embedder: "missing", wordsAccepted: false })).toBe("send");
    expect(planIndexHold({ attached: 1, embedder: "loading", wordsAccepted: false })).toBe("send");
  });
});
