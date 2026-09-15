import { describe, expect, it } from "vitest";
import { isDictatedSend } from "./dictatedDraft";

describe("isDictatedSend (§7.8: dictated messages carry the voice use)", () => {
  it("true when the sent text is the dictation, also with a typed addition around it", () => {
    expect(isDictatedSend("remind me to call mom", "remind me to call mom")).toBe(true);
    expect(isDictatedSend("remind me to call mom ", "  remind me to call mom\n")).toBe(true);
    expect(isDictatedSend("call mom", "please: call mom tomorrow")).toBe(true);
  });
  it("false with no dictation, an empty one, or when the user rewrote the text", () => {
    expect(isDictatedSend(null, "hello")).toBe(false);
    expect(isDictatedSend(undefined, "hello")).toBe(false);
    expect(isDictatedSend("  ", "hello")).toBe(false);
    expect(isDictatedSend("call mom", "email dad")).toBe(false);
  });
});
