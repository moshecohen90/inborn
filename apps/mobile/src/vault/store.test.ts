import { beforeEach, describe, expect, it, vi } from "vitest";
import { BUNDLED_MANIFEST, type CatalogModel } from "@inborn/core";
import type { VaultRecord } from "./record";

const fast = BUNDLED_MANIFEST.models.find((m) => m.id === "fast") as CatalogModel;
const embed = BUNDLED_MANIFEST.models.find((m) => m.id === "embed-nomic") as CatalogModel;
const PATH = `file:///data/data/com.inbornapp.mobile/files/assetpacks/inborn_model_fast/9/9/assets/${fast.file}`;

/* What Play answers this app version: `bound` is what getPackLocation points at, `fetched` what the app asked for. */
const bound = new Set<string>();
const fetched: string[] = [];
let record: VaultRecord;
const sizes = new Map<string, number>();

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
    locate = (model: CatalogModel) => (model.id === "fast" && bound.has("inborn_model_fast") ? PATH : null);
    /* A pack Play still holds comes back on request without downloading; anything else is not on this device. */
    deliver = async (model: CatalogModel) => {
      fetched.push(model.id);
      if (model.id !== "fast") throw new Error("pack unavailable");
      bound.add("inborn_model_fast");
      sizes.set(PATH, fast.bytes);
      return PATH;
    };
    pause = async () => undefined;
    cancel = async () => undefined;
    remove = async () => undefined;
  },
}));
vi.mock("./httpsDelivery", () => ({
  HttpsDelivery: class {},
  NoSpaceError: class extends Error {},
  PausedError: class extends Error {},
  DEV_MODEL_HOSTS: [] as string[],
}));
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
vi.mock("./hash", () => ({ fileGgufHeader: async () => null, fileSha256: async () => fast.sha256 }));
vi.mock("./devFlags", () => ({ DEV_MODELS_BASE_URL: undefined, devBuild: () => false }));
vi.mock("../services/storageFull", () => ({ reportStorageFull: () => undefined }));

const { VaultStore } = await import("./store");

const emptyRecord = (): VaultRecord => ({ version: 1, installs: {}, imports: {}, hf: {}, downloads: {}, wifiOnly: true });
const hadFast = (): VaultRecord => ({ ...emptyRecord(), installs: { fast: { file: fast.file, bytes: fast.bytes, sha256: fast.sha256, via: "play", installedAt: 1 } } });

const settled = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  record = emptyRecord();
  sizes.clear();
  bound.clear();
  fetched.length = 0;
});

describe("VaultStore after a Play version update (purchases run §K)", () => {
  it("asks Play for a pack the update unbound instead of offering it as a new download", async () => {
    record = hadFast();
    const vault = new VaultStore();
    await vault.ready();
    await settled();
    expect(fetched).toContain("fast");
    expect(vault.state("fast")).toMatchObject({ kind: "ready", path: PATH, via: "play" });
  });

  it("keeps the record of a Play model the update unbound, so the next launch still knows the phone has it", async () => {
    record = hadFast();
    const vault = new VaultStore();
    await vault.ready();
    expect(record.installs.fast).toBeDefined();
  });

  it("leaves a model this device never had alone, so no boot starts an unasked download", async () => {
    const vault = new VaultStore();
    await vault.ready();
    await settled();
    expect(fetched).not.toContain("embed-nomic");
    expect(vault.state("embed-nomic").kind).toBe("not-installed");
  });

  it("still forgets a downloaded file that is gone from the vault directory", async () => {
    record = { ...emptyRecord(), installs: { "embed-nomic": { file: embed.file, bytes: embed.bytes, sha256: embed.sha256, via: "https", installedAt: 1 } } };
    const vault = new VaultStore();
    await vault.ready();
    expect(record.installs["embed-nomic"]).toBeUndefined();
    expect(vault.state("embed-nomic").kind).toBe("not-installed");
  });

  it("re-asks on vault open, for an update that landed after the boot scan", async () => {
    record = emptyRecord();
    const vault = new VaultStore();
    await vault.ready();
    await settled();
    expect(fetched).not.toContain("fast");
    record.installs.fast = { file: fast.file, bytes: fast.bytes, sha256: fast.sha256, via: "play", installedAt: 1 };
    vault.requestKnownPacks();
    await settled();
    expect(fetched).toContain("fast");
  });
});
