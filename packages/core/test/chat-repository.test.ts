import { describe, expect, it } from "vitest";
import { InMemoryChatRepository, matchesTerms, snippetAround, sortChats, titleFromFirstMessage, type Chat } from "../src/index";

const clock = () => {
  let t = 1_000;
  return () => t++;
};

describe("titleFromFirstMessage", () => {
  it("keeps the first six words, whitespace-normalised", () => {
    expect(titleFromFirstMessage("  Summarize   this lease\n for me please quickly ")).toBe("Summarize this lease for me please");
    expect(titleFromFirstMessage("hi")).toBe("hi");
    expect(titleFromFirstMessage("   ")).toBe("");
  });
  it("caps very long titles", () => {
    const title = titleFromFirstMessage("https://example.com/" + "a".repeat(200));
    expect(title.length).toBe(60);
    expect(title.endsWith("…")).toBe(true);
  });
});

describe("search helpers", () => {
  it("matches every term as a case-insensitive word prefix", () => {
    expect(matchesTerms("The Lease Review for Rome", ["lease", "rom"])).toBe(true);
    expect(matchesTerms("The Lease Review for Rome", ["lease", "paris"])).toBe(false);
    expect(matchesTerms("ease of use", ["lease"])).toBe(false);
    expect(matchesTerms("anything", [])).toBe(false);
  });
  it("cuts a snippet around the first hit", () => {
    const text = Array.from({ length: 40 }, (_, i) => `w${i}`).join(" ") + " passport tomorrow";
    const s = snippetAround(text, ["passport"]);
    expect(s.startsWith("…")).toBe(true);
    expect(s).toContain("passport tomorrow");
  });
});

describe("InMemoryChatRepository", () => {
  it("lists pinned first, then most recently updated", async () => {
    const repo = new InMemoryChatRepository({ now: clock() });
    const a = await repo.createChat({ modelId: "instant", title: "a" });
    const b = await repo.createChat({ modelId: "instant", title: "b", pinned: true });
    const c = await repo.createChat({ modelId: "instant", title: "c" });
    await repo.appendMessage({ chatId: a.id, role: "user", content: "bump" });
    expect((await repo.listChats()).map((x) => x.title)).toEqual(["b", "a", "c"]);
    expect(b.incognito).toBe(false);
    expect(c.pinned).toBeUndefined();
  });

  it("appends in order, bumps updatedAt and rejects unknown chats", async () => {
    const now = clock();
    const repo = new InMemoryChatRepository({ now });
    const chat = await repo.createChat({ modelId: "instant" });
    const u = await repo.appendMessage({ chatId: chat.id, role: "user", content: "hello" });
    const a = await repo.appendMessage({ chatId: chat.id, role: "assistant", content: "hi", modelId: "instant", usage: { promptTokens: 1, completionTokens: 1, ttftMs: 5, tokPerSec: 10 } });
    expect((await repo.listMessages(chat.id)).map((m) => m.id)).toEqual([u.id, a.id]);
    expect((await repo.getChat(chat.id))?.updatedAt).toBe(a.createdAt);
    expect(a.usage?.tokPerSec).toBe(10);
    await expect(repo.appendMessage({ chatId: "nope", role: "user", content: "x" })).rejects.toThrow(/unknown chat/);
  });

  it("renames, patches messages and deletes with cascade", async () => {
    const repo = new InMemoryChatRepository({ now: clock() });
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
    const repo = new InMemoryChatRepository({ now: clock() });
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
    const repo = new InMemoryChatRepository({ now: clock() });
    const chat = await repo.createChat({ modelId: "instant", title: "t" });
    chat.title = "mutated";
    expect((await repo.getChat(chat.id))?.title).toBe("t");
    const m = await repo.appendMessage({ chatId: chat.id, role: "user", content: "c", usage: { promptTokens: 1, completionTokens: 1, ttftMs: 1, tokPerSec: 1 } });
    m.usage!.tokPerSec = 99;
    expect((await repo.listMessages(chat.id))[0]?.usage?.tokPerSec).toBe(1);
  });

  it("sortChats is stable for equal keys and does not mutate", () => {
    const base: Chat = { id: "", title: "", createdAt: 0, updatedAt: 5, modelId: "m", incognito: false };
    const input = [{ ...base, id: "x" }, { ...base, id: "y" }];
    expect(sortChats(input).map((c) => c.id)).toEqual(["x", "y"]);
    expect(input.map((c) => c.id)).toEqual(["x", "y"]);
  });
});
