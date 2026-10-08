import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BUNDLED_MANIFEST } from "@inborn/core";
import type { VaultRecord } from "./record";

/*
 * The vault the app uses (`getVault()`, called by AppServices and every screen) with the real devFlags and the real
 * catalog: on an Android release build a file is deliverable only through a Play pack, never through its HTTPS entry.
 */
let play = true;
let record: VaultRecord;
vi.stubGlobal("__DEV__", false);
vi.mock("expo-file-system", () => {
  class F {
    uri: string;
    constructor(base: string | { uri: string }, name?: string) {
      this.uri = `${typeof base === "string" ? base : base.uri}/${name ?? ""}`;
    }
    get exists() {
      return false;
    }
  }
  return { File: F, Directory: F, Paths: { document: { uri: "file:///doc" } }, DownloadTask: class {} };
});
vi.mock("react-native", () => ({ Platform: { OS: "android" }, AppState: { addEventListener: () => ({ remove: () => undefined }) } }));
vi.mock("../../modules/asset-packs", () => ({
  AssetPackStatus: {},
  AssetPackErrorCode: {},
  hasAssetPacks: () => play,
  getPackPath: () => null,
  fetchPack: async () => null,
  getPackState: async () => null,
  addPackListener: () => ({ remove: () => undefined }),
}));
vi.mock("./record", () => ({ readRecord: () => record, writeRecord: (r: VaultRecord) => void (record = r) }));
vi.mock("./paths", () => ({
  bundledModelFile: () => null,
  devFallbackFile: () => ({ exists: false }),
  fileSize: () => 0,
  modelFile: (name: string) => ({ uri: `file:///vault/${name}`, exists: false }),
  partialFile: (name: string) => ({ uri: `file:///vault/${name}.part`, exists: false }),
  safeDelete: () => undefined,
  vaultDir: () => ({ list: () => [] }),
}));
vi.mock("./device", () => ({ readDevice: () => ({ os: "android", chip: "mid" }), freeDiskBytes: () => 64 * 1024 ** 3 }));
vi.mock("./network", () => ({ networkKind: async () => "wifi", onNetworkChange: () => () => undefined }));
vi.mock("./hf", () => ({ hfHeaders: () => ({}), hfSearchAvailable: () => false }));
vi.mock("./hash", () => ({ fileGgufHeader: async () => null, fileSha256: async () => "" }));
vi.mock("../licence/devFlags", () => ({ devBuild: () => false }));
vi.mock("../services/storageFull", () => ({ reportStorageFull: () => undefined }));

const playPacked = (id: string) => BUNDLED_MANIFEST.models.find((m) => m.id === id)!.delivery.some((d) => d.kind === "play-asset-pack");

async function vault() {
  vi.resetModules();
  return (await import("./store")).getVault();
}

beforeEach(() => {
  play = true;
  record = { version: 1, installs: {}, imports: {}, hf: {}, downloads: {} };
  delete process.env.EXPO_PUBLIC_DEV_MODEL_HOST;
  delete process.env.EXPO_PUBLIC_MODELS_BASE_URL;
});

describe("Android release: the app's vault delivers only through Play packs", () => {
  it("canDeliver is true exactly for the catalog files that have a Play pack; an HTTPS entry never counts", async () => {
    const v = await vault();
    for (const m of BUNDLED_MANIFEST.models) expect(v.canDeliver(m.id), m.id).toBe(playPacked(m.id));
    expect(v.canDeliver("vision-qwen35-2b")).toBe(true);
    expect(v.canDeliver("vision-qwen35-4b")).toBe(false);
  });

  it("without Play on the device nothing is deliverable, HTTPS entries included", async () => {
    play = false;
    const v = await vault();
    for (const m of BUNDLED_MANIFEST.models) expect(v.canDeliver(m.id), m.id).toBe(false);
    expect(v.deliveryReachable()).toBe(false);
  });

  it("the vault builds its one delivery itself, and nothing else in the app hands it another", () => {
    const store = readFileSync(join(__dirname, "store.ts"), "utf8");
    expect(store.match(/new (PlayDelivery|HttpsDelivery)\(/g)).toHaveLength(2);
    expect(store).toContain("return (shared ??= new VaultStore());");
    const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : /\.tsx?$/.test(e.name) && !/\.test\./.test(e.name) ? [join(dir, e.name)] : []));
    const others = walk(join(__dirname, "..")).filter((f) => !f.endsWith(join("vault", "store.ts")) && /new (PlayDelivery|HttpsDelivery|VaultStore)\(/.test(readFileSync(f, "utf8")));
    expect(others).toEqual([]);
  });
});
