import { afterEach, describe, expect, it } from "vitest";
import { MIGRATIONS, SCHEMA_VERSION } from "../src/storage/schema";
import { describeChatRepositoryContract } from "./chatRepositoryContract";
import { installFakeTauri } from "./sqljsTauri";

/* The desktop repository speaks the same SQL as the phones' SQLCipher one; sql.js stands in for the Rust side. */
const realNow = Date.now;
let current: Awaited<ReturnType<typeof installFakeTauri>> | null = null;
afterEach(() => {
  Date.now = realNow;
  current?.uninstall();
  current = null;
});

describeChatRepositoryContract("TauriChatRepository (sql.js)", async ({ now }) => {
  current?.uninstall();
  current = await installFakeTauri();
  Date.now = now;
  const { TauriChatRepository } = await import("../src/adapters/tauri");
  return TauriChatRepository.open();
});

describe("desktop migrations", () => {
  it("brings a v2 database to v3 without touching its rows and stamps user_version", async () => {
    current = await installFakeTauri();
    const { db } = current;
    for (const m of MIGRATIONS.filter((m) => m.version <= 2)) db.exec(`${m.sql}\nPRAGMA user_version = ${m.version};`);
    db.run("INSERT INTO chats (id, title, created_at, updated_at, model_id) VALUES ('c1', 'old', 1, 1, 'instant')");
    db.run("INSERT INTO messages (id, chat_id, role, content, created_at) VALUES ('m1', 'c1', 'assistant', 'before v3', 2)");
    const { migrateDesktop, TauriChatRepository } = await import("../src/adapters/tauri");
    expect(await migrateDesktop()).toBe(SCHEMA_VERSION);
    expect(SCHEMA_VERSION).toBe(5);
    expect(db.exec("PRAGMA user_version")[0]?.values[0]?.[0]).toBe(5);
    expect(db.exec("PRAGMA table_info(messages)")[0]?.values.map((r) => r[1])).toEqual(expect.arrayContaining(["citations_json", "images_json"]));
    const repo = await TauriChatRepository.open();
    const [old] = await repo.listMessages("c1");
    expect(old).toMatchObject({ id: "m1", content: "before v3" });
    expect(old?.citations).toBeUndefined();
    const fresh = await repo.appendMessage({ chatId: "c1", role: "assistant", content: "after [1]", citations: [{ n: 1, docId: "d", docName: "a.pdf", kind: "pdf", page: 1, chunkId: "k", snippet: "s" }] });
    expect((await repo.listMessages("c1"))[1]?.citations).toEqual(fresh.citations);
    expect(await migrateDesktop()).toBe(5);
  });

  it("v4 → v5 adds advice_snoozed as a nullable column: old chats read without it, Not now writes and clears it", async () => {
    current = await installFakeTauri();
    const { db } = current;
    for (const m of MIGRATIONS.filter((m) => m.version <= 4)) db.exec(`${m.sql}\nPRAGMA user_version = ${m.version};`);
    db.run("INSERT INTO chats (id, title, created_at, updated_at, model_id, summary) VALUES ('c1', 'old', 1, 1, 'instant', 'kept')");
    const { migrateDesktop, TauriChatRepository } = await import("../src/adapters/tauri");
    expect(await migrateDesktop()).toBe(5);
    expect(db.exec("PRAGMA table_info(chats)")[0]?.values.map((r) => r[1])).toContain("advice_snoozed");
    expect(db.exec("SELECT advice_snoozed FROM chats WHERE id = 'c1'")[0]?.values[0]?.[0]).toBeNull();
    const repo = await TauriChatRepository.open();
    expect(await repo.getChat("c1")).toMatchObject({ title: "old", summary: "kept" });
    expect((await repo.getChat("c1"))?.adviceSnoozed).toBeUndefined();
    await repo.updateChat("c1", { adviceSnoozed: ["instant>fast|lang:he|"] });
    expect(db.exec("SELECT advice_snoozed FROM chats WHERE id = 'c1'")[0]?.values[0]?.[0]).toBe('["instant>fast|lang:he|"]');
    expect((await repo.getChat("c1"))?.adviceSnoozed).toEqual(["instant>fast|lang:he|"]);
    await repo.updateChat("c1", { adviceSnoozed: null });
    expect(db.exec("SELECT advice_snoozed FROM chats WHERE id = 'c1'")[0]?.values[0]?.[0]).toBeNull();
    expect(await migrateDesktop()).toBe(5);
  });
});
