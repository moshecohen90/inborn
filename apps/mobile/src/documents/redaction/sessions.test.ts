import { describe, expect, it } from "vitest";
import { forgetSession, hasSession, moveSession, revealing, sessionFor, setRevealing, snapshot, subscribe } from "./sessions";

describe("redaction sessions", () => {
  it("are per chat key, in RAM, and follow the draft key to the created chat", () => {
    const draft = "ram:draft-1";
    expect(hasSession(draft)).toBe(false);
    const s = sessionFor(draft);
    expect(sessionFor(draft)).toBe(s);
    s.redact("mail me at a@b.co", {});
    expect(hasSession(draft)).toBe(true);
    let ticks = 0;
    const off = subscribe(() => ticks++);
    const before = snapshot();
    setRevealing(draft, true);
    moveSession(draft, "chat-9");
    expect(hasSession(draft)).toBe(false);
    expect(sessionFor("chat-9")).toBe(s);
    expect(revealing("chat-9")).toBe(true);
    expect(sessionFor("chat-9").reveal("send to [EMAIL-1]")).toBe("send to a@b.co");
    expect(snapshot()).toBeGreaterThan(before);
    expect(ticks).toBe(2);
    off();
    forgetSession("chat-9");
    expect(hasSession("chat-9")).toBe(false);
    expect(revealing("chat-9")).toBe(false);
  });
  it("an empty session is dropped on move, not carried", () => {
    sessionFor("ram:draft-2");
    moveSession("ram:draft-2", "chat-10");
    expect(hasSession("chat-10")).toBe(false);
  });
});
