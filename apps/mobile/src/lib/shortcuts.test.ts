import { describe, expect, it } from "vitest";
import { emitShortcut, onShortcut, shortcutSubscribers } from "./shortcuts";

describe("shortcut bus", () => {
  it("fans out to every subscriber and forgets the unsubscribed", () => {
    const seen: string[] = [];
    const offA = onShortcut((id) => seen.push(`a:${id}`));
    const offB = onShortcut((id) => seen.push(`b:${id}`));
    emitShortcut("new-chat");
    offA();
    emitShortcut("toggle-incognito");
    offB();
    emitShortcut("stop");
    expect(seen).toEqual(["a:new-chat", "b:new-chat", "b:toggle-incognito"]);
    expect(shortcutSubscribers()).toBe(0);
  });

  it("survives a subscriber that unsubscribes while an event is being delivered", () => {
    const seen: string[] = [];
    const off = onShortcut(() => {
      seen.push("first");
      off();
    });
    onShortcut(() => seen.push("second"))();
    const offLast = onShortcut(() => seen.push("last"));
    emitShortcut("search");
    offLast();
    expect(seen).toEqual(["first", "last"]);
  });
});
