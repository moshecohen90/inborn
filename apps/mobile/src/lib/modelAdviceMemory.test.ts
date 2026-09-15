import { beforeEach, describe, expect, it } from "vitest";
import { adviceToShow, resetAdviceMemory } from "./modelAdviceMemory";

describe("advice memory (§7.8: once per reason; Not now is the chat's snooze list)", () => {
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
  it("a key snoozed on the chat row stays hidden even while it holds and even on a fresh run", () => {
    adviceToShow("c1", "a", null);
    expect(adviceToShow("c1", "a", "a", ["a"])).toBeNull();
    resetAdviceMemory();
    expect(adviceToShow("c1", "a", null, ["x", "a"])).toBeNull();
    expect(adviceToShow("c1", "b", null, ["a"])).toBe("b");
  });
});
