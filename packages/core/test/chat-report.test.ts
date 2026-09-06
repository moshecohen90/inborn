import { describe, expect, it } from "vitest";
import { reportBytes, reportText } from "../src/chat/report";

describe("report text (S13)", () => {
  it("carries reason, note, model and the message only when included", () => {
    const at = Date.UTC(2026, 8, 6, 12, 0, 0);
    expect(reportText({ reason: "wrong", note: "off by one", modelId: "instant", messageText: "391" }, at)).toBe("Inborn report · 2026-09-06T12:00:00.000Z\nReason: wrong\nNote: off by one\nModel: instant\n\nMessage:\n391");
    expect(reportText({ reason: "other", note: "" }, at)).toBe("Inborn report · 2026-09-06T12:00:00.000Z\nReason: other");
  });
  it("uses the saved report's own timestamp", () => {
    expect(reportText({ id: "r1", reason: "dangerous", note: "", createdAt: 0 })).toContain("1970-01-01T00:00:00.000Z");
  });
  it("counts note and message bytes", () => {
    expect(reportBytes({ id: "r", reason: "wrong", note: "ab", messageText: "é", createdAt: 0 })).toBe(4);
  });
});
