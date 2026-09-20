import { beforeEach, describe, expect, it, vi } from "vitest";
import { afterGeneration, forgetPausedChat, getPausedTurn, noteGenerationEnded, notePausedTurn, ownsPausedTurn, subscribePausedTurn, type PausedTurn } from "./pausedTurn";

const cut = (chatId: string, keptId: string) => ({ chatId, guardStopped: true, keptId });
const finished = (chatId: string, keptId: string | null = "m") => ({ chatId, guardStopped: false, keptId });

describe("afterGeneration (QA F28: the paused line belongs to one turn)", () => {
  it("takes ownership when the guard cut an answer that was kept", () => {
    expect(afterGeneration(null, cut("chat-a", "m1"))).toEqual({ chatId: "chat-a", messageId: "m1" });
  });

  it("keeps nothing when the guard cut an answer with no text to keep", () => {
    expect(afterGeneration(null, { chatId: "chat-a", guardStopped: true, keptId: null })).toBeNull();
  });

  it("releases the turn once its own chat finishes an answer", () => {
    const paused: PausedTurn = { chatId: "chat-a", messageId: "m1" };
    expect(afterGeneration(paused, finished("chat-a"))).toBeNull();
  });

  it("leaves another chat's paused answer alone", () => {
    const paused: PausedTurn = { chatId: "chat-a", messageId: "m1" };
    expect(afterGeneration(paused, finished("chat-b"))).toBe(paused);
  });

  it("moves to the newest cut turn", () => {
    expect(afterGeneration({ chatId: "chat-a", messageId: "m1" }, cut("chat-b", "m2"))).toEqual({ chatId: "chat-b", messageId: "m2" });
  });
});

describe("ownsPausedTurn", () => {
  const turn: PausedTurn = { chatId: "chat-a", messageId: "m1" };
  it("shows the line only on the chat holding the partial answer", () => {
    expect(ownsPausedTurn(turn, "chat-a")).toBe(true);
    expect(ownsPausedTurn(turn, "chat-b")).toBe(false);
  });
  /* The finding itself: a new chat has no id yet, and that is where the stale banner was seen. */
  it("never shows on a chat that does not exist yet, or with no paused turn", () => {
    expect(ownsPausedTurn(turn, null)).toBe(false);
    expect(ownsPausedTurn(null, "chat-a")).toBe(false);
  });
});

describe("the store", () => {
  beforeEach(() => notePausedTurn(null));

  it("tells subscribers when the owner changes, and not when it does not", () => {
    const seen = vi.fn();
    const off = subscribePausedTurn(seen);
    noteGenerationEnded(cut("chat-a", "m1"));
    expect(getPausedTurn()).toEqual({ chatId: "chat-a", messageId: "m1" });
    notePausedTurn({ chatId: "chat-a", messageId: "m1" });
    expect(seen).toHaveBeenCalledTimes(1);
    noteGenerationEnded(finished("chat-a"));
    expect(getPausedTurn()).toBeNull();
    expect(seen).toHaveBeenCalledTimes(2);
    off();
  });

  it("forgets a deleted chat's paused answer, and keeps another chat's", () => {
    noteGenerationEnded(cut("chat-a", "m1"));
    forgetPausedChat("chat-b");
    expect(getPausedTurn()).not.toBeNull();
    forgetPausedChat("chat-a");
    expect(getPausedTurn()).toBeNull();
  });
});
