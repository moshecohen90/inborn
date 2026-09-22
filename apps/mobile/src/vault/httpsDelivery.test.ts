import { beforeEach, describe, expect, it, vi } from "vitest";
import { BUNDLED_MANIFEST, WIFI_ONLY_ABOVE_BYTES, type CatalogModel, type NetworkKind } from "@inborn/core";

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

/** `net` and `wifiOnly` are what the §10.1 #4 gate reads; the poll is 1 ms so a parked download is testable. */
function delivery(options: { wifiOnly?: boolean; network?: NetworkKind } = {}) {
  const saved = new Map<string, unknown>();
  const net = { kind: options.network ?? "wifi", reads: 0 };
  const ctx = {
    manifest: BUNDLED_MANIFEST,
    wifiOnly: () => options.wifiOnly ?? false,
    network: async () => {
      net.reads++;
      return net.kind;
    },
    savedDownload: (id: string) => saved.get(id),
    saveDownload: (id: string, s: unknown) => (s === null ? saved.delete(id) : saved.set(id, s)),
  };
  return { d: new HttpsDelivery(ctx, 1), saved, net };
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

describe("Wi-Fi-only downloads (spec §10.1 #4, F60)", () => {
  const settle = () => new Promise((r) => setTimeout(r, 10));

  it("takes Wi-Fi straight away and asks the network only once", async () => {
    const { d, net } = delivery({ wifiOnly: true, network: "wifi" });
    const events: string[] = [];
    expect(await d.deliver(model, (e) => events.push(e.type))).toBe(FINAL);
    expect(events).not.toContain("waiting-for-wifi");
    expect(net.reads).toBe(1);
    expect(gets).toHaveLength(1);
  });

  it("parks a 1.2 GB model on cellular, says so once, and fetches nothing until Wi-Fi arrives", async () => {
    expect(model.bytes).toBeGreaterThan(WIFI_ONLY_ABOVE_BYTES);
    const { d, net } = delivery({ wifiOnly: true, network: "cellular" });
    const events: string[] = [];
    const done = d.deliver(model, (e) => events.push(e.type));
    await settle();
    expect(events.filter((e) => e === "waiting-for-wifi")).toHaveLength(1);
    expect(gets).toEqual([]);
    expect(disk.has(PART)).toBe(false);
    net.kind = "wifi";
    expect(await done).toBe(FINAL);
    expect(gets).toHaveLength(1);
    expect(disk.get(FINAL)).toBe(TOTAL);
  });

  it("spends the data plan when the user turned the switch off", async () => {
    const { d } = delivery({ wifiOnly: false, network: "cellular" });
    const events: string[] = [];
    expect(await d.deliver(model, (e) => events.push(e.type))).toBe(FINAL);
    expect(events).not.toContain("waiting-for-wifi");
    expect(gets).toHaveLength(1);
  });

  it("waits on an unknown path too: a VPN or a tether bills like cellular", async () => {
    const { d, net } = delivery({ wifiOnly: true, network: "unknown" });
    const done = d.deliver(model, () => undefined);
    await settle();
    expect(gets).toEqual([]);
    net.kind = "ethernet";
    expect(await done).toBe(FINAL);
  });

  it("with no path at all it waits whatever the switch says", async () => {
    const { d, net } = delivery({ wifiOnly: false, network: "none" });
    const done = d.deliver(model, () => undefined);
    await settle();
    expect(gets).toEqual([]);
    net.kind = "cellular";
    expect(await done).toBe(FINAL);
  });

  it("Cancel while parked ends the wait instead of leaving it on the clock", async () => {
    const { d } = delivery({ wifiOnly: true, network: "cellular" });
    const done = d.deliver(model, () => undefined).catch((e: unknown) => (e as Error).message);
    await settle();
    await d.cancel(model);
    expect(await done).toBe("paused");
    expect(gets).toEqual([]);
  });
});
