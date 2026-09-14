import { describe, expect, it } from "vitest";
import { completedUpTo, firstLineForSpeech, nextAnnouncement, plainForSpeech } from "./announce";

describe("streaming announcements (QA T26)", () => {
  it("announces only completed sentences and moves the cursor past them", () => {
    const a = nextAnnouncement("Water boils at 100 degrees. Salt raises", 0);
    expect(a).toEqual({ upTo: 27, text: "Water boils at 100 degrees." });
    expect(nextAnnouncement("Water boils at 100 degrees. Salt raises", 27)).toBeNull();
    const b = nextAnnouncement("Water boils at 100 degrees. Salt raises it! And", 27);
    expect(b?.text).toBe("Salt raises it!");
  });
  it("treats a line break as a boundary and strips markdown for the voice", () => {
    expect(completedUpTo("## Steps\n- **one**\n- two", 0)).toBe(19);
    expect(plainForSpeech("## Steps\n- **one**\n")).toBe("Steps one");
    expect(nextAnnouncement("Say \"yes.\" Then", 0)?.text).toBe("Say \"yes.\"");
  });
  it("a row's label is its first line, cut to a readable length", () => {
    expect(firstLineForSpeech("\n**Short answer.**\nMore")).toBe("Short answer.");
    expect(firstLineForSpeech("x".repeat(200))).toHaveLength(160);
  });
});
