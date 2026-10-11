import { beforeEach, describe, expect, it, vi } from "vitest";
import { BUNDLED_MANIFEST, type CatalogModel } from "@inborn/core";
import type { VaultRecord } from "./record";
import { userTap, type UserTap } from "./intent";

const fast = BUNDLED_MANIFEST.models.find((m) => m.id === "fast") as CatalogModel;
const embed = BUNDLED_MANIFEST.models.find((m) => m.id === "embed-e5") as CatalogModel;
const PATH = `file:///data/data/com.inbornapp.mobile/files/assetpacks/inborn_model_fast/9/9/assets/${fast.file}`;

/* What Play answers this app version: `bound` is what getPackLocation points at, `fetched` what the app asked for. */
const bound = new Set<string>();
const fetched: string[] = [];
/* Packs Play reports COMPLETED on this device (getPackState), and the fetches that carried no tap. */
const held = new Set<string>();
const silentFetches: string[] = [];
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
    heldOnDevice = async (model: CatalogModel) => held.has(model.id);
    deliver = async (model: CatalogModel, _emit: unknown, opts?: { silent?: boolean }) => {
      fetched.push(model.id);
      if (opts?.silent) silentFetches.push(model.id);
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
  silentFetches.length = 0;
  held.clear();
  cancelled.length = 0;
  hang.clear();
});

describe("VaultStore after a Play version update (purchases run §K)", () => {
  it("rebinds a pack the update unbound when Play reports it COMPLETED, with no tap and no dialog", async () => {
    record = hadFast();
    held.add("fast");
    const vault = new VaultStore();
    await vault.ready();
    await settled();
    await settled();
    expect(silentFetches).toEqual(["fast"]);
    expect(vault.state("fast")).toMatchObject({ kind: "ready", path: PATH, via: "play" });
  });

  /* A fetch for a pack Play no longer holds is a real download, so it waits for the tap (S02). */
  it("asks Play for nothing a version update unbound unless Play holds it; the user's tap brings it back", async () => {
    record = hadFast();
    const vault = new VaultStore();
    await vault.ready();
    await settled();
    expect(fetched).toEqual([]);
    expect(vault.state("fast").kind).toBe("not-installed");
    await vault.install("fast", userTap(fast.bytes));
    expect(fetched).toEqual(["fast"]);
    expect(vault.state("fast")).toMatchObject({ kind: "ready", path: PATH, via: "play" });
  });

  /* F254 / round 52b: "verified by Play, then by sha256" is only true while the app hashes what Play delivered. */
  it("hashes a Play-delivered pack like any other, and rejects it on a mismatch without deleting Play's files", async () => {
    record = hadFast();
    sha = "0".repeat(64);
    const vault = new VaultStore();
    await vault.ready();
    await vault.install("fast", userTap(fast.bytes));
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

  /* Founder, 11.10: Play opened on a 1.94 GB download (Fast 1,280,835,840 B + its projector 668,227,264 B) he never asked for. */
  it("a phone that once had Fast and its projector fetches neither on boot or vault open when Play no longer holds them", async () => {
    const vf = BUNDLED_MANIFEST.models.find((m) => m.id === "vision-qwen35-2b") as CatalogModel;
    record = { ...hadFast(), installs: { ...hadFast().installs, "vision-qwen35-2b": { file: vf.file, bytes: vf.bytes, sha256: vf.sha256, via: "play", installedAt: 1 } } };
    const vault = new VaultStore();
    await vault.ready();
    await settled();
    await vault.requestKnownPacks();
    await settled();
    expect(fetched).toEqual([]);
    expect(vault.state("fast").kind).toBe("not-installed");
    expect(vault.state("vision-qwen35-2b").kind).toBe("not-installed");
  });
});

describe("VaultStore · a chat model and its photo pack are one choice on Play", () => {
  it("Download Instant fetches its projector with it", async () => {
    const vault = new VaultStore();
    await vault.ready();
    await vault.install("instant", userTap(1));
    await settled();
    expect(fetched.sort()).toEqual(["instant", "vision-qwen35"]);
    expect(vault.photoPackOf("instant")?.id).toBe("vision-qwen35");
  });

  it("Download Fast fetches Fast alone: no Instant, and no projector Play cannot bring", async () => {
    const vault = new VaultStore();
    await vault.ready();
    await vault.install("fast", userTap(fast.bytes));
    await settled();
    expect(fetched).toEqual(["fast"]);
    expect(vault.photoPackOf("fast")).toBeNull();
  });

  it("Cancel on Instant cancels both Play fetches and leaves both downloadable again", async () => {
    hang.add("instant").add("vision-qwen35");
    const vault = new VaultStore();
    await vault.ready();
    void vault.install("instant", userTap(1));
    await settled();
    expect(vault.state("vision-qwen35").kind).toBe("delivering");
    await vault.cancel("instant");
    expect(cancelled.sort()).toEqual(["instant", "vision-qwen35"]);
    expect(vault.state("instant").kind).toBe("not-installed");
    expect(vault.state("vision-qwen35").kind).toBe("not-installed");
  });

  it("an update fetches nothing Play does not hold, not even a delivered Instant", async () => {
    const instant = BUNDLED_MANIFEST.models.find((m) => m.id === "instant") as CatalogModel;
    record = { ...emptyRecord(), installs: { instant: { file: instant.file, bytes: instant.bytes, sha256: instant.sha256, via: "play", installedAt: 1 } } };
    const vault = new VaultStore();
    await vault.ready();
    await settled();
    expect(fetched).toEqual([]);
  });
});

describe("VaultStore · nothing downloads without the user's tap (S02)", () => {
  it("refuses an install that carries no tap, and asks Play for nothing", async () => {
    const vault = new VaultStore();
    await vault.ready();
    for (const tap of [undefined, null, {}, { bytes: 0 }]) await expect(vault.install("fast", tap as unknown as UserTap)).rejects.toThrow(/without a user tap/);
    await expect(vault.resume("fast", undefined as unknown as UserTap)).rejects.toThrow(/without a user tap/);
    expect(fetched).toEqual([]);
    expect(vault.state("fast").kind).toBe("not-installed");
  });
});

describe("VaultStore.lastDelivery (F206)", () => {
  it("names the pack Play delivered, so the Proof screen can print it after the download is over", async () => {
    record = hadFast();
    const vault = new VaultStore();
    await vault.ready();
    await vault.install("fast", userTap(fast.bytes));
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
