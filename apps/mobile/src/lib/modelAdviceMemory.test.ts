import { beforeEach, describe, expect, it } from "vitest";
import { adviceToShow, dismissAdvice, resetAdviceMemory } from "./modelAdviceMemory";

describe("advice memory (§7.8: once per reason, Not now snoozes per chat)", () => {
  beforeEach(resetAdviceMemory);
  it("shows a new reason, keeps it while it holds, and never brings it back once it went away", () => {
    expect(adviceToShow("c1", "instant>fast|lang:he|", null)).toBe("instant>fast|lang:he|");
    expect(adviceToShow("c1", "instant>fast|lang:he|", "instant>fast|lang:he|")).toBe("instant>fast|lang:he|");
    expect(adviceToShow("c1", null, "instant>fast|lang:he|")).toBeNull();
    expect(adviceToShow("c1", "instant>fast|lang:he|", null)).toBeNull();
  });
  it("a different reason in the same chat shows; the same reason in another chat shows", () => {
    adviceToShow("c1", "a", null);
    expect(adviceToShow("c1", "b", "a")).toBe("b");
    expect(adviceToShow("c2", "a", null)).toBe("a");
  });
  it("Not now hides the reason for the rest of the chat even while it still holds", () => {
    adviceToShow("c1", "a", null);
    dismissAdvice("c1", "a");
    expect(adviceToShow("c1", "a", "a")).toBeNull();
    expect(adviceToShow("c2", "a", null)).toBe("a");
  });
});
