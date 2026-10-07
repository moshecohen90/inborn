import { beforeEach, describe, expect, it, vi } from "vitest";
import { BUNDLED_MANIFEST } from "@inborn/core";
import type { VaultRecord } from "../vault/record";

/* Round 134Q (F463): Android vc24, Fast selected, a photo offered "Download the photo pack · 668 MB" that only HTTPS serves. */

let os = "android";
let record: VaultRecord;
const sizes = new Map<string, number>();
const fetched: string[] = [];
/* Instant, its projector and Fast are on the phone; Fast's 668 MB projector is not. */
const ON_PHONE = ["instant", "vision-qwen35", "fast"];
const fileOf = (id: string) => `file:///app/${BUNDLED_MANIFEST.models.find((m) => m.id === id)!.file}`;

class FakeFile {
  uri: string;
  constructor(base: string | { uri: string }, name?: string) {
    const root = typeof base === "string" ? base : base.uri;
    this.uri = name ? `${root.replace(/\/$/, "")}/${name}` : root;
  }
  get exists() {
    return sizes.has(this.uri);
  }
  get size() {
    return sizes.get(this.uri) ?? 0;
  }
}
vi.mock("expo-file-system", () => ({ File: FakeFile, Directory: FakeFile, Paths: { document: { uri: "file:///doc/" } }, DownloadTask: class {} }));
vi.mock("react-native", () => ({ Platform: { get OS() { return os; } }, AppState: { addEventListener: () => ({ remove: () => undefined }) } }));
vi.mock("../../modules/asset-packs", () => ({
  AssetPackStatus: {},
  AssetPackErrorCode: {},
  hasAssetPacks: () => true,
  getPackPath: () => null,
  fetchPack: async (name: string) => void fetched.push(`play:${name}`),
  getPackState: async () => null,
  addPackListener: () => ({ remove: () => undefined }),
}));
vi.mock("../vault/record", () => ({ readRecord: () => record, writeRecord: (r: VaultRecord) => void (record = r) }));
vi.mock("../vault/paths", () => ({
  bundledModelFile: (id: string) => (ON_PHONE.includes(id) ? new FakeFile(fileOf(id)) : null),
  devFallbackFile: () => new FakeFile("file:///doc/instant.gguf"),
  fileSize: (f: FakeFile) => (f.exists ? f.size : 0),
  modelFile: (name: string) => new FakeFile(`file:///vault/${name}`),
  partialFile: (name: string) => new FakeFile(`file:///vault/${name}.part`),
  safeDelete: () => undefined,
  vaultDir: () => ({ list: () => [] }),
}));
vi.mock("../vault/device", () => ({ readDevice: () => ({ os, chip: "mid" }), freeDiskBytes: () => 64 * 1024 ** 3 }));
vi.mock("../vault/hash", async () => {
  const { BUNDLED_MANIFEST: m } = await import("@inborn/core");
  return { fileGgufHeader: async () => null, fileSha256: async (f: FakeFile) => m.models.find((x) => f.uri.endsWith(x.file))?.sha256 ?? "" };
});
vi.mock("../vault/devFlags", () => ({ DEV_MODELS_BASE_URL: undefined, DEV_MODEL_HOST: undefined, devBuild: () => false }));
vi.mock("../vault/network", () => ({ networkKind: async () => "wifi", onNetworkChange: () => () => undefined }));
vi.mock("../licence/devFlags", () => ({ devBuild: () => false }));
vi.mock("../vault/hf", () => ({ hfHeaders: () => ({}), hfSearchAvailable: () => false }));
vi.mock("../services/storageFull", () => ({ reportStorageFull: () => undefined }));
/* Vitest does not pick `.native` files the way Metro does; the phone's modules are the ones under test. */
vi.mock("../extensions/chatModel", () => import("../extensions/chatModel.native"));

async function phone(platform: "android" | "ios") {
  os = platform;
  vi.resetModules();
  const v = await import("./vision.native");
  await v.visionScanned();
  return v;
}

beforeEach(() => {
  record = { version: 1, installs: {}, imports: {}, hf: {}, downloads: {} };
  sizes.clear();
  fetched.length = 0;
  for (const id of ON_PHONE) sizes.set(fileOf(id), BUNDLED_MANIFEST.models.find((m) => m.id === id)!.bytes);
});

describe("F463 · the photo card offers only a pack this phone can receive", () => {
  it("Android, Fast selected: no 668 MB dead end, the switch to Instant's projector at no cost", async () => {
    const v = await phone("android");
    expect(v.photoPlanHere("fast", false)).toEqual({ kind: "switch", alt: { model: "instant", pack: "vision-qwen35", missing: [], bytes: 0 } });
  });

  it("Android: asking for Fast's pack anyway starts no download and fails as undeliverable", async () => {
    const v = await phone("android");
    const { getVault } = await import("../vault/store");
    await v.installVision("fast");
    expect(fetched).toEqual([]);
    expect(getVault().state("vision-qwen35-2b")).toMatchObject({ kind: "failed", error: "no-delivery" });
  });

  it("iOS, Fast selected: the 668 MB pack over HTTPS stays the offer", async () => {
    const v = await phone("ios");
    const plan = v.photoPlanHere("fast", false);
    expect(plan.kind === "pack" && plan.path).toMatchObject({ pack: "vision-qwen35-2b", bytes: 668_227_264 });
  });
});
