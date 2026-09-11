import { describe, expect, it } from "vitest";
import { ChatStore, DAY_MS, InMemoryChatRepository, applyRetention, deletesAt, deletesInDays, expiredChats, type Chat } from "../src/index";

const chat = (over: Partial<Chat> = {}): Chat => ({ id: over.id ?? "c", title: "t", createdAt: 0, updatedAt: 0, modelId: "instant", incognito: false, ...over });
const NOW = 100 * DAY_MS;

describe("auto-delete after N days (spec §7.5, S52)", () => {
  it("is off at 0 days and never touches a pinned or incognito chat", () => {
    expect(deletesAt(chat({ updatedAt: 0 }), 0)).toBeNull();
    expect(deletesAt(chat({ updatedAt: 0, pinned: true }), 7)).toBeNull();
    expect(deletesAt(chat({ updatedAt: 0, incognito: true }), 7)).toBeNull();
    expect(expiredChats([chat({ id: "old" }), chat({ id: "pin", pinned: true })], 7, NOW).map((c) => c.id)).toEqual(["old"]);
  });

  it("counts from the last change, not the creation", () => {
    const c = chat({ createdAt: 0, updatedAt: NOW - 6 * DAY_MS });
    expect(deletesAt(c, 7)).toBe(NOW + DAY_MS);
    expect(expiredChats([c], 7, NOW)).toEqual([]);
    expect(expiredChats([c], 7, NOW + DAY_MS)).toEqual([c]);
  });

  it("archived chats age like any other; the boundary is inclusive", () => {
    const due = chat({ id: "due", updatedAt: NOW - 30 * DAY_MS, archived: true });
    const fresh = chat({ id: "fresh", updatedAt: NOW - 30 * DAY_MS + 1 });
    expect(expiredChats([due, fresh], 30, NOW).map((c) => c.id)).toEqual(["due"]);
  });

  it("S20 tag: whole days left, 0 once due, null when the rule does not apply", () => {
    expect(deletesInDays(chat({ updatedAt: NOW - 4.2 * DAY_MS }), 7, NOW)).toBe(3);
    expect(deletesInDays(chat({ updatedAt: NOW }), 1, NOW)).toBe(1);
    expect(deletesInDays(chat({ updatedAt: NOW - 8 * DAY_MS }), 7, NOW)).toBe(0);
    expect(deletesInDays(chat({ updatedAt: 0 }), 0, NOW)).toBeNull();
    expect(deletesInDays(chat({ updatedAt: 0, pinned: true }), 7, NOW)).toBeNull();
  });

  it("a shorter day unit (dev flag) keeps the same arithmetic", () => {
    const minute = 60_000;
    expect(deletesInDays(chat({ updatedAt: NOW - 30_000 }), 1, NOW, minute)).toBe(1);
    expect(expiredChats([chat({ updatedAt: NOW - 61_000 })], 1, NOW, minute)).toHaveLength(1);
  });

  it("applyRetention deletes through the store and leaves incognito and pinned chats alone", async () => {
    const repo = new InMemoryChatRepository({ now: () => NOW - 10 * DAY_MS });
    const store = new ChatStore(repo);
    const old = await store.createChat({ modelId: "instant", title: "old" });
    const kept = await store.createChat({ modelId: "instant", title: "kept", pinned: true });
    const secret = await store.createChat({ modelId: "instant", title: "secret", incognito: true });
    expect(await applyRetention(store, 7, NOW)).toEqual([old.id]);
    const left = (await store.listChats()).map((c) => c.id).sort();
    expect(left).toEqual([kept.id, secret.id].sort());
    expect(await applyRetention(store, 0, NOW)).toEqual([]);
  });

  it("applyRetention skips the chat that is open right now and removes it on a later run", async () => {
    const repo = new InMemoryChatRepository({ now: () => NOW - 10 * DAY_MS });
    const store = new ChatStore(repo);
    const open = await store.createChat({ modelId: "instant", title: "open" });
    const other = await store.createChat({ modelId: "instant", title: "other" });
    expect(await applyRetention(store, 7, NOW, DAY_MS, [open.id])).toEqual([other.id]);
    expect((await store.listChats()).map((c) => c.id)).toEqual([open.id]);
    expect(await applyRetention(store, 7, NOW)).toEqual([open.id]);
  });
});
