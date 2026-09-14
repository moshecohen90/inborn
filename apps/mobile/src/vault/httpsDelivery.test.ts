import { beforeEach, describe, expect, it, vi } from "vitest";
import { BUNDLED_MANIFEST, type CatalogModel } from "@inborn/core";

/* An in-memory vault directory: File objects share one map of uri → bytes, and the download task writes into it. */
const disk = new Map<string, number>();
const gets: { url: string; from: number }[] = [];
class FakeFile {
  constructor(public uri: string) {}
  get exists() {
    return disk.has(this.uri);
  }
  get size() {
    return disk.get(this.uri) ?? 0;
  }
  delete() {
    disk.delete(this.uri);
  }
  move(dest: FakeFile) {
    /* Settles on a later tick, like SDK 57's promise-returning move (QA O10). */
    return new Promise<void>((r) =>
      setTimeout(() => {
        disk.set(dest.uri, this.size);
        disk.delete(this.uri);
        r();
      }, 5),
    );
  }
  static createDownloadTask(url: string, file: FakeFile, opts: { onProgress?: (p: { bytesWritten: number }) => void }) {
    return fakeTask(url, file, 0, opts);
  }
}
const fakeTask = (url: string, file: FakeFile, from: number, opts: { onProgress?: (p: { bytesWritten: number }) => void }) => ({
  state: "active",
  async downloadAsync() {
    gets.push({ url, from });
    disk.set(file.uri, TOTAL);
    opts.onProgress?.({ bytesWritten: TOTAL - from });
    return { uri: file.uri };
  },
  async resumeAsync() {
    return this.downloadAsync();
  },
  savable: () => ({ url, fileUri: file.uri, isDirectory: false, resumeData: "x" }),
  cancel() {},
});
vi.mock("expo-file-system", () => ({
  File: FakeFile,
  DownloadTask: {
    fromSavable: (saved: { url: string; fileUri: string; resumeData?: string }, opts: { onProgress?: (p: { bytesWritten: number }) => void }) => fakeTask(saved.url, new FakeFile(saved.fileUri), Number(saved.resumeData ?? 0), opts),
  },
}));
vi.mock("react-native", () => ({ Platform: { OS: "android" } }));
vi.mock("./devFlags", () => ({ DEV_MODEL_HOST: undefined, devBuild: () => false }));
vi.mock("./hf", () => ({ hfHeaders: async () => ({}), hfSearchAvailable: () => false }));
vi.mock("../proof/transfers", () => ({ recordTransfer: () => undefined }));
vi.mock("./paths", () => ({
  modelFile: (name: string) => new FakeFile(`/vault/${name}`),
  partialFile: (name: string) => new FakeFile(`/vault/${name}.part`),
  fileSize: (f: FakeFile) => (f.exists ? f.size : 0),
  safeDelete: (f: FakeFile) => f.delete(),
}));

const { HttpsDelivery } = await import("./httpsDelivery");
const model = BUNDLED_MANIFEST.models.find((m) => m.id === "embed-nomic") as CatalogModel;
const TOTAL = model.bytes;
const FINAL = `/vault/${model.file}`;
const PART = `${FINAL}.part`;

function delivery() {
  const saved = new Map<string, unknown>();
  const ctx = { manifest: BUNDLED_MANIFEST, wifiOnly: () => false, savedDownload: (id: string) => saved.get(id), saveDownload: (id: string, s: unknown) => (s === null ? saved.delete(id) : saved.set(id, s)) };
  return { d: new HttpsDelivery(ctx), saved };
}

beforeEach(() => {
  disk.clear();
  gets.length = 0;
  vi.stubGlobal("fetch", async () => new Response(null, { status: 200, headers: { "content-length": String(TOTAL), "accept-ranges": "bytes", etag: '"e1"' } }));
});

describe("HttpsDelivery.deliverPart (QA F20)", () => {
  it("a completed download lands the final file and leaves no .part or resume record", async () => {
    const { d, saved } = delivery();
    const events: string[] = [];
    const path = await d.deliver(model, (e) => events.push(e.type));
    expect(path).toBe(FINAL);
    expect(disk.get(FINAL)).toBe(TOTAL);
    expect(disk.has(PART)).toBe(false);
    expect(saved.size).toBe(0);
    expect(gets).toEqual([{ url: `${BUNDLED_MANIFEST.baseUrl}/${model.file}`, from: 0 }]);
    expect(events).toContain("progress");
  });
  it("Try again with a full-size .part renames it instead of fetching from byte 0", async () => {
    const { d, saved } = delivery();
    disk.set(PART, TOTAL);
    saved.set(model.id, { url: `${BUNDLED_MANIFEST.baseUrl}/${model.file}`, fileUri: PART, isDirectory: false, etag: '"e1"' });
    expect(await d.deliver(model, () => undefined)).toBe(FINAL);
    expect(gets).toEqual([]);
    expect(disk.get(FINAL)).toBe(TOTAL);
    expect(disk.has(PART)).toBe(false);
    expect(saved.size).toBe(0);
  });
  it("Try again with a partial .part continues from its last byte", async () => {
    const { d, saved } = delivery();
    disk.set(PART, 24_981_504);
    saved.set(model.id, { url: `${BUNDLED_MANIFEST.baseUrl}/${model.file}`, fileUri: PART, isDirectory: false, etag: '"e1"' });
    expect(await d.deliver(model, () => undefined)).toBe(FINAL);
    expect(gets).toEqual([{ url: `${BUNDLED_MANIFEST.baseUrl}/${model.file}`, from: 24_981_504 }]);
    expect(disk.get(FINAL)).toBe(TOTAL);
    expect(disk.has(PART)).toBe(false);
  });
});
