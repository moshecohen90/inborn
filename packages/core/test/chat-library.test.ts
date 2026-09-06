import { describe, expect, it } from "vitest";
import {
  BUILT_IN_PERSONAS,
  ChatStore,
  FREE_CUSTOM_PERSONA_LIMIT,
  InMemoryChatRepository,
  answerInLanguageInstruction,
  canCreatePersona,
  crisisResources,
  detectCrisis,
  detectLoop,
  directionOf,
  exportChat,
  findPersona,
  isGated,
  languageHint,
  safeFilename,
  scriptOf,
  validatePersona,
  type Chat,
  type ChatMessage,
} from "../src/index";

const repo = () => {
  let t = 1;
  let n = 0;
  return new InMemoryChatRepository({ now: () => t++, newId: () => `id${++n}` });
};

describe("folders", () => {
  it("creates, renames, lists alphabetically and deleting moves chats to the root", async () => {
    const r = repo();
    const work = await r.createFolder(" Work ");
    const home = await r.createFolder("Home");
    expect((await r.listFolders()).map((f) => f.name)).toEqual(["Home", "Work"]);
    await r.renameFolder(home.id, "Family");
    expect((await r.listFolders()).map((f) => f.name)).toEqual(["Family", "Work"]);
    const chat = await r.createChat({ modelId: "instant", title: "lease", folderId: work.id });
    await r.updateChat(chat.id, { pinned: true, archived: true });
    expect(await r.getChat(chat.id)).toMatchObject({ folderId: work.id, pinned: true, archived: true });
    await r.updateChat(chat.id, { pinned: false, archived: false, systemPrompt: "be brief" });
    const after = await r.getChat(chat.id);
    expect(after?.pinned).toBeUndefined();
    expect(after?.archived).toBeUndefined();
    expect(after?.systemPrompt).toBe("be brief");
    await r.updateChat(chat.id, { systemPrompt: null });
    expect((await r.getChat(chat.id))?.systemPrompt).toBeUndefined();
    await r.deleteFolder(work.id);
    expect((await r.getChat(chat.id))?.folderId).toBeUndefined();
    expect(await r.listFolders()).toHaveLength(1);
  });

  it("bulk deletes and deletes messages from a point (edit-and-resend), dropping a summary that no longer applies", async () => {
    const r = repo();
    const a = await r.createChat({ modelId: "instant", title: "a" });
    const b = await r.createChat({ modelId: "instant", title: "b" });
    const m1 = await r.appendMessage({ chatId: a.id, role: "user", content: "one" });
    const m2 = await r.appendMessage({ chatId: a.id, role: "assistant", content: "two" });
    const m3 = await r.appendMessage({ chatId: a.id, role: "user", content: "three" });
    await r.updateChat(a.id, { summary: "s", summaryUpTo: m2.id });
    expect(await r.deleteMessagesFrom(a.id, m3.id)).toBe(1);
    expect((await r.getChat(a.id))?.summary).toBe("s");
    expect(await r.deleteMessagesFrom(a.id, m2.id)).toBe(1);
    expect((await r.listMessages(a.id)).map((m) => m.id)).toEqual([m1.id]);
    expect((await r.getChat(a.id))?.summary).toBeUndefined();
    expect(await r.deleteMessagesFrom(a.id, "nope")).toBe(0);
    await r.deleteChats([a.id, b.id]);
    expect(await r.listChats()).toEqual([]);
  });
});

describe("personas", () => {
  it("ships four built-ins and validates custom ones", () => {
    expect(BUILT_IN_PERSONAS.map((p) => p.id)).toEqual(["builtin:assistant", "builtin:writer", "builtin:tutor", "builtin:translator"]);
    expect(validatePersona({ name: "Lawyer", icon: "scale", systemPrompt: "x", temperature: 0.4 })).toEqual([]);
    expect(validatePersona({ name: "   ", icon: "bad" as never, systemPrompt: "y".repeat(5000), temperature: 3, disclaimer: "z".repeat(300) })).toEqual([
      "name.empty",
      "prompt.long",
      "icon.unknown",
      "temperature.range",
      "disclaimer.long",
    ]);
    expect(validatePersona({ name: "n".repeat(41), icon: "pen", systemPrompt: "" })).toEqual(["name.long"]);
  });

  it("caps custom personas at three on the free tier and lifts the cap for Pro", () => {
    expect(canCreatePersona(FREE_CUSTOM_PERSONA_LIMIT - 1, { pro: false })).toBe(true);
    expect(canCreatePersona(FREE_CUSTOM_PERSONA_LIMIT, { pro: false })).toBe(false);
    expect(canCreatePersona(50, { pro: true })).toBe(true);
    expect(isGated("folders", { pro: false })).toBe(true);
    expect(isGated("folders", { pro: true })).toBe(false);
  });

  it("upserts custom personas and cleans references when one is deleted", async () => {
    const r = repo();
    const p = await r.savePersona({ name: "Coach", icon: "heart", systemPrompt: "cheer", temperature: 1 });
    expect(p.builtIn).toBe(false);
    const p2 = await r.savePersona({ id: p.id, name: "Coach 2", icon: "heart", systemPrompt: "cheer more" });
    expect(p2.id).toBe(p.id);
    expect(p2.createdAt).toBe(p.createdAt);
    expect((await r.listPersonas()).map((x) => x.name)).toEqual(["Coach 2"]);
    expect(findPersona(p.id, await r.listPersonas())?.name).toBe("Coach 2");
    expect(findPersona("builtin:tutor", [])?.name).toBe("Tutor");
    const chat = await r.createChat({ modelId: "instant", personaId: p.id });
    const fact = await r.addMemory({ content: "likes running", personaId: p.id });
    await r.deletePersona(p.id);
    expect((await r.getChat(chat.id))?.personaId).toBeUndefined();
    expect((await r.listMemory()).find((f) => f.id === fact.id)?.personaId).toBeUndefined();
  });
});

describe("memory", () => {
  it("is never read or written from an incognito chat", async () => {
    const store = new ChatStore(repo());
    const open = await store.createChat({ modelId: "instant" });
    const secret = await store.createChat({ modelId: "instant", incognito: true });
    await store.remember(open.id, "prefers metric units");
    await expect(store.remember(secret.id, "leak")).rejects.toThrow(/incognito/);
    expect((await store.memoryFor(open.id)).map((f) => f.content)).toEqual(["prefers metric units"]);
    expect(await store.memoryFor(secret.id)).toEqual([]);
  });

  it("honours the master switch, the per-persona switch and per-persona facts", async () => {
    const store = new ChatStore(repo());
    const chat = await store.createChat({ modelId: "instant" });
    const all = await store.remember(chat.id, "global fact");
    await store.library.addMemory({ content: "tutor only", personaId: "builtin:tutor" });
    expect((await store.memoryFor(chat.id)).map((f) => f.content)).toEqual(["global fact"]);
    expect((await store.memoryFor(chat.id, "builtin:tutor")).map((f) => f.content)).toEqual(["global fact", "tutor only"]);
    await store.setMemoryEnabledFor("builtin:tutor", false);
    expect(await store.memoryFor(chat.id, "builtin:tutor")).toEqual([]);
    await store.library.updateMemory(all.id, { enabled: false });
    expect(await store.memoryFor(chat.id)).toEqual([]);
    await store.library.updateMemory(all.id, { enabled: true, content: "edited" });
    expect((await store.memoryFor(chat.id)).map((f) => f.content)).toEqual(["edited"]);
    await store.setMemoryEnabled(false);
    expect(await store.memoryFor(chat.id)).toEqual([]);
    await store.setMemoryEnabled(true);
    await store.library.clearMemory();
    expect(await store.library.listMemory()).toEqual([]);
  });
});

describe("reports", () => {
  it("stores reports locally, newest first, and deletes them", async () => {
    const r = repo();
    const a = await r.saveReport({ reason: "wrong", note: "bad math", messageText: "2+2=5", modelId: "instant" });
    const b = await r.saveReport({ reason: "other", note: "" });
    expect((await r.listReports()).map((x) => x.id)).toEqual([b.id, a.id]);
    await r.deleteReport(a.id);
    expect(await r.listReports()).toHaveLength(1);
  });
});

describe("detectLoop", () => {
  it("catches word n-gram repetition and character repetition, and ignores healthy text", () => {
    expect(detectLoop("The answer is 42. The answer is 42. The answer is 42.")).toBe(true);
    expect(detectLoop("go on and on and on and on and on")).toBe(true);
    expect(detectLoop("שלום שלום שלום שלום")).toBe(true);
    expect(detectLoop("ははははははははははははははははははははははははははははははははははははは")).toBe(true);
    expect(detectLoop("Here is a summary of the three points you asked about, in order, with one sentence each.")).toBe(false);
    expect(detectLoop("a b a b")).toBe(false);
    expect(detectLoop("")).toBe(false);
  });
});

describe("exportChat", () => {
  const chat: Chat = { id: "c1", title: "Trip to Rome / plan?", createdAt: Date.UTC(2026, 8, 5, 10, 30), updatedAt: 1, modelId: "instant", incognito: false, systemPrompt: "Be brief" };
  const messages: ChatMessage[] = [
    { id: "m1", chatId: "c1", role: "user", content: "Best month?", createdAt: chat.createdAt },
    { id: "m2", chatId: "c1", role: "assistant", content: "**May**.\n\n- mild\n- cheaper", createdAt: chat.createdAt + 1000, modelId: "instant", reasoning: "think", stopped: true, usage: { promptTokens: 10, completionTokens: 5, ttftMs: 100, tokPerSec: 20 } },
  ];

  it("writes Markdown with headings per turn, the system prompt, and optional reasoning", () => {
    const md = exportChat(chat, messages, "markdown", { modelNames: { instant: "Fast" } });
    expect(md.filename).toBe("Trip-to-Rome-plan.md");
    expect(md.mimeType).toBe("text/markdown");
    expect(md.body).toContain("# Trip to Rome / plan?");
    expect(md.body).toContain("> **System prompt:** Be brief");
    expect(md.body).toContain("## You\n\nBest month?");
    expect(md.body).toContain("## Fast\n\n**May**.");
    expect(md.body).toContain("_Stopped_");
    expect(md.body).not.toContain("think");
    expect(md.body.startsWith("---\nai_generated: true\ngenerator: Inborn\nmodel: Fast\ngenerated_at: ")).toBe(true);
    expect(md.body).toContain("Generated with Inborn (on-device AI). Verify before use.");
    expect(exportChat(chat, messages, "markdown", { reasoning: true }).body).toContain("<details><summary>Reasoning</summary>");
  });

  it("writes plain text and JSON", () => {
    const txt = exportChat(chat, messages, "text");
    expect(txt.filename).toBe("Trip-to-Rome-plan.txt");
    expect(txt.body.split("\n")[0]).toBe("Trip to Rome / plan?");
    expect(txt.body).toContain("INSTANT · ");
    expect(txt.body).toContain("Generated with Inborn (on-device AI). Verify before use.");
    const json = exportChat(chat, messages, "json", { now: 0 });
    const parsed = JSON.parse(json.body) as { aiGenerated: boolean; generator: string; chat: { title: string }; messages: { role: string; usage?: unknown; reasoning?: string }[] };
    expect(parsed.aiGenerated).toBe(true);
    expect(parsed.generator).toBe("Inborn (on-device AI)");
    expect(parsed.chat.title).toBe(chat.title);
    expect(parsed.messages).toHaveLength(2);
    expect(parsed.messages[1]!.usage).toBeDefined();
    expect(parsed.messages[1]!.reasoning).toBeUndefined();
  });

  it("makes safe file names for any script", () => {
    expect(safeFilename("תכנון טיול לרומא!")).toBe("תכנון-טיול-לרומא");
    expect(safeFilename("///")).toBe("chat");
    expect(safeFilename("x".repeat(100))).toHaveLength(48);
  });
});

describe("language", () => {
  it("detects direction and script and builds a hint for non-Latin scripts", () => {
    expect(directionOf("שלום world")).toBe("rtl");
    expect(directionOf("123 hello שלום")).toBe("ltr");
    expect(directionOf("!!!")).toBe("ltr");
    expect(scriptOf("מה השעה עכשיו?")).toBe("hebrew");
    expect(scriptOf("ما هو الوقت")).toBe("arabic");
    expect(scriptOf("What time is it")).toBe("latin");
    expect(scriptOf("こんにちは")).toBe("japanese");
    expect(languageHint("מה השעה")).toBe("The user writes in Hebrew. Answer in Hebrew.");
    expect(languageHint("hello")).toBe("");
    expect(answerInLanguageInstruction("Hebrew")).toBe("Answer in Hebrew.");
  });
});

describe("safety", () => {
  it("flags crisis phrases in several languages and maps regions to hotlines", () => {
    expect(detectCrisis("I want to die")).toBe(true);
    expect(detectCrisis("אני רוצה למות")).toBe(true);
    expect(detectCrisis("how do I bake bread")).toBe(false);
    expect(crisisResources("IL")[0]?.phone).toBe("1201");
    expect(crisisResources("us")[0]?.phone).toBe("988");
    expect(crisisResources(undefined).length).toBeGreaterThan(1);
  });
});
