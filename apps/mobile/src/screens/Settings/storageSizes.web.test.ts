import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { describe, expect, it } from "vitest";
import { storageSizes, valueBytes } from "./storageSizes";
import { IdbChatRepository } from "../../storage/web/idbRepository";

/* F379: Privacy & storage on web reports what IndexedDB and OPFS really hold, not "in memory · 0 B". */

function opfsWith(files: Record<string, number>, cache: Record<string, number> = {}): StorageManager {
  const file = (size: number) => ({ kind: "file", getFile: async () => ({ size }) });
  const dir = (m: Record<string, number>) => ({
    kind: "directory",
    async *entries() {
      for (const [k, v] of Object.entries(m)) yield [k, file(v)];
    },
  });
  const dirs: Record<string, ReturnType<typeof dir>> = { models: dir(files), cache: dir(cache) };
  return { getDirectory: async () => ({ getDirectoryHandle: async (n: string) => dirs[n] ?? Promise.reject(new Error("NotFoundError")) }) } as unknown as StorageManager;
}

describe("web storage sizes (F379)", () => {
  it("counts chats in IndexedDB and model bytes in OPFS", async () => {
    const factory = new IDBFactory();
    const repo = await IdbChatRepository.open({ factory });
    const chat = await repo.createChat({ modelId: "instant", title: "Name three primary colors." });
    await repo.appendMessage({ chatId: chat.id, role: "assistant", content: "Red, yellow and blue.".repeat(50) });
    repo.close();
    const sizes = await storageSizes({ indexedDB: factory, storage: opfsWith({ "instant.gguf": 533_000_000, "instant.gguf.json": 200 }, { "e5.gguf": 467_958_912 }) });
    expect(sizes.chats).toBeGreaterThan(1000);
    expect(sizes.models).toBe(533_000_200 + 467_958_912);
    expect(sizes.documents).toBe(0);
    expect((await factory.databases()).map((d) => d.name)).toEqual(["inborn"]);
  });

  /* F408: extensions land next to the chat model in OPFS, so Models counts them, and the row says so. */
  it("counts every downloaded extension under Models", async () => {
    const { extensions } = await import("@inborn/core");
    const files: Record<string, number> = { "Qwen3.5-0.8B-Q4_K_M.gguf": 532_517_120 };
    for (const e of extensions()) files[e.file] = e.bytes;
    const sizes = await storageSizes({ indexedDB: new IDBFactory(), storage: opfsWith(files) });
    expect(sizes.models).toBe(532_517_120 + 467_958_912 + 204_987_232);
    const en = JSON.parse((await import("node:fs")).readFileSync(`${__dirname}/../../../../../packages/i18n/locales/en.json`, "utf8")) as Record<string, string>;
    expect(en["storage.models.web"]).toMatch(/extensions included/);
  });

  /* F418's web side: a file kept in the documents database is counted under Documents, never under Chats. */
  it("counts a document the browser keeps under Documents", async () => {
    const { copyIntoLibrary, registerBlob, storedBytes, whenStored } = await import("../../documents/files");
    const picked = registerBlob(new Blob([new Uint8Array(1_773)]), "turbine-report.pdf");
    const kept = copyIntoLibrary(picked, "d1", "turbine-report.pdf");
    expect(await whenStored(kept)).toBe(true);
    expect(storedBytes()).toBe(1_773);
    const sizes = await storageSizes({ indexedDB: globalThis.indexedDB, storage: opfsWith({}) });
    expect(sizes.documents).toBeGreaterThanOrEqual(1_773);
    expect(sizes.chats).toBe(0);
  });

  it("counts vectors by their buffer size", () => {
    expect(valueBytes({ v: new Float32Array(1024) })).toBe(1 + 4096);
  });
});
