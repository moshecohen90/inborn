import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { describe, expect, it } from "vitest";
import { IDB_VERSION, IdbChatRepository } from "./idbRepository";
import { clock } from "../../../test/chatRepositoryContract";

/* IndexedDB-specific behaviour; the shared contract runs in test/chatRepository.test.ts. */
let n = 0;
const name = () => `inborn-idb-${n++}`;

/** A database exactly as the web stream's v1 wrote it: chats + messages with byChat / byId only. */
function seedV1(factory: IDBFactory, dbName: string, chat: Record<string, unknown>, messages: Record<string, unknown>[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const r = factory.open(dbName, 1);
    r.onupgradeneeded = () => {
      const db = r.result;
      db.createObjectStore("chats", { keyPath: "id" });
      const m = db.createObjectStore("messages", { keyPath: "seq", autoIncrement: true });
      m.createIndex("byChat", "chatId", { unique: false });
      m.createIndex("byId", "id", { unique: true });
    };
    r.onsuccess = () => {
      const db = r.result;
      const tx = db.transaction(["chats", "messages"], "readwrite");
      tx.objectStore("chats").add(chat);
      for (const m of messages) tx.objectStore("messages").add(m);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => reject(tx.error);
    };
    r.onerror = () => reject(r.error);
  });
}

describe("IdbChatRepository", () => {
  it("refuses incognito rows and survives reopening with every field", async () => {
    const factory = new IDBFactory();
    const dbName = name();
    const repo = await IdbChatRepository.open({ now: clock(), name: dbName, factory });
    await expect(repo.createChat({ modelId: "instant", incognito: true })).rejects.toThrow(/incognito/);
    const chat = await repo.createChat({ modelId: "instant", title: "kept", systemPrompt: "Be brief", thinking: false });
    const m = await repo.appendMessage({ chatId: chat.id, role: "assistant", content: "still here", reasoningMs: 40, stoppedBy: "user", stopped: true });
    await repo.updateChat(chat.id, { pinned: true, summary: "s", summaryUpTo: m.id, folderId: "f" });
    repo.close();
    const again = await IdbChatRepository.open({ now: clock(), name: dbName, factory });
    expect(again.version).toBe(IDB_VERSION);
    expect(await again.listChats()).toMatchObject([{ title: "kept", systemPrompt: "Be brief", thinking: false, pinned: true, summary: "s", summaryUpTo: m.id, folderId: "f" }]);
    expect(await again.listMessages(chat.id)).toMatchObject([{ content: "still here", reasoningMs: 40, stoppedBy: "user", stopped: true }]);
    again.close();
  });

  it("upgrades a v1 database in place: old rows stay readable, tail deletes work through the new index", async () => {
    const factory = new IDBFactory();
    const dbName = name();
    await seedV1(
      factory,
      dbName,
      { id: "c1", title: "from v1", createdAt: 1, updatedAt: 3, modelId: "instant", incognito: false, pinned: true },
      [
        { id: "m1", chatId: "c1", role: "user", content: "first", createdAt: 2 },
        { id: "m2", chatId: "c1", role: "assistant", content: "second", createdAt: 3, stopped: true },
        { id: "m3", chatId: "c1", role: "user", content: "third", createdAt: 3 },
      ],
    );
    const repo = await IdbChatRepository.open({ now: clock(), name: dbName, factory });
    expect(repo.version).toBe(IDB_VERSION);
    expect(await repo.listChats()).toEqual([{ id: "c1", title: "from v1", createdAt: 1, updatedAt: 3, modelId: "instant", incognito: false, pinned: true }]);
    expect((await repo.listMessages("c1")).map((m) => m.id)).toEqual(["m1", "m2", "m3"]);
    expect(await repo.deleteMessagesFrom("c1", "m2")).toBe(2);
    expect((await repo.listMessages("c1")).map((m) => m.id)).toEqual(["m1"]);
    await repo.updateChat("c1", { archived: true, thinking: true });
    expect(await repo.getChat("c1")).toMatchObject({ archived: true, thinking: true, pinned: true });
    repo.close();
  });

  it("never leaks undefined-valued keys or false flags out of storage", async () => {
    const repo = await IdbChatRepository.open({ now: clock(), name: name(), factory: new IDBFactory() });
    const chat = await repo.createChat({ modelId: "instant", thinking: false });
    await repo.updateChat(chat.id, { pinned: true });
    await repo.updateChat(chat.id, { pinned: false, archived: false });
    expect(Object.keys((await repo.getChat(chat.id))!).sort()).toEqual(["createdAt", "id", "incognito", "modelId", "thinking", "title", "updatedAt"]);
    const m = await repo.appendMessage({ chatId: chat.id, role: "user", content: "x", stopped: false });
    expect(Object.keys((await repo.listMessages(chat.id))[0]!).sort()).toEqual(["chatId", "content", "createdAt", "id", "role"]);
    expect(Object.keys(m).sort()).toEqual(["chatId", "content", "createdAt", "id", "role"]);
    repo.close();
  });
});
