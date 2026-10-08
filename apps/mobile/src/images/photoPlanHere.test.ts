import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BUNDLED_MANIFEST } from "@inborn/core";
import type { VaultRecord } from "../vault/record";

/* Round 134Q (F463): Android vc24, Fast selected, a photo offered "Download the photo pack · 668 MB" that only HTTPS serves. */

let os = "android";
/* False on a device where Play Core cannot bind (no Play services). */
let play = true;
let record: VaultRecord;
const sizes = new Map<string, number>();
const fetched: string[] = [];
/* Instant, its projector and Fast are on the phone; Fast's 668 MB projector is not. */
const ON_PHONE = ["instant", "vision-qwen35", "fast"];
let onPhone: string[] = ON_PHONE;
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
  hasAssetPacks: () => play,
  getPackPath: () => null,
  fetchPack: async (name: string) => void fetched.push(`play:${name}`),
  getPackState: async () => null,
  addPackListener: () => ({ remove: () => undefined }),
}));
vi.mock("../vault/record", () => ({ readRecord: () => record, writeRecord: (r: VaultRecord) => void (record = r) }));
vi.mock("../vault/paths", () => ({
  bundledModelFile: (id: string) => (onPhone.includes(id) ? new FakeFile(fileOf(id)) : null),
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
  onPhone = ON_PHONE;
  play = true;
  for (const id of ON_PHONE) sizes.set(fileOf(id), BUNDLED_MANIFEST.models.find((m) => m.id === id)!.bytes);
});

describe("the photo card offers only a pack this phone can receive", () => {
  it("Android, Fast selected: Fast's 668 MB pack is offered through Play, with Instant as the way out", async () => {
    const v = await phone("android");
    const plan = v.photoPlanHere("fast", false);
    expect(plan).toMatchObject({ kind: "pack", path: { pack: "vision-qwen35-2b", bytes: 668_227_264 }, alt: { model: "instant", missing: [] } });
  });

  it("Android: the download asks Play for inborn_model_vision_fast and nothing else", async () => {
    const v = await phone("android");
    /* The fake Play never reports completion, so only the request is checked. */
    void v.installVision("fast");
    await vi.waitFor(() => expect(fetched).toEqual(["play:inborn_model_vision_fast"]));
  });

  it("Android without Play: no pack is offered, the switch to Instant's projector at no cost", async () => {
    play = false;
    const v = await phone("android");
    expect(v.photoPlanHere("fast", false)).toEqual({ kind: "switch", alt: { model: "instant", pack: "vision-qwen35", missing: [], bytes: 0 } });
    const { getVault } = await import("../vault/store");
    expect(getVault().deliveryReachable()).toBe(false);
  });

  it("Android without Play: asking for Fast's pack anyway starts no download and fails as undeliverable", async () => {
    play = false;
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

describe("F463 · a model sees on this phone only through a pack that is here or can come here", () => {
  it("Android: Fast sees through Play's pack; without Play, Fast does not see and the attach sheet offers Instant", async () => {
    expect((await phone("android")).modelHasVision("fast")).toBe(true);
    play = false;
    const v = await phone("android");
    expect(v.modelHasVision("fast")).toBe(false);
    expect(v.modelHasVision("instant")).toBe(true);
    const { seerOf } = await import("../extensions/photoCard");
    /* Chat.tsx: `seer = modelSees ? null : seerOf(photoPlanNow)`, the offer that replaces the own-pack install. */
    expect(seerOf(v.photoPlanHere("fast", false))).toBe("instant");
  });

  it("Android: Fast sees once its pack is on the phone", async () => {
    onPhone = [...ON_PHONE, "vision-qwen35-2b"];
    sizes.set(fileOf("vision-qwen35-2b"), BUNDLED_MANIFEST.models.find((m) => m.id === "vision-qwen35-2b")!.bytes);
    const v = await phone("android");
    expect(v.modelHasVision("fast")).toBe(true);
  });

  it("iOS: Fast sees while its pack is still to download, because HTTPS can bring it", async () => {
    const v = await phone("ios");
    expect(v.resolveVision("fast")).toBeNull();
    expect(v.modelHasVision("fast")).toBe(true);
  });

  it("a model without vision never sees", async () => {
    const v = await phone("ios");
    expect(v.modelHasVision("sharp-phi")).toBe(false);
  });

  it("the Model sheet's Good at line names photos only for a model that sees here", () => {
    const sheet = readFileSync(join(__dirname, "../components/chat/ModelSheet.tsx"), "utf8");
    expect(sheet).toContain('goodAtUses(model, Platform.OS === "web" ? WEB_HERE : { photos: modelHasVision(model.id), voice: true })');
  });
});
