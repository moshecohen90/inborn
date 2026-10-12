import { beforeEach, describe, expect, it, vi } from "vitest";
import { BUNDLED_MANIFEST, type CatalogModel, type InstallEvent } from "@inborn/core";

/*
 * Instant ships inside the Android install (an install-time pack, app.config.ts): Play reports it with no path, the
 * vault unpacks it once and never asks Play for it. The review of 12.10 found a device Play would not serve with no
 * model at all; this is the route that cannot fail that way.
 */
const instant = BUNDLED_MANIFEST.models.find((m) => m.id === "instant") as CatalogModel;
const fast = BUNDLED_MANIFEST.models.find((m) => m.id === "fast") as CatalogModel;
const VAULT_PATH = `file:///vault/${instant.file}`;

const sizes = new Map<string, number>();
/* Pack names the install brought (APK assets). */
const apk = new Set<string>();
const copied: string[] = [];
const removed: string[] = [];
let copyFails = false;

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
  delete() {
    sizes.delete(this.uri);
  }
}
vi.mock("expo-file-system", () => ({ File: FakeFile, Directory: FakeFile, Paths: { document: { uri: "file:///doc" } } }));
vi.mock("../../modules/asset-packs", () => ({
  AssetPackStatus: { PENDING: 1, DOWNLOADING: 2, TRANSFERRING: 3, COMPLETED: 4, FAILED: 5, CANCELED: 6, WAITING_FOR_WIFI: 7, NOT_INSTALLED: 8, REQUIRES_USER_CONFIRMATION: 9 },
  AssetPackErrorCode: {},
  hasAssetPacks: () => true,
  isApkPack: (name: string) => apk.has(name),
  copyApkAsset: async (asset: string, dest: string) => {
    copied.push(asset);
    if (copyFails) throw new Error("ENOSPC: no space left on device");
    sizes.set(dest, instant.bytes);
    return instant.bytes;
  },
  getPackPath: () => null,
  getPackState: async (name: string) => ({ name, status: apk.has(name) ? 4 : 8, errorCode: 0, bytesDownloaded: 0, totalBytes: 0 }),
  fetchPack: async () => null,
  cancelPack: () => null,
  removePack: async (name: string) => void removed.push(name),
  showPackConfirmation: async () => 0,
  addPackListener: () => ({ remove: () => undefined }),
  adoptInto: () => null,
  linkInto: () => null,
}));
vi.mock("./paths", () => ({
  modelFile: (name: string) => new FakeFile(`file:///vault/${name}`),
  fileSize: (f: FakeFile) => sizes.get(f.uri) ?? 0,
  safeDelete: (f: FakeFile) => void sizes.delete(f.uri),
  vaultDir: () => new FakeFile("file:///vault/"),
}));

const { PlayDelivery } = await import("./playDelivery");

beforeEach(() => {
  sizes.clear();
  apk.clear();
  apk.add("inborn_model");
  copied.length = 0;
  removed.length = 0;
  copyFails = false;
});

describe("PlayDelivery · a pack the install itself brought", () => {
  it("plans as bundled (no store call) while an on-demand pack still plans through Play", () => {
    const d = new PlayDelivery(["inborn_model", "inborn_model_fast"]);
    expect(d.plan(instant)).toMatchObject({ via: "bundled", bytes: instant.bytes });
    expect(d.plan(fast)).toMatchObject({ via: "play" });
  });

  it("is held on the device before any request, so the vault unpacks it without a tap", async () => {
    const d = new PlayDelivery(["inborn_model"]);
    expect(await d.heldOnDevice(instant)).toBe(true);
    expect(await d.heldOnDevice(fast)).toBe(false);
  });

  it("deliver unpacks the asset into the vault once, with progress, and the second call finds the copy", async () => {
    const d = new PlayDelivery(["inborn_model"]);
    const events: InstallEvent[] = [];
    const path = await d.deliver(instant, (e) => events.push(e));
    expect(path).toBe(VAULT_PATH);
    expect(copied).toEqual([instant.file]);
    expect(events.at(-1)).toEqual({ type: "progress", bytes: instant.bytes, total: instant.bytes });
    expect(d.locate(instant)).toBe(VAULT_PATH);
    expect(await d.deliver(instant, () => undefined)).toBe(VAULT_PATH);
    expect(copied).toHaveLength(1);
  });

  it("release and the boot sweep leave the install-time pack where it is", async () => {
    const d = new PlayDelivery(["inborn_model", "inborn_model_fast"]);
    const path = await d.deliver(instant, () => undefined);
    await d.release(instant, path);
    await d.dropUnrequested(new Set(), true);
    expect(removed).not.toContain("inborn_model");
    expect(removed).toContain("inborn_model_fast");
  });

  it("a copy the disk refuses surfaces as the copy's error, with nothing left in the vault", async () => {
    copyFails = true;
    const d = new PlayDelivery(["inborn_model"]);
    await expect(d.deliver(instant, () => undefined)).rejects.toThrow(/ENOSPC/);
    expect(d.locate(instant)).toBeNull();
  });
});
