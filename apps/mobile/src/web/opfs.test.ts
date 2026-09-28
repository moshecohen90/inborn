import { afterEach, describe, expect, it, vi } from "vitest";
import { HEADROOM_BYTES, spaceCheck, storageEstimate } from "./opfs";

describe("spaceCheck", () => {
  it("needs the missing bytes plus headroom", () => {
    expect(spaceCheck({ usage: 100, quota: 1_000 }, 500, 0, 200)).toEqual({ ok: true, free: 900 });
    expect(spaceCheck({ usage: 100, quota: 1_000 }, 800, 0, 200)).toEqual({ ok: false, free: 900, needed: 1_000 });
    expect(spaceCheck({ usage: 100, quota: 1_000 }, 800, 300, 200)).toEqual({ ok: true, free: 900 });
  });
  it("passes when the browser gives no quota", () => {
    expect(spaceCheck({ usage: null, quota: null }, 5e9)).toEqual({ ok: true, free: null });
  });
});

/* F442: Chromium's estimate() counted only the OPFS sidecars (31 MB) with 2.69 GB of models on disk. */
const QUOTA = 10_770_000_000;
const RAW_USAGE = 30_545_299;
const MODELS = { "fast.gguf": 1_280_000_000, "fast.gguf.json": 180, "instant.gguf": 533_000_000, "instant.gguf.json": 180 };
const CACHE = { "sharp-photo.gguf": 668_227_264, "instant-photo.gguf": 204_987_232 };
const MEASURED = Object.values(MODELS).reduce((a, b) => a + b, 0) + Object.values(CACHE).reduce((a, b) => a + b, 0);

function fakeStorage(estimate: () => Promise<StorageEstimate>, dirs: Record<string, Record<string, number>> = { models: MODELS, cache: CACHE }): StorageManager {
  const file = (size: number) => ({ kind: "file", getFile: async () => ({ size }) });
  const dir = (m: Record<string, number>) => ({
    kind: "directory",
    async *entries() {
      for (const [k, v] of Object.entries(m)) yield [k, file(v)];
    },
  });
  return {
    estimate,
    persisted: async () => true,
    getDirectory: async () => ({ getDirectoryHandle: async (n: string) => (dirs[n] ? dir(dirs[n]) : Promise.reject(new Error("NotFoundError"))) }),
  } as unknown as StorageManager;
}

describe("storageEstimate counts what the app stored (F442)", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("reads the OPFS bytes when the browser's usage misses them", async () => {
    vi.stubGlobal("navigator", { storage: fakeStorage(async () => ({ usage: RAW_USAGE, quota: QUOTA })) });
    const e = await storageEstimate();
    expect(e.usage).toBe(MEASURED);
    expect(e.quota).toBe(QUOTA);
    expect(e.persisted).toBe(true);
  });

  it("keeps the browser's figure when it is the larger one", async () => {
    vi.stubGlobal("navigator", { storage: fakeStorage(async () => ({ usage: 5e9, quota: QUOTA })) });
    expect((await storageEstimate()).usage).toBe(5e9);
  });

  it("stays unknown when estimate() is missing", async () => {
    vi.stubGlobal("navigator", { storage: fakeStorage(() => Promise.reject(new TypeError("estimate is not a function"))) });
    const e = await storageEstimate();
    expect(e.usage).toBeNull();
    expect(e.quota).toBeNull();
  });

  it("falls back to the browser's figure when OPFS cannot be walked", async () => {
    const storage = fakeStorage(async () => ({ usage: RAW_USAGE, quota: QUOTA }));
    vi.stubGlobal("navigator", { storage: { ...storage, estimate: storage.estimate, persisted: storage.persisted, getDirectory: () => Promise.reject(new Error("SecurityError")) } });
    expect((await storageEstimate()).usage).toBe(RAW_USAGE);
  });

  it("the door refuses a download the raw estimate would have let through", async () => {
    vi.stubGlobal("navigator", { storage: fakeStorage(async () => ({ usage: RAW_USAGE, quota: QUOTA })) });
    const bytes = 8_000_000_000;
    expect(spaceCheck({ usage: RAW_USAGE, quota: QUOTA }, bytes).ok).toBe(true);
    expect(spaceCheck(await storageEstimate(), bytes)).toEqual({ ok: false, free: QUOTA - MEASURED, needed: bytes + HEADROOM_BYTES });
  });
});
