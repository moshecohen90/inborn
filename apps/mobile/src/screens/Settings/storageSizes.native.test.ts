import { beforeEach, describe, expect, it, vi } from "vitest";

/* F418: Privacy & storage on a phone said Documents 0 B while Documents/documents/ held the two originals. */

const DOC = "file:///container/Documents";
const files = new Map<string, number>();
const trim = (u: string) => u.replace(/\/+$/, "");
const at = (base: string | { uri: string }, name?: string) => {
  const root = trim(typeof base === "string" ? base : base.uri);
  return name ? `${root}/${name}` : root;
};

class FakeFile {
  readonly uri: string;
  constructor(base: string | { uri: string }, name?: string) {
    this.uri = at(base, name);
  }
  get name() {
    return this.uri.slice(this.uri.lastIndexOf("/") + 1);
  }
  get exists() {
    return files.has(this.uri);
  }
  get size() {
    return files.get(this.uri) ?? 0;
  }
}

class FakeDirectory {
  readonly uri: string;
  constructor(base: string | { uri: string }, name?: string) {
    this.uri = at(base, name);
  }
  get name() {
    return this.uri.slice(this.uri.lastIndexOf("/") + 1);
  }
  get exists() {
    return [...files.keys()].some((k) => k.startsWith(`${this.uri}/`));
  }
  list() {
    const children = new Map<string, FakeFile | FakeDirectory>();
    for (const k of files.keys()) {
      if (!k.startsWith(`${this.uri}/`)) continue;
      const rest = k.slice(this.uri.length + 1);
      const head = rest.split("/")[0]!;
      children.set(head, rest.includes("/") ? new FakeDirectory(this.uri, head) : new FakeFile(this.uri, head));
    }
    return [...children.values()];
  }
}

vi.mock("expo-file-system", () => ({ File: FakeFile, Directory: FakeDirectory, Paths: { document: { uri: `${DOC}/` }, cache: { uri: "file:///container/Library/Caches/" } } }));
vi.mock("expo-sqlite", () => ({ defaultDatabaseDirectory: `${DOC}/SQLite` }));
vi.mock("react-native", () => ({ Platform: { OS: "ios" } }));
vi.mock("../../../modules/asset-packs", () => ({ getPackPath: () => null }));
vi.mock("../../vault/hash", () => ({ fileSha256: async () => "" }));
/* Vitest does not pick `.native` files the way Metro does; the phone's module is the one under test. */
vi.mock("../../documents/files", () => import("../../documents/files.native"));

const { storageSizes } = await import("./storageSizes.native");

describe("phone storage sizes (F418)", () => {
  beforeEach(() => {
    files.clear();
    /* The container pass 20 listed after the document rows (raw/qa-container-afterb.txt). */
    files.set(`${DOC}/SQLite/inborn.db`, 4_096);
    files.set(`${DOC}/SQLite/inborn.db-wal`, 2_657_432);
    files.set(`${DOC}/SQLite/inborn.db-shm`, 32_768);
    files.set(`${DOC}/documents/attach-1.txt`, 253);
    files.set(`${DOC}/documents/attach-2.pdf`, 1_773);
    files.set(`${DOC}/documents.json`, 858);
    files.set(`${DOC}/models/e5.gguf`, 467_958_912);
    files.set(`${DOC}/models/vault.json`, 559);
  });

  it("counts the library's copies under Documents, as the Documents screen does (2 documents · 1.98 KB)", async () => {
    const sizes = await storageSizes();
    expect(sizes.documents).toBe(253 + 1_773);
    expect(sizes.chats).toBe(4_096 + 2_657_432);
    expect(sizes.models).toBe(467_958_912);
  });

  it("reads 0 B with no library yet, and does not create the directory to find out", async () => {
    files.delete(`${DOC}/documents/attach-1.txt`);
    files.delete(`${DOC}/documents/attach-2.pdf`);
    expect((await storageSizes()).documents).toBe(0);
    expect([...files.keys()].some((k) => k.includes("/documents/"))).toBe(false);
  });

  it("counts a file in a nested folder too", async () => {
    files.set(`${DOC}/documents/scans/page-1.png`, 10_000);
    expect((await storageSizes()).documents).toBe(253 + 1_773 + 10_000);
  });
});
