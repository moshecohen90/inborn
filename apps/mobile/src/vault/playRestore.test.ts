import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * OnePlus 11, 12.10: a reinstall from Play pulled Fast, Instant and its projector (1.9 GB) before the app ever ran. Play
 * restores every pack it once delivered to the account; the vault drops what no tap asked for and sweeps Play's record.
 */
const S = { PENDING: 1, DOWNLOADING: 2, TRANSFERRING: 3, COMPLETED: 4, FAILED: 5, CANCELED: 6, WAITING_FOR_WIFI: 7, NOT_INSTALLED: 8, REQUIRES_USER_CONFIRMATION: 9 };
const calls: string[] = [];
const status: Record<string, number> = {};

vi.mock("expo-file-system", () => {
  class F {
    uri: string;
    constructor(base: string, name?: string) {
      this.uri = name ? `${base}/${name}` : base;
    }
    get exists() {
      return false;
    }
  }
  return { File: F, Directory: F, Paths: { document: { uri: "file:///doc" } } };
});
vi.mock("./paths", () => ({
  modelFile: (name: string) => ({ uri: `file:///doc/models/${name}`, exists: false }),
  safeDelete: () => undefined,
  vaultDir: () => ({ uri: "file:///doc/models/" }),
}));
vi.mock("../../modules/asset-packs", () => ({
  AssetPackStatus: S,
  AssetPackErrorCode: {},
  isApkPack: () => false,
  copyApkAsset: async () => 0,
  hasAssetPacks: () => true,
  getPackPath: () => null,
  linkInto: () => null,
  adoptInto: () => null,
  addPackListener: () => ({ remove: () => undefined }),
  fetchPack: async () => null,
  getPackState: async (name: string) => (name in status ? { name, status: status[name], errorCode: 0, bytesDownloaded: 0, totalBytes: 1 } : null),
  cancelPack: (name: string) => void calls.push(`cancel ${name}`),
  removePack: async (name: string) => void calls.push(`remove ${name}`),
  showPackConfirmation: async () => 0,
}));

const { PlayDelivery } = await import("./playDelivery");
const PACKS = ["inborn_model", "inborn_model_vision", "inborn_model_fast", "inborn_model_sharp"];

beforeEach(() => {
  calls.length = 0;
  for (const k of Object.keys(status)) delete status[k];
});

describe("PlayDelivery · packs Play restored without a tap", () => {
  it("cancels a restore in flight, removes a finished one, and leaves the packs a record asked for", async () => {
    status.inborn_model_fast = S.DOWNLOADING;
    status.inborn_model_sharp = S.COMPLETED;
    status.inborn_model = S.COMPLETED;
    status.inborn_model_vision = S.COMPLETED;
    const dropped = await new PlayDelivery(PACKS).dropUnrequested(new Set(["inborn_model", "inborn_model_vision"]), false);
    expect(dropped).toEqual(["inborn_model_fast", "inborn_model_sharp"]);
    expect(calls).toEqual(["cancel inborn_model_fast", "remove inborn_model_fast", "remove inborn_model_sharp"]);
  });

  it("the first boot of an install also forgets every pack Play does not show, so Play's record of this phone is clean", async () => {
    status.inborn_model_fast = S.NOT_INSTALLED;
    const dropped = await new PlayDelivery(PACKS).dropUnrequested(new Set(), true);
    expect(dropped).toEqual([]);
    expect(calls).toEqual(PACKS.map((p) => `remove ${p}`));
  });

  it("after the sweep, a pack that is not there costs nothing", async () => {
    status.inborn_model_fast = S.NOT_INSTALLED;
    await new PlayDelivery(PACKS).dropUnrequested(new Set(), false);
    expect(calls).toEqual([]);
  });
});
