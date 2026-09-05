import { describe, expect, it } from "vitest";
import { ChatStore, InMemoryChatRepository, type NewChat, type NewMessage } from "../src/index";

/** Persistent side that records what it is asked to write. */
class RecordingRepository extends InMemoryChatRepository {
  readonly created: NewChat[] = [];
  readonly appended: NewMessage[] = [];
  override createChat(input: NewChat) {
    this.created.push(input);
    return super.createChat(input);
  }
  override appendMessage(input: NewMessage) {
    this.appended.push(input);
    return super.appendMessage(input);
  }
}

const setup = () => {
  const persistent = new RecordingRepository();
  return { persistent, store: new ChatStore(persistent) };
};

describe("ChatStore incognito rule", () => {
  it("never writes an incognito chat or its messages to the persistent repository", async () => {
    const { persistent, store } = setup();
    const chat = await store.createChat({ modelId: "instant", incognito: true, title: "secret" });
    await store.appendMessage({ chatId: chat.id, role: "user", content: "where is my passport" });
    await store.appendMessage({ chatId: chat.id, role: "assistant", content: "in the drawer" });
    expect(chat.incognito).toBe(true);
    expect(store.isIncognito(chat.id)).toBe(true);
    expect(persistent.created).toEqual([]);
    expect(persistent.appended).toEqual([]);
    expect(await persistent.listChats()).toEqual([]);
    expect(await persistent.listMessages(chat.id)).toEqual([]);
    expect((await store.listMessages(chat.id)).map((m) => m.content)).toEqual(["where is my passport", "in the drawer"]);
  });

  it("writes ordinary chats to the persistent repository with incognito forced off", async () => {
    const { persistent, store } = setup();
    const chat = await store.createChat({ modelId: "instant", title: "lease" });
    await store.appendMessage({ chatId: chat.id, role: "user", content: "hello" });
    expect(persistent.created).toEqual([{ modelId: "instant", title: "lease", incognito: false }]);
    expect(persistent.appended).toHaveLength(1);
    expect(store.isIncognito(chat.id)).toBe(false);
    expect((await persistent.getChat(chat.id))?.incognito).toBe(false);
  });

  it("keeps incognito chats out of search", async () => {
    const { store } = setup();
    const secret = await store.createChat({ modelId: "instant", incognito: true, title: "passport plans" });
    await store.appendMessage({ chatId: secret.id, role: "user", content: "passport renewal" });
    const open = await store.createChat({ modelId: "instant", title: "passport photo" });
    expect((await store.search("passport")).map((h) => h.chatId)).toEqual([open.id]);
  });

  it("lists both sides together, pinned first then newest, and routes rename/delete", async () => {
    let t = 1;
    const persistent = new InMemoryChatRepository({ now: () => t++ });
    const store = new ChatStore(persistent);
    const saved = await store.createChat({ modelId: "instant", title: "saved" });
    const secret = await store.createChat({ modelId: "instant", incognito: true, title: "secret" });
    const pinned = await store.createChat({ modelId: "instant", title: "pinned", pinned: true });
    const list = await store.listChats();
    expect(list.map((c) => c.title)).toEqual(["pinned", "secret", "saved"]);
    expect(list.map((c) => c.incognito)).toEqual([false, true, false]);
    await store.renameChat(secret.id, "renamed");
    expect((await store.getChat(secret.id))?.title).toBe("renamed");
    expect(await persistent.getChat(secret.id)).toBeUndefined();
    await store.deleteChat(secret.id);
    await store.deleteChat(saved.id);
    expect((await store.listChats()).map((c) => c.id)).toEqual([pinned.id]);
    expect(store.isIncognito(secret.id)).toBe(false);
  });

  it("endSession drops every incognito chat and nothing else", async () => {
    const { persistent, store } = setup();
    const saved = await store.createChat({ modelId: "instant", title: "saved" });
    const a = await store.createChat({ modelId: "instant", incognito: true, title: "a" });
    const b = await store.createChat({ modelId: "instant", incognito: true, title: "b" });
    await store.appendMessage({ chatId: a.id, role: "user", content: "x" });
    store.endSession();
    expect((await store.listChats()).map((c) => c.id)).toEqual([saved.id]);
    expect(await store.getChat(a.id)).toBeUndefined();
    expect(await store.listMessages(b.id)).toEqual([]);
    expect(store.isIncognito(a.id)).toBe(false);
    await expect(store.appendMessage({ chatId: a.id, role: "user", content: "late" })).rejects.toThrow(/unknown chat/);
    expect(await persistent.listChats()).toHaveLength(1);
  });
});
