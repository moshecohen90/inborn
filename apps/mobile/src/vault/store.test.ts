import { beforeEach, describe, expect, it, vi } from "vitest";
import { BUNDLED_MANIFEST, type CatalogModel } from "@inborn/core";
import type { VaultRecord } from "./record";

const fast = BUNDLED_MANIFEST.models.find((m) => m.id === "fast") as CatalogModel;
const embed = BUNDLED_MANIFEST.models.find((m) => m.id === "embed-e5") as CatalogModel;
const PATH = `file:///data/data/com.inbornapp.mobile/files/assetpacks/inborn_model_fast/9/9/assets/${fast.file}`;

/* What Play answers this app version: `bound` is what getPackLocation points at, `fetched` what the app asked for. */
const bound = new Set<string>();
const fetched: string[] = [];
const cancelled: string[] = [];
/* Ids whose delivery stays in flight until cancelled, like a Play pack mid-download. */
const hang = new Set<string>();
let record: VaultRecord;
const sizes = new Map<string, number>();
/* What the mocked hasher answers, so a Play delivery can be handed a bad shard. */
let sha: string;
const deleted: string[] = [];

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
    plan = (model: CatalogModel) => (model.delivery.some((d) => d.kind === "play-asset-pack") ? { via: "play" as const, origin: "Google Play", bytes: model.bytes } : null);
    locate = (model: CatalogModel) => (model.id === "fast" && bound.has("inborn_model_fast") ? PATH : null);
    /* A pack Play still holds comes back on request without downloading; anything else is not on this device. */
    deliver = async (model: CatalogModel) => {
      fetched.push(model.id);
      if (hang.has(model.id)) return new Promise<string>(() => undefined);
      if (model.id !== "fast") throw new Error("pack unavailable");
      bound.add("inborn_model_fast");
      sizes.set(PATH, fast.bytes);
      return PATH;
    };
    pause = async () => undefined;
    cancel = async (model: CatalogModel) => void cancelled.push(model.id);
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
  safeDelete: (f: FakeFile) => void deleted.push(f.uri),
  vaultDir: () => ({ list: () => [] }),
}));
vi.mock("./device", () => ({ readDevice: () => ({ os: "android", chip: "mid" }), freeDiskBytes: () => 64 * 1024 ** 3 }));
vi.mock("./hash", () => ({ fileGgufHeader: async () => null, fileSha256: async () => sha }));
vi.mock("./devFlags", () => ({ DEV_MODELS_BASE_URL: undefined, devBuild: () => false }));
vi.mock("./network", () => ({ networkKind: async () => "wifi" }));
vi.mock("../services/storageFull", () => ({ reportStorageFull: () => undefined }));

const { VaultStore } = await import("./store");

const emptyRecord = (): VaultRecord => ({ version: 1, installs: {}, imports: {}, hf: {}, downloads: {} });
const hadFast = (): VaultRecord => ({ ...emptyRecord(), installs: { fast: { file: fast.file, bytes: fast.bytes, sha256: fast.sha256, via: "play", installedAt: 1 } } });

const settled = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  sha = fast.sha256;
  deleted.length = 0;
  record = emptyRecord();
  sizes.clear();
  bound.clear();
  fetched.length = 0;
  cancelled.length = 0;
  hang.clear();
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

  /* F254 / round 52b: "verified by Play, then by sha256" is only true while the app hashes what Play delivered. */
  it("hashes a Play-delivered pack like any other, and rejects it on a mismatch without deleting Play's files", async () => {
    record = hadFast();
    sha = "0".repeat(64);
    const vault = new VaultStore();
    await vault.ready();
    await settled();
    expect(vault.state("fast")).toMatchObject({ kind: "corrupt", reason: "hash-mismatch", via: "play" });
    expect(deleted, "Play owns the pack files; the app must not delete them").toEqual([]);
  });

  it("keeps the record of a Play model the update unbound, so the next launch still knows the phone has it", async () => {
    record = hadFast();
    const vault = new VaultStore();
    await vault.ready();
    expect(record.installs.fast).toBeDefined();
  });

  /* Founder, 8.10: 700 MB arrived right after the install with no way to stop it. Nothing moves before a tap. */
  it("a fresh install asks Play for nothing, not even Instant", async () => {
    const vault = new VaultStore();
    await vault.ready();
    await settled();
    expect(fetched).toEqual([]);
    expect(vault.state("instant").kind).toBe("not-installed");
  });

  it("leaves a model this device never had alone, so no boot starts an unasked download", async () => {
    const vault = new VaultStore();
    await vault.ready();
    await settled();
    expect(fetched).not.toContain("embed-e5");
    expect(vault.state("embed-e5").kind).toBe("not-installed");
  });

  it("still forgets a downloaded file that is gone from the vault directory", async () => {
    record = { ...emptyRecord(), installs: { "embed-e5": { file: embed.file, bytes: embed.bytes, sha256: embed.sha256, via: "https", installedAt: 1 } } };
    const vault = new VaultStore();
    await vault.ready();
    expect(record.installs["embed-e5"]).toBeUndefined();
    expect(vault.state("embed-e5").kind).toBe("not-installed");
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

describe("VaultStore · a chat model and its photo pack are one choice on Play", () => {
  it("Download Instant fetches its projector with it", async () => {
    const vault = new VaultStore();
    await vault.ready();
    await vault.install("instant");
    await settled();
    expect(fetched.sort()).toEqual(["instant", "vision-qwen35"]);
    expect(vault.photoPackOf("instant")?.id).toBe("vision-qwen35");
  });

  it("Download Fast fetches Fast alone: no Instant, and no projector Play cannot bring", async () => {
    const vault = new VaultStore();
    await vault.ready();
    await vault.install("fast");
    await settled();
    expect(fetched).toEqual(["fast"]);
    expect(vault.photoPackOf("fast")).toBeNull();
  });

  it("Cancel on Instant cancels both Play fetches and leaves both downloadable again", async () => {
    hang.add("instant").add("vision-qwen35");
    const vault = new VaultStore();
    await vault.ready();
    void vault.install("instant");
    await settled();
    expect(vault.state("vision-qwen35").kind).toBe("delivering");
    await vault.cancel("instant");
    expect(cancelled.sort()).toEqual(["instant", "vision-qwen35"]);
    expect(vault.state("instant").kind).toBe("not-installed");
    expect(vault.state("vision-qwen35").kind).toBe("not-installed");
  });

  it("an update re-asks for a delivered Instant without fetching a projector the user removed", async () => {
    const instant = BUNDLED_MANIFEST.models.find((m) => m.id === "instant") as CatalogModel;
    record = { ...emptyRecord(), installs: { instant: { file: instant.file, bytes: instant.bytes, sha256: instant.sha256, via: "play", installedAt: 1 } } };
    const vault = new VaultStore();
    await vault.ready();
    await settled();
    expect(fetched).toEqual(["instant"]);
  });
});

describe("VaultStore.lastDelivery (F206)", () => {
  it("names the pack Play delivered, so the Proof screen can print it after the download is over", async () => {
    record = hadFast();
    const vault = new VaultStore();
    await vault.ready();
    await settled();
    expect(vault.lastDelivery()).toMatchObject({ id: "fast", name: fast.name, via: "play", bytes: fast.bytes });
  });

  it("is null while the vault holds nothing this phone can load", async () => {
    const vault = new VaultStore();
    await vault.ready();
    await settled();
    expect(vault.lastDelivery()).toBeNull();
  });

  it("does not name a download whose file is gone from the vault directory", async () => {
    record = { ...emptyRecord(), installs: { "embed-e5": { file: embed.file, bytes: embed.bytes, sha256: embed.sha256, via: "https", installedAt: 9 } } };
    const vault = new VaultStore();
    await vault.ready();
    await settled();
    expect(vault.lastDelivery()).toBeNull();
  });
});
