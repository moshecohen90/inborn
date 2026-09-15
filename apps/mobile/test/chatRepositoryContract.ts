import { describe, expect, it } from "vitest";
import type { ChatRepository } from "@inborn/core";

/* The ChatRepository contract (packages/core/test/chat-repository.test.ts, extended with the §5.3 fields): every persistent implementation must pass it unchanged. */
export const clock = () => {
  let t = 1_000;
  return () => t++;
};

export type OpenRepository = (options: { now: () => number }) => Promise<ChatRepository>;

export function describeChatRepositoryContract(name: string, open: OpenRepository): void {
  describe(`${name} · ChatRepository contract`, () => {
    it("lists pinned first, then most recently updated", async () => {
      const repo = await open({ now: clock() });
      const a = await repo.createChat({ modelId: "instant", title: "a" });
      const b = await repo.createChat({ modelId: "instant", title: "b", pinned: true });
      const c = await repo.createChat({ modelId: "instant", title: "c" });
      await repo.appendMessage({ chatId: a.id, role: "user", content: "bump" });
      expect((await repo.listChats()).map((x) => x.title)).toEqual(["b", "a", "c"]);
      expect(b.incognito).toBe(false);
      expect(c.pinned).toBeUndefined();
    });

    it("appends in order, bumps updatedAt and rejects unknown chats", async () => {
      const repo = await open({ now: clock() });
      const chat = await repo.createChat({ modelId: "instant" });
      const u = await repo.appendMessage({ chatId: chat.id, role: "user", content: "hello" });
      const a = await repo.appendMessage({ chatId: chat.id, role: "assistant", content: "hi", modelId: "instant", usage: { promptTokens: 1, completionTokens: 1, ttftMs: 5, tokPerSec: 10 } });
      expect((await repo.listMessages(chat.id)).map((m) => m.id)).toEqual([u.id, a.id]);
      expect((await repo.getChat(chat.id))?.updatedAt).toBe(a.createdAt);
      expect(a.usage?.tokPerSec).toBe(10);
      await expect(repo.appendMessage({ chatId: "nope", role: "user", content: "x" })).rejects.toThrow(/unknown chat/);
    });

    it("keeps insertion order for equal timestamps", async () => {
      const repo = await open({ now: () => 5 });
      const chat = await repo.createChat({ modelId: "instant" });
      const ids = [];
      for (let i = 0; i < 5; i++) ids.push((await repo.appendMessage({ chatId: chat.id, role: "user", content: `m${i}` })).id);
      expect((await repo.listMessages(chat.id)).map((m) => m.id)).toEqual(ids);
    });

    it("renames, patches messages and deletes with cascade", async () => {
      const repo = await open({ now: clock() });
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
      const repo = await open({ now: clock() });
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
      const repo = await open({ now: clock() });
      const chat = await repo.createChat({ modelId: "instant", title: "t" });
      chat.title = "mutated";
      expect((await repo.getChat(chat.id))?.title).toBe("t");
      const m = await repo.appendMessage({ chatId: chat.id, role: "user", content: "c", usage: { promptTokens: 1, completionTokens: 1, ttftMs: 1, tokPerSec: 1 } });
      m.usage!.tokPerSec = 99;
      expect((await repo.listMessages(chat.id))[0]?.usage?.tokPerSec).toBe(1);
    });

    it("stores every chat field of §5.3 at creation and through updateChat; null clears", async () => {
      const repo = await open({ now: clock() });
      const chat = await repo.createChat({ modelId: "instant", title: "t", personaId: "builtin:writer", folderId: "f1", systemPrompt: "Be brief", thinking: true, pinned: true });
      expect(await repo.getChat(chat.id)).toMatchObject({ personaId: "builtin:writer", folderId: "f1", systemPrompt: "Be brief", thinking: true, pinned: true });
      await repo.updateChat(chat.id, { pinned: false, archived: true, folderId: null, personaId: null, systemPrompt: null, thinking: false, summary: "so far", summaryUpTo: "m9", title: " renamed ", modelId: "sharp" });
      const after = await repo.getChat(chat.id);
      expect(after).toMatchObject({ archived: true, thinking: false, summary: "so far", summaryUpTo: "m9", title: "renamed", modelId: "sharp" });
      expect(after?.pinned).toBeUndefined();
      expect(after?.folderId).toBeUndefined();
      expect(after?.personaId).toBeUndefined();
      expect(after?.systemPrompt).toBeUndefined();
      await repo.updateChat(chat.id, { summary: null, summaryUpTo: null, archived: false });
      const cleared = await repo.getChat(chat.id);
      expect(cleared?.summary).toBeUndefined();
      expect(cleared?.summaryUpTo).toBeUndefined();
      expect(cleared?.archived).toBeUndefined();
      await expect(repo.updateChat("nope", { pinned: true })).resolves.toBeUndefined();
      await expect(repo.updateChat(chat.id, {})).resolves.toBeUndefined();
    });

    it("keeps the §7.8 advice snooze list on the chat row; null and [] clear it; copies never alias", async () => {
      const repo = await open({ now: clock() });
      const chat = await repo.createChat({ modelId: "instant", title: "t" });
      expect((await repo.getChat(chat.id))?.adviceSnoozed).toBeUndefined();
      const keys = ["instant>fast|lang:he|", "fast>sharp-phi||use:code"];
      await repo.updateChat(chat.id, { adviceSnoozed: keys });
      const stored = await repo.getChat(chat.id);
      expect(stored?.adviceSnoozed).toEqual(keys);
      keys.push("mutated");
      expect((await repo.getChat(chat.id))?.adviceSnoozed).toHaveLength(2);
      expect((await repo.listChats()).find((c) => c.id === chat.id)?.adviceSnoozed).toHaveLength(2);
      await repo.updateChat(chat.id, { adviceSnoozed: [] });
      expect((await repo.getChat(chat.id))?.adviceSnoozed).toBeUndefined();
      await repo.updateChat(chat.id, { adviceSnoozed: ["a"] });
      await repo.updateChat(chat.id, { adviceSnoozed: null });
      expect((await repo.getChat(chat.id))?.adviceSnoozed).toBeUndefined();
    });

    it("keeps archived chats in the list, sorted after pinned by recency", async () => {
      const repo = await open({ now: clock() });
      const a = await repo.createChat({ modelId: "instant", title: "a" });
      const b = await repo.createChat({ modelId: "instant", title: "b" });
      await repo.updateChat(a.id, { archived: true });
      await repo.updateChat(b.id, { pinned: true });
      expect((await repo.listChats()).map((c) => [c.title, !!c.pinned, !!c.archived])).toEqual([
        ["b", true, false],
        ["a", false, true],
      ]);
    });

    it("stores reasoningMs and stoppedBy on messages, at append and through updateMessage", async () => {
      const repo = await open({ now: clock() });
      const chat = await repo.createChat({ modelId: "instant" });
      const m = await repo.appendMessage({ chatId: chat.id, role: "assistant", content: "…", reasoning: "hmm", reasoningMs: 1200, stopped: true, stoppedBy: "system", modelId: "sharp" });
      expect(m).toMatchObject({ reasoning: "hmm", reasoningMs: 1200, stopped: true, stoppedBy: "system", modelId: "sharp" });
      expect((await repo.listMessages(chat.id))[0]).toMatchObject({ reasoningMs: 1200, stoppedBy: "system" });
      await repo.updateMessage(chat.id, m.id, { reasoningMs: 1500, stoppedBy: "user", usage: { promptTokens: 2, completionTokens: 3, ttftMs: 4, tokPerSec: 5 } });
      expect((await repo.listMessages(chat.id))[0]).toMatchObject({ reasoningMs: 1500, stoppedBy: "user", usage: { completionTokens: 3 } });
      await expect(repo.updateMessage(chat.id, "nope", { content: "x" })).rejects.toThrow(/unknown message/);
    });

    it("deletes several chats at once with their messages", async () => {
      const repo = await open({ now: clock() });
      const a = await repo.createChat({ modelId: "instant", title: "a" });
      const b = await repo.createChat({ modelId: "instant", title: "b" });
      const c = await repo.createChat({ modelId: "instant", title: "c" });
      await repo.appendMessage({ chatId: a.id, role: "user", content: "keep me out" });
      await repo.appendMessage({ chatId: c.id, role: "user", content: "still here" });
      await repo.deleteChats([a.id, b.id, "nope"]);
      expect((await repo.listChats()).map((x) => x.id)).toEqual([c.id]);
      expect(await repo.listMessages(a.id)).toEqual([]);
      expect((await repo.listMessages(c.id)).map((m) => m.content)).toEqual(["still here"]);
      expect(await repo.search("keep")).toEqual([]);
      await expect(repo.deleteChats([])).resolves.toBeUndefined();
    });

    it("deleteMessagesFrom removes the tail and reports how many went", async () => {
      const repo = await open({ now: clock() });
      const chat = await repo.createChat({ modelId: "instant" });
      const ids = [];
      for (let i = 0; i < 4; i++) ids.push((await repo.appendMessage({ chatId: chat.id, role: i % 2 ? "assistant" : "user", content: `m${i}` })).id);
      expect(await repo.deleteMessagesFrom(chat.id, ids[2]!)).toBe(2);
      expect((await repo.listMessages(chat.id)).map((m) => m.id)).toEqual([ids[0], ids[1]]);
      expect(await repo.deleteMessagesFrom(chat.id, "nope")).toBe(0);
      expect(await repo.deleteMessagesFrom("other", ids[0]!)).toBe(0);
      expect((await repo.listMessages(chat.id)).length).toBe(2);
      expect(await repo.deleteMessagesFrom(chat.id, ids[0]!)).toBe(2);
      expect(await repo.listMessages(chat.id)).toEqual([]);
    });

    it("deleteMessagesFrom clears a summary whose anchor was deleted and keeps one that survives", async () => {
      const repo = await open({ now: clock() });
      const chat = await repo.createChat({ modelId: "instant" });
      const ids = [];
      for (let i = 0; i < 4; i++) ids.push((await repo.appendMessage({ chatId: chat.id, role: "user", content: `m${i}` })).id);
      await repo.updateChat(chat.id, { summary: "first two", summaryUpTo: ids[1] });
      await repo.deleteMessagesFrom(chat.id, ids[3]!);
      expect(await repo.getChat(chat.id)).toMatchObject({ summary: "first two", summaryUpTo: ids[1] });
      await repo.deleteMessagesFrom(chat.id, ids[1]!);
      const after = await repo.getChat(chat.id);
      expect(after?.summary).toBeUndefined();
      expect(after?.summaryUpTo).toBeUndefined();
      expect((await repo.listMessages(chat.id)).map((m) => m.id)).toEqual([ids[0]]);
    });

    it("keeps the citations of an answer (§7.3) through append, update and clear", async () => {
      const repo = await open({ now: clock() });
      const chat = await repo.createChat({ modelId: "instant" });
      const citations = [
        { n: 1, docId: "d1", docName: "lease.pdf", kind: "pdf" as const, page: 4, chunkId: "c1", snippet: "No pets without written consent." },
        { n: 2, docId: "d1", docName: "lease.pdf", kind: "pdf" as const, page: 9, chunkId: "c2", snippet: "Deposit is returned within 30 days." },
      ];
      const plain = await repo.appendMessage({ chatId: chat.id, role: "user", content: "pets?" });
      expect(plain.citations).toBeUndefined();
      const m = await repo.appendMessage({ chatId: chat.id, role: "assistant", content: "Not without consent [1].", citations });
      expect(m.citations).toEqual(citations);
      m.citations![0]!.snippet = "mutated";
      const [, stored] = await repo.listMessages(chat.id);
      expect(stored?.citations).toEqual(citations);
      await repo.updateMessage(chat.id, m.id, { content: "Deposit [2].", citations: [citations[1]!] });
      expect((await repo.listMessages(chat.id))[1]?.citations).toEqual([citations[1]]);
      await repo.updateMessage(chat.id, m.id, { citations: [] });
      expect((await repo.listMessages(chat.id))[1]?.citations).toBeUndefined();
      const none = await repo.appendMessage({ chatId: chat.id, role: "assistant", content: "x", citations: [] });
      expect(none.citations).toBeUndefined();
    });

    it("keeps the photos of a user turn (§7.1 image input) through append, update and clear", async () => {
      const repo = await open({ now: clock() });
      const chat = await repo.createChat({ modelId: "instant" });
      const images = ["file:///images/a.jpg", "file:///images/b.jpg"];
      const plain = await repo.appendMessage({ chatId: chat.id, role: "user", content: "hi" });
      expect(plain.images).toBeUndefined();
      const m = await repo.appendMessage({ chatId: chat.id, role: "user", content: "what is this?", images });
      expect(m.images).toEqual(images);
      m.images!.push("file:///mutated.jpg");
      const [, stored] = await repo.listMessages(chat.id);
      expect(stored?.images).toEqual(images);
      await repo.updateMessage(chat.id, m.id, { images: [images[0]!] });
      expect((await repo.listMessages(chat.id))[1]?.images).toEqual([images[0]]);
      await repo.updateMessage(chat.id, m.id, { images: [] });
      expect((await repo.listMessages(chat.id))[1]?.images).toBeUndefined();
    });
  });
}
