import { beforeEach, describe, expect, it, vi } from "vitest";
import { BUNDLED_MANIFEST, modelParts, type CatalogModel } from "@inborn/core";

/*
 * 6T, vc30 -> vc31 (11.10): Play's own update re-downloaded every on-demand pack still installed, with no app code
 * running. The vault keeps its own hard-linked copy and takes the packs out of Play once that copy verified.
 */
const COMPLETED = 4;
const calls: string[] = [];
const onDisk = new Set<string>();
const PLAY = "/data/user/0/app/files/assetpacks";
const VAULT = "/data/user/0/app/files/models";

vi.mock("expo-file-system", () => {
  class F {
    uri: string;
    constructor(base: string, name?: string) {
      this.uri = name ? `${base.replace(/\/$/, "")}/${name}` : base;
    }
    get exists() {
      return onDisk.has(this.uri.replace(/^file:\/\//, ""));
    }
  }
  return { File: F, Directory: F, Paths: { document: { uri: "file:///doc" } } };
});
vi.mock("./paths", () => ({
  modelFile: (name: string) => ({ uri: `file://${VAULT}/${name}`, exists: onDisk.has(`${VAULT}/${name}`) }),
  safeDelete: (f: { uri: string }) => void (calls.push(`delete ${f.uri.split("/").pop()}`), onDisk.delete(f.uri.replace(/^file:\/\//, ""))),
  vaultDir: () => ({ uri: `file://${VAULT}/` }),
}));
vi.mock("../../modules/asset-packs", () => ({
  AssetPackStatus: { PENDING: 1, DOWNLOADING: 2, TRANSFERRING: 3, COMPLETED, FAILED: 5, CANCELED: 6, WAITING_FOR_WIFI: 7, NOT_INSTALLED: 8, REQUIRES_USER_CONFIRMATION: 9 },
  AssetPackErrorCode: {},
  hasAssetPacks: () => true,
  getPackPath: (pack: string) => (calls.includes(`removed ${pack}`) ? null : `${PLAY}/${pack}/31/31/assets`),
  linkInto: () => null,
  adoptInto: (dir: string, files: Record<string, string>) => {
    calls.push(`adopt ${Object.keys(files).join(",")}`);
    for (const name of Object.keys(files)) onDisk.add(`${dir}/${name}`);
    return dir;
  },
  addPackListener: () => ({ remove: () => undefined }),
  fetchPack: async (name: string) => {
    calls.push(`fetch ${name}`);
    const fast = BUNDLED_MANIFEST.models.flatMap((m) => m.delivery).find((d) => d.kind === "play-asset-pack" && d.pack === name);
    if (fast && fast.kind === "play-asset-pack") onDisk.add(`${PLAY}/${name}/31/31/assets/${fast.file}`);
    return { name, status: COMPLETED, errorCode: 0, bytesDownloaded: 1, totalBytes: 1 };
  },
  getPackState: async () => null,
  cancelPack: () => undefined,
  removePack: async (name: string) => {
    calls.push(`removed ${name}`);
    if (name === "inborn_model_sharp_2") throw new Error("Play said no");
  },
  showPackConfirmation: async () => 0,
}));

const { PlayDelivery } = await import("./playDelivery");
const model = (id: string) => BUNDLED_MANIFEST.models.find((m) => m.id === id) as CatalogModel;

beforeEach(() => {
  calls.length = 0;
  onDisk.clear();
});

describe("PlayDelivery · the vault owns what Play delivered", () => {
  it("delivers into the vault directory, never Play's, and removes nothing before the copy verified", async () => {
    const path = await new PlayDelivery().deliver(model("fast"), () => undefined);
    expect(path).toBe(`file://${VAULT}/${model("fast").file}`);
    expect(path).not.toContain("assetpacks");
    expect(calls.filter((c) => c.startsWith("removed"))).toEqual([]);
  });

  it("takes every pack of the model out of Play once, after verification, and a refusal never fails the install", async () => {
    const sharp = model("sharp");
    const d = new PlayDelivery();
    const path = await d.deliver(sharp, () => undefined);
    expect(modelParts(sharp).every((p) => onDisk.has(`${VAULT}/${p.file}`))).toBe(true);
    await expect(d.release(sharp, path)).resolves.toBeUndefined();
    expect(calls.filter((c) => c.startsWith("removed"))).toEqual(["removed inborn_model_sharp", "removed inborn_model_sharp_2"]);
    expect(d.locate(sharp)).toBe(path);
  });

  it("does not release a model it could not copy out of Play", async () => {
    const d = new PlayDelivery();
    await d.release(model("fast"), `file://${PLAY}/inborn_model_fast/31/31/assets/${model("fast").file}`);
    expect(calls).toEqual([]);
  });

  it("Remove works on a pack Play already forgot, and deletes the vault's copy", async () => {
    const d = new PlayDelivery();
    const fast = model("fast");
    const path = await d.deliver(fast, () => undefined);
    await d.release(fast, path);
    await expect(d.remove(fast)).resolves.toBeUndefined();
    expect(d.locate(fast)).toBeNull();
    expect(calls).toContain(`delete ${fast.file}`);
  });
});
