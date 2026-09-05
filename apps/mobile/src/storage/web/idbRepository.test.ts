import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { describe, expect, it } from "vitest";
import { IdbChatRepository } from "./idbRepository";

/* The core repository contract (packages/core/test/chat-repository.test.ts) run against the IndexedDB implementation. */
const clock = () => {
  let t = 1_000;
  return () => t++;
};
let n = 0;
const open = () => IdbChatRepository.open({ now: clock(), name: `inborn-test-${n++}`, factory: new IDBFactory() });

describe("IdbChatRepository", () => {
  it("lists pinned first, then most recently updated", async () => {
    const repo = await open();
    const a = await repo.createChat({ modelId: "instant", title: "a" });
    const b = await repo.createChat({ modelId: "instant", title: "b", pinned: true });
    const c = await repo.createChat({ modelId: "instant", title: "c" });
    await repo.appendMessage({ chatId: a.id, role: "user", content: "bump" });
    expect((await repo.listChats()).map((x) => x.title)).toEqual(["b", "a", "c"]);
    expect(b.incognito).toBe(false);
    expect(c.pinned).toBeUndefined();
  });

  it("appends in order, bumps updatedAt and rejects unknown chats", async () => {
    const repo = await open();
    const chat = await repo.createChat({ modelId: "instant" });
    const u = await repo.appendMessage({ chatId: chat.id, role: "user", content: "hello" });
    const a = await repo.appendMessage({ chatId: chat.id, role: "assistant", content: "hi", modelId: "instant", usage: { promptTokens: 1, completionTokens: 1, ttftMs: 5, tokPerSec: 10 } });
    expect((await repo.listMessages(chat.id)).map((m) => m.id)).toEqual([u.id, a.id]);
    expect((await repo.getChat(chat.id))?.updatedAt).toBe(a.createdAt);
    expect(a.usage?.tokPerSec).toBe(10);
    await expect(repo.appendMessage({ chatId: "nope", role: "user", content: "x" })).rejects.toThrow(/unknown chat/);
  });

  it("keeps insertion order for equal timestamps", async () => {
    const repo = await IdbChatRepository.open({ now: () => 5, name: `inborn-test-${n++}`, factory: new IDBFactory() });
    const chat = await repo.createChat({ modelId: "instant" });
    const ids = [];
    for (let i = 0; i < 5; i++) ids.push((await repo.appendMessage({ chatId: chat.id, role: "user", content: `m${i}` })).id);
    expect((await repo.listMessages(chat.id)).map((m) => m.id)).toEqual(ids);
  });

  it("renames, patches messages and deletes with cascade", async () => {
    const repo = await open();
    const chat = await repo.createChat({ modelId: "instant", title: "old" });
    await repo.renameChat(chat.id, "  new title ");
    expect((await repo.getChat(chat.id))?.title).toBe("new title");
    const m = await repo.appendMessage({ chatId: chat.id, role: "assistant", content: "partial" });
    await repo.updateMessage(chat.id, m.id, { stopped: true, content: "partial…" });
    expect(await repo.listMessages(chat.id)).toMatchObject([{ id: m.id, stopped: true, content: "partial…" }]);
    await repo.deleteChat(chat.id);
    expect(await repo.getChat(chat.id)).toBeUndefined();
    expect(await repo.listMessages(chat.id)).toEqual([]);
    await expect(repo.deleteChat(chat.id)).resolves.toBeUndefined();
  });

  it("searches titles and message text with prefix + AND semantics", async () => {
    const repo = await open();
    const lease = await repo.createChat({ modelId: "instant", title: "Lease review" });
    const trip = await repo.createChat({ modelId: "instant", title: "Trip to Rome" });
    await repo.appendMessage({ chatId: trip.id, role: "user", content: "Is my passport valid for Italy?" });
    await repo.appendMessage({ chatId: lease.id, role: "user", content: "The landlord wants a deposit" });
    expect((await repo.search("LEASE")).map((h) => h.chatId)).toEqual([lease.id]);
    expect(await repo.search("passport ital")).toMatchObject([{ chatId: trip.id, title: "Trip to Rome", snippet: "Is my passport valid for Italy?" }]);
    expect(await repo.search("passport paris")).toEqual([]);
    expect(await repo.search("   ")).toEqual([]);
  });

  it("hands out copies, never its own objects", async () => {
    const repo = await open();
    const chat = await repo.createChat({ modelId: "instant", title: "t" });
    chat.title = "mutated";
    expect((await repo.getChat(chat.id))?.title).toBe("t");
    const m = await repo.appendMessage({ chatId: chat.id, role: "user", content: "c", usage: { promptTokens: 1, completionTokens: 1, ttftMs: 1, tokPerSec: 1 } });
    m.usage!.tokPerSec = 99;
    expect((await repo.listMessages(chat.id))[0]?.usage?.tokPerSec).toBe(1);
  });

  it("refuses incognito rows and survives reopening", async () => {
    const factory = new IDBFactory();
    const name = `inborn-test-${n++}`;
    const repo = await IdbChatRepository.open({ now: clock(), name, factory });
    await expect(repo.createChat({ modelId: "instant", incognito: true })).rejects.toThrow(/incognito/);
    const chat = await repo.createChat({ modelId: "instant", title: "kept" });
    await repo.appendMessage({ chatId: chat.id, role: "user", content: "still here" });
    repo.close();
    const again = await IdbChatRepository.open({ now: clock(), name, factory });
    expect((await again.listChats()).map((c) => c.title)).toEqual(["kept"]);
    expect((await again.listMessages(chat.id)).map((m) => m.content)).toEqual(["still here"]);
  });
});
