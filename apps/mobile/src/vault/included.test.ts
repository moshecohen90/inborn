import { beforeEach, describe, expect, it, vi } from "vitest";
import { BUNDLED_MANIFEST, type CatalogModel, type InstallState } from "@inborn/core";
import type { VaultRecord } from "./record";
import { includedWithApp } from "./included";

const byId = (id: string) => BUNDLED_MANIFEST.models.find((m) => m.id === id) as CatalogModel;
const vision = byId("vision-qwen35");
const fast = byId("fast");
const ready = (via: "play" | "https" | "bundled"): InstallState => ({ kind: "ready", path: "/x", bytes: 1, sha256: "", via });

describe("F374 · includedWithApp", () => {
  it("a Play fast-follow pack is part of the app, like the iOS bundle", () => {
    expect(includedWithApp(vision, ready("play"))).toBe(true);
    expect(includedWithApp(byId("instant"), ready("play"))).toBe(true);
    expect(includedWithApp(vision, ready("bundled"))).toBe(true);
  });
  it("an on-demand pack, an HTTPS download and a missing pack stay removable", () => {
    expect(includedWithApp(fast, ready("play"))).toBe(false);
    expect(includedWithApp(vision, ready("https"))).toBe(false);
    expect(includedWithApp(vision, { kind: "not-installed" })).toBe(false);
  });
});

/* A Play build where the photo pack and Fast are both bound; `removed` is every pack the app asked Play to delete. */
const VISION = `file:///data/data/com.inbornapp.mobile/files/assetpacks/inborn_model_vision/24/24/assets/${vision.file}`;
const FAST = `file:///data/data/com.inbornapp.mobile/files/assetpacks/inborn_model_fast/24/24/assets/${fast.file}`;
const sizes = new Map<string, number>();
const removed: string[] = [];
const fetched: string[] = [];
let record: VaultRecord;

class FakeFile {
  uri: string;
  constructor(base: string, name?: string) {
    this.uri = name ? `${base.replace(/\/$/, "")}/${name}` : base;
  }
  get exists() {
    return sizes.has(this.uri);
  }
  get size() {
    return sizes.get(this.uri) ?? 0;
  }
}
vi.mock("expo-file-system", () => ({ File: FakeFile }));
vi.mock("react-native", () => ({ Platform: { OS: "android" } }));
vi.mock("./playDelivery", () => ({
  PlayDelivery: class {
    plan = (model: CatalogModel) => ({ via: "play" as const, origin: "Google Play", bytes: model.bytes });
    locate = (model: CatalogModel) => {
      const path = model.id === "vision-qwen35" ? VISION : model.id === "fast" ? FAST : null;
      return path && sizes.has(path) ? path : null;
    };
    deliver = async (model: CatalogModel) => {
      fetched.push(model.id);
      throw new Error("pack unavailable");
    };
    pause = async () => undefined;
    cancel = async () => undefined;
    remove = async (model: CatalogModel) => {
      removed.push(model.id);
      sizes.delete(model.id === "fast" ? FAST : VISION);
    };
  },
}));
vi.mock("./httpsDelivery", () => ({ HttpsDelivery: class {}, NoSpaceError: class extends Error {}, PausedError: class extends Error {}, DEV_MODEL_HOSTS: [] as string[] }));
vi.mock("./record", () => ({ readRecord: () => record, writeRecord: (r: VaultRecord) => void (record = r) }));
vi.mock("./paths", () => ({
  bundledModelFile: () => null,
  devFallbackFile: () => new FakeFile("file:///doc/instant.gguf"),
  fileSize: (f: FakeFile) => (f.exists ? f.size : 0),
  modelFile: (name: string) => new FakeFile(`file:///vault/${name}`),
  safeDelete: () => undefined,
  vaultDir: () => ({ list: () => [] }),
}));
vi.mock("./device", () => ({ readDevice: () => ({ os: "android", chip: "mid" }), freeDiskBytes: () => 64 * 1024 ** 3 }));
vi.mock("./hash", () => ({ fileGgufHeader: async () => null, fileSha256: async () => "" }));
vi.mock("./devFlags", () => ({ DEV_MODELS_BASE_URL: undefined, devBuild: () => false }));
vi.mock("./network", () => ({ networkKind: async () => "wifi" }));
vi.mock("../services/storageFull", () => ({ reportStorageFull: () => undefined }));

const { VaultStore } = await import("./store");
const settled = () => new Promise((r) => setTimeout(r, 0));
const install = (m: CatalogModel) => ({ file: m.file, bytes: m.bytes, sha256: m.sha256, via: "play" as const, installedAt: 1 });

describe("F374 · Remove on a Play-owned pack", () => {
  beforeEach(() => {
    removed.length = 0;
    fetched.length = 0;
    sizes.clear();
    sizes.set(VISION, vision.bytes);
    sizes.set(FAST, fast.bytes);
    record = { version: 1, installs: { "vision-qwen35": install(vision), fast: install(fast) }, imports: {}, hf: {}, downloads: {} };
  });

  it("keeps the photo pack, so no vault open or app update can fetch 205 MB the user removed", async () => {
    const vault = new VaultStore();
    await vault.ready();
    await vault.remove("vision-qwen35");
    expect(removed).toEqual([]);
    expect(vault.state("vision-qwen35").kind).toBe("ready");
    vault.requestKnownPacks();
    await settled();
    expect(fetched).not.toContain("vision-qwen35");
  });

  it("still removes an on-demand pack, and nothing asks Play for it again", async () => {
    const vault = new VaultStore();
    await vault.ready();
    await vault.remove("fast");
    expect(removed).toEqual(["fast"]);
    expect(vault.state("fast").kind).toBe("not-installed");
    vault.requestKnownPacks();
    await settled();
    expect(fetched).not.toContain("fast");
  });
});
