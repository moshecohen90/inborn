import { beforeEach, describe, expect, it, vi } from "vitest";
import { BUNDLED_MANIFEST, type CatalogModel } from "@inborn/core";
import type { VaultRecord } from "./record";
import { planVisionTurn } from "../lib/visionGate";

const vision = BUNDLED_MANIFEST.models.find((m) => m.id === "vision-qwen35") as CatalogModel;
const instant = BUNDLED_MANIFEST.models.find((m) => m.id === "instant") as CatalogModel;
const APP = "file:///var/containers/Bundle/Application/X/Inborn.app";

/* What the .app carries: `bundle` is the set of `<id>.gguf` files the build put at its root. */
const bundle = new Set<string>();
const sizes = new Map<string, number>();
const copies: string[] = [];
let record: VaultRecord;
let sha: (uri: string) => string;

class FakeFile {
  uri: string;
  constructor(base: string | { uri: string }, name?: string) {
    const b = typeof base === "string" ? base : base.uri;
    this.uri = name ? `${b.replace(/\/$/, "")}/${name}` : b;
  }
  get exists() {
    return sizes.has(this.uri);
  }
  get size() {
    return sizes.get(this.uri) ?? 0;
  }
  async copy(dest: FakeFile) {
    copies.push(dest.uri);
  }
}
vi.mock("expo-file-system", () => ({ File: FakeFile, Paths: { document: { uri: "file:///doc" }, bundle: { uri: APP } } }));
vi.mock("react-native", () => ({ Platform: { OS: "ios" } }));
vi.mock("./playDelivery", () => ({ PlayDelivery: class {} }));
vi.mock("./httpsDelivery", () => ({
  HttpsDelivery: class {
    plan = (model: CatalogModel) => ({ via: "https" as const, origin: "models.inbornapp.com", bytes: model.bytes });
    locate = () => null;
    deliver = async () => {
      throw new Error("no network in this test");
    };
  },
  NoSpaceError: class extends Error {},
  PausedError: class extends Error {},
  DEV_MODEL_HOSTS: [] as string[],
}));
vi.mock("./record", () => ({ readRecord: () => record, writeRecord: (r: VaultRecord) => void (record = r) }));
vi.mock("./paths", () => ({
  bundledModelFile: (id: string) => (bundle.has(id) ? new FakeFile(APP, `${id}.gguf`) : null),
  devFallbackFile: () => new FakeFile("file:///doc/instant.gguf"),
  fileSize: (f: FakeFile) => (f.exists ? f.size : 0),
  modelFile: (name: string) => {
    copies.push(`vault/${name}`);
    return new FakeFile(`file:///vault/${name}`);
  },
  safeDelete: () => undefined,
  vaultDir: () => ({ list: () => [] }),
}));
vi.mock("./device", () => ({ readDevice: () => ({ os: "ios", chip: "a15", ramGB: 6 }), freeDiskBytes: () => 64 * 1024 ** 3 }));
vi.mock("./hash", () => ({ fileGgufHeader: async () => null, fileSha256: async (f: FakeFile) => sha(f.uri) }));
vi.mock("./devFlags", () => ({ DEV_MODELS_BASE_URL: undefined, devBuild: () => false }));
vi.mock("./network", () => ({ networkKind: async () => "wifi" }));
vi.mock("../services/storageFull", () => ({ reportStorageFull: () => undefined }));

const { VaultStore } = await import("./store");

const settled = () => new Promise((r) => setTimeout(r, 0));
const ship = (...models: CatalogModel[]) => {
  for (const m of models) {
    bundle.add(m.id);
    sizes.set(`${APP}/${m.id}.gguf`, m.bytes);
  }
};
/** The turn Chat.tsx plans for a photo on Instant, with `resolveVision()` read from this vault. */
const photoTurn = (vault: InstanceType<typeof VaultStore>, scanned: boolean) =>
  planVisionTurn({ hasImages: true, vaultScanned: scanned, modelSees: true, projectorInstalled: vault.state("vision-qwen35").kind === "ready", projectorAttached: false, onLastUserMessage: true, otherModelSees: true });

beforeEach(() => {
  bundle.clear();
  sizes.clear();
  copies.length = 0;
  record = { version: 1, installs: {}, imports: {}, hf: {}, downloads: {} };
  sha = (uri) => (uri.endsWith("/vision-qwen35.gguf") ? vision.sha256 : instant.sha256);
});

describe("F342 · the projector ships in the app, so a fresh install's first photo needs no download", () => {
  it("reads as installed on the first scan, in place inside the bundle, with nothing copied into the vault", async () => {
    ship(instant, vision);
    const vault = new VaultStore();
    await vault.ready();
    expect(vault.state("vision-qwen35")).toMatchObject({ kind: "ready", via: "bundled", path: `${APP}/vision-qwen35.gguf`, bytes: vision.bytes });
    expect(copies, "no model byte is copied into the data container").toEqual([]);
    expect(vault.storageUsedBytes(), "the bundle is not the vault's storage").toBe(0);
  });

  it("the cold-launch race still waits (F294), and after the scan the projector resolves from the bundle", async () => {
    ship(instant, vision);
    const vault = new VaultStore();
    expect(photoTurn(vault, false)).toEqual({ kind: "wait" });
    await vault.ready();
    expect(photoTurn(vault, true), "projector present: attach, then send; never a download offer").toEqual({ kind: "wait" });
  });

  it("hashes the bundled projector once in the background and keeps the verdict", async () => {
    ship(instant, vision);
    const vault = new VaultStore();
    await vault.ready();
    await settled();
    expect(record.installs["vision-qwen35"]).toMatchObject({ via: "bundled", sha256: vision.sha256, bytes: vision.bytes });
    expect(record.installs["vision-qwen35"]!.verifiedAt).toBeGreaterThan(0);
  });

  it("a bundled projector that is not the catalog's bytes is corrupt, not attached", async () => {
    ship(instant, vision);
    sha = (uri) => (uri.endsWith("/vision-qwen35.gguf") ? "0".repeat(64) : instant.sha256);
    const vault = new VaultStore();
    await vault.ready();
    await settled();
    expect(vault.state("vision-qwen35")).toMatchObject({ kind: "corrupt", reason: "hash-mismatch", via: "bundled" });
  });

  it("the complement: a build without the file is back to the companion download offer", async () => {
    ship(instant);
    const vault = new VaultStore();
    await vault.ready();
    expect(vault.state("vision-qwen35").kind).toBe("not-installed");
    expect(photoTurn(vault, true)).toEqual({ kind: "refuse", offer: "companion" });
  });

  it("Remove cannot delete a bundled projector", async () => {
    ship(instant, vision);
    const vault = new VaultStore();
    await vault.ready();
    await vault.remove("vision-qwen35");
    expect(vault.state("vision-qwen35")).toMatchObject({ kind: "ready", via: "bundled" });
  });
});
