import { describe, expect, it } from "vitest";
import { paywallFor } from "../src/index";

describe("value moments (§12.3)", () => {
  it("gates the 4th custom persona on Free and never on Pro", () => {
    expect(paywallFor("free", { kind: "persona", existing: 2 })).toBe(false);
    expect(paywallFor("free", { kind: "persona", existing: 3 })).toBe(true);
    expect(paywallFor("pro", { kind: "persona", existing: 30 })).toBe(false);
  });
  it("gates the 2nd document in the library on Free", () => {
    expect(paywallFor("free", { kind: "document", existing: 0 })).toBe(false);
    expect(paywallFor("free", { kind: "document", existing: 1 })).toBe(true);
    expect(paywallFor("pro", { kind: "document", existing: 9 })).toBe(false);
  });
  it("gates Pro-only models and leaves the rest alone", () => {
    expect(paywallFor("free", { kind: "model", proOnly: true })).toBe(true);
    expect(paywallFor("free", { kind: "model", proOnly: false })).toBe(false);
    expect(paywallFor("work", { kind: "model", proOnly: true })).toBe(false);
  });
  it("answers per feature by tier: voice, folders and memory are Pro, audit log is Work", () => {
    expect(paywallFor("free", { kind: "feature", feature: "voiceConversation" })).toBe(true);
    expect(paywallFor("free", { kind: "feature", feature: "folders" })).toBe(true);
    expect(paywallFor("free", { kind: "feature", feature: "memory" })).toBe(true);
    expect(paywallFor("pro", { kind: "feature", feature: "exportAll" })).toBe(false);
    expect(paywallFor("pro", { kind: "feature", feature: "auditLog" })).toBe(true);
    expect(paywallFor("work", { kind: "feature", feature: "auditLog" })).toBe(false);
  });
});
