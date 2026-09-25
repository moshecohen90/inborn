import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { describe, expect, it } from "vitest";
import { wipe, type WebStorageEnv } from "./wipe";
import { IdbChatRepository } from "./web/idbRepository";

/* F378: Settings → Delete everything on the web must leave no chat, message or document behind. */

class MemStorage {
  private m = new Map<string, string>();
  get length() {
    return this.m.size;
  }
  clear() {
    this.m.clear();
  }
  getItem(k: string) {
    return this.m.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.m.set(k, v);
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
  key(i: number) {
    return [...this.m.keys()][i] ?? null;
  }
}

class FakeCaches {
  names = new Set<string>(["workbox-precache-v2-https://app.inbornapp.com/", "inborn-runtime"]);
  keys = async () => [...this.names];
  delete = async (n: string) => this.names.delete(n);
}

type Node = Map<string, Node | "file">;
function fakeOpfs(tree: Node) {
  const dir = (node: Node) => ({
    async *keys() {
      for (const k of [...node.keys()]) yield k;
    },
    async *entries() {
      for (const [k, v] of [...node.entries()]) yield [k, { kind: v === "file" ? "file" : "directory", name: k }] as const;
    },
    async removeEntry(name: string) {
      if (!node.delete(name)) throw new Error("NotFoundError");
    },
  });
  return { getDirectory: async () => dir(tree) } as unknown as StorageManager;
}

function seedDocuments(factory: IDBFactory): Promise<void> {
  return new Promise((resolve) => {
    const r = factory.open("inborn-documents", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("snapshot");
    r.onsuccess = () => {
      const tx = r.result.transaction("snapshot", "readwrite");
      tx.objectStore("snapshot").put({ documents: [{ id: "d1" }] }, "v1");
      tx.oncomplete = () => {
        r.result.close();
        resolve();
      };
    };
  });
}

async function names(factory: IDBFactory): Promise<string[]> {
  return (await factory.databases()).map((d) => d.name ?? "").sort();
}

async function seeded() {
  const factory = new IDBFactory();
  const repo = await IdbChatRepository.open({ factory });
  const chat = await repo.createChat({ modelId: "instant", title: "Name three primary colors." });
  await repo.appendMessage({ chatId: chat.id, role: "user", content: "Name three primary colors." });
  repo.close();
  await seedDocuments(factory);
  const local = new MemStorage();
  local.setItem("inborn.prefs", "{}");
  local.setItem("inborn.web.model", "instant");
  const session = new MemStorage();
  session.setItem("x", "1");
  const caches = new FakeCaches();
  const tree: Node = new Map<string, Node | "file">([
    ["models", new Map<string, Node | "file">([["instant.gguf", "file"], ["instant.gguf.json", "file"]])],
    ["cache", new Map<string, Node | "file">([["e5.gguf", "file"]])],
    ["incoming.pdf", "file"],
  ]);
  const env: WebStorageEnv = { indexedDB: factory, caches: caches as unknown as CacheStorage, storage: fakeOpfs(tree), local: local as unknown as Storage, session: session as unknown as Storage };
  return { factory, env, local, session, caches, tree };
}

describe("web wipe (F378)", () => {
  it("deletes both IndexedDB databases, web storage and every cache but the app-shell precache, and keeps models when not asked", async () => {
    const { factory, env, local, session, caches, tree } = await seeded();
    expect(await names(factory)).toEqual(["inborn", "inborn-documents"]);
    const report = await wipe({ models: false }, env);
    expect(await names(factory)).toEqual([]);
    expect(local.length).toBe(1);
    expect(local.getItem("inborn.web.model")).toBe("instant");
    expect(session.length).toBe(0);
    expect([...caches.names]).toEqual(["workbox-precache-v2-https://app.inbornapp.com/"]);
    expect([...tree.keys()]).toEqual(["models", "cache"]);
    expect(report.deletedDatabases).toBe(2);
    const fresh = await IdbChatRepository.open({ factory });
    expect(await fresh.listChats()).toEqual([]);
    fresh.close();
  });

  it("removes the model files too when the user asked for it", async () => {
    const { env, tree, local } = await seeded();
    await wipe({ models: true }, env);
    expect([...tree.keys()]).toEqual([]);
    expect(local.length).toBe(0);
  });

  it("is not blocked forever by a connection someone left open", async () => {
    const { factory, env } = await seeded();
    const open = await IdbChatRepository.open({ factory });
    const t0 = Date.now();
    await wipe({ models: false }, { ...env, blockedTimeoutMs: 200 });
    expect(Date.now() - t0).toBeLessThan(2000);
    open.close();
    await new Promise((r) => setTimeout(r, 20));
    expect(await names(factory)).toEqual([]);
  });
});
