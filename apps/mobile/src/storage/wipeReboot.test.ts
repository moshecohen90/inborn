import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * F419: Delete everything, then onboarding under "Chats could not be opened. Inborn started over and kept the old file".
 * Traced on the simulator (docs/qa/ios-fix-109/raw/sim-wipe-trace-before.txt): the route change after the wipe remounts
 * the root layout, so two boots open the new database at once. Each found the Keychain empty and made its own key; the
 * first created the file with its key, the second could not read it and moved it aside as unreadable.
 */

(globalThis as { __DEV__?: boolean }).__DEV__ = false;

const keychain = new Map<string, string>();
/* Every native call yields, as the bridge does: that is what lets two boots interleave. */
const hop = () => new Promise((r) => setTimeout(r, 1));

vi.mock("expo-secure-store", () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 1,
  getItemAsync: async (k: string) => {
    await hop();
    return keychain.get(k) ?? null;
  },
  setItemAsync: async (k: string, v: string) => {
    await hop();
    keychain.set(k, v);
  },
  deleteItemAsync: async (k: string) => void keychain.delete(k),
}));

let drawn = 0;
vi.mock("expo-crypto", () => ({
  getRandomBytesAsync: async (n: number) => {
    await hop();
    return new Uint8Array(n).fill(++drawn);
  },
  randomUUID: () => `id-${++drawn}`,
}));

/** One SQLCipher file per name: the first keyed write fixes its key, and any other key reads it as "not a database". */
const files = new Map<string, { key: string | null; version: number }>();
const quarantined: string[] = [];

class FakeDb {
  private key: string | null = null;
  constructor(private readonly name: string) {}
  private file() {
    let f = files.get(this.name);
    if (!f) files.set(this.name, (f = { key: null, version: 0 }));
    return f;
  }
  private read() {
    const f = this.file();
    if (f.key !== null && f.key !== this.key) throw new Error("SQLiteErrorException: Error code 26: file is not a database");
    return f;
  }
  private write() {
    const f = this.read();
    f.key ??= this.key;
    return f;
  }
  async execAsync(sql: string) {
    await hop();
    const key = /PRAGMA key = "x'([0-9a-f]+)'"/.exec(sql);
    if (key) return void (this.key = key[1]!);
    const version = /PRAGMA user_version = (\d+)/.exec(sql);
    if (version) return void (this.write().version = Number(version[1]));
    if (/journal_mode|CREATE|INSERT/i.test(sql)) this.write();
    else this.read();
  }
  async getFirstAsync(sql: string) {
    await hop();
    const f = this.read();
    return /user_version/.test(sql) ? { user_version: f.version } : { n: 0 };
  }
  async getAllAsync(sql: string) {
    await hop();
    this.read();
    return /quick_check/.test(sql) ? [{ quick_check: "ok" }] : [];
  }
  async runAsync() {
    await hop();
    this.write();
    return { changes: 0, lastInsertRowId: 0 };
  }
  async withTransactionAsync(task: () => Promise<void>) {
    await task();
  }
  async closeAsync() {}
}

vi.mock("expo-sqlite", () => ({ openDatabaseAsync: async (name: string) => new FakeDb(name) }));
vi.mock("./dbFile", () => ({
  deleteDatabaseFiles: (name: string) => void files.delete(name),
  quarantineDatabase: (name: string) => {
    quarantined.push(name);
    files.delete(name);
    return `${name}.corrupt-test`;
  },
  promoteDatabase: () => undefined,
  sqlDriverOf: () => ({}),
}));

const { SqliteChatRepository, databaseKeyHex } = await import("./sqliteRepository");
const { dismissRepair, repairOutcome } = await import("./repairNotice");
const { SECURE_ITEMS } = await import("./secureItems");

describe("the first boot after Delete everything (F419)", () => {
  beforeEach(() => {
    keychain.clear();
    files.clear();
    quarantined.length = 0;
    dismissRepair();
  });

  it("gives every caller that finds no key the same new key", async () => {
    const keys = await Promise.all([databaseKeyHex(), databaseKeyHex(), databaseKeyHex()]);
    expect(new Set(keys).size).toBe(1);
    expect(keychain.get(SECURE_ITEMS.dbKey)).toBe(keys[0]);
  });

  it("two boots at once open one database with one key, and nothing is called unreadable", async () => {
    await Promise.all([SqliteChatRepository.open(), SqliteChatRepository.open()]);
    expect(quarantined).toEqual([]);
    expect(repairOutcome()).toBeNull();
    expect(files.get("inborn.db")?.key).toBe(keychain.get(SECURE_ITEMS.dbKey));
  });

  it("a file that really is unreadable is still kept aside and reported (F58 stays)", async () => {
    files.set("inborn.db", { key: "an-old-key-the-keychain-lost", version: 5 });
    await SqliteChatRepository.open();
    expect(quarantined).toEqual(["inborn.db"]);
    expect(repairOutcome()).toMatchObject({ kind: "started-fresh", quarantined: "inborn.db.corrupt-test" });
  });
});
